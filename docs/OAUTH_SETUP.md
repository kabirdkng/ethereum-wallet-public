# OAuth Implementation - Setup Instructions

## ✅ Implementation Complete

All OAuth authentication features have been successfully implemented in your Ethereum wallet application. Here's what was done:

### 1. Database Schema ✅
- Added `oauthProvider`, `oauthId`, and `profilePicture` fields to the User model
- Created unique constraint for OAuth provider + ID combination
- Migration applied: `20251103095203_add_oauth_fields`

### 2. Environment Configuration ✅
- Updated `src/config/env.ts` with OAuth credential validation
- Added Google and Facebook OAuth environment variables
- Updated `.env.example` with OAuth configuration examples

### 3. Dependencies Installed ✅
- `next-auth@beta` (v5.x for Next.js 16 App Router)
- `@auth/prisma-adapter` (Prisma integration)

### 4. NextAuth Configuration ✅
- Created `src/lib/auth.ts` with Google and Facebook providers
- Implemented account takeover prevention (blocks OAuth if email exists via OTP)
- Session management integrated with your custom session system

### 5. API Routes Created ✅
- `/api/auth/[...nextauth]/route.ts` - NextAuth callback handler
- `/api/auth/oauth-signin/route.ts` - Bridges OAuth to custom sessions
- `/api/auth/update-pin/route.ts` - Allows users to change their PIN

### 6. Frontend Components ✅
- Updated `auth-form.tsx` with Google and Facebook OAuth buttons
- Created `update-pin-form.tsx` component for PIN management
- Integrated PIN update form into `profile-section.tsx`
- Updated auth store types to include `oauthProvider` and `profilePicture`

---

## 🚀 Next Steps to Get OAuth Working

### Step 1: Set Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Google+ API** and **People API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure consent screen (add your app name, logo, etc.)
6. Set authorized redirect URIs:
   - Development: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://yourdomain.com/api/auth/callback/google`
7. Copy **Client ID** and **Client Secret**
8. Add to your `.env` file:
   ```bash
   GOOGLE_CLIENT_ID="your_google_client_id.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="your_google_client_secret"
   ```

### Step 2: Set Up Facebook OAuth

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create new app → Choose **Consumer** app type
3. Add **Facebook Login** product
4. Go to **Settings** → **Basic**:
   - Copy **App ID** and **App Secret**
5. Go to **Facebook Login** → **Settings**:
   - Add valid OAuth redirect URIs:
     - Development: `http://localhost:3000/api/auth/callback/facebook`
     - Production: `https://yourdomain.com/api/auth/callback/facebook`
6. Make app **Live** (not in Development mode)
7. Add to your `.env` file:
   ```bash
   FACEBOOK_APP_ID="your_facebook_app_id"
   FACEBOOK_APP_SECRET="your_facebook_app_secret"
   ```

### Step 3: Configure NEXTAUTH_SECRET

Generate a secure secret for NextAuth:

```bash
openssl rand -base64 32
```

Add to `.env`:
```bash
NEXTAUTH_SECRET="<generated-secret-from-above>"
NEXTAUTH_URL="http://localhost:3000"
```

### Step 4: Test the Implementation

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Navigate to `/onboarding`

3. You should see:
   - "Continue with Google" button
   - "Continue with Facebook" button
   - Divider ("Or continue with")
   - Existing email/phone form

4. Test OAuth flow:
   - Click Google/Facebook button
   - Complete OAuth consent screen
   - You'll be redirected back to your app
   - User account created with `oauthProvider` set
   - Session token generated

5. Test wallet setup:
   - OAuth users will be prompted to create a 6-digit PIN
   - PIN is required to encrypt wallet mnemonic
   - Wallet creation proceeds as normal

6. Test PIN update:
   - Go to dashboard → profile
   - Scroll to "Update PIN" section
   - Enter current PIN, new PIN, confirm
   - Verify PIN update works

---

## 🔒 Security Features Implemented

### 1. Account Takeover Prevention
If a user already signed up with `user@example.com` via OTP/PIN, they **cannot** sign in with Google OAuth using the same email. This prevents account hijacking.

### 2. Dual Authentication Methods
OAuth users can sign in via:
- **OAuth flow**: Click Google/Facebook button (no PIN needed at sign-in)
- **PIN flow**: Use email + PIN (after wallet setup)

### 3. PIN Management
- All users must set a PIN during wallet setup (required for encryption)
- PIN update requires current PIN verification
- Prevents reusing the same PIN
- Warning about wallet re-encryption

### 4. Session Management
- OAuth sessions bridge to your custom session system
- 30-day session expiry (configurable)
- Session tokens stored in Prisma database

---

## 📁 Files Modified/Created

