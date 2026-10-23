/**
 * Wallet utilities for transaction signing
 * Handles wallet decryption and wallet client creation
 */

import { createWalletClient, http, type WalletClient } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { getCurrentChain, getRpcUrl } from "@/config/blockchain";
import { decryptWithPin } from "@/lib/crypto/encryption";
import { getAllWallets, type StoredWalletRecord } from "@/lib/storage/indexeddb";

interface EncryptedWalletPayload {
  ciphertext: string;
  iv: string;
  salt: string;
}

/**
 * Decrypt wallet and create a wallet client for signing transactions
 * @param address - Wallet address
 * @param pin - User's PIN for decryption
 * @returns Configured wallet client
 */
export async function getWalletClientFromPIN(
  address: string,
  pin: string
): Promise<WalletClient> {
  try {
    console.log("Looking for wallet with address:", address);
    
    // Check all wallets in IndexedDB for debugging
    const allWallets = await getAllWallets();
    console.log("All wallets in IndexedDB:", allWallets);
    console.log("Wallet addresses in IndexedDB:", allWallets.map(w => w.address));
    
    // Find wallet by case-insensitive address match
    const walletRecord = allWallets.find(
      (w) => w.address.toLowerCase() === address.toLowerCase()
    ) as StoredWalletRecord<EncryptedWalletPayload> | undefined;
    
    console.log("Wallet record found:", walletRecord);
    
    if (!walletRecord) {
      throw new Error(
        `Wallet not found in local storage. Please complete the onboarding process to set up your wallet. Looking for: ${address}`
      );
    }

    // Decrypt mnemonic using PIN
    const mnemonic = await decryptWithPin(walletRecord.payload, pin);

    // Create account from mnemonic
    const account = mnemonicToAccount(mnemonic);

    // Create wallet client
    const walletClient = createWalletClient({
      account,
      chain: getCurrentChain(),
      transport: http(getRpcUrl()),
    });

    return walletClient;
  } catch (error) {
    console.error("Error creating wallet client:", error);
    
    if (error instanceof Error && error.message.includes("Wallet not found")) {
      throw error; // Re-throw the specific error
    }
    
    throw new Error("Failed to decrypt wallet. Please check your PIN.");
  }
}

/**
 * Verify PIN by attempting to decrypt wallet
 * @param address - Wallet address
 * @param pin - User's PIN
 * @returns true if PIN is correct, false otherwise
 */
export async function verifyWalletPIN(
  address: string,
  pin: string
): Promise<boolean> {
  try {
    await getWalletClientFromPIN(address, pin);
    return true;
  } catch {
    return false;
  }
}
