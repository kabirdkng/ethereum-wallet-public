/**
 * Background worker to monitor pending transactions and sync incoming transactions
 * Polls blockchain for transaction confirmations and updates database
 * Works independently of client browser state
 */

import { prisma } from "@/lib/prisma";
import { getPublicClient } from "@/lib/blockchain/client";

interface TransactionMonitorConfig {
  pollInterval: number; // How often to check pending txs (ms)
  syncInterval: number; // How often to sync blockchain for active wallets (ms)
  maxRetries: number; // Max retries for a single transaction
  batchSize: number; // Max transactions to check per iteration
  maxWalletsPerSync: number; // Max wallets to sync per cycle
  minSyncInterval: number; // Minimum time between syncs for same wallet (ms)
}

const DEFAULT_CONFIG: TransactionMonitorConfig = {
  pollInterval: 10000, // 10 seconds
  syncInterval: 120000, // 2 minutes (was 30s - too frequent!)
  maxRetries: 100, // ~16 minutes at 10s intervals
  batchSize: 20, // Check up to 20 transactions at once
  maxWalletsPerSync: 3, // Only 3 wallets per cycle (was 10 - too many!)
  minSyncInterval: 300000, // 5 minutes between syncs for same wallet (was 1 min)
};

// Global state for the worker
const globalForMonitor = globalThis as unknown as {
  transactionMonitorInterval: NodeJS.Timeout | null | undefined;
  blockchainSyncInterval: NodeJS.Timeout | null | undefined;
  transactionMonitorRunning: boolean | undefined;
};

let monitorInterval: NodeJS.Timeout | null = null;
let syncInterval: NodeJS.Timeout | null = null;
let isRunning = false;
const lastSyncTime = new Map<string, number>();

/**
 * Check a single transaction status on blockchain
 */
async function checkTransactionStatus(txHash: string): Promise<{
  status: "PENDING" | "CONFIRMED" | "FAILED";
  blockNumber?: bigint;
}> {
  try {
    const publicClient = getPublicClient();
    const receipt = await publicClient.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

    if (receipt) {
      const status = receipt.status === "success" ? "CONFIRMED" : "FAILED";
      return {
        status,
        blockNumber: receipt.blockNumber,
      };
    }

    return { status: "PENDING" };
  } catch {
    // Transaction not found or still pending
    console.log(`[TxMonitor] Transaction ${txHash} not found yet, still pending`);
    return { status: "PENDING" };
  }
}

/**
 * Process pending transactions
 */
async function processPendingTransactions(config: TransactionMonitorConfig): Promise<void> {
  try {
    // Find pending transactions that have real txHash (not temp IDs)
    const pendingTransactions = await prisma.transaction.findMany({
      where: {
        status: "PENDING",
        txHash: {
          not: {
            startsWith: "temp-",
          },
        },
      },
      orderBy: {
        createdAt: "desc", // Check newest first
      },
      take: config.batchSize,
    });

    if (pendingTransactions.length === 0) {
      return;
    }

    console.log(`[TxMonitor] Checking ${pendingTransactions.length} pending transactions`);

    // Check each transaction
    const updates = await Promise.allSettled(
      pendingTransactions.map(async (tx) => {
        try {
          // Check if transaction is too old (exceeded max retries based on age)
          const ageMs = Date.now() - new Date(tx.createdAt).getTime();
          const estimatedChecks = Math.floor(ageMs / config.pollInterval);
          
          if (estimatedChecks > config.maxRetries) {
            console.log(`[TxMonitor] Transaction ${tx.txHash} exceeded max retries, marking as FAILED`);
            await prisma.transaction.update({
              where: { id: tx.id },
              data: {
                status: "FAILED",
                confirmedAt: new Date(),
              },
            });
            return { txHash: tx.txHash, status: "FAILED" };
          }

          const result = await checkTransactionStatus(tx.txHash);

          if (result.status !== "PENDING" && result.status !== tx.status) {
            // Update transaction status in database
            // Note: Prisma extension will automatically:
            // 1. Invalidate cache
            // 2. Send SSE notifications to connected clients
            await prisma.transaction.update({
              where: { id: tx.id },
              data: {
                status: result.status,
                blockNumber: result.blockNumber,
                confirmedAt: new Date(),
              },
            });

            console.log(`[TxMonitor] ✓ Updated ${tx.txHash}: ${tx.status} → ${result.status}`);
            return { txHash: tx.txHash, status: result.status };
          }

          return { txHash: tx.txHash, status: result.status };
        } catch (error) {
          console.error(`[TxMonitor] Error checking transaction ${tx.txHash}:`, error);
          throw error;
        }
      })
    );

    // Log results
    const successful = updates.filter(r => r.status === "fulfilled").length;
    const failed = updates.filter(r => r.status === "rejected").length;
    console.log(`[TxMonitor] Batch complete: ${successful} checked, ${failed} errors`);

  } catch (error) {
    console.error("[TxMonitor] Error processing pending transactions:", error);
  }
}

