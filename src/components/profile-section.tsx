"use client";

import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import UpdatePinForm from "./update-pin-form";
import RecoveryStatus from "./recovery-status";

interface ProfileSectionProps {
  onEditRecovery: () => void;
  refreshTrigger?: number;
}

export default function ProfileSection({ onEditRecovery, refreshTrigger }: ProfileSectionProps) {
  const t = useTranslations('profile');
  const { user } = useAuthStore();

  return (
    <div className="bg-card rounded-lg border border-subtle shadow-card p-6">
      <h2 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h2>

      {/* Account Information */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-foreground mb-4">{t('accountInformation')}</h3>
        <div className="space-y-3">
          {user?.email && (
            <div className="flex justify-between items-center py-2 border-b border-subtle">
              <span className="text-muted text-sm">{t('email')}</span>
              <span className="text-foreground font-medium">{user.email}</span>
            </div>
          )}
          {user?.phone && (
            <div className="flex justify-between items-center py-2 border-b border-subtle">
              <span className="text-muted text-sm">{t('phone')}</span>
              <span className="text-foreground font-medium">{user.phone}</span>
            </div>
          )}
          {user?.smartWalletAddress && (
            <div className="flex justify-between items-center py-2 border-b border-subtle">
              <span className="text-muted text-sm">{t('walletAddress')}</span>
              <span className="text-foreground font-mono text-sm">
                {user.smartWalletAddress.slice(0, 6)}...{user.smartWalletAddress.slice(-4)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Recovery Options */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-foreground">{t('recoveryMethods')}</h3>
        </div>

        <RecoveryStatus onEditRecovery={onEditRecovery} refreshTrigger={refreshTrigger} />
      </div>

      {/* Security Tips */}
      <div className="mt-8 p-4 bg-card-muted rounded-lg border border-default">
        <h4 className="text-sm font-semibold text-foreground mb-2">{t('securityTips')}</h4>
        <ul className="text-xs text-muted space-y-1">
          <li>• {t('securityTip1')}</li>
          <li>• {t('securityTip2')}</li>
          <li>• {t('securityTip3')}</li>
          <li>• {t('securityTip4')}</li>
        </ul>
      </div>

      {/* PIN Management Section */}
      <div className="mt-8 pt-8 border-t border-subtle">
        <UpdatePinForm />
      </div>
    </div>
  );
}
