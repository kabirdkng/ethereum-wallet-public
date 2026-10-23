# Non-Custodial Ethereum Wallet – AI Agent Instructions

## Project Overview

This is a **self-custody Ethereum wallet MVP** built with Next.js 16 App Router, focusing on USDC/USDT transfers with client-side key management and social recovery. The architecture prioritizes **security through separation**: private keys never touch the server, cryptographic operations happen in the browser, and the backend only stores encrypted metadata.

## Core Architecture Principles

### Security Model: Client-Side Keys, Server-Side Metadata
- **Private keys are NEVER sent to the server** – generated client-side via viem's `generateMnemonic()` and `mnemonicToAccount()`
- **Encryption happens in the browser** – `src/lib/crypto/encryption.ts` uses Web Crypto API (AES-GCM with PBKDF2 key derivation, 150k iterations)
- **IndexedDB storage** – encrypted wallet payloads stored locally via `src/lib/storage/indexeddb.ts`
- **Server stores only**: user metadata (email/phone), wallet address (public), and session tokens – see `prisma/schema.prisma`

### Data Flow for Wallet Creation
1. User submits email/phone → `/api/auth/signup` generates OTP (bcrypt-hashed), stores in `VerificationToken`
2. User verifies OTP → `/api/auth/verify` creates `User` + `Session`, returns session token
3. Client generates mnemonic → derives wallet address → encrypts mnemonic with PIN (AES-GCM) → stores in IndexedDB
4. Client sends address + session token → `/api/wallet/register` links address to user record
5. (Optional) User sets up social recovery → mnemonic split via Shamir's Secret Sharing → encrypted shards sent to recovery contacts

### Recovery Architecture (See RECOVERY_ARCHITECTURE.md for details)
- **Social Recovery**: Shamir's Secret Sharing (3-of-5 threshold) - mnemonic split into shares distributed to trusted contacts
- **Recovery Flow**: User initiates recovery → contacts receive SMS → user collects 3+ recovery codes → client reconstructs mnemonic → new PIN created
- **Security**: Server never sees plaintext mnemonic; individual shares reveal nothing; 24-hour recovery window

### Environment Configuration Pattern
- **Centralized validation**: `src/config/env.ts` uses Zod schemas to validate server/client env vars at runtime
- **Split server/client**: `getServerEnv()` for API routes, `getClientEnv()` for client components
- **Required**: `DATABASE_URL` and `NEXTAUTH_SECRET`
- **Optional**: Resend (email), Twilio (SMS) - graceful fallbacks to console logging
- **Platform fees**: Both `NEXT_PUBLIC_PLATFORM_FEE_PERCENTAGE` and `NEXT_PUBLIC_PLATFORM_FEE_RECIPIENT` are client-visible (transactions are signed client-side)
- **Missing env vars**: Add to both `env.ts` schema AND `.env`/`.env.example` to prevent runtime errors

## Key Code Patterns

### API Route Structure
All API routes follow this error-handling pattern:
```typescript
export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "...", details: parsed.error.flatten() }, { status: 400 });
    }
    // ... business logic
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("...", error);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
```

### Prisma Usage
- **Global singleton**: `src/lib/prisma.ts` uses `globalThis` pattern to prevent multiple instances in dev hot-reload
- **Cascade deletes**: User deletions cascade to contacts, transactions, balance, sessions, secrets via `onDelete: Cascade`
- **Schema migrations**: Use `npm run prisma:migrate -- --name <description>` then `npm run prisma:generate`

### Type Safety with Zod
- **Runtime validation**: All user inputs validated with Zod (see `contactSchema`, `registerSchema` in API routes)
- **Discriminated unions**: `contactSchema` uses `.discriminatedUnion("contactType", ...)` for email vs phone validation
- **Transform + refine**: Phone numbers normalized via `.transform()` then validated with `.refine()`

### Client-Side Wallet Operations with viem
- **Mnemonic generation**: Use `generateMnemonic(english)` to create 12-word recovery phrase
- **Account derivation**: Use `mnemonicToAccount(mnemonic)` to derive private key and address
- **No wallet connection**: This app does NOT use wagmi/RainbowKit for external wallet connections
- **Self-custody only**: All keys managed in-app via IndexedDB encryption

## Development Workflows

### Local Setup
```bash
npm install
npm run prisma:generate
npm run dev  # starts on localhost:3000
```

### Database Migrations
```bash
npm run prisma:migrate -- --name add_user_secrets
npm run prisma:generate
```

### Linting
```bash
npm run lint  # eslint with --max-warnings=0
```
VS Code task configured: `shell: lint` runs this command.

### Testing Flows Without External Services
- **OTP delivery**: If `RESEND_API_KEY` or `TWILIO_*` are unset, API routes log OTP to console (check server logs)
- **Development mode**: `/api/auth/signup` response includes `devCode` field when env detection passes (helpful for testing)
- **No blockchain RPC needed**: viem cryptographic functions work offline (mnemonic generation, key derivation)

## File Organization

- **`src/app`**: Next.js App Router pages and API routes
  - `providers.tsx`: Root client component (simplified - no external providers)
  - `api/auth/*`: OTP signup and verification endpoints
  - `api/wallet/register`: Links wallet address to authenticated user
  - `api/recovery/*`: Social recovery setup, initiation, and verification
