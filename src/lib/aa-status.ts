/**
 * Account Abstraction status checker and display utilities
 * Helps users understand if AA is available and its benefits
 */

import type { Address } from "viem";
import { shouldUseAA } from "./blockchain/aa/transfer";
import { getWalletMigrationInfo } from "./wallet-migration";

export interface AAStatus {
  available: boolean;
  enabled: boolean;
  smartWalletAddress?: Address;
  isDeployed: boolean;
  reason?: string;
  benefits: string[];
  requirements: string[];
}

/**
 * Get comprehensive AA status for a user
 */
export async function getAAStatus(eoaAddress: Address): Promise<AAStatus> {
  try {
    const aaCheck = await shouldUseAA(eoaAddress);

    if (aaCheck.useAA) {
      const migrationInfo = await getWalletMigrationInfo(eoaAddress);

      return {
        available: true,
        enabled: true,
        smartWalletAddress: migrationInfo.smartWalletAddress,
        isDeployed: migrationInfo.isDeployed,
        benefits: [
          "No ETH needed for gas fees",
          "Platform sponsors all gas costs",
          "Faster transaction confirmations",
          "Batched transfers save on fees",
        ],
        requirements: [],
      };
    } else {
      return {
        available: false,
        enabled: false,
        isDeployed: false,
        reason: aaCheck.reason,
        benefits: [],
        requirements: [
          "Requires Alchemy API key configuration",
          "Requires Gas Manager policy setup",
          "Contact support to enable AA",
        ],
      };
    }
  } catch (error) {
    console.error("Error checking AA status:", error);
    return {
      available: false,
      enabled: false,
      isDeployed: false,
      reason: error instanceof Error ? error.message : "Unknown error",
      benefits: [],
      requirements: ["Unable to check AA status"],
    };
  }
}

/**
 * Format AA status for display
 */
export function formatAAStatus(status: AAStatus): {
  title: string;
  description: string;
  badge: "success" | "warning" | "error";
} {
  if (status.enabled) {
    return {
      title: "Gas-Free Transfers Enabled",
      description: status.isDeployed
        ? "Your smart wallet is active. All transfers are gas-sponsored."
        : "Your smart wallet is ready. First transfer will deploy it (free).",
      badge: "success",
    };
  } else if (status.available) {
    return {
      title: "Gas-Free Transfers Available",
      description: "Upgrade your wallet to enable gas-sponsored transfers.",
      badge: "warning",
    };
  } else {
    return {
      title: "Traditional Wallet",
      description: status.reason || "Using standard Ethereum transfers (requires ETH for gas).",
      badge: "error",
    };
  }
}

/**
 * Calculate estimated savings with AA
 */
export async function calculateAASavings(monthlyTransfers: number): Promise<{
  gasFeeSavedPerMonth: string;
  gasFeePerTransfer: string;
  totalSavedUSD: string;
}> {
  // Average gas cost per transfer (varies by network congestion)
  const avgGasCostUSD = 2.5; // Conservative estimate
  const totalSaved = monthlyTransfers * avgGasCostUSD;

  return {
    gasFeePerTransfer: avgGasCostUSD.toFixed(2),
    gasFeeSavedPerMonth: totalSaved.toFixed(2),
    totalSavedUSD: totalSaved.toFixed(2),
  };
}