/**
 * Sync blockchain transactions for recently active wallets
 * This ensures incoming transactions are detected even when sender uses external wallet
 * RATE LIMIT CONSCIOUS: Only syncs a few wallets at long intervals
 */
async function syncBlockchainTransactions(config: TransactionMonitorConfig): Promise<void> {
  try {
    // Only sync if there are active SSE connections (indicating active users)
    // Use dynamic import to avoid circular dependency issues during initialization
    const { getConnectionCount } = await import("@/lib/sse/broadcast");
    const activeConnections = getConnectionCount();
    if (activeConnections === 0) {
      return;
    }

    // Get users who had very recent activity (last 2 minutes only - very narrow window)
    const recentActivityThreshold = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes (was 5)
    const activeUsers = await prisma.user.findMany({
      where: {
        OR: [
          {
            Session: {
              some: {
                expires: {
                  gte: new Date(), // Active session
                },
              },
            },
          },
          {
            Transaction: {
              some: {
                createdAt: {
                  gte: recentActivityThreshold, // Very recent transactions only
                },
              },
            },
          },
        ],
        walletAddress: {
          not: null,
        },
      },
      select: {
        id: true,
        walletAddress: true,
        smartWalletAddress: true,
      },
      take: config.maxWalletsPerSync, // Strict limit on wallets per cycle
    });

    if (activeUsers.length === 0) {
      console.log("[TxMonitor] No recently active users to sync");
      return;
    }

    console.log(`[TxMonitor] Syncing blockchain for ${activeUsers.length} active users (max ${config.maxWalletsPerSync})`);

    let syncedCount = 0;

    // Sync transactions for each active user
    for (const user of activeUsers) {
      const walletAddress = user.smartWalletAddress || user.walletAddress;
      if (!walletAddress) continue;

      // Rate limit: Respect minimum interval between syncs
      const lastSync = lastSyncTime.get(walletAddress);
      if (lastSync && Date.now() - lastSync < config.minSyncInterval) {
        console.log(`[TxMonitor] Skipping ${walletAddress} - synced ${Math.floor((Date.now() - lastSync) / 1000)}s ago (min ${config.minSyncInterval / 1000}s)`);
        continue;
      }

      try {
        // Import blockchain utilities
        const { getTransactionHistory } = await import("@/lib/blockchain/tokens");
        const blockchainTxs = await getTransactionHistory(walletAddress as `0x${string}`);

        // Sync only very recent transactions (last 1 hour instead of 24 hours)
        // This drastically reduces processing and database load
        const recentTxs = blockchainTxs.filter(tx => {
          const txTime = new Date(tx.timestamp * 1000);
          return txTime > new Date(Date.now() - 60 * 60 * 1000); // 1 hour (was 24 hours!)
        });

        if (recentTxs.length === 0) {
          console.log(`[TxMonitor] No recent transactions for ${walletAddress}`);
          lastSyncTime.set(walletAddress, Date.now());
          continue;
        }

        let newCount = 0;
        let updatedCount = 0;

        // Upsert transactions
        for (const tx of recentTxs) {
          const existing = await prisma.transaction.findUnique({
            where: { txHash: tx.txHash },
          });

          if (existing) {
            // Update if status changed
            if (existing.status !== tx.status) {
              await prisma.transaction.update({
                where: { txHash: tx.txHash },
                data: {
                  status: tx.status,
                  blockNumber: tx.blockNumber,
                  confirmedAt: new Date(tx.timestamp * 1000),
                },
              });
              updatedCount++;
            }
          } else {
            // Create new transaction - this will trigger SSE notification via Prisma extension
            await prisma.transaction.create({
              data: {
                userId: user.id,
                txHash: tx.txHash,
                type: tx.type,
                token: tx.token,
                amount: tx.amount,
                recipientAddress: tx.toAddress.toLowerCase(),
                senderAddress: tx.fromAddress.toLowerCase(),
                status: tx.status,
                blockNumber: tx.blockNumber,
                confirmedAt: new Date(tx.timestamp * 1000),
              },
            });
            newCount++;
          }
        }

        lastSyncTime.set(walletAddress, Date.now());
        syncedCount++;

        if (newCount > 0 || updatedCount > 0) {
          console.log(`[TxMonitor] ✓ Synced ${walletAddress}: ${newCount} new, ${updatedCount} updated (from ${recentTxs.length} blockchain txs)`);
        } else {
          console.log(`[TxMonitor] ✓ Synced ${walletAddress}: no changes (checked ${recentTxs.length} blockchain txs)`);
        }

      } catch (error) {
        console.error(`[TxMonitor] Error syncing transactions for ${walletAddress}:`, error);
        // Don't set lastSyncTime on error - allow retry sooner
      }
    }

    console.log(`[TxMonitor] Blockchain sync complete: ${syncedCount}/${activeUsers.length} wallets synced`);

  } catch (error) {
    console.error("[TxMonitor] Error in blockchain sync:", error);
  }
}

