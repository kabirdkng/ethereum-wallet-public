# Internationalization (i18n) Guide

## Overview

This application supports multiple languages using `next-intl`. Currently supported languages:
- **English (en)** - Default
- **French (fr)**
- **Haitian Creole (ht)**
- **Spanish (es)**

## File Structure

```
src/
├── i18n/
│   ├── request.ts       # next-intl configuration
│   └── routing.ts       # Routing configuration and navigation helpers
├── middleware.ts        # Locale detection and routing middleware
messages/
├── en.json             # English translations
├── fr.json             # French translations
├── ht.json             # Haitian Creole translations
└── es.json             # Spanish translations
```

## How to Use Translations in Components

### 1. Client Components

For client components, use the `useTranslations` hook:

```tsx
"use client";

import { useTranslations } from 'next-intl';

export default function MyComponent() {
  const t = useTranslations('wallet'); // Load 'wallet' namespace
  
  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('balance')}: {balance}</p>
    </div>
  );
}
```

### 2. Server Components

For server components, use the async version:

```tsx
import { getTranslations } from 'next-intl/server';

export default async function MyServerComponent() {
  const t = await getTranslations('wallet');
  
  return (
    <div>
      <h1>{t('title')}</h1>
    </div>
  );
}
```

### 3. Multiple Namespaces

```tsx
const t = useTranslations('wallet');
const tCommon = useTranslations('common');

return (
  <div>
    <h1>{t('title')}</h1>
    <button>{tCommon('save')}</button>
  </div>
);
```

### 4. Dynamic Values

```tsx
// In messages/en.json:
{
  "greeting": "Hello, {name}!"
}

// In component:
const t = useTranslations();
<p>{t('greeting', { name: 'John' })}</p>
// Output: "Hello, John!"
```

## Navigation

### Use Locale-Aware Navigation

Replace all instances of Next.js navigation with locale-aware versions:

**Before:**
```tsx
import { useRouter } from 'next/navigation';
import Link from 'next/link';
```

**After:**
```tsx
import { useRouter, Link } from '@/i18n/routing';
```

### Examples

```tsx
// Link component
<Link href="/dashboard">Dashboard</Link>

// Programmatic navigation
const router = useRouter();
router.push('/dashboard');

// Get current pathname
const pathname = usePathname();

// Redirect
redirect('/login');
```

These will automatically include the current locale in the URL (e.g., `/en/dashboard`, `/fr/dashboard`).

## Language Switcher Component

Two components are available for language switching:

### 1. Full Language Switcher (Desktop)

```tsx
import { LanguageSwitcher } from '@/components/language-switcher';

<LanguageSwitcher />
```

### 2. Compact Language Switcher (Mobile/Header)

```tsx
import { LanguageSwitcherCompact } from '@/components/language-switcher';

<LanguageSwitcherCompact />
```

## Adding New Translations

### 1. Add to Translation Files

Update all four language files in `messages/`:

**messages/en.json:**
```json
{
  "myFeature": {
    "title": "My Feature",
    "description": "This is my new feature"
  }
}
```

**messages/fr.json:**
```json
{
  "myFeature": {
    "title": "Ma fonctionnalité",
    "description": "Ceci est ma nouvelle fonctionnalité"
  }
}
```

And so on for `ht.json` and `es.json`.

### 2. Use in Components

```tsx
const t = useTranslations('myFeature');

<div>
  <h2>{t('title')}</h2>
  <p>{t('description')}</p>
</div>
```

## Translation File Structure

Translations are organized by feature/domain:

```json
{
  "common": {
    "loading": "Loading...",
    "error": "Error",
    "save": "Save"
  },
  "auth": {
    "login": "Log In",
    "logout": "Log Out"
  },
  "wallet": {
    "title": "My Wallet",
    "balance": "Balance"
  },
  "send": {
    "title": "Send Money",
    "recipient": "Recipient"
  },
  "recovery": {
    "title": "Recovery",
    "setupRecovery": "Set Up Recovery"
  }
}
```

## Best Practices

1. **Use Namespaces**: Group related translations together (e.g., `wallet`, `auth`, `send`)

2. **Keep Keys Consistent**: Use the same key structure across all language files

3. **Avoid Hardcoded Text**: Always use translation keys instead of hardcoded strings

4. **Use Locale-Aware Navigation**: Always import from `@/i18n/routing` instead of `next/navigation`

5. **Test All Languages**: Verify translations display correctly in all supported languages

6. **Add Context**: Use descriptive key names that indicate where/how the text is used

## API Routes and Server Actions

API routes don't need translation since they only handle data. However, error messages returned to the client should use error codes that can be translated on the frontend:

```tsx
// API Route
return NextResponse.json({ 
  error: 'INSUFFICIENT_BALANCE' 
}, { status: 400 });

// Client Component
const t = useTranslations('errors');
if (error === 'INSUFFICIENT_BALANCE') {
  showError(t('insufficientBalance'));
}
```

## URL Structure

With locale routing enabled, URLs follow this pattern:

```
/en/dashboard
/fr/dashboard
/ht/recovery
/es/onboarding
```

The middleware automatically:
- Detects user's preferred language from browser settings
- Redirects `/` to `/en/` (default locale)
- Preserves locale when navigating between pages

## Migration Checklist

To migrate existing components to use i18n:

- [ ] Replace `next/navigation` imports with `@/i18n/routing`
- [ ] Add `useTranslations()` hook at component top
- [ ] Replace hardcoded text with `t('key')` calls
- [ ] Add corresponding translations to all language files
- [ ] Test component in all supported languages
- [ ] Update any `Link` components to use locale-aware version

## Example Migration

**Before:**
```tsx
"use client";
import { useRouter } from 'next/navigation';

export default function MyComponent() {
  const router = useRouter();
  
  return (
    <div>
      <h1>My Wallet</h1>
      <button onClick={() => router.push('/dashboard')}>
        Go to Dashboard
      </button>
    </div>
  );
}
```

**After:**
```tsx
"use client";
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';

export default function MyComponent() {
  const router = useRouter();
  const t = useTranslations('wallet');
  
  return (
    <div>
      <h1>{t('title')}</h1>
      <button onClick={() => router.push('/dashboard')}>
        {t('goToDashboard')}
      </button>
    </div>
  );
}
```

## Adding a New Language

To add support for a new language:

1. Add locale code to `src/i18n/request.ts`:
   ```ts
   export const locales = ['en', 'fr', 'ht', 'es', 'pt'] as const;
   ```

2. Update middleware matcher in `src/middleware.ts`:
   ```ts
   matcher: ['/', '/(fr|ht|es|pt|en)/:path*']
   ```

3. Create new translation file: `messages/pt.json`

4. Add language to `language-switcher.tsx`:
   ```ts
   const languageNames: Record<Locale, string> = {
     // ... existing
     pt: 'Português',
   };
   
   const languageFlags: Record<Locale, string> = {
     // ... existing
     pt: '🇵🇹',
   };
   ```

5. Translate all keys in the new language file
