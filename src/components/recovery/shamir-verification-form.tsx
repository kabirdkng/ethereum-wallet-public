"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";

interface ShamirVerificationFormProps {
  onSubmit: (data: { codes: string[]; pin: string }) => void;
  onBack: () => void;
  loading?: boolean;
  error?: string;
  threshold?: number;
}

export default function ShamirVerificationForm({ 
  onSubmit, 
  onBack, 
  loading = false, 
  error,
  threshold = 3
}: ShamirVerificationFormProps) {
  const t = useTranslations('backup.social.verification');
  const tPlaceholders = useTranslations('placeholders');
  const tButtons = useTranslations('buttons');
  const tStatus = useTranslations('status');
  const tValidation = useTranslations('validation');

  const [codes, setCodes] = useState<string[]>(Array(threshold).fill(""));
  const [pinValue, setPinValue] = useState("");
  
  const form = useForm({
    defaultValues: {
      pin: "",
      confirmPin: "",
    },
  });

  const handleCodeChange = (index: number, value: string) => {
    const newCodes = [...codes];
    newCodes[index] = value;
    setCodes(newCodes);
  };

  const handleSubmit = (data: { pin: string; confirmPin: string }) => {
    if (data.pin !== data.confirmPin) {
      return;
    }
    onSubmit({ codes, pin: data.pin });
  };

  return (
    <div className="bg-card rounded-2xl shadow-card p-8 border border-subtle">
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2 text-foreground">{t('title')}</h1>
          <p className="text-muted">
            {t('description', { threshold })}
          </p>
        </div>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-6">
          {/* Recovery Codes */}
          <div className="flex flex-col gap-3">
            <label className="block text-sm font-medium text-foreground">
              {t('codesLabel', { threshold })}
            </label>
            {codes.map((code, index) => (
              <input
                key={index}
                type="text"
                placeholder={tPlaceholders('code', { number: index + 1 })}
                value={code}
                onChange={(e) => handleCodeChange(index, e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-default bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-mono"
              />
            ))}
          </div>

          {/* New PIN */}
          <div>
            <label className="block text-sm font-medium mb-2 text-foreground">
              {t('newPinLabel')}
            </label>
            <input
              type="password"
              placeholder={tPlaceholders('enterPin')}
              className="w-full px-4 py-3 rounded-lg border border-default bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              {...form.register("pin", {
                required: true,
                pattern: /^\d{6}$/,
                onChange: (e) => setPinValue(e.target.value)
              })}
            />
          </div>

          {/* Confirm PIN */}
          <div>
            <label className="block text-sm font-medium mb-2 text-foreground">
              {t('confirmPinLabel')}
            </label>
            <input
              type="password"
              placeholder={tPlaceholders('reenterPin')}
              className="w-full px-4 py-3 rounded-lg border border-default bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              {...form.register("confirmPin", {
                required: true,
                validate: (value) =>
                  value === pinValue || tValidation('pinsMustMatch'),
              })}
            />
            {form.formState.errors.confirmPin && (
              <p className="text-danger text-sm mt-1">
                {form.formState.errors.confirmPin.message}
              </p>
            )}
          </div>

          {error && (
            <div className="bg-danger border border-danger-border px-4 py-3 rounded-lg text-sm text-danger">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || codes.filter(c => c.trim()).length < threshold}
            className="w-full bg-primary text-on-primary py-3 rounded-lg font-medium hover:bg-primary-hover disabled:opacity-50 shadow-card transition"
          >
            {loading ? tStatus('recovering') : tButtons('recoverWallet')}
          </button>

          <button
            type="button"
            onClick={onBack}
            className="text-muted hover:underline text-sm"
          >
            {tButtons('back')}
          </button>
        </form>
      </div>
    </div>
  );
}
