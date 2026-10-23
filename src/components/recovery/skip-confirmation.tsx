"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import { authenticatedFetch, createAuthHeader } from "@/lib/api/fetch-with-auth";

interface SkipRecoveryConfirmationProps {
  onGoBack: () => void;
  onContinue: () => void;
}

export function SkipRecoveryConfirmation({ onGoBack, onContinue }: SkipRecoveryConfirmationProps) {
  const t = useTranslations('recovery');
  const { sessionToken } = useAuthStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkExistingRecovery = async () => {
      if (!sessionToken) {
        setChecking(false);
        return;
      }

    try {
      // Check both social recovery and cloud backup
      const [contactsRes, backupsRes] = await Promise.all([
        authenticatedFetch("/api/recovery/contacts", {
          method: "GET",
          headers: createAuthHeader(sessionToken),
        }),
        authenticatedFetch("/api/recovery/cloud/list", {
          method: "GET",
          headers: createAuthHeader(sessionToken),
        }),
      ]);        let hasRecovery = false;

        if (contactsRes.ok) {
          const contactsData = await contactsRes.json();
          if (contactsData.contacts && contactsData.contacts.length > 0) {
            hasRecovery = true;
          }
        }

        if (!hasRecovery && backupsRes.ok) {
          const backupsData = await backupsRes.json();
          if (backupsData.backups && backupsData.backups.length > 0) {
            hasRecovery = true;
          }
        }

        // If recovery already exists, skip directly to wallet
        if (hasRecovery) {
          onContinue();
          return;
        }

        setChecking(false);
      } catch (error) {
        console.error("Error checking recovery methods:", error);
        setChecking(false);
      }
    };

    checkExistingRecovery();
  }, [sessionToken, onContinue]);

  if (checking) {
    return (
      <div className="flex flex-col gap-6 items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-muted text-sm">{t('checkingStatus')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 items-center">
      <div className="bg-warning-soft border border-subtle rounded-lg p-6 text-center">
        <p className="text-foreground font-medium mb-2">
          ⚠️ {t('notConfigured')}
        </p>
        <p className="text-sm text-muted">
          {t('setupLaterMessage')}
        </p>
      </div>
      <div className="flex gap-4">
        <button
          onClick={onGoBack}
          className="bg-card text-foreground px-6 py-3 rounded-lg hover:bg-card-muted border border-default shadow-card transition"
        >
          {t('goBack')}
        </button>
        <button
          onClick={onContinue}
          className="bg-primary text-on-primary px-6 py-3 rounded-lg hover:bg-primary-hover shadow-card transition"
        >
          {t('continueToWallet')}
        </button>
      </div>
    </div>
  );
}