/**
 * Start the transaction monitor worker
 */
export function startTransactionMonitor(config: Partial<TransactionMonitorConfig> = {}): void {
  // Use existing interval from global if in development (hot-reload)
  if (globalForMonitor.transactionMonitorInterval !== undefined) {
    console.log("[TxMonitor] Using existing monitor interval from global");
    monitorInterval = globalForMonitor.transactionMonitorInterval;
    syncInterval = globalForMonitor.blockchainSyncInterval || null;
    isRunning = globalForMonitor.transactionMonitorRunning ?? false;
    
    if (isRunning) {
      console.log("[TxMonitor] Monitor already running (hot-reload preserved)");
      return;
    }
  }

  if (isRunning) {
    console.log("[TxMonitor] Monitor already running");
    return;
  }

  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Run pending transaction check immediately on startup
  processPendingTransactions(finalConfig).catch(err => {
    console.error("[TxMonitor] Error in initial check:", err);
  });

  // Run blockchain sync immediately on startup
  syncBlockchainTransactions(finalConfig).catch(err => {
    console.error("[TxMonitor] Error in initial blockchain sync:", err);
  });

  // Then run pending transaction checks at regular intervals
  monitorInterval = setInterval(() => {
    processPendingTransactions(finalConfig).catch(err => {
      console.error("[TxMonitor] Error in monitor iteration:", err);
    });
  }, finalConfig.pollInterval);

  // Run blockchain sync at a different interval (less frequent)
  syncInterval = setInterval(() => {
    syncBlockchainTransactions(finalConfig).catch(err => {
      console.error("[TxMonitor] Error in blockchain sync iteration:", err);
    });
  }, finalConfig.syncInterval);

  isRunning = true;

  // Store in global for hot-reload persistence
  if (process.env.NODE_ENV !== "production") {
    globalForMonitor.transactionMonitorInterval = monitorInterval;
    globalForMonitor.blockchainSyncInterval = syncInterval;
    globalForMonitor.transactionMonitorRunning = true;
  }
}

/**
 * Stop the transaction monitor worker
 */
export function stopTransactionMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  
  isRunning = false;

  if (process.env.NODE_ENV !== "production") {
    globalForMonitor.transactionMonitorInterval = null;
    globalForMonitor.blockchainSyncInterval = null;
    globalForMonitor.transactionMonitorRunning = false;
  }
}

/**
 * Check if monitor is running
 */
export function isMonitorRunning(): boolean {
  return isRunning || (globalForMonitor.transactionMonitorRunning ?? false);
}
