# User Flows

Detailed user journey documentation for all major workflows in the Ethereum Wallet application.

## Table of Contents

- [Sign Up Flow](#sign-up-flow)
- [Sign In Flow](#sign-in-flow)
- [Wallet Creation Flow](#wallet-creation-flow)
- [Social Recovery Setup](#social-recovery-setup)
- [Wallet Recovery Flow](#wallet-recovery-flow)
- [Send Money Flow](#send-money-flow)
- [View Balance Flow](#view-balance-flow)
- [Transaction History Flow](#transaction-history-flow)

---

## Sign Up Flow

### Overview

New users register with email or phone number via OTP verification, then set a PIN for wallet security.

### User Journey

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Landing Page (/)                                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
User clicks "Get Started" or navigates to /onboarding
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Onboarding Page (/onboarding)                       │
│                                                              │
│ [Sign Up] [Sign In]  ← Tabs                                 │
│                                                              │
│ Choose contact method:                                       │
│ ( ) Email  (•) Phone                                        │
│                                                              │
│ Email/Phone: [_________________]                            │
│                                                              │
│              [Send Code]                                     │
└─────────────────────────────────────────────────────────────┘
                          ↓
User enters email or phone, clicks "Send Code"
                          ↓
API Call: POST /api/auth/signup
  Request: { contactType: "email", contact: "user@example.com" }
  Response: { message: "Verification code sent.", channel: "email" }
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 3: OTP Verification                                     │
│                                                              │
│ Enter the 6-digit code sent to user@example.com            │
│                                                              │
│ Code: [_] [_] [_] [_] [_] [_]                              │
│                                                              │
│       [Verify]  [Resend Code]                               │
└─────────────────────────────────────────────────────────────┘
                          ↓
User receives OTP via email/SMS (or checks console in dev mode)
User enters 6-digit code, clicks "Verify"
                          ↓
API Call: POST /api/auth/verify
  Request: { contactType: "email", contact: "...", otp: "123456" }
  Response: { sessionToken: "...", user: { id: "...", email: "..." } }
                          ↓
Session stored in Zustand + localStorage
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 4: Set PIN                                              │
│                                                              │
│ Create a 6-digit PIN to secure your wallet                  │
│                                                              │
│ PIN: [______]                                                │
│                                                              │
│ Confirm PIN: [______]                                        │
│                                                              │
│              [Continue]                                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
User enters PIN twice, clicks "Continue"
Client validates PIN match
                          ↓
API Call: POST /api/auth/set-pin
  Request: { sessionToken: "...", pin: "123456" }
  Response: { message: "PIN set successfully." }
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 5: Wallet Generation (Automatic)                       │
│                                                              │
│ ⏳ Creating your wallet...                                   │
│                                                              │
│ • Generating secure keys                                    │
│ • Encrypting wallet                                          │
│ • Saving to secure storage                                  │
└─────────────────────────────────────────────────────────────┘
                          ↓
Client generates mnemonic (12 words) using viem
Client derives wallet address from mnemonic
Client encrypts mnemonic with PIN (PBKDF2 + AES-GCM)
Client stores encrypted payload in IndexedDB
                          ↓
API Call: POST /api/wallet/register
  Request: { sessionToken: "...", walletAddress: "0x..." }
  Response: { message: "Wallet registered successfully." }
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 6: Recovery Phrase Backup                              │
│                                                              │
│ ⚠️ IMPORTANT: Save your recovery phrase                     │
│                                                              │
│ Write down these 12 words in order:                         │
│                                                              │
│ 1. abandon   2. ability   3. able    4. about              │
│ 5. above     6. absent    7. absorb  8. abstract           │
│ 9. absurd   10. abuse    11. access 12. accident           │
│                                                              │
│ ⚠️ Never share this with anyone                             │
│ ⚠️ Store in a safe place                                    │
│                                                              │
│ [✓] I have saved my recovery phrase                         │
│                                                              │
│              [Continue to Dashboard]                         │
└─────────────────────────────────────────────────────────────┘
                          ↓
User writes down recovery phrase
User checks confirmation box
User clicks "Continue to Dashboard"
                          ↓
Redirect to /dashboard
```

### Technical Details

**Client-Side:**
1. Form validation (Zod schema)
2. Mnemonic generation: `generateMnemonic(english)`
3. Account derivation: `mnemonicToAccount(mnemonic)`
4. Encryption: `encryptWithPin(mnemonic, pin)`
5. IndexedDB storage: `saveWalletRecord({ address, payload })`

**Server-Side:**
1. OTP generation: 6-digit random code
2. OTP hashing: `bcrypt.hash(otp, 10)`
3. OTP delivery: Resend (email) or Twilio (SMS)
4. Session creation: UUID token with 30-day expiry
5. PIN hashing: `bcrypt.hash(pin, 10)`
6. Database updates: User, Session, Balance records

**Security Measures:**
- ✅ OTP expires in 10 minutes
- ✅ OTP is one-time use (deleted after verification)
- ✅ PIN hashed with bcrypt
- ✅ Mnemonic encrypted before storage
- ✅ Private keys never leave browser

---

## Sign In Flow

### Overview

Existing users authenticate with email/phone and their 6-digit PIN.

### User Journey

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Onboarding Page (/onboarding)                       │
│                                                              │
│ [Sign Up] [Sign In]  ← Click "Sign In" tab                  │
│                                                              │
│ Choose contact method:                                       │
│ (•) Email  ( ) Phone                                        │
│                                                              │
│ Email/Phone: [_________________]                            │
│                                                              │
│ PIN: [______]                                                │
│                                                              │
│ [Sign In]  [Forgot PIN? Recover Wallet]                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
User enters credentials, clicks "Sign In"
                          ↓
API Call: POST /api/auth/signin
  Request: { contactType: "email", contact: "...", pin: "123456" }
  Response: { sessionToken: "...", user: { ... } }
                          ↓
Session stored in Zustand + localStorage
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Wallet Decryption (Automatic)                       │
│                                                              │
│ ⏳ Loading your wallet...                                    │
│                                                              │
│ • Retrieving encrypted data                                 │
│ • Decrypting with your PIN                                  │
│ • Preparing dashboard                                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
Client loads encrypted wallet from IndexedDB by address
Client decrypts mnemonic: `decryptWithPin(payload, pin)`
Client derives account: `mnemonicToAccount(mnemonic)`
                          ↓
Redirect to /dashboard
```

### Error Scenarios

**Invalid Credentials:**
```
┌─────────────────────────────────────────────────────────────┐
│ ❌ Error: Invalid email or PIN                              │
│                                                              │
│ Please check your credentials and try again.                │
│                                                              │
│ [Try Again]  [Forgot PIN?]                                  │
└─────────────────────────────────────────────────────────────┘
```

**User Not Found:**
```
┌─────────────────────────────────────────────────────────────┐
│ ❌ Error: Account not found                                 │
│                                                              │
│ No account exists with this email/phone.                    │
│                                                              │
│ [Sign Up Instead]  [Try Different Email]                    │
└─────────────────────────────────────────────────────────────┘
```

**Wallet Not Found in IndexedDB:**
```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️ Warning: Wallet not found on this device                 │
│                                                              │
│ Your wallet is registered but not found in this browser.    │
│ You may need to:                                             │
│ • Recover using your recovery phrase                        │
│ • Use social recovery                                       │
│                                                              │
│ [Recover Wallet]  [Use Different Device]                    │
└─────────────────────────────────────────────────────────────┘
```

### Technical Details

**Authentication:**
- Server verifies PIN: `bcrypt.compare(pin, user.pinHash)`
- Creates new session on each sign-in
- Old sessions remain valid until expiry

**Session Persistence:**
- Stored in localStorage via Zustand middleware
- Survives page refresh
- Cleared on logout

---

## Wallet Creation Flow

### Overview

Automated process that happens immediately after PIN setup during sign-up.

### Technical Process

```
Step 1: Generate Mnemonic
  ↓
  import { generateMnemonic, english } from 'viem/accounts';
  const mnemonic = generateMnemonic(english);
  // Example: "abandon ability able about above absent absorb abstract absurd abuse access accident"
  ↓
Step 2: Derive Account
  ↓
  import { mnemonicToAccount } from 'viem/accounts';
  const account = mnemonicToAccount(mnemonic);
  // account.address: "0x1234..."
  // account.privateKey: "0xabcd..." (never stored)
  ↓
Step 3: Encrypt Mnemonic
  ↓
  const encrypted = await encryptWithPin(mnemonic, pin);
  // Result: { ciphertext: "...", iv: "...", salt: "..." }
  ↓
Step 4: Store in IndexedDB
  ↓
  await saveWalletRecord({
    address: account.address,
    payload: encrypted,
    createdAt: new Date().toISOString()
  });
  ↓
Step 5: Register with Server
  ↓
  POST /api/wallet/register
  Body: { sessionToken, walletAddress: account.address }
  ↓
  Server updates User.walletAddress
  Server creates Balance record (0 USDC, 0 USDT)
  ↓
Step 6: Proceed to Recovery Setup
  ↓
  Skip mnemonic display step
  Go directly to social recovery setup
```

### Security Considerations

**What is Stored:**
- ✅ IndexedDB: Encrypted mnemonic (AES-GCM)
- ✅ Server: Wallet address (public)
- ✅ Server: PIN hash (bcrypt)

**What is NEVER Stored:**
- ❌ Private key (derived on-demand from mnemonic)
- ❌ Plaintext mnemonic (encrypted before storage)
- ❌ Plaintext PIN (hashed before storage)

**Recovery Options:**
1. PIN + IndexedDB (normal usage)
2. Mnemonic phrase (device restore)
3. Social recovery (PIN forgotten)

---

## Social Recovery Setup

### Overview

Users set up 3-5 trusted contacts who can help recover the wallet if the PIN is lost.

### User Journey

```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard: Recovery Section                                 │
│                                                              │
│ 🛡️ Social Recovery: Not Set Up                             │
│                                                              │
│ Protect your wallet by sharing recovery keys with           │
│ trusted contacts. Need 3 to recover.                        │
│                                                              │
│              [Set Up Recovery]                               │
└─────────────────────────────────────────────────────────────┘
                          ↓
User clicks "Set Up Recovery"
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Introduction                                         │
│                                                              │
│ 🛡️ Social Recovery Setup                                    │
│                                                              │
│ Add 3-5 trusted contacts. If you lose your PIN,            │
│ 3 contacts can help you recover your wallet.               │
│                                                              │
│ How it works:                                                │
│ • Your recovery phrase is split into 5 pieces              │
│ • Each contact receives one piece                          │
│ • Any 3 pieces can recover your wallet                     │
│ • No single contact can access your wallet                 │
│                                                              │
│              [Continue]                                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Add Contacts                                         │
│                                                              │
│ Contact 1: [+1234567890] [Alice]                           │
│ Contact 2: [+0987654321] [Bob]                             │
│ Contact 3: [+5555555555] [Charlie]                         │
│                                                              │
│ [+ Add Another Contact] (max 5)                             │
│                                                              │
│              [Set Up Recovery]                               │
└─────────────────────────────────────────────────────────────┘
                          ↓
Client splits mnemonic into shares:
  import { splitMnemonic } from '@/lib/crypto/recovery';
  const shares = splitMnemonic(mnemonic, 5, 3);
  // Returns: ["801...", "802...", "803...", "804...", "805..."]
                          ↓
API Call: POST /api/recovery/setup
  Request: {
    sessionToken: "...",
    walletAddress: "0x...",
    contacts: [
      { phone: "+1234567890", name: "Alice", share: "801..." },
      { phone: "+0987654321", name: "Bob", share: "802..." },
      ...
    ]
  }
                          ↓
Server processes:
  1. Hash phone numbers (SHA-256)
  2. Store RecoveryContact records
  3. Return success
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Confirmation                                         │
│                                                              │
│ ✓ Recovery setup complete!                                  │
│                                                              │
│ Your wallet is now protected. If you forget your PIN,      │
│ contact 3 of your trusted contacts to recover.             │
│                                                              │
│ Recovery contacts:                                           │
│ • Alice                                                     │
│ • Bob                                                       │
│ • Charlie                                                   │
│ • Dave                                                      │
│ • Eve                                                       │
│                                                              │
│              [Back to Dashboard]                             │
└─────────────────────────────────────────────────────────────┘
```

### Technical Details

**Shamir's Secret Sharing:**
```typescript
import secrets from 'secrets.js-grempe';

// Convert mnemonic to hex
const mnemonicHex = bytesToHex(
  new TextEncoder().encode(mnemonic)
);

// Split into 5 shares, requiring 3 to reconstruct
const shares = secrets.share(mnemonicHex, 5, 3);

// Shares: ["801abc...", "802def...", ...]
```

**Storage:**
- Phone numbers hashed before storage (privacy)
- Shares stored plaintext initially
- Shares encrypted during recovery initiation

**Security Properties:**
- Any 2 shares reveal ZERO information
- Any 3 shares fully reconstruct mnemonic
- Information-theoretic security (mathematically proven)

---

## Wallet Recovery Flow

### Overview

Users who forgot their PIN can recover their wallet using 3+ recovery codes from trusted contacts.

### User Journey

```
┌─────────────────────────────────────────────────────────────┐
│ Recovery Page (/recovery)                                    │
│                                                              │
│ 🔐 Recover Your Wallet                                       │
│                                                              │
│ Forgot your PIN? Use social recovery.                       │
│                                                              │
│ Email/Phone: [_________________]                            │
│                                                              │
│              [Start Recovery]                                │
└─────────────────────────────────────────────────────────────┘
                          ↓
User enters email/phone, clicks "Start Recovery"
                          ↓
API Call: POST /api/recovery/initiate
  Request: { contactType: "email", contact: "user@example.com" }
                          ↓
Server processes:
  1. Find user's RecoveryContacts
  2. Generate 5 recovery codes (format: ABC-DEF-123)
  3. Encrypt each share with its code
  4. Send codes to contacts via SMS
  5. Create RecoveryRequest (expires in 24h)
                          ↓
  Response: {
    success: true,
    message: "Recovery codes sent to your contacts.",
    expiresAt: "2025-11-03T06:20:13.277Z",
    requiredShares: 3,
    totalShares: 5
  }
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Collect Codes                                        │
│                                                              │
│ ✓ Recovery initiated                                        │
│                                                              │
│ Recovery codes have been sent to your contacts:            │
│ • Alice                                                     │
│ • Bob                                                       │
│ • Charlie                                                   │
│ • Dave                                                      │
│ • Eve                                                       │
│                                                              │
│ Collect at least 3 codes from your contacts and enter      │
│ them below. Codes expire in 24 hours.                      │
│                                                              │
│ Code 1: [___-___-___]                                       │
│ Code 2: [___-___-___]                                       │
│ Code 3: [___-___-___]                                       │
│ Code 4: [___-___-___] (optional)                           │
│ Code 5: [___-___-___] (optional)                           │
│                                                              │
│              [Verify Codes]                                  │
└─────────────────────────────────────────────────────────────┘
                          ↓
Contacts receive SMS: "Recovery code for wallet: ABC-DEF-123"
User collects codes from contacts
User enters 3+ codes, clicks "Verify Codes"
                          ↓
API Call: POST /api/recovery/verify
  Request: {
    contactType: "email",
    contact: "...",
    codes: ["ABC-DEF-123", "XYZ-789-456", "QWE-RTY-UIO"]
  }
                          ↓
Server processes:
  1. Find RecoveryContacts matching codes
  2. Return encrypted shares
                          ↓
  Response: {
    shares: [
      { encryptedShare: {...}, shareIndex: 1, code: "ABC-DEF-123" },
      { encryptedShare: {...}, shareIndex: 3, code: "XYZ-789-456" },
      { encryptedShare: {...}, shareIndex: 5, code: "QWE-RTY-UIO" }
    ]
  }
                          ↓
Client processes:
  1. Decrypt each share with its code
  2. Reconstruct mnemonic
                          ↓
  import { decryptShareWithCode, reconstructMnemonic } from '@/lib/crypto/recovery';
  
  // Decrypt shares
  const decryptedShares = await Promise.all(
    shares.map(s => decryptShareWithCode(s.encryptedShare, s.code))
  );
  
  // Reconstruct mnemonic
  const mnemonic = reconstructMnemonic(decryptedShares);
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Set New PIN                                          │
│                                                              │
│ ✓ Wallet recovered successfully!                            │
│                                                              │
│ Create a new PIN to secure your wallet:                     │
│                                                              │
│ New PIN: [______]                                            │
│                                                              │
│ Confirm PIN: [______]                                        │
│                                                              │
│              [Complete Recovery]                             │
└─────────────────────────────────────────────────────────────┘
                          ↓
User enters new PIN twice
Client validates PIN match
Client re-encrypts mnemonic with new PIN
Client stores in IndexedDB
                          ↓
API Call: POST /api/recovery/reset
  Request: { contactType: "...", contact: "...", pin: "654321" }
                          ↓
Server processes:
  1. Hash new PIN
  2. Update User.pinHash
  3. Mark RecoveryRequest as completed
  4. Create new session
                          ↓
  Response: {
    success: true,
    sessionToken: "...",
    user: { ... }
  }
                          ↓
Session stored in Zustand + localStorage
Redirect to /dashboard
```

### Security Analysis

**What Contacts Receive:**
- Recovery code only (e.g., "ABC-DEF-123")
- No information about wallet
- Code is useless without encrypted share

**What Server Stores:**
- Encrypted shares (useless without codes)
- Hashed phone numbers (privacy)
- No plaintext mnemonic ever

**Attack Scenarios:**
- 1 compromised contact: Cannot recover (need 3)
- 2 compromised contacts: Cannot recover (need 3)
- 3+ compromised contacts: CAN recover (choose trustworthy contacts!)

**Mitigations:**
- 24-hour recovery window
- One active recovery per user
- SMS out-of-band delivery
- User education on contact selection

---

## Send Money Flow

### Overview

Users can send USDC or USDT to other Ethereum addresses from their wallet dashboard.

### User Journey

```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard: Send Section                                     │
│                                                              │
│ 💸 Send Money                                               │
│                                                              │
│ Recipient Address: [0x___________________]                  │
│                                                              │
│ Token: [USDC ▼]                                             │
│                                                              │
│ Amount: [_______] USDC                                       │
│         Balance: 100.50 USDC                                │
│                                                              │
│ Network Fee: ~$0.50 (estimated)                             │
│                                                              │
│              [Send]                                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
User enters recipient, token, amount
User clicks "Send"
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Confirmation Dialog                                          │
│                                                              │
│ Confirm Transaction                                          │
│                                                              │
│ Send: 10 USDC                                               │
│ To: 0x1234...5678                                           │
│ Network Fee: ~$0.50                                         │
│                                                              │
│ [Cancel]  [Confirm]                                         │
└─────────────────────────────────────────────────────────────┘
                          ↓
User clicks "Confirm"
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ PIN Verification                                             │
│                                                              │
│ Enter your PIN to confirm transaction:                      │
│                                                              │
│ PIN: [______]                                                │
│                                                              │
│ [Cancel]  [Confirm]                                         │
└─────────────────────────────────────────────────────────────┘
                          ↓
User enters PIN
Client decrypts wallet from IndexedDB
Client derives account from mnemonic
                          ↓
Client creates transaction:
  import { createWalletClient, http } from 'viem';
  import { getUSDCAddress, ERC20_ABI } from '@/config/blockchain';
  
  const walletClient = createWalletClient({
    account,
    chain: getCurrentChain(),
    transport: http(getRpcUrl())
  });
  
  const hash = await walletClient.writeContract({
    address: getUSDCAddress(),
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [recipientAddress, parseUnits(amount, 6)],
  });
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Transaction Submitted                                        │
│                                                              │
│ ✓ Transaction submitted!                                    │
│                                                              │
│ Transaction Hash:                                            │
│ 0xabc...def                                                 │
│                                                              │
│ Status: Pending                                             │
│                                                              │
│ [View on Etherscan]  [Back to Dashboard]                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
Client saves transaction to database:
  POST /api/wallet/transactions
  Body: {
    txHash: "0x...",
    type: "SEND",
    token: "USDC",
    amount: "10.00",
    recipientAddress: "0x...",
    status: "PENDING"
  }
                          ↓
Client polls transaction status:
  import { getPublicClient } from '@/lib/blockchain/client';
  
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash
  });
                          ↓
Transaction confirmed → Status updated to "CONFIRMED"
Balance refreshed
Dashboard updated
```

### Technical Details

**Token Transfer (ERC20):**
```typescript
// USDC has 6 decimals
const amount = parseUnits("10.5", 6);  // 10500000

await walletClient.writeContract({
  address: USDC_ADDRESS,
  abi: ERC20_ABI,
  functionName: 'transfer',
  args: [toAddress, amount],
});
```

**Gas Estimation:**
```typescript
const gas = await publicClient.estimateContractGas({
  address: USDC_ADDRESS,
  abi: ERC20_ABI,
  functionName: 'transfer',
  args: [toAddress, amount],
  account,
});
```

**Transaction Tracking:**
```typescript
const receipt = await publicClient.waitForTransactionReceipt({
  hash: txHash,
  confirmations: 1,
});

// receipt.status === 'success' | 'reverted'
```

---

## View Balance Flow

### Overview

Users can view their USDC, USDT, and ETH balances on the dashboard.

### User Journey

```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard: Balance Section                                  │
│                                                              │
│ 💰 Your Balance                                             │
│                                                              │
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────┐   │
│ │   USDC          │ │   USDT          │ │   ETH       │   │
│ │   100.50        │ │   50.25         │ │   0.05      │   │
│ │   ~$100.50 USD  │ │   ~$50.25 USD   │ │   ~$125 USD │   │
│ └─────────────────┘ └─────────────────┘ └─────────────┘   │
│                                                              │
│ Total: ~$275.75 USD                                         │
│                                                              │
│ [Refresh Balances]                                          │
└─────────────────────────────────────────────────────────────┘
```

### Technical Details

**Fetching USDC Balance:**
```typescript
import { getPublicClient } from '@/lib/blockchain/client';
import { getUSDCAddress, ERC20_ABI } from '@/config/blockchain';

const publicClient = getPublicClient();

const balance = await publicClient.readContract({
  address: getUSDCAddress(),
  abi: ERC20_ABI,
  functionName: 'balanceOf',
  args: [walletAddress],
});

// balance: BigInt (e.g., 100500000n for 100.5 USDC)
const formatted = formatUnits(balance, 6);  // "100.5"
```

**Fetching ETH Balance:**
```typescript
const ethBalance = await publicClient.getBalance({
  address: walletAddress,
});

const formatted = formatEther(ethBalance);  // "0.05"
```

**Auto-Refresh:**
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    fetchBalances();
  }, 30_000);  // Refresh every 30 seconds

  return () => clearInterval(interval);
}, []);
```

---

## Transaction History Flow

### Overview

Users can view their transaction history with filters and pagination.

### User Journey

```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard: Transaction History                              │
│                                                              │
│ 📜 Recent Transactions                                       │
│                                                              │
│ Filter: [All ▼] [USDC ▼]                                   │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐│
│ │ ↑ RECEIVE  10.5 USDC                      2 hours ago   ││
│ │ From: 0x1234...5678                                      ││
│ │ Status: ✓ Confirmed                                      ││
│ │ [View on Etherscan]                                      ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐│
│ │ ↓ SEND    5.0 USDC                       1 day ago     ││
│ │ To: 0xabcd...efgh                                       ││
│ │ Status: ✓ Confirmed                                      ││
│ │ Fee: $0.42                                               ││
│ │ [View on Etherscan]                                      ││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ [Load More]                                                 │
└─────────────────────────────────────────────────────────────┘
```

### Technical Details

**Fetching Transactions:**
```typescript
const response = await fetch(
  `/api/wallet/transactions?limit=10&type=SEND`,
  {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  }
);

const { transactions, total, hasMore } = await response.json();
```

**Transaction Schema:**
```typescript
interface Transaction {
  id: string;
  txHash: string;
  type: "SEND" | "RECEIVE";
  token: "USDC" | "USDT" | "ETH";
  amount: string;
  recipientAddress?: string;
  senderAddress?: string;
  platformFee?: string;
  gasFee?: string;
  status: "PENDING" | "CONFIRMED" | "FAILED";
  blockNumber?: bigint;
  createdAt: string;
  confirmedAt?: string;
}
```

---

**Last Updated**: 2025-11-02  
**Version**: 0.1.0
