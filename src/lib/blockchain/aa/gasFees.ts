/**
 * Accurate gas fee calculation for Account Abstraction transactions
 * Estimates real gas costs and converts to USDC for user display
 */

import { formatUnits } from "viem";
import { getPublicClient } from "../client";

/**
 * Chainlink ETH/USD price feed addresses
 */
const ETH_USD_PRICE_FEEDS = {
  sepolia: "0x694AA1769357215DE4FAC081bf1f309aDC325306" as const,
  mainnet: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419" as const,
} as const;

/**
 * Chainlink Price Feed ABI (minimal)
 */
const PRICE_FEED_ABI = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Fetch current ETH price in USD from Chainlink oracle
 * Falls back to CoinGecko API if oracle fails
 */
export async function getETHPriceUSD(): Promise<number> {
  try {
    const publicClient = getPublicClient();
    const network = process.env.NEXT_PUBLIC_NETWORK || "sepolia";
    const priceFeedAddress = ETH_USD_PRICE_FEEDS[network as keyof typeof ETH_USD_PRICE_FEEDS];
    
    if (!priceFeedAddress) {
      throw new Error("Price feed not available for network");
    }
    
    const data = await publicClient.readContract({
      address: priceFeedAddress,
      abi: PRICE_FEED_ABI,
      functionName: "latestRoundData",
    });
    
    // Chainlink returns price with 8 decimals
    const price = Number(data[1]) / 1e8;
    
    console.log(`ETH price from Chainlink: $${price.toFixed(2)}`);
    return price;
  } catch (error) {
    console.warn("Chainlink oracle failed, falling back to CoinGecko:", error);
    
    // Fallback to CoinGecko API
    try {
      const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
      );
      const data = await response.json();
      const price = data.ethereum.usd;
      
      console.log(`ETH price from CoinGecko: $${price.toFixed(2)}`);
      return price;
    } catch (fallbackError) {
      console.error("Both price sources failed:", fallbackError);
      // Return conservative estimate
      return 3000;
    }
  }
}

/**
 * Estimate gas costs for Account Abstraction UserOperation
 * Returns accurate costs in both ETH and USD
 */
export async function estimateAAGasCost(options?: {
  isFirstTransfer?: boolean; // First transfer includes wallet deployment
  gasMultiplier?: number; // Speed multiplier (0.8 = slow, 1.0 = normal, 1.3 = fast)
}): Promise<{
  gasUnits: bigint;
  gasPriceWei: bigint;
  gasCostETH: string;
  gasCostUSD: string;
  alchemyFeeUSD: string;
  totalCostUSD: string;
  breakdown: {
    callGasLimit: bigint;
    verificationGasLimit: bigint;
    preVerificationGas: bigint;
  };
}> {
  const publicClient = getPublicClient();
  const isFirstTransfer = options?.isFirstTransfer ?? false;
  const gasMultiplier = options?.gasMultiplier ?? 1.0;
  
  // Gas estimates based on empirical data from Alchemy
  const callGasLimit = isFirstTransfer ? BigInt(100000) : BigInt(50000); // Actual transfer execution
  const verificationGasLimit = isFirstTransfer ? BigInt(100000) : BigInt(50000); // Signature verification + deployment
  const preVerificationGas = BigInt(50000); // Base UserOp overhead
  
  const totalGasUnits = callGasLimit + verificationGasLimit + preVerificationGas;
  
  // Get current gas price with multiplier
  const feeData = await publicClient.estimateFeesPerGas();
  const baseGasPrice = feeData.maxFeePerGas || BigInt(20000000000); // 20 gwei fallback
  const adjustedGasPrice = BigInt(Math.floor(Number(baseGasPrice) * gasMultiplier));
  
  // Calculate gas cost in ETH
  const gasCostWei = totalGasUnits * adjustedGasPrice;
  const gasCostETH = formatUnits(gasCostWei, 18);
  
  // Get ETH price and convert to USD
  const ethPriceUSD = await getETHPriceUSD();
  const gasCostUSD = parseFloat(gasCostETH) * ethPriceUSD;
  
  // Alchemy bundler fee (approximately $0.01 per UserOp)
  const alchemyFeeUSD = "0.01";
  
  // Total cost to sponsor
  const totalCostUSD = (gasCostUSD + parseFloat(alchemyFeeUSD)).toFixed(6);
  
  console.log("Gas cost estimation:", {
    gasUnits: totalGasUnits.toString(),
    gasPriceGwei: formatUnits(adjustedGasPrice, 9),
    gasCostETH,
    gasCostUSD: gasCostUSD.toFixed(6),
    ethPriceUSD: ethPriceUSD.toFixed(2),
    alchemyFeeUSD,
    totalCostUSD,
    isFirstTransfer,
  });
  
  return {
    gasUnits: totalGasUnits,
    gasPriceWei: adjustedGasPrice,
    gasCostETH,
    gasCostUSD: gasCostUSD.toFixed(6),
    alchemyFeeUSD,
    totalCostUSD,
    breakdown: {
      callGasLimit,
      verificationGasLimit,
      preVerificationGas,
    },
  };
}

/**
 * Calculate total fees to charge user (platform fee + gas fee)
 * Returns breakdown for display in UI
 */
