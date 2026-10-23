"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";

interface ShamirContactFormProps {
  onSubmit: (data: { contactType: string; contact: string }) => void;
  onBack: () => void;
  loading?: boolean;
  error?: string;
}

export default function ShamirContactForm({ 
  onSubmit, 
  onBack, 
  loading = false, 
  error 
}: ShamirContactFormProps) {
  const t = useTranslations('recovery.shamir');
  const tAuth = useTranslations('auth');
  const [contactType, setContactType] = useState<"email" | "phone">("email");
  
  const form = useForm({
    defaultValues: {
      contactType: "email" as const,
      contact: "",
    },
  });

  return (
    <div className="bg-card rounded-2xl shadow-card p-8 border border-subtle">
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2 text-foreground">{t('title')}</h1>
          <p className="text-muted">
            {t('description')}
          </p>
        </div>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <div>
            <label className="block text-sm font-medium mb-2 text-foreground">
              {t('contactType')}
            </label>
            <select
              className="w-full px-4 py-3 rounded-lg border border-default bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              {...form.register("contactType", {
                onChange: (e) => setContactType(e.target.value as "email" | "phone")
              })}
            >
              <option value="email">{tAuth('email')}</option>
              <option value="phone">{tAuth('phone')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-foreground">
              {contactType === "email" ? t('emailAddress') : t('phoneNumber')}
            </label>
            <input
              type={contactType === "email" ? "email" : "tel"}
              placeholder={
                contactType === "email" ? t('emailPlaceholder') : t('phonePlaceholder')
              }
              className="w-full px-4 py-3 rounded-lg border border-default bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              {...form.register("contact", { required: true })}
            />
          </div>

          {error && (
            <div className="bg-danger border border-danger-border px-4 py-3 rounded-lg text-sm text-danger">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-on-primary py-3 rounded-lg font-medium hover:bg-primary-hover disabled:opacity-50 shadow-card transition"
          >
            {loading ? t('initiating') : t('sendRecoveryCodes')}
          </button>

          <button
            type="button"
            onClick={onBack}
            className="text-muted hover:underline text-sm"
          >
            {t('backToMethods')}
          </button>
        </form>
      </div>
    </div>
  );
}
