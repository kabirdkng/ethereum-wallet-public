import { useState, useCallback } from "react";
import { useWalletDataStore } from "@/stores/wallet-data-store";
import { authenticatedFetch } from "@/lib/api/fetch-with-auth";

export function useWalletBalances(address?: string, sessionToken?: string | null) {
  // Get balances from global store (persists across mounts)
  const { balances, estimatedTransfers, gasPerTransfer, setBalances } = useWalletDataStore();
  
  const [fetchingBalances, setFetchingBalances] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalances = useCallback(async (forceRefresh = false) => {
    if (!address || !sessionToken || fetchingBalances) return;

    setFetchingBalances(true);
    setError(null);

    try {
      const response = await authenticatedFetch("/api/wallet/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          sessionToken,
          walletAddress: address,
          forceRefresh,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch balances");
      }

      const data = await response.json();

      if (data.success) {
        setBalances(
          {
            usdc: data.usdc,
            usdt: data.usdt,
            eth: data.eth,
          },
          {
            estimatedTransfers: data.estimatedTransfers,
            gasPerTransfer: data.gasPerTransfer,
          }
        );
      }
    } catch (err) {
      console.error("Error fetching wallet balances:", err);
      setError("Unable to fetch balances. Click 'Refresh Balance' to try again.");
    } finally {
      setFetchingBalances(false);
    }
  }, [address, sessionToken, fetchingBalances, setBalances]);

  return {
    balances,
    estimatedTransfers,
    gasPerTransfer,
    fetchingBalances,
    error,
    fetchBalances,
  };
}
