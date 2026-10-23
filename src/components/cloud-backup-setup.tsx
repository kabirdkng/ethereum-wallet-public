"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { useCloudBackups } from "@/hooks/useCloudBackups";
import {
  encryptMnemonicWithPassword,
  validateBackupPassword,
} from "@/lib/crypto/cloud-backup";

type CloudBackupFormData = {
  password: string;
  confirmPassword: string;
  recoveryHint: string;
  label: string;
};

interface CloudBackupSetupProps {
  walletAddress: string;
  mnemonic: string;
  sessionToken: string;
  onComplete: () => void;
  onBack?: () => void;
}

export default function CloudBackupSetup({
  walletAddress,
  mnemonic,
  sessionToken,
  onComplete,
  onBack,
}: CloudBackupSetupProps) {
  const t = useTranslations('backup.cloudSetup');
  const tPlaceholders = useTranslations('placeholders');
  const tButtons = useTranslations('buttons');
  const tStatus = useTranslations('status');
  const tToast = useTranslations('toast');
  
  const { invalidateCache, fetchBackups } = useCloudBackups();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<CloudBackupFormData>();

  const onSubmit = async (data: CloudBackupFormData) => {
    setLoading(true);
    setError(null);

    try {
      // Validate password strength
      const passwordError = validateBackupPassword(data.password);
      if (passwordError) {
        setError(passwordError);
        setLoading(false);
        return;
      }

      // Check passwords match
      if (data.password !== data.confirmPassword) {
        setError(t('passwordMismatch'));
        setLoading(false);
        return;
      }

      // Encrypt mnemonic with password client-side
      const encryptedPayload = await encryptMnemonicWithPassword(
        mnemonic,
        data.password
      );

      // Send encrypted mnemonic to server
      const response = await fetch("/api/recovery/cloud/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken,
          walletAddress,
          encryptedMnemonic: JSON.stringify(encryptedPayload),
          password: data.password, // Will be hashed server-side for verification
          recoveryHint: data.recoveryHint || undefined,
          backupSource: "manual",
          label: data.label || "Password Backup",
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Backup failed");
      }

      toast.success(tToast('backupCreated'));
      invalidateCache(); // Clear cache
      await fetchBackups(true); // Force refetch to update UI
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : tToast('backupFailed'));
    } finally {
      setLoading(false);
    }
  };

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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">
            {t('labelOptional')}
          </label>
          <input
            {...register("label")}
            type="text"
            placeholder={t('labelPlaceholder')}
            className="w-full px-3 py-2 bg-card border border-subtle rounded focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">
            {t('passwordRequired')}
          </label>
          <input
            {...register("password", { required: t('passwordRequired') })}
            type="password"
            placeholder={tPlaceholders('enterPassword')}
            className="w-full px-3 py-2 bg-card border border-subtle rounded focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
          />
          {errors.password && (
            <p className="text-danger text-sm mt-1">{errors.password.message}</p>
          )}
          <p className="text-xs text-muted mt-1">
            {t('passwordRequirements')}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">
            {t('confirmPasswordRequired')}
          </label>
          <input
            {...register("confirmPassword", { required: t('confirmPasswordRequired') })}
            type="password"
            placeholder={tPlaceholders('reenterPassword')}
            className="w-full px-3 py-2 bg-card border border-subtle rounded focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
          />
          {errors.confirmPassword && (
            <p className="text-danger text-sm mt-1">{errors.confirmPassword.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">
            {t('recoveryHintLabel')}
          </label>
          <input
            {...register("recoveryHint")}
            type="text"
            placeholder={tPlaceholders('recoveryHint')}
            className="w-full px-3 py-2 bg-card border border-subtle rounded focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
          />
          <p className="text-xs text-muted mt-1">
            {t('recoveryHintDescription')}
          </p>
        </div>

        <div className="bg-warning-soft border border-subtle rounded p-3 text-sm text-warning">
          <strong>{t('warningTitle')}</strong> {t('warningMessage')}
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
            {loading ? tStatus('creating') : t('createButton')}
          </button>
        </div>
      </form>
    </div>
  );
}
