import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Currency = 'HTG' | 'USD';

interface CurrencyState {
  selectedCurrency: Currency;
  setSelectedCurrency: (currency: Currency) => void;
}

export const useCurrencyStore = create<CurrencyState>()(
  persist(
    (set) => ({
      selectedCurrency: 'HTG',
      setSelectedCurrency: (currency) => set({ selectedCurrency: currency }),
    }),
    {
      name: 'currency-storage',
    }
  )
);
