"use client";

import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { getWalletClientFromPIN } from "@/lib/blockchain/wallet";
import { sendUSDCSmart } from "@/lib/blockchain/smart-transfer";
import { calculateTotalFeesWithGas } from "@/lib/blockchain/aa/gasFees";
import { useAuthStore } from "@/stores/auth-store";
import { useCurrencyStore } from "@/stores/currency-store";
import { convertCurrency, formatCurrencyWithSymbol } from "@/lib/currency";
import { getPlatformFeeRecipient } from "@/config/env";
import { SendMoneyFormFields } from "@/components/send-money/form-fields";
import { FeeBreakdown } from "@/components/send-money/fee-breakdown";
import { TransactionConfirmation } from "@/components/send-money/transaction-confirmation";
import { useContacts } from "@/hooks/useContacts";
import { ContactPickerModal } from "@/components/contacts/contact-picker-modal";
import { SaveContactPrompt } from "@/components/contacts/save-contact-prompt";
import { GasSpeedSelector, GAS_MULTIPLIERS, type GasSpeed } from "@/components/send-money/gas-speed-selector";
import { useWalletDataStore } from "@/stores/wallet-data-store";
import type { GasEstimate } from "@/lib/blockchain/aa/multicall";

type SendFormData = {
  recipient: string;
  amount: string;
  pin: string;
};

interface SendMoneyProps {
  onSuccess?: (txHash: string) => void;
  onCancel?: () => void;
  initialRecipient?: string;
}

