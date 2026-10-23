/**
 * Currency conversion utilities
 * Handles conversion between USD and other currencies
 */

export type Currency = 'HTG' | 'USD';

// Exchange rates (as of November 2024)
// Note: In production, these should be fetched from an API like exchangerate-api.com
const EXCHANGE_RATES = {
  HTG: 131.50, // 1 USD = ~131.50 Haitian Gourdes
} as const;

/**
 * Convert USD amount to Haitian Gourde (HTG)
 * @param usdAmount - Amount in USD
 * @returns Amount in HTG, formatted to 2 decimal places
 */
export function convertUSDToHTG(usdAmount: number | string): string {
  const amount = typeof usdAmount === 'string' ? parseFloat(usdAmount) : usdAmount;
  
  if (isNaN(amount)) {
    return '0.00';
  }

  const htgAmount = amount * EXCHANGE_RATES.HTG;
  return htgAmount.toFixed(2);
}

/**
 * Convert HTG amount to USD
 * @param htgAmount - Amount in HTG
 * @returns Amount in USD, formatted to 6 decimal places (USDC precision)
 */
export function convertHTGToUSD(htgAmount: number | string): string {
  const amount = typeof htgAmount === 'string' ? parseFloat(htgAmount) : htgAmount;
  
  if (isNaN(amount)) {
    return '0.000000';
  }

  const usdAmount = amount / EXCHANGE_RATES.HTG;
  // Use 6 decimals for USDC precision
  return usdAmount.toFixed(6);
}

/**
 * Convert amount between currencies
 * @param amount - Amount to convert
 * @param fromCurrency - Source currency
 * @param toCurrency - Target currency
 * @param decimals - Number of decimal places (default: 6 for USDC precision)
 * @returns Converted amount as string
 */
export function convertCurrency(
  amount: number | string,
  fromCurrency: Currency,
  toCurrency: Currency,
  decimals: number = 6
): string {
  if (fromCurrency === toCurrency) {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return isNaN(num) ? '0.000000' : num.toFixed(decimals);
  }

  if (fromCurrency === 'USD' && toCurrency === 'HTG') {
    // HTG uses 2 decimals
    return convertUSDToHTG(amount);
  }

  if (fromCurrency === 'HTG' && toCurrency === 'USD') {
    // USD/USDC uses 6 decimals
    return convertHTGToUSD(amount);
  }

  return '0.000000';
}

/**
 * Format amount in the given currency
 * @param amount - Amount to format
 * @param currency - Currency code
 * @param decimals - Number of decimal places (default: auto - 6 for USD, 2 for HTG)
 * @returns Formatted string with currency symbol
 */
export function formatCurrencyWithSymbol(
  amount: number | string,
  currency: Currency,
  decimals?: number
): string {
  // Use currency-appropriate decimals if not specified
  // USD uses 6 decimals (USDC precision), HTG uses 2 decimals
  const defaultDecimals = currency === 'USD' ? 6 : 2;
  const finalDecimals = decimals ?? defaultDecimals;
  
  const formatted = formatCurrency(amount, finalDecimals);
  
  switch (currency) {
    case 'USD':
      return `$${formatted}`;
    case 'HTG':
      return `${formatted} HTG`;
    default:
      return formatted;
  }
}

/**
 * Get currency symbol
 * @param currency - Currency code
 * @returns Currency symbol or code
 */
export function getCurrencySymbol(currency: Currency): string {
  switch (currency) {
    case 'USD':
      return '$';
    case 'HTG':
      return 'HTG';
    default:
      return currency;
  }
}

/**
 * Format currency amount with proper separators
 * @param amount - Amount to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted amount string
 */
export function formatCurrency(amount: number | string, decimals: number = 2): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(num)) {
    return '0.00';
  }

  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Get the exchange rate for a given currency
 * @param currency - Currency code (e.g., 'HTG')
 * @returns Exchange rate relative to USD
 */
export function getExchangeRate(currency: keyof typeof EXCHANGE_RATES): number {
  return EXCHANGE_RATES[currency];
}
