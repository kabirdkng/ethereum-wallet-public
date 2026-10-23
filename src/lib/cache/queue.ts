/**
 * BullMQ queue configuration for cache invalidation
 * Handles background jobs to invalidate stale cache when DB updates occur
 */

import { Queue, Worker, QueueEvents } from "bullmq";
import { getServerEnv } from "@/config/env";
import { deleteCachedPattern, cacheKeys } from "./redis";

interface CacheInvalidationJob {
  walletAddress: string;
  type: "transactions" | "balances" | "both";
}

/**
 * Get Redis connection configuration for BullMQ
 * Reuses the existing IORedis client to minimize connections
 */
function getRedisConnection() {
  const env = getServerEnv();
  if (!env.REDIS_URL) {
    return null;
  }

  // Parse URL for connection details
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: parseInt(url.port || "6379"),
    password: url.password || undefined,
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false, // Disable ready check for shared connections
    enableOfflineQueue: true,
    skipVersionCheck: true, // Skip Redis version and eviction policy checks to reduce console noise
  };
}

// Use globalThis to prevent duplicate connections during hot-reload
const globalForBullMQ = globalThis as unknown as {
  cacheQueue: Queue<CacheInvalidationJob> | null | undefined;
  cacheWorker: Worker<CacheInvalidationJob> | null | undefined;
  queueEvents: QueueEvents | null | undefined;
};

let cacheQueue: Queue<CacheInvalidationJob> | null = null;
let cacheWorker: Worker<CacheInvalidationJob> | null = null;
let queueEvents: QueueEvents | null = null;

/**
 * Get or create the cache invalidation queue
 */
export function getCacheQueue(): Queue<CacheInvalidationJob> | null {
  const connection = getRedisConnection();
  if (!connection) {
    return null;
  }

  // Return existing queue from globalThis (for hot-reload persistence)
  if (globalForBullMQ.cacheQueue !== undefined) {
    return globalForBullMQ.cacheQueue;
  }

  if (cacheQueue) {
    return cacheQueue;
  }

  try {
    const env = getServerEnv();
    cacheQueue = new Queue<CacheInvalidationJob>("cache-invalidation", {
      connection,
      prefix: env.BULLMQ_PREFIX || "wallet",
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
        removeOnComplete: {
          count: 100, // Keep last 100 completed jobs
          age: 3600, // 1 hour
        },
        removeOnFail: {
          count: 500, // Keep last 500 failed jobs for debugging
        },
      },
    });

    // Store in globalThis for development hot-reload persistence
    if (process.env.NODE_ENV !== "production") {
      globalForBullMQ.cacheQueue = cacheQueue;
    }

    console.log("[BullMQ] Cache invalidation queue initialized");
    return cacheQueue;
  } catch (error) {
    console.error("[BullMQ] Failed to initialize queue:", error);
    return null;
  }
}

/**
 * Initialize the cache invalidation worker
 * This processes jobs from the queue and invalidates cache
 */
