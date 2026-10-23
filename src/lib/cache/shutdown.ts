/**
 * Graceful shutdown handler for all Redis connections and background workers
 * Ensures all BullMQ workers, queues, Redis clients, and monitors are properly closed
 */

import { closeRedisClient } from "./redis";
import { closeCacheQueue } from "./queue";
import { stopTransactionMonitor } from "../workers/transaction-monitor";

let shutdownComplete = false;

export async function gracefulShutdown() {
  // Only allow shutdown to run once
  if (shutdownComplete) {
    return;
  }
  
  shutdownComplete = true;

  try {
    // Stop transaction monitor
    stopTransactionMonitor();
    
    // Close BullMQ queue and workers first (includes all connection cleanup)
    await closeCacheQueue();
    
    // Small delay to ensure queue cleanup completes
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Close Redis client
    await closeRedisClient();
    
    console.log("[Shutdown] ✓ All connections closed successfully");
  } catch (error) {
    // Silently ignore "Connection is closed" errors during shutdown
    if (error instanceof Error && !error.message.includes("Connection is closed")) {
      console.error("[Shutdown] Error during shutdown:", error);
    }
  }
}

// Track if handlers have been registered
let handlersRegistered = false;

// Register shutdown handlers only once
if (typeof process !== "undefined" && !handlersRegistered) {
  handlersRegistered = true;
  
  const signals = ["SIGTERM", "SIGINT", "beforeExit"] as const;
  
  signals.forEach(signal => {
    process.once(signal, async () => {
      if (!shutdownComplete) {
        console.log(`[Shutdown] ${signal} received`);
        await gracefulShutdown();
      }
    });
  });
  
  // Suppress "Connection is closed" errors from unhandled promise rejections
  // These occur during hot-reload/shutdown when Redis connections are closed
  process.on("unhandledRejection", (reason: unknown) => {
    if (reason instanceof Error && reason.message.includes("Connection is closed")) {
      // Silently ignore - this is expected during shutdown
      return;
    }
    // Log other unhandled rejections
    console.error("[Unhandled Rejection]", reason);
  });
}
