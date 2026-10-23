# Account Abstraction (EIP-4337) Implementation Guide

## Overview

This implementation adds Account Abstraction support to the Ethereum wallet, allowing users to send USDC/USDT **without needing ETH for gas fees**. Gas fees are sponsored by the platform using Alchemy's Gas Manager.

## Key Features

✅ **Gas Sponsorship** - Platform pays gas fees via Alchemy Gas Manager
✅ **Backward Compatible** - Existing EOA wallets continue to work unchanged
✅ **Automatic Migration** - EOA users can upgrade to AA wallets seamlessly
✅ **Dual-Mode Transfers** - Smart router chooses best transfer method automatically
✅ **Gas Speed Control** - Users can choose confirmation speed (slow/normal/fast/instant)
✅ **Batched Transactions** - Multiple transfers in single UserOperation

## Architecture

### Smart Wallet Model

Each user has **two addresses**:
1. **EOA Address** (traditional) - Derived from mnemonic, used for signing
2. **Smart Wallet Address** (AA) - EIP-4337 contract wallet, deterministically calculated from EOA

```
User's Mnemonic
    ↓
EOA Address (0xABC...)  ────────→  Signs UserOperations
    ↓
Smart Wallet (0xDEF...)  ────────→  Holds USDC, executes transfers
```

### Data Flow

```
1. User initiates transfer in UI
2. sendUSDCSmart() checks if AA is available
3. If AA enabled:
   - Build UserOperation (signed by EOA)
   - Submit to Alchemy bundler
   - Gas Manager sponsors gas fees
   - Bundler includes in block
4. If AA disabled:
   - Fall back to traditional EOA transfer
   - User pays gas in ETH
```

## File Structure

```
src/lib/blockchain/aa/
├── contracts.ts         - Contract addresses, ABIs, bundler URLs
├── account.ts          - Smart wallet address calculation
├── userOp.ts           - UserOperation builder and signer
├── bundler.ts          - Alchemy bundler API client
├── transfer.ts         - High-level AA transfer functions
└── gasFees.ts          - Gas fee estimation (already exists)

src/lib/
├── blockchain/smart-transfer.ts  - Unified transfer router (EOA + AA)
└── wallet-migration.ts           - EOA → AA migration utilities

src/app/api/wallet/
└── upgrade-to-aa/route.ts        - API route for wallet upgrades

src/components/send-money/
└── gas-speed-selector.tsx        - Gas speed UI (already exists)
```

## Database Schema Changes

### User Model
```prisma
model User {
  walletAddress       String?  @unique  // EOA address
  smartWalletAddress  String?  @unique  // AA smart wallet address
  walletVersion       String   @default("EOA")  // "EOA" or "AA"
  // ... other fields
}
```

### Transaction Model
```prisma
model Transaction {
  txHash         String   @unique  // Transaction hash
  userOpHash     String?  @unique  // UserOperation hash (AA only)
  gasSponsored   Boolean  @default(false)  // True if gas sponsored
  isAA           Boolean  @default(false)  // True if AA transaction
  // ... other fields
}
```

### IndexedDB (Client-Side)
```typescript
interface StoredWalletRecord {
  address: string;             // EOA address (primary key)
  smartWalletAddress?: string; // Smart wallet address
  walletVersion?: "EOA" | "AA";
  payload: EncryptedMnemonic;
  // ... other fields
}
```

## Environment Variables

### Required for AA
```env
# Alchemy API key (for RPC and bundler)
NEXT_PUBLIC_ALCHEMY_API_KEY=your_alchemy_api_key

# Gas Manager policy ID (created in Alchemy dashboard)
NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID=your_gas_policy_id
```

### Setup Steps
1. **Enable AA in Alchemy Dashboard**
   - Go to Account Abstraction → Enable
   - Create Gas Manager policy
   - Set budget (e.g., $500/month)
   - Copy policy ID

2. **Add to `.env`**
   ```env
   NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID=your_policy_id_here
   ```

