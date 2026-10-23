# Development Guide

Complete guide for developers working on the Ethereum Wallet project.

## Table of Contents

- [Quick Start](#quick-start)
- [Development Environment](#development-environment)
- [Project Structure](#project-structure)
- [Code Conventions](#code-conventions)
- [Database Management](#database-management)
- [Testing Guide](#testing-guide)
- [Debugging](#debugging)
- [Common Tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)
- [Contributing Guidelines](#contributing-guidelines)

---

## Quick Start

### Prerequisites

- **Node.js**: 20.x or higher
- **npm**: 9.x or higher (comes with Node.js)
- **Git**: Latest version

### Initial Setup

```bash
# Clone repository
git clone https://github.com/kabirdkng/ethereum-wallet.git
cd ethereum-wallet

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your values

# Generate Prisma Client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Start development server
npm run dev
```

Visit `http://localhost:3000` to see the application.

### Minimal .env Configuration

For local development, you only need:

```bash
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="your-32-character-minimum-secret-key"
NEXT_PUBLIC_NETWORK="sepolia"
```

All other variables are optional. Without them:
- OTPs will be logged to console
- Public RPC endpoints will be used (slower)

---

## Development Environment

### Recommended Tools

**Code Editor:**
- Visual Studio Code
- Extensions:
  - ESLint
  - Prettier
  - Prisma
  - Tailwind CSS IntelliSense
  - TypeScript and JavaScript Language Features

**Database Tools:**
- DB Browser for SQLite (GUI)
- Prisma Studio: `npx prisma studio`

**API Testing:**
- Postman or Insomnia
- cURL (command line)
- Thunder Client (VS Code extension)

### VS Code Configuration

**`.vscode/settings.json`:**
```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "tailwindCSS.experimental.classRegex": [
    ["clsx\\(([^)]*)\\)", "(?:'|\"|`)([^']*)(?:'|\"|`)"]
  ]
}
```

**`.vscode/tasks.json`** (already configured):
```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "lint",
      "type": "shell",
      "command": "npm run lint",
      "problemMatcher": ["$eslint-stylish"]
    }
  ]
}
```

Run lint with: **Cmd/Ctrl + Shift + B** → Select "lint"

---

## Project Structure

### Directory Layout

```
ethereum-wallet/
├── src/                          # Source code
│   ├── app/                      # Next.js App Router
│   │   ├── api/                  # API routes
│   │   │   ├── auth/             # Authentication endpoints
│   │   │   ├── wallet/           # Wallet management
│   │   │   └── recovery/         # Social recovery
│   │   ├── dashboard/            # Dashboard page
│   │   ├── onboarding/           # Sign up/in page
│   │   ├── recovery/             # Recovery page
│   │   ├── layout.tsx            # Root layout
│   │   ├── page.tsx              # Landing page
│   │   └── providers.tsx         # Client providers
│   ├── components/               # React components
│   ├── lib/                      # Utilities
│   │   ├── blockchain/           # Blockchain utilities
│   │   ├── crypto/               # Cryptography
│   │   ├── storage/              # IndexedDB
│   │   ├── otp.ts                # OTP generation
│   │   └── prisma.ts             # Prisma client
│   ├── stores/                   # Zustand stores
│   ├── config/                   # Configuration
│   │   ├── env.ts                # Environment validation
│   │   └── blockchain.ts         # Network configs
│   └── types/                    # TypeScript types
├── prisma/                       # Database
│   ├── schema.prisma             # Prisma schema
│   ├── migrations/               # Migration history
│   └── dev.db                    # SQLite database (dev)
├── docs/                         # Documentation
├── scripts/                      # Utility scripts
├── public/                       # Static assets
├── .github/                      # GitHub configs
│   └── copilot-instructions.md   # AI guidelines
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
├── eslint.config.mjs             # ESLint config
├── next.config.ts                # Next.js config
└── README.md                     # Project overview
```

### Import Aliases

Configured in `tsconfig.json`:

```typescript
import { prisma } from "@/lib/prisma";
import { useAuthStore } from "@/stores/auth-store";
import { getServerEnv } from "@/config/env";
```

Alias `@/` maps to `src/`.

---

## Code Conventions

### TypeScript Standards

**Always use TypeScript:**
- No `.js` files in `src/`
- Enable strict mode
- Define interfaces for data structures

**Example:**
```typescript
interface User {
  id: string;
  email?: string;
  phone?: string;
  walletAddress?: string;
}
```

### Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| **Files** | kebab-case | `auth-form.tsx` |
| **Components** | PascalCase | `AuthForm` |
| **Functions** | camelCase | `generateOtp()` |
| **Constants** | UPPER_SNAKE_CASE | `USDC_ADDRESSES` |
| **Types/Interfaces** | PascalCase | `EncryptionPayload` |
| **Database Models** | PascalCase | `User`, `Session` |

### React Patterns

**Component Structure:**
```typescript
"use client"; // If client component

import { useState } from "react";
import { useAuthStore } from "@/stores/auth-store";

interface Props {
  onSuccess?: () => void;
}

export default function MyComponent({ onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const { user } = useAuthStore();

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // ... logic
      onSuccess?.();
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* JSX */}
    </div>
  );
}
```

**Key Practices:**
- Use `"use client"` directive for client components
- Destructure props in function signature
- Handle loading and error states
- Use optional chaining (`onSuccess?.()`)
- Clean up effects with return function

### API Route Patterns

**Standard Structure:**
```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({
  field: z.string().min(1),
  // ... validation
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = requestSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid input",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { field } = parsed.data;

    // Business logic
    const result = await prisma.model.create({
      data: { field },
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[Context]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

**Key Practices:**
- Validate all inputs with Zod
- Use consistent error response format
- Log errors with context tag
- Return appropriate HTTP status codes
- Handle all exceptions

### Error Handling

**Client-Side:**
```typescript
try {
  const response = await fetch("/api/endpoint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Request failed");
  }

  const result = await response.json();
  return result;
} catch (error) {
  console.error("Failed to call API:", error);
  // Show user-friendly error message
  alert(error instanceof Error ? error.message : "An error occurred");
}
```

**Server-Side:**
```typescript
try {
  // Risky operation
} catch (error) {
  console.error("[Context]", error);
  
  // Don't leak internal errors to client
  return NextResponse.json(
    { error: "Operation failed" },
    { status: 500 }
  );
}
```

### Linting Rules

**ESLint Configuration:**
- `--max-warnings=0`: No warnings allowed
- TypeScript strict rules
- React hooks rules
- Next.js recommended rules

**Run Linter:**
```bash
npm run lint           # Check for issues
npm run lint -- --fix  # Auto-fix issues
```

**Common Issues:**
- Unused variables → Remove or prefix with `_`
- Missing dependencies in useEffect → Add to array
- Any type usage → Define proper types
- Console logs → Remove or use proper logger

---

## Database Management

### Prisma Workflows

**View Database Schema:**
```bash
npx prisma studio
# Opens GUI at http://localhost:5555
```

**Create Migration:**
```bash
npm run prisma:migrate -- --name add_user_secrets
# Creates migration in prisma/migrations/
```

**Apply Migrations:**
```bash
npm run prisma:migrate
# Applies pending migrations
```

**Regenerate Prisma Client:**
```bash
npm run prisma:generate
# Run after schema changes
```

**Reset Database (DESTRUCTIVE):**
```bash
npx prisma migrate reset
# Drops DB, re-runs all migrations, seeds data
```

### Schema Design Patterns

**Model Definition:**
```prisma
model User {
  id        String   @id @default(uuid())
  email     String?  @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  // Relations
  sessions Session[]
  
  @@index([email])
}
```

**Best Practices:**
- Use UUID for IDs (not auto-increment)
- Add `createdAt` and `updatedAt` to all models
- Use `@unique` for unique constraints
- Use `@@index` for frequently queried fields
- Cascade deletes where appropriate (`onDelete: Cascade`)

### Common Queries

**Create:**
```typescript
const user = await prisma.user.create({
  data: {
    email: "user@example.com",
    walletAddress: "0x...",
  },
});
```

**Find:**
```typescript
const user = await prisma.user.findUnique({
  where: { email: "user@example.com" },
  include: { sessions: true },
});
```

**Update:**
```typescript
await prisma.user.update({
  where: { id: userId },
  data: { pinHash: hashedPin },
});
```

**Delete:**
```typescript
await prisma.user.delete({
  where: { id: userId },
});
```

**Transaction:**
```typescript
await prisma.$transaction([
  prisma.user.update({ ... }),
  prisma.session.create({ ... }),
]);
```

---

## Testing Guide

### Testing Without External Services

**OTP Delivery (No Resend/Twilio):**

1. Start dev server: `npm run dev`
2. Trigger OTP: Sign up with email/phone
3. Check server console:
   ```
   [Auth] email OTP for user@example.com: 123456
   ```
4. Use the logged code for verification

**Alternative:** Check API response in dev mode:
```json
{
  "message": "Verification code sent.",
  "channel": "email",
  "devCode": "123456"
}
```

**Blockchain RPC (No Alchemy Key):**

Default fallback: Public RPC endpoints
- Sepolia: `https://ethereum-sepolia-rpc.publicnode.com`
- Mainnet: `https://ethereum.publicnode.com`

**Note:** Public RPCs are rate-limited. For development, this is acceptable.

### Manual Testing Workflows

**Sign Up Flow:**
1. Navigate to `/onboarding`
2. Enter email/phone
3. Submit → Check console for OTP
4. Enter OTP → Verify
5. Set 6-digit PIN
6. Wallet auto-generated
7. Save recovery phrase
8. Access dashboard

**Sign In Flow:**
1. Navigate to `/onboarding`
2. Switch to "Sign In" tab
3. Enter email/phone + PIN
4. Submit → Session created
5. Redirect to dashboard

**Recovery Setup:**
1. Sign in → Dashboard
2. Click "Setup Recovery"
3. Enter 3-5 contact phone numbers
4. Submit → Recovery contacts saved
5. Verify in Prisma Studio

**Wallet Recovery:**
1. Navigate to `/recovery`
2. Enter email/phone
3. Submit → Check contacts' phones for SMS (or console if no Twilio)
4. Collect 3+ codes
5. Enter codes → Shares retrieved
6. Set new PIN → Wallet recovered

### Unit Testing (Future)

**Setup:**
```bash
npm install --save-dev jest @testing-library/react @testing-library/jest-dom
```

**Example Test:**
```typescript
// __tests__/lib/crypto/encryption.test.ts
import { encryptWithPin, decryptWithPin } from '@/lib/crypto/encryption';

describe('Encryption', () => {
  it('should encrypt and decrypt correctly', async () => {
    const plaintext = 'test mnemonic phrase';
    const pin = '123456';
    
    const encrypted = await encryptWithPin(plaintext, pin);
    const decrypted = await decryptWithPin(encrypted, pin);
    
    expect(decrypted).toBe(plaintext);
  });
});
```

---

## Debugging

### Server-Side Debugging

**Console Logging:**
```typescript
console.log("[Context]", variable);
console.error("[Context]", error);
```

**Request Inspection:**
```typescript
export async function POST(request: Request) {
  const body = await request.json();
  console.log("Request body:", JSON.stringify(body, null, 2));
  // ...
}
```

**Database Queries:**
```typescript
// Enable query logging
const result = await prisma.user.findUnique({
  where: { id: userId },
});
console.log("User found:", result);
```

### Client-Side Debugging

**React DevTools:**
- Install React DevTools browser extension
- Inspect component props and state
- View component tree

**Zustand DevTools:**
```typescript
import { devtools } from 'zustand/middleware';

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set) => ({ /* state */ }),
      { name: 'auth-storage' }
    ),
    { name: 'AuthStore' }
  )
);
```

**IndexedDB Inspection:**
- Browser DevTools → Application tab
- IndexedDB → `wallet-vault` → `wallets`
- View encrypted wallet payloads

**Network Tab:**
- Browser DevTools → Network tab
- Filter by "Fetch/XHR"
- Inspect API request/response

### Common Debugging Tasks

**Issue: OTP not received**
- Check server console for logged OTP
- Verify Resend/Twilio credentials
- Check spam folder (email)

**Issue: Session expired**
- Check session expiry in database
- Verify `sessionToken` in localStorage
- Clear localStorage and re-authenticate

**Issue: Wallet not loading**
- Check IndexedDB for encrypted payload
- Verify wallet address matches user record
- Check browser console for decryption errors

**Issue: Transaction not confirming**
- Check Etherscan for transaction status
- Verify sufficient gas
- Check RPC endpoint connectivity

---

## Common Tasks

### Adding a New API Endpoint

1. **Create route file:**
   ```bash
   mkdir -p src/app/api/feature
   touch src/app/api/feature/route.ts
   ```

2. **Implement handler:**
   ```typescript
   import { NextResponse } from "next/server";
   import { z } from "zod";
   import { prisma } from "@/lib/prisma";

   const schema = z.object({
     field: z.string(),
   });

   export async function POST(request: Request) {
     // ... (follow API route pattern)
   }
   ```

3. **Test with cURL:**
   ```bash
   curl -X POST http://localhost:3000/api/feature \
     -H "Content-Type: application/json" \
     -d '{"field": "value"}'
   ```

### Adding a New Database Model

1. **Update schema:**
   ```prisma
   // prisma/schema.prisma
   model NewModel {
     id        String   @id @default(uuid())
     field     String
     createdAt DateTime @default(now())
     
     @@index([field])
   }
   ```

2. **Create migration:**
   ```bash
   npm run prisma:migrate -- --name add_new_model
   ```

3. **Generate client:**
   ```bash
   npm run prisma:generate
   ```

4. **Use in code:**
   ```typescript
   import { prisma } from "@/lib/prisma";
   
   const item = await prisma.newModel.create({
     data: { field: "value" },
   });
   ```

### Adding a New Environment Variable

1. **Define in schema:**
   ```typescript
   // src/config/env.ts
   const serverSchema = z.object({
     // ...
     NEW_VAR: z.string().optional(),
   });
   ```

2. **Add to `.env`:**
   ```bash
   NEW_VAR="value"
   ```

3. **Use in code:**
   ```typescript
   import { getServerEnv } from "@/config/env";
   
   const { NEW_VAR } = getServerEnv();
   ```

### Updating Dependencies

**Check outdated packages:**
```bash
npm outdated
```

**Update package:**
```bash
npm update package-name
```

**Update all packages:**
```bash
npm update
```

**Security audit:**
```bash
npm audit
npm audit fix
```

---

## Troubleshooting

### Build Errors

**Error:** `Type error: Cannot find module '@/lib/...'`
- **Fix:** Run `npm run prisma:generate`

**Error:** `Module not found: Can't resolve 'xyz'`
- **Fix:** `npm install xyz`

**Error:** `Type '...' is not assignable to type '...'`
- **Fix:** Check TypeScript types, regenerate Prisma client

### Runtime Errors

**Error:** `PrismaClientInitializationError`
- **Fix:** Run `npm run prisma:migrate`

**Error:** `Invalid \`prisma.model.operation()\` invocation`
- **Fix:** Schema mismatch, regenerate client

**Error:** `fetch failed` (API calls)
- **Fix:** Check API route, verify server is running

### Database Issues

**Error:** Database locked
- **Fix:** Close Prisma Studio, restart dev server

**Error:** Unique constraint failed
- **Fix:** Data already exists, use `findUnique` first

**Error:** Foreign key constraint failed
- **Fix:** Related record doesn't exist, check relations

### Environment Issues

**Error:** `NEXTAUTH_SECRET must be at least 32 characters`
- **Fix:** Generate longer secret:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

**Error:** `DATABASE_URL is required`
- **Fix:** Add to `.env`:
  ```bash
  DATABASE_URL="file:./dev.db"
  ```

---

## Contributing Guidelines

### Before Submitting PR

1. **Run linter:**
   ```bash
   npm run lint
   ```

2. **Test locally:**
   - Sign up flow
   - Sign in flow
   - Wallet creation
   - Recovery setup

3. **Check build:**
   ```bash
   npm run build
   ```

4. **Update documentation** (if applicable)

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tested locally
- [ ] No lint errors
- [ ] Build succeeds

## Checklist
- [ ] Code follows project conventions
- [ ] Documentation updated
- [ ] No security vulnerabilities introduced
```

### Code Review Checklist

**Security:**
- No hardcoded secrets
- Input validation present
- No SQL injection vulnerabilities
- Proper error handling

**Code Quality:**
- TypeScript types defined
- No lint warnings
- Follows naming conventions
- Comments where necessary

**Testing:**
- Manually tested
- No broken functionality
- Edge cases considered

---

## Additional Resources

**Documentation:**
- [Next.js Docs](https://nextjs.org/docs)
- [Prisma Docs](https://www.prisma.io/docs)
- [viem Docs](https://viem.sh)
- [Zod Docs](https://zod.dev)

**Tools:**
- [Prisma Studio](https://www.prisma.io/studio)
- [Postman](https://www.postman.com)
- [DB Browser for SQLite](https://sqlitebrowser.org)

**Internal Docs:**
- [Architecture](./ARCHITECTURE.md)
- [API Reference](./API_REFERENCE.md)
- [Security](./SECURITY.md)
- [User Flows](./USER_FLOWS.md)

---

**Last Updated**: 2025-11-02  
**Version**: 0.1.0
