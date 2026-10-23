/**
 * Account Abstraction transfer utilities
 * High-level functions for sending USDC/USDT via EIP-4337 smart wallets
 */

import { parseUnits, type Address, type WalletClient } from "viem";
import { getUSDCBalance } from "../tokens";
import { getUSDCAddress } from "@/config/blockchain";
import { buildERC20TransferUserOp, waitForUserOperation } from "./userOp";
import { sendUserOperation } from "./bundler";
import { getSmartWalletAddress } from "./account";
import { GAS_MULTIPLIERS, type GasSpeed } from "@/components/send-money/gas-speed-selector";
import { buildRecipientAndFeeTransferUserOp, getGasEstimateFromUserOp, type GasEstimate } from "./multicall";

export interface AATransferResult {
  userOpHash: string;
  txHash: string;
  platformFee: string; // Platform fee in USDC
  gasFee: string; // Gas fee in USDC (sponsored, but shown for transparency)
  recipientAmount: string;
  totalFees: string; // Platform fee + gas fee
  smartWalletAddress: string;
  batched: boolean;
  platformFeeUserOpHash?: string;
  platformFeeTxHash?: string;
  gasEstimate?: GasEstimate;
}

/**
 * Send USDC via Account Abstraction (gas-sponsored)
 * Automatically batches transfers when platform fee is applicable
 * 
 * @param walletClient - EOA wallet client (used to sign UserOperations)
 * @param recipientAddress - Recipient's wallet address
 * @param amount - Amount in USDC (e.g., "100.50")
 * @param platformFeeRecipient - Optional platform fee recipient address
 * @param platformFeeAmount - Platform fee amount in USDC (if applicable)
 * @param onProgress - Callback for status updates
 * @param gasSpeed - Gas speed option (slow, normal, fast, instant)
 * @returns Transaction details including UserOp hash and transaction hash
 */
