import { useState, useCallback } from "react";
import { useWalletDataStore } from "@/stores/wallet-data-store";
import { authenticatedFetch } from "@/lib/api/fetch-with-auth";

export function useWalletTransactions(address?: string, sessionToken?: string | null) {
  // Get transactions from global store (persists across mounts)
  const { 
    transactions, 
    currentPage, 
    hasMoreTransactions,
    setTransactions,
    appendTransactions,
  } = useWalletDataStore();
  
  const [fetchingTransactions, setFetchingTransactions] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchTransactions = useCallback(async (
    page = 1, 
    replace = false, 
    syncBlockchain = false
  ) => {
    if (!address || !sessionToken) return;
    
    if (fetchingTransactions && !replace) {
      return;
    }

    setFetchingTransactions(true);

    try {
      const response = await authenticatedFetch("/api/wallet/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          sessionToken, 
          walletAddress: address,
          page,
          limit: 10,
          syncBlockchain,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch transactions");
      }

      const data = await response.json();
      
      if (data.success && data.transactions) {
        const hasMore = data.pagination?.hasMore || false;
        
        if (replace || page === 1) {
          setTransactions(data.transactions, page, hasMore);
        } else {
          appendTransactions(data.transactions, hasMore);
        }
      }
    } catch {
      // Fail silently
    } finally {
      setFetchingTransactions(false);
      setLoadingMore(false);
    }
  }, [address, sessionToken, fetchingTransactions, setTransactions, appendTransactions]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMoreTransactions) {
      setLoadingMore(true);
      fetchTransactions(currentPage + 1, false);
    }
  };

  return {
    transactions,
    fetchingTransactions,
    hasMoreTransactions,
    loadingMore,
    fetchTransactions,
    handleLoadMore,
  };
}
