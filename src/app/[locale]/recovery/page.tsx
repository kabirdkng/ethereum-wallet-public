"use client";

import { useState, useEffect } from "react";
import { useRouter } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import CloudRecovery from "@/components/cloud-recovery";
import OAuthRecoverySecure from "@/components/oauth-recovery-secure";
import MnemonicRecovery from "@/components/mnemonic-recovery";
import MethodSelector from "@/components/recovery/method-selector";
import ShamirContactForm from "@/components/recovery/shamir-contact-form";
import ShamirVerificationForm from "@/components/recovery/shamir-verification-form";
import { restoreWalletWithNewPIN } from "@/lib/wallet-recovery-utils";
import { useAuthStore } from "@/stores/auth-store";
import { useTranslations } from "next-intl";

type RecoveryMethod = "shamir" | "cloud" | "oauth" | "mnemonic" | null;
type RecoveryStep = "method" | "contact" | "codes";

export default function RecoveryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedMethod, setSelectedMethod] = useState<RecoveryMethod>(null);
  const [step, setStep] = useState<RecoveryStep>("method");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryRequestId, setRecoveryRequestId] = useState<string | null>(null);
  const [requiredShares, setRequiredShares] = useState(3);
  const [oauthRecoverySession, setOauthRecoverySession] = useState<{
    recoverySessionId: string;
    backupId: string;
    walletAddress: string;
  } | null>(null);
  const t = useTranslations('onboarding');

  // Handle OAuth callback with server-side nonce verification
  useEffect(() => {
    const handleOAuthCallback = async () => {
      const oauthRecoveryNonce = searchParams.get("oauth_recovery_nonce");
      
      if (oauthRecoveryNonce) {
        setLoading(true);
        
        try {
          // Fetch the OAuth session
          const sessionResponse = await fetch("/api/auth/oauth-signin", {
            method: "GET",
          });

          const sessionData = await sessionResponse.json();

          if (!sessionResponse.ok) {
            throw new Error(sessionData.error || "Failed to establish OAuth session");
          }

          // Store session
          if (sessionData.data?.sessionToken && sessionData.data?.user) {
            useAuthStore.getState().setSession(sessionData.data.sessionToken, sessionData.data.user);

            // SERVER-SIDE VERIFICATION: Verify nonce and get backup data
            const verifyResponse = await fetch("/api/recovery/oauth/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                nonce: oauthRecoveryNonce,
                sessionToken: sessionData.data.sessionToken,
              }),
            });

            const verifyData = await verifyResponse.json();

            if (!verifyResponse.ok) {
              throw new Error(
                verifyData.message || 
                verifyData.error || 
                "OAuth verification failed."
              );
            }

            // Clear sessionStorage
            sessionStorage.removeItem("oauth-recovery-nonce");
            sessionStorage.removeItem("oauth-recovery-provider");
            
            // Store verified recovery session data for component
            sessionStorage.setItem("oauth-recovery-session", JSON.stringify({
              recoverySessionId: verifyData.recoverySessionId,
              backupId: verifyData.backup.id,
              walletAddress: verifyData.backup.walletAddress,
            }));

            // Set OAuth recovery session data
            setOauthRecoverySession({
              recoverySessionId: verifyData.recoverySessionId,
              backupId: verifyData.backup.id,
              walletAddress: verifyData.backup.walletAddress,
            });

            // Switch to OAuth recovery with PIN step
            setSelectedMethod("oauth");
            
            toast.success("Authentication verified! Please set a new PIN.");
            
            // Clear the URL parameter
            router.replace("/recovery");
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "OAuth callback failed";
          setError(errorMsg);
          toast.error(errorMsg);
          sessionStorage.removeItem("oauth-recovery-backup");
          sessionStorage.removeItem("oauth-recovery-provider");
        } finally {
          setLoading(false);
        }
      }
    };

    handleOAuthCallback();
  }, [searchParams, router]);

  const handleRecoverySuccess = () => {
    router.push("/onboarding");
  };

  const handleMethodSelect = (method: "shamir" | "cloud" | "oauth" | "mnemonic") => {
    setSelectedMethod(method);
    setError(null);
    if (method === "shamir") {
      setStep("contact");
    }
    // Cloud, OAuth, and Mnemonic components handle their own flows
  };

  const handleShamirContactSubmit = async (data: { contactType: string; contact: string }) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/recovery/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to initiate recovery");
      }

      // Store session token and user data for subsequent API calls
      if (result.sessionToken && result.user) {
        useAuthStore.getState().setSession(result.sessionToken, result.user);
      }

      setRecoveryRequestId(result.recoveryRequestId);
      setRequiredShares(result.requiredShares);
      setStep("codes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate recovery");
    } finally {
      setLoading(false);
    }
  };

  const handleShamirVerificationSubmit = async (data: { codes: string[]; pin: string }) => {
    if (!recoveryRequestId) return;

    setLoading(true);
    setError(null);

    try {
      const recoveryCodes = data.codes
        .map((code: string, index: number) => ({ 
          code: code.trim(), 
          shareIndex: index + 1 
        }))
        .filter((item: { code: string }) => item.code !== "");

      if (recoveryCodes.length < requiredShares) {
        setError(`Please enter at least ${requiredShares} recovery codes`);
        setLoading(false);
        return;
      }

      const requestBody = {
        recoveryRequestId,
        recoveryCodes,
        newPin: data.pin,
      };
      

      const response = await fetch("/api/recovery/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (!response.ok) {
        const errorMsg = result.error || "Recovery failed";
        const detailsMsg = result.details ? `\nDetails: ${JSON.stringify(result.details, null, 2)}` : "";
        throw new Error(errorMsg + detailsMsg);
      }

      // Use the unified wallet recovery function (same as initial wallet creation)
      if (result.mnemonic && result.walletAddress) {
        const sessionToken = useAuthStore.getState().sessionToken;
        if (!sessionToken) {
          throw new Error("No active session");
        }

        await restoreWalletWithNewPIN(result.mnemonic, data.pin, sessionToken);
      } else {
        throw new Error("Recovery response missing mnemonic or wallet address");
      }

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recovery failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4 pt-20">
      <div className="max-w-2xl w-full">
        {/* Method Selection */}
        {step === "method" && !selectedMethod && (
          <MethodSelector 
            onSelectMethod={handleMethodSelect}
            showOAuth={true}
          />
        )}

        {/* Cloud Backup Recovery */}
        {selectedMethod === "cloud" && (
          <CloudRecovery
            onSuccess={handleRecoverySuccess}
            onBack={() => {
              setSelectedMethod(null);
              setStep("method");
            }}
          />
        )}

        {/* Mnemonic Recovery */}
        {selectedMethod === "mnemonic" && (
          <MnemonicRecovery
            onSuccess={handleRecoverySuccess}
            onBack={() => {
              setSelectedMethod(null);
              setStep("method");
            }}
          />
        )}

        {/* OAuth Backup Recovery */}
        {selectedMethod === "oauth" && (
          <OAuthRecoverySecure
            onSuccess={handleRecoverySuccess}
            onBack={() => {
              setSelectedMethod(null);
              setStep("method");
              setOauthRecoverySession(null);
            }}
            recoverySessionData={oauthRecoverySession || undefined}
            sessionToken={useAuthStore.getState().sessionToken || undefined}
          />
        )}

        {/* Shamir Social Recovery - Contact Input */}
        {step === "contact" && selectedMethod === "shamir" && (
          <ShamirContactForm
            onSubmit={handleShamirContactSubmit}
            onBack={() => {
              setSelectedMethod(null);
              setStep("method");
            }}
            loading={loading}
            error={error || undefined}
          />
        )}

        {/* Shamir Social Recovery - Enter Codes */}
        {step === "codes" && selectedMethod === "shamir" && (
          <ShamirVerificationForm
            onSubmit={handleShamirVerificationSubmit}
            onBack={() => setStep("contact")}
            loading={loading}
            error={error || undefined}
            threshold={requiredShares}
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
