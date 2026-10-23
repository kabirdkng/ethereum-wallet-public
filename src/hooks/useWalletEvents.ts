/**
 * Hook to listen for real-time wallet updates via Server-Sent Events
 */

import { useEffect, useRef } from "react";
import { useWalletDataStore } from "@/stores/wallet-data-store";

interface WalletEvent {
  type: "connected" | "ping" | "transaction_update" | "balance_update";
  data?: {
    transactionId?: string;
    txHash?: string;
    status?: "PENDING" | "CONFIRMED" | "FAILED";
    type?: "SEND" | "RECEIVE";
    token?: "USDC" | "USDT" | "ETH";
    amount?: string;
    senderAddress?: string;
    recipientAddress?: string;
    blockNumber?: string;
    timestamp?: number;
  };
  timestamp: number;
}

interface UseWalletEventsOptions {
  sessionToken: string | null;
  enabled: boolean;
  onTransactionUpdate?: () => void;
  onBalanceUpdate?: () => void;
}

export function useWalletEvents({
  sessionToken,
  enabled,
  onTransactionUpdate,
  onBalanceUpdate,
}: UseWalletEventsOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5; // Limit reconnection attempts
  const isCleaningUpRef = useRef(false); // Track intentional cleanup

  useEffect(() => {
    isCleaningUpRef.current = false; // Reset cleanup flag
    
    if (!enabled || !sessionToken) {
      // Cleanup existing connection
      if (eventSourceRef.current) {
        console.log("[SSE] Cleaning up connection - not enabled or no session token");
        isCleaningUpRef.current = true;
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      return;
    }

    const connect = () => {
      try {
        const url = `/api/wallet/events?sessionToken=${encodeURIComponent(sessionToken)}`;
        console.log("[SSE] Attempting connection to:", url);
        const eventSource = new EventSource(url);

        eventSource.onopen = () => {
          console.log("[SSE] Connection opened successfully");
          reconnectAttempts.current = 0; // Reset on successful connection
        };

        eventSource.onmessage = (event) => {
          try {
            const data: WalletEvent = JSON.parse(event.data);
            
            switch (data.type) {
              case "connected":
                // Connection established
                break;
                
              case "transaction_update":
                console.log("[SSE] Transaction update received:", data.data);
                
                // Check if this is a full transaction notification (has all required details)
                if (data.data && data.data.txHash && data.data.type && data.data.token && data.data.amount) {
                  // Add optimistic transaction to the store for instant UI update
                  const optimisticTx = {
                    id: data.data.txHash, // Use txHash as ID for optimistic transaction
                    txHash: data.data.txHash,
                    type: data.data.type,
                    token: data.data.token,
                    amount: data.data.amount,
                    recipientAddress: data.data.recipientAddress || null,
                    senderAddress: data.data.senderAddress || null,
                    platformFee: null,
                    gasFee: null,
                    createdAt: new Date(data.data.timestamp || Date.now()).toISOString(),
                    confirmedAt: data.data.status === "CONFIRMED" ? new Date(data.data.timestamp || Date.now()).toISOString() : null,
                    status: data.data.status || "PENDING",
                    blockNumber: data.data.blockNumber || null,
                  };
                  
                  // Add to store only if it doesn't already exist
                  const existingTxs = useWalletDataStore.getState().transactions;
                  const exists = existingTxs.find(tx => tx.txHash === optimisticTx.txHash);
                  
                  if (!exists) {
                    console.log("[SSE] Adding new transaction to store:", optimisticTx.txHash);
                    useWalletDataStore.getState().addOptimisticTransaction(optimisticTx);
                  } else if (exists.status !== optimisticTx.status) {
                    // Update status if changed (e.g., PENDING -> CONFIRMED)
                    console.log("[SSE] Updating transaction status:", optimisticTx.txHash, exists.status, "->", optimisticTx.status);
                    useWalletDataStore.getState().updateTransactionStatus(
                      optimisticTx.txHash, 
                      optimisticTx.status,
                      optimisticTx.blockNumber || undefined
                    );
                  } else {
                    console.log("[SSE] Transaction already exists with same status:", optimisticTx.txHash);
                  }
                } else {
                  console.log("[SSE] Partial transaction update, triggering full refresh");
                }
                
                // Always trigger callback for full refresh to ensure data consistency
                if (onTransactionUpdate) {
                  onTransactionUpdate();
                }
                break;
                
              case "balance_update":
                if (onBalanceUpdate) {
                  onBalanceUpdate();
                }
                break;
                
              case "ping":
                // Keep-alive ping, no action needed
                break;
                
              default:
                // Unknown event type
                break;
            }
          } catch (error) {
            console.error("[SSE] Error parsing event:", error);
          }
        };

        eventSource.onerror = (error) => {
          // Skip logging if this is an intentional cleanup
          if (isCleaningUpRef.current) {
            return;
          }
          
          // EventSource errors don't provide detailed info, but we can check readyState
          const readyState = eventSource.readyState;
          const stateLabels = ['CONNECTING', 'OPEN', 'CLOSED'];
          
          // Only log as error if connection is closed (not just connecting)
          if (readyState === EventSource.CLOSED) {
            console.warn(`[SSE] Connection closed. ReadyState: ${stateLabels[readyState]}`, error);
          } else {
            console.log(`[SSE] Connection issue. ReadyState: ${stateLabels[readyState]}`);
          }
          
          eventSource.close();
          eventSourceRef.current = null;

          // Exponential backoff for reconnection with max attempts limit
          reconnectAttempts.current++;
          
          if (reconnectAttempts.current >= maxReconnectAttempts) {
            console.warn(`[SSE] Max reconnection attempts (${maxReconnectAttempts}) reached. Stopping reconnection attempts.`);
            return;
          }
          
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          
          console.log(`[SSE] Will reconnect in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (enabled && sessionToken && !isCleaningUpRef.current) {
              connect();
            }
          }, delay);
        };

        eventSourceRef.current = eventSource;
      } catch (error) {
        console.error("[SSE] Failed to create EventSource:", error);
      }
    };

    connect();

    // Cleanup on unmount
    return () => {
      isCleaningUpRef.current = true; // Mark as intentional cleanup
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [sessionToken, enabled, onTransactionUpdate, onBalanceUpdate]);
}
