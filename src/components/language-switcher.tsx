"use client";

import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/routing';
import { locales, type Locale } from '@/i18n/request';
import { useState, useTransition } from 'react';

const languageNames: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  ht: 'Kreyòl Ayisyen',
  es: 'Español',
};

const languageFlags: Record<Locale, string> = {
  en: '🇺🇸',
  fr: '🇫🇷',
  ht: '🇭🇹',
  es: '🇪🇸',
};

export function LanguageSwitcher() {
  const t = useTranslations('languages');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);

  function onSelectChange(nextLocale: Locale) {
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
      setIsOpen(false);
    });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        disabled={isPending}
      >
        <span className="text-xl">{languageFlags[locale]}</span>
        <span className="font-medium">{languageNames[locale]}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-56 rounded-lg shadow-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 z-20">
            <div className="p-2">
              <div className="px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                {t('selectLanguage')}
              </div>
              {locales.map((loc) => (
                <button
                  key={loc}
                  onClick={() => onSelectChange(loc)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                    locale === loc
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                  disabled={isPending}
                >
                  <span className="text-xl">{languageFlags[loc]}</span>
                  <span className="font-medium">{languageNames[loc]}</span>
                  {locale === loc && (
                    <svg
                      className="w-5 h-5 ml-auto text-blue-600 dark:text-blue-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

