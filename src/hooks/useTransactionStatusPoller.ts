/**
 * Hook to poll for transaction status updates
 */

import { useEffect, useRef } from "react";
import { useWalletDataStore } from "@/stores/wallet-data-store";

interface TransactionStatusPollerOptions {
  enabled: boolean;
  walletAddress?: string;
  interval?: number; // Poll interval in milliseconds (default: 5000)
}

export function useTransactionStatusPoller({
  enabled,
  walletAddress,
  interval = 5000,
}: TransactionStatusPollerOptions) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const transactions = useWalletDataStore((state) => state.transactions);
  const updateTransactionStatus = useWalletDataStore((state) => state.updateTransactionStatus);

  useEffect(() => {
    if (!enabled || !walletAddress) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Get pending transactions
    const pendingTxs = transactions.filter(tx => tx.status === "PENDING");
    
    if (pendingTxs.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const pollTransactions = async () => {
      const pendingTransactions = transactions.filter(tx => tx.status === "PENDING");
      
      if (pendingTransactions.length === 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      // Check each pending transaction
      for (const tx of pendingTransactions) {
        // Skip temp transactions without real txHash
        if (tx.txHash.startsWith("temp-")) continue;

        try {
          const response = await fetch(`/api/wallet/check-transaction-status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ txHash: tx.txHash }),
          });

          if (response.ok) {
            const data = await response.json();
            
            if (data.status && data.status !== tx.status) {
              updateTransactionStatus(tx.txHash, data.status, data.blockNumber);
            }
          }
        } catch (error) {
          console.error(`[TransactionPoller] Failed to check status for ${tx.txHash}:`, error);
        }
      }
    };

    // Poll immediately
    pollTransactions();

    // Then poll at regular intervals
    intervalRef.current = setInterval(pollTransactions, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, walletAddress, transactions, interval, updateTransactionStatus]);
}
