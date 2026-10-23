"use client";

import { useCurrencyStore } from "@/stores/currency-store";
import { convertCurrency, formatCurrencyWithSymbol } from "@/lib/currency";
import type { GasEstimate } from "@/lib/blockchain/aa/multicall";

interface FeeBreakdownProps {
  recipientAmount: string;
  platformFee: string;
  gasFee: string;
  totalFees: string;
  totalDeducted: string;
  gasEstimate?: GasEstimate | null;
  compact?: boolean;
}

export function FeeBreakdown({ 
  recipientAmount, 
  platformFee,
  gasFee,
  totalFees,
  totalDeducted,
  gasEstimate,
  compact = false,
}: FeeBreakdownProps) {
  const platformFeePercentage = parseFloat(process.env.NEXT_PUBLIC_PLATFORM_FEE_PERCENTAGE || "1.5");
  const hasFees = parseFloat(totalFees) > 0;
  const { selectedCurrency } = useCurrencyStore();
  
  // Convert USD amounts to selected currency for display
  const recipientInCurrency = convertCurrency(recipientAmount, 'USD', selectedCurrency);
  const platformFeeInCurrency = convertCurrency(platformFee, 'USD', selectedCurrency);
  const gasFeeInCurrency = convertCurrency(gasFee, 'USD', selectedCurrency);
  const totalFeesInCurrency = convertCurrency(totalFees, 'USD', selectedCurrency);
  const totalInCurrency = convertCurrency(totalDeducted, 'USD', selectedCurrency);
  
  return (
    <div className="bg-card-muted rounded-lg p-4 border border-subtle space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted">Amount to send</span>
        <span className="text-foreground font-medium font-mono">{formatCurrencyWithSymbol(recipientInCurrency, selectedCurrency)}</span>
      </div>
      {hasFees && (
        <>
          <div className="flex justify-between text-sm">
            <span className="text-muted">+ Platform fee ({platformFeePercentage}%)</span>
            <span className="text-muted-foreground font-mono">+{formatCurrencyWithSymbol(platformFeeInCurrency, selectedCurrency)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted">+ Gas fee (sponsored)</span>
            <span className="text-muted-foreground font-mono">+{formatCurrencyWithSymbol(gasFeeInCurrency, selectedCurrency)}</span>
          </div>
          <div className="flex justify-between text-xs text-primary/70">
            <span>Total fees</span>
            <span className="font-mono">{formatCurrencyWithSymbol(totalFeesInCurrency, selectedCurrency)}</span>
          </div>
        </>
      )}
      <div className="border-t border-subtle pt-2 flex justify-between font-medium">
        <span className="text-foreground">Total deducted</span>
        <span className={`text-foreground font-mono ${compact ? 'text-base' : 'text-lg'}`}>{formatCurrencyWithSymbol(totalInCurrency, selectedCurrency)}</span>
      </div>
      
      {/* Gas details */}
      {gasEstimate && (
        <div className="border-t border-subtle pt-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-primary">⚡</span>
            <span className="text-muted">Gas: {gasEstimate.totalGasLimit.toLocaleString()} units</span>
          </div>
          <div className="mt-1 text-xs text-muted pl-5">
            Source: {gasEstimate.source === 'alchemy' ? 'Alchemy optimized' : 'Estimated'}
          </div>
        </div>
      )}
    </div>
  );
}