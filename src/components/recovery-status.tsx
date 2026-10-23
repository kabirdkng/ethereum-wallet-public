"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import { useCloudBackups } from "@/hooks/useCloudBackups";
import { useRecoveryContacts } from "@/hooks/useRecoveryContacts";
import { checkMnemonicBackupStatus } from "@/lib/storage/indexeddb";
import { authenticatedFetch } from "@/lib/api/fetch-with-auth";

interface RecoveryStatusProps {
  onEditRecovery: () => void;
  refreshTrigger?: number;
}

export default function RecoveryStatus({ onEditRecovery, refreshTrigger }: RecoveryStatusProps) {
  const t = useTranslations('profile.recovery');
  const { sessionToken, user } = useAuthStore();
  const { backups: cloudBackups, loading: cloudLoading, fetchBackups } = useCloudBackups();
  const { contacts: recoveryContacts, loading: contactsLoading, fetchContacts } = useRecoveryContacts(sessionToken);
  const [hasMnemonicBackup, setHasMnemonicBackup] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const loading = cloudLoading || contactsLoading;

  // Check mnemonic backup status on mount and when refreshTrigger changes
  useEffect(() => {
    const checkMnemonicStatus = async () => {
      if (user?.walletAddress) {
        try {
          const mnemonicStatus = await checkMnemonicBackupStatus(user.walletAddress);
          setHasMnemonicBackup(mnemonicStatus);
        } catch (err) {
          console.error("Error checking mnemonic backup status:", err);
        }
      }
    };

    checkMnemonicStatus();
  }, [user?.walletAddress, refreshTrigger]);

  // Force refresh when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      fetchBackups(true);
      fetchContacts(true);
    }
  }, [refreshTrigger, fetchBackups, fetchContacts]);

  const handleDelete = async (method: "social" | "password" | "oauth-google" | "oauth-facebook" | "mnemonic") => {
    if (!sessionToken) return;
    
    // For mnemonic backup, handle client-side deletion
    if (method === "mnemonic") {
      if (!confirm(t('deleteMnemonicConfirm'))) return;

      setDeleting(method);
      try {
        if (user?.walletAddress) {
          // Import the storage functions
          const { saveWalletRecord, getAllWallets } = await import("@/lib/storage/indexeddb");
          const allWallets = await getAllWallets();
          const walletRecord = allWallets.find(
            (w) => w.address.toLowerCase() === user.walletAddress!.toLowerCase()
          );
          
          if (walletRecord) {
            await saveWalletRecord({
              ...walletRecord,
              hasMnemonicBackup: false,
            });
          }
          setHasMnemonicBackup(false);
        }
      } catch (err) {
        console.error("Error deleting mnemonic backup:", err);
        setError(err instanceof Error ? err.message : "Failed to delete mnemonic backup");
      } finally {
        setDeleting(null);
      }
      return;
    }
    
    const confirmMessage = method === "social" 
      ? t('deleteConfirm')
      : t('deleteBackupConfirm');
    
    if (!confirm(confirmMessage)) return;

    setDeleting(method);
    setError("");

    try {
      const response = await authenticatedFetch("/api/recovery/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken,
          method,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete recovery method");
      }

      // Refresh the list (force refresh to bypass cache)
      await Promise.all([
        fetchBackups(true),
        fetchContacts(true),
      ]);
    } catch (err) {
      console.error("Error deleting recovery method:", err);
      setError(err instanceof Error ? err.message : "Failed to delete recovery method");
    } finally {
      setDeleting(null);
    }
  };

  const hasAnyRecovery = recoveryContacts.length > 0 || cloudBackups.length > 0 || hasMnemonicBackup;

  if (loading) {
    return (
      <div className="text-center py-4">
        <p className="text-muted">{t('loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-danger border border-danger-border rounded-lg p-3">
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  if (!hasAnyRecovery) {
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
            <button
              onClick={onEditRecovery}
              className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              {t('setupRecovery')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Social Recovery Status */}
      {recoveryContacts.length > 0 && (
        <div className="border border-default rounded-lg p-4 bg-surface">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 flex-1">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">{t('socialRecovery')}</h4>
                <p className="text-xs text-muted">
                  {recoveryContacts.length} {recoveryContacts.length !== 1 ? t('trustedContactsPlural') : t('trustedContacts')} {t('configured')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-success/10 text-success text-xs font-medium rounded">
                {t('active')}
              </span>
              <button
                onClick={() => handleDelete("social")}
                disabled={deleting === "social"}
                className="p-1.5 text-error hover:bg-error/10 rounded transition"
                title={t('deleteSocialRecovery')}
              >
                {deleting === "social" ? (
                  <div className="w-4 h-4 border-2 border-error border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <p className="text-xs text-muted">
            {t('needToRecover', { 
              count: Math.ceil(recoveryContacts.length * 0.6), 
              total: recoveryContacts.length 
            })}
          </p>
        </div>
      )}

      {/* Mnemonic Backup Status */}
      {hasMnemonicBackup && (
        <div className="border border-default rounded-lg p-4 bg-surface">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 flex-1">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">{t('manualBackup')}</h4>
                <p className="text-xs text-muted">
                  {t('manualBackupDescription')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-success/10 text-success text-xs font-medium rounded">
                {t('active')}
              </span>
              <button
                onClick={() => handleDelete("mnemonic")}
                disabled={deleting === "mnemonic"}
                className="p-1.5 text-error hover:bg-error/10 rounded transition"
                title={t('deleteMnemonicBackup')}
              >
                {deleting === "mnemonic" ? (
                  <div className="w-4 h-4 border-2 border-error border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <p className="text-xs text-muted">
            {t('useRecoveryPhrase')}
          </p>
        </div>
      )}

      {/* Cloud Backups Status */}
      {cloudBackups.map((backup) => {
        const method = backup.backupSource === "manual" ? "password" : backup.backupSource as "oauth-google" | "oauth-facebook";
        
        return (
          <div key={backup.id} className="border border-default rounded-lg p-4 bg-surface">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2 flex-1">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  {backup.backupSource === "oauth-google" || backup.backupSource === "oauth-facebook" ? (
                    <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    {backup.backupSource === "oauth-google" ? t('googleBackup') : 
                     backup.backupSource === "oauth-facebook" ? t('facebookBackup') : 
                     t('passwordBackup')}
                  </h4>
                  <p className="text-xs text-muted">
                    {t('created')} {new Date(backup.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-success/10 text-success text-xs font-medium rounded">
                  {t('active')}
                </span>
                <button
                  onClick={() => handleDelete(method)}
                  disabled={deleting === method}
                  className="p-1.5 text-error hover:bg-error/10 rounded transition"
                  title={t('deleteBackup')}
                >
                  {deleting === method ? (
                    <div className="w-4 h-4 border-2 border-error border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <p className="text-xs text-muted">
              {backup.backupSource === "oauth-google" || backup.backupSource === "oauth-facebook"
                ? t('signInOAuth')
                : t('useBackupPassword')}
            </p>
          </div>
        );
      })}

      {/* Action Button */}
      <button
        onClick={onEditRecovery}
        className="w-full py-3 border-2 border-dashed border-subtle hover:border-primary rounded-lg text-sm text-primary hover:bg-primary/5 transition"
      >
        {t('addAnotherMethod')}
      </button>
    </div>
  );
}
