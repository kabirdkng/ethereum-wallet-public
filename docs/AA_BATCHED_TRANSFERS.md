# Batched Transfers with Account Abstraction + Paymaster

## 🎯 Overview

This wallet uses **EIP-4337 Account Abstraction** with **Alchemy's Paymaster** to execute **batched multicall transactions**. This provides:

- **40-50% gas savings** vs sequential transactions
- **Atomic execution** - both transfers succeed or both fail
- **Sponsored gas** - users don't pay gas fees (Alchemy Paymaster covers it)
- **Single UserOperation** - one signature, one bundler submission

---

## 🧩 Architecture

### Components

| Component | Role |
|-----------|------|
| **SimpleAccount (Smart Wallet)** | EIP-4337 smart contract wallet with `executeBatch()` |
| **Alchemy Bundler** | Receives UserOperations, simulates, submits to EntryPoint |
| **Alchemy Paymaster** | Sponsors gas via Gas Manager policy |
| **EntryPoint v0.6** | EIP-4337 canonical contract (`0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`) |
| **Multicall3** | Fallback for atomic batching (if `executeBatch` unavailable) |

### Transaction Flow

```
User initiates transfer
    ↓
Client builds batched UserOp (recipient + platform fee)
    ↓
Request paymaster sponsorship from Alchemy
    ↓
Sign UserOp with EOA
    ↓
Submit to Alchemy Bundler
    ↓
Bundler → EntryPoint → Smart Wallet → executeBatch()
    ↓
Both ERC20 transfers execute atomically
```

---

## 💻 Implementation

### 1. Batched Transfer Builder

**File:** `src/lib/blockchain/aa/multicall.ts`

```typescript
import { buildRecipientAndFeeTransferUserOp } from "@/lib/blockchain/aa/multicall";

const userOp = await buildRecipientAndFeeTransferUserOp(
  walletClient,        // EOA wallet client (for signing)
  usdcAddress,         // Token contract address
  recipientAddress,    // Recipient's address
  recipientAmount,     // Amount to send (bigint)
  feeRecipient,        // Platform fee recipient
  feeAmount,           // Platform fee amount (bigint)
  gasMultiplier        // Gas speed multiplier (1.0 = normal)
);
```

### 2. UserOperation Structure

The batched UserOp contains:

```typescript
{
  sender: "0xSmartWalletAddress",
  nonce: "0x0",
  initCode: "0x" or "0xFactoryAddress + createAccount calldata",
  callData: "executeBatch([
    { target: USDC, data: transfer(recipient, amount) },
    { target: USDC, data: transfer(feeRecipient, feeAmount) }
  ])",
  callGasLimit: "0x..." // 50k base + 30k per transfer
  verificationGasLimit: "0x...", // 100k (deployed) or 500k (first tx)
  preVerificationGas: "0x...",   // 50k
  maxFeePerGas: "0x...",          // Current gas price × multiplier
  maxPriorityFeePerGas: "0x...",  // Priority fee × multiplier
  paymasterAndData: "0x..." // From Alchemy's Gas Manager
  signature: "0x..."      // EOA signature
}
```

### 3. Paymaster Sponsorship

**Before submission**, we call Alchemy's Paymaster API:

```typescript
async function getPaymasterSponsoredUserOp(userOp, policyId) {
  const response = await fetch(alchemyBundlerUrl, {
    method: "POST",
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "alchemy_requestPaymasterAndData",
      params: [{
        policyId: process.env.NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID,
        entryPoint: ENTRYPOINT_V06_ADDRESS,
        userOperation: userOp
      }]
    })
  });
  
  const data = await response.json();
  
  // Update UserOp with paymaster sponsorship
  return {
    ...userOp,
    paymasterAndData: data.result.paymasterAndData
  };
}
```

### 4. Integration in Transfer Flow

**File:** `src/lib/blockchain/aa/transfer.ts`

