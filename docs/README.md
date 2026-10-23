# Documentation Index

Welcome to the Ethereum Wallet documentation. This index helps you navigate all available documentation.

## 📚 Documentation Structure

### Core Documentation

1. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System Architecture
   - Overview of the zero-knowledge architecture
   - Technology stack and design principles
   - Data flow patterns for all major operations
   - Security model (client-side vs server-side)
   - File organization and project structure
   - Database schema documentation
   - Environment configuration
   - Deployment considerations
   - Future enhancements and technical debt

2. **[API_REFERENCE.md](./API_REFERENCE.md)** - API Documentation
   - Complete endpoint reference for all APIs
   - Authentication API (`/api/auth/*`)
   - Wallet API (`/api/wallet/*`)
   - Recovery API (`/api/recovery/*`)
   - Request/response schemas
   - Error handling patterns
   - Common patterns and conventions
   - Testing guidelines

3. **[SECURITY.md](./SECURITY.md)** - Security Guide
   - Security overview and core principles
   - Threat model and attack scenarios
   - Cryptographic standards (AES-GCM, PBKDF2, Shamir)
   - Key management lifecycle
   - Authentication security
   - Social recovery security
   - Network security best practices
   - Data privacy and GDPR considerations
   - Vulnerability disclosure process
   - Production security checklist

4. **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Developer Guide
   - Quick start and setup instructions
   - Development environment configuration
   - Project structure overview
   - Code conventions and patterns
   - Database management with Prisma
   - Testing guide (manual and automated)
   - Debugging techniques
   - Common development tasks
   - Troubleshooting guide
   - Contributing guidelines

