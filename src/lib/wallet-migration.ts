/**
 * Migration utilities for upgrading existing EOA wallets to support Account Abstraction
 * Calculates smart wallet addresses for existing users without requiring new wallet creation
 */

import type { Address } from "viem";
import { getSmartWalletAddress, isSmartWalletDeployed } from "./blockchain/aa/account";
import { isAAEnabled } from "./blockchain/aa/contracts";

export interface WalletMigrationInfo {
  eoaAddress: Address;
  smartWalletAddress: Address;
  isDeployed: boolean;
  canUpgrade: boolean;
  upgradeReason?: string;
}

/**
 * Get migration info for an existing EOA wallet
 * Calculates what the smart wallet address would be
 */
export async function getWalletMigrationInfo(eoaAddress: Address): Promise<WalletMigrationInfo> {
  // Check if AA is enabled
  const aaEnabled = isAAEnabled();
  if (!aaEnabled) {
    throw new Error("Account Abstraction not enabled (missing API key or Gas Manager policy)");
  }

  // Calculate smart wallet address (with retry logic)
  const smartWalletAddress = await getSmartWalletAddress(eoaAddress);
  const isDeployed = await isSmartWalletDeployed(smartWalletAddress);

  return {
    eoaAddress,
    smartWalletAddress,
    isDeployed,
    canUpgrade: true,
  };
}

/**
 * Update user record in database with smart wallet address
 * This should be called from an API route (server-side)
 */
export async function updateUserWithSmartWallet(
  userId: string,
  smartWalletAddress: string
): Promise<void> {
  const response = await fetch("/api/wallet/upgrade-to-aa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, smartWalletAddress }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to upgrade wallet");
  }
}

/**
 * Update IndexedDB with smart wallet address
 * This preserves the existing encrypted mnemonic
 */
export async function upgradeIndexedDBWallet(
  eoaAddress: string,
  smartWalletAddress: string
): Promise<void> {
  const { getWalletRecord, saveWalletRecord } = await import("./storage/indexeddb");

  // Get existing wallet record
  const existingRecord = await getWalletRecord(eoaAddress);
  if (!existingRecord) {
    console.warn(`No wallet found in IndexedDB for address: ${eoaAddress}. Skipping IndexedDB upgrade.`);
    return; // Skip if wallet not in IndexedDB (might be stored elsewhere)
  }

  // Update with smart wallet info
  await saveWalletRecord({
    ...existingRecord,
    smartWalletAddress,
    walletVersion: "AA", // Upgrade to AA
  });

  console.log("Upgraded IndexedDB wallet:", {
    eoaAddress,
    smartWalletAddress,
  });
}

/**
 * Full migration flow for existing user
 * 1. Calculate smart wallet address
 * 2. Update IndexedDB
 * 3. Update server database
 */
export async function migrateWalletToAA(
  eoaAddress: Address,
  userId: string
): Promise<{
  success: boolean;
  smartWalletAddress: Address;
  error?: string;
}> {
  try {
    // Get migration info
    const info = await getWalletMigrationInfo(eoaAddress);

    if (!info.canUpgrade) {
      return {
        success: false,
        smartWalletAddress: eoaAddress,
        error: info.upgradeReason,
      };
    }

    // Update IndexedDB
    await upgradeIndexedDBWallet(eoaAddress, info.smartWalletAddress);

    // Update server database
    await updateUserWithSmartWallet(userId, info.smartWalletAddress);

    console.log("Wallet migration completed:", {
      eoaAddress,
      smartWalletAddress: info.smartWalletAddress,
    });

    return {
      success: true,
      smartWalletAddress: info.smartWalletAddress,
    };
  } catch (error) {
    console.error("Error migrating wallet:", error);
    return {
      success: false,
      smartWalletAddress: eoaAddress,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if a user needs to migrate their wallet
 */
export function needsWalletMigration(user: {
  walletAddress?: string | null;
  smartWalletAddress?: string | null;
  walletVersion?: string | null;
}): boolean {
  // User has EOA but no smart wallet address yet
  return !!user.walletAddress && !user.smartWalletAddress && isAAEnabled();
}