```typescript
export async function sendUSDCWithAA(
  walletClient,
  recipientAddress,
  amount,
  platformFeeRecipient,
  platformFeeAmount,
  onProgress,
  gasSpeed = 'normal'
) {
  const gasMultiplier = GAS_MULTIPLIERS[gasSpeed];
  
  // Build BATCHED UserOp (recipient + platform fee)
  const userOp = await buildRecipientAndFeeTransferUserOp(
    walletClient,
    usdcAddress,
    recipientAddress,
    parseUnits(amount, 6),
    platformFeeRecipient,
    parseUnits(platformFeeAmount, 6),
    gasMultiplier
  );
  
  // Submit to bundler
  const userOpHash = await sendUserOperation(userOp);
  
  // Wait for on-chain confirmation
  const txHash = await waitForUserOperation(userOpHash);
  
  return {
    userOpHash,
    txHash,
    batched: true,
    gasSavings: "~40-50% vs sequential"
  };
}
```

---

## ⛽ Gas Efficiency

### Sequential UserOps (Old Approach)

```
Transfer 1: Recipient
  - callGasLimit: 50,000
  - verificationGasLimit: 100,000
  - preVerificationGas: 50,000
  Total: 200,000 gas

Transfer 2: Platform Fee
  - callGasLimit: 50,000
  - verificationGasLimit: 100,000
  - preVerificationGas: 50,000
  Total: 200,000 gas

TOTAL: 400,000 gas
```

### Batched UserOp (New Approach)

```
Batched Transfer (Recipient + Fee)
  - callGasLimit: 80,000 (50k base + 30k for 2nd transfer)
  - verificationGasLimit: 100,000 (only once!)
  - preVerificationGas: 50,000 (only once!)
  Total: 230,000 gas

TOTAL: 230,000 gas
Savings: 170,000 gas (~42.5% reduction!)
```

### Cost Comparison

At 25 gwei gas price & $3,245 ETH:

| Approach | Gas Used | Cost (ETH) | Cost (USD) | Savings |
|----------|----------|------------|------------|---------|
| Sequential | 400,000 | 0.01 ETH | $32.45 | - |
| Batched | 230,000 | 0.00575 ETH | $18.66 | **$13.79** |

**Plus:** Alchemy Paymaster sponsors all gas, so user pays **$0**!

---

## 🔐 Security

### Atomic Execution

Using `executeBatch()`:
- If recipient transfer fails → platform fee reverts
- If platform fee fails → recipient transfer reverts
- **Both succeed or both fail** (no partial execution)

### Paymaster Safety

Alchemy's Gas Manager:
- Rate limits per policy (prevents abuse)
- Budget caps (e.g., $500/month)
- Monitoring dashboard (track UserOps)
- Automatic rejection of suspicious operations

### Signature Verification

```typescript
// UserOp hash includes:
- sender address
- nonce (prevents replay)
- callData (prevents tampering)
- gas limits (prevents manipulation)
- paymaster data (verified by EntryPoint)

// EOA signs the hash
signature = await walletClient.signMessage({ 
  message: { raw: userOpHash } 
});
```

---

## 🧪 Testing Flow

### 1. Enable Alchemy Gas Manager

**Dashboard:** https://dashboard.alchemy.com/account-abstraction/gas-manager

1. Enable Account Abstraction
2. Create Gas Manager policy
3. Set budget (e.g., $500/month)
4. Copy Policy ID → `NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID`

### 2. Test on Sepolia

```typescript
// Example test script
import { sendUSDCWithAA } from "@/lib/blockchain/aa/transfer";

const result = await sendUSDCWithAA(
  walletClient,
  "0xRecipient",
  "100.00",      // $100 to recipient
  "0xPlatform",
  "1.50",        // $1.50 platform fee
  (status) => console.log(status),
  'normal'       // gas speed
);

console.log("UserOpHash:", result.userOpHash);
console.log("TxHash:", result.txHash);
console.log("Batched:", result.batched); // true
console.log("Gas sponsored by Alchemy Paymaster ✅");
```

### 3. Verify on Block Explorer

**Sepolia:**
- UserOp tracker: `https://jiffyscan.xyz/userOpHash/{userOpHash}`
- Transaction: `https://sepolia.etherscan.io/tx/{txHash}`

Look for:
- ✅ EntryPoint contract interaction
- ✅ Smart wallet executed `executeBatch()`
- ✅ Two ERC20 `Transfer` events (recipient + fee)
- ✅ Gas paid by paymaster (not smart wallet)

