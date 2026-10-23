"use client";

import { useState, useRef } from "react";
import { mnemonicToAccount } from "viem/accounts";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { restoreWalletWithNewPIN } from "@/lib/wallet-recovery-utils";
import { useAuthStore } from "@/stores/auth-store";

interface MnemonicRecoveryProps {
  onSuccess: () => void;
  onBack: () => void;
}

type RecoveryStep = "enter-mnemonic" | "set-pin";

export default function MnemonicRecovery({
  onSuccess,
  onBack,
}: MnemonicRecoveryProps) {
  const t = useTranslations('recovery.mnemonic');
  const tPlaceholders = useTranslations('placeholders');
  const tButtons = useTranslations('buttons');
  const tStatus = useTranslations('status');
  const tValidation = useTranslations('validation');
  const tToast = useTranslations('toast');

  const [step, setStep] = useState<RecoveryStep>("enter-mnemonic");
  const [mnemonic, setMnemonic] = useState("");
  const [inputWords, setInputWords] = useState<string[]>(Array(12).fill(""));
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [derivedAddress, setDerivedAddress] = useState<string | null>(null);
  const [recoverySessionToken, setRecoverySessionToken] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { setSession } = useAuthStore();

  const handleInputChange = (index: number, value: string) => {
    const newInputWords = [...inputWords];
    newInputWords[index] = value;
    setInputWords(newInputWords);
    setError(null);

    // Auto-focus next input on space or when word length seems complete
    if (value.endsWith(" ") || (value.length > 2 && index < 11)) {
      const cleanValue = value.trim();
      const updatedWords = [...inputWords];
      updatedWords[index] = cleanValue;
      setInputWords(updatedWords);
      
      if (cleanValue && index < 11) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !inputWords[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");
    const pastedWords = pastedText.trim().split(/\s+/);
    
    if (pastedWords.length === 12) {
      setInputWords(pastedWords);
      setError(null);
      inputRefs.current[11]?.focus();
    } else {
      setError(`Expected 12 words, but got ${pastedWords.length}. Please paste the complete recovery phrase.`);
    }
  };

  const handleClear = () => {
    setInputWords(Array(12).fill(""));
    setError(null);
    setDerivedAddress(null);
    inputRefs.current[0]?.focus();
  };

  const handleVerifyMnemonic = async () => {
    setError(null);
    const mnemonicPhrase = inputWords.join(" ").trim();
    
    if (inputWords.some(word => !word.trim())) {
      setError(tValidation('enter12Words'));
      return;
    }

    setLoading(true);

    try {
      // Derive wallet address from mnemonic
      const account = mnemonicToAccount(mnemonicPhrase);
      const address = account.address;
      
      setDerivedAddress(address);
      setMnemonic(mnemonicPhrase);

      // Check if a user exists with this wallet address
      const checkResponse = await fetch("/api/auth/check-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });

      const checkData = await checkResponse.json();

      if (!checkResponse.ok || !checkData.exists) {
        setError(tValidation('noAccountWithPhrase'));
        setDerivedAddress(null);
        setLoading(false);
        return;
      }

      // Create a recovery session for this user
      const sessionResponse = await fetch("/api/auth/recovery-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });

      const sessionData = await sessionResponse.json();

      if (!sessionResponse.ok) {
        throw new Error(sessionData.error || tValidation('recoverySessionFailed'));
      }

      // Store session token for the recovery process
      setSession(sessionData.sessionToken, sessionData.user);
      setRecoverySessionToken(sessionData.sessionToken);

      toast.success(tToast('mnemonicVerified'));
      setStep("set-pin");
    } catch (err) {
      setError(err instanceof Error ? err.message : tValidation('mnemonicVerifyFailed'));
      setDerivedAddress(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSetPin = async () => {
    setError(null);

    if (pin.length !== 6 || !/^\d+$/.test(pin)) {
      setError(tValidation('pin6Digits'));
      return;
    }

    if (pin !== confirmPin) {
      setError(tValidation('pinsMustMatch'));
      return;
    }

    if (!mnemonic) {
      setError(tValidation('mnemonicNotFound'));
      return;
    }

    if (!recoverySessionToken) {
      setError(tValidation('noActiveSession'));
      return;
    }

    setLoading(true);

    try {
      await restoreWalletWithNewPIN(mnemonic, pin, recoverySessionToken);
      toast.success(tToast('walletRecovered'));
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : tValidation('walletRecoveryFailed'));
    } finally {
      setLoading(false);
    }
  };

  const allWordsFilled = inputWords.every(word => word.trim().length > 0);

  if (step === "set-pin") {
    return (
      <div className="bg-card rounded-2xl shadow-card p-8 border border-subtle">
        <div className="flex flex-col gap-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-2 text-foreground">{t('setPinTitle')}</h1>
            <p className="text-muted">
              {t('setPinDescription')}
            </p>
          </div>

          {derivedAddress && (
            <div className="bg-success-soft border border-success rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-success mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{t('walletFound')}</p>
                  <p className="text-xs text-muted mt-1 font-mono break-all">
                    {derivedAddress}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('newPinLabel')}
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder={tPlaceholders('enterPin')}
                className="w-full px-4 py-3 rounded-lg border border-default bg-card text-foreground focus:border-primary focus:ring-1 focus:ring-primary text-center text-2xl tracking-widest"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('confirmPinLabel')}
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                placeholder={tPlaceholders('reenterPin')}
                className="w-full px-4 py-3 rounded-lg border border-default bg-card text-foreground focus:border-primary focus:ring-1 focus:ring-primary text-center text-2xl tracking-widest"
              />
            </div>
          </div>

          {error && (
            <div className="bg-danger-soft border border-danger-border px-4 py-3 rounded-lg flex items-start gap-3">
              <svg className="w-5 h-5 text-danger mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="text-sm text-danger">{error}</div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep("enter-mnemonic")}
              disabled={loading}
              className="flex-1 border border-default py-3 rounded-lg font-medium hover:bg-card-muted transition"
            >
              {tButtons('back')}
            </button>
            <button
              onClick={handleSetPin}
              disabled={loading || pin.length !== 6 || confirmPin.length !== 6}
              className="flex-1 bg-primary text-on-primary py-3 rounded-lg font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed shadow-card transition"
            >
              {loading ? tStatus('recovering') : tButtons('completeRecovery')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl shadow-card p-8 border border-subtle">
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2 text-foreground">
            {t('title')}
          </h1>
          <p className="text-muted">
            {t('description')}
          </p>
        </div>

        <div className="bg-warning-soft border border-warning rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-warning mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="text-sm text-foreground">
              <strong>{t('important')}:</strong> {t('securityWarning')}
            </div>
          </div>
        </div>

        <div className="bg-card-muted rounded-lg p-3 sm:p-4 md:p-6 border border-subtle overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
            {Array.from({ length: 12 }).map((_, index) => (
              <div key={index} className="relative min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="text-muted text-xs sm:text-sm font-medium shrink-0">
                    {index + 1}.
                  </span>
                  <input
                    ref={(el) => {
                      inputRefs.current[index] = el;
                    }}
                    type="text"
                    value={inputWords[index]}
                    onChange={(e) => handleInputChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={index === 0 ? handlePaste : undefined}
                    placeholder={tPlaceholders('word', { number: index + 1 })}
                    autoComplete="off"
                    spellCheck={false}
                    className="flex-1 min-w-0 px-2 sm:px-3 py-2 rounded-lg border border-default bg-card text-foreground focus:border-primary focus:ring-1 focus:ring-primary text-xs sm:text-sm font-medium transition"
                  />
                </div>
              </div>
            ))}
          </div>

          {allWordsFilled && (
            <button
              onClick={handleClear}
              className="mt-3 sm:mt-4 text-xs sm:text-sm text-muted hover:text-foreground transition"
            >
              {tButtons('clearAll')}
            </button>
          )}
        </div>

        {error && (
          <div className="bg-danger-soft border border-danger-border px-4 py-3 rounded-lg flex items-start gap-3">
            <svg className="w-5 h-5 text-danger mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="text-sm text-danger">{error}</div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={loading}
            className="flex-1 border border-default py-3 rounded-lg font-medium hover:bg-card-muted transition"
          >
            {tButtons('back')}
          </button>
          <button
            onClick={handleVerifyMnemonic}
            disabled={loading || !allWordsFilled}
            className="flex-1 bg-primary text-on-primary py-3 rounded-lg font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed shadow-card transition"
          >
            {loading ? tStatus('verifying') : tButtons('continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
