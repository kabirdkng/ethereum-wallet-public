/**
 * Etherscan API integration for fetching transaction history
 * More efficient than eth_getLogs for large block ranges
 */

import { getCurrentNetwork } from "@/config/blockchain";
import { formatUnits } from "viem";

/**
 * Rate limiter for Etherscan API (5 calls per second max)
 */
class RateLimiter {
  private queue: Array<() => void> = [];
  private processing = false;
  private lastCallTime = 0;
  private readonly minInterval = 210; // 210ms between calls = ~4.7 calls/sec (safely under 5/sec limit)

  async throttle<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastCall = now - this.lastCallTime;
      
      if (timeSinceLastCall < this.minInterval) {
        await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLastCall));
      }
      
      const task = this.queue.shift();
      if (task) {
        this.lastCallTime = Date.now();
        await task();
      }
    }
    
    this.processing = false;
  }
}

const etherscanRateLimiter = new RateLimiter();

export interface EtherscanTransaction {
  txHash: string;
  blockNumber: bigint;
  timestamp: number;
  type: "SEND" | "RECEIVE";
  token: "USDC" | "USDT" | "ETH";
  amount: string;
  fromAddress: string;
  toAddress: string;
  status: "CONFIRMED" | "FAILED";
}

interface EtherscanERC20Transfer {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  contractAddress: string;
}

/* Currently unused - only fetching USDC
interface EtherscanNormalTx {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  isError: string;
}
*/

/**
 * Get Etherscan API base URL based on network
 * V2 uses chainid parameter instead of different base URLs
 */
function getEtherscanApiUrl(): string {
  // V2 uses unified endpoint with chainid parameter
  return "https://api.etherscan.io/v2/api";
}

/**
 * Get chain ID for Etherscan V2 API
 */
function getChainId(): string {
  const network = getCurrentNetwork();
  return network === "mainnet" ? "1" : "11155111"; // 1 for mainnet, 11155111 for Sepolia
}

/**
 * Get Etherscan API key from environment
 * Checks both client and server environment variables
 */
function getEtherscanApiKey(): string | undefined {
  // Check server-side env first (more secure)
  if (typeof process !== 'undefined' && process.env.ETHERSCAN_API_KEY) {
    return process.env.ETHERSCAN_API_KEY;
  }
  // Fall back to client-side env
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY) {
    return process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY;
  }
  console.warn("No Etherscan API key found. API requests may be rate-limited.");
  return undefined;
}

/**
 * Fetch ERC20 token transfers from Etherscan
 */
async function fetchERC20Transfers(
  address: string,
  contractAddress: string,
  tokenSymbol: "USDC" | "USDT"
): Promise<EtherscanTransaction[]> {
  return etherscanRateLimiter.throttle(async () => {
    try {
      const apiKey = getEtherscanApiKey();
      const baseUrl = getEtherscanApiUrl();
      const chainId = getChainId();
      
      // V2 API format with chainid parameter
      const url = new URL(baseUrl);
      url.searchParams.append("chainid", chainId);
      url.searchParams.append("module", "account");
      url.searchParams.append("action", "tokentx");
      url.searchParams.append("contractaddress", contractAddress);
      url.searchParams.append("address", address);
      url.searchParams.append("page", "1");
      url.searchParams.append("offset", "500"); // Fetch last 500 transactions
      url.searchParams.append("sort", "desc");
      if (apiKey) {
        url.searchParams.append("apikey", apiKey);
      }

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.status !== "1") {
        if (data.message === "No transactions found") {
          return [];
        }
        console.error(`Etherscan API error for ${tokenSymbol}:`, data.message, data.result);
        return [];
      }

      const transfers: EtherscanERC20Transfer[] = data.result;
      
      return transfers.map((tx) => {
        const isSend = tx.from.toLowerCase() === address.toLowerCase();
        const decimals = parseInt(tx.tokenDecimal);
        
        return {
          txHash: tx.hash,
          blockNumber: BigInt(tx.blockNumber),
          timestamp: parseInt(tx.timeStamp),
          type: isSend ? "SEND" : "RECEIVE",
          token: tokenSymbol,
          amount: formatUnits(BigInt(tx.value), decimals),
          fromAddress: tx.from,
          toAddress: tx.to,
          status: "CONFIRMED" as const,
        };
      });
    } catch (error) {
      console.error(`Error fetching ${tokenSymbol} transfers from Etherscan:`, error);
      return [];
    }
  });
}

/* Currently unused - only fetching USDC to stay under API rate limits
/**
 * Fetch normal ETH transactions from Etherscan
 *
async function fetchETHTransactions(address: string): Promise<EtherscanTransaction[]> {
  try {
    const apiKey = getEtherscanApiKey();
    const baseUrl = getEtherscanApiUrl();
    const chainId = getChainId();
    
    // V2 API format with chainid parameter
    const url = new URL(baseUrl);
    url.searchParams.append("chainid", chainId);
    url.searchParams.append("module", "account");
    url.searchParams.append("action", "txlist");
    url.searchParams.append("address", address);
    url.searchParams.append("page", "1");
    url.searchParams.append("offset", "100"); // Fetch last 100 transactions
    url.searchParams.append("sort", "desc");
    if (apiKey) {
      url.searchParams.append("apikey", apiKey);
    }

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status !== "1") {
      if (data.message === "No transactions found") {
        return [];
      }
      console.error("Etherscan API error for ETH:", data.message, data.result);
      return [];
    }

    const transactions: EtherscanNormalTx[] = data.result;
    
    // Filter only transactions with value > 0 (actual ETH transfers)
    const ethTransfers = transactions.filter((tx) => BigInt(tx.value) > BigInt(0));

    return ethTransfers.map((tx) => {
      const isSend = tx.from.toLowerCase() === address.toLowerCase();
      
      return {
        txHash: tx.hash,
        blockNumber: BigInt(tx.blockNumber),
        timestamp: parseInt(tx.timeStamp),
        type: isSend ? "SEND" : "RECEIVE",
        token: "ETH" as const,
        amount: formatUnits(BigInt(tx.value), 18),
        fromAddress: tx.from,
        toAddress: tx.to,
        status: tx.isError === "0" ? "CONFIRMED" : "FAILED",
      };
    });
  } catch (error) {
    console.error("Error fetching ETH transactions from Etherscan:", error);
    return [];
  }
}
*/

/**
 * Fetch complete transaction history (USDC only) using Etherscan API
 * This is more efficient than eth_getLogs and works with free tier RPC providers
 * Currently only fetching USDC to stay under API rate limits (5 calls/sec)
 */
export async function getTransactionHistoryFromEtherscan(
  address: string,
  usdcAddress: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _usdtAddress: string // Currently unused - only fetching USDC
): Promise<EtherscanTransaction[]> {
  try {
    // Only fetch USDC transactions to reduce API calls and stay under rate limit
    const usdcTxs = await fetchERC20Transfers(address, usdcAddress, "USDC");

    // Sort by timestamp (newest first)
    usdcTxs.sort((a, b) => b.timestamp - a.timestamp);

    return usdcTxs;
  } catch (error) {
    console.error("Error fetching transaction history from Etherscan:", error);
    return [];
  }
}