5. **[USER_FLOWS.md](./USER_FLOWS.md)** - User Journey Documentation
   - Sign up flow (OTP verification, PIN setup, wallet creation)
   - Sign in flow (PIN authentication, session management)
   - Wallet creation flow (mnemonic generation, encryption)
   - Social recovery setup (Shamir's Secret Sharing)
   - Wallet recovery flow (code collection, mnemonic reconstruction)
   - Send money flow (transaction creation and signing)
   - View balance flow (ERC20 balance fetching)
   - Transaction history flow (filtering and pagination)

### Additional Resources

6. **[README.md](../README.md)** - Project Overview
   - Quick start guide
   - Feature highlights
   - Environment configuration
   - Security warnings
   - Links to all documentation

7. **[Copilot Instructions](../.github/copilot-instructions.md)** - AI Development Guidelines
   - Project context for AI agents
   - Architecture patterns
   - Code conventions
   - Development workflows
   - Security constraints

## 🎯 Quick Navigation

### For New Users

Start here to understand the wallet:
1. [README.md](../README.md) - Project overview
2. [USER_FLOWS.md](./USER_FLOWS.md) - How to use the wallet
3. [SECURITY.md](./SECURITY.md) - Security best practices

### For Developers

Start here to contribute:
1. [DEVELOPMENT.md](./DEVELOPMENT.md) - Setup and conventions
2. [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
3. [API_REFERENCE.md](./API_REFERENCE.md) - API documentation

### For Security Researchers

Start here for security analysis:
1. [SECURITY.md](./SECURITY.md) - Threat model and mitigations
2. [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
3. [API_REFERENCE.md](./API_REFERENCE.md) - API attack surface

### For DevOps/SRE

Start here for deployment:
1. [ARCHITECTURE.md](./ARCHITECTURE.md) - Deployment considerations
2. [SECURITY.md](./SECURITY.md) - Production security checklist
3. [DEVELOPMENT.md](./DEVELOPMENT.md) - Environment setup

## 📖 Documentation by Topic

### Architecture & Design

- [System Overview](./ARCHITECTURE.md#overview)
- [Core Design Principles](./ARCHITECTURE.md#core-design-principles)
- [Technology Stack](./ARCHITECTURE.md#technology-stack)
- [Data Flow Patterns](./ARCHITECTURE.md#data-flow-patterns)
- [File Organization](./ARCHITECTURE.md#file-organization)

### Security

- [Security Overview](./SECURITY.md#security-overview)
- [Threat Model](./SECURITY.md#threat-model)
- [Cryptographic Standards](./SECURITY.md#cryptographic-standards)
- [Key Management](./SECURITY.md#key-management)
- [Attack Scenarios](./SECURITY.md#threat-model)
- [Security Checklist](./SECURITY.md#security-checklist)

### API Documentation

- [Authentication Endpoints](./API_REFERENCE.md#authentication-api)
- [Wallet Endpoints](./API_REFERENCE.md#wallet-api)
- [Recovery Endpoints](./API_REFERENCE.md#recovery-api)
- [Error Handling](./API_REFERENCE.md#error-handling)
- [Common Patterns](./API_REFERENCE.md#common-patterns)

### Development

- [Quick Start](./DEVELOPMENT.md#quick-start)
- [Code Conventions](./DEVELOPMENT.md#code-conventions)
- [Database Management](./DEVELOPMENT.md#database-management)
- [Testing Guide](./DEVELOPMENT.md#testing-guide)
- [Debugging](./DEVELOPMENT.md#debugging)
- [Troubleshooting](./DEVELOPMENT.md#troubleshooting)

### User Guides

- [Sign Up Flow](./USER_FLOWS.md#sign-up-flow)
- [Sign In Flow](./USER_FLOWS.md#sign-in-flow)
- [Wallet Creation](./USER_FLOWS.md#wallet-creation-flow)
- [Social Recovery Setup](./USER_FLOWS.md#social-recovery-setup)
- [Wallet Recovery](./USER_FLOWS.md#wallet-recovery-flow)
- [Send Money](./USER_FLOWS.md#send-money-flow)

## 🔍 Search by Keyword

### Authentication
- [Sign Up Flow](./USER_FLOWS.md#sign-up-flow)
- [OTP System](./API_REFERENCE.md#post-apiauthsignup)
- [PIN Authentication](./SECURITY.md#authentication-security)
- [Session Management](./SECURITY.md#session-management)

### Wallet Management
- [Wallet Creation](./USER_FLOWS.md#wallet-creation-flow)
- [Key Generation](./ARCHITECTURE.md#key-management)
- [Mnemonic Storage](./SECURITY.md#key-management)
- [IndexedDB Usage](./ARCHITECTURE.md#storage-security)

### Cryptography
- [Encryption Standards](./SECURITY.md#cryptographic-standards)
- [AES-GCM Implementation](./SECURITY.md#encryption-algorithm-aes-gcm)
- [PBKDF2 Key Derivation](./SECURITY.md#key-derivation-pbkdf2)
- [Shamir's Secret Sharing](./SECURITY.md#shamirs-secret-sharing)

### Recovery
- [Social Recovery Setup](./USER_FLOWS.md#social-recovery-setup)
- [Recovery Flow](./USER_FLOWS.md#wallet-recovery-flow)
- [Recovery API](./API_REFERENCE.md#recovery-api)
- [Shamir Implementation](./SECURITY.md#social-recovery-security)

### Blockchain
- [Network Configuration](./ARCHITECTURE.md#blockchain-integration)
- [Token Support](./ARCHITECTURE.md#technology-stack)
- [Transaction Flow](./USER_FLOWS.md#send-money-flow)
- [Balance Fetching](./USER_FLOWS.md#view-balance-flow)

### Database
- [Prisma Schema](./ARCHITECTURE.md#database-schema)
- [Migrations](./DEVELOPMENT.md#database-management)
- [Data Models](./ARCHITECTURE.md#database-schema)

## 📊 Documentation Statistics

| Document | Lines | Topics Covered | Last Updated |
|----------|-------|----------------|--------------|
| ARCHITECTURE.md | ~800 | 15 | 2025-11-02 |
| API_REFERENCE.md | ~650 | 13 | 2025-11-02 |
| SECURITY.md | ~900 | 18 | 2025-11-02 |
| DEVELOPMENT.md | ~800 | 12 | 2025-11-02 |
| USER_FLOWS.md | ~1000 | 8 | 2025-11-02 |

**Total Documentation:** ~4,150 lines covering 66+ topics

## 🚀 Getting Started Paths

### Path 1: Complete Beginner
```
README.md
  ↓
USER_FLOWS.md (Sign Up)
  ↓
DEVELOPMENT.md (Quick Start)
  ↓
Build your first feature!
```

### Path 2: Experienced Developer
```
ARCHITECTURE.md
  ↓
API_REFERENCE.md
  ↓
DEVELOPMENT.md (Code Conventions)
  ↓
Start contributing!
```

### Path 3: Security Analyst
```
SECURITY.md (Threat Model)
  ↓
ARCHITECTURE.md (Security Model)
  ↓
API_REFERENCE.md (Attack Surface)
  ↓
Report vulnerabilities!
```

## 📝 Contributing to Documentation

Found an error or want to improve docs?

1. Read [Contributing Guidelines](./DEVELOPMENT.md#contributing-guidelines)
2. Make your changes
3. Submit a PR with `docs:` prefix
4. Update this index if adding new docs

## 🔗 External Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [viem Documentation](https://viem.sh)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Ethereum Development](https://ethereum.org/en/developers/)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

---

**Need Help?**
- Check [Troubleshooting Guide](./DEVELOPMENT.md#troubleshooting)
- Search this index for keywords
- Open an issue on GitHub

**Last Updated:** 2025-11-02  
**Documentation Version:** 1.0.0
