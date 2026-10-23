import { PrismaClient } from "@prisma/client";
import { queueCacheInvalidation } from "./cache/queue";

// Function to send SSE events (lazy import to avoid circular dependency)
let sendWalletEvent: ((address: string, type: "transaction_update" | "balance_update", data?: unknown) => void) | null = null;

async function notifyWalletUpdate(address: string, type: "transaction_update" | "balance_update", data?: unknown) {
  if (!sendWalletEvent) {
    try {
      const broadcastModule = await import("@/lib/sse/broadcast");
      sendWalletEvent = broadcastModule.sendWalletEvent;
    } catch (error) {
      console.error("[Prisma Extension] Failed to load SSE module:", error);
      return;
    }
  }
  
  if (sendWalletEvent) {
    sendWalletEvent(address, type, data);
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const basePrisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});

// Extend Prisma with cache invalidation logic
export const prisma = basePrisma.$extends({
  query: {
    transaction: {
      async create({ args, query }) {
        const result = await query(args);
        
        // Queue cache invalidation and send SSE events for affected wallets
        try {
          const walletAddresses = [
            result.senderAddress,
            result.recipientAddress,
          ].filter(Boolean) as string[];
          
          console.log(`[Prisma Extension] Transaction created: ${result.id}, txHash: ${result.txHash}`);
          console.log(`[Prisma Extension] Affected wallets:`, walletAddresses);
          
          // For each affected address, also invalidate the user's other address (EOA/smart wallet)
          const addressesToInvalidate = new Set<string>();
          
          for (const address of walletAddresses) {
            addressesToInvalidate.add(address);
            
            // Find user by this address (could be EOA or smart wallet)
            const user = await basePrisma.user.findFirst({
              where: {
                OR: [
                  { walletAddress: address },
                  { smartWalletAddress: address },
                ],
              },
              select: {
                walletAddress: true,
                smartWalletAddress: true,
              },
            });
            
            // Add both EOA and smart wallet addresses for invalidation
            if (user?.walletAddress) {
              addressesToInvalidate.add(user.walletAddress);
            }
            if (user?.smartWalletAddress) {
              addressesToInvalidate.add(user.smartWalletAddress);
            }
          }
          
          console.log(`[Prisma Extension] Invalidating cache for addresses:`, Array.from(addressesToInvalidate));
          
          for (const address of addressesToInvalidate) {
            await queueCacheInvalidation(address, "both");
            
            // Determine transaction type from each wallet's perspective
            const isSender = result.senderAddress?.toLowerCase() === address.toLowerCase();
            const transactionType = isSender ? "SEND" : "RECEIVE";
            
            // Send real-time update with FULL transaction details for optimistic UI
            // This allows receivers to see incoming transactions instantly
            await notifyWalletUpdate(address, "transaction_update", {
              transactionId: result.id,
              txHash: result.txHash,
              status: result.status,
              type: transactionType, // Correct type based on perspective
              token: result.token,
              amount: result.amount,
              senderAddress: result.senderAddress,
              recipientAddress: result.recipientAddress,
              blockNumber: result.blockNumber?.toString() || null,
              timestamp: result.confirmedAt?.getTime() || (result.createdAt as Date | undefined)?.getTime() || Date.now(),
            });
          }
          
          console.log(`[Prisma Extension] ✓ Cache invalidation queued and SSE notifications sent for transaction ${result.id}`);
        } catch (error) {
          console.error("[Prisma Extension] ✗ Error queueing cache invalidation:", error);
        }
        
        return result;
      },
      async update({ args, query }) {
        const result = await query(args);
        
        // Queue cache invalidation and send SSE events for affected wallets
        try {
          const walletAddresses = [
            result.senderAddress,
            result.recipientAddress,
          ].filter(Boolean) as string[];
          
          console.log(`[Prisma Extension] Transaction updated: ${result.id}, status: ${result.status}`);
          console.log(`[Prisma Extension] Affected wallets:`, walletAddresses);
          
          // For each affected address, also invalidate the user's other address (EOA/smart wallet)
          const addressesToInvalidate = new Set<string>();
          
          for (const address of walletAddresses) {
            addressesToInvalidate.add(address);
            
            // Find user by this address (could be EOA or smart wallet)
            const user = await basePrisma.user.findFirst({
              where: {
                OR: [
                  { walletAddress: address },
                  { smartWalletAddress: address },
                ],
              },
              select: {
                walletAddress: true,
                smartWalletAddress: true,
              },
            });
            
            // Add both EOA and smart wallet addresses for invalidation
            if (user?.walletAddress) {
              addressesToInvalidate.add(user.walletAddress);
            }
            if (user?.smartWalletAddress) {
              addressesToInvalidate.add(user.smartWalletAddress);
            }
          }
          
          console.log(`[Prisma Extension] Invalidating cache for addresses:`, Array.from(addressesToInvalidate));
          
          for (const address of addressesToInvalidate) {
            await queueCacheInvalidation(address, "both");
            
            // Determine transaction type from each wallet's perspective
            const isSender = result.senderAddress?.toLowerCase() === address.toLowerCase();
            const transactionType = isSender ? "SEND" : "RECEIVE";
            
            // Send real-time update with FULL transaction details
            await notifyWalletUpdate(address, "transaction_update", {
              transactionId: result.id,
              txHash: result.txHash,
              status: result.status,
              type: transactionType, // Correct type based on perspective
              token: result.token,
              amount: result.amount,
              senderAddress: result.senderAddress,
              recipientAddress: result.recipientAddress,
              blockNumber: result.blockNumber?.toString() || null,
              timestamp: result.confirmedAt?.getTime() || (result.createdAt as Date | undefined)?.getTime() || Date.now(),
            });
          }
          
          console.log(`[Prisma Extension] ✓ Cache invalidation queued and SSE notifications sent for transaction ${result.id}`);
        } catch (error) {
          console.error("[Prisma Extension] ✗ Error queueing cache invalidation:", error);
        }
        
        return result;
      },
      async createMany({ args, query }) {
        const result = await query(args);
        
        // For bulk creates, we can't easily get individual addresses
        // In practice, this endpoint creates transactions one at a time
        console.log(`[Prisma Extension] Bulk transaction creation - ${result.count} records`);
        
        return result;
      },
    },
  },
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = basePrisma;
}

// Initialize background workers after Prisma is fully set up
// Use setImmediate to defer until after this module finishes loading
if (typeof window === "undefined") {
  setImmediate(async () => {
    try {
      const { startCacheWorker, startTransactionMonitor } = await import("./server-init");
      startCacheWorker();
      startTransactionMonitor();
    } catch (error) {
      console.error("[Prisma] Failed to initialize background workers:", error);
    }
  });
}
