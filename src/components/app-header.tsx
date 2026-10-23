"use client";

import { useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { useAuthStore } from "@/stores/auth-store";
import { LanguageSwitcher } from "@/components/language-switcher";
import { CurrencySelector } from "@/components/currency-selector";
import { MobileSidebar } from "@/components/mobile-sidebar";

interface AppHeaderProps {
  showLanguageSwitcher?: boolean;
}

export function AppHeader({ showLanguageSwitcher = true }: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('wallet');
  const tAuth = useTranslations('auth');
  const tCommon = useTranslations('common');
  const { isAuthenticated, clearSession, user } = useAuthStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  // CRITICAL: Only use smart wallet address, never show EOA to users
  // If smart wallet address is not available, hide wallet info
  const displayAddress = user?.smartWalletAddress;
  
  // Show wallet info and currency selector on dashboard
  const isDashboard = pathname?.includes('/dashboard');
  const showWalletInfo = isDashboard && isAuthenticated && displayAddress;
  
  const handleCopyAddress = async () => {
    if (!displayAddress) return;
    
    try {
      await navigator.clipboard.writeText(displayAddress);
      toast.success(tCommon('copiedToClipboard') || 'Copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy address:', err);
      toast.error('Failed to copy address');
    }
  };
  
  const handleLogout = () => {
    clearSession();
    // Extract locale from pathname
    const locale = pathname?.split('/')[1] || 'en';
    router.push(`/${locale}/onboarding`);
  };
  
  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-surface/95 backdrop-blur-md border-b border-subtle shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-2.5">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* Left side - Logo/Avatar and Title */}
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
              {/* User avatar or default logo */}
              {user?.profilePicture && !imageError ? (
                <div className="relative w-7 h-7 sm:w-8 sm:h-8 rounded-lg overflow-hidden shrink-0 bg-card-muted">
                  <Image 
                    src={user.profilePicture} 
                    alt="Profile"
                    width={32}
                    height={32}
                    className="w-full h-full object-cover"
                    unoptimized
                    onError={() => setImageError(true)}
                  />
                </div>
              ) : (
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                  <span className="text-on-primary font-bold text-sm sm:text-base">Ξ</span>
                </div>
              )}
              
              <div className="flex flex-col min-w-0 overflow-hidden">
                <span className="font-semibold text-foreground text-sm sm:text-base truncate">
                  {showWalletInfo ? t('title') : "KASH Wallet"}
                </span>
                {showWalletInfo && displayAddress && (
                  <div className="flex items-center gap-1">
                    <span className="text-muted text-[10px] sm:text-xs font-mono truncate max-w-[100px] sm:max-w-none">
                      {displayAddress.slice(0, 6)}...{displayAddress.slice(-4)}
                    </span>
                    <button
                      onClick={handleCopyAddress}
                      className="shrink-0 p-0.5 hover:bg-card-muted rounded transition-colors group"
                      title={tCommon('copyAddress') || 'Copy address'}
                      aria-label="Copy wallet address"
                    >
                      <svg 
                        className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted group-hover:text-foreground transition-colors" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" 
                        />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            {/* Desktop controls - hidden on mobile when logged in */}
            <div className="hidden md:flex items-center gap-2 lg:gap-3 shrink-0">
              {showWalletInfo && (
                <>
                  {/* Currency selector */}
                  <CurrencySelector />
                  
                  {/* Logout button */}
                  <button
                    onClick={handleLogout}
                    className="text-sm text-danger hover:bg-danger/10 px-3 py-1.5 rounded-lg transition-colors"
                    title={tAuth('logout')}
                  >
                    {tAuth('logout')}
                  </button>
                </>
              )}
              
              {/* Language switcher */}
              {showLanguageSwitcher && (
                <LanguageSwitcher />
              )}
            </div>

            {/* Mobile controls */}
            <div className="flex md:hidden items-center gap-2 shrink-0">
              {/* Language switcher for non-authenticated users on mobile */}
              {!showWalletInfo && showLanguageSwitcher && (
                <div className="scale-90 origin-right">
                  <LanguageSwitcher />
                </div>
              )}

              {/* Hamburger menu - only show when authenticated */}
              {showWalletInfo && (
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="p-2 hover:bg-card-muted rounded-lg transition-colors"
                  aria-label="Open menu"
                >
                  <svg
                    className="w-6 h-6 text-foreground"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Sidebar */}
      <MobileSidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />
    </>
  );
}
