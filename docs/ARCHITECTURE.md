# System Architecture

## Overview

This is a **self-custody Ethereum wallet** built with Next.js 16 App Router. The architecture follows a **security-first design** where private keys are generated, stored, and used exclusively on the client-side, while the server manages only public metadata and session state.

## Core Design Principles

### 1. Security Through Separation

The wallet implements a **zero-knowledge architecture** where the server never has access to sensitive cryptographic material:

- **Client-side**: Key generation, encryption, transaction signing
- **Server-side**: User metadata, session management, OTP delivery

### 2. Self-Custody Model

Unlike traditional wallet applications that connect to external wallets (MetaMask, WalletConnect), this application:

- Generates and manages private keys directly
- Stores encrypted mnemonics in browser IndexedDB
- Does NOT use wagmi, RainbowKit, or Web3Modal
- Provides complete user control over cryptographic keys

### 3. Defense in Depth

Multiple security layers protect user assets:

1. **PIN-based encryption** (PBKDF2 + AES-GCM)
2. **Session-based authentication** (JWT-style tokens)
3. **Social recovery** (Shamir's Secret Sharing)
4. **Privacy-preserving storage** (hashed phone numbers, encrypted shares)

## Technology Stack

### Frontend (Client-Side)

| Technology | Purpose |
|------------|---------|
| **Next.js 16** | React framework with App Router |
| **TypeScript** | Type-safe development |
| **viem** | Ethereum account management and blockchain interactions |
| **Zustand** | Global state management with localStorage persistence |
| **IndexedDB** | Browser-native encrypted storage |
| **Web Crypto API** | Cryptographic operations (AES-GCM, PBKDF2, SHA-256) |
| **Tailwind CSS** | Utility-first styling |
| **react-hook-form** | Form validation and management |

### Backend (Server-Side)

| Technology | Purpose |
|------------|---------|
| **Next.js API Routes** | RESTful API endpoints |
| **Prisma** | ORM for database operations |
| **SQLite** | Development database (easily swappable) |
| **bcrypt** | PIN hashing |
| **Resend** | Email OTP delivery |
| **Twilio** | SMS OTP delivery |
| **Zod** | Runtime schema validation |

### Cryptographic Libraries

| Library | Purpose |
|---------|---------|
| **viem** | Ethereum key derivation (BIP39 mnemonics) |
| **Web Crypto API** | AES-GCM encryption, PBKDF2 key derivation |
| **bcrypt** | Server-side PIN hashing |
| **secrets.js-grempe** | Shamir's Secret Sharing implementation |
| **@noble/hashes** | SHA-256 hashing for privacy (phone numbers) |

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Client)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  React UI    │  │ Zustand      │  │  IndexedDB         │  │
│  │  Components  │  │ Auth Store   │  │  (Encrypted)       │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────────┘  │
│         │                 │                    │              │
│  ┌──────▼─────────────────▼────────────────────▼──────────┐  │
│  │           Client-Side Crypto Layer                      │  │
│  │  - viem (mnemonic generation, key derivation)          │  │
│  │  - Web Crypto API (AES-GCM, PBKDF2)                    │  │
│  │  - Shamir's Secret Sharing                             │  │
│  └─────────────────────────┬───────────────────────────────┘  │
│                            │                                   │
└────────────────────────────┼───────────────────────────────────┘
                             │ HTTPS (JSON)
                             │ (Public data only)