### Modified:
- `prisma/schema.prisma` - Added OAuth fields to User model
- `src/config/env.ts` - Added OAuth env validation
- `src/stores/auth-store.ts` - Updated User interface
- `src/components/auth-form.tsx` - Added OAuth buttons
- `src/components/profile-section.tsx` - Integrated PIN update
- `.env.example` - Documented OAuth variables

### Created:
- `src/lib/auth.ts` - NextAuth configuration
- `src/app/api/auth/[...nextauth]/route.ts` - OAuth callback handler
- `src/app/api/auth/oauth-signin/route.ts` - Custom session bridge
- `src/app/api/auth/update-pin/route.ts` - PIN update endpoint
- `src/components/update-pin-form.tsx` - PIN update UI

---

## 🧪 Testing Checklist

- [ ] Google OAuth sign-in creates user with `oauthProvider: "google"`
- [ ] Facebook OAuth sign-in creates user with `oauthProvider: "facebook"`
- [ ] OAuth users prompted to set PIN during wallet setup
- [ ] OAuth users can sign in with email + PIN (after setup)
- [ ] OAuth users can sign in with OAuth button (skip PIN)
- [ ] Existing email/phone users still work with OTP/PIN
- [ ] Profile pictures from OAuth providers stored and displayed
- [ ] PIN update validates current PIN before allowing change
- [ ] PIN update prevents reusing same PIN
- [ ] Account takeover prevention blocks OAuth if email exists via OTP

---

## 🐛 Troubleshooting

### OAuth buttons not appearing
- Check that `next-auth` package is installed
- Verify `src/lib/auth.ts` exists and exports correctly
- Check browser console for import errors

### OAuth redirect fails
- Verify `NEXTAUTH_URL` matches your current URL
- Check OAuth provider redirect URIs match exactly
- For development with ngrok, update `NEXTAUTH_URL` to ngrok URL

### "No active OAuth session found" error
- Ensure NextAuth session was created successfully
- Check that OAuth callback completed without errors
- Verify `/api/auth/oauth-signin` is being called after OAuth

### PIN update not working
- Verify user has `pinHash` set (completed wallet setup)
- Check session token is valid and not expired
- Confirm new PIN is different from current PIN

---

## 🚢 Production Deployment

### Environment Variables
Add to your hosting platform (Vercel, Railway, etc.):

```bash
NEXTAUTH_URL=https://yourdomain.com
NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>
GOOGLE_CLIENT_ID=<from-google-console>
GOOGLE_CLIENT_SECRET=<from-google-console>
FACEBOOK_APP_ID=<from-facebook-developers>
FACEBOOK_APP_SECRET=<from-facebook-developers>
```

### OAuth Redirect URIs
Update both Google and Facebook OAuth apps with production URIs:
- Google: `https://yourdomain.com/api/auth/callback/google`
- Facebook: `https://yourdomain.com/api/auth/callback/facebook`

### Security Checklist
- [ ] `NEXTAUTH_SECRET` is at least 32 characters (never commit to git)
- [ ] OAuth redirect URIs whitelist only your domains
- [ ] Facebook app is in "Live" mode (not Development)
- [ ] Google consent screen is published
- [ ] HTTPS enabled in production
- [ ] CORS configured correctly if using separate frontend

---

## 📚 Additional Resources

- [NextAuth.js Documentation](https://next-auth.js.org/)
- [Google OAuth Setup Guide](https://developers.google.com/identity/protocols/oauth2)
- [Facebook Login Documentation](https://developers.facebook.com/docs/facebook-login)
- [Prisma Adapter for NextAuth](https://authjs.dev/reference/adapter/prisma)

---

## 💡 Key Architectural Decisions

1. **PIN is mandatory for all users** - Required for wallet encryption, not optional
2. **OAuth simplifies authentication** - But doesn't eliminate PIN-based security
3. **Dual sign-in methods** - Users can choose OAuth (convenient) or email+PIN (traditional)
4. **Account takeover prevention** - Safer to keep OAuth and OTP accounts separate
5. **Custom session bridge** - Integrates NextAuth with your existing session system

---

## ✨ What Users Experience

### New User (OAuth)
1. Clicks "Continue with Google/Facebook"
2. Completes OAuth consent screen
3. Redirected to wallet setup
4. Creates 6-digit PIN
5. Wallet generated and encrypted
6. Can now sign in via OAuth or email+PIN

### Existing User (OTP)
1. Signs in with email + PIN (existing flow)
2. Cannot use OAuth with same email (security)
3. Can link OAuth in future (optional feature to build)

### All Users
1. Can update PIN from profile settings
2. PIN update requires current PIN verification
3. Warning about wallet re-encryption implications

---

For questions or issues, refer to the main implementation guide at `docs/OAUTH_IMPLEMENTATION.md`.