export async function sendUSDCWithAA(
  walletClient: WalletClient,
  recipientAddress: Address,
  amount: string,
  platformFeeRecipient?: Address | null,
  platformFeeAmount?: string,
  onProgress?: (status: 'checking' | 'building' | 'signing' | 'submitting' | 'confirming') => void,
  gasSpeed: GasSpeed = 'normal'
): Promise<AATransferResult> {
  try {
    const eoaAddress = walletClient.account?.address;
    if (!eoaAddress) {
      throw new Error("Wallet client must have an account");
    }

    onProgress?.('checking');

    const usdcAddress = getUSDCAddress();
    // Calculate smart wallet address directly (client-safe)
    const smartWalletAddress = await getSmartWalletAddress(eoaAddress);
    console.log("Smart wallet resolved for transfer:", smartWalletAddress);

    console.log("sendUSDCWithAA called:", {
      recipientAddress,
      amount,
      platformFeeRecipient,
      platformFeeAmount,
      gasSpeed,
    });    // Convert amounts to USDC units (6 decimals)
    const recipientAmountInUnits = parseUnits(amount, 6);
    const feeAmountInUnits = platformFeeRecipient && platformFeeAmount
      ? parseUnits(platformFeeAmount, 6)
      : BigInt(0);
    const totalAmountInUnits = recipientAmountInUnits + feeAmountInUnits;

    // Check smart wallet has sufficient USDC balance
    // Use a small delay to ensure RPC node has latest state after any transfers
    console.log("⏱️  Waiting for RPC state sync (1s)...");
    await new Promise(resolve => setTimeout(resolve, 1000));
    const balance = await getUSDCBalance(smartWalletAddress);
    const balanceInUnits = parseUnits(balance, 6);

    console.log("💰 Balance check (after state sync):", {
      smartWalletAddress,
      smartWalletBalance: balance,
      balanceInUnits: balanceInUnits.toString(),
      requiredTotal: (Number(totalAmountInUnits) / 1e6).toFixed(6),
      requiredTotalInUnits: totalAmountInUnits.toString(),
      sufficient: balanceInUnits >= totalAmountInUnits,
      surplus: balanceInUnits >= totalAmountInUnits 
        ? `+${((Number(balanceInUnits - totalAmountInUnits)) / 1e6).toFixed(6)} USDC`
        : `-${((Number(totalAmountInUnits - balanceInUnits)) / 1e6).toFixed(6)} USDC`,
    });

    if (balanceInUnits < totalAmountInUnits) {
      // Try one more time after a longer delay (RPC nodes can be slow)
      console.warn("Balance check failed, retrying after delay...");
      await new Promise(resolve => setTimeout(resolve, 3000));
      const retryBalance = await getUSDCBalance(smartWalletAddress);
      const retryBalanceInUnits = parseUnits(retryBalance, 6);
      
      console.log("Balance check (retry):", {
        smartWalletBalance: retryBalance,
        requiredTotal: (Number(totalAmountInUnits) / 1e6).toFixed(6),
        sufficient: retryBalanceInUnits >= totalAmountInUnits,
      });
      
      if (retryBalanceInUnits < totalAmountInUnits) {
        throw new Error(
          `Insufficient USDC balance in smart wallet. ` +
          `Have: ${retryBalance} USDC, Need: ${(Number(totalAmountInUnits) / 1e6).toFixed(6)} USDC, ` +
          `Shortfall: ${(Number(totalAmountInUnits - retryBalanceInUnits) / 1e6).toFixed(6)} USDC. ` +
          `Smart wallet: ${smartWalletAddress}. ` +
          `Make sure USDC is transferred to your smart wallet address.`
        );
      }
      
      console.log("✓ Balance sufficient after retry");
    }

    onProgress?.('building');

    // Get gas multiplier from speed selection
    const gasMultiplier = GAS_MULTIPLIERS[gasSpeed];

    let userOp;
    let batched = false;

    // ALWAYS use batched transfers when platform fee is present (all transactions have fees)
    if (platformFeeRecipient && feeAmountInUnits > BigInt(0)) {
      console.log("🔄 Building BATCHED UserOperation for recipient + platform fee");
      
      // Build batched UserOp using Multicall3 (calls execute in smart wallet's context)
      userOp = await buildRecipientAndFeeTransferUserOp(
        walletClient,
        usdcAddress,
        recipientAddress,
        recipientAmountInUnits,
        platformFeeRecipient,
        feeAmountInUnits,
        gasMultiplier
      );
      
      batched = true;
      
      console.log("✅ Batched UserOperation built:", {
        transfers: 2,
        recipientAmount: (Number(recipientAmountInUnits) / 1e6).toFixed(6),
        feeAmount: (Number(feeAmountInUnits) / 1e6).toFixed(6),
        totalAmount: (Number(totalAmountInUnits) / 1e6).toFixed(6),
      });
    } else {
      // Fallback: single transfer (no platform fee - rare case)
      console.log("Building single UserOperation for recipient transfer");
      userOp = await buildERC20TransferUserOp(
        walletClient,
        usdcAddress,
        recipientAddress,
        recipientAmountInUnits,
        gasMultiplier
      );
    }

    onProgress?.('signing');
    // Signing is done inside buildERC20TransferUserOp or buildRecipientAndFeeTransferUserOp

    // Extract gas estimate from UserOp (Alchemy's optimized values)
    const gasEstimate = getGasEstimateFromUserOp(userOp);
    
    console.log("💰 Gas estimate (sponsored by Alchemy):", {
      totalGasLimit: gasEstimate.totalGasLimit.toString(),
      estimatedCostEth: gasEstimate.estimatedCostEth,
      source: gasEstimate.source,
    });

    // Final balance verification before submission
    console.log("🔍 Final balance check before submission...");
    const finalBalance = await getUSDCBalance(smartWalletAddress);
    const finalBalanceInUnits = parseUnits(finalBalance, 6);
    console.log("💰 Final balance:", {
      smartWalletAddress,
      balance: finalBalance,
      balanceInUnits: finalBalanceInUnits.toString(),
      required: (Number(totalAmountInUnits) / 1e6).toFixed(6),
      requiredInUnits: totalAmountInUnits.toString(),
      sufficient: finalBalanceInUnits >= totalAmountInUnits,
    });
    
    if (finalBalanceInUnits < totalAmountInUnits) {
      throw new Error(
        `❌ Balance check failed right before submission! ` +
        `Have: ${finalBalance} USDC, Need: ${(Number(totalAmountInUnits) / 1e6).toFixed(6)} USDC. ` +
        `Something consumed the balance between checks.`
      );
    }

    onProgress?.('submitting');

    // Submit UserOperation to bundler (with walletClient for retry support)
    const userOpHash = await sendUserOperation(userOp, walletClient);

    console.log(`${batched ? 'Batched' : 'Single'} UserOperation submitted to bundler:`, {
      userOpHash,
      sender: userOp.sender,
      batched,
      transfers: batched ? 2 : 1,
    });

    onProgress?.('confirming');

    // Wait for UserOperation to be included in a block
    const txHash = await waitForUserOperation(userOpHash);

    console.log(`✅ ${batched ? 'Batched' : 'Single'} UserOperation confirmed on-chain:`, {
      userOpHash,
      txHash,
      batched,
    });

    return {
      userOpHash,
      txHash,
      platformFee: platformFeeAmount || "0",
      gasFee: gasEstimate ? (Number(gasEstimate.estimatedCostWei) / 1e18 * 3000 / 1e6).toFixed(6) : "0",
      recipientAmount: amount,
      totalFees: platformFeeAmount 
        ? (parseFloat(platformFeeAmount) + (gasEstimate ? (Number(gasEstimate.estimatedCostWei) / 1e18 * 3000 / 1e6) : 0)).toFixed(6)
        : "0",
      smartWalletAddress,
      batched,
      platformFeeUserOpHash: batched ? userOpHash : undefined,
      platformFeeTxHash: batched ? txHash : undefined,
      gasEstimate,
    };
  } catch (error) {
    console.error("Error in sendUSDCWithAA:", error);
    throw error;
  }
}