┌────────────────────────────▼───────────────────────────────────┐
│                    Next.js Server (API)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  API Routes (/api/*)                                     │  │
│  │  - Zod validation                                        │  │
│  │  - Session verification                                  │  │
│  │  - Business logic                                        │  │
│  └──────────┬─────────────────────────┬─────────────────────┘  │
│             │                         │                         │
│  ┌──────────▼──────────┐   ┌─────────▼──────────┐             │
│  │  Prisma ORM         │   │  External Services  │             │
│  │  (Database Layer)   │   │  - Resend (Email)   │             │
│  └──────────┬──────────┘   │  - Twilio (SMS)     │             │
│             │               └─────────────────────┘             │
│  ┌──────────▼──────────┐                                        │
│  │  SQLite Database    │                                        │
│  │  (User metadata,    │                                        │
│  │   Sessions,         │                                        │
│  │   Recovery contacts)│                                        │
│  └─────────────────────┘                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ RPC Calls (JSON-RPC)
                             │
┌────────────────────────────▼───────────────────────────────────┐
│                   Ethereum Network                              │
│  - Read balances (USDC, USDT, ETH)                            │
│  - Broadcast transactions                                      │
│  - Query transaction status                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Patterns

### 1. Wallet Creation Flow

```
User Input (Email/Phone)
    │
    ▼
[Client] Validate input → Send to /api/auth/signup
    │
    ▼
[Server] Generate OTP → Hash with bcrypt → Store in DB → Send via Resend/Twilio
    │
    ▼
[Client] User enters OTP → Send to /api/auth/verify
    │
    ▼
[Server] Verify OTP hash → Create User + Session → Return session token
    │
    ▼
[Client] Store session in Zustand + localStorage
    │
    ▼
[Client] Prompt for 6-digit PIN
    │
    ▼
[Client] Send PIN hash to /api/auth/set-pin
    │
    ▼
[Server] Hash PIN with bcrypt → Store in User.pinHash
    │
    ▼
[Client] Generate mnemonic (12 words) using viem
    │
    ▼
[Client] Derive wallet address from mnemonic
    │
    ▼
[Client] Encrypt mnemonic with PIN (PBKDF2 + AES-GCM)
    │
    ▼
[Client] Store encrypted payload in IndexedDB
    │
    ▼
[Client] Send wallet address + session → /api/wallet/register
    │
    ▼
[Server] Link address to user → Update User.walletAddress
    │
    ▼
[Client] Display wallet dashboard
```

### 2. Sign-In Flow

```
User Input (Email/Phone + PIN)
    │
    ▼
[Client] Send to /api/auth/signin
    │
    ▼
[Server] Find user by email/phone → Verify PIN with bcrypt.compare()
    │
    ▼
[Server] Create new Session → Return session token + user data
    │
    ▼
[Client] Store session in Zustand + persist to localStorage
    │
    ▼
[Client] Load encrypted wallet from IndexedDB using user.walletAddress
    │
    ▼
[Client] Prompt for PIN to decrypt wallet
    │
    ▼
[Client] Decrypt mnemonic → Derive account → Display dashboard
```

### 3. Social Recovery Setup Flow

```
[Client] User has mnemonic in memory (after wallet creation)
    │
    ▼
[Client] Split mnemonic into 5 shares using Shamir (threshold: 3)
    │
    ▼
[Client] User enters 5 trusted contact phone numbers
    │
    ▼
[Client] Send shares + contacts → /api/recovery/setup
    │
    ▼
[Server] Hash phone numbers → Store RecoveryContact records (plaintext shares)
    │
    ▼
[Server] Return success
```

### 4. Wallet Recovery Flow

```
User initiates recovery (lost PIN)
    │
    ▼
[Client] Send email/phone → /api/recovery/initiate
    │
    ▼
[Server] Find user's RecoveryContacts → Generate recovery codes
    │
    ▼
[Server] Encrypt each share with its recovery code → Update RecoveryContact.encryptedShare
    │
    ▼
[Server] Send recovery codes to contacts via SMS
    │
    ▼
[Server] Create RecoveryRequest (status: pending, expiresAt: +24h)
    │
    ▼
[Client] User collects 3+ recovery codes from contacts
    │
    ▼
[Client] Send codes → /api/recovery/verify
    │
    ▼
[Server] Find matching RecoveryContacts by code hash
    │
    ▼
[Server] Return encrypted shares
    │
    ▼
[Client] Decrypt shares with recovery codes
    │
    ▼
[Client] Reconstruct mnemonic using Shamir.combine(shares)
    │
    ▼
[Client] Prompt for new PIN
    │
    ▼
[Client] Re-encrypt mnemonic with new PIN → Store in IndexedDB
    │
    ▼
[Client] Send new PIN hash → /api/recovery/reset
    │
    ▼
[Server] Update User.pinHash → Mark RecoveryRequest as completed
    │
    ▼
[Client] Access restored wallet
```

## Security Model

### Client-Side Security

**Key Generation:**
- Uses viem's `generateMnemonic()` based on BIP39 standard
- Entropy source: `crypto.getRandomValues()` (browser's secure random)
- Never transmitted over network

**Encryption:**
- Algorithm: **AES-GCM** (256-bit keys)
- Key Derivation: **PBKDF2** with 150,000 iterations
- Salt: Randomly generated 16 bytes per encryption
- IV: Randomly generated 12 bytes per encryption
- Authenticated encryption prevents tampering

**Storage:**
- IndexedDB stores encrypted payload: `{ ciphertext, iv, salt }`
- Plaintext mnemonic only exists in memory during wallet operations
- Automatically cleared after session ends

### Server-Side Security

**PIN Hashing:**
- bcrypt with default cost factor (10 rounds)
- Salted automatically by bcrypt
- Prevents rainbow table attacks
- Slow hashing mitigates brute-force

**Session Management:**
- Random session tokens (UUID v4)
- 30-day expiration
- Validated on every protected endpoint
- Stored in database for revocation

**OTP Security:**
- 6-digit codes (000000-999999)
- 10-minute expiration
- bcrypt-hashed before storage
- One-time use (deleted after verification)

**Recovery Privacy:**
- Phone numbers hashed with SHA-256
- Shamir shares stored encrypted
- Individual shares reveal nothing about mnemonic
- Threshold prevents single-contact compromise

## Database Schema

### User Model
```prisma
model User {
  id               String       @id @default(uuid())
  email            String?      @unique
  phone            String?      @unique
  walletAddress    String?      @unique
  pinHash          String?      // bcrypt hash
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt
  
  // Relations (cascade delete)
  contacts          Contact[]
  transactions      Transaction[]
  balance           Balance?
  sessions          Session[]
  recoveryContacts  RecoveryContact[]
  recoveryRequests  RecoveryRequest[]
}
```

**Key Points:**
- `email` or `phone` used for authentication (one required)
- `walletAddress` links to encrypted data in IndexedDB
- `pinHash` used for sign-in authentication
- All relations cascade on user deletion

### Session Model
```prisma
model Session {
  id           String   @id @default(uuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  
  user User @relation(...)
}
```

**Key Points:**
- `sessionToken` used in API requests (header or cookie)
- `expires` checked on every protected route
- Single sign-out: delete session record

### RecoveryContact Model
```prisma
model RecoveryContact {
  id              String   @id @default(uuid())
  userId          String
  contactPhone    String   // SHA-256 hash (privacy)
  contactName     String?
  shareIndex      Int      // 1-5
  share           String   // Plaintext Shamir share
  encryptedShare  String?  // Encrypted during recovery initiation
  verified        Boolean  @default(false)
  createdAt       DateTime @default(now())
  
  @@unique([userId, shareIndex])
}
```

**Key Points:**
- `share`: Plaintext during setup, encrypted during recovery
- `contactPhone`: Hashed for privacy (can't reverse-lookup)
- `shareIndex`: Ensures consistent share ordering

### Transaction Model
```prisma
model Transaction {
  id               String             @id @default(uuid())
  userId           String
  txHash           String             @unique
  type             TransactionType    // SEND | RECEIVE
  token            TokenSymbol        // USDC | USDT | ETH
  amount           String             // String for precision
  recipientAddress String?
  senderAddress    String?
  platformFee      String?
  gasFee           String?
  status           TransactionStatus  // PENDING | CONFIRMED | FAILED
  blockNumber      BigInt?
  createdAt        DateTime           @default(now())
  confirmedAt      DateTime?
}
```

**Key Points:**
- `amount` stored as string to preserve decimal precision
- `txHash` used to track on-chain transaction
- `status` updated by polling or webhooks

## Environment Configuration

### Required Variables

```bash
# Database
DATABASE_URL="file:./dev.db"

# Authentication
NEXTAUTH_SECRET="minimum-32-character-random-string"
```

### Optional Variables

```bash
# Email OTP (Resend)
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="noreply@yourdomain.com"

# SMS OTP (Twilio)
TWILIO_ACCOUNT_SID="AC..."
TWILIO_AUTH_TOKEN="..."
TWILIO_FROM_NUMBER="+1234567890"

# Blockchain RPC
NEXT_PUBLIC_ALCHEMY_API_KEY="..."
NEXT_PUBLIC_RPC_URL="https://..."
NEXT_PUBLIC_NETWORK="sepolia"  # or "mainnet"

# Etherscan API
NEXT_PUBLIC_ETHERSCAN_API_KEY="..."
```

### Environment Validation

All environment variables are validated at runtime using Zod schemas in `src/config/env.ts`:

- **Server**: `getServerEnv()` - validates server-side vars
- **Client**: `getClientEnv()` - validates client-side vars (NEXT_PUBLIC_*)

Missing required variables throw errors at startup. Optional variables gracefully degrade (e.g., OTP logged to console).

## File Organization

```
ethereum-wallet/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── api/                  # API routes (server-side)
│   │   │   ├── auth/             # Authentication endpoints
│   │   │   │   ├── signup/       # POST: Send OTP
│   │   │   │   ├── verify/       # POST: Verify OTP
│   │   │   │   ├── set-pin/      # POST: Set PIN hash
│   │   │   │   └── signin/       # POST: Sign in with PIN
│   │   │   ├── wallet/           # Wallet management
│   │   │   │   ├── register/     # POST: Link address to user
│   │   │   │   ├── transactions/ # GET: Fetch transaction history
│   │   │   │   ├── backup/       # POST: Cloud backup (future)
│   │   │   │   └── restore/      # POST: Cloud restore (future)
│   │   │   └── recovery/         # Social recovery
│   │   │       ├── setup/        # POST: Setup recovery contacts
│   │   │       ├── contacts/     # GET: Fetch recovery contacts
│   │   │       ├── initiate/     # POST: Start recovery process
│   │   │       ├── verify/       # POST: Verify recovery codes
│   │   │       └── reset/        # POST: Complete recovery
│   │   ├── onboarding/           # Sign up/sign in page
│   │   ├── dashboard/            # Wallet dashboard
│   │   ├── recovery/             # Recovery flow page
│   │   ├── providers.tsx         # Root client wrapper
│   │   ├── layout.tsx            # Root layout
│   │   └── page.tsx              # Landing page
│   ├── components/               # React components
│   │   ├── auth-form.tsx         # Authentication UI
│   │   ├── wallet-setup.tsx      # Wallet creation UI
│   │   ├── wallet-dashboard.tsx  # Balance & transactions
│   │   ├── send-money.tsx        # Transaction form
│   │   ├── recovery-setup.tsx    # Recovery contact setup
│   │   ├── contact-verification.tsx  # OTP verification
│   │   └── profile-section.tsx   # User profile
│   ├── lib/                      # Utilities and helpers
│   │   ├── blockchain/
│   │   │   ├── client.ts         # viem publicClient
│   │   │   ├── tokens.ts         # ERC20 balance fetching
│   │   │   ├── wallet.ts         # Transaction signing
│   │   │   └── etherscan.ts      # Block explorer API
│   │   ├── crypto/
│   │   │   ├── encryption.ts     # AES-GCM + PBKDF2
│   │   │   └── recovery.ts       # Shamir's Secret Sharing
│   │   ├── storage/
│   │   │   └── indexeddb.ts      # Browser storage helpers
│   │   ├── otp.ts                # OTP generation/verification
│   │   └── prisma.ts             # Prisma client singleton
│   ├── stores/
│   │   └── auth-store.ts         # Zustand auth state
│   └── config/
│       ├── env.ts                # Environment validation
│       └── blockchain.ts         # Network configs
├── prisma/
│   └── schema.prisma             # Database schema
├── docs/                         # Documentation
│   ├── ARCHITECTURE.md           # This file
│   ├── API_REFERENCE.md
│   ├── SECURITY.md
│   ├── DEVELOPMENT.md
│   └── USER_FLOWS.md
├── scripts/                      # Utility scripts
├── .github/
│   └── copilot-instructions.md   # AI agent guidelines
├── package.json
├── tsconfig.json
└── README.md
```

## Deployment Considerations

### Production Readiness

**Not Ready For Production:**
- No formal security audit
- SQLite not suitable for production (use PostgreSQL)
- No rate limiting on API endpoints
- No monitoring/alerting infrastructure
- No backup/disaster recovery plan

**Required for Production:**
1. Security audit by third-party firm
2. PostgreSQL or MySQL database
3. Redis for session storage
4. Rate limiting (per IP, per user)
5. HTTPS only (enforce)
6. Content Security Policy headers
7. DDoS protection (Cloudflare, etc.)
8. Monitoring (Sentry, DataDog)
9. Encrypted database backups
10. Incident response plan

### Scaling Considerations

**Current Limitations:**
- SQLite: Single-threaded, not suitable for concurrent writes
- No CDN for static assets
- No load balancing
- No horizontal scaling

**Recommendations:**
- Use managed PostgreSQL (Supabase, Neon, AWS RDS)
- Deploy to Vercel/Netlify for edge functions
- Use Redis for session caching
- Implement queue system (BullMQ) for background jobs
- Separate read replicas for analytics

## Future Enhancements

### Planned Features

1. **Multi-signature wallets**: Require multiple approvals for transactions
2. **Hardware wallet integration**: Ledger, Trezor support
3. **Gas optimization**: Batch transactions, EIP-1559 support
4. **Token swap**: DEX integration (Uniswap, etc.)
5. **NFT support**: View and transfer NFTs
6. **Address book**: Save frequently used addresses
7. **Transaction export**: CSV/PDF export for accounting
8. **Push notifications**: Real-time transaction alerts
9. **Biometric auth**: Face ID, Touch ID support
10. **Cloud backup**: Encrypted backup to Google Drive/iCloud

### Technical Debt

1. Add comprehensive unit tests (Jest, Vitest)
2. Add E2E tests (Playwright)
3. Implement proper error boundaries
4. Add loading states and skeleton screens
5. Improve accessibility (ARIA labels, keyboard navigation)
6. Add internationalization (i18n)
7. Optimize bundle size (code splitting)
8. Add service worker for offline support
9. Implement proper logging infrastructure
10. Add CI/CD pipeline

---

**Last Updated**: 2025-11-02  
**Version**: 0.1.0  
**Maintainer**: See README.md
