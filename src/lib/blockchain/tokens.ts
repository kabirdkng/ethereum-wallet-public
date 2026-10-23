/**
 * Token utilities for ERC20 operations (USDC, USDT)
 * Handles balance fetching and formatting
 */

import { formatUnits, parseUnits, formatEther } from "viem";
import { getPublicClient } from "./client";
import { ERC20_ABI, getUSDCAddress, getUSDTAddress } from "@/config/blockchain";
import { getPlatformFeePercentage } from "@/config/env";
import { batchTransferWithFee, isMulticallAvailable } from "./multicall";

/**
 * Calculate platform fee for a given amount
 * Platform fee is added as a surcharge (recipient gets full amount entered by user)
 * @param amount - Amount in token units (e.g., "100.50") - this is what recipient will receive
 * @returns Object with fee amount, recipient amount, and total deducted from sender
 * @deprecated Use calculateTotalFeesWithGas from aa/gasFees.ts for AA transactions (includes gas fees)
 */
export function calculatePlatformFee(amount: string): { 
  feeAmount: string; 
  recipientAmount: string; 
  totalDeducted: string;
  feePercentage: number;
} {
  const feePercentage = getPlatformFeePercentage();
  const amountNum = parseFloat(amount);
  
  if (isNaN(amountNum) || amountNum <= 0) {
    return { 
      feeAmount: "0", 
      recipientAmount: amount, 
      totalDeducted: amount,
      feePercentage 
    };
  }
  
  // Fee is calculated on the recipient amount and added as surcharge
  const feeAmount = (amountNum * feePercentage) / 100;
  const recipientAmount = amountNum; // Recipient gets the full amount user enters
  const totalDeducted = amountNum + feeAmount; // Total withdrawn from sender's wallet
  
  return {
    feeAmount: feeAmount.toFixed(6),
    recipientAmount: recipientAmount.toFixed(6),
    totalDeducted: totalDeducted.toFixed(6),
    feePercentage
  };
}

/**
 * Fetch ETH balance for a given address
 * @param address - Ethereum address to check balance for
 * @returns Balance as a formatted string in ETH (e.g., "0.5")
 */
export async function getETHBalance(address: `0x${string}`): Promise<string> {
  try {
    const publicClient = getPublicClient();
    const balance = await publicClient.getBalance({ address });
    
    // ETH has 18 decimals
    return formatUnits(balance, 18);
  } catch (error) {
    console.error("Error fetching ETH balance:", error);
    return "0";
  }
}

/**
 * Fetch USDC balance for a given address
 * @param address - Ethereum address to check balance for
 * @returns Balance as a formatted string (e.g., "100.50")
 */
export async function getUSDCBalance(address: `0x${string}`): Promise<string> {
  try {
    const publicClient = getPublicClient();
    const usdcAddress = getUSDCAddress();

    const balance = await publicClient.readContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address],
    });

    // USDC has 6 decimals
    return formatUnits(balance as bigint, 6);
  } catch (error) {
    console.error("Error fetching USDC balance:", error);
    return "0";
  }
}

/**
 * Fetch USDT balance for a given address
 * @param address - Ethereum address to check balance for
 * @returns Balance as a formatted string (e.g., "100.50")
 */
export async function getUSDTBalance(address: `0x${string}`): Promise<string> {
  try {
    const publicClient = getPublicClient();
    const usdtAddress = getUSDTAddress();

    const balance = await publicClient.readContract({
      address: usdtAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address],
    });

    // USDT has 6 decimals
    return formatUnits(balance as bigint, 6);
  } catch (error) {
    console.error("Error fetching USDT balance:", error);
    return "0";
  }
}

/**
 * Format balance for display with specified decimal places
 * @param balance - Raw balance string
 * @param decimals - Number of decimal places to show (default: 6 for USDC/USDT precision)
 * @returns Formatted balance string
 */
export function formatBalance(balance: string, decimals: number = 6): string {
  const num = parseFloat(balance);
  if (isNaN(num)) return "0.000000";
  return num.toFixed(decimals);
}

