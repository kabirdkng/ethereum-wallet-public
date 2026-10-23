# OAuth Implementation Guide - Google & Facebook Sign-In

## Overview
This guide provides step-by-step instructions for adding Google and Facebook OAuth authentication to the Ethereum wallet, while maintaining compatibility with the existing OTP-based email/phone authentication system.

## Current Authentication Architecture

### Existing Flow
1. **Signup (OTP-based)**: User provides email/phone → OTP sent → user verifies → account created → session generated
2. **Sign-in (PIN-based)**: User provides email/phone + 6-digit PIN → PIN verified against `pinHash` → session generated
3. **Session Management**: Session tokens stored in `Session` table, persisted client-side via Zustand + localStorage
4. **Wallet Linkage**: After authentication, wallet address linked to user via `/api/wallet/register`

### Database Schema (Relevant Models)
```prisma
model User {
  id               String       @id @default(uuid())
  email            String?      @unique
  phone            String?      @unique
  walletAddress    String?      @unique
  pinHash          String?      // Required for wallet encryption & transactions (all users)
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt
  
  // New fields to add:
  // oauthProvider    String?      // "google" | "facebook" | null
  // oauthId          String?      // Provider's unique user ID
  // profilePicture   String?      // URL to user's profile image
}
```

**Important**: PIN is **required for all users** (OAuth and traditional) because:
- PIN encrypts the wallet mnemonic using AES-GCM (client-side)
- PIN is required to unlock wallet for transaction signing
- PIN is used in `/api/auth/set-pin` during wallet setup flow

---

## Implementation Steps

### 1. Database Schema Changes

**File**: `prisma/schema.prisma`

Add the following fields to the `User` model:

```prisma
model User {
  id               String       @id @default(uuid())
  email            String?      @unique
  phone            String?      @unique
  walletAddress    String?      @unique
  pinHash          String?      // Required for encryption/transactions (set during wallet setup)
  
  // OAuth fields
  oauthProvider    String?      // "google" | "facebook" | null for traditional auth
  oauthId          String?      // Provider's unique user ID (e.g., Google sub claim)
  profilePicture   String?      // Profile image URL from provider
  
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  transactions      Transaction[]
  sessions          Session[]
  recoveryContacts  RecoveryContact[]
  recoveryRequests  RecoveryRequest[]
  encryptedWallet   EncryptedWallet?
  
  // Ensure unique OAuth provider + ID combination
  @@unique([oauthProvider, oauthId])
}
```

**Migration Command**:
```bash
npm run prisma:migrate -- --name add_oauth_fields
npm run prisma:generate
```

---

### 2. Environment Variables

**File**: `.env` (add these variables)

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Facebook OAuth
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret

# OAuth Redirect URLs (adjust for production)
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
```

**File**: `src/config/env.ts`

Update the Zod schemas to include OAuth variables:

```typescript
const serverSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: z.string().url().optional(),
  
  // Existing fields...
  RESEND_API_KEY: z.string().optional(),
  TWILIO_VERIFY_SERVICE_SID: z.string().optional(),
  
  // OAuth credentials
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),
});

const clientSchema = z.object({
  // Existing fields...
  NEXT_PUBLIC_NETWORK: z.enum(["sepolia", "mainnet"]).optional().default("sepolia"),
  NEXT_PUBLIC_PLATFORM_FEE_PERCENTAGE: z.string().optional().default("1.5"),
  
  // OAuth client-side config
  NEXT_PUBLIC_BASE_URL: z.string().url().optional().default("http://localhost:3000"),
});
```

---

### 3. Install Dependencies

```bash
npm install next-auth@beta  # Version 5.x for Next.js 16 App Router support
npm install @auth/prisma-adapter
npm install --save-dev @types/next-auth
```

**Note**: NextAuth v5 is in beta but stable for App Router. If you prefer a different OAuth library, consider:
- `@react-oauth/google` for Google-only
- `react-facebook-login` for Facebook-only
- Manual OAuth 2.0 implementation with `fetch()`

---

### 4. Create NextAuth Configuration

**File**: `src/lib/auth.ts` (new file)

```typescript
import NextAuth, { NextAuthConfig } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { getServerEnv } from "@/config/env";

