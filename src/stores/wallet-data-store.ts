"use client";

import { create } from "zustand";

interface Transaction {
  id: string;
  txHash: string;
  type: "SEND" | "RECEIVE";
  token: "USDC" | "USDT" | "ETH";
  amount: string;
  recipientAddress?: string | null;
  senderAddress?: string | null;
  platformFee?: string | null;
  gasFee?: string | null;
  createdAt: string;
  confirmedAt?: string | null;
  status: "PENDING" | "CONFIRMED" | "FAILED";
  blockNumber?: string | null;
}

interface WalletDataState {
  // Balances
  balances: {
    usdc: string;
    usdt: string;
    eth: string;
  };
  estimatedTransfers: number;
  gasPerTransfer: string;
  
  // Transactions
  transactions: Transaction[];
  currentPage: number;
  hasMoreTransactions: boolean;
  
  // Actions
  setBalances: (balances: { usdc: string; usdt: string; eth: string }, gasInfo: { estimatedTransfers: number; gasPerTransfer: string }) => void;
  setTransactions: (transactions: Transaction[], page: number, hasMore: boolean) => void;
  appendTransactions: (transactions: Transaction[], hasMore: boolean) => void;
  addOptimisticTransaction: (transaction: Transaction) => void;
  updateTransactionStatus: (txHash: string, status: "PENDING" | "CONFIRMED" | "FAILED", blockNumber?: string) => void;
  updateTransactionHash: (tempId: string, txHash: string) => void;
  clearWalletData: () => void;
}

export const useWalletDataStore = create<WalletDataState>((set) => ({
  // Initial state
  balances: {
    usdc: "0.00",
    usdt: "0.00",
    eth: "0.00",
  },
  estimatedTransfers: 0,
  gasPerTransfer: "0.001",
  transactions: [],
  currentPage: 1,
  hasMoreTransactions: false,
  
  // Set balances
  setBalances: (balances, gasInfo) =>
    set({
      balances,
      estimatedTransfers: gasInfo.estimatedTransfers,
      gasPerTransfer: gasInfo.gasPerTransfer,
    }),
  
  // Replace transactions (used for refresh or page 1)
  // Preserves optimistic transactions that haven't been persisted to DB yet
  setTransactions: (transactions, page, hasMore) =>
    set((state) => {
      // Get all transaction hashes from the new DB data
      const dbTxHashes = new Set(transactions.map(tx => tx.txHash));
      
      // Keep optimistic transactions that aren't in the DB yet
      // This includes both temp-* IDs and real hashes that haven't been saved yet
      const optimisticTxs = state.transactions.filter(tx => {
        // If it has a temp ID, it's definitely optimistic
        if (tx.id.startsWith('temp-')) return true;
        
        // If the txHash exists in DB, don't keep the optimistic version
        // (we'll use the DB version which has proper ID and metadata)
        if (dbTxHashes.has(tx.txHash)) return false;
        
        // If it has a real hash but not in DB, it's an in-flight transaction
        // Keep it if it was added recently (within last 30 seconds)
        const txAge = Date.now() - new Date(tx.createdAt).getTime();
        return txAge < 30000; // 30 second window
      });
      
      // Merge: optimistic first, then DB transactions (avoiding duplicates by txHash)
      const optimisticHashes = new Set(optimisticTxs.map(tx => tx.txHash));
      const uniqueDbTxs = transactions.filter(tx => !optimisticHashes.has(tx.txHash));
      
      const merged = [
        ...optimisticTxs,
        ...uniqueDbTxs,
      ];
      
      return {
        transactions: merged,
        currentPage: page,
        hasMoreTransactions: hasMore,
      };
    }),
  
  // Append transactions (used for loading more)
  appendTransactions: (newTransactions, hasMore) =>
    set((state) => {
      const existingIds = new Set(state.transactions.map(tx => tx.id));
      const uniqueNew = newTransactions.filter(tx => !existingIds.has(tx.id));
      return {
        transactions: [...state.transactions, ...uniqueNew],
        currentPage: state.currentPage + 1,
        hasMoreTransactions: hasMore,
      };
    }),
  
  // Add optimistic transaction (before txHash is available)
  addOptimisticTransaction: (transaction) =>
    set((state) => ({
      transactions: [transaction, ...state.transactions],
    })),
  
  // Update transaction status when confirmation changes
  updateTransactionStatus: (txHash, status, blockNumber) =>
    set((state) => ({
      transactions: state.transactions.map(tx =>
        tx.txHash === txHash
          ? { 
              ...tx, 
              status, 
              blockNumber: blockNumber || tx.blockNumber,
              confirmedAt: status === "CONFIRMED" ? new Date().toISOString() : tx.confirmedAt
            }
          : tx
      ),
    })),
  
  // Update transaction hash for optimistic transaction
  updateTransactionHash: (tempId, txHash) =>
    set((state) => ({
      transactions: state.transactions.map(tx =>
        tx.id === tempId ? { ...tx, id: txHash, txHash } : tx
      ),
    })),
  
  // Clear all wallet data (on logout)
  clearWalletData: () =>
    set({
      balances: { usdc: "0.00", usdt: "0.00", eth: "0.00" },
      estimatedTransfers: 0,
      gasPerTransfer: "0.001",
      transactions: [],
      currentPage: 1,
      hasMoreTransactions: false,
    }),
}));
