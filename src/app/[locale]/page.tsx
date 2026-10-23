"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/routing";
import { useAuthStore } from "@/stores/auth-store";
import { useTranslations } from "next-intl";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, hasWallet } = useAuthStore();
  const t = useTranslations('common');
  const tRecovery = useTranslations('recovery');

  // Auto-redirect based on auth state
  useEffect(() => {
    if (isAuthenticated && hasWallet) {
      router.push("/dashboard");
    } else if (isAuthenticated && !hasWallet) {
      router.push("/onboarding");
    }
  }, [isAuthenticated, hasWallet, router]);

  const handleGetStarted = () => {
    router.push("/onboarding");
  };

  const handleRecover = () => {
    router.push("/recovery");
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4 pt-20">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-3 text-foreground">
            {t('appName')}
          </h1>
          <p className="text-muted text-lg">
            {t('tagline')}
          </p>
        </div>

        <div className="bg-card rounded-2xl shadow-card p-8 border border-subtle space-y-4">
          <button
            onClick={handleGetStarted}
            className="w-full bg-primary text-on-primary py-4 rounded-lg font-medium hover:bg-primary-hover shadow-card transition text-lg"
          >
            {t('getStarted')}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-subtle"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-card text-muted">{t('or')}</span>
            </div>
          </div>

          <button
            onClick={handleRecover}
            className="w-full bg-card-muted text-foreground py-4 rounded-lg font-medium hover:bg-card border border-default transition"
          >
            {tRecovery('recoverWallet')}
          </button>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-muted">
            {t('securityMessage')}
          </p>
        </div>
      </div>
    </div>
  );
}