/**
 * Send USDT via Account Abstraction (same as USDC but different token)
 */
export async function sendUSDTWithAA(
  walletClient: WalletClient,
  recipientAddress: Address,
  amount: string,
  platformFeeRecipient?: Address | null,
  platformFeeAmount?: string,
  onProgress?: (status: 'checking' | 'building' | 'signing' | 'submitting' | 'confirming') => void,
  gasSpeed: GasSpeed = 'normal'
): Promise<AATransferResult> {
  // Same implementation as USDC, just replace token address
  // For now, forward to USDC implementation (can be customized later)
  return sendUSDCWithAA(
    walletClient,
    recipientAddress,
    amount,
    platformFeeRecipient,
    platformFeeAmount,
    onProgress,
    gasSpeed
  );
}

/**
 * Check if user should use AA (has smart wallet and AA is enabled)
 */
export async function shouldUseAA(eoaAddress: Address): Promise<{
  useAA: boolean;
  reason: string;
}> {
  const { isAAEnabled } = await import("./contracts");

  if (!isAAEnabled()) {
    return {
      useAA: false,
      reason: "AA not enabled (missing Alchemy API key or Gas Manager policy)",
    };
  }

  // Check if smart wallet exists or can be deployed
  try {
    const smartWalletAddress = await getSmartWalletAddress(eoaAddress);
    return {
      useAA: true,
      reason: `Smart wallet available: ${smartWalletAddress}`,
    };
  } catch (error) {
    return {
      useAA: false,
      reason: `Failed to calculate smart wallet address: ${error}`,
    };
  }
}
