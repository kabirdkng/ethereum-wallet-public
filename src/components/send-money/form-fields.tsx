"use client";

import { UseFormRegister, FieldErrors } from "react-hook-form";
import { useCurrencyStore } from "@/stores/currency-store";
import { convertCurrency } from "@/lib/currency";
import { ReactNode, useState } from "react";
import { useWalletDataStore } from "@/stores/wallet-data-store";
import { FaQrcode, FaPaste } from "react-icons/fa";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { QRScanner } from "./qr-scanner";

type SendFormData = {
  recipient: string;
  amount: string;
  pin: string;
};

interface SendMoneyFormFieldsProps {
  register: UseFormRegister<SendFormData>;
  errors: FieldErrors<SendFormData>;
  watchAmount: string;
  contactSelector?: ReactNode;
  setValue: (name: keyof SendFormData, value: string) => void;
}

export function SendMoneyFormFields({ register, errors, watchAmount, contactSelector, setValue }: SendMoneyFormFieldsProps) {
  const { selectedCurrency } = useCurrencyStore();
  const balances = useWalletDataStore((state) => state.balances);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const t = useTranslations('sendMoney.form');
  const tValidation = useTranslations('validation');
  const tToast = useTranslations('toast');
  
  // Convert the input amount to USDC equivalent
  const usdcEquivalent = watchAmount 
    ? convertCurrency(watchAmount, selectedCurrency, 'USD')
    : '0.00';
  
  // Get balance in selected currency
  const getBalanceInSelectedCurrency = (): number => {
    // Combine USDC + USDT balances (both are USD stablecoins)
    const totalUsdBalance = parseFloat(balances.usdc) + parseFloat(balances.usdt);
    
    if (selectedCurrency === 'HTG') {
      const htgBalance = convertCurrency(totalUsdBalance.toString(), 'USD', 'HTG');
      return parseFloat(htgBalance);
    }
    
    return totalUsdBalance;
  };
  
  const maxBalance = getBalanceInSelectedCurrency();
  const balanceDisplay = `${maxBalance.toFixed(selectedCurrency === 'USD' ? 3 : 0)} ${selectedCurrency}`;
  
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && /^0x[a-fA-F0-9]{40}$/.test(text)) {
        setValue("recipient", text);
        toast.success(tToast('addressPasted'));
      } else {
        toast.error(tToast('invalidAddressInClipboard'));
      }
    } catch (err) {
      console.error("Failed to read clipboard:", err);
      toast.error(tToast('clipboardError'));
    }
  };

  const handleQRScan = (address: string) => {
    setValue("recipient", address);
    setShowQRScanner(false);
    toast.success(tToast('addressScanned'));
  };
  
  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-foreground">{t('recipientLabel')}</label>
          {contactSelector}
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder="0x..."
            className="w-full px-4 py-3 pr-24 rounded-lg border border-default bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
            {...register("recipient", {
              required: tValidation('recipientRequired'),
              pattern: {
                value: /^0x[a-fA-F0-9]{40}$/,
                message: tValidation('invalidEthAddress'),
              },
            })}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
            <button
              type="button"
              onClick={() => setShowQRScanner(true)}
              className="p-2 hover:bg-card-muted rounded-lg transition text-muted hover:text-foreground"
              title={t('scanQRCode')}
            >
              <FaQrcode className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handlePaste}
              className="p-2 hover:bg-card-muted rounded-lg transition text-muted hover:text-foreground"
              title={t('pasteAddress')}
            >
              <FaPaste className="w-4 h-4" />
            </button>
          </div>
        </div>
        {errors.recipient && (
          <p className="text-danger text-sm mt-1">{errors.recipient.message}</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-foreground">
            {t('amountLabel', { currency: selectedCurrency })}
          </label>
          <span className="text-sm text-muted">
            {t('balance')}: {balanceDisplay}
          </span>
        </div>
        <input
          type="number"
          step={selectedCurrency === 'USD' ? '0.001' : '1'}
          placeholder="0.00"
          className="w-full px-4 py-3 rounded-lg border border-default bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-lg"
          {...register("amount", {
            required: tValidation('amountRequired'),
            min: { 
              value: selectedCurrency === 'USD' ? 0.001 : 1, 
              message: tValidation('minAmount', { 
                min: selectedCurrency === 'USD' ? '0.001' : '1', 
                currency: selectedCurrency 
              })
            },
            max: {
              value: maxBalance,
              message: tValidation('insufficientBalance', { 
                max: maxBalance.toFixed(selectedCurrency === 'USD' ? 3 : 0), 
                currency: selectedCurrency 
              })
            },
            validate: (value) => {
              const numValue = parseFloat(value);
              if (isNaN(numValue)) return tValidation('invalidAmount');
              if (numValue > maxBalance) {
                return tValidation('insufficientBalance', { 
                  max: maxBalance.toFixed(selectedCurrency === 'USD' ? 3 : 0), 
                  currency: selectedCurrency 
                });
              }
              return true;
            }
          })}
        />
        {errors.amount && (
          <p className="text-danger text-sm mt-1">{errors.amount.message}</p>
        )}
        {selectedCurrency !== 'USD' && watchAmount && parseFloat(watchAmount) > 0 && (
          <p className="text-muted text-sm mt-1">
            {t('usdcEquivalent', { amount: usdcEquivalent })}
          </p>
        )}
      </div>

      {/* QR Code Scanner Modal */}
      {showQRScanner && (
        <QRScanner
          onScan={handleQRScan}
          onClose={() => setShowQRScanner(false)}
        />
      )}
    </>
  );
}