/**
 * Estimate gas cost for a USDC transfer
 * @param batched - Whether the transfer will be batched (uses Multicall3)
 * @returns Estimated gas cost in ETH
 */
export async function estimateUSDCTransferGas(batched: boolean = false): Promise<string> {
  try {
    const publicClient = getPublicClient();
    
    // Get current gas price
    const gasPrice = await publicClient.getGasPrice();
    
    // Gas estimates:
    // - Single ERC20 transfer: ~65,000 gas
    // - Batched transfer (2 transfers via Multicall3): ~110,000 gas
    // - Sequential (2 separate transfers): ~130,000 gas (65k × 2)
    const estimatedGas = batched ? BigInt(110000) : BigInt(65000);
    
    const gasCost = gasPrice * estimatedGas;
    return formatUnits(gasCost, 18);
  } catch (error) {
    console.error("Error estimating gas:", error);
    return batched ? "0.0015" : "0.001"; // Fallback estimates
  }
}

/**
 * Get detailed gas cost breakdown for a transfer
 * @param hasPlatformFee - Whether the transfer includes a platform fee
 * @returns Object with gas estimates and formatted strings
 */
export async function getGasCostBreakdown(hasPlatformFee: boolean): Promise<{
  gasCostETH: string;
  gasEstimate: string;
  batched: boolean;
}> {
  try {
    const publicClient = getPublicClient();
    const chainId = await publicClient.getChainId();
    const canBatch = hasPlatformFee && (await import("./multicall")).isMulticallAvailable(chainId);
    
    const gasCostETH = await estimateUSDCTransferGas(canBatch);
    const gasEstimate = canBatch ? "~110,000" : "~65,000";
    
    return {
      gasCostETH,
      gasEstimate,
      batched: canBatch,
    };
  } catch (error) {
    console.error("Error getting gas breakdown:", error);
    return {
      gasCostETH: hasPlatformFee ? "0.0015" : "0.001",
      gasEstimate: hasPlatformFee ? "~110,000" : "~65,000",
      batched: false,
    };
  }
}

/**
 * Get actual gas used from a transaction receipt
 * @param txHash - Transaction hash
 * @returns Object with gas used and cost in ETH
 */
export async function getActualGasUsed(txHash: `0x${string}`): Promise<{
  gasUsed: bigint;
  gasCostETH: string;
  gasPrice: bigint;
}> {
  try {
    const publicClient = (await import("./client")).getPublicClient();
    
    console.log("Fetching transaction receipt for:", txHash);
    const receipt = await publicClient.waitForTransactionReceipt({ 
      hash: txHash,
      confirmations: 1 
    });
    
    console.log("Transaction receipt:", {
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      status: receipt.status
    });
    
    const gasUsed = receipt.gasUsed;
    const gasPrice = receipt.effectiveGasPrice;
    const gasCostWei = gasUsed * gasPrice;
    const gasCostETH = formatEther(gasCostWei);
    
    return {
      gasUsed,
      gasCostETH,
      gasPrice,
    };
  } catch (error) {
    console.error("Error fetching gas used:", error);
    // Return zeros on error
    return {
      gasUsed: BigInt(0),
      gasCostETH: "0",
      gasPrice: BigInt(0),
    };
  }
}

/**
 * Calculate estimated number of USDC transfers possible with current ETH balance
 * @param ethBalance - Current ETH balance in ETH (e.g., "0.5")
 * @param batched - Whether transfers will be batched (default: false)
 * @returns Estimated number of transfers
 */
export async function estimateTransferCount(
  ethBalance: string, 
  batched: boolean = false
): Promise<number> {
  try {
    const gasCostPerTransfer = await estimateUSDCTransferGas(batched);
    const ethBalanceNum = parseFloat(ethBalance);
    const gasCostNum = parseFloat(gasCostPerTransfer);
    
    if (ethBalanceNum === 0 || gasCostNum === 0) return 0;
    
    return Math.floor(ethBalanceNum / gasCostNum);
  } catch (error) {
    console.error("Error calculating transfer count:", error);
    return 0;
  }
}