### 4. Monitor Gas Manager

**Dashboard metrics:**
- UserOps submitted
- Sponsorship amount (USD)
- Success rate
- Budget remaining

---

## 🛠️ Debugging

### Common Issues

#### 1. "AA21 didn't pay prefund"

**Cause:** Smart wallet lacks ETH for deployment gas (first transaction only)

**Solution:** This shouldn't happen with paymaster sponsorship. Check:
```typescript
const policyId = getGasManagerPolicyId();
if (!policyId) {
  throw new Error("Gas Manager policy not configured");
}
```

#### 2. "execution reverted"

**Cause:** Smart wallet lacks USDC balance

**Debug:**
```typescript
const balance = await getUSDCBalance(smartWalletAddress);
console.log("Smart wallet balance:", balance);
console.log("Required:", (recipientAmount + feeAmount) / 1e6);
```

**Solution:** Transfer USDC to `smartWalletAddress` (not EOA!)

#### 3. "FailedOp: AA23 reverted"

**Cause:** One of the batched calls failed (e.g., insufficient allowance)

**Debug:**
```typescript
await simulateUserOperation(userOp);
```

Look for specific revert reason in logs.

#### 4. Paymaster rejection

**Cause:** Rate limit exceeded or budget depleted

**Check Dashboard:**
- Current spend vs budget
- Rate limit settings
- UserOp history

---

## 📊 Monitoring

### Log Structure

**Building UserOp:**
```
🔨 Building batched UserOperation:
  smartWalletAddress: 0x...
  isDeployed: true
  transferCount: 2
  useMulticall3: false
```

**Gas estimation:**
```
⛽ Gas estimation for batched UserOp:
  transferCount: 2
  callGasLimit: 80000
  verificationGasLimit: 100000
  preVerificationGas: 50000
  totalGas: 230000
  estimatedCostWei: ...
```

**Paymaster:**
```
💰 Requesting paymaster sponsorship from Alchemy...
✅ Received paymaster sponsorship:
  paymasterAndData: 0xPaymasterAddr...
```

**Submission:**
```
Batched UserOperation submitted to bundler:
  userOpHash: 0x...
  batched: true
  transfers: 2
  totalAmount: 101.50
```

**Confirmation:**
```
✅ Batched UserOperation confirmed on-chain:
  userOpHash: 0x...
  txHash: 0x...
  batched: true
  gasSavings: ~40-50% vs sequential
```

---

## 🚀 Production Checklist

- [ ] **Enable Alchemy Gas Manager** on mainnet
- [ ] **Set production budget** (e.g., $1000+/month based on volume)
- [ ] **Test batched transfers** on Sepolia thoroughly
- [ ] **Monitor first 100 UserOps** on mainnet for errors
- [ ] **Set up alerts** for:
  - Budget threshold (80% used)
  - High failure rate (>5%)
  - Unusual gas spikes
- [ ] **Verify gas savings** match estimates (~40-50%)
- [ ] **Test edge cases**:
  - First transfer (wallet deployment + batch)
  - Maximum transfer amounts
  - Minimum transfer amounts
  - Network congestion (high gas prices)

---

## 📚 References

- **EIP-4337 Spec:** https://eips.ethereum.org/EIPS/eip-4337
- **Alchemy AA Docs:** https://docs.alchemy.com/reference/account-abstraction-overview
- **SimpleAccount Source:** https://github.com/eth-infinitism/account-abstraction/tree/develop/contracts/samples
- **Multicall3:** https://github.com/mds1/multicall
- **EntryPoint v0.6:** https://github.com/eth-infinitism/account-abstraction/blob/develop/contracts/core/EntryPoint.sol

---

## 💡 Key Takeaways

1. ✅ **Batched transfers save ~40-50% gas** via single UserOperation
2. ✅ **Alchemy Paymaster sponsors all gas** (users pay $0 for gas)
3. ✅ **Atomic execution** prevents partial transfers
4. ✅ **SimpleAccount's `executeBatch()`** is the core primitive
5. ✅ **All transactions include platform fees** → always batched
6. ✅ **One signature, one bundler call, one on-chain tx**