3. **Update `.env.example`**
   ```env
   NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID=  # Optional: Gas Manager policy for AA
   ```

## Usage Examples

### Smart Transfer (Automatic Mode)
```typescript
import { sendUSDCSmart } from "@/lib/blockchain/smart-transfer";

const result = await sendUSDCSmart({
  walletClient,
  recipientAddress: "0x123...",
  amount: "100.50", // USD
  platformFeeRecipient: "0xFEE...",
  platformFeeAmount: "1.50",
  gasSpeed: "normal", // or slow, fast, instant
  onProgress: (status) => {
    console.log("Status:", status);
  },
});

console.log("Transaction:", result.txHash);
console.log("Gas sponsored:", result.gasFeeSponsored); // true if AA
```

### Manual AA Transfer
```typescript
import { sendUSDCWithAA } from "@/lib/blockchain/aa/transfer";

const result = await sendUSDCWithAA(
  walletClient,
  recipientAddress,
  "100.50",
  platformFeeRecipient,
  "1.50",
  onProgress,
  "fast" // gas speed
);

console.log("UserOp hash:", result.userOpHash);
console.log("Tx hash:", result.txHash);
```

### Migrate Existing Wallet
```typescript
import { migrateWalletToAA } from "@/lib/wallet-migration";

const result = await migrateWalletToAA(
  eoaAddress,
  userId
);

if (result.success) {
  console.log("Smart wallet:", result.smartWalletAddress);
}
```

### Check if AA is Available
```typescript
import { shouldUseAA } from "@/lib/blockchain/aa/transfer";

const check = await shouldUseAA(eoaAddress);
console.log("Use AA:", check.useAA);
console.log("Reason:", check.reason);
```

## Integration Checklist

### Backend (Database)
- [x] Add `smartWalletAddress` and `walletVersion` to User model
- [x] Add `userOpHash`, `gasSponsored`, `isAA` to Transaction model
- [x] Create Prisma migration
- [x] Create `/api/wallet/upgrade-to-aa` endpoint

### Frontend (Client)
- [x] Update IndexedDB schema with AA fields
- [x] Create AA core infrastructure (contracts, account, userOp, bundler, transfer)
- [x] Create smart transfer router
- [x] Add GAS_MULTIPLIERS to gas-speed-selector

### Environment
- [x] Add `NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID` to env.ts
- [ ] Add to `.env` file (user action required)
- [ ] Add to `.env.example` file
- [ ] Update documentation

### UI Components
- [ ] Update send-money.tsx to use sendUSDCSmart()
- [ ] Show "Gas sponsored" badge for AA transactions
- [ ] Add migration prompt for existing users
- [ ] Update transaction history to show AA transactions

## Migration Strategy

### For Existing Users

**Option 1: Automatic Silent Migration**
- Calculate smart wallet address on first AA-enabled login
- Update database in background
- No user action required
- Transparent upgrade

**Option 2: Opt-In Migration**
- Show banner: "Upgrade to gas-free transfers"
- User clicks "Enable"
- Calculate and save smart wallet address
- User benefits from gas sponsorship

**Option 3: First Transfer Migration**
- Calculate smart wallet on first transfer attempt
- Ask user: "Enable gas-free transfers?"
- If yes, use AA; if no, use EOA
- Remember preference

### Migration Code
```typescript
// On login or first transaction
if (needsWalletMigration(user)) {
  const info = await getWalletMigrationInfo(user.walletAddress);
  if (info.canUpgrade) {
    await upgradeIndexedDBWallet(
      user.walletAddress,
      info.smartWalletAddress
    );
    await updateUserWithSmartWallet(
      user.id,
      info.smartWalletAddress
    );
  }
}
```

## Gas Fee Economics

