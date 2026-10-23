/**
 * Blockchain client utilities using viem
 * Provides configured publicClient for reading blockchain data
 */

import { createPublicClient, http } from "viem";
import { getCurrentChain, getRpcUrl } from "@/config/blockchain";

/**
 * Create a public client for reading blockchain data
 * Uses the current network configuration with timeout and retry settings
 */
export function getPublicClient() {
  return createPublicClient({
    chain: getCurrentChain(),
    transport: http(getRpcUrl(), {
      timeout: 10_000, // 10 seconds timeout (faster feedback)
      retryCount: 2,   // Retry failed requests up to 2 times
      retryDelay: 500, // Wait 500ms between retries
    }),
  });
}
