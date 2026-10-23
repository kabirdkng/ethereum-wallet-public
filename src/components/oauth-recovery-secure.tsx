"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";
import toast from "react-hot-toast";
import { saveWalletRecord } from "@/lib/storage/indexeddb";

type OAuthRecoveryFormData = {
  identifier: string;
  newPin: string;
  confirmPin: string;
};

interface OAuthRecoveryProps {
  onSuccess: (walletAddress: string) => void;
  onBack?: () => void;
  recoverySessionData?: {
    recoverySessionId: string;
    backupId: string;
    walletAddress: string;
  };
  sessionToken?: string; // Pass session token explicitly
}

/**
 * Secure OAuth Recovery Component
 * 
 * SECURITY: Uses server-side recovery sessions instead of sessionStorage
 * - Step 1: Initiate recovery → generates server-side nonce
 * - Step 2: OAuth sign-in → nonce in state param prevents fixation
 * - Step 3: Server verifies → decrypts server-side with HMAC key
 * - Step 4: Set new PIN → client stores re-encrypted wallet
 */
export default function OAuthRecoverySecure({ onSuccess, onBack, recoverySessionData, sessionToken: propSessionToken }: OAuthRecoveryProps) {
  const t = useTranslations('backup.oauth');
  const tPlaceholders = useTranslations('placeholders');
  const tButtons = useTranslations('buttons');
  const tStatus = useTranslations('status');
  const tValidation = useTranslations('validation');
  const tToast = useTranslations('toast');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"initiate" | "oauth" | "pin">(
    recoverySessionData ? "pin" : "initiate"
  );
  const [recoveryData, setRecoveryData] = useState<{
    nonce: string;
    provider: "google" | "facebook";
    recoverySessionId?: string;
    backupId?: string;
    walletAddress?: string;
  } | null>(
    recoverySessionData 
      ? { ...recoverySessionData, nonce: "", provider: "google" } 
      : null
  );

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<OAuthRecoveryFormData>();

  const newPin = watch("newPin");

  // Step 1: Initiate recovery and get nonce
  const onInitiate = async (data: OAuthRecoveryFormData) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/recovery/oauth/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: data.identifier,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to initiate recovery");
      }

      // Store nonce and provider for OAuth redirect
      setRecoveryData({
        nonce: result.nonce,
        provider: result.provider,
      });

      setStep("oauth");
      toast.success(`Found ${result.provider} backup. Please sign in to continue.`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : tToast('recoveryFailed');
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: OAuth sign-in with nonce as state
  const handleOAuthSignIn = async () => {
    if (!recoveryData) return;

    setLoading(true);
    setError(null);

    try {
      toast.loading("Redirecting to sign in...");

      // Redirect to OAuth with nonce in state/callback param
      // Nonce comes back via URL parameter - no need for sessionStorage
      await signIn(recoveryData.provider, {
        callbackUrl: `/recovery?oauth_recovery_nonce=${recoveryData.nonce}`,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "OAuth sign-in failed";
      setError(errorMsg);
      toast.error(errorMsg);
      setLoading(false);
    }
  };

  // Step 3: Set new PIN and complete recovery
  const onSetPIN = async (data: OAuthRecoveryFormData) => {
    setLoading(true);
    setError(null);

    try {
      if (!recoveryData?.recoverySessionId) {
        throw new Error("Recovery session not found. Please start over.");
      }

      // Validate PIN
      if (data.newPin.length !== 6) {
        setError("PIN must be 6 digits");
        setLoading(false);
        return;
      }

      if (data.newPin !== data.confirmPin) {
        setError("PINs do not match");
        setLoading(false);
        return;
      }

      // Get session token from auth store or prop
      const { useAuthStore } = await import("@/stores/auth-store");
      const storeSessionToken = useAuthStore.getState().sessionToken;
      const sessionToken = propSessionToken || storeSessionToken;

      if (!sessionToken) {
        throw new Error("No active session. Please sign in again.");
      }

      // Server-side decryption and re-encryption
      const response = await fetch("/api/recovery/oauth/decrypt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recoverySessionId: recoveryData.recoverySessionId,
          sessionToken,
          newPin: data.newPin,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to decrypt backup");
      }

      // Save re-encrypted wallet to IndexedDB
      await saveWalletRecord({
        address: result.address,
        payload: result.encryptedWallet,
        createdAt: new Date().toISOString(),
      });

      toast.success(tToast('recoverySuccess'));
      onSuccess(result.address);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : tToast('recoveryFailed');
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

    // Step 1: Initiate recovery
  if (step === "initiate") {
    return (
      <div className="max-w-md mx-auto p-6 bg-card rounded-lg shadow-card">
        <h2 className="text-2xl font-bold mb-4 text-foreground">{t('title')}</h2>
        <p className="text-muted mb-6">
          {t('description')}
        </p>

        <div className="mb-6 p-4 bg-card-muted border border-subtle rounded text-muted text-sm">
          {t('securityNote')}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-danger border border-danger rounded text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onInitiate)} className="space-y-4">
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
              {loading ? tStatus('checking') : t('findButton')}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Step 2: OAuth Sign-In
  if (step === "oauth") {
    const provider = recoveryData?.provider || "google";
    const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);

    return (
      <div className="max-w-md mx-auto p-6 bg-card rounded-lg shadow-card">
        <h2 className="text-2xl font-bold mb-4 text-foreground">{t('signInTitle', { provider: providerName })}</h2>
        <p className="text-muted mb-6">
          {t('signInDescription', { provider: providerName })}
        </p>

        <div className="mb-6 p-4 bg-warning-soft border border-subtle rounded text-foreground text-sm">
          <strong>🔒 Security:</strong> You must authenticate with the same {providerName} account 
          that created the backup. The server will verify your identity before allowing recovery.
        </div>

        {error && (
          <div className="mb-4 p-3 bg-danger border border-danger rounded text-danger text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <button
            onClick={handleOAuthSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-700 font-medium">{tStatus('signingIn')}</span>
              </>
            ) : (
              <>
                {recoveryData?.provider === "google" ? (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="#1877F2" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                )}
                <span className="text-gray-700 font-medium">{t('signInButton', { provider: providerName })}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setStep("initiate")}
            className="w-full px-4 py-2 border border-subtle rounded hover:bg-card-muted text-foreground"
            disabled={loading}
          >
            {tButtons('back')}
          </button>
        </div>
      </div>
    );
  }

  // Step 3: Set new PIN
  return (
    <div className="max-w-md mx-auto p-6 bg-card rounded-lg shadow-card">
      <h2 className="text-2xl font-bold mb-4 text-foreground">{t('setPinTitle')}</h2>
      <p className="text-muted mb-6">
        {t('setPinDescription')}
      </p>

      {error && (
        <div className="mb-4 p-3 bg-error-soft border border-error rounded text-error text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSetPIN)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">
            {t('newPinLabel')}
          </label>
          <input
            {...register("newPin", {
              required: tValidation('required'),
              pattern: {
                value: /^\d{6}$/,
                message: tValidation('pin6Digits'),
              },
            })}
            type="password"
            inputMode="numeric"
            maxLength={6}
            placeholder={tPlaceholders('enterPin')}
            className="w-full px-3 py-2 bg-card border border-subtle rounded focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
          />
          {errors.newPin && (
            <p className="text-error text-sm mt-1">{errors.newPin.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">
            {t('confirmPinLabel')}
          </label>
          <input
            {...register("confirmPin", {
              required: tValidation('confirmPin'),
              validate: (value) =>
                value === newPin || tValidation('pinsMustMatch'),
            })}
            type="password"
            inputMode="numeric"
            maxLength={6}
            placeholder={tPlaceholders('reenterPin')}
            className="w-full px-3 py-2 bg-card border border-subtle rounded focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
          />
          {errors.confirmPin && (
            <p className="text-error text-sm mt-1">{errors.confirmPin.message}</p>
          )}
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2 bg-primary text-on-primary rounded hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? tStatus('restoring') : tButtons('restoreWallet')}
          </button>
        </div>
      </form>
    </div>
  );
}
