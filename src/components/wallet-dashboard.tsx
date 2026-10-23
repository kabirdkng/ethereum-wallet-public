"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import { useWalletEvents } from "@/hooks/useWalletEvents";
import { useWalletBalances } from "@/hooks/useWalletBalances";
import { useWalletTransactions } from "@/hooks/useWalletTransactions";
import { useTransactionStatusPoller } from "@/hooks/useTransactionStatusPoller";
import { BalanceCard } from "@/components/wallet/balance-card";
// import { ETHGasInfo } from "@/components/wallet/eth-gas-info";
import { TransactionList } from "@/components/wallet/transaction-list";
import { ReceiveModal } from "@/components/wallet/receive-modal";
import { RecoveryWarningBanner } from "@/components/recovery-warning-banner";

interface WalletDashboardProps {
  address?: string;
  onSendMoney: () => void;
  onSetupRecovery?: () => void;
  refreshTrigger?: number;
}

export default function WalletDashboard({ onSendMoney, onSetupRecovery, refreshTrigger }: WalletDashboardProps) {
  const t = useTranslations('wallet');
  const tCommon = useTranslations('common');
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const fetchedRef = useRef(false);
  const [syncing, setSyncing] = useState(false);
  const sessionToken = useAuthStore((state) => state.sessionToken);
  const user = useAuthStore((state) => state.user);
  
  // CRITICAL: Only use smart wallet address, never show EOA to users
  // If smart wallet address is not available, auto-sync it
  const displayAddress = user?.smartWalletAddress || ""; // Use empty string to avoid hook conditional calls
  
  const { 
    balances, 
    //estimatedTransfers, 
    //gasPerTransfer, 
    fetchingBalances,
    error, 
    fetchBalances 
  } = useWalletBalances(displayAddress, sessionToken);

  const {
    transactions,
    fetchingTransactions,
    hasMoreTransactions,
    loadingMore,
    fetchTransactions,
    handleLoadMore,
  } = useWalletTransactions(displayAddress, sessionToken);

  // Poll transaction statuses for real-time updates
  useTransactionStatusPoller({
    enabled: !!displayAddress,
    walletAddress: displayAddress,
    interval: 5000, // Poll every 5 seconds
  });

  // Create stable function references for polling
  const fetchBalancesRef = useRef<(forceRefresh?: boolean) => Promise<void>>(async () => {});
  const fetchTransactionsRef = useRef<(page?: number, replace?: boolean, syncBlockchain?: boolean) => Promise<void>>(async () => {});
  const sseUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  fetchBalancesRef.current = fetchBalances;
  fetchTransactionsRef.current = fetchTransactions;

  const handlePollingUpdate = useCallback(() => {
    // Debounce SSE updates to prevent race conditions with manual refreshes
    if (sseUpdateTimeoutRef.current) {
      clearTimeout(sseUpdateTimeoutRef.current);
    }
    
    // Add small delay to ensure DB transaction is committed and cache is invalidated
    sseUpdateTimeoutRef.current = setTimeout(() => {
      // Always fetch transactions from DB (cache should already be invalidated by Prisma extension)
      fetchTransactionsRef.current(1, true, false);
      // Force refresh balances to get updated balance after new transaction
      fetchBalancesRef.current(true);
    }, 200); // 200ms delay to ensure cache invalidation has completed
  }, []);

  // Use Server-Sent Events for real-time updates
  useWalletEvents({
    sessionToken,
    enabled: !!sessionToken && !!displayAddress,
    onTransactionUpdate: handlePollingUpdate,
    onBalanceUpdate: handlePollingUpdate,
  });

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (sseUpdateTimeoutRef.current) {
        clearTimeout(sseUpdateTimeoutRef.current);
      }
    };
  }, []);

  // Auto-sync smart wallet address if missing
  useEffect(() => {
    if (!user?.smartWalletAddress && user?.walletAddress && sessionToken && !syncing) {
      console.warn("⚠️ Smart wallet address missing, attempting to sync...");
      setSyncing(true);
      
      fetch("/api/wallet/sync-smart-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken }),
      })
        .then(async (response) => {
          if (response.ok) {
            const data = await response.json();
            console.log("✅ Smart wallet synced:", data.smartWalletAddress);
            useAuthStore.getState().updateUser({ smartWalletAddress: data.smartWalletAddress });
          } else {
            console.error("Failed to sync smart wallet");
          }
        })
        .catch((err) => {
          console.error("Error syncing smart wallet:", err);
        })
        .finally(() => {
          setSyncing(false);
        });
    }
  }, [user?.smartWalletAddress, user?.walletAddress, sessionToken, syncing]);

  // Fetch data on mount - use cache for instant load
  useEffect(() => {
    if (!displayAddress || !sessionToken) return;
    
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      
      // Check if we already have data in the store (from cache or previous fetch)
      const hasBalanceData = balances.usdc !== "0.00" || balances.usdt !== "0.00" || balances.eth !== "0.00";
      const hasTransactionData = transactions.length > 0;
      
      // Use cache (fast) if we don't have data in store
      // This makes tab switching instant after initial load
      if (!hasBalanceData) {
        fetchBalances(false); // Use cache
      }
      
      if (!hasTransactionData) {
        fetchTransactions(1, false, false); // Use cache, don't sync blockchain
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayAddress, sessionToken]);

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      fetchTransactions(1, true, true); // Enable blockchain sync when refreshing
      fetchBalances(true); // Force refresh after sending money
      
      setTimeout(() => {
        fetchTransactions(1, true, true);
      }, 15000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);
  
  // Show loading/error state if smart wallet address is missing (after all hooks)
  if (!displayAddress) {
    if (syncing) {
      // Show loading state while syncing smart wallet
      return (
        <div className="bg-card rounded-lg border border-subtle shadow-card p-6">
          <div className="text-center py-8">
            <div className="text-4xl mb-4">⏳</div>
            <h2 className="text-xl font-bold text-foreground mb-2">
              {t('loading.syncingWallet') || 'Setting up your wallet...'}
            </h2>
            <p className="text-muted mb-4">
              {t('loading.calculatingAddress') || 'Please wait while we configure your smart wallet address.'}
            </p>
          </div>
        </div>
      );
    }
    
    // Only show error if user has no wallet at all
    if (!user?.walletAddress) {
      return (
        <div className="bg-card rounded-lg border border-subtle shadow-card p-6">
          <div className="text-center py-8">
            <div className="text-error text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-foreground mb-2">
              {t('errors.walletSetupIncomplete') || 'Wallet Setup Incomplete'}
            </h2>
            <p className="text-muted mb-4">
              {t('errors.noWalletAddress') || 'No wallet address found. Please create a wallet first.'}
            </p>
          </div>
        </div>
      );
    }
    
    // Fallback: show generic loading (sync should be in progress)
    return (
      <div className="bg-card rounded-lg border border-subtle shadow-card p-6">
        <div className="text-center py-8">
          <div className="text-4xl mb-4">⏳</div>
          <h2 className="text-xl font-bold text-foreground mb-2">
            {t('loading.loadingWallet') || 'Loading wallet...'}
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Recovery Warning Banner - only shows if no recovery methods configured */}
      <RecoveryWarningBanner onSetupRecovery={onSetupRecovery} />
      
      {error && (
        <div className="bg-danger/10 border border-danger rounded-lg p-4 text-danger text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => fetchBalances(true)}
            disabled={fetchingBalances}
            className="text-xs underline hover:no-underline"
          >
            {tCommon('retry')}
          </button>
        </div>
      )}
      
      <BalanceCard
        label={t('walletBalance')}
        amount={(parseFloat(balances.usdc) + parseFloat(balances.usdt)).toFixed(6)}
        isLoading={fetchingBalances}
        breakdown={{
          usdc: balances.usdc,
          usdt: balances.usdt,
        }}
      />

      {/* <ETHGasInfo
        ethBalance={balances.eth}
        estimatedTransfers={estimatedTransfers}
        gasPerTransfer={gasPerTransfer}
        isLoading={fetchingBalances}
      /> */}

      <div className="flex gap-3">
        <button
          onClick={onSendMoney}
          className="flex-1 bg-primary text-on-primary py-3 rounded-lg font-medium hover:bg-primary-hover shadow-card transition"
        >
          {t('send')}
        </button>
        <button 
          onClick={() => setShowReceiveModal(true)}
          className="flex-1 bg-card-muted text-foreground py-3 rounded-lg font-medium hover:bg-card border border-default transition"
        >
          {t('receive')}
        </button>
        <button
          onClick={() => {
            fetchBalances(true);
            fetchTransactions(1, true, true);
          }}
          disabled={fetchingBalances || fetchingTransactions}
          className="bg-card-muted text-foreground px-4 py-3 rounded-lg font-medium hover:bg-card border border-default transition disabled:opacity-50 disabled:cursor-not-allowed"
          title="Refresh balances and transactions from blockchain"
        >
          {(fetchingBalances || fetchingTransactions) ? "⟳" : "↻"}
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-foreground">{t('transactions')}</h3>
          {fetchingTransactions && (
            <span className="text-xs text-muted">Syncing...</span>
          )}
        </div>
        <TransactionList
          transactions={transactions}
          hasMore={hasMoreTransactions}
          onLoadMore={handleLoadMore}
          loadingMore={loadingMore}
        />
      </div>

      <ReceiveModal
        address={displayAddress || ""}
        isOpen={showReceiveModal}
        onClose={() => setShowReceiveModal(false)}
      />
    </div>
  );
}
