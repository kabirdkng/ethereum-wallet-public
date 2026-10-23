/**
 * Server initialization - imports required to start background workers
 * Import this file in any API route to ensure workers are running
 */

import { startCacheWorker } from "./cache/worker";
import { startTransactionMonitor } from "./workers/transaction-monitor";
import "./cache/shutdown"; // Register shutdown handlers

// Export functions for manual initialization
// Workers are auto-initialized from prisma.ts after Prisma client is ready
export { startCacheWorker, startTransactionMonitor };