### Cost Breakdown
```
First transfer (includes deployment):
- Gas units: ~250,000
- Gas cost: $3-5 USD (network dependent)
- Alchemy fee: $0.01
- Total: ~$3-5 per first transfer

Regular transfers:
- Gas units: ~150,000
- Gas cost: $2-3 USD
- Alchemy fee: $0.01
- Total: ~$2-3 per transfer

Batched transfers (recipient + fee):
- Gas units: ~180,000
- Gas cost: $2.50-3.50 USD
- Savings: ~30% vs 2 separate transfers
```

### Charging Strategy
```typescript
// Option 1: Include in platform fee
platformFee = 1.5% (unchanged)
gasFee = calculated dynamically (sponsored by platform)
totalFee = platformFee + gasFee
// User sees total, platform absorbs gas cost

// Option 2: Separate gas fee
platformFee = 1.5% (profit)
gasFee = 0.5% (covers actual gas)
totalFee = 2.0%
// Transparent to user, platform breaks even on gas
```

## Testing

### Local Testing (Sepolia)
```bash
# 1. Set environment variables
export NEXT_PUBLIC_ALCHEMY_API_KEY=your_key
export NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID=your_policy_id
export NEXT_PUBLIC_NETWORK=sepolia

# 2. Run migrations
npm run prisma:migrate

# 3. Start dev server
npm run dev

# 4. Test smart wallet calculation
# Go to browser console:
import { getSmartWalletAddress } from './lib/blockchain/aa/account';
const smartWallet = await getSmartWalletAddress('0xYourEOA...');
console.log(smartWallet);

# 5. Test transfer
# Use send money UI with AA enabled
```

### Monitoring
- **Alchemy Dashboard** → Account Abstraction → UserOperations
- Check success rate (should be >95%)
- Monitor gas costs vs estimates
- Verify Gas Manager budget usage

## Security Considerations

1. **Private Key Security** ✓
   - EOA private key stays client-side (unchanged)
   - Signs UserOperations, never sent to server
   - Smart wallet owned by EOA

2. **Gas Manager Security** ✓
   - Policy limits prevent abuse
   - Rate limiting on bundler
   - Budget caps protect against DoS

3. **Smart Wallet Ownership** ✓
   - Only EOA owner can submit UserOperations
   - Signature verification on-chain
   - No one else can control wallet

4. **Backward Compatibility** ✓
   - Existing EOA transfers still work
   - No breaking changes to current users
   - Graceful fallback if AA unavailable

## Troubleshooting

### AA Not Available
**Issue:** `shouldUseAA()` returns `false`
**Fix:** 
- Check `NEXT_PUBLIC_ALCHEMY_API_KEY` is set
- Check `NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID` is set
- Verify Gas Manager policy is active in Alchemy

### UserOperation Fails
**Issue:** Transaction rejected by bundler
**Fix:**
- Check smart wallet has sufficient USDC
- Verify signature is correct
- Check gas estimates are reasonable
- Review Alchemy dashboard for errors

### Migration Fails
**Issue:** Cannot upgrade wallet to AA
**Fix:**
- Verify EOA address exists in database
- Check network connection
- Ensure Alchemy API is accessible

## Next Steps

1. **Complete Integration**
   - [ ] Update send-money.tsx to use `sendUSDCSmart()`
   - [ ] Add migration UI for existing users
   - [ ] Update transaction history display

2. **Testing**
   - [ ] Test on Sepolia testnet
   - [ ] Verify gas sponsorship works
   - [ ] Test migration flow

3. **Production Deployment**
   - [ ] Set up mainnet Gas Manager policy
   - [ ] Configure production budget
   - [ ] Gradual rollout (10% → 50% → 100%)

4. **Monitoring**
   - [ ] Track AA adoption rate
   - [ ] Monitor gas costs
   - [ ] Analyze user feedback

## Resources

- **EIP-4337 Spec:** https://eips.ethereum.org/EIPS/eip-4337
- **Alchemy AA Docs:** https://docs.alchemy.com/docs/account-abstraction-overview
- **Gas Manager:** https://docs.alchemy.com/docs/gas-manager-services
- **Bundler API:** https://docs.alchemy.com/reference/bundler-api-quickstart
