/**
 * Smart Wallet Helper - Robust smart wallet address resolution
 * Implements failsafe pattern: DB first, then calculate, then update DB
 * 
 * SERVER-ONLY: This module uses Prisma and should only be imported in API routes or server components
 */

import type { Address } from "viem";
import { getSmartWalletAddress } from "./account";

// Dynamic import to avoid bundling Prisma in client code
async function getPrisma() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

interface SmartWalletResult {
  smartWalletAddress: Address;
  source: 'database' | 'calculated' | 'calculated-and-saved';
}

/**
 * Get smart wallet address with robust fallback chain
 * Priority: DB -> Calculate -> Save to DB
 * 
 * @param eoaAddress - EOA address of the user
 * @param userId - Optional user ID for database lookup/update
 * @returns Smart wallet address and source
 */
export async function getSmartWalletAddressRobust(
  eoaAddress: Address,
  userId?: string
): Promise<SmartWalletResult> {
  console.log("🔍 Resolving smart wallet address:", { eoaAddress, userId });

  const prisma = await getPrisma();

  // STEP 1: Try to get from database if userId provided
  if (userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { smartWalletAddress: true },
      });

      if (user?.smartWalletAddress) {
        console.log("✅ Smart wallet found in database:", user.smartWalletAddress);
        return {
          smartWalletAddress: user.smartWalletAddress as Address,
          source: 'database',
        };
      }

      console.log("⚠️ Smart wallet not in database, calculating...");
    } catch (dbError) {
      console.warn("Database lookup failed, falling back to calculation:", dbError);
    }
  }

  // STEP 2: Calculate smart wallet address (with retries)
  let calculatedAddress: Address;
  try {
    calculatedAddress = await getSmartWalletAddress(eoaAddress);
    console.log("✅ Smart wallet calculated:", calculatedAddress);
  } catch (error) {
    console.error("❌ Failed to calculate smart wallet address:", error);
    throw new Error(
      `Unable to determine smart wallet address. ` +
      `This may be due to network issues. Please try again. ` +
      `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // STEP 3: Save to database if userId provided and address was calculated
  if (userId && calculatedAddress) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { smartWalletAddress: calculatedAddress.toLowerCase() },
      });

      console.log("✅ Smart wallet address saved to database:", calculatedAddress);
      
      return {
        smartWalletAddress: calculatedAddress,
        source: 'calculated-and-saved',
      };
    } catch (updateError) {
      console.warn("Failed to save smart wallet to database (non-critical):", updateError);
      // Still return the calculated address - DB save failure is non-critical
      return {
        smartWalletAddress: calculatedAddress,
        source: 'calculated',
      };
    }
  }

  return {
    smartWalletAddress: calculatedAddress,
    source: 'calculated',
  };
}

/**
 * Get smart wallet address by EOA lookup in database
 * Useful when you don't have userId but have EOA address
 * 
 * @param eoaAddress - EOA address to lookup
 * @returns Smart wallet address and source
 */
export async function getSmartWalletByEOA(eoaAddress: Address): Promise<SmartWalletResult> {
  console.log("🔍 Looking up smart wallet by EOA:", eoaAddress);

  const prisma = await getPrisma();

  try {
    const user = await prisma.user.findUnique({
      where: { walletAddress: eoaAddress.toLowerCase() },
      select: { id: true, smartWalletAddress: true },
    });

    if (user) {
      return getSmartWalletAddressRobust(eoaAddress, user.id);
    }
  } catch (error) {
    console.warn("Database lookup by EOA failed:", error);
  }

  // Fallback to pure calculation
  return getSmartWalletAddressRobust(eoaAddress);
}

/**
 * Ensure user has smart wallet address in database
 * Call this during any wallet operation to keep DB in sync
 * 
 * @param userId - User ID
 * @param eoaAddress - EOA address
 * @returns Smart wallet address
 */
export async function ensureSmartWalletInDB(
  userId: string,
  eoaAddress: Address
): Promise<Address> {
  const result = await getSmartWalletAddressRobust(eoaAddress, userId);
  return result.smartWalletAddress;
}
