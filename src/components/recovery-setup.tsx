"use client";

import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { splitMnemonic } from "@/lib/crypto/recovery";
import { RecoveryContactInput } from "@/components/recovery/contact-input";
import { SkipRecoveryConfirmation } from "@/components/recovery/skip-confirmation";
import MethodSelector from "@/components/recovery/method-selector";
import CloudBackupSetup from "@/components/cloud-backup-setup";
import OAuthCloudBackupSetup from "@/components/oauth-cloud-backup";
import MnemonicBackupDisplay from "@/components/recovery/mnemonic-backup-display";
import MnemonicVerification from "@/components/recovery/mnemonic-verification";
import { useAuthStore } from "@/stores/auth-store";
import { useRecoveryContacts } from "@/hooks/useRecoveryContacts";
import { useCloudBackups } from "@/hooks/useCloudBackups";
import { markMnemonicBackupComplete, checkMnemonicBackupStatus } from "@/lib/storage/indexeddb";
import { authenticatedFetch, createAuthJsonHeaders } from "@/lib/api/fetch-with-auth";

type RecoveryContact = {
  phone: string;
  name: string;
};

type RecoveryFormData = {
  contacts: RecoveryContact[];
};

type RecoveryMethod = "social" | "cloud" | "oauth" | "shamir" | "mnemonic" | null;
type MnemonicBackupStep = "display" | "verify" | null;

interface RecoverySetupProps {
  walletAddress: string;
  mnemonic: string;
  sessionToken: string;
  onComplete: () => void;
}

