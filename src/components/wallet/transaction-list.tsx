import { useTranslations } from "next-intl";
import { TransactionItem } from "./transaction-item";

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

interface TransactionListProps {
  transactions: Transaction[];
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
}

export function TransactionList({ 
  transactions, 
  hasMore, 
  onLoadMore, 
  loadingMore
}: TransactionListProps) {
  const t = useTranslations('transactions');
  
  if (transactions.length === 0) {
    return (
      <div className="bg-card-muted rounded-lg p-8 text-center border border-subtle">
        <svg
          className="w-12 h-12 mx-auto mb-3 text-muted"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        <p className="text-muted">{t('noTransactions')}</p>
        <p className="text-sm text-muted mt-1">
          {t('noTransactionsDescription')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {transactions.map((tx) => (
        <TransactionItem 
          key={tx.id} 
          transaction={tx}
        />
      ))}
      
      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="w-full bg-card-muted text-foreground py-3 rounded-lg font-medium hover:bg-card border border-default transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loadingMore ? t('loading') : t('loadMore')}
        </button>
      )}
    </div>
  );
}
