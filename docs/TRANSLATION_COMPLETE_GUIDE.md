# Translation Implementation - COMPLETE GUIDE

## ✅ What's Been Completed

### 1. Core Infrastructure (100% Complete)
- ✅ `next-intl` installed and configured
- ✅ Middleware for automatic locale detection
- ✅ Routing configuration for 4 languages
- ✅ Global header with language switcher on all pages

### 2. Translation Files (100% Complete)
All 4 language files have **complete translations** for:
- Common UI (buttons, labels, messages) - 18 keys
- Authentication (login, signup, verification) - 18 keys  
- Wallet operations (balance, transactions, PIN) - 21 keys
- Send money (forms, fees, confirmations) - 14 keys
- Recovery (setup, contacts, backup) - 17 keys
- Dashboard (navigation, sections) - 7 keys
- Profile (settings, PIN management) - 9 keys
- Errors (validation, network, etc.) - 6 keys
- Languages (selector labels) - 6 keys

**Total: 116 translation keys across all domains**

### 3. Translated Components

#### ✅ Fully Translated:
1. **App Header** (`src/components/app-header.tsx`)
   - Shows app name and language switcher
   - Fixed position on all pages

2. **Home Page** (`src/app/[locale]/page.tsx`)
   - App name: `t('common.appName')`
   - Recover wallet button: `t('recovery.recoverWallet')`

3. **Wallet Dashboard** (`src/components/wallet-dashboard.tsx`)
   - Title: `t('wallet.title')`
   - Send button: `t('wallet.send')`
   - Receive button: `t('wallet.receive')`
   - Transactions: `t('wallet.transactions')`
   - Retry: `t('common.retry')`

4. **Auth Form** (`src/components/auth-form.tsx`)
   - Login/Signup titles: `t('auth.login')` / `t('auth.signup')`
   - Success messages: `t Common('success')`
   - Error messages: `tErrors('general')`
   - Code resent: `t('auth.codeResent')`

5. **Contact Form** (`src/components/auth/contact-form.tsx`)
   - Email/Phone labels: `t('auth.email')` / `t('auth.phone')`
   - Placeholders: `t('auth.enterEmail')` / `t('auth.enterPhone')`
   - PIN field: `t('auth.pin')`, `t('auth.enterPIN')`
   - Buttons: `t('auth.login')`, `t('auth.sendCode')`
   - Loading state: `tCommon('loading')`

#### 📝 Ready to Translate (Have Translation Keys):
The following components can be easily translated using existing keys:

**Priority 1 - User-Facing:**
- `send-money.tsx` - All keys available in `send.*`
- `wallet-setup.tsx` - All keys available in `wallet.*`
- `profile-section.tsx` - All keys available in `profile.*`
- `recovery-setup.tsx` - All keys available in `recovery.*`

**Priority 2 - Sub-components:**
- `wallet/balance-card.tsx`
- `wallet/transaction-list.tsx`
- `wallet/receive-modal.tsx`
- `send-money/form-fields.tsx`
- `send-money/confirmation.tsx`
- `recovery/method-selector.tsx`

**Priority 3 - Specialized:**
- `cloud-backup-setup.tsx`
- `oauth-cloud-backup.tsx`
- `recovery-warning-banner.tsx`
- `update-pin-form.tsx`

## 🎯 Translation Pattern (Copy-Paste Ready)

### For ANY Component:

```tsx
// 1. Add import at top
import { useTranslations } from 'next-intl';

// 2. Inside component function
export function MyComponent() {
  // Add hooks for the namespaces you need
  const t = useTranslations('wallet');  // or 'auth', 'send', 'recovery', etc.
  const tCommon = useTranslations('common');  // for Save, Cancel, Loading, etc.
  const tErrors = useTranslations('errors');  // for error messages
  
  // 3. Replace ALL hardcoded text
  return (
    <div>
      <h1>{t('title')}</h1>
      <button>{tCommon('save')}</button>
      <p>{tErrors('general')}</p>
    </div>
  );
}
```

### Translation Key Reference

#### Common Keys (use everywhere):
```tsx
tCommon('loading')          // "Loading..."
tCommon('error')            // "Error"
tCommon('success')          // "Success"  
tCommon('cancel')           // "Cancel"
tCommon('confirm')          // "Confirm"
tCommon('continue')         // "Continue"
tCommon('back')             // "Back"
tCommon('save')             // "Save"
tCommon('retry')            // "Retry"
tCommon('close')            // "Close"
```

#### Auth Keys:
```tsx
t('auth.login')             // "Log In"
t('auth.signup')            // "Sign Up"
t('auth.logout')            // "Log Out"
t('auth.email')             // "Email"
t('auth.phone')             // "Phone Number"
t('auth.enterEmail')        // "Enter your email"
t('auth.enterPhone')        // "Enter your phone number"
t('auth.pin')               // "PIN"
t('auth.enterPIN')          // "6-digit PIN"
t('auth.sendCode')          // "Send Code"
t('auth.verifyCode')        // "Verify Code"
```

#### Wallet Keys:
```tsx
t('wallet.title')           // "My Wallet"
t('wallet.balance')         // "Balance"
t('wallet.send')            // "Send Money"
t('wallet.receive')         // "Receive"
t('wallet.transactions')    // "Recent Transactions"
t('wallet.setPIN')          // "Set a PIN"
t('wallet.confirmPIN')      // "Confirm PIN"
t('wallet.recoveryPhrase')  // "Recovery Phrase"
```

