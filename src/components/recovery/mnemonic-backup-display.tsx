"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface MnemonicBackupDisplayProps {
  mnemonic: string;
  onContinue: () => void;
  onBack: () => void;
}

export default function MnemonicBackupDisplay({
  mnemonic,
  onContinue,
  onBack,
}: MnemonicBackupDisplayProps) {
  const t = useTranslations('recovery.mnemonic');
  const tCommon = useTranslations('common');
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const words = mnemonic.split(" ");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mnemonic);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-6 w-full max-w-3xl mx-auto px-4 sm:px-0">
      <div className="text-center">
        <h2 className="text-xl sm:text-2xl font-bold mb-2 text-foreground">
          {t('backupTitle')}
        </h2>
        <p className="text-sm sm:text-base text-muted">
          {t('backupDescription')}
        </p>
      </div>

      {/* Security Warning */}
      <div className="bg-danger-soft border border-danger-border rounded-lg p-3 sm:p-4">
        <div className="flex items-start gap-2 sm:gap-3">
          <svg
            className="w-4 h-4 sm:w-5 sm:h-5 text-danger mt-0.5 shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <p className="text-xs sm:text-sm text-foreground">{t('securityWarning')}</p>
        </div>
      </div>

      {/* Backup Instructions */}
      <div className="bg-primary-soft border border-primary rounded-lg p-3 sm:p-4">
        <div className="flex items-start gap-2 sm:gap-3">
          <svg
            className="w-4 h-4 sm:w-5 sm:h-5 text-primary mt-0.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-xs sm:text-sm text-foreground">{t('backupInstructions')}</p>
        </div>
      </div>

      {/* Mnemonic Words Grid */}
      <div className="bg-card-muted rounded-lg p-3 sm:p-4 md:p-6 border border-subtle overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 mb-3 sm:mb-4">
          {words.map((word, index) => (
            <div
              key={index}
              className="bg-card rounded-lg px-3 sm:px-4 py-2 sm:py-3 border border-default min-w-0"
            >
              <span className="text-muted text-xs sm:text-sm mr-1.5 sm:mr-2 font-medium">
                {index + 1}.
              </span>
              <span className="font-semibold text-sm sm:text-base text-foreground truncate">{word}</span>
            </div>
          ))}
        </div>

        <button
          onClick={handleCopy}
          className="w-full bg-card-muted text-foreground py-2 sm:py-2.5 rounded-lg hover:bg-card border border-default text-xs sm:text-sm font-medium transition flex items-center justify-center gap-2"
        >
          {copied ? (
            <>
              <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {t('copied')}
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {t('copyToClipboard')}
            </>
          )}
        </button>
      </div>

      {/* Confirmation Checkbox */}
      <div className="flex items-start gap-2 sm:gap-3 bg-card-muted border border-subtle rounded-lg p-3 sm:p-4">
        <input
          type="checkbox"
          id="confirm-backup"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 sm:mt-1 w-4 h-4 shrink-0"
        />
        <label htmlFor="confirm-backup" className="text-xs sm:text-sm text-foreground">
          {t('confirmed')}
        </label>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onBack}
          className="w-full sm:flex-1 border border-default py-2.5 sm:py-3 rounded-lg text-sm sm:text-base font-medium hover:bg-card-muted transition"
        >
          {tCommon('back')}
        </button>
        <button
          onClick={onContinue}
          disabled={!confirmed}
          className="w-full sm:flex-1 bg-primary text-on-primary py-2.5 sm:py-3 rounded-lg text-sm sm:text-base font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed shadow-card transition"
        >
          {t('iHaveSavedIt')}
        </button>
      </div>
    </div>
  );
}
