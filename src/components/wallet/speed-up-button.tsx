"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { 
  speedUpTransaction, 
  estimateSpeedupCost,
} from "@/lib/blockchain/gas-speedup";
import { useAuthStore } from "@/stores/auth-store";
import { getTransactionDetails } from "@/lib/blockchain/gas-speedup";

interface SpeedUpButtonProps {
  txHash: string;
  senderAddress?: string;
  onSuccess?: (newTxHash: string) => void;
  className?: string;
}

export function SpeedUpButton({ txHash, senderAddress, onSuccess, className = "" }: SpeedUpButtonProps) {
  const t = useTranslations('transactions.speedUp');
  const tCommon = useTranslations('common');
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedSpeed, setSelectedSpeed] = useState<'fast' | 'faster' | 'instant'>('fast');
  const [costEstimate, setCostEstimate] = useState<{
    currentGasCostETH: string;
    newGasCostETH: string;
    additionalCostETH: string;
    increasePercentage: string;
  } | null>(null);
  
  const user = useAuthStore((state) => state.user);

  const handleShowConfirm = async () => {
    // Check if this transaction is from current user
    if (senderAddress && user?.walletAddress) {
      if (senderAddress.toLowerCase() !== user.walletAddress.toLowerCase()) {
        toast.error(t('notYourTransaction'));
        return;
      }
    }
    
    // Check if transaction is still pending on blockchain (real-time check)
    setLoading(true);
    try {
      const txDetails = await getTransactionDetails(txHash as `0x${string}`);
      if (!txDetails || txDetails.blockNumber !== null) {
        // Transaction has been confirmed
        toast.error(t('alreadyConfirmed') || "Transaction has already been confirmed");
        setLoading(false);
        
        // Trigger refresh to update UI
        if (onSuccess) {
          onSuccess(txHash);
        }
        return;
      }
    } catch (error) {
      console.error("Error checking transaction status:", error);
      toast.error(t('failed'));
      setLoading(false);
      return;
    }
    setLoading(false);
    
    setShowConfirm(true);
    
    // Load cost estimate
    try {
      const estimate = await estimateSpeedupCost(txHash as `0x${string}`, { speedLevel: 'fast' });
      setCostEstimate(estimate);
    } catch (error) {
      console.error("Error estimating cost:", error);
      toast.error(t('estimateFailed'));
    }
  };

  const handleSelectSpeed = async (speed: 'fast' | 'faster' | 'instant') => {
    setSelectedSpeed(speed);
    
    // Update cost estimate for selected speed
    try {
      const estimate = await estimateSpeedupCost(txHash as `0x${string}`, { speedLevel: speed });
      setCostEstimate(estimate);
    } catch (error) {
      console.error("Error estimating cost:", error);
    }
  };

  const handleConfirm = async () => {
    if (!user?.walletAddress) {
      toast.error(t('walletNotFound'));
      return;
    }

    setLoading(true);

    try {
      // Verify transaction ownership
      const txDetails = await getTransactionDetails(txHash as `0x${string}`);
      if (txDetails.from.toLowerCase() !== user.walletAddress.toLowerCase()) {
        toast.error(t('notYourTransaction'));
        setLoading(false);
        return;
      }

      // This will require user to re-enter PIN to decrypt wallet
      // Import dynamically to avoid circular dependencies
      const { getWalletClientFromPIN } = await import("@/lib/blockchain/wallet");
      
      // Prompt for PIN via browser prompt (temporary solution)
      const pin = prompt(t('enterPin'));
      if (!pin) {
        setLoading(false);
        return;
      }

      const walletClient = await getWalletClientFromPIN(user.walletAddress, pin);

      // Speed up the transaction
      const result = await speedUpTransaction(
        walletClient,
        txHash as `0x${string}`,
        { speedLevel: selectedSpeed }
      );
      
      // Update database: mark old tx as replaced and create new tx record
      try {
        const updateResponse = await fetch("/api/wallet/speedup-transaction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionToken: useAuthStore.getState().sessionToken,
            oldTxHash: txHash,
            newTxHash: result.newTxHash,
          }),
        });

        if (!updateResponse.ok) {
          console.error("Failed to update transaction records:", await updateResponse.text());
        }
      } catch (updateError) {
        console.error("Failed to update transaction records:", updateError);
      }
      
      toast.success(t('success', { 
        increase: result.estimatedGasIncrease,
        txHash: result.newTxHash.slice(0, 10)
      }));

      // Reset state
      setShowConfirm(false);
      setLoading(false);

      // Notify parent
      if (onSuccess) {
        onSuccess(result.newTxHash);
      }
    } catch (error) {
      console.error("Error speeding up transaction:", error);
      const errorMsg = error instanceof Error ? error.message : t('failed');
      
      // If transaction was already confirmed, show specific message and refresh
      if (errorMsg.includes("already been confirmed") || errorMsg.includes("doesn't exist")) {
        toast.error(t('alreadyConfirmed') || "Transaction has already been confirmed");
        setShowConfirm(false);
        
        // Refresh transactions to update status
        if (onSuccess) {
          onSuccess(txHash); // Trigger refresh
        }
      } else {
        toast.error(errorMsg);
      }
      
      setLoading(false);
    }
  };

  const speedOptions = [
    { value: 'fast', label: t('fast'), boost: '+20%' },
    { value: 'faster', label: t('faster'), boost: '+50%' },
    { value: 'instant', label: t('instant'), boost: '+100%' },
  ] as const;

  if (showConfirm) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-card border border-default rounded-lg p-6 max-w-md w-full">
          <h3 className="text-lg font-semibold mb-4">{t('selectSpeed')}</h3>
          
          {costEstimate && (
            <div className="bg-background border border-default rounded-lg p-4 mb-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted">{t('currentGasCost')}:</span>
                <span className="font-mono">{parseFloat(costEstimate.currentGasCostETH).toFixed(9)} ETH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">{t('newGasCost')}:</span>
                <span className="font-mono">{parseFloat(costEstimate.newGasCostETH).toFixed(9)} ETH</span>
              </div>
              <div className="flex justify-between border-t border-default pt-2">
                <span className="text-muted font-medium">{t('additionalCost')}:</span>
                <span className="font-mono font-medium text-warning">
                  +{parseFloat(costEstimate.additionalCostETH).toFixed(9)} ETH
                </span>
              </div>
            </div>
          )}
          
          <div className="space-y-3 mb-6">
            {speedOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelectSpeed(option.value)}
                className={`w-full p-4 border rounded-lg transition text-left ${
                  selectedSpeed === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-default hover:border-primary hover:bg-primary/5'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">{option.label}</div>
                    <div className="text-sm text-muted">{t('gasIncrease')}: {option.boost}</div>
                  </div>
                  <div className="text-primary font-medium">{option.boost}</div>
                </div>
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowConfirm(false)}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-default rounded-lg hover:bg-card-muted transition disabled:opacity-50"
            >
              {tCommon('cancel')}
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? t('processing') : t('confirm')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleShowConfirm}
      disabled={loading}
      className={`text-sm text-primary hover:underline disabled:opacity-50 disabled:cursor-wait ${className}`}
    >
      {loading ? "⟳" : `${t('speedUp')} ⚡`}
    </button>
  );
}