export function initCacheWorker(): Worker<CacheInvalidationJob> | null {
  const connection = getRedisConnection();
  if (!connection) {
    return null;
  }

  // Return existing worker from globalThis (for hot-reload persistence)
  if (globalForBullMQ.cacheWorker !== undefined) {
    return globalForBullMQ.cacheWorker;
  }

  if (cacheWorker) {
    return cacheWorker;
  }

  try {
    const env = getServerEnv();
    cacheWorker = new Worker<CacheInvalidationJob>(
      "cache-invalidation",
      async (job) => {
        const { walletAddress, type } = job.data;

        try {
          if (type === "transactions" || type === "both") {
            // Invalidate all transaction cache entries for this wallet
            const txPattern = cacheKeys.transactionsList(walletAddress);
            await deleteCachedPattern(txPattern);
          }

          if (type === "balances" || type === "both") {
            // Invalidate balance cache for this wallet
            const balanceKey = cacheKeys.balances(walletAddress);
            await deleteCachedPattern(balanceKey);
          }

          return { success: true };
        } catch (error) {
          console.error(`[CacheWorker] Error invalidating cache:`, error);
          throw error; // Re-throw to trigger retry
        }
      },
      {
        connection,
        prefix: env.BULLMQ_PREFIX || "wallet",
        concurrency: 5, // Process 5 jobs concurrently
      }
    );

    cacheWorker.on("completed", (job) => {
      console.log(`[CacheWorker] Job ${job.id} completed`);
    });

    cacheWorker.on("failed", (job, err) => {
      console.error(`[CacheWorker] Job ${job?.id} failed:`, err);
    });

    // Initialize queue events for monitoring
    if (!globalForBullMQ.queueEvents) {
      queueEvents = new QueueEvents("cache-invalidation", {
        connection,
        prefix: env.BULLMQ_PREFIX || "wallet",
      });
      
      // Store in globalThis
      if (process.env.NODE_ENV !== "production") {
        globalForBullMQ.queueEvents = queueEvents;
      }
    }

    // Store worker in globalThis for development hot-reload persistence
    if (process.env.NODE_ENV !== "production") {
      globalForBullMQ.cacheWorker = cacheWorker;
    }

    return cacheWorker;
  } catch (error) {
    console.error("[BullMQ] Failed to initialize worker:", error);
    return null;
  }
}

/**
 * Queue a cache invalidation job
 */
export async function queueCacheInvalidation(
  walletAddress: string,
  type: "transactions" | "balances" | "both"
): Promise<void> {
  const queue = getCacheQueue();
  if (!queue) {
    console.warn("[BullMQ] ⚠ Queue not available, cache invalidation will NOT occur. Ensure REDIS_URL is configured.");
    return;
  }

  try {
    await queue.add(
      "invalidate",
      { walletAddress, type },
      {
        jobId: `${walletAddress.toLowerCase()}-${type}-${Date.now()}`, // Unique job ID with normalized address
        removeOnComplete: true,
      }
    );
    console.log(`[BullMQ] ✓ Queued cache invalidation for ${walletAddress}, type: ${type}`);
  } catch (error) {
    console.error("[BullMQ] ✗ Failed to queue cache invalidation:", error);
  }
}

/**
 * Graceful shutdown
 */
export async function closeCacheQueue(): Promise<void> {
  const errors: Error[] = [];
  
  try {
    // Close worker first
    if (cacheWorker) {
      try {
        const status = await cacheWorker.isRunning();
        if (status) {
          await cacheWorker.close();
        }
      } catch (error) {
        // Ignore "Connection is closed" errors
        if (error instanceof Error && !error.message.includes("Connection is closed")) {
          errors.push(error);
        }
      } finally {
        cacheWorker = null;
        if (process.env.NODE_ENV !== "production") {
          globalForBullMQ.cacheWorker = null;
        }
      }
    }
    
    // Close queue events
    if (queueEvents) {
      try {
        await queueEvents.close();
        console.log("[BullMQ] Queue events closed");
      } catch (error) {
        if (error instanceof Error && !error.message.includes("Connection is closed")) {
          errors.push(error);
        }
      } finally {
        queueEvents = null;
        if (process.env.NODE_ENV !== "production") {
          globalForBullMQ.queueEvents = null;
        }
      }
    }
    
    // Close queue last
    if (cacheQueue) {
      try {
        await cacheQueue.close();
        console.log("[BullMQ] Queue closed");
      } catch (error) {
        if (error instanceof Error && !error.message.includes("Connection is closed")) {
          errors.push(error);
        }
      } finally {
        cacheQueue = null;
        if (process.env.NODE_ENV !== "production") {
          globalForBullMQ.cacheQueue = null;
        }
      }
    }
    
    if (errors.length === 0) {
      console.log("[BullMQ] ✓ Cache queue closed gracefully");
    } else {
      console.error("[BullMQ] Closed with errors:", errors);
    }
  } catch (error) {
    console.error("[BullMQ] Error closing cache queue:", error);
  }
}
