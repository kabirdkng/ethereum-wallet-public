/**
 * Gas speed-up utilities for replacing pending transactions
 * Allows users to speed up stuck transactions by increasing gas price
 */

import { parseGwei, type WalletClient, type Hash } from "viem";
import { getPublicClient } from "./client";

export interface GasSpeedupOptions {
  /**
   * How much to increase the gas price
   * - 'fast': 20% increase (default)
   * - 'faster': 50% increase
   * - 'instant': 100% increase
   */
  speedLevel?: 'fast' | 'faster' | 'instant';
  
  /**
   * Custom gas price multiplier (overrides speedLevel)
   * e.g., 1.5 for 50% increase
   */
  customMultiplier?: number;
}

const SPEED_MULTIPLIERS = {
  fast: 1.2,     // 20% increase
  faster: 1.5,   // 50% increase
  instant: 2.0,  // 100% increase
} as const;

/**
 * Get the original transaction details from the blockchain
 */
export async function getTransactionDetails(txHash: Hash) {
  const publicClient = getPublicClient();
  
  try {
    const tx = await publicClient.getTransaction({ hash: txHash });
    return tx;
  } catch {
    throw new Error("Failed to fetch transaction details. It may have already been confirmed.");
  }
}

/**
 * Check if a transaction is still pending
 */
export async function isTransactionPending(txHash: Hash): Promise<boolean> {
  const publicClient = getPublicClient();
  
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    return receipt === null; // null means pending
  } catch {
    // If we can't get receipt, check if transaction exists
    try {
      await publicClient.getTransaction({ hash: txHash });
      return true; // Transaction exists but no receipt = pending
    } catch {
      return false; // Transaction doesn't exist
    }
  }
}

/**
 * Calculate new gas price for speed-up transaction
 */
export async function calculateSpeedupGasPrice(
  originalGasPrice: bigint,
  options: GasSpeedupOptions = {}
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  const multiplier = options.customMultiplier ?? SPEED_MULTIPLIERS[options.speedLevel ?? 'fast'];
  
  // Get current network gas prices
  const publicClient = getPublicClient();
  const block = await publicClient.getBlock({ blockTag: 'latest' });
  const baseFee = block.baseFeePerGas ?? parseGwei('1');
  
  // Calculate new max fee with multiplier - MUST be at least 10% higher for replacement
  const minimumIncrease = (originalGasPrice * BigInt(110)) / BigInt(100); // 10% minimum
  const calculatedIncrease = BigInt(Math.floor(Number(originalGasPrice) * multiplier));
  const newMaxFee = calculatedIncrease > minimumIncrease ? calculatedIncrease : minimumIncrease;
  
  // Priority fee should be at least 10% of max fee
  const newPriorityFee = newMaxFee / BigInt(10);
  
  // Ensure we're above minimum and current base fee
  const minMaxFee = baseFee * BigInt(2); // At least 2x base fee
  const finalMaxFee = newMaxFee > minMaxFee ? newMaxFee : minMaxFee;
  
  console.log("Gas price calculation:", {
    original: originalGasPrice.toString(),
    multiplier,
    minimumIncrease: minimumIncrease.toString(),
    calculatedIncrease: calculatedIncrease.toString(),
    finalMaxFee: finalMaxFee.toString(),
    baseFee: baseFee.toString()
  });
  
  return {
    maxFeePerGas: finalMaxFee,
    maxPriorityFeePerGas: newPriorityFee,
  };
}

/**
 * Speed up a pending transaction by sending a replacement with higher gas
 * 
 * NOTE: This creates a NEW transaction with the same nonce but higher gas price.
 * Only ONE of these transactions will be mined (the one with higher gas typically).
 */
export async function speedUpTransaction(
  walletClient: WalletClient,
  originalTxHash: Hash,
  options: GasSpeedupOptions = {}
): Promise<{ 
  newTxHash: Hash; 
  estimatedGasIncrease: string;
  speedLevel: string;
}> {
  // Check if transaction is still pending
  const isPending = await isTransactionPending(originalTxHash);
  if (!isPending) {
    throw new Error("Transaction has already been confirmed or doesn't exist");
  }
  
  // Get original transaction details
  const originalTx = await getTransactionDetails(originalTxHash);
  
  if (!originalTx.to || !originalTx.from) {
    throw new Error("Invalid transaction: missing to/from address");
  }
  
  // Verify the wallet can sign this transaction
  if (!walletClient.account) {
    throw new Error("Wallet client has no account attached");
  }
  
  if (originalTx.from.toLowerCase() !== walletClient.account.address.toLowerCase()) {
    throw new Error("You can only speed up transactions from your own wallet");
  }
  
  // Calculate new gas prices
  const originalGasPrice = originalTx.maxFeePerGas ?? originalTx.gasPrice ?? parseGwei('1');
  const { maxFeePerGas, maxPriorityFeePerGas } = await calculateSpeedupGasPrice(
    originalGasPrice,
    options
  );
  
  const increasePercentage = ((Number(maxFeePerGas - originalGasPrice) / Number(originalGasPrice)) * 100).toFixed(1);
  
  console.log("Speed-up transaction:", {
    originalHash: originalTxHash,
    originalGasPrice: originalGasPrice.toString(),
    newMaxFee: maxFeePerGas.toString(),
    newPriorityFee: maxPriorityFeePerGas.toString(),
    increasePercentage: `${increasePercentage}%`,
  });
  
  // Send replacement transaction with same nonce but higher gas
  const newTxHash = await walletClient.sendTransaction({
    account: walletClient.account,
    to: originalTx.to,
    value: originalTx.value,
    data: originalTx.input,
    nonce: originalTx.nonce,
    maxFeePerGas,
    maxPriorityFeePerGas,
    gas: originalTx.gas,
    chain: walletClient.chain,
  });
  
  console.log("✓ Speed-up transaction broadcast:", newTxHash);
  
  return {
    newTxHash,
    estimatedGasIncrease: `${increasePercentage}%`,
    speedLevel: options.speedLevel ?? 'fast',
  };
}

/**
 * Get estimated cost increase for speeding up a transaction
 */
export async function estimateSpeedupCost(
  txHash: Hash,
  options: GasSpeedupOptions = {}
): Promise<{
  currentGasCostETH: string;
  newGasCostETH: string;
  additionalCostETH: string;
  increasePercentage: string;
}> {
  const tx = await getTransactionDetails(txHash);
  
  const originalGasPrice = tx.maxFeePerGas ?? tx.gasPrice ?? parseGwei('1');
  const { maxFeePerGas } = await calculateSpeedupGasPrice(originalGasPrice, options);
  
  const gasLimit = tx.gas;
  
  const currentCost = originalGasPrice * gasLimit;
  const newCost = maxFeePerGas * gasLimit;
  const additionalCost = newCost - currentCost;
  
  const increasePercentage = ((Number(maxFeePerGas - originalGasPrice) / Number(originalGasPrice)) * 100).toFixed(1);
  
  // Convert to ETH (wei to ether)
  const weiToEth = (wei: bigint) => (Number(wei) / 1e18).toFixed(8);
  
  return {
    currentGasCostETH: weiToEth(currentCost),
    newGasCostETH: weiToEth(newCost),
    additionalCostETH: weiToEth(additionalCost),
    increasePercentage: `${increasePercentage}%`,
  };
}
