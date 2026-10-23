# i18n Quick Reference

## Import Statements

```tsx
// For translations
import { useTranslations } from 'next-intl';

// For navigation (replaces next/navigation)
import { Link, useRouter, usePathname, redirect } from '@/i18n/routing';

// Get current locale
import { useLocale } from 'next-intl';

// Language switcher
import { LanguageSwitcher, LanguageSwitcherCompact } from '@/components/language-switcher';
```

## Usage Examples

### Basic Translation
```tsx
const t = useTranslations('wallet');
<h1>{t('title')}</h1>
```

### With Variables
```tsx
// In messages/en.json:
{ "greeting": "Hello, {name}!" }

// In component:
<p>{t('greeting', { name: userName })}</p>
```

### Navigation
```tsx
// Link
<Link href="/dashboard">Dashboard</Link>

// Router push
const router = useRouter();
router.push('/dashboard');

// Both automatically include current locale
```

### Current Locale
```tsx
const locale = useLocale(); // 'en', 'fr', 'ht', or 'es'
```

## Translation File Structure

```json
{
  "common": { ... },
  "auth": { ... },
  "wallet": { ... },
  "send": { ... },
  "recovery": { ... },
  "dashboard": { ... },
  "profile": { ... },
  "errors": { ... },
  "languages": { ... }
}
```

## Supported Locales

- `en` - English (default)
- `fr` - Français
- `ht` - Kreyòl Ayisyen
- `es` - Español

## Common Patterns

### Error Messages
```tsx
const t = useTranslations('errors');
try {
  // ...
} catch (error) {
  setError(t('general'));
}
```

### Form Labels
```tsx
const t = useTranslations('auth');
<label>{t('email')}</label>
<input placeholder={t('enterEmail')} />
```

### Button Text
```tsx
const tCommon = useTranslations('common');
<button>{tCommon('save')}</button>
<button>{tCommon('cancel')}</button>
```

## URLs

All user pages include locale:
- `/en/dashboard`
- `/fr/onboarding`
- `/ht/recovery`
- `/es/auth/callback`

API routes remain unchanged:
- `/api/auth/signup`
- `/api/wallet/register`

## Add New Translation

1. Add to `messages/en.json`:
   ```json
   "myFeature": {
     "title": "My Feature"
   }
   ```

2. Add to `messages/fr.json`:
   ```json
   "myFeature": {
     "title": "Ma fonctionnalité"
   }
   ```

3. Add to `messages/ht.json` and `messages/es.json`

4. Use in component:
   ```tsx
   const t = useTranslations('myFeature');
   <h1>{t('title')}</h1>
   ```

## Checklist for New Components

- [ ] Import `useTranslations` from 'next-intl'
- [ ] Import navigation from '@/i18n/routing' (not 'next/navigation')
- [ ] Add translation keys to all 4 language files
- [ ] Replace hardcoded text with `t('key')`
- [ ] Test in all languages

## Common Mistakes to Avoid

❌ Don't import from 'next/navigation' for routing
✅ Use '@/i18n/routing' instead

❌ Don't hardcode text strings
✅ Use translation keys

❌ Don't forget to add translations to all language files
✅ Add to en.json, fr.json, ht.json, and es.json

❌ Don't use absolute URLs like '/en/dashboard'
✅ Use relative paths '/dashboard' (locale is added automatically)