export default function RecoverySetup({
  walletAddress,
  mnemonic,
  sessionToken,
  onComplete,
}: RecoverySetupProps) {
  const t = useTranslations('recovery');
  const tSocial = useTranslations('recovery.socialSetup');
  const tToast = useTranslations('toast');
  const { invalidateCache, fetchContacts } = useRecoveryContacts(sessionToken);
  const { contacts: recoveryContacts } = useRecoveryContacts(sessionToken);
  const { backups: cloudBackups } = useCloudBackups();
  const [selectedMethod, setSelectedMethod] = useState<RecoveryMethod>(null);
  const [mnemonicBackupStep, setMnemonicBackupStep] = useState<MnemonicBackupStep>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipRecovery, setSkipRecovery] = useState(false);
  const [hasMnemonicBackup, setHasMnemonicBackup] = useState(false);
  
  const { user } = useAuthStore();
  const isOAuthUser = user?.oauthProvider && user.oauthProvider !== "traditional";

  // Check mnemonic backup status
  useEffect(() => {
    const checkMnemonic = async () => {
      const mnemonicStatus = await checkMnemonicBackupStatus(walletAddress);
      setHasMnemonicBackup(mnemonicStatus);
    };
    checkMnemonic();
  }, [walletAddress]);

  // Calculate configured methods from cached data
  const configuredMethods = {
    hasSocialRecovery: recoveryContacts.length > 0,
    hasPasswordBackup: cloudBackups.some((b) => b.backupSource === "manual"),
    hasOAuthBackup: cloudBackups.some((b) => b.backupSource.startsWith("oauth-")),
    hasMnemonicBackup: hasMnemonicBackup,
  };

  const { register, control, handleSubmit } = useForm<RecoveryFormData>({
    defaultValues: {
      contacts: [
        { phone: "", name: "" },
        { phone: "", name: "" },
        { phone: "", name: "" },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "contacts",
  });

  const onSubmit = async (data: RecoveryFormData) => {
    setLoading(true);
    setError(null);

    try {
      const validContacts = data.contacts.filter(c => c.phone.trim() !== "");

      if (validContacts.length < 3) {
        setError(tSocial('minContactsError'));
        setLoading(false);
        return;
      }

      // Split mnemonic into shares client-side
      const totalShares = validContacts.length;
      const threshold = Math.ceil(totalShares * 0.6);
      const shares = splitMnemonic(mnemonic, totalShares, threshold);

      // Prepare contacts with unencrypted shares
      // Shares will be encrypted when recovery is initiated
      const contactsWithShares = validContacts.map((contact, index) => ({
        phone: contact.phone,
        name: contact.name || "",
        share: shares[index], // Store share directly (will be encrypted server-side with phone hash)
      }));

      const response = await authenticatedFetch("/api/recovery/setup", {
        method: "POST",
        headers: createAuthJsonHeaders(sessionToken),
        body: JSON.stringify({
          sessionToken,
          walletAddress,
          contacts: contactsWithShares,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || tSocial('setupFailed'));
      }

      toast.success(tToast('socialRecoverySetup'));
      invalidateCache(); // Clear cache
      await fetchContacts(true); // Force refetch to update UI
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : tSocial('setupFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    setSkipRecovery(true);
  };

  const handleMnemonicBackupComplete = async () => {
    try {
      // Mark mnemonic backup as complete in IndexedDB (client-side only)
      await markMnemonicBackupComplete(walletAddress);
      toast.success(tToast('mnemonicBackupComplete'));
      
      // Update local state
      setHasMnemonicBackup(true);
      
      // Emit custom event to notify other components that mnemonic backup is completed
      window.dispatchEvent(new CustomEvent('mnemonicBackupCompleted', {
        detail: { walletAddress }
      }));
      
      onComplete();
    } catch (error) {
      console.error("Failed to mark mnemonic backup as complete:", error);
      toast.error(tToast('mnemonicBackupFailed'));
    }
  };

  if (skipRecovery) {
    return (
      <SkipRecoveryConfirmation
        onGoBack={() => setSkipRecovery(false)}
        onContinue={onComplete}
      />
    );
  }

  // Show method selection screen
  if (selectedMethod === null) {
    return (
      <div className="max-w-2xl mx-auto">
        <MethodSelector
          onSelectMethod={(method) => {
            // Map "shamir" to "social" for backward compatibility
            if (method === "shamir") {
              setSelectedMethod("social");
            } else if (method === "mnemonic") {
              setSelectedMethod("mnemonic");
              setMnemonicBackupStep("display");
            } else {
              setSelectedMethod(method);
            }
          }}
          showOAuth={!!isOAuthUser}
          configuredMethods={configuredMethods}
          isSetupMode={true}
        />

        <div className="mt-6 bg-card-muted border border-subtle rounded-lg p-4">
          <p className="text-sm text-muted">
            <strong>💡 {t('proTip')}</strong> {t('multipleMethodsTip')}
          </p>
        </div>

        <div className="text-center mt-4">
          <button
            type="button"
            onClick={handleSkip}
            className="text-muted hover:underline text-sm"
          >
            {t('skipForNow')}
          </button>
        </div>
      </div>
    );
  }

  // Show Mnemonic Backup Setup
  if (selectedMethod === "mnemonic") {
    // Display step: show mnemonic with instructions
    if (mnemonicBackupStep === "display") {
      return (
        <MnemonicBackupDisplay
          mnemonic={mnemonic}
          onContinue={() => setMnemonicBackupStep("verify")}
          onBack={() => {
            setSelectedMethod(null);
            setMnemonicBackupStep(null);
          }}
        />
      );
    }

    // Verify step: user enters mnemonic to confirm they saved it
    if (mnemonicBackupStep === "verify") {
      return (
        <MnemonicVerification
          mnemonic={mnemonic}
          onSuccess={handleMnemonicBackupComplete}
          onBack={() => setMnemonicBackupStep("display")}
        />
      );
    }
  }

  // Show Cloud Backup Setup
  if (selectedMethod === "cloud") {
    return (
      <CloudBackupSetup
        walletAddress={walletAddress}
        mnemonic={mnemonic}
        sessionToken={sessionToken}
        onComplete={onComplete}
        onBack={() => setSelectedMethod(null)}
      />
    );
  }

  // Show OAuth Cloud Backup Setup
  if (selectedMethod === "oauth") {
    return (
      <OAuthCloudBackupSetup
        walletAddress={walletAddress}
        mnemonic={mnemonic}
        sessionToken={sessionToken}
        onComplete={onComplete}
        onBack={() => setSelectedMethod(null)}
      />
    );
  }

  // Show Social Recovery Setup (existing form)
  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2 text-foreground">{tSocial('title')}</h2>
        <p className="text-muted">
          {tSocial('description')}
        </p>
      </div>

      <div className="bg-card-muted border border-subtle rounded-lg p-4">
        <p className="text-sm text-foreground">
          <strong>{tSocial('howItWorksTitle')}</strong> {tSocial('howItWorksDescription')}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="space-y-4">
          {fields.map((field, index) => (
            <RecoveryContactInput
              key={field.id}
              index={index}
              register={register}
              canRemove={index >= 3}
              onRemove={() => remove(index)}
            />
          ))}
        </div>

        {fields.length < 5 && (
          <button
            type="button"
            onClick={() => append({ phone: "", name: "" })}
            className="text-primary hover:underline text-sm self-start"
          >
            {tSocial('addAnotherContact')}
          </button>
        )}

        {error && (
          <div className="bg-danger border border-danger-border px-4 py-3 rounded-lg text-sm text-danger">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setSelectedMethod(null)}
            className="flex-1 border border-gray-300 py-3 rounded-lg font-medium hover:bg-gray-50"
            disabled={loading}
          >
            {tSocial('back')}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-primary text-on-primary py-3 rounded-lg font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed shadow-card transition"
          >
            {loading ? tSocial('settingUp') : tSocial('completeSetup')}
          </button>
        </div>
      </form>
    </div>
  );
}
