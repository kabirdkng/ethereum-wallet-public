/**
 * Redis client configuration
 * Singleton pattern with globalThis to prevent multiple connections
 * 
 * IMPORTANT: Uses globalThis pattern (like Prisma) to prevent duplicate
 * connections during Next.js hot-reload in development mode
 */

import Redis from "ioredis";
import { getServerEnv } from "@/config/env";

// Use globalThis to preserve client across hot-reloads in development
const globalForRedis = globalThis as unknown as {
  redis: Redis | null | undefined;
};

// Create client once, outside the getter function
let redisClient: Redis | null = null;

function createRedisClient(): Redis | null {
  const env = getServerEnv();
  
  if (!env.REDIS_URL) {
    return null;
  }

  // Skip Redis connection during Next.js build phase
  if (process.env.NEXT_PHASE === "phase-production-build") {
    console.log("[Redis] ⚠ Skipping Redis connection during build phase");
    return null;
  }

  try {
    const client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null, // Required for BullMQ compatibility
      lazyConnect: false, // Connect immediately
      enableReadyCheck: true,
      retryStrategy: (times: number) => {
        if (times > 3) {
          console.error("[Redis] Max retry attempts reached");
          return null; // Stop retrying
        }
        return Math.min(times * 50, 2000); // Exponential backoff
      },
      // Connection pool limits
      maxLoadingRetryTime: 10000,
      enableOfflineQueue: true,
      // Keep-alive to prevent connection drops
      keepAlive: 30000,
    });

    let errorLogged = false;
    client.on("error", (err: Error & { code?: string }) => {
      // Suppress "Connection is closed" errors during shutdown/hot-reload
      if (err.message && err.message.includes("Connection is closed")) {
        return;
      }
      if (!errorLogged) {
        console.error("[Redis] Error:", err.code || err.message);
        errorLogged = true;
      }
    });

    // Only log connection once when first created
    client.once("connect", () => {
      console.log("[Redis] Connected");
      
      // Check eviction policy (async, non-blocking)
      client.config("GET", "maxmemory-policy")
        .then((result: unknown) => {
          const policy = Array.isArray(result) && result.length > 1 ? result[1] : null;
          if (policy && typeof policy === "string" && policy !== "noeviction") {
            console.warn(`[Redis] ⚠ Eviction policy is "${policy}". Recommended: "noeviction" for BullMQ`);
          }
        })
        .catch(() => {
          // Silently ignore if we can't check the config
        });
    });

    return client;
  } catch (error) {
    console.error("[Redis] Failed to create client:", error);
    return null;
  }
}

export function getRedisClient(): Redis | null {
  // Return existing client from globalThis (for hot-reload persistence)
  if (globalForRedis.redis !== undefined) {
    return globalForRedis.redis;
  }

  // Return module-level client if already created
  if (redisClient !== null) {
    return redisClient;
  }

  // Create new client
  redisClient = createRedisClient();

  // Store in globalThis for development hot-reload persistence
  if (process.env.NODE_ENV !== "production") {
    globalForRedis.redis = redisClient;
  }

  return redisClient;
}

/**
 * Close the Redis connection
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    try {
      // Check if connection is still open before closing
      if (redisClient.status === "ready" || redisClient.status === "connect") {
        await redisClient.quit();
        console.log("[Redis] ✓ Connection closed");
      } else {
        console.log("[Redis] Connection already closed or closing");
      }
    } catch (error) {
      // Ignore "Connection is closed" errors
      if (error instanceof Error && !error.message.includes("Connection is closed")) {
        console.error("[Redis] Error closing connection:", error);
      }
    } finally {
      redisClient = null;
      if (process.env.NODE_ENV !== "production") {
        globalForRedis.redis = null;
      }
    }
  }
}

export const cacheKeys = {
  transactions: (walletAddress: string, page: number, limit: number) => 
    `wallet:${walletAddress.toLowerCase()}:transactions:${page}:${limit}`,
  transactionsList: (walletAddress: string) => 
    `wallet:${walletAddress.toLowerCase()}:transactions:*`,
  balances: (walletAddress: string) => 
    `wallet:${walletAddress.toLowerCase()}:balances`,
  contacts: (userId: string) => 
    `user:${userId}:contacts`,
  cloudBackups: (userId: string) => 
    `user:${userId}:cloud-backups`,
  recoveryContacts: (userId: string) => 
    `user:${userId}:recovery-contacts`,
};

export async function getCached<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) as T : null;
  } catch {
    return null;
  }
}

export async function setCached(
  key: string, 
  value: unknown, 
  ttlSeconds?: number
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await redis.setex(key, ttlSeconds, serialized);
    } else {
      await redis.set(key, serialized);
    }
  } catch {
    // Fail silently
  }
}

export async function deleteCached(key: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    await redis.del(key);
  } catch {
    // Fail silently
  }
}

export async function deleteCachedPattern(pattern: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`[Redis] Invalidated ${keys.length} entries`);
    }
  } catch {
    // Fail silently
  }
}
