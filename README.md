# Non-Custodial Ethereum Wallet

A self-custody Ethereum wallet built with Next.js 16 App Router, focusing on USDC/USDT transfers with client-side key management, social recovery, and session persistence.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.0-black.svg)](https://nextjs.org/)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)

> ⚠️ **MVP Project**: This wallet is an MVP (Minimum Viable Product). Not yet audited for production use with real funds. Use at your own risk.

### 🎯 Key Features

- **Self-Custody**: Private keys never leave your device - generated and stored client-side
- **Client-Side Encryption**: AES-GCM encryption with PBKDF2 key derivation (150k iterations)
- **Social Recovery**: Shamir's Secret Sharing (3-of-5 threshold) for wallet recovery
- **Real-time Transaction Monitoring**: Server-side background worker ensures transactions are tracked even when browser is closed
- **Session Persistence**: Zustand + localStorage for seamless authentication
- **PIN Authentication**: Sign in with email/phone + 6-digit PIN
- **IndexedDB Storage**: Encrypted wallet data stored locally in browser
- **Type-Safe**: TypeScript + Zod validation throughout

### 🏗️ Architecture

**Client-Side:**
- Wallet generation via viem's `generateMnemonic()` and `mnemonicToAccount()`
- Encryption using Web Crypto API (browser-native, no external crypto libs)
- State management with Zustand (persistent auth store)
- IndexedDB for encrypted mnemonic storage

**Server-Side:**
- Prisma + SQLite for user metadata and session management
- bcrypt PIN hashing (server-side authentication)
- OTP delivery via Resend (email) and Twilio (SMS)
- Background transaction monitor for real-time blockchain updates
- Server-Sent Events (SSE) for real-time notifications
- No access to private keys or plaintext mnemonics

### 📁 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/         # Authentication routes (signup, signin, verify, set-pin)
│   │   ├── wallet/       # Wallet management (register)
│   │   └── recovery/     # Social recovery (setup, initiate, verify)
│   ├── onboarding/       # Unified sign-up/sign-in flow
│   ├── dashboard/        # Main wallet dashboard
│   └── recovery/         # Wallet recovery flow
├── components/           # React components (auth-form, wallet-setup, etc.)
├── lib/
│   ├── blockchain/      # Blockchain utilities (client, tokens)
│   ├── crypto/          # Encryption and Shamir's Secret Sharing
│   ├── storage/         # IndexedDB helpers
│   ├── otp.ts           # OTP generation and verification
│   └── prisma.ts        # Prisma client singleton
├── stores/
│   └── auth-store.ts    # Zustand authentication store
└── config/
    ├── blockchain.ts    # Network configs, contract addresses
    └── env.ts           # Environment variable validation
```

### 🚀 Quick Start

**Prerequisites:**
- Node.js 20+
- npm or pnpm

**Installation:**

```bash
npm install
npm run prisma:generate
npm run dev
```

Visit `http://localhost:3000` to start using the wallet.

### 🔐 Environment Variables

Copy `.env.example` to `.env` and configure:

**Required:**
```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="your-32-char-secret"
NEXT_PUBLIC_NETWORK="sepolia"  # or "mainnet"
```

**Optional (for OTP delivery):**
```env
# Email OTP via Resend
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="noreply@yourdomain.com"

# SMS OTP via Twilio
TWILIO_ACCOUNT_SID="AC..."
TWILIO_AUTH_TOKEN="..."
TWILIO_FROM_NUMBER="+1234567890"
```

**Optional (for blockchain RPC):**
```env
# Recommended: Alchemy for better performance
NEXT_PUBLIC_ALCHEMY_API_KEY="..."

# Alternative: Custom RPC URL
NEXT_PUBLIC_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/..."
```

> **Note:** Without Resend/Twilio credentials, OTPs are logged to console (dev mode).
> **Note:** Without RPC configuration, public RPC endpoints are used (rate-limited).

### 📖 User Flows

#### Sign Up (New User)
1. Enter email/phone → Receive OTP
2. Verify OTP → Session created
3. Set 6-digit PIN → PIN hash stored
4. Generate wallet → Mnemonic encrypted with PIN
5. Save recovery phrase (12 words)
6. (Optional) Set up social recovery contacts
7. Access dashboard

#### Sign In (Existing User)
1. Enter email/phone + PIN
2. PIN verified against hash
3. Session created and persisted
4. Redirect to dashboard (wallet loaded from IndexedDB)

#### Wallet Recovery
1. Enter email/phone on recovery page
2. Recovery codes sent to trusted contacts (SMS)
3. Collect 3+ recovery codes
4. Shamir shares reconstructed → Mnemonic recovered
5. Set new PIN → Re-encrypt mnemonic
6. Access dashboard

### 🗄️ Database Schema

**User Model:**
```prisma
model User {
  id            String   @id @default(uuid())
  email         String?  @unique
  phone         String?  @unique
  walletAddress String?  @unique
  pinHash       String?  // bcrypt hash of PIN
  // ... relations
}
```

**Session Model:**
```prisma
model Session {
  sessionToken String   @unique
  userId       String
  expires      DateTime
}
```

See `prisma/schema.prisma` for full schema including recovery contacts, transactions, and balances.

### 🧪 Development Commands

```bash
# Development
npm run dev              # Start dev server

# Database
npm run prisma:migrate   # Create migration
npm run prisma:generate  # Regenerate Prisma Client

# Code Quality
npm run lint             # Lint with ESLint (--max-warnings=0)
npm run build            # Production build
```

### 📚 Documentation

**Core Documentation:**
- **[Architecture Guide](./docs/ARCHITECTURE.md)** - Complete system architecture and design principles
- **[API Reference](./docs/API_REFERENCE.md)** - Comprehensive API endpoint documentation
- **[Security Guide](./docs/SECURITY.md)** - Security practices, threat model, and requirements
- **[Development Guide](./docs/DEVELOPMENT.md)** - Developer setup, conventions, and workflows
- **[User Flows](./docs/USER_FLOWS.md)** - Detailed user journey documentation
- **[Transaction Monitoring](./docs/TRANSACTION_MONITORING.md)** - Real-time transaction tracking system

**Additional Resources:**
- **[Copilot Instructions](./.github/copilot-instructions.md)** - AI agent development guidelines

### ⚡ Real-time Transaction Monitoring

The wallet features a server-side background worker that ensures transactions are tracked and updated in real-time, regardless of browser state:

**Features:**
- **Persistent Tracking**: Transactions are monitored even when the user closes the browser tab
- **Pending Transaction Polling**: Checks blockchain every 10 seconds for confirmations
- **Incoming Transaction Detection**: Syncs blockchain every 2 minutes for active wallets
- **SSE Notifications**: Real-time updates pushed to connected clients
- **Automatic Status Updates**: PENDING → CONFIRMED/FAILED transitions happen automatically

**How it Works:**
1. **Sender Flow**: User sends transaction → Monitor checks blockchain → Updates status → Notifies user
2. **Receiver Flow**: External wallet sends USDC → Monitor syncs blockchain → Detects new transaction → Notifies recipient

See [Transaction Monitoring Documentation](./docs/TRANSACTION_MONITORING.md) for complete technical details.

### 🔒 Security Principles

1. **Client-Side Cryptography**: All key generation and encryption happens in the browser using Web Crypto API
2. **Zero-Knowledge Server**: Server never sees private keys, mnemonics, or plaintext PINs
3. **PIN-Based Encryption**: Mnemonic encrypted with PBKDF2-derived key (150,000 iterations) + AES-GCM
4. **Shamir's Secret Sharing**: 3-of-5 threshold for social recovery prevents single-point-of-failure
5. **Session Management**: 30-day session tokens with server-side validation and expiry
6. **Privacy Preservation**: Phone numbers hashed, minimal data collection
7. **No External Wallets**: Pure self-custody - no wagmi/RainbowKit/MetaMask integration

**Learn More:** See [Security Guide](./docs/SECURITY.md) for detailed threat model and best practices.

### 🌐 Blockchain Integration

**Network Support:**
- **Sepolia Testnet** (default) - for development and testing
- **Ethereum Mainnet** - configurable via `NEXT_PUBLIC_NETWORK` environment variable

**Token Support:**
- USDC balance fetching (via ERC20 contract)
- USDT balance fetching (via ERC20 contract)
- Real-time balance updates on wallet dashboard

**Contract Addresses:**
- Sepolia USDC: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`
- Mainnet USDC: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`

**RPC Configuration:**
- Default: Public RPC endpoints (rate-limited)
- Recommended: Alchemy API for better reliability
- Custom RPC URLs supported via environment variables

**Utilities:**
- `src/config/blockchain.ts` - Network selection and contract addresses
- `src/lib/blockchain/client.ts` - viem publicClient configuration
- `src/lib/blockchain/tokens.ts` - Balance fetching and formatting

### ⚠️ Security Warnings

**IMPORTANT - Read Before Use:**

- ⚠️ **MVP STATUS**: This is a Minimum Viable Product under active development
- ❌ **NO SECURITY AUDIT**: Has not been formally audited by security professionals
- ⚠️ **USE WITH CAUTION**: Start with small amounts or testnet funds until you're comfortable
- ✅ **BACKUP REQUIRED**: Always write down and securely store your 12-word recovery phrase
- ✅ **TRUSTED CONTACTS**: Choose only trustworthy contacts for social recovery
- ❌ **NO WARRANTY**: Use at your own risk - developers assume no liability for lost funds

**For Production Use, You Need:**
- Professional security audit
- Penetration testing
- Rate limiting implementation
- Production-grade database (PostgreSQL)
- Monitoring and alerting
- Incident response plan

See [Security Guide](./docs/SECURITY.md) for complete security analysis.

### 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Blockchain**: viem (Ethereum account management)
- **Database**: Prisma + SQLite
- **State**: Zustand + localStorage persistence
- **Storage**: IndexedDB (browser-native)
- **Crypto**: Web Crypto API (AES-GCM, PBKDF2)
- **Recovery**: Shamir's Secret Sharing
- **Validation**: Zod schemas
- **Auth**: Custom OTP + PIN system
- **Email**: Resend
- **SMS**: Twilio

### 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. **Read Documentation**: Familiarize yourself with [Architecture](./docs/ARCHITECTURE.md) and [Development Guide](./docs/DEVELOPMENT.md)
2. **Code Quality**: Follow TypeScript conventions, pass linting (`npm run lint`)
3. **Security First**: Review [Security Guide](./docs/SECURITY.md) before making changes
4. **Test Thoroughly**: Test all changes locally before submitting PR
5. **Document Changes**: Update relevant documentation

**Reporting Security Issues:**
- DO NOT open public issues for security vulnerabilities
- Create a private security advisory on GitHub
- See [Vulnerability Disclosure](./docs/SECURITY.md#vulnerability-disclosure)

### 📧 Contact & Support

- **Issues**: [GitHub Issues](https://github.com/kabirdkng/ethereum-wallet/issues)
- **Discussions**: [GitHub Discussions](https://github.com/kabirdkng/ethereum-wallet/discussions)
- **Security**: See [Security Guide](./docs/SECURITY.md) for reporting vulnerabilities

### 📄 License

This project is proprietary software. All rights reserved. See the [LICENSE](LICENSE) file for details.

### 🙏 Acknowledgments

Built with open-source technologies:
- [Next.js](https://nextjs.org/) - React framework
- [viem](https://viem.sh) - Ethereum interactions
- [Prisma](https://www.prisma.io/) - Database ORM
- [Zustand](https://zustand-demo.pmnd.rs/) - State management
- [Shamir's Secret Sharing](https://github.com/grempe/secrets.js) - Social recovery

---

**⚡ Built with security-first architecture - Your keys, your crypto.**

**📚 Complete Documentation: [/docs](./docs/)**
