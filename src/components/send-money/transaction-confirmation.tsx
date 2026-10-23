"use client";

import { UseFormRegister, FieldErrors } from "react-hook-form";
import { useTranslations } from "next-intl";
import { useCurrencyStore } from "@/stores/currency-store";
import { convertCurrency, formatCurrencyWithSymbol } from "@/lib/currency";

type SendFormData = {
  recipient: string;
  amount: string;
  pin: string;
};

interface TransactionConfirmationProps {
  formData: {
    recipient: string;
    amount: string;
  };
  feeBreakdown: {
    recipientAmount: string;
    platformFee: string;
    gasFee: string;
    totalFees: string;
    totalDeducted: string;
  };
  ethBalance?: string;
  gasCostInfo?: {
    gasCostETH: string;
    gasEstimate: string;
    batched: boolean;
  } | null;
  register: UseFormRegister<SendFormData>;
  errors: FieldErrors<SendFormData>;
  loading: boolean;
  error: string | null;
  approvalStatus?: 'building' | 'signing' | 'submitting' | 'confirming' | null;
  onBack: () => void;
  onSubmit: () => void;
}

export function TransactionConfirmation({
  formData,
  feeBreakdown,
  // ethBalance,
  // gasCostInfo,
  register,
  errors,
  loading,
  error,
  approvalStatus,
  onBack,
  onSubmit,
}: TransactionConfirmationProps) {
  const t = useTranslations('sendMoney.confirmation');
  const tButtons = useTranslations('buttons');
  const tStatus = useTranslations('status');
  const tValidation = useTranslations('validation');

  const platformFeePercentage = parseFloat(process.env.NEXT_PUBLIC_PLATFORM_FEE_PERCENTAGE || "1.5");
  const { selectedCurrency } = useCurrencyStore();
  
  // Convert USD amounts to selected currency for display
  const recipientInCurrency = convertCurrency(feeBreakdown.recipientAmount, 'USD', selectedCurrency);
  const platformFeeInCurrency = convertCurrency(feeBreakdown.platformFee, 'USD', selectedCurrency);
  const gasFeeInCurrency = convertCurrency(feeBreakdown.gasFee, 'USD', selectedCurrency);
  const totalFeesInCurrency = convertCurrency(feeBreakdown.totalFees, 'USD', selectedCurrency);
  const totalInCurrency = convertCurrency(feeBreakdown.totalDeducted, 'USD', selectedCurrency);
  
  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2 text-foreground">{t('title')}</h2>
        <p className="text-muted">{t('description')}</p>
      </div>

      <div className="bg-card-muted rounded-lg p-6 space-y-4 border border-subtle">
        <div className="flex justify-between">
          <span className="text-muted">{t('recipient')}</span>
          <span className="font-mono text-xs text-foreground break-all max-w-[200px]">{formData.recipient}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-muted">{t('amountToSend')}</span>
          <span className="font-medium text-foreground">{formatCurrencyWithSymbol(recipientInCurrency, selectedCurrency)}</span>
        </div>
        
        {parseFloat(feeBreakdown.platformFee) > 0 && (
          <div className="flex justify-between">
            <span className="text-muted">{t('platformFee', { percentage: platformFeePercentage })}</span>
            <span className="font-medium text-muted-foreground">+{formatCurrencyWithSymbol(platformFeeInCurrency, selectedCurrency)}</span>
          </div>
        )}
        
        {parseFloat(feeBreakdown.gasFee) > 0 && (
          <div className="flex justify-between">
            <span className="text-muted">{t('gasFee')}</span>
            <span className="font-medium text-muted-foreground">+{formatCurrencyWithSymbol(gasFeeInCurrency, selectedCurrency)}</span>
          </div>
        )}
        
        {parseFloat(feeBreakdown.totalFees) > 0 && (
          <div className="flex justify-between text-xs text-primary/70 mt-1">
            <span>{t('totalFees')}</span>
            <span>{formatCurrencyWithSymbol(totalFeesInCurrency, selectedCurrency)}</span>
          </div>
        )}
        
        <div className="border-t border-subtle pt-4 flex justify-between font-bold">
          <span className="text-foreground">{t('totalDeducted')}</span>
          <span className="text-foreground">{formatCurrencyWithSymbol(totalInCurrency, selectedCurrency)}</span>
        </div>
        
      </div>

      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium mb-2 text-foreground">{t('enterPin')}</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            placeholder={t('pinPlaceholder')}
            className="w-full px-4 py-3 rounded-lg border border-default bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-center text-2xl tracking-widest"
            {...register("pin", {
              required: tValidation('required'),
              pattern: {
                value: /^\d{6}$/,
                message: tValidation('pin6Digits'),
              },
            })}
          />
          {errors.pin && (
            <p className="text-danger text-sm mt-1">{errors.pin.message}</p>
          )}
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger rounded-lg px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {approvalStatus && (
          <div className="bg-primary/10 border border-primary rounded-lg px-4 py-3 text-sm text-primary">
            {approvalStatus === 'building' && `🔨 ${tStatus('buildingUserOp')}`}
            {approvalStatus === 'signing' && `✍️  ${tStatus('signing')}`}
            {approvalStatus === 'submitting' && `📤 ${tStatus('submitting')}`}
            {approvalStatus === 'confirming' && `⏳ ${tStatus('confirming')}`}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={loading}
            className="flex-1 bg-card-muted text-foreground py-3 rounded-lg font-medium hover:bg-card border border-default disabled:opacity-50 transition"
          >
            {tButtons('back')}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-primary text-on-primary py-3 rounded-lg font-medium hover:bg-primary-hover disabled:opacity-50 shadow-card transition"
          >
            {loading ? (
              approvalStatus === 'building' ? tStatus('building') :
              approvalStatus === 'signing' ? tStatus('signing') :
              approvalStatus === 'submitting' ? tStatus('submitting') :
              approvalStatus === 'confirming' ? tStatus('confirming') :
              tStatus('processing')
            ) : tButtons('confirmAndSend')}
          </button>
        </div>
      </form>
    </div>
  );
}