const env = getServerEnv();

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
    FacebookProvider({
      clientId: env.FACEBOOK_APP_ID!,
      clientSecret: env.FACEBOOK_APP_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account) return false;

      try {
        // Find or create user with OAuth data
        const existingUser = await prisma.user.findUnique({
          where: {
            oauthProvider_oauthId: {
              oauthProvider: account.provider,
              oauthId: account.providerAccountId,
            },
          },
        });

        if (!existingUser) {
          // Create new user with OAuth data
          await prisma.user.create({
            data: {
              email: user.email!.toLowerCase(),
              oauthProvider: account.provider,
              oauthId: account.providerAccountId,
              profilePicture: user.image || null,
            },
          });
        } else {
          // Update profile picture if changed
          if (user.image && user.image !== existingUser.profilePicture) {
            await prisma.user.update({
              where: { id: existingUser.id },
              data: { profilePicture: user.image },
            });
          }
        }

        return true;
      } catch (error) {
        console.error("[Auth] OAuth sign-in error:", error);
        return false;
      }
    },

    async session({ session, user }) {
      // Attach user ID and wallet info to session
      if (session.user) {
        session.user.id = user.id;
        session.user.walletAddress = user.walletAddress || null;
        session.user.oauthProvider = user.oauthProvider || null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/onboarding",  // Redirect to your custom auth page
    error: "/onboarding",
  },
  session: {
    strategy: "database",  // Store sessions in Prisma DB
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
```

---

### 5. Create OAuth API Routes

**File**: `src/app/api/auth/[...nextauth]/route.ts` (new file)

```typescript
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

**File**: `src/app/api/auth/oauth-signin/route.ts` (new file)

This endpoint bridges NextAuth sessions with your custom session system:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const oauthSigninSchema = z.object({
  // Optional: Add any additional client-side data needed
});

export async function POST(request: Request) {
  try {
    // Get NextAuth session
    const session = await auth();
    
    if (!session || !session.user || !session.user.email) {
      return NextResponse.json(
        { error: "No active OAuth session found." },
        { status: 401 }
      );
    }

    // Find user by email (or oauthProvider + oauthId)
    const user = await prisma.user.findUnique({
      where: { email: session.user.email.toLowerCase() },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 }
      );
    }

    // Create custom session token (matching existing auth flow)
    const sessionToken = crypto.randomUUID();
    const expires = new Date();
    expires.setDate(expires.getDate() + 30); // 30 days

    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires,
      },
    });

    return NextResponse.json({
      success: true,
      sessionToken,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        walletAddress: user.walletAddress,
        oauthProvider: user.oauthProvider,
        profilePicture: user.profilePicture,
      },
    });
  } catch (error) {
    console.error("[Auth] OAuth sign-in error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during OAuth sign-in." },
      { status: 500 }
    );
  }
}
```

---

### 6. Update Frontend Components

**File**: `src/components/auth-form.tsx`

Add OAuth buttons alongside existing email/phone auth:

```tsx
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";  // Import NextAuth client
import { useAuthStore } from "@/stores/auth-store";

type ContactType = "email" | "phone";
type AuthMode = "signup" | "signin";

interface AuthFormProps {
  onSuccess?: () => void;
}

