"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import toast from "react-hot-toast";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { ContactTypeSelector } from "@/components/auth/contact-type-selector";
import { ContactForm } from "@/components/auth/contact-form";
import { VerificationStep } from "@/components/auth/verification-step";

type ContactType = "email" | "phone";
type AuthMode = "signup" | "signin";

interface AuthFormProps {
  onSuccess?: () => void;
}

export default function AuthForm({ onSuccess }: AuthFormProps) {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [mode, setMode] = useState<AuthMode>("signin");
  const [contactType, setContactType] = useState<ContactType>("email");
  const [contact, setContact] = useState("");
  const [otp, setOtp] = useState("");
  const [pin, setPin] = useState("");
  const [step, setStep] = useState<"contact" | "verify" | "complete">("contact");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { setSession } = useAuthStore();

    const handleOAuthSignIn = async (provider: "google" | "facebook") => {
    try {
      setLoading(true);
      setError("");

      // Trigger NextAuth OAuth sign-in with callback to our custom page
      await signIn(provider, {
        callbackUrl: "/auth/callback",
      });

      // NextAuth will redirect to the callback page, which will complete the sign-in
    } catch (err) {
      console.error("OAuth sign-in error:", err);
      toast.error(tErrors('general'));
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactType, contact }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error || tErrors('general');
        
        // Handle specific error cases
        if (data.code === "ACCOUNT_EXISTS") {
          toast.error(errorMsg, { duration: 6000 });
          setError(errorMsg);
          // Auto-switch to signin mode after a brief delay
          setTimeout(() => {
            setMode("signin");
            setError("");
          }, 2000);
          return;
        }
        
        throw new Error(errorMsg);
      }

      toast.success(t('codeResent'));
      setStep("verify");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "An error occurred";
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactType, contact, pin }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error || tErrors('general');
        
        // Handle specific error cases
        if (data.code === "ACCOUNT_NOT_FOUND") {
          toast.error(errorMsg, { duration: 6000 });
          setError(errorMsg);
          // Auto-switch to signup mode after a brief delay
          setTimeout(() => {
            setMode("signup");
            setError("");
            setPin("");
          }, 2000);
          return;
        }
        
        throw new Error(errorMsg);
      }

      setSession(data.sessionToken, data.user);
      toast.success(tCommon('success'));
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "An error occurred";
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactType, contact, code: otp }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || tErrors('validation'));
      }

      setSession(data.sessionToken, data.user);
      toast.success(tCommon('success'));
      setStep("complete");
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "An error occurred";
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setContact("");
    setOtp("");
    setPin("");
    setStep("contact");
    setError("");
  };

  const toggleMode = () => {
    resetForm();
    setMode(mode === "signin" ? "signup" : "signin");
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-card rounded-lg border border-subtle shadow-card">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          {mode === "signin" ? t('login') : t('signup')}
        </h2>
        <p className="text-muted">
          {mode === "signin"
            ? t('loginDescription')
            : t('getStartedDescription')}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-error-soft border border-error rounded-lg">
          <p className="text-sm text-error font-medium mb-2">{error}</p>
          {mode === "signin" && error.includes("No account found") && (
            <button
              onClick={() => {
                setMode("signup");
                setError("");
                setPin("");
              }}
              className="mt-2 text-sm font-medium text-error hover:text-error/80 underline transition-colors"
            >
              Create a new account instead
            </button>
          )}
          {mode === "signup" && error.includes("already exists") && (
            <button
              onClick={() => {
                setMode("signin");
                setError("");
              }}
              className="mt-2 text-sm font-medium text-error hover:text-error/80 underline transition-colors"
            >
              Sign in to existing account
            </button>
          )}
        </div>
      )}

      {step === "contact" && (
        <>
          <OAuthButtons loading={loading} onSignIn={handleOAuthSignIn} />
          <ContactTypeSelector contactType={contactType} onChangeType={setContactType} />
          <ContactForm
            mode={mode}
            contactType={contactType}
            contact={contact}
            onContactChange={setContact}
            pin={pin}
            onPinChange={setPin}
            loading={loading}
            onSubmit={mode === "signin" ? handleSignIn : handleSendOtp}
            onToggleMode={toggleMode}
          />
        </>
      )}

      {step === "verify" && mode === "signup" && (
        <VerificationStep
          contactType={contactType}
          otp={otp}
          onOtpChange={setOtp}
          loading={loading}
          onVerify={handleVerifyOtp}
          onBack={resetForm}
        />
      )}
    </div>
  );
}