- **`src/lib`**: Shared utilities (Prisma, crypto, storage)
  - `crypto/encryption.ts`: Web Crypto AES-GCM helpers (PIN-based encryption)
  - `storage/indexeddb.ts`: Browser-side encrypted wallet storage
- **`src/components`**: Modular UI components (ContactVerification, WalletSetup, RecoverySetup, SendMoney, WalletDashboard)
- **`src/config`**: Environment validation (env.ts)
- **`prisma/schema.prisma`**: Database models (User, RecoveryContact, RecoveryRequest, Transaction, Balance, Session)

## Critical Constraints

1. **Never log sensitive data**: Avoid logging PINs, mnemonics, private keys, recovery codes, or unhashed OTPs
2. **Client-side encryption only**: All cryptographic operations use Web Crypto API; no server-side key access
3. **Session-based auth**: Session tokens link ephemeral auth to user records; validate expiry on every protected route
4. **Graceful degradation**: Missing env vars (Resend, Twilio) should log warnings, not crash
5. **Strict linting**: `--max-warnings=0` enforced; fix all ESLint issues before commit
6. **Recovery security**: Shamir shares stored encrypted; threshold prevents single-contact attacks; time-limit recovery requests
7. **Privacy-first**: Hash phone numbers in recovery contacts; never store plaintext mnemonics server-side

## Platform Economics

### Transaction Fee Model
- **Platform fee**: Configurable percentage (default 1.5%) set via `NEXT_PUBLIC_PLATFORM_FEE_PERCENTAGE`
- **Fee recipient**: Platform wallet address from `NEXT_PUBLIC_PLATFORM_FEE_RECIPIENT` env var
- **Fee calculation**: Applied to USDC/USDT transfers, deducted from user's amount before sending
- **Dual transfer pattern**: Single transaction sends to recipient + platform fee to fee wallet
- **Storage**: `platformFee` field in `Transaction` model tracks fee amount for each transaction

### Transaction Flow with Fees
1. User enters amount in `send-money.tsx` → component calculates platform fee
2. Confirmation UI shows: recipient amount, platform fee, total deducted from wallet
3. `sendUSDC()` in `tokens.ts` executes transfers using **gas-optimized batching**:
   - **Primary**: Multicall3 batches both transfers (recipient + fee) into single transaction
   - **Fallback**: Sequential transfers if batching fails or is unavailable
4. Transaction record in DB includes `platformFee` field
5. Batched transfers save ~40-50% on gas costs compared to sequential transfers

### Gas Optimization with Multicall3
- **Contract**: Multicall3 deployed at `0xcA11bde05977b3631167028862bE2a173976CA11` (all EVM chains)
- **Pattern**: Multiple ERC20 transfers bundled into single transaction via `aggregate3()`
- **Benefits**: Single gas payment for multiple operations, atomic execution (all succeed or all fail)
- **Implementation**: `src/lib/blockchain/multicall.ts` provides `batchTransferWithFee()` and `batchERC20Transfers()`
- **Graceful degradation**: Falls back to sequential transfers if multicall fails or unavailable

## Extending the Codebase

### Adding a New API Route
1. Create route in `src/app/api/<domain>/<action>/route.ts`
2. Define Zod schema for request body validation
3. Import `prisma` from `@/lib/prisma` for database access
4. Follow error-handling pattern (try/catch with Zod `.safeParse()`)
5. Return `NextResponse.json()` with consistent shape

### Adding a New Prisma Model
1. Update `prisma/schema.prisma` with new model
2. Run `npm run prisma:migrate -- --name <description>`
3. Run `npm run prisma:generate` to update Prisma Client types
3. Import and use via `prisma.<model>.<method>()`

### Adding Client-Side Transaction Signing
1. Decrypt wallet from IndexedDB using PIN (see `src/lib/storage/indexeddb.ts`)
2. Derive account using `mnemonicToAccount(mnemonic)` from viem
3. Create wallet client with `createWalletClient({ account, chain, transport })`
4. Sign and send transaction using `walletClient.writeContract()` for ERC20 transfers
5. Store transaction hash and update UI

### Component Communication Patterns
- **State management**: Zustand store (`auth-store.ts`) for session persistence with localStorage
- **Modal flows**: Parent components pass `onSuccess`/`onCancel` callbacks to child components
- **Multi-step forms**: Track step state locally, show/hide sections conditionally (see `send-money.tsx` PIN confirmation)
- **Data fetching**: Components fetch balances/transactions on mount using `useEffect` with `fetchedRef` to prevent double-fetching
- **Error handling**: Local error state + conditional error banners with retry buttons

## Common Pitfalls

- **Forgetting to call `getServerEnv()` in API routes**: Causes runtime errors when accessing `process.env` directly
- **Not handling IndexedDB unavailability**: Always check `isBrowser()` before calling storage helpers
- **Skipping Prisma client regeneration**: After schema changes, must run `prisma:generate` to update types
- **Hardcoding env vars**: Use `src/config/env.ts` getters instead of `process.env.*` for type safety and validation
- **Attempting to use wagmi/RainbowKit**: This project does NOT use external wallet connection libraries - all keys are self-custodied
- **Confusing self-custody with Web3 dapp patterns**: This is a wallet app, not a dapp that connects to wallets