export default function AuthForm({ onSuccess }: AuthFormProps) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [contactType, setContactType] = useState<ContactType>("email");
  const [contact, setContact] = useState("");
  const [otp, setOtp] = useState("");
  const [pin, setPin] = useState("");
  const [step, setStep] = useState<"contact" | "verify" | "complete">("contact");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { setSession } = useAuthStore();

  // Existing handlers (handleSendOtp, handleSignIn, handleVerifyOtp)...

  const handleOAuthSignIn = async (provider: "google" | "facebook") => {
    setLoading(true);
    setError("");

    try {
      // Trigger NextAuth OAuth flow
      const result = await signIn(provider, {
        callbackUrl: `${window.location.origin}/onboarding?oauth=success`,
        redirect: false,  // Handle redirect manually
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      if (result?.ok) {
        // After OAuth success, create custom session token
        const response = await fetch("/api/auth/oauth-signin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "OAuth sign-in failed");
        }

        setSession(data.sessionToken, data.user);
        
        if (onSuccess) {
          onSuccess();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "OAuth sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-card rounded-lg border border-subtle shadow-card">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          {mode === "signin" ? "Sign In" : "Create Account"}
        </h2>
        <p className="text-muted">
          {mode === "signin"
            ? "Enter your credentials to access your wallet"
            : "Get started with your non-custodial wallet"}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-error-soft border border-error rounded-lg">
          <p className="text-sm text-error">{error}</p>
        </div>
      )}

      {/* OAuth Buttons */}
      {step === "contact" && (
        <div className="space-y-3 mb-6">
          <button
            onClick={() => handleOAuthSignIn("google")}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-default rounded-lg bg-card text-foreground hover:bg-card-muted transition disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="font-medium">Continue with Google</span>
          </button>

          <button
            onClick={() => handleOAuthSignIn("facebook")}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-default rounded-lg bg-card text-foreground hover:bg-card-muted transition disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="#1877F2" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            <span className="font-medium">Continue with Facebook</span>
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-subtle"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-card text-muted">Or continue with</span>
            </div>
          </div>
        </div>
      )}

      {/* Existing Contact Type Selector and Forms */}
      {/* ... rest of your existing code ... */}
    </div>
  );
}
```

---

### 7. Update Auth Store Type Definitions

**File**: `src/stores/auth-store.ts`

Update the `User` interface to include OAuth fields:

```typescript
interface User {
  id: string;
  email?: string;
  phone?: string;
  walletAddress?: string;
  oauthProvider?: string | null;  // "google" | "facebook" | null
  profilePicture?: string | null;  // Profile image URL
}
```

---

### 8. Update Middleware (Optional)

If you want to protect routes based on OAuth sessions, create:

**File**: `src/middleware.ts` (new file)

```typescript
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isOnDashboard = req.nextUrl.pathname.startsWith("/dashboard");

  if (isOnDashboard && !isLoggedIn) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

---

### 9. Handle OAuth Provider Setup

#### Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project or select existing
3. Enable **Google+ API** and **People API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Set authorized redirect URIs:
   - Development: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://yourdomain.com/api/auth/callback/google`
6. Copy **Client ID** and **Client Secret** to `.env`

#### Facebook OAuth Setup
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create new app → Choose **Consumer** app type
3. Add **Facebook Login** product
4. Go to **Settings** → **Basic** → Copy **App ID** and **App Secret**
5. Go to **Facebook Login** → **Settings**
6. Add valid OAuth redirect URIs:
   - Development: `http://localhost:3000/api/auth/callback/facebook`
   - Production: `https://yourdomain.com/api/auth/callback/facebook`
7. Make app **Live** (not in Development mode)

---

### 10. Update Sign-In Flow Logic

**File**: `src/app/api/auth/signin/route.ts`

Update PIN-based sign-in to support OAuth users who have completed wallet setup:

```typescript
export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = signinSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid sign-in credentials.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { contactType, contact, pin } = parsed.data;

    const user = await prisma.user.findUnique({
      where: contactType === "email" ? { email: contact } : { phone: contact },
    });

    if (!user) {
      return NextResponse.json(
        { error: "No account found with this email/phone." },
        { status: 404 }
      );
    }

    if (!user.pinHash) {
      return NextResponse.json(
        { error: "PIN not set for this account. Please complete wallet setup." },
        { status: 400 }
      );
    }

    // Verify PIN (works for both OAuth and traditional users)
    const isPinValid = await bcrypt.compare(pin, user.pinHash);

    if (!isPinValid) {
      return NextResponse.json(
        { error: "Invalid PIN." },
        { status: 401 }
      );
    }

    // Create new session
    const sessionToken = crypto.randomUUID();
    const expires = new Date();
    expires.setDate(expires.getDate() + 30); // 30 days

    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires,
      },
    });

    return NextResponse.json({
      success: true,
      sessionToken,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        walletAddress: user.walletAddress,
        oauthProvider: user.oauthProvider,
        profilePicture: user.profilePicture,
      },
    });
  } catch (error) {
    console.error("[Auth] Sign-in error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during sign-in." },
      { status: 500 }
    );
  }
}
```

**Note**: OAuth users can sign in via either:
1. **OAuth flow** (Google/Facebook button) → `/api/auth/oauth-signin` → creates session
2. **PIN flow** (email + PIN) → `/api/auth/signin` → verifies PIN → creates session

---

### 11. PIN Management for All Users

**All users (OAuth and traditional) must set a PIN during wallet setup** because:
- PIN encrypts the wallet mnemonic (client-side AES-GCM encryption)
- PIN is required to unlock wallet for sending transactions
- PIN prevents unauthorized access even if session token is compromised

**File**: `src/app/api/auth/set-pin/route.ts` (existing endpoint, works for all users)

This endpoint is already compatible with OAuth users - no changes needed:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const setPinSchema = z.object({
  sessionToken: z.string().uuid(),
  pin: z.string().length(6, "PIN must be exactly 6 digits"),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = setPinSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { sessionToken, pin } = parsed.data;

    // Validate session
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { user: true },
    });

    if (!session || session.expires < new Date()) {
      return NextResponse.json(
        { error: "Invalid or expired session." },
        { status: 401 }
      );
    }

    // Hash PIN
    const pinHash = await bcrypt.hash(pin, 12);

    // Update user (works for both OAuth and traditional users)
    await prisma.user.update({
      where: { id: session.userId },
      data: { pinHash },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Auth] Set PIN error:", error);
    return NextResponse.json(
      { error: "Failed to set PIN." },
      { status: 500 }
    );
  }
}
```

### 11.1 Add Update PIN Endpoint

Allow users to change their PIN from profile settings:

**File**: `src/app/api/auth/update-pin/route.ts` (new file)

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const updatePinSchema = z.object({
  sessionToken: z.string().uuid(),
  currentPin: z.string().length(6, "Current PIN must be exactly 6 digits"),
  newPin: z.string().length(6, "New PIN must be exactly 6 digits"),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = updatePinSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { sessionToken, currentPin, newPin } = parsed.data;

    // Validate session
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { user: true },
    });

    if (!session || session.expires < new Date()) {
      return NextResponse.json(
        { error: "Invalid or expired session." },
        { status: 401 }
      );
    }

    const user = session.user;

    if (!user.pinHash) {
      return NextResponse.json(
        { error: "No PIN set for this account." },
        { status: 400 }
      );
    }

    // Verify current PIN
    const isCurrentPinValid = await bcrypt.compare(currentPin, user.pinHash);

    if (!isCurrentPinValid) {
      return NextResponse.json(
        { error: "Current PIN is incorrect." },
        { status: 401 }
      );
    }

    // Prevent reusing the same PIN
    const isSamePin = await bcrypt.compare(newPin, user.pinHash);
    if (isSamePin) {
      return NextResponse.json(
        { error: "New PIN must be different from current PIN." },
        { status: 400 }
      );
    }

    // Hash new PIN
    const newPinHash = await bcrypt.hash(newPin, 12);

    // Update user
    await prisma.user.update({
      where: { id: user.id },
      data: { pinHash: newPinHash },
    });

    return NextResponse.json({ 
      success: true,
      message: "PIN updated successfully. Please use your new PIN for future transactions."
    });
  } catch (error) {
    console.error("[Auth] Update PIN error:", error);
    return NextResponse.json(
      { error: "Failed to update PIN." },
      { status: 500 }
    );
  }
}
```

### 11.2 Add PIN Update Component

**File**: `src/components/update-pin-form.tsx` (new file)

```tsx
"use client";

import { useState } from "react";
import { useAuthStore } from "@/stores/auth-store";

export default function UpdatePinForm() {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const { sessionToken } = useAuthStore();

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (newPin !== confirmPin) {
      setError("New PIN and confirmation do not match.");
      return;
    }

    if (newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
      setError("PIN must be exactly 6 digits.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/update-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken,
          currentPin,
          newPin,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update PIN");
      }

      setSuccess(true);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");

      // Show success message for 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <h3 className="text-lg font-semibold text-foreground mb-4">Update PIN</h3>
      
      {error && (
        <div className="mb-4 p-3 bg-error-soft border border-error rounded-lg">
          <p className="text-sm text-error">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-700">PIN updated successfully!</p>
        </div>
      )}

      <form onSubmit={handleUpdatePin} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Current PIN
          </label>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
            placeholder="Current 6-digit PIN"
            maxLength={6}
            className="w-full px-4 py-3 border border-default rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            New PIN
          </label>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
            placeholder="New 6-digit PIN"
            maxLength={6}
            className="w-full px-4 py-3 border border-default rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Confirm New PIN
          </label>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
            placeholder="Confirm new 6-digit PIN"
            maxLength={6}
            className="w-full px-4 py-3 border border-default rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading || !currentPin || !newPin || !confirmPin}
          className="w-full bg-primary text-on-primary py-3 rounded-lg font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? "Updating..." : "Update PIN"}
        </button>
      </form>

      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-xs text-yellow-800">
          <strong>Important:</strong> Updating your PIN will require you to re-encrypt your wallet backup. 
          Make sure you have access to your recovery phrase before proceeding.
        </p>
      </div>
    </div>
  );
}
```

### 11.3 Integrate PIN Update into Profile

**File**: `src/components/profile-section.tsx` (update existing component)

Add the PIN update form to your profile page:

```tsx
import UpdatePinForm from "./update-pin-form";

export default function ProfileSection() {
  // ... existing code ...

  return (
    <div className="space-y-8">
      {/* Existing profile sections */}
      
      {/* PIN Management Section */}
      <div className="border-t border-subtle pt-8">
        <UpdatePinForm />
      </div>
    </div>
  );
}
```

---

### 12. OAuth User Wallet Setup Flow

After OAuth sign-in, guide users through wallet setup with PIN creation:

**Flow**:
1. User clicks "Continue with Google/Facebook"
2. OAuth authentication succeeds → `/api/auth/oauth-signin` creates session
3. Client checks if `user.walletAddress` exists
4. **If no wallet**: Redirect to `/onboarding` → show wallet setup:
   - Prompt user to create 6-digit PIN
   - Client generates mnemonic (12-word phrase)
   - Client encrypts mnemonic with PIN using AES-GCM
   - Client stores encrypted wallet in IndexedDB
   - Client derives wallet address and calls `/api/wallet/register`
   - Server links wallet address to user record
5. **If wallet exists**: Redirect to `/dashboard`

**Important**: OAuth users **must** create a PIN during wallet setup - it's not optional. Without a PIN, they cannot:
- Encrypt their wallet mnemonic
- Sign transactions to send money
- Access wallet recovery features

### 13. Testing Checklist

- [ ] Google OAuth sign-in creates new user with `oauthProvider: "google"`
- [ ] Facebook OAuth sign-in creates new user with `oauthProvider: "facebook"`
- [ ] OAuth users are prompted to set PIN during wallet setup
- [ ] OAuth users can sign in with email + PIN (after wallet setup)
- [ ] OAuth users can sign in with Google/Facebook button (skip PIN)
- [ ] Existing email/phone users can still sign in with OTP/PIN
- [ ] Session tokens work consistently across OAuth and traditional auth
- [ ] Profile pictures from OAuth providers are stored and displayed
- [ ] PIN update endpoint validates current PIN before allowing change
- [ ] PIN update form prevents reusing the same PIN
- [ ] Wallet encryption works with updated PIN (re-encrypt flow)
- [ ] Graceful error handling when OAuth providers are not configured

---

## Security Considerations

### 1. **Email Uniqueness**
- Both OAuth and traditional auth use email as a unique identifier
- Prevent account takeover: If `user@example.com` signs up via OTP, then tries to sign in with Google using the same email, you must decide:
  - **Option A**: Link accounts (merge OAuth into existing user)
  - **Option B**: Reject OAuth sign-in (force user to use original method)

**Recommended**: Option B (safer) - add this to `signIn` callback:

```typescript
async signIn({ user, account, profile }) {
  const existingUser = await prisma.user.findUnique({
    where: { email: user.email!.toLowerCase() },
  });

  if (existingUser && !existingUser.oauthProvider) {
    // User signed up via OTP/PIN, prevent OAuth takeover
    console.error("[Auth] OAuth blocked - email already registered via OTP");
    return false;
  }

  // Proceed with OAuth sign-in...
}
```

### 2. **Session Lifecycle**
- NextAuth manages its own session table
- Your custom `Session` model is separate
- After OAuth sign-in, `/api/auth/oauth-signin` creates a custom session token
- Keep both sessions in sync or migrate fully to NextAuth's session management

### 3. **CSRF Protection**
- NextAuth v5 includes built-in CSRF protection
- Ensure `NEXTAUTH_SECRET` is set in production (never commit to git)

### 4. **OAuth State Validation**
- NextAuth handles OAuth state parameter validation automatically
- Do not bypass redirect URI validation

---

## Migration Path (Existing Users)

If you have existing users who signed up via email/phone OTP, they will not have OAuth fields. Here's how to handle them:

1. **No migration needed**: Existing users continue using PIN-based auth
2. **Optional linking**: Add a "Link Google/Facebook" feature in user settings
3. **Unified experience**: Allow users to have both PIN and OAuth enabled

**File**: `src/app/api/auth/link-oauth/route.ts` (optional feature)

```typescript
// Allow authenticated users to link OAuth provider to existing account
export async function POST(request: Request) {
  // Validate session token
  // Get OAuth provider data from NextAuth
  // Update user record with oauthProvider + oauthId
  // Return success
}
```

---

## Deployment Notes

### Environment Variables for Production
Add to your hosting platform (Vercel, Railway, etc.):

```bash
NEXTAUTH_URL=https://yourdomain.com
NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>
GOOGLE_CLIENT_ID=<from-google-console>
GOOGLE_CLIENT_SECRET=<from-google-console>
FACEBOOK_APP_ID=<from-facebook-developers>
FACEBOOK_APP_SECRET=<from-facebook-developers>
```

### Redirect URI Whitelist
Update both Google and Facebook OAuth apps with production redirect URIs:
- Google: `https://yourdomain.com/api/auth/callback/google`
- Facebook: `https://yourdomain.com/api/auth/callback/facebook`

---

## Alternative Implementation (Without NextAuth)

If you prefer not to use NextAuth, you can implement OAuth manually:

### Manual Google OAuth Flow
1. Create authorization URL: `https://accounts.google.com/o/oauth2/v2/auth`
2. Redirect user to Google consent screen
3. Handle callback at `/api/auth/callback/google`
4. Exchange authorization code for access token
5. Fetch user profile from `https://www.googleapis.com/oauth2/v3/userinfo`
6. Create user record and session

### Manual Facebook OAuth Flow
1. Create authorization URL: `https://www.facebook.com/v12.0/dialog/oauth`
2. Redirect user to Facebook consent screen
3. Handle callback at `/api/auth/callback/facebook`
4. Exchange code for access token
5. Fetch user profile from `https://graph.facebook.com/me`
6. Create user record and session

**Pros**: Full control, no external dependencies
**Cons**: More code to maintain, handle edge cases (token refresh, revocation, etc.)

---

## Summary

This implementation:
- ✅ Adds Google and Facebook OAuth alongside existing email/phone auth
- ✅ Maintains backward compatibility with PIN-based sign-in
- ✅ Uses NextAuth v5 for robust OAuth handling
- ✅ Stores OAuth users in existing Prisma `User` model
- ✅ Preserves self-custody wallet architecture (OAuth only affects authentication)
- ✅ **Requires PIN for all users** (OAuth and traditional) for wallet encryption & transactions
- ✅ Provides PIN update functionality in user profile settings
- ✅ Follows existing error-handling and session management patterns
- ✅ Gracefully degrades when OAuth credentials are not configured

**Next Steps**:
1. Run database migration to add OAuth fields (`oauthProvider`, `oauthId`, `profilePicture`)
2. Set up Google/Facebook OAuth apps and get credentials
3. Install NextAuth dependencies (`next-auth@beta`, `@auth/prisma-adapter`)
4. Create `src/lib/auth.ts` with NextAuth configuration
5. Create `/api/auth/[...nextauth]/route.ts` and `/api/auth/oauth-signin/route.ts`
6. Create `/api/auth/update-pin/route.ts` for PIN management
7. Update `auth-form.tsx` with OAuth buttons
8. Create `update-pin-form.tsx` component
9. Update `profile-section.tsx` to include PIN update form
10. Test OAuth sign-in → wallet setup → PIN creation flow
11. Test PIN update functionality from profile
12. Test dual sign-in methods (OAuth button vs email+PIN)
13. Deploy with production OAuth credentials

**Key Architectural Decision**:
- **PIN is mandatory for all users** because it's the encryption key for the wallet mnemonic stored in IndexedDB
- OAuth simplifies authentication but doesn't eliminate the need for PIN-based wallet security
- Users can sign in via either method: OAuth (convenient) or email+PIN (traditional)
- PIN update requires current PIN verification to prevent unauthorized changes

---

## References
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [Google OAuth Setup](https://developers.google.com/identity/protocols/oauth2)
- [Facebook Login Documentation](https://developers.facebook.com/docs/facebook-login)
- [Prisma Adapter for NextAuth](https://authjs.dev/reference/adapter/prisma)
