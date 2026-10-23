"use client";

import { useCurrencyStore } from "@/stores/currency-store";
import { convertCurrency, formatCurrency, getCurrencySymbol } from "@/lib/currency";

interface BalanceCardProps {
  label: string;
  amount: string;
  isLoading: boolean;
  breakdown?: {
    usdc: string;
    usdt: string;
  };
}

export function BalanceCard({ label, amount, isLoading, breakdown }: BalanceCardProps) {
  const { selectedCurrency } = useCurrencyStore();
  
  // Convert USD to selected currency
  const convertedAmount = convertCurrency(amount, 'USD', selectedCurrency);
  // Use appropriate decimals for each currency (2 for HTG, 6 for USD)
  const decimals = selectedCurrency === 'USD' ? 6 : 2;
  const formattedAmount = formatCurrency(convertedAmount, decimals);
  const formattedUSD = formatCurrency(amount, 6); // USD always uses 6 decimals for USDC precision
  const currencySymbol = getCurrencySymbol(selectedCurrency);

  return (
    // Use global card background/colors from globals.css for consistent theming
    <div className={`bg-card rounded-lg p-6 text-foreground shadow-card relative`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="text-sm opacity-90 mb-1">{label}</div>
          <div className="flex flex-col">
            <div className="text-3xl font-bold text-foreground">
              {isLoading ? "..." : selectedCurrency === 'USD' 
                ? `$${formattedAmount}`
                : `${formattedAmount} ${currencySymbol}`
              }
            </div>
            {selectedCurrency !== 'USD' && (
              <div className="text-xs text-muted mt-1">
                {isLoading ? "" : `$${formattedUSD} USD`}
              </div>
            )}
          </div>
        </div>
        
        {breakdown && !isLoading && (
          <div className="text-right text-xs text-muted mt-1">
            <div className="mb-1">USDC: {formatCurrency(breakdown.usdc, 6)}</div>
            <div>USDT: {formatCurrency(breakdown.usdt, 6)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
