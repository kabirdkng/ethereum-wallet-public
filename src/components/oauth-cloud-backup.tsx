"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import { useCloudBackups } from "@/hooks/useCloudBackups";

interface OAuthCloudBackupSetupProps {
  walletAddress: string;
  mnemonic: string;
  sessionToken: string;
  onComplete: () => void;
  onBack?: () => void;
}

export default function OAuthCloudBackupSetup({
  walletAddress,
  mnemonic,
  sessionToken,
  onComplete,
  onBack,
}: OAuthCloudBackupSetupProps) {
  const t = useTranslations('backup.oauthSetup');
  const tPlaceholders = useTranslations('placeholders');
  const tButtons = useTranslations('buttons');
  const tStatus = useTranslations('status');
  const tValidation = useTranslations('validation');
  const tToast = useTranslations('toast');

  const { invalidateCache, fetchBackups } = useCloudBackups();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const { user } = useAuthStore();

  const handleSetup = async (provider: "google" | "facebook") => {
    setLoading(true);
    setError(null);

    try {
      // Check if user is authenticated with this provider
      if (!user?.oauthProvider) {
        throw new Error(tValidation('noOAuthProvider'));
      }

      // Normalize provider format (store has "google"/"facebook", we need to match)
      const normalizedProvider = user.oauthProvider.toLowerCase();
      if (!normalizedProvider.includes(provider)) {
        throw new Error(tValidation('signInWithProvider', { provider }));
      }

      const userId = user.id;
      const oauthId = user.oauthId;

      if (!userId) {
        throw new Error(tValidation('invalidSession'));
      }

      if (!oauthId) {
        throw new Error(tValidation('oauthIdNotFound'));
      }

      // SERVER-SIDE ENCRYPTION: Send plaintext mnemonic to server
      // Server encrypts using HMAC(oauthId, serverSecret) + userId
      const response = await fetch("/api/recovery/oauth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken,
          walletAddress,
          mnemonic, // Send plaintext (over HTTPS), server handles encryption
          provider,
          label: label || `${provider.charAt(0).toUpperCase() + provider.slice(1)} Account Backup`,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        // Check if email verification is required
        if (result.needsVerification) {
          setNeedsVerification(true);
          setError(result.message);
          toast.error(result.message);
          return;
        }
        throw new Error(result.error || tValidation('backupFailed'));
      }

      toast.success(tToast('backupCreated', { provider: provider.charAt(0).toUpperCase() + provider.slice(1) }));
      invalidateCache(); // Clear cache
      await fetchBackups(true); // Force refetch to update UI
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : tValidation('backupFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendVerification = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || tValidation('verificationEmailFailed'));
      }

      setVerificationSent(true);
      toast.success(tToast('verificationEmailSent'));

      // Show dev token in development
      if (result.devToken) {
        console.log("🔗 Verification token (dev):", result.devToken);
        toast.success(`Dev token: ${result.devToken}`, { duration: 10000 });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : tValidation('verificationEmailFailed');
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // If email verification is needed
  if (needsVerification) {
    return (
      <div className="max-w-md mx-auto p-6 bg-card rounded-lg shadow-card">
        <h2 className="text-2xl font-bold mb-4 text-foreground">{t('verificationRequiredTitle')}</h2>
        
        <div className="mb-6 p-4 bg-warning-soft border border-subtle rounded text-foreground text-sm">
          <strong>🔒 {t('security')}:</strong> {t('verificationMessage')}
        </div>

        <p className="text-muted mb-4">
          {t('sendVerificationTo')} <strong>{user?.email}</strong>
        </p>

        {error && !verificationSent && (
          <div className="mb-4 p-3 bg-error-soft border border-error rounded text-error text-sm">
            {error}
          </div>
        )}

        {verificationSent ? (
          <div className="mb-6 p-4 bg-success-soft border border-success rounded text-success text-sm">
            <strong>✅ {t('verificationSentTitle')}</strong>
            <p className="mt-2">{t('checkInbox')}</p>
            <p className="mt-2 text-xs">{t('verifyAndReturn')}</p>
          </div>
        ) : (
          <button
            onClick={handleSendVerification}
            disabled={loading}
            className="w-full mb-4 px-4 py-3 bg-primary text-on-primary rounded hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? tStatus('sending') : tButtons('sendVerificationEmail')}
          </button>
        )}

        <div className="flex gap-3">
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
        </div>
      </div>
    );
  }

  // If user is not authenticated with OAuth
  if (!user?.oauthProvider || user.oauthProvider === "traditional") {
    return (
      <div className="max-w-md mx-auto p-6 bg-card rounded-lg shadow-card">
        <h2 className="text-2xl font-bold mb-4 text-foreground">{t('title')}</h2>
        <div className="bg-warning-soft border border-subtle rounded p-4 text-sm text-warning mb-4">
          <strong>⚠️ {t('note')}:</strong> {t('requiresOAuth')}
        </div>
        <p className="text-muted mb-6">
          {t('signInWithOAuthPrompt')}
        </p>
        {onBack && (
          <button
            onClick={onBack}
            className="w-full px-4 py-2 border border-subtle rounded hover:bg-card-muted text-foreground"
          >
            {tButtons('back')}
          </button>
        )}
      </div>
    );
  }

  const provider = user.oauthProvider.replace("oauth-", "") as "google" | "facebook";

  return (
    <div className="max-w-md mx-auto p-6 bg-card rounded-lg shadow-card">
      <h2 className="text-2xl font-bold mb-4 text-foreground">
        {t('providerTitle', { provider: provider.charAt(0).toUpperCase() + provider.slice(1) })}
      </h2>
      <p className="text-muted mb-6">
        {t('description', { provider: provider.charAt(0).toUpperCase() + provider.slice(1) })}
      </p>

      {error && (
        <div className="mb-4 p-3 bg-danger border border-danger rounded text-danger">
          {error}
        </div>
      )}

      <div className="space-y-4 mb-6">
        <div className="bg-success-soft border border-success rounded p-4">
          <h3 className="font-semibold mb-2 text-success">✅ {t('benefitsTitle')}:</h3>
          <ul className="text-sm text-success space-y-1">
            <li>• {t('benefit1')}</li>
            <li>• {t('benefit2', { provider })}</li>
            <li>• {t('benefit3', { provider })}</li>
            <li>• {t('benefit4')}</li>
          </ul>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">
            {t('labelFieldLabel')}
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={tPlaceholders('backupLabel', { provider: provider.charAt(0).toUpperCase() + provider.slice(1) })}
            className="w-full px-3 py-2 bg-card border border-subtle rounded focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            disabled={loading}
          />
        </div>

        <div className="bg-warning-soft border border-subtle rounded p-3 text-sm text-warning">
          <strong>🔒 {t('security')}:</strong> {t('securityMessage', { provider })}
        </div>
      </div>

      <div className="flex gap-3">
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
          onClick={() => handleSetup(provider)}
          disabled={loading}
          className="flex-1 px-4 py-2 bg-primary text-on-primary rounded hover:bg-primary-hover disabled:bg-card-muted disabled:text-muted"
        >
          {loading ? tStatus('creatingBackup') : tButtons('backupWith', { provider: provider.charAt(0).toUpperCase() + provider.slice(1) })}
        </button>
      </div>
    </div>
  );
}
