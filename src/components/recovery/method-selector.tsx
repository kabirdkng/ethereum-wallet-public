"use client";

import { useTranslations } from "next-intl";

interface MethodSelectorProps {
  onSelectMethod: (method: "shamir" | "cloud" | "oauth" | "mnemonic") => void;
  showOAuth?: boolean;
  configuredMethods?: {
    hasSocialRecovery: boolean;
    hasPasswordBackup: boolean;
    hasOAuthBackup: boolean;
    hasMnemonicBackup?: boolean;
  };
  isSetupMode?: boolean; // true for setup, false for recovery
}

export default function MethodSelector({ 
  onSelectMethod, 
  showOAuth = false,
  configuredMethods,
  isSetupMode = false
}: MethodSelectorProps) {
  const t = useTranslations('recovery.methodSelector');
  const hasSocial = configuredMethods?.hasSocialRecovery || false;
  const hasPassword = configuredMethods?.hasPasswordBackup || false;
  const hasOAuth = configuredMethods?.hasOAuthBackup || false;
  const hasMnemonic = configuredMethods?.hasMnemonicBackup || false;

  return (
    <div className="bg-card rounded-2xl shadow-card p-8 border border-subtle">
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2 text-foreground">
            {isSetupMode ? t('setupTitle') : t('recoveryTitle')}
          </h1>
          <p className="text-muted">
            {isSetupMode ? t('setupDescription') : t('recoveryDescription')}
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {/* Social Recovery Option */}
          <button
            onClick={() => onSelectMethod("shamir")}
            className="w-full p-6 rounded-xl border-2 border-default hover:border-primary bg-surface text-left transition group relative"
          >
            {hasSocial && (
              <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-success flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition">
                <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="flex-1 pr-8">
                <h3 className="font-semibold text-lg mb-1 text-foreground group-hover:text-primary transition">
                  {t('socialRecoveryTitle')}
                  {hasSocial && <span className="ml-2 text-xs text-success">({t('configured')})</span>}
                </h3>
                <p className="text-sm text-muted">
                  {t('socialRecoveryDescription')}
                </p>
              </div>
            </div>
          </button>

          {/* Password Backup Option */}
          <button
            onClick={() => onSelectMethod("cloud")}
            className="w-full p-6 rounded-xl border-2 border-default hover:border-primary bg-surface text-left transition group relative"
          >
            {hasPassword && (
              <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-success flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition">
                <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div className="flex-1 pr-8">
                <h3 className="font-semibold text-lg mb-1 text-foreground group-hover:text-primary transition">
                  {t('passwordBackupTitle')}
                  {hasPassword && <span className="ml-2 text-xs text-success">({t('configured')})</span>}
                </h3>
                <p className="text-sm text-muted">
                  {t('passwordBackupDescription')}
                </p>
              </div>
            </div>
          </button>

          {/* OAuth Backup Option - Always show in setup mode */}
          {(showOAuth || isSetupMode) && (
            <button
              onClick={() => onSelectMethod("oauth")}
              className="w-full p-6 rounded-xl border-2 border-default hover:border-primary bg-surface text-left transition group relative"
            >
              {hasOAuth && (
                <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-success flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition">
                  <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                  </svg>
                </div>
                <div className="flex-1 pr-8">
                  <h3 className="font-semibold text-lg mb-1 text-foreground group-hover:text-primary transition">
                    {t('oauthBackupTitle')}
                    {hasOAuth && <span className="ml-2 text-xs text-success">({t('configured')})</span>}
                  </h3>
                  <p className="text-sm text-muted">
                    {t('oauthBackupDescription')}
                  </p>
                </div>
              </div>
            </button>
          )}

          {/* Mnemonic Recovery Option - Show in both modes */}
          <button
            onClick={() => onSelectMethod("mnemonic")}
            className="w-full p-6 rounded-xl border-2 border-default hover:border-primary bg-surface text-left transition group relative"
          >
            {hasMnemonic && isSetupMode && (
              <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-success flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition">
                <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="flex-1 pr-8">
                <h3 className="font-semibold text-lg mb-1 text-foreground group-hover:text-primary transition">
                  {isSetupMode ? t('manualBackupTitle') : t('seedPhraseRecoveryTitle')}
                  {hasMnemonic && isSetupMode && <span className="ml-2 text-xs text-success">({t('configured')})</span>}
                </h3>
                <p className="text-sm text-muted">
                  {isSetupMode 
                    ? t('manualBackupDescription')
                    : t('seedPhraseRecoveryDescription')}
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
