# API Reference

Complete documentation for all API endpoints in the Ethereum Wallet application.

## Table of Contents

- [Authentication API](#authentication-api)
- [Wallet API](#wallet-api)
- [Recovery API](#recovery-api)
- [Common Patterns](#common-patterns)
- [Error Handling](#error-handling)

---

## Authentication API

### POST /api/auth/signup

Request an OTP for email or phone verification.

**Request:**

```typescript
{
  contactType: "email" | "phone",
  contact: string  // email address or phone number
}
```

**Validation:**
- Email: Valid email format, converted to lowercase
- Phone: 5-20 digits, optional leading +, spaces removed

**Response (Success):**

```typescript
{
  message: "Verification code sent.",
  channel: "email" | "phone",
  devCode?: string  // Only in development mode
}
```

**Response (Error):**

```typescript
{
  error: "Invalid contact information provided.",
  details: {
    formErrors: string[],
    fieldErrors: { [key: string]: string[] }
  }
}
```

**Status Codes:**
- `200`: OTP sent successfully
- `400`: Invalid input
- `500`: Server error

**Example:**

```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "contactType": "email",
    "contact": "user@example.com"
  }'
```

---

### POST /api/auth/verify

Verify OTP and create user session.

**Request:**

```typescript
{
  contactType: "email" | "phone",
  contact: string,
  otp: string  // 6-digit code
}
```

**Response (Success):**

```typescript
{
  sessionToken: string,  // UUID v4
  user: {
    id: string,
    email?: string,
    phone?: string,
    walletAddress?: string
  }
}
```

**Response (Error):**

```typescript
{
  error: "Invalid or expired verification code."
}
```

**Status Codes:**
- `200`: Verification successful
- `400`: Invalid input or incorrect OTP
- `500`: Server error

**Notes:**
- OTP expires after 10 minutes
- OTP is deleted after successful verification
- Session expires after 30 days

---

### POST /api/auth/set-pin

Set user's PIN for wallet authentication.

**Request:**

```typescript
{
  sessionToken: string,
  pin: string  // 6-digit PIN
}
```

**Validation:**
- PIN must be exactly 6 digits
- Session must be valid and not expired

**Response (Success):**

```typescript
{
  message: "PIN set successfully."
}
```

**Response (Error):**

```typescript
{
  error: "Invalid session." | "PIN must be 6 digits."
}
```

**Status Codes:**
- `200`: PIN set successfully
- `400`: Invalid input
- `401`: Invalid or expired session
- `500`: Server error

**Security:**
- PIN is hashed with bcrypt before storage
- Only hash stored in database (User.pinHash)

---

### POST /api/auth/signin

Sign in with email/phone and PIN.

**Request:**

```typescript
{
  contactType: "email" | "phone",
  contact: string,
  pin: string  // 6-digit PIN
}
```

**Response (Success):**

```typescript
{
  sessionToken: string,
  user: {
    id: string,
    email?: string,
    phone?: string,
    walletAddress?: string
  }
}
```

**Response (Error):**

```typescript
{
  error: "Invalid credentials." | "User not found." | "PIN not set."
}
```

**Status Codes:**
- `200`: Sign in successful
- `400`: Invalid input
- `401`: Invalid credentials
- `500`: Server error

**Notes:**
- Creates new session on each sign-in
- Old sessions remain valid until expiry
- PIN verified with bcrypt.compare()

---

## Wallet API

### POST /api/wallet/register

Link wallet address to authenticated user.

**Request:**

```typescript
{
  sessionToken: string,
  walletAddress: string  // 0x... format
}
```

**Validation:**
- Address must be valid Ethereum address format
- Session must be valid
- Address must not be registered to another user

**Response (Success):**

```typescript
{
  message: "Wallet registered successfully.",
  walletAddress: string
}
```

**Response (Error):**

```typescript
{
  error: "Invalid session." | "Wallet address already registered."
}
```

**Status Codes:**
- `200`: Wallet registered
- `400`: Invalid input or duplicate address
- `401`: Invalid session
- `500`: Server error

**Notes:**
- Creates Balance record with 0 USDC/USDT
- Address stored in User.walletAddress
- Client-side wallet encrypted and stored in IndexedDB

---

### GET /api/wallet/transactions

Fetch transaction history for authenticated user.

**Request Headers:**

```
Authorization: Bearer <sessionToken>
```

**Query Parameters:**

```typescript
{
  limit?: number,      // Default: 50, Max: 100
  offset?: number,     // Default: 0
  type?: "SEND" | "RECEIVE",
  token?: "USDC" | "USDT" | "ETH"
}
```

**Response (Success):**

```typescript
{
  transactions: [
    {
      id: string,
      txHash: string,
      type: "SEND" | "RECEIVE",
      token: "USDC" | "USDT" | "ETH",
      amount: string,
      recipientAddress?: string,
      senderAddress?: string,
      platformFee?: string,
      gasFee?: string,
      status: "PENDING" | "CONFIRMED" | "FAILED",
      blockNumber?: number,
      createdAt: string,
      confirmedAt?: string
    }
  ],
  total: number,
  hasMore: boolean
}
```

**Status Codes:**
- `200`: Success
- `401`: Invalid session
- `500`: Server error

**Example:**

```bash
curl -X GET "http://localhost:3000/api/wallet/transactions?limit=10&type=SEND" \
  -H "Authorization: Bearer <sessionToken>"
```

---

### POST /api/wallet/backup

Create encrypted cloud backup of wallet (Future Feature).

**Status:** Not yet implemented

---

### POST /api/wallet/restore

Restore wallet from encrypted cloud backup (Future Feature).

**Status:** Not yet implemented

---

## Recovery API

### POST /api/recovery/setup

Setup social recovery contacts with Shamir shares.

**Request:**

```typescript
{
  sessionToken: string,
  walletAddress: string,
  contacts: [
    {
      phone: string,      // +1234567890 format
      name?: string,      // Optional display name
      share: string       // Hex-encoded Shamir share
    }
  ]
}
```

**Validation:**
- Minimum 3 contacts, maximum 5
- Phone numbers must be unique
- Wallet address must match session user
- Each share must be valid hex string

**Response (Success):**

```typescript
{
  success: true,
  message: "Recovery setup complete. Contacts will receive SMS codes.",
  contactCount: number,
  threshold: number  // Math.ceil(contactCount * 0.6)
}
```

**Response (Error):**

```typescript
{
  error: "Invalid input" | "Wallet address mismatch" | "Invalid session"
}
```

**Status Codes:**
- `200`: Recovery setup successful
- `400`: Invalid input
- `401`: Invalid session
- `403`: Wallet address mismatch
- `500`: Server error

**Security:**
- Phone numbers hashed with SHA-256
- Shares stored plaintext initially
- Encrypted during recovery initiation

**Example:**

```bash
curl -X POST http://localhost:3000/api/recovery/setup \
  -H "Content-Type: application/json" \
  -d '{
    "sessionToken": "...",
    "walletAddress": "0x...",
    "contacts": [
      {
        "phone": "+1234567890",
        "name": "Alice",
        "share": "801..."
      },
      ...
    ]
  }'
```

---

### GET /api/recovery/contacts

Fetch recovery contacts for authenticated user.

**Request Headers:**

```
Authorization: Bearer <sessionToken>
```

**Response (Success):**

```typescript
{
  contacts: [
    {
      id: string,
      contactName?: string,
      shareIndex: number,  // 1-5
      verified: boolean,
      createdAt: string
    }
  ]
}
```

**Notes:**
- Phone numbers NOT returned (privacy)
- Share data NOT returned (security)
- Only metadata returned

**Status Codes:**
- `200`: Success
- `401`: Invalid session
- `500`: Server error

---

### POST /api/recovery/initiate

Initiate wallet recovery process.

**Request:**

```typescript
{
  contactType: "email" | "phone",
  contact: string  // User's email or phone
}
```

**Response (Success):**

```typescript
{
  success: true,
  message: "Recovery codes sent to your contacts.",
  expiresAt: string,     // ISO 8601 datetime
  requiredShares: number,
  totalShares: number
}
```

**Response (Error):**

```typescript
{
  error: "User not found." | "No recovery contacts found." | "Active recovery already in progress."
}
```

**Status Codes:**
- `200`: Recovery initiated
- `400`: Invalid input or no recovery setup
- `429`: Active recovery already exists
- `500`: Server error

**Process:**
1. Find user's recovery contacts
2. Generate random recovery codes (format: ABC-DEF-123)
3. Encrypt each share with its recovery code
4. Send codes to contacts via SMS
5. Create RecoveryRequest (expires in 24 hours)

**Example Recovery Code:**
```
ABC-DEF-123
```

**Notes:**
- Only one active recovery per user
- Previous pending recoveries are expired
- Contacts receive SMS with code

---

### POST /api/recovery/verify

Verify recovery codes and retrieve encrypted shares.

**Request:**

```typescript
{
  contactType: "email" | "phone",
  contact: string,
  codes: string[]  // Array of recovery codes (min 3)
}
```

**Validation:**
- Codes must match format: XXX-XXX-XXX
- Minimum 3 codes required (threshold)
- All codes must match existing recovery contacts

**Response (Success):**

```typescript
{
  shares: [
    {
      encryptedShare: {
        ciphertext: string,
        iv: string,
        salt: string
      },
      shareIndex: number,
      code: string  // Matching recovery code
    }
  ],
  message: "Recovery verified. Use codes to decrypt shares."
}
```

**Response (Error):**

```typescript
{
  error: "No active recovery request." | "Invalid recovery codes." | "Insufficient shares provided."
}
```

**Status Codes:**
- `200`: Codes verified
- `400`: Invalid input or insufficient codes
- `404`: No active recovery
- `500`: Server error

**Client-Side Process:**
1. Decrypt each share: `decryptShareWithCode(encryptedShare, code)`
2. Combine shares: `reconstructMnemonic(decryptedShares)`
3. Derive wallet and prompt for new PIN

---

### POST /api/recovery/reset

Complete recovery by setting new PIN.

**Request:**

```typescript
{
  contactType: "email" | "phone",
  contact: string,
  pin: string  // New 6-digit PIN
}
```

**Validation:**
- PIN must be exactly 6 digits
- Active recovery request must exist
- Recovery request must not be expired

**Response (Success):**

```typescript
{
  success: true,
  sessionToken: string,
  user: {
    id: string,
    email?: string,
    phone?: string,
    walletAddress?: string
  }
}
```

**Response (Error):**

```typescript
{
  error: "No active recovery request." | "Recovery request expired." | "PIN must be 6 digits."
}
```

**Status Codes:**
- `200`: Recovery completed
- `400`: Invalid input or expired recovery
- `404`: No active recovery
- `500`: Server error

**Process:**
1. Hash new PIN with bcrypt
2. Update User.pinHash
3. Mark RecoveryRequest as completed
4. Create new session
5. Return session token

**Notes:**
- Client must re-encrypt mnemonic with new PIN
- Old PIN hash is overwritten
- Recovery contacts remain unchanged

---

## Common Patterns

### Session Authentication

Most protected endpoints require session authentication:

**Header Format:**
```
Authorization: Bearer <sessionToken>
```

**Query Parameter (Alternative):**
```
?sessionToken=<token>
```

**Request Body (Alternative):**
```json
{
  "sessionToken": "...",
  ...
}
```

**Validation:**
```typescript
const session = await prisma.session.findUnique({
  where: { sessionToken },
  include: { user: true }
});

if (!session || session.expires < new Date()) {
  return NextResponse.json(
    { error: "Invalid or expired session" },
    { status: 401 }
  );
}
```

### Input Validation

All endpoints use Zod for runtime validation:

```typescript
const schema = z.object({
  field: z.string().min(1),
  ...
});

const parsed = schema.safeParse(requestBody);
if (!parsed.success) {
  return NextResponse.json(
    {
      error: "Invalid input",
      details: parsed.error.flatten()
    },
    { status: 400 }
  );
}
```

### Error Response Format

Consistent error format across all endpoints:

```typescript
{
  error: string,           // Human-readable message
  details?: object,        // Zod validation errors
  code?: string            // Error code (future)
}
```

### Pagination Pattern

Endpoints with pagination support:

**Query Parameters:**
```
?limit=50&offset=0
```

**Response:**
```typescript
{
  items: [...],
  total: number,
  hasMore: boolean,
  limit: number,
  offset: number
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| `200` | OK | Successful request |
| `400` | Bad Request | Invalid input, validation errors |
| `401` | Unauthorized | Invalid or expired session |
| `403` | Forbidden | Authenticated but not authorized |
| `404` | Not Found | Resource doesn't exist |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Unexpected server error |

### Common Error Messages

**Authentication:**
- "Invalid or expired session"
- "Invalid credentials"
- "User not found"
- "PIN not set"

**Validation:**
- "Invalid input"
- "Invalid contact information provided"
- "PIN must be 6 digits"
- "Wallet address already registered"

**Recovery:**
- "No recovery contacts found"
- "Invalid recovery codes"
- "Recovery request expired"
- "Insufficient shares provided"

### Error Logging

All errors logged to console:

```typescript
console.error("[Context]", error);
```

**Production:** Use structured logging (Sentry, DataDog)

---

## Rate Limiting

**Status:** Not implemented (TODO)

**Recommendations:**
- 5 requests/minute per IP for OTP endpoints
- 10 requests/minute for authentication
- 100 requests/minute for wallet queries
- Exponential backoff for failed authentication

---

## Webhook Support

**Status:** Not implemented (TODO)

**Planned Webhooks:**
- Transaction confirmation
- Balance updates
- Recovery initiation
- Security alerts

---

## API Versioning

**Current Version:** v1 (implicit)

**Future:** Add `/api/v2/...` when breaking changes needed

---

## Testing

### Development Mode

**OTP Delivery:**
- Without Resend/Twilio: OTP logged to console
- Response includes `devCode` field

**Example:**
```bash
# Server logs
[Auth] email OTP for user@example.com: 123456

# API response
{
  "message": "Verification code sent.",
  "channel": "email",
  "devCode": "123456"
}
```

### Test Credentials

**Not applicable** - real OTP verification required

**Future:** Add test mode bypass for automated testing

---

## OpenAPI Specification

**Status:** Not implemented (TODO)

**Recommendation:** Generate OpenAPI 3.0 spec for API documentation and client generation

---

## SDK/Client Libraries

**Status:** Not implemented (TODO)

**Recommendation:** Create TypeScript SDK for type-safe API calls

---

**Last Updated**: 2025-11-02  
**Version**: 0.1.0