export default function SendMoney({ onSuccess, onCancel, initialRecipient }: SendMoneyProps) {
  const t = useTranslations('send');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const tContacts = useTranslations('contacts');
  const tGas = useTranslations('wallet.ethGas');
  const [loading, setLoading] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<'building' | 'signing' | 'submitting' | 'confirming' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPinStep, setShowPinStep] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [gasSpeed, setGasSpeed] = useState<GasSpeed>('normal');
  const [gasEstimate, setGasEstimate] = useState<GasEstimate | null>(null);
  const [modalClosed, setModalClosed] = useState(false); // Track if modal was closed after submission
  const [feeBreakdownData, setFeeBreakdownData] = useState<{
    recipientAmount: string;
    platformFee: string;
    gasFee: string;
    totalFees: string;
    totalDeducted: string;
  } | null>(null);
  const user = useAuthStore((state) => state.user);
  const sessionToken = useAuthStore((state) => state.sessionToken);
  const { selectedCurrency } = useCurrencyStore();
  const { contacts, addContact, findContactByAddress } = useContacts();
  const { balances } = useWalletDataStore();

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<SendFormData>();

  // Set initial recipient if provided
  useEffect(() => {
    if (initialRecipient) {
      setValue("recipient", initialRecipient);
    }
  }, [initialRecipient, setValue]);

  const watchAmount = watch("amount");
  const watchRecipient = watch("recipient");
  
  // Convert input amount to USD (if needed) for fee calculation
  const usdAmount = useMemo(() => {
    if (!watchAmount || parseFloat(watchAmount) <= 0) return "0";
    return convertCurrency(watchAmount, selectedCurrency, 'USD');
  }, [watchAmount, selectedCurrency]);
  
  // Calculate fees with gas (always use AA)
  useEffect(() => {
    if (!usdAmount || parseFloat(usdAmount) <= 0) {
      setFeeBreakdownData(null);
      setGasEstimate(null);
      return;
    }

    let isMounted = true;

    async function calculateFees() {
      try {
        const fees = await calculateTotalFeesWithGas(
          usdAmount,
          {
            gasMultiplier: GAS_MULTIPLIERS[gasSpeed],
          }
        );

        if (isMounted) {
          setFeeBreakdownData({
            recipientAmount: fees.recipientAmount,
            platformFee: fees.platformFee,
            gasFee: fees.gasFee,
            totalFees: fees.totalFees,
            totalDeducted: fees.totalDeducted,
          });
        }
      } catch (error) {
        console.error("Error calculating fees:", error);
        if (isMounted) {
          setFeeBreakdownData(null);
        }
      }
    }

    calculateFees();

    return () => {
      isMounted = false;
    };
  }, [usdAmount, gasSpeed]);
  
  // Legacy fee calculation for compatibility (will be replaced by feeBreakdownData)
  const feeCalculation = useMemo(() => {
    if (!feeBreakdownData) {
      return { feeAmount: "0", recipientAmount: "0", totalDeducted: "0", feePercentage: 0 };
    }
    return {
      feeAmount: feeBreakdownData.platformFee,
      recipientAmount: feeBreakdownData.recipientAmount,
      totalDeducted: feeBreakdownData.totalDeducted,
      feePercentage: parseFloat(process.env.NEXT_PUBLIC_PLATFORM_FEE_PERCENTAGE || "1.5"),
    };
  }, [feeBreakdownData]);
  
  // Check if user has sufficient balance and prepare display strings in selected currency
  const { insufficientBalance, displayRequired, displayAvailable } = useMemo(() => {
    if (!feeBreakdownData || !balances) return { insufficientBalance: false, displayRequired: null, displayAvailable: null };

    // feeBreakdownData values are in USD. balances.usdc is token amount (USDC ~= USD)
    const totalDeducted = parseFloat(feeBreakdownData.totalDeducted);
    const usdcBalance = parseFloat(balances.usdc);

    const insufficient = totalDeducted > usdcBalance;

    // Convert amounts to selected currency for display
    const requiredInSelected = formatCurrencyWithSymbol(
      convertCurrency(feeBreakdownData.totalDeducted, 'USD', selectedCurrency),
      selectedCurrency
    );

    const availableInSelected = formatCurrencyWithSymbol(
      convertCurrency(balances.usdc, 'USD', selectedCurrency),
      selectedCurrency
    );

    return { insufficientBalance: insufficient, displayRequired: requiredInSelected, displayAvailable: availableInSelected };
  }, [feeBreakdownData, balances, selectedCurrency]);
  
  const platformFeeRecipient = getPlatformFeeRecipient();

  // // Fetch ETH balance and gas cost estimate on mount
  // useEffect(() => {
  //   const fetchEthInfo = async () => {
  //     if (!user?.walletAddress) return;
      
  //     try {
  //       const balance = await getETHBalance(user.walletAddress as `0x${string}`);
  //       setEthBalance(balance);
        
  //       // Get gas cost estimate based on whether we have a platform fee
  //       const hasFee = parseFloat(feeCalculation.feeAmount) > 0;
  //       const gasInfo = await getGasCostBreakdown(hasFee);
  //       setGasCostInfo(gasInfo);
  //     } catch (err) {
  //       console.error("Error fetching ETH info:", err);
  //     }
  //   };
    
  //   fetchEthInfo();
  // }, [user?.walletAddress, feeCalculation.feeAmount]);

  const onSubmitForm = async () => {
    // Check if recipient is not in contacts
    const recipientAddress = watch("recipient")?.toLowerCase();
    if (recipientAddress && !findContactByAddress(recipientAddress)) {
      setShowSavePrompt(true);
    } else {
      setShowPinStep(true);
    }
  };

  const handleContactSelect = (contact: typeof contacts[0]) => {
    setValue("recipient", contact.walletAddress);
    setShowContactPicker(false);
    toast.success(`${tContacts('selectedContact')}: ${contact.name}`);
  };

  const handleSaveContact = async (name: string) => {
    try {
      await addContact({
        name,
        walletAddress: watchRecipient,
      });
      toast.success(tContacts('contactAdded'));
    } catch (err) {
      console.error("Error saving contact:", err);
    }
    setShowSavePrompt(false);
    setShowPinStep(true);
  };

  const handleSkipSave = () => {
    setShowSavePrompt(false);
    setShowPinStep(true);
  };

  const handleConfirm = async (data: SendFormData) => {
    // Convert input amount to USD for the transaction
    const usdAmountToSend = convertCurrency(data.amount, selectedCurrency, 'USD');
    
    if (!user?.walletAddress) {
      setError(t('errors.walletNotFound') || "Wallet address not found");
      return;
    }
    
    // CRITICAL: Ensure smart wallet address exists, calculate if missing
    let smartWalletAddress = user.smartWalletAddress;
    
    if (!smartWalletAddress) {
      console.warn("⚠️ Smart wallet address missing, attempting to sync...");
      setLoading(true);
      
      try {
        // Call sync endpoint to calculate and save smart wallet address
        const syncResponse = await fetch("/api/wallet/sync-smart-wallet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionToken }),
        });
        
        if (!syncResponse.ok) {
          const errorData = await syncResponse.json();
          throw new Error(errorData.error || "Failed to sync smart wallet");
        }
        
        const syncData = await syncResponse.json();
        smartWalletAddress = syncData.smartWalletAddress;
        
        console.log("✅ Smart wallet synced:", smartWalletAddress);
        
        // Update local user state
        useAuthStore.getState().updateUser({ smartWalletAddress });
      } catch (syncError) {
        console.error("Failed to sync smart wallet:", syncError);
        setError(
          "Unable to configure smart wallet. Please check your internet connection and try again."
        );
        setLoading(false);
        return;
      }
      
      setLoading(false);
    }

    // IMPORTANT: user.walletAddress is always the EOA (for signing operations)
    // smartWalletAddress is the smart wallet (source of funds and displayed address)
    // For signing and wallet operations, always use the EOA address
    const eoaAddress = user.walletAddress;

    setLoading(true);
    setError(null);

    try {
      // All transactions use AA with gas sponsored by Alchemy Paymaster
      // No ETH balance check needed
      
      // Get wallet client by decrypting with PIN (always use EOA address for wallet operations)
      let walletClient;
      try {
        walletClient = await getWalletClientFromPIN(eoaAddress, data.pin);
      } catch (pinError) {
        console.error("PIN decryption failed:", pinError);
        const errorMsg = t('errors.incorrectPIN') || "Incorrect PIN. Please try again.";
        setError(errorMsg);
        toast.error(errorMsg);
        setLoading(false);
        return;
      }
      
      // Send transaction using smart transfer (always uses AA)
      let result;
      
      // Add optimistic transaction to UI immediately
      const tempTxId = `temp-${Date.now()}`;
      
      const optimisticTx = {
        id: tempTxId,
        txHash: tempTxId, // Temporary hash
        type: "SEND" as const,
        token: "USDC" as const,
        amount: feeCalculation.recipientAmount,
        recipientAddress: data.recipient,
        senderAddress: smartWalletAddress, // Always use smart wallet as sender
        platformFee: parseFloat(feeCalculation.feeAmount) > 0 ? feeCalculation.feeAmount : null,
        gasFee: feeBreakdownData?.gasFee || "0", // User pays for gas (deducted from USDC)
        createdAt: new Date().toISOString(),
        confirmedAt: null,
        status: "PENDING" as const,
        blockNumber: null,
        gasSponsored: true, // Always true with AA
        isAA: true, // Always true
      };
      
      useWalletDataStore.getState().addOptimisticTransaction(optimisticTx);
      
      try {
        // Calculate total platform fee (includes platform fee + gas fee for user to pay)
        const totalPlatformFee = feeBreakdownData 
          ? (parseFloat(feeBreakdownData.platformFee) + parseFloat(feeBreakdownData.gasFee)).toFixed(6)
          : feeCalculation.feeAmount;
        
        // Use smart transfer (automatically routes to AA or EOA)
        const sendPromise = sendUSDCSmart({
          walletClient,
          recipientAddress: data.recipient as `0x${string}`,
          amount: usdAmountToSend,
          platformFeeRecipient,
          platformFeeAmount: parseFloat(totalPlatformFee) > 0 ? totalPlatformFee : undefined,
          userId: user?.id, // Pass user ID to save smart wallet address on first AA use
          onProgress: (status) => {
            // Update approval status for all stages - keep modal open during signing
            if (status === 'building' || status === 'signing' || status === 'submitting' || status === 'confirming') {
              setApprovalStatus(status);
            }
            
            // Close modal only after transaction is submitted to bundler (post-signing)
            if (status === 'confirming') {
              setModalClosed(true); // Mark modal as closed
              setShowPinStep(false);
              if (onCancel) {
                onCancel(); // Close the parent modal
              }
              toast.loading(t('transactionProcessing') || 'Processing transaction...');
            }
          },
          gasSpeed,
        });
        
        result = await sendPromise;
        
        // Update optimistic transaction with real hash
        const realHash = result.txHash || result.userOpHash || tempTxId;
        useWalletDataStore.getState().updateTransactionHash(tempTxId, realHash);
        
        // Save transaction to database
        await fetch("/api/wallet/save-transaction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionToken: useAuthStore.getState().sessionToken,
            txHash: result.txHash,
            userOpHash: result.userOpHash,
            type: "SEND",
            token: "USDC",
            amount: feeCalculation.recipientAmount,
            recipientAddress: data.recipient,
            senderAddress: smartWalletAddress, // Always smart wallet for AA transactions
            platformFee: parseFloat(result.feeAmount) > 0 ? result.feeAmount : null,
            gasFee: feeBreakdownData?.gasFee || "0", // User pays for gas (deducted from USDC)
            gasSponsored: result.gasFeeSponsored,
            isAA: result.isAA,
          }),
        }).catch(err => console.error("Failed to save transaction:", err));
        
        // Dismiss loading toast and show success
        toast.dismiss();
        toast.success(t('transactionSent') || 'Transaction sent successfully!');
        
        // Notify parent to refresh (triggers dashboard update)
        if (onSuccess) {
          onSuccess(result.txHash);
        }
        
      } catch (sendError) {
        console.error("Failed to send transaction:", sendError);
        toast.dismiss();
        throw sendError; // Re-throw to be caught by outer catch
      }
      
      // Fetch actual gas used in background (don't block UI)
      (async () => {
        try {
          if (!result?.txHash) return;
          
          const { getActualGasUsed } = await import("@/lib/blockchain/tokens");
          const gasDetails = await getActualGasUsed(result.txHash);
          
          // Update transaction with actual gas cost
          await fetch("/api/wallet/save-transaction", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionToken: useAuthStore.getState().sessionToken,
              txHash: result.txHash,
              type: "SEND",
              token: "USDC",
              amount: feeCalculation.recipientAmount,
              recipientAddress: data.recipient,
              senderAddress: smartWalletAddress, // Always smart wallet for AA transactions
              platformFee: parseFloat(result.feeAmount) > 0 ? result.feeAmount : null,
              gasFee: gasDetails.gasCostETH,
            }),
          });
        } catch (gasError) {
          console.warn("Could not update actual gas used:", gasError);
        }
      })();

    } catch (err) {
      console.error("Transaction error:", err);
      
      // Dismiss loading toast
      toast.dismiss();
      
      let errorMsg = t('transactionFailed');
      
      if (err instanceof Error) {
        if (err.message.includes("Wallet not found")) {
          errorMsg = tErrors('walletNotFound') || "Your wallet is not set up locally. Please sign out and complete the onboarding process again to set up your wallet.";
        } else if (err.message.includes("gas required exceeds allowance") || err.message.includes("insufficient funds")) {
          errorMsg = tGas('insufficientEthSimple');
        } else if (err.message.includes("User rejected") || err.message.includes("user rejected")) {
          errorMsg = "Transaction was rejected";
        } else if (err.message.includes("insufficient allowance") || err.message.includes("ERC20: transfer amount exceeds balance")) {
          errorMsg = t('insufficientBalance');
        } else {
          errorMsg = err.message;
        }
      }
      
      setError(errorMsg);
      toast.error(errorMsg);
      
      // Only reopen modal if it wasn't already closed after successful submission
      if (!modalClosed) {
        setShowPinStep(true);
      }
    } finally {
      setLoading(false);
    }
  };

  if (showPinStep) {
    const formData = watch();
    // Use feeBreakdownData if available, otherwise fallback to simple calculation
    const displayFees = feeBreakdownData || {
      recipientAmount: "0",
      platformFee: "0",
      gasFee: "0",
      totalFees: "0",
      totalDeducted: "0",
    };
    
    return (
      <TransactionConfirmation
        formData={formData}
        feeBreakdown={{
          recipientAmount: displayFees.recipientAmount,
          platformFee: displayFees.platformFee,
          gasFee: displayFees.gasFee,
          totalFees: displayFees.totalFees,
          totalDeducted: displayFees.totalDeducted,
        }}
        register={register}
        errors={errors}
        loading={loading}
        error={error}
        approvalStatus={approvalStatus}
        onBack={() => {
          setShowPinStep(false);
          setError(null);
          setApprovalStatus(null);
          setModalClosed(false); // Reset modal closed flag when going back
        }}
        onSubmit={handleSubmit(handleConfirm)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2 text-foreground">{t('title')}</h2>
        <p className="text-muted">{t('description')}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmitForm)} className="flex flex-col gap-4">
        <SendMoneyFormFields 
          register={register} 
          errors={errors} 
          watchAmount={watchAmount || ""}
          setValue={setValue}
          contactSelector={
            contacts.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowContactPicker(true)}
                className="text-sm text-primary hover:text-primary-hover font-medium transition-colors"
              >
                {tContacts('selectContact')}
              </button>
            ) : undefined
          }
        />

        <GasSpeedSelector
          selectedSpeed={gasSpeed}
          onSpeedChange={setGasSpeed}
          // gasCostETH={gasCostInfo?.gasCostETH}
        />

        <FeeBreakdown
          recipientAmount={feeBreakdownData?.recipientAmount || "0"}
          platformFee={feeBreakdownData?.platformFee || "0"}
          gasFee={feeBreakdownData?.gasFee || "0"}
          totalFees={feeBreakdownData?.totalFees || "0"}
          totalDeducted={feeBreakdownData?.totalDeducted || "0"}
          gasEstimate={gasEstimate}
        />

        {insufficientBalance && (
          <div className="bg-danger/10 border border-danger rounded-lg px-4 py-3 text-sm text-danger">
            <div className="font-medium">{t('insufficientBalance')}</div>
            <div className="mt-1 text-xs">
              {t('insufficientBalanceRequired')}: {displayRequired ?? (feeBreakdownData?.totalDeducted + ' USDC')} • {t('insufficientBalanceAvailable')}: {displayAvailable ?? (balances.usdc + ' USDC')}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-card-muted text-foreground py-3 rounded-lg font-medium hover:bg-card border border-default transition"
            >
              {tCommon('cancel')}
            </button>
          )}
          <button
            type="submit"
            disabled={insufficientBalance}
            className="flex-1 bg-primary text-on-primary py-3 rounded-lg font-medium hover:bg-primary-hover shadow-card transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {tCommon('continue')}
          </button>
        </div>
      </form>

      {/* Contact Picker Modal */}
      {showContactPicker && (
        <ContactPickerModal
          contacts={contacts}
          onSelect={handleContactSelect}
          onClose={() => setShowContactPicker(false)}
        />
      )}

      {/* Save Contact Prompt */}
      {showSavePrompt && watchRecipient && (
        <SaveContactPrompt
          walletAddress={watchRecipient}
          onSave={handleSaveContact}
          onSkip={handleSkipSave}
        />
      )}
    </div>
  );
}