/**
 * Send USDC to a recipient (with optional platform fee deduction)
 * Uses batched transfer (Multicall3) for gas optimization when fee is applicable
 * Falls back to sequential transfers if batching fails
 * @param walletClient - Configured wallet client with account
 * @param to - Recipient address
 * @param amount - Amount in USDC (e.g., "100.50")
 * @param platformFeeRecipient - Optional platform fee recipient address
 * @returns Object with transaction hash and fee details
 */
export async function sendUSDC(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walletClient: any, // WalletClient from viem - will be properly typed in wallet utilities
  to: `0x${string}`,
  amount: string,
  platformFeeRecipient?: `0x${string}` | null,
  onProgress?: (status: 'checking' | 'approving' | 'approved' | 'transferring') => void,
  gasMultiplier: number = 1.0 // 0.8 for slow, 1.0 for normal, 1.3 for fast, 1.6 for instant
): Promise<{
  txHash: `0x${string}`;
  feeAmount: string;
  recipientAmount: string;
  feeTxHash?: `0x${string}`;
  batched: boolean; // Indicates if transfers were batched
}> {
  try {
    const usdcAddress = getUSDCAddress();
    
    console.log("sendUSDC called with:", {
      to,
      amount,
      platformFeeRecipient,
      usdcAddress
    });
    
    // Calculate platform fee if recipient is provided
    const feeCalc = platformFeeRecipient 
      ? calculatePlatformFee(amount)
      : { feeAmount: "0", recipientAmount: amount, totalDeducted: amount, feePercentage: 0 };
    
    console.log("Fee calculation:", feeCalc);
    
    // Convert amounts to USDC units (6 decimals)
    const recipientAmountInUnits = parseUnits(feeCalc.recipientAmount, 6);
    const feeAmountInUnits = platformFeeRecipient && parseFloat(feeCalc.feeAmount) > 0
      ? parseUnits(feeCalc.feeAmount, 6)
      : BigInt(0);
    const totalAmountInUnits = parseUnits(feeCalc.totalDeducted, 6);
    
    console.log("Amounts in units:", {
      recipientAmountInUnits: recipientAmountInUnits.toString(),
      feeAmountInUnits: feeAmountInUnits.toString(),
      totalAmountInUnits: totalAmountInUnits.toString()
    });
    
    // Check user has sufficient USDC balance for total amount (recipient + fee)
    const publicClient = (await import("./client")).getPublicClient();
    const userBalance = await publicClient.readContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [walletClient.account.address],
    }) as bigint;
    
    console.log("Balance check:", {
      userBalance: userBalance.toString(),
      required: totalAmountInUnits.toString(),
      sufficient: userBalance >= totalAmountInUnits
    });
    
    if (userBalance < totalAmountInUnits) {
      const balanceInUSDC = formatUnits(userBalance, 6);
      const requiredInUSDC = formatUnits(totalAmountInUnits, 6);
      throw new Error(
        `Insufficient USDC balance. You have ${balanceInUSDC} USDC but need ${requiredInUSDC} USDC (${feeCalc.recipientAmount} to recipient + ${feeCalc.feeAmount} platform fee)`
      );
    }
    
    // If we have a platform fee, try to batch the transfers for gas optimization
    if (platformFeeRecipient && feeAmountInUnits > BigInt(0)) {
      // Check if multicall is available on this chain
      const chainId = await walletClient.getChainId();
      const canBatch = isMulticallAvailable(chainId);
      
      console.log("Platform fee detected:", {
        chainId,
        canBatch,
        platformFeeRecipient
      });
      
      if (canBatch) {
        try {
          console.log("Attempting batched transfer via Multicall3...");
          
          // Start approval process but don't wait for it
          const approvalPromise = batchTransferWithFee(
            walletClient,
            usdcAddress,
            to,
            recipientAmountInUnits,
            platformFeeRecipient,
            feeAmountInUnits,
            onProgress,
            gasMultiplier // Pass gas multiplier
          );
          
          // Wait for the transaction hash (approval might still be pending)
          const hash = await approvalPromise;
          
          console.log("✓ Batched transfer successful:", hash);
          return {
            txHash: hash,
            feeAmount: feeCalc.feeAmount,
            recipientAmount: feeCalc.recipientAmount,
            batched: true,
          };
        } catch (batchError) {
          console.warn("✗ Batched transfer failed, falling back to sequential transfers:", batchError);
          // Notify about fallback - sequential transfers will take longer
          onProgress?.('transferring'); // Update progress to show we're still transferring
          // Fall through to sequential transfers
        }
      } else {
        console.log("Multicall not available on this chain, using sequential transfers");
      }
    }
    
    // Sequential transfers (original behavior) - fallback or when no fee
    console.log("Executing sequential transfers...");
    console.log("Step 1: Sending recipient amount:", {
      to,
      amount: feeCalc.recipientAmount,
      amountInUnits: recipientAmountInUnits.toString()
    });
    
    // Notify that we're starting the transfer (or continuing after batch failure)
    onProgress?.('transferring');
    
    const feeData = await publicClient.estimateFeesPerGas();
    const maxFeePerGas = feeData.maxFeePerGas 
      ? BigInt(Math.floor(Number(feeData.maxFeePerGas) * gasMultiplier))
      : undefined;
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas
      ? BigInt(Math.floor(Number(feeData.maxPriorityFeePerGas) * gasMultiplier))
      : undefined;
    
    // Send main transfer to recipient
    const hash = await walletClient.writeContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [to, recipientAmountInUnits],
      ...(maxFeePerGas && { maxFeePerGas }),
      ...(maxPriorityFeePerGas && { maxPriorityFeePerGas }),
    });
    
    console.log("✓ Main transfer successful:", hash);
    
    let feeTxHash: `0x${string}` | undefined;
    
    // Send platform fee transfer if applicable
    if (platformFeeRecipient && feeAmountInUnits > BigInt(0)) {
      try {
        console.log("Step 2: Sending platform fee:", {
          to: platformFeeRecipient,
          amount: feeCalc.feeAmount,
          amountInUnits: feeAmountInUnits.toString()
        });
        
        feeTxHash = await walletClient.writeContract({
          address: usdcAddress,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [platformFeeRecipient, feeAmountInUnits],
          ...(maxFeePerGas && { maxFeePerGas }),
          ...(maxPriorityFeePerGas && { maxPriorityFeePerGas }),
        });
        
        console.log("✓ Platform fee transfer successful:", feeTxHash);
      } catch (feeError) {
        console.error("✗ Platform fee transfer failed:", feeError);
        // Continue even if fee transfer fails - main transfer succeeded
      }
    }
    
    return {
      txHash: hash,
      feeAmount: feeCalc.feeAmount,
      recipientAmount: feeCalc.recipientAmount,
      feeTxHash,
      batched: false,
    };
  } catch (error) {
    console.error("Error sending USDC:", error);
    throw error;
  }
}

export interface BlockchainTransaction {
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

/**
 * Fetch complete transaction history (USDC + USDT + ETH) for a wallet address
 * Uses Etherscan API instead of eth_getLogs to avoid block range limitations
 * @param address - User's wallet address
 * @returns Array of all blockchain transactions sorted by timestamp (newest first)
 */
export async function getTransactionHistory(
  address: `0x${string}`
): Promise<BlockchainTransaction[]> {
  try {
    // Import Etherscan utility dynamically to avoid client-side issues
    const { getTransactionHistoryFromEtherscan } = await import("./etherscan");
    const { getUSDCAddress, getUSDTAddress } = await import("@/config/blockchain");
    
    const usdcAddress = getUSDCAddress();
    const usdtAddress = getUSDTAddress();

    const transactions = await getTransactionHistoryFromEtherscan(
      address,
      usdcAddress,
      usdtAddress
    );

    return transactions;
  } catch (error) {
    console.error("Error fetching transaction history:", error);
    return [];
  }
}
