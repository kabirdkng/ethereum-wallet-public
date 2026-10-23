"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import { LanguageSwitcher } from "@/components/language-switcher";
import { CurrencySelector } from "@/components/currency-selector";

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileSidebar({ isOpen, onClose }: MobileSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('wallet');
  const tAuth = useTranslations('auth');
  const tCommon = useTranslations('common');
  const { user, clearSession } = useAuthStore();
  const previousPathname = useRef(pathname);

  // Close sidebar on route change (but not on initial mount)
  useEffect(() => {
    if (previousPathname.current !== pathname && isOpen) {
      onClose();
    }
    previousPathname.current = pathname;
  }, [pathname, isOpen, onClose]);

  // Prevent body scroll when sidebar is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleLogout = () => {
    clearSession();
    const locale = pathname?.split('/')[1] || 'en';
    router.push(`/${locale}/onboarding`);
    onClose();
  };

  const handleProfileClick = () => {
    // Check if we're already on the dashboard page
    const locale = pathname?.split('/')[1] || 'en';
    const dashboardPath = `/${locale}/dashboard`;
    
    if (!pathname?.includes('/dashboard')) {
      router.push(dashboardPath);
    }
    
    // Scroll to profile section after a short delay
    setTimeout(() => {
      const profileSection = document.getElementById('profile-section');
      if (profileSection) {
        profileSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
    
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <div
        className={`fixed top-0 right-0 h-full w-[280px] bg-surface border-l border-subtle shadow-2xl z-50 transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-subtle">
            <h2 className="text-lg font-semibold text-foreground">Menu</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-card-muted rounded-lg transition-colors"
              aria-label="Close menu"
            >
              <svg
                className="w-5 h-5 text-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Wallet Info */}
            {user?.smartWalletAddress && (
              <div className="mb-6 p-4 bg-card rounded-lg border border-subtle">
                <div className="text-xs text-muted mb-1">{t('yourWallet')}</div>
                <div className="font-mono text-sm text-foreground break-all">
                  {user.smartWalletAddress.slice(0, 8)}...{user.smartWalletAddress.slice(-6)}
                </div>
              </div>
            )}

            {/* Menu Items */}
            <nav className="space-y-2">
              {/* Profile */}
              <button
                onClick={handleProfileClick}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-card-muted transition-colors text-left group"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <svg
                    className="w-5 h-5 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">Profile</div>
                  <div className="text-xs text-muted">
                    {user?.email || user?.phone}
                  </div>
                </div>
              </button>

              {/* Currency Selector */}
              <div className="p-3 rounded-lg bg-card border border-subtle">
                <div className="text-xs text-muted mb-2">{tCommon('currency')}</div>
                <CurrencySelector />
              </div>

              {/* Language Selector */}
              <div className="p-3 rounded-lg bg-card border border-subtle">
                <div className="text-xs text-muted mb-2">{tCommon('language')}</div>
                <LanguageSwitcher />
              </div>
            </nav>
          </div>

          {/* Footer - Logout */}
          <div className="p-4 border-t border-subtle">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 p-3 rounded-lg bg-danger/10 hover:bg-danger/20 transition-colors text-danger group"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              <span className="font-medium">{tAuth('logout')}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
