/**
 * USDC transfer with Account Abstraction
 * Always uses AA with batched multicall and Alchemy Paymaster sponsorship
 */

import type { Address, WalletClient } from "viem";
import { sendUSDCWithAA } from "./aa/transfer";
import type { GasSpeed } from "@/components/send-money/gas-speed-selector";
import type { GasEstimate } from "./aa/multicall";

export interface SmartTransferOptions {
  walletClient: WalletClient;
  recipientAddress: Address;
  amount: string; // USD amount
  platformFeeRecipient?: Address | null;
  platformFeeAmount?: string;
  onProgress?: (status: 'checking' | 'building' | 'signing' | 'submitting' | 'confirming') => void;
  gasSpeed?: GasSpeed;
  userId?: string; // User ID to save smart wallet address to DB
}

export interface SmartTransferResult {
  txHash: `0x${string}`;
  userOpHash: string;
  feeAmount: string;
  recipientAmount: string;
  isAA: boolean; // Always true now
  batched: boolean;
  gasFeeSponsored: boolean; // Always true (Alchemy sponsors gas)
  gasEstimate?: GasEstimate;
}

/**
 * Send USDC using Account Abstraction (always)
 * Batched transfers with Alchemy Paymaster sponsorship
 */
export async function sendUSDCSmart(options: SmartTransferOptions): Promise<SmartTransferResult> {
  const {
    walletClient,
    recipientAddress,
    amount,
    platformFeeRecipient,
    platformFeeAmount,
    onProgress,
    gasSpeed = 'normal',
    // userId is kept for future use but DB lookup now handled by send-money component
  } = options;

  const eoaAddress = walletClient.account?.address;
  if (!eoaAddress) {
    throw new Error("Wallet client must have an account");
  }

  console.log("AA transfer initiated:", {
    eoaAddress,
    amount,
    gasSpeed,
    batched: !!platformFeeRecipient,
  });

  // Get smart wallet address - calculate directly (DB lookup handled by send-money component)
  const { getSmartWalletAddress } = await import("./aa/account");
  const smartWalletAddress = await getSmartWalletAddress(eoaAddress);
  console.log("Smart wallet calculated:", smartWalletAddress);

  // Note: Smart wallet address is already saved to DB by getSmartWalletAddressRobust
  // if userId was provided and address wasn't in DB

  // Check if USDC needs to be transferred from EOA to smart wallet first
  const { getUSDCBalance } = await import("./tokens");
  const { getPublicClient } = await import("./client");
  
  const smartWalletBalance = await getUSDCBalance(smartWalletAddress);
  const eoaBalance = await getUSDCBalance(eoaAddress);
  
  console.log("Balance check before AA transfer:", {
    eoaAddress,
    eoaBalance,
    smartWalletAddress,
    smartWalletBalance,
    amountNeeded: amount,
  });
  
  // Calculate total needed (amount + platform fee if applicable)
  const totalNeeded = platformFeeAmount
    ? (parseFloat(amount) + parseFloat(platformFeeAmount)).toFixed(6)
    : amount;
  
  const totalNeededNum = parseFloat(totalNeeded);
  const smartBalanceNum = parseFloat(smartWalletBalance);
  const eoaBalanceNum = parseFloat(eoaBalance);
  const combinedBalance = smartBalanceNum + eoaBalanceNum;
  
  console.log("Balance calculation:", {
    totalNeeded,
    smartWalletBalance,
    eoaBalance,
    combinedBalance: combinedBalance.toFixed(6),
    shortfall: smartBalanceNum < totalNeededNum ? (totalNeededNum - smartBalanceNum).toFixed(6) : "0",
  });
  
  // Check if we need to transfer from EOA to smart wallet
  if (smartBalanceNum < totalNeededNum) {
    const shortfall = totalNeededNum - smartBalanceNum;
    
    // Check if we have enough combined balance
    if (combinedBalance < totalNeededNum) {
      throw new Error(
        `Insufficient USDC balance. ` +
        `Need: ${totalNeeded} USDC, ` +
        `Smart wallet: ${smartWalletBalance} USDC, ` +
        `EOA: ${eoaBalance} USDC, ` +
        `Total available: ${combinedBalance.toFixed(6)} USDC, ` +
        `Shortfall: ${(totalNeededNum - combinedBalance).toFixed(6)} USDC`
      );
    }
    
    // Transfer from EOA to smart wallet to cover shortfall
    console.log(`📤 Transferring ${shortfall.toFixed(6)} USDC from EOA to smart wallet...`);
    onProgress?.('checking');
    
    const { sendUSDC: sendUSDCEOA } = await import("./tokens");
    const transferResult = await sendUSDCEOA(
      walletClient,
      smartWalletAddress,
      shortfall.toFixed(6), // Transfer what's needed
      null, // No platform fee for internal transfer
      (status) => {
        // Map EOA transfer statuses to our limited status types
        if (status === 'checking' || status === 'approving' || status === 'transferring') {
          onProgress?.('checking');
        }
      }
    );
    
    console.log("EOA→Smart wallet transfer sent, waiting for confirmation...", transferResult.txHash);
    
    // Wait for transaction to be mined
    const publicClient = getPublicClient();
    await publicClient.waitForTransactionReceipt({
      hash: transferResult.txHash as `0x${string}`,
      confirmations: 1,
    });
    
    // Verify the balance was updated
    const updatedBalance = await getUSDCBalance(smartWalletAddress);
    console.log("Smart wallet balance after EOA transfer confirmed:", updatedBalance);
    
    if (parseFloat(updatedBalance) < totalNeededNum) {
      throw new Error(
        `Transfer completed but balance insufficient. ` +
        `Expected: ${totalNeeded} USDC, Got: ${updatedBalance} USDC`
      );
    }
    
    console.log("✅ Smart wallet funded, proceeding with AA transfer");
  }

  // Execute AA transfer with Alchemy Paymaster
  const result = await sendUSDCWithAA(
    walletClient,
    recipientAddress,
    amount,
    platformFeeRecipient,
    platformFeeAmount,
    onProgress,
    gasSpeed
  );

  return {
    txHash: result.txHash as `0x${string}`,
    userOpHash: result.userOpHash,
    feeAmount: result.platformFee, // Platform fee only (gas is sponsored)
    recipientAmount: result.recipientAmount,
    isAA: true, // Always true now
    batched: result.batched,
    gasFeeSponsored: true, // Always true (Alchemy sponsors gas)
    gasEstimate: result.gasEstimate,
  };
}

/**
 * Check if Account Abstraction should be used (always returns true now)
 * Kept for backwards compatibility
 * @deprecated Always returns true - we only use AA now
 */
export async function shouldUseAAForTransfer(): Promise<{
  useAA: boolean;
  reason: string;
}> {
  return {
    useAA: true,
    reason: "Account Abstraction is always enabled (gas-free transactions)",
  };
}
