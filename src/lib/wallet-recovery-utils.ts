/**
 * Unified wallet recovery utilities
 * Ensures all recovery methods follow the same pattern as initial wallet creation
 */

import { mnemonicToAccount } from "viem/accounts";
import { encryptWithPin } from "@/lib/crypto/encryption";
import { saveWalletRecord } from "@/lib/storage/indexeddb";

export interface WalletRecoveryResult {
  walletAddress: string;
  success: boolean;
}

/**
 * Restore wallet from recovered mnemonic with new PIN
 * Follows the same pattern as initial wallet creation in onboarding
 * 
 * Steps:
 * 1. Derive wallet address from mnemonic
 * 2. Encrypt mnemonic with new PIN (AES-GCM)
 * 3. Save encrypted wallet to IndexedDB
 * 4. Update PIN hash on server
 * 5. Backup encrypted wallet to server
 * 
 * @param mnemonic - Recovered mnemonic phrase
 * @param newPin - New 6-digit PIN
 * @param sessionToken - User's session token
 * @returns Wallet address and success status
 */
export async function restoreWalletWithNewPIN(
  mnemonic: string,
  newPin: string,
  sessionToken: string
): Promise<WalletRecoveryResult> {
  // Step 1: Derive wallet address from mnemonic
  const account = mnemonicToAccount(mnemonic);
  const walletAddress = account.address;
  
  console.log("[Wallet Recovery] Deriving wallet address from mnemonic:", walletAddress);

  // Step 2: Encrypt mnemonic with new PIN (same as onboarding)
  const encrypted = await encryptWithPin(mnemonic, newPin);
  console.log("[Wallet Recovery] ✓ Mnemonic encrypted with new PIN");

  // Step 3: Save encrypted wallet to IndexedDB (same as onboarding)
  await saveWalletRecord({
    address: walletAddress,
    payload: encrypted, // Store the object directly, not stringified
    createdAt: new Date().toISOString(),
  });
  console.log("[Wallet Recovery] ✓ Encrypted wallet saved to IndexedDB");

  // Verify we can decrypt it immediately
  try {
    const { decryptWithPin } = await import("@/lib/crypto/encryption");
    const testDecrypt = await decryptWithPin(encrypted, newPin);
    if (testDecrypt !== mnemonic) {
      throw new Error("Decrypt verification failed - mnemonic mismatch");
    }
    console.log("[Wallet Recovery] ✓ Decryption verification passed");
  } catch (verifyError) {
    console.error("[Wallet Recovery] Decryption verification failed:", verifyError);
    throw new Error("Failed to verify wallet encryption");
  }

  // Step 4: Update PIN hash on server (same as onboarding)
  if (sessionToken) {
    const setPinResponse = await fetch("/api/auth/set-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken, pin: newPin }),
    });

    if (!setPinResponse.ok) {
      const setPinError = await setPinResponse.json();
      console.error("[Wallet Recovery] Failed to update PIN hash:", setPinError);
      throw new Error("Failed to update PIN on server");
    }
    console.log("[Wallet Recovery] ✓ PIN hash updated on server");
  }

  // Step 5: Backup encrypted wallet to server (same as onboarding)
  try {
    const encryptedDataJson = JSON.stringify(encrypted);
    const backupResponse = await fetch("/api/wallet/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionToken,
        walletAddress,
        encryptedData: encryptedDataJson,
      }),
    });

    if (!backupResponse.ok) {
      const backupError = await backupResponse.json();
      console.warn("[Wallet Recovery] Failed to backup wallet to server:", backupError);
      // Don't throw - backup is optional
    } else {
      console.log("[Wallet Recovery] ✓ Encrypted wallet backed up to server");
    }
  } catch (backupError) {
    console.warn("[Wallet Recovery] Backup error:", backupError);
    // Continue - backup failure shouldn't block recovery
  }

  console.log("[Wallet Recovery] ✓ Wallet recovery complete! Wallet address:", walletAddress);

  return {
    walletAddress,
    success: true,
  };
}
