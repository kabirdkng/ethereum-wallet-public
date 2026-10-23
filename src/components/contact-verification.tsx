"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";

type OTPFormData = {
  code: string;
};

interface ContactVerificationProps {
  contact: string; 
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
}

export default function ContactVerification({
  contact,
  onVerify,
  onResend,
}: ContactVerificationProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OTPFormData>();

  const onSubmit = async (data: OTPFormData) => {
    setLoading(true);
    setError(null);

    try {
      await onVerify(data.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError(null);

    try {
      await onResend();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2 text-foreground">Verify Your Contact</h2>
        <p className="text-muted">
          We sent a 6-digit code to <strong>{contact}</strong>
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div>
          <label htmlFor="code" className="block text-sm font-medium mb-2 text-foreground">
            Verification Code
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            className="w-full px-4 py-3 rounded-lg border border-default bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            {...register("code", {
              required: "Code is required",
              pattern: {
                value: /^\d{6}$/,
                message: "Code must be 6 digits",
              },
            })}
          />
          {errors.code && (
            <p className="text-danger text-sm mt-1">{errors.code.message}</p>
          )}
        </div>

        {error && (
          <div className="bg-danger border border-danger-border px-4 py-3 rounded-lg text-sm text-danger">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-on-primary py-3 rounded-lg font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed shadow-card transition"
        >
          {loading ? "Verifying..." : "Verify Code"}
        </button>

        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="text-primary hover:underline text-sm disabled:opacity-50"
        >
          {resending ? "Sending..." : "Resend code"}
        </button>
      </form>
    </div>
  );
}
