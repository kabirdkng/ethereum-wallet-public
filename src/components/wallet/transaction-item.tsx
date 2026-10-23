"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useCurrencyStore } from "@/stores/currency-store";
import { convertCurrency, formatCurrencyWithSymbol } from "@/lib/currency";

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

interface TransactionItemProps {
  transaction: Transaction;
}

export function TransactionItem({ transaction: tx }: TransactionItemProps) {
  const t = useTranslations('transactions');
  const network = process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "" : "sepolia.";
  const explorerUrl = `https://${network}etherscan.io/tx/${tx.txHash}`;
  const { selectedCurrency } = useCurrencyStore();
  
  // Convert USD amount to selected currency
  const convertedAmount = convertCurrency(tx.amount, 'USD', selectedCurrency);
  const usdAmount = tx.amount;
  
  // Calculate total fees (platform fee + gas fee) and convert to selected currency
  const totalFees = useMemo(() => {
    const platformFeeAmount = tx.platformFee ? parseFloat(tx.platformFee) : 0;
    const gasFeeAmount = tx.gasFee ? parseFloat(tx.gasFee) : 0;
    const total = platformFeeAmount + gasFeeAmount;
    return total > 0 ? total : null;
  }, [tx.platformFee, tx.gasFee]);
  
  const convertedTotalFee = totalFees
    ? convertCurrency(totalFees.toFixed(6), 'USD', selectedCurrency)
    : null;
  
  return (
    <div className="bg-card border border-default rounded-lg p-4 hover:bg-card-muted transition">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              tx.type === "SEND"
                ? "bg-danger/10 text-danger"
                : "bg-success/10 text-success"
            }`}
          >
            {tx.type === "SEND" ? "↑" : "↓"}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-foreground">
              {tx.type === "SEND" ? t('sentMoney') : t('receivedMoney')}
            </div>
            <div className="text-sm text-muted truncate">
              {tx.type === "SEND" 
                ? `${t('to')}: ${tx.recipientAddress?.slice(0, 10)}...${tx.recipientAddress?.slice(-8)}`
                : `${t('from')}: ${tx.senderAddress?.slice(0, 10)}...${tx.senderAddress?.slice(-8)}`
              }
            </div>
            {tx.type === "SEND" && convertedTotalFee && (
              <div className="text-xs text-muted mt-1">
                {t('platformFee')}: {formatCurrencyWithSymbol(convertedTotalFee, selectedCurrency)}
              </div>
            )}
            <div className="text-xs text-muted mt-1">
              {tx.confirmedAt 
                ? new Date(tx.confirmedAt).toLocaleString()
                : new Date(tx.createdAt).toLocaleString()
              }
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className={`font-medium ${
            tx.type === "RECEIVE" ? "text-success" : "text-danger"
          }`}>
            {tx.type === "SEND" ? "-" : "+"}
            {formatCurrencyWithSymbol(convertedAmount, selectedCurrency)}
          </div>
          {selectedCurrency !== 'USD' && (
            <div className={`text-xs mt-0.5 ${
              tx.type === "RECEIVE" ? "text-success" : "text-danger"
            }`}>
              ${parseFloat(usdAmount).toFixed(2)} USD
            </div>
          )}
          <div
            className={`text-xs mt-1 ${
              tx.status === "CONFIRMED"
                ? "text-success"
                : tx.status === "PENDING"
                ? "text-warning"
                : "text-danger"
            }`}
          >
            {t(`status.${tx.status.toLowerCase()}`)}
          </div>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline mt-1 inline-block"
          >
            {t('viewOnExplorer')} ↗
          </a>
        </div>
      </div>
    </div>
  );
}
