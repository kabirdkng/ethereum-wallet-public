"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { decryptMnemonicWithPassword } from "@/lib/crypto/cloud-backup";
import { mnemonicToAccount } from "viem/accounts";
import { restoreWalletWithNewPIN } from "@/lib/wallet-recovery-utils";
import { useAuthStore } from "@/stores/auth-store";

type CloudRecoveryFormData = {
  identifier: string;
  password: string;
  newPin: string;
  confirmPin: string;
};

interface CloudRecoveryProps {
  onSuccess: (walletAddress: string) => void;
  onBack?: () => void;
}

export default function CloudRecovery({ onSuccess, onBack }: CloudRecoveryProps) {
  const t = useTranslations('backup.cloudRecovery');
  const tPlaceholders = useTranslations('placeholders');
  const tButtons = useTranslations('buttons');
  const tStatus = useTranslations('status');
  const tValidation = useTranslations('validation');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"retrieve" | "decrypt">("retrieve");
  const [recoverySessionToken, setRecoverySessionToken] = useState<string | null>(null);
  const [backupData, setBackupData] = useState<{
    encryptedMnemonic: string;
    recoveryHint?: string;
    walletAddress: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CloudRecoveryFormData>();

  const newPin = watch("newPin");

  const onRetrieveBackup = async (data: CloudRecoveryFormData) => {
    setLoading(true);
    setError(null);

    try {
      // Retrieve encrypted backup from server
      const response = await fetch("/api/recovery/cloud/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: data.identifier,
          password: data.password,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to retrieve backup");
      }

      // Store session token and user data for subsequent API calls
      if (result.sessionToken) {
        setRecoverySessionToken(result.sessionToken);
        if (result.user) {
          useAuthStore.getState().setSession(result.sessionToken, result.user);
        }
      }

      setBackupData({
        encryptedMnemonic: result.backup.encryptedMnemonic,
        recoveryHint: result.backup.recoveryHint,
        walletAddress: result.backup.walletAddress,
      });
      setStep("decrypt");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retrieve backup");
    } finally {
      setLoading(false);
    }
  };

  const onDecryptAndRestore = async (data: CloudRecoveryFormData) => {
    setLoading(true);
    setError(null);

    try {
      if (!backupData) {
        throw new Error("No backup data available");
      }

      // Validate PIN
      if (data.newPin.length !== 6) {
        setError(tValidation('pinMustBeSixDigits'));
        setLoading(false);
        return;
      }

      if (data.newPin !== data.confirmPin) {
        setError(tValidation('pinMustMatch'));
        setLoading(false);
        return;
      }

      // Decrypt mnemonic client-side
      const encryptedPayload = JSON.parse(backupData.encryptedMnemonic);
      
      const mnemonic = await decryptMnemonicWithPassword(
        encryptedPayload,
        data.password
      );


      // Derive wallet from mnemonic to verify
      let account;
      try {
        account = mnemonicToAccount(mnemonic);
      } catch (mnemonicError) {
        console.error("[Cloud Recovery] Invalid mnemonic error:", mnemonicError);
        console.error("[Cloud Recovery] Full mnemonic:", mnemonic);
        throw new Error(tValidation('invalidMnemonic'));
      }

      if (account.address.toLowerCase() !== backupData.walletAddress.toLowerCase()) {
        throw new Error(tValidation('walletAddressMismatch'));
      }

      // Use the unified wallet recovery function (same as initial wallet creation)
      if (!recoverySessionToken) {
        throw new Error(tValidation('noActiveSession'));
      }

      await restoreWalletWithNewPIN(mnemonic, data.newPin, recoverySessionToken);

      // Success - pass wallet address to parent
      onSuccess(account.address);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to decrypt and restore wallet"
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Retrieve backup
  if (step === "retrieve") {
    return (
      <div className="max-w-md mx-auto p-6 bg-card rounded-lg shadow-card">
        <h2 className="text-2xl font-bold mb-4 text-foreground">{t('title')}</h2>
        <p className="text-muted mb-6">
          {t('description')}
        </p>

        {error && (
          <div className="mb-4 p-3 bg-danger border border-danger rounded text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onRetrieveBackup)} className="space-y-4">
          {backupData?.recoveryHint && (
            <div className="mb-4 p-3 bg-card-muted border border-subtle rounded text-muted text-sm">
              <strong>{t('hintPrefix')}</strong> {backupData.recoveryHint}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1 text-foreground">
              {t('identifierLabel')}
            </label>
            <input
              {...register("identifier", { required: tValidation('required') })}
              type="text"
              placeholder={tPlaceholders('emailOrPhone')}
              className="w-full px-3 py-2 bg-card border border-subtle rounded focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            />
            {errors.identifier && (
              <p className="text-danger text-sm mt-1">
                {errors.identifier.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-foreground">
              {t('passwordLabel')}
            </label>
            <input
              {...register("password", { required: tValidation('passwordRequired') })}
              type="password"
              placeholder={tPlaceholders('backupPassword')}
              className="w-full px-3 py-2 bg-card border border-subtle rounded focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            />
            {errors.password && (
              <p className="text-danger text-sm mt-1">{errors.password.message}</p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="flex-1 px-4 py-2 border border-subtle rounded hover:bg-card-muted text-foreground"
                disabled={loading}
              >
                {tButtons('back')}
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-primary text-on-primary rounded hover:bg-primary-hover disabled:bg-card-muted disabled:text-muted"
            >
              {loading ? tStatus('retrieving') : t('retrieveButton')}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Step 2: Decrypt and restore with new PIN
  return (
    <div className="max-w-md mx-auto p-6 bg-card rounded-lg shadow-card">
      <h2 className="text-2xl font-bold mb-4 text-foreground">{t('setPinTitle')}</h2>
      <p className="text-muted mb-6">
        {t('setPinDescription')}
      </p>

      {backupData?.recoveryHint && (
        <div className="mb-4 p-3 bg-card-muted border border-subtle rounded text-muted">
          <strong>{t('recoveryHintLabel')}</strong> {backupData.recoveryHint}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-danger border border-danger rounded text-danger">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onDecryptAndRestore)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">{t('newPinLabel')}</label>
          <input
            {...register("newPin", {
              required: tValidation('pinRequired'),
              pattern: {
                value: /^\d{6}$/,
                message: tValidation('pinMustBeSixDigits'),
              },
            })}
            type="password"
            inputMode="numeric"
            maxLength={6}
            placeholder={tPlaceholders('enterPin')}
            className="w-full px-3 py-2 bg-card border border-subtle rounded focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
          />
          {errors.newPin && (
            <p className="text-danger text-sm mt-1">{errors.newPin.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">{t('confirmPinLabel')}</label>
          <input
            {...register("confirmPin", {
              required: tValidation('required'),
              validate: (value) => value === newPin || tValidation('pinMustMatch'),
            })}
            type="password"
            inputMode="numeric"
            maxLength={6}
            placeholder={tPlaceholders('reenterPin')}
            className="w-full px-3 py-2 bg-card border border-subtle rounded focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
          />
          {errors.confirmPin && (
            <p className="text-danger text-sm mt-1">{errors.confirmPin.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 bg-primary text-on-primary rounded hover:bg-primary-hover disabled:bg-card-muted disabled:text-muted"
        >
          {loading ? tStatus('restoring') : t('restoreButton')}
        </button>
      </form>
    </div>
  );
}
