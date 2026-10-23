/**
 * Worker initialization for BullMQ cache invalidation
 * This should be called on application startup
 */

import { initCacheWorker } from "@/lib/cache/queue";

// Initialize the worker when this module is imported
// The worker will automatically start processing jobs from the queue
let worker: ReturnType<typeof initCacheWorker> | null = null;

export function startCacheWorker() {
  // Skip worker initialization during build phase
  if (process.env.NEXT_PHASE === "phase-production-build") {
    console.log("[Worker] ⚠ Skipping worker initialization during build phase");
    return null;
  }

  if (!worker) {
    worker = initCacheWorker();
    if (!worker) {
      console.warn("[Worker] ⚠ Cache worker could not be initialized (Redis may not be configured)");
    }
  }
  return worker;
}

export function getWorker() {
  return worker;
}
