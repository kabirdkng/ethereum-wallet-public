"use client";

import { useState, useEffect } from "react";
import { useRouter } from "@/i18n/routing";
import { generateMnemonic, english } from "viem/accounts";
import { useTranslations } from "next-intl";

import AuthForm from "@/components/auth-form";
import RecoverySetup from "@/components/recovery-setup";
import { useAuthStore } from "@/stores/auth-store";
import { encryptWithPin } from "@/lib/crypto/encryption";
import { saveWalletRecord } from "@/lib/storage/indexeddb";

type OnboardingStep = "auth" | "pin" | "recovery" | "complete";

export default function OnboardingPage() {
  const router = useRouter();
  const { isAuthenticated, hasWallet, sessionToken } = useAuthStore();
  const t = useTranslations('onboarding');
  const tCommon = useTranslations('common');
  
  const [step, setStep] = useState<OnboardingStep>("auth");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [localWalletAddress, setLocalWalletAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);

  // Only redirect if already fully set up AND user hasn't just completed onboarding
  useEffect(() => {
    if (isAuthenticated && hasWallet && step === "auth" && !isOnboardingComplete) {
      // User already has a wallet and is visiting onboarding page, redirect to dashboard
      router.push("/dashboard");
    }
  }, [isAuthenticated, hasWallet, step, router, isOnboardingComplete]);

  // After successful auth, check if wallet exists
  useEffect(() => {
    if (isAuthenticated && !hasWallet && step === "auth") {
      setStep("pin");
    }
  }, [isAuthenticated, hasWallet, step]);

  const handleAuthSuccess = () => {
    // Auth form handles setting session in store
    // useEffect will trigger to move to next step
  };

  const handleSetPin = async () => {
    if (pin !== confirmPin) {
      setError(t('pinsDoNotMatch'));
      return;
    }

    if (pin.length !== 6 || !/^\d+$/.test(pin)) {
      setError(t('pinMustBe6Digits'));
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Store PIN hash on server
      const response = await fetch("/api/auth/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, pin }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to set PIN");
      }

      // Generate mnemonic for wallet
      const newMnemonic = generateMnemonic(english);
      setMnemonic(newMnemonic);
      
      // Skip wallet backup step and proceed directly to wallet creation and recovery
      await handleWalletCreation(newMnemonic);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleWalletCreation = async (mnemonic: string) => {
    const { mnemonicToAccount } = await import("viem/accounts");
    const { getSmartWalletAddress } = await import("@/lib/blockchain/aa/account");
    
    const account = mnemonicToAccount(mnemonic);
    const address = account.address;
    
    // Calculate smart wallet address with retry logic and robust error handling
    let smartWalletAddress: string;
    try {
      smartWalletAddress = await getSmartWalletAddress(address);
      console.log("✅ Smart wallet calculated for onboarding:", smartWalletAddress);
    } catch (error) {
      console.error("Failed to calculate smart wallet during onboarding:", error);
      throw new Error(
        "Unable to create smart wallet. This may be due to network issues. " +
        "Please check your internet connection and try again."
      );
    }
    
    // Encrypt mnemonic with PIN and store locally
    const encrypted = await encryptWithPin(mnemonic, pin);
    await saveWalletRecord({ 
      address, 
      payload: encrypted,
      createdAt: new Date().toISOString()
    });

    // Register wallet address with server (smart wallet address is required)
    const response = await fetch("/api/wallet/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        sessionToken, 
        address,
        smartWalletAddress, // Always required
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to register wallet");
    }

    // Backup encrypted wallet to server for multi-device access
    try {
      console.log("[Onboarding] Backing up wallet to server:", address);
      const encryptedDataJson = JSON.stringify(encrypted);
      const backupResponse = await fetch("/api/wallet/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          sessionToken, 
          walletAddress: address,
          encryptedData: encryptedDataJson 
        }),
      });
      
      if (backupResponse.ok) {
        const backupData = await backupResponse.json();
        console.log("[Onboarding] ✓ Wallet backed up successfully:", backupData.backupId);
      } else {
        const errorData = await backupResponse.json();
        console.warn("[Onboarding] Backup failed:", errorData);
      }
    } catch (backupError) {
      console.warn("[Onboarding] Failed to backup wallet to server:", backupError);
    }

    // Update store with wallet address and user data
    useAuthStore.getState().setWallet(address);
    if (data.user) {
      useAuthStore.getState().updateUser(data.user);
    }
    setLocalWalletAddress(address);
    setStep("recovery");
  };

  const handleRecoveryComplete = () => {
    setIsOnboardingComplete(true);
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 pt-20">
      <div className="w-full max-w-2xl">
        {error && (
          <div className="mb-4 p-4 bg-error-soft border border-error rounded-lg">
            <p className="text-sm text-error">{error}</p>
          </div>
        )}

        {/* Auth Step */}
        {step === "auth" && (
          <AuthForm onSuccess={handleAuthSuccess} />
        )}

        {/* PIN Setup Step */}
        {step === "pin" && (
          <div className="bg-card p-6 rounded-lg border border-subtle shadow-card">
            <h2 className="text-2xl font-bold text-foreground mb-2">{t('setYourPIN')}</h2>
            <p className="text-muted mb-6">
              {t('createPINDescription')}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t('enterPIN')}
                </label>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder={t('pinPlaceholder')}
                  maxLength={6}
                  className="w-full px-4 py-3 border border-default rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t('confirmPIN')}
                </label>
                <input
                  type="password"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder={t('pinConfirmPlaceholder')}
                  maxLength={6}
                  className="w-full px-4 py-3 border border-default rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <button
                onClick={handleSetPin}
                disabled={loading || pin.length !== 6 || confirmPin.length !== 6}
                className="w-full bg-primary text-on-primary py-3 rounded-lg font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? t('settingPIN') : tCommon('continue')}
              </button>
            </div>
          </div>
        )}

        {/* Recovery Setup Step */}
        {step === "recovery" && localWalletAddress && (
          <RecoverySetup
            walletAddress={localWalletAddress}
            mnemonic={mnemonic}
            sessionToken={sessionToken || ""}
            onComplete={handleRecoveryComplete}
          />
        )}

        {/* Back to Home Link */}
        <div className="mt-6 text-center">
          <button
            onClick={() => router.push("/")}
            className="text-sm text-muted hover:text-primary hover:underline transition inline-flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {t('backToHome')}
          </button>
        </div>
      </div>
    </div>
  );
}
