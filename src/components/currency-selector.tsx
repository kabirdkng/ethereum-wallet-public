"use client";

import { useCurrencyStore, type Currency } from "@/stores/currency-store";

export function CurrencySelector() {
  const { selectedCurrency, setSelectedCurrency } = useCurrencyStore();

  const currencies: Currency[] = ['HTG', 'USD'];

  return (
    <div className="inline-flex items-center gap-0.5 bg-card border border-default rounded-md p-0.5 shadow-sm">
      {currencies.map((currency) => (
        <button
          key={currency}
          onClick={() => setSelectedCurrency(currency)}
          className={`px-2 py-1 rounded text-xs font-medium transition-all ${
            selectedCurrency === currency
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-muted hover:text-foreground hover:bg-card-muted'
          }`}
        >
          {currency}
        </button>
      ))}
    </div>
  );
}
