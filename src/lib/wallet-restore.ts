/**
 * Wallet auto-restore utilities
 * Automatically restores encrypted wallet from server when not found in IndexedDB
 */

import { getAllWallets, saveWalletRecord, type StoredWalletRecord } from "@/lib/storage/indexeddb";

interface EncryptedWalletPayload {
  ciphertext: string;
  iv: string;
  salt: string;
}

/**
 * Check if wallet exists in IndexedDB
 */
export async function hasWalletInStorage(address: string): Promise<boolean> {
  try {
    const allWallets = await getAllWallets();
    console.log("[hasWalletInStorage] All wallets in IndexedDB:", allWallets.length);
    console.log("[hasWalletInStorage] Wallet addresses:", allWallets.map(w => w.address));
    console.log("[hasWalletInStorage] Looking for:", address);
    
    const found = allWallets.some((w) => w.address.toLowerCase() === address.toLowerCase());
    console.log("[hasWalletInStorage] Found:", found);
    
    return found;
  } catch (error) {
    console.error("[hasWalletInStorage] Error checking wallet in storage:", error);
    return false;
  }
}

/**
 * Restore wallet from server backup
 * @param sessionToken - User's session token
 * @returns true if wallet was restored, false otherwise
 */
export async function restoreWalletFromServer(sessionToken: string): Promise<boolean> {
  try {
    console.log("[restoreWalletFromServer] Fetching wallet from server...");
    
    const response = await fetch("/api/wallet/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken }),
    });

    console.log("[restoreWalletFromServer] Response status:", response.status);

    if (!response.ok) {
      if (response.status === 404) {
        console.log("[restoreWalletFromServer] No backup found on server");
        return false;
      }
      const errorData = await response.json();
      console.error("[restoreWalletFromServer] Server error:", errorData);
      throw new Error("Failed to restore wallet from server");
    }

    const data = await response.json();
    console.log("[restoreWalletFromServer] Received wallet data for:", data.walletAddress);

    // Parse the encrypted data and save to IndexedDB
    const encryptedPayload: EncryptedWalletPayload = JSON.parse(data.encryptedData);
    console.log("[restoreWalletFromServer] Encrypted payload parsed successfully");
    
    const walletRecord: StoredWalletRecord<EncryptedWalletPayload> = {
      address: data.walletAddress,
      payload: encryptedPayload,
      createdAt: new Date().toISOString(),
    };

    await saveWalletRecord(walletRecord);
    console.log("[restoreWalletFromServer] ✓ Wallet saved to IndexedDB:", data.walletAddress);
    return true;
  } catch (error) {
    console.error("[restoreWalletFromServer] Error:", error);
    return false;
  }
}

/**
 * Auto-restore wallet if missing from IndexedDB
 * Call this on dashboard load or after sign-in
 */
export async function autoRestoreWallet(
  sessionToken: string,
  walletAddress: string | null
): Promise<boolean> {
  console.log("[autoRestoreWallet] Starting auto-restore process...");
  console.log("[autoRestoreWallet] Session token:", sessionToken ? "present" : "missing");
  console.log("[autoRestoreWallet] Wallet address:", walletAddress);
  
  if (!walletAddress) {
    console.log("[autoRestoreWallet] No wallet address provided, aborting");
    return false;
  }

  // Check if wallet already exists in IndexedDB
  const hasWallet = await hasWalletInStorage(walletAddress);
  if (hasWallet) {
    console.log("[autoRestoreWallet] Wallet already exists in IndexedDB, no restore needed");
    return true; // Wallet already present
  }

  // Try to restore from server
  console.log("[autoRestoreWallet] Wallet not found in IndexedDB, attempting restore from server...");
  const restored = await restoreWalletFromServer(sessionToken);
  
  if (restored) {
    console.log("[autoRestoreWallet] ✓ Wallet successfully restored from server backup");
  } else {
    console.warn("[autoRestoreWallet] ⚠ Could not restore wallet from server. User may need to import manually.");
  }

  return restored;
}

