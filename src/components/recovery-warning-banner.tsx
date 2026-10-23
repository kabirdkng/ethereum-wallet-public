"use client";

import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import { useCloudBackups } from "@/hooks/useCloudBackups";
import { useRecoveryContacts } from "@/hooks/useRecoveryContacts";
import { useMnemonicBackup } from "@/hooks/useMnemonicBackup";

interface RecoveryWarningBannerProps {
  onSetupRecovery?: () => void;
}

export function RecoveryWarningBanner({ onSetupRecovery }: RecoveryWarningBannerProps) {
  const t = useTranslations('profile.recovery');
  const { sessionToken } = useAuthStore();
  
  // These hooks will auto-fetch on first mount and cache the results
  const { backups: cloudBackups, loading: cloudLoading, fetched: cloudFetched } = useCloudBackups();
  const { contacts: recoveryContacts, loading: contactsLoading, fetched: contactsFetched } = useRecoveryContacts(sessionToken);
  const { hasMnemonicBackup, loading: mnemonicLoading, fetched: mnemonicFetched } = useMnemonicBackup();

  // Calculate if we have recovery methods
  const hasRecovery = recoveryContacts.length > 0 || cloudBackups.length > 0 || hasMnemonicBackup;
  const loading = cloudLoading || contactsLoading || mnemonicLoading;
  
  // Only consider data ready if all three have been fetched at least once
  const dataReady = cloudFetched && contactsFetched && mnemonicFetched;

  // Don't show anything while loading, if recovery exists, or if data isn't ready yet
  if (loading || hasRecovery || !dataReady) {
    return null;
  }

  return (
    <div className="bg-warning-soft border border-subtle rounded-lg p-4">
      <div className="flex items-start gap-3">
        <svg
          className="w-5 h-5 text-warning mt-0.5 shrink-0"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">{t('noMethods')}</p>
          <p className="text-xs text-muted mt-1 mb-3">
            {t('noMethodsDescription')}
          </p>
          {onSetupRecovery && (
            <button
              onClick={onSetupRecovery}
              className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              {t('setupRecovery')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