export async function calculateTotalFeesWithGas(
  transferAmountUSD: string,
  options?: {
    isFirstTransfer?: boolean;
    gasMultiplier?: number;
  }
): Promise<{
  recipientAmount: string; // Amount recipient receives
  platformFee: string; // Platform's profit fee (1.5%)
  gasFee: string; // Actual gas cost to be sponsored
  totalFees: string; // Platform fee + gas fee
  totalDeducted: string; // Total withdrawn from user
  breakdown: string; // Human-readable breakdown
}> {
  const amount = parseFloat(transferAmountUSD);
  
  if (isNaN(amount) || amount <= 0) {
    throw new Error("Invalid transfer amount");
  }
  
  // Platform fee (unchanged, your profit)
  const platformFeePercentage = parseFloat(process.env.NEXT_PUBLIC_PLATFORM_FEE_PERCENTAGE || "1.5");
  const platformFee = (amount * platformFeePercentage) / 100;
  
  // Accurate gas fee calculation
  const gasEstimate = await estimateAAGasCost(options);
  const gasFee = parseFloat(gasEstimate.totalCostUSD);
  
  // Total fees
  const totalFees = platformFee + gasFee;
  const totalDeducted = amount + totalFees;
  
  const breakdown = `
Recipient receives: $${amount.toFixed(2)} USDC
Platform fee (${platformFeePercentage}%): $${platformFee.toFixed(2)} USDC
Gas fee (sponsored): $${gasFee.toFixed(2)} USDC
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total withdrawn: $${totalDeducted.toFixed(2)} USDC
  `.trim();
  
  return {
    recipientAmount: amount.toFixed(6),
    platformFee: platformFee.toFixed(6),
    gasFee: gasFee.toFixed(6),
    totalFees: totalFees.toFixed(6),
    totalDeducted: totalDeducted.toFixed(6),
    breakdown,
  };
}

/**
 * Get estimated confirmation time based on gas multiplier
 * Uses Ethereum's current block time (~12 seconds) and bundler batching
 */
async function getEstimatedConfirmationTime(gasMultiplier: number): Promise<string> {
  const publicClient = getPublicClient();
  
  // Get recent blocks to calculate average block time
  const latestBlock = await publicClient.getBlockNumber();
  const currentBlock = await publicClient.getBlock({ blockNumber: latestBlock });
  const previousBlockNumber = latestBlock - BigInt(10);
  const previousBlock = await publicClient.getBlock({ blockNumber: previousBlockNumber });
  
  // Calculate average block time in seconds
  const timeDiff = Number(currentBlock.timestamp - previousBlock.timestamp);
  const blockDiff = Number(latestBlock - previousBlockNumber);
  const avgBlockTime = timeDiff / blockDiff;
  
  // AA bundler batching adds ~1-2 blocks overhead
  const bundlerOverhead = avgBlockTime * 1.5;
  
  // Estimate blocks until inclusion based on gas multiplier
  // Higher gas price = faster inclusion
  let blocksUntilInclusion: number;
  if (gasMultiplier >= 1.6) {
    blocksUntilInclusion = 1; // Next block (instant)
  } else if (gasMultiplier >= 1.3) {
    blocksUntilInclusion = 2; // 1-2 blocks (fast)
  } else if (gasMultiplier >= 1.0) {
    blocksUntilInclusion = 3; // 2-3 blocks (normal)
  } else {
    blocksUntilInclusion = 5; // 4-5 blocks (slow)
  }
  
  const estimatedSeconds = (blocksUntilInclusion * avgBlockTime) + bundlerOverhead;
  
  // Format human-readable time
  if (estimatedSeconds < 60) {
    return `~${Math.round(estimatedSeconds)} seconds`;
  } else {
    const minutes = Math.round(estimatedSeconds / 60);
    return `~${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
}

/**
 * Get dynamic gas speed options with accurate pricing and real-time confirmation estimates
 */
export async function getGasSpeedOptions(
  transferAmountUSD: string,
  isFirstTransfer: boolean = false
): Promise<{
  slow: { multiplier: number; gasFee: string; totalDeducted: string; estimatedTime: string };
  normal: { multiplier: number; gasFee: string; totalDeducted: string; estimatedTime: string };
  fast: { multiplier: number; gasFee: string; totalDeducted: string; estimatedTime: string };
  instant: { multiplier: number; gasFee: string; totalDeducted: string; estimatedTime: string };
}> {
  const speeds = [
    { key: "slow", multiplier: 0.8 },
    { key: "normal", multiplier: 1.0 },
    { key: "fast", multiplier: 1.3 },
    { key: "instant", multiplier: 1.6 },
  ] as const;
  
  const results = {} as {
    slow: { multiplier: number; gasFee: string; totalDeducted: string; estimatedTime: string };
    normal: { multiplier: number; gasFee: string; totalDeducted: string; estimatedTime: string };
    fast: { multiplier: number; gasFee: string; totalDeducted: string; estimatedTime: string };
    instant: { multiplier: number; gasFee: string; totalDeducted: string; estimatedTime: string };
  };
  
  for (const speed of speeds) {
    const fees = await calculateTotalFeesWithGas(transferAmountUSD, {
      isFirstTransfer,
      gasMultiplier: speed.multiplier,
    });
    
    // Get real-time estimated confirmation time
    const estimatedTime = await getEstimatedConfirmationTime(speed.multiplier);
    
    results[speed.key] = {
      multiplier: speed.multiplier,
      gasFee: fees.gasFee,
      totalDeducted: fees.totalDeducted,
      estimatedTime,
    };
  }
  
  return results;
}

/**
 * Validate that user has sufficient balance for transfer + fees
 */
export function validateSufficientBalance(
  userBalanceUSD: string,
  totalDeducted: string
): { sufficient: boolean; shortfall: string } {
  const balance = parseFloat(userBalanceUSD);
  const required = parseFloat(totalDeducted);
  
  if (balance >= required) {
    return { sufficient: true, shortfall: "0" };
  }
  
  const shortfall = required - balance;
  return {
    sufficient: false,
    shortfall: shortfall.toFixed(6),
  };
}
