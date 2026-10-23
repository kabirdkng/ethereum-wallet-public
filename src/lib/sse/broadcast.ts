/**
 * SSE Broadcasting utilities
 * Manages active SSE connections and broadcasts events to connected clients
 */

// Use global singleton pattern to prevent multiple instances in development hot-reload
const globalForSSE = globalThis as unknown as {
  sseConnections: Map<string, ReadableStreamDefaultController> | undefined;
};

// Store active connections: walletAddress -> controller
const connections = globalForSSE.sseConnections ?? new Map<string, ReadableStreamDefaultController>();

if (process.env.NODE_ENV !== "production") {
  globalForSSE.sseConnections = connections;
}

console.log(`[SSE Broadcast] Module loaded, active connections: ${connections.size}`);

/**
 * Register a new SSE connection
 */
export function registerConnection(
  walletAddress: string,
  controller: ReadableStreamDefaultController
) {
  const normalized = walletAddress.toLowerCase();
  connections.set(normalized, controller);
  console.log(`[SSE Broadcast] ✓ Registered connection for ${normalized} (total: ${connections.size})`);
  console.log(`[SSE Broadcast] Active connections: ${Array.from(connections.keys()).join(', ')}`);
}

/**
 * Unregister an SSE connection
 */
export function unregisterConnection(walletAddress: string) {
  connections.delete(walletAddress.toLowerCase());
  console.log(`[SSE Broadcast] ✗ Unregistered connection for ${walletAddress} (remaining: ${connections.size})`);
  console.log(`[SSE Broadcast] Active connections: ${Array.from(connections.keys()).join(', ') || 'none'}`);
}

/**
 * Send an event to a specific wallet address
 */
export function sendWalletEvent(
  walletAddress: string,
  eventType: "transaction_update" | "balance_update",
  data?: unknown
) {
  const normalizedAddress = walletAddress.toLowerCase();
  const controller = connections.get(normalizedAddress);
  
  console.log(`[SSE Broadcast] Attempting to send ${eventType} to ${normalizedAddress}`);
  console.log(`[SSE Broadcast] Active connections: ${Array.from(connections.keys()).join(', ') || 'none'}`);
  
  if (controller) {
    try {
      const event = JSON.stringify({
        type: eventType,
        data,
        timestamp: Date.now(),
      });
      controller.enqueue(`data: ${event}\n\n`);
      console.log(`[SSE Broadcast] ✓ Sent ${eventType} to ${walletAddress}`, data);
      return true;
    } catch (error) {
      console.error(`[SSE Broadcast] ✗ Error sending event to ${walletAddress}:`, error);
      connections.delete(normalizedAddress);
      return false;
    }
  } else {
    console.log(`[SSE Broadcast] ✗ No active connection for ${walletAddress} (${eventType})`);
    return false;
  }
}

/**
 * Get count of active connections
 */
export function getConnectionCount(): number {
  return connections.size;
}