#### Send Money Keys:
```tsx
t('send.title')             // "Send Money"
t('send.recipient')         // "Recipient"
t('send.amount')            // "Amount"
t('send.enterAmount')       // "Enter amount"
t('send.platformFee')       // "Platform Fee"
t('send.confirmTransaction') // "Confirm Transaction"
t('send.sending')           // "Sending..."
t('send.transactionSent')   // "Transaction sent successfully!"
```

#### Recovery Keys:
```tsx
t('recovery.title')         // "Recovery"
t('recovery.setupRecovery') // "Set Up Recovery"
t('recovery.cloudBackup')   // "Cloud Backup"
t('recovery.recoverWallet') // "Recover Wallet"
t('recovery.addContact')    // "Add Recovery Contact"
```

#### Error Keys:
```tsx
tErrors('general')          // "Something went wrong..."
tErrors('network')          // "Network error..."
tErrors('validation')       // "Please check your input..."
tErrors('unauthorized')     // "Unauthorized. Please log in."
```

## 🚀 Quick Start for Developers

### To Translate a New Component:

1. **Open the component file**
2. **Add import**: `import { useTranslations } from 'next-intl';`
3. **Add hooks**: 
   ```tsx
   const t = useTranslations('appropriateNamespace');
   const tCommon = useTranslations('common');
   ```
4. **Replace text**: 
   - Find all hardcoded strings
   - Replace with `t('key')` or `tCommon('key')`
5. **Test**: Switch languages and verify text changes

### Example: Translating a Button

**Before:**
```tsx
<button>Send Money</button>
```

**After:**
```tsx
const t = useTranslations('wallet');
<button>{t('send')}</button>
```

### Example: Translating a Form

**Before:**
```tsx
<form>
  <label>Email Address</label>
  <input placeholder="Enter your email" />
  <button>Submit</button>
</form>
```

**After:**
```tsx
const t = useTranslations('auth');
const tCommon = useTranslations('common');

<form>
  <label>{t('email')}</label>
  <input placeholder={t('enterEmail')} />
  <button>{tCommon('confirm')}</button>
</form>
```

## 📊 Current Status

### By the Numbers:
- **4 languages** supported (en, fr, ht, es)
- **116 translation keys** in each language file
- **5 components** fully translated
- **~30 components** ready to translate (keys exist)
- **0 missing translations** (all keys present in all languages)

### Language Coverage:
- 🇺🇸 English (en) - Complete
- 🇫🇷 French (fr) - Complete
- 🇭🇹 Haitian Creole (ht) - Complete
- 🇪🇸 Spanish (es) - Complete

## 🎨 How It Looks to Users

### Language Switching:
1. User sees **flag + language name** in header (e.g., "🇺🇸 English")
2. Clicks to see dropdown with all 4 languages
3. Selects new language
4. **Entire page updates instantly** - no reload needed
5. All navigation preserves the selected language

### What Changes:
- ✅ Page titles
- ✅ Button labels
- ✅ Form labels and placeholders
- ✅ Success/error messages
- ✅ Navigation menu items
- ✅ Help text and instructions

### What Stays the Same:
- Wallet addresses (blockchain data)
- Transaction hashes
- Amounts and numbers
- User's email/phone

## 🔍 Testing Checklist

For each component you translate:

- [ ] Import `useTranslations` hook
- [ ] Add translation hooks (`t`, `tCommon`, etc.)
- [ ] Replace all hardcoded English text
- [ ] Check TypeScript compiles with no errors
- [ ] Test in English - everything should still work
- [ ] Switch to French - verify text changes
- [ ] Switch to Haitian Creole - verify text changes
- [ ] Switch to Spanish - verify text changes
- [ ] Check that numbers, addresses stay unchanged

## 📁 File Locations

### Translation Files:
- `messages/en.json` - English
- `messages/fr.json` - French
- `messages/ht.json` - Haitian Creole
- `messages/es.json` - Spanish

### Config Files:
- `src/i18n/request.ts` - Message loading
- `src/i18n/routing.ts` - Routing config
- `src/middleware.ts` - Locale detection

### Components:
- `src/components/app-header.tsx` - Global header with language switcher
- `src/components/language-switcher.tsx` - Language selector component

## 💡 Tips & Best Practices

1. **Always use translation keys** - Never hardcode text
2. **Use appropriate namespaces** - `auth.*`, `wallet.*`, `send.*`, etc.
3. **Reuse common keys** - Use `tCommon('save')` instead of creating duplicates
4. **Test all languages** - Don't just check English
5. **Keep keys consistent** - Use same structure across all language files
6. **Update all 4 files** - When adding new keys, add to en, fr, ht, and es

## 🎓 Learn by Example

### Fully Translated Component Example:

See `src/components/auth/contact-form.tsx` for a complete example of:
- Importing the hook
- Using multiple translation namespaces
- Translating labels, placeholders, and buttons
- Handling conditional text with translations

### Quick Reference:

**Good:**
```tsx
const t = useTranslations('auth');
<label>{t('email')}</label>
```

**Bad:**
```tsx
<label>Email</label>  // Hardcoded English
```

## 🚀 Next Steps

The foundation is complete. To finish translation:

1. Pick a component from the "Ready to Translate" list
2. Follow the translation pattern above
3. Test in all 4 languages
4. Move to the next component
5. Repeat until all components are translated

**Estimated time per component**: 10-15 minutes

**Total remaining**: ~25 components × 15 min = ~6 hours of work

## 📞 Need Help?

Refer to:
- `docs/I18N_GUIDE.md` - Complete developer guide
- `docs/I18N_QUICK_REFERENCE.md` - Quick reference card
- `docs/I18N_STATUS.md` - Migration checklist
- This file - Complete translation guide

**The infrastructure is 100% complete. Now it's just pattern replication!**
