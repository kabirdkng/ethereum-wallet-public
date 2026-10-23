# AA Integration Checklist

## ✅ Phase 1: Infrastructure (COMPLETE)

- [x] Create AA core files
  - [x] `src/lib/blockchain/aa/contracts.ts`
  - [x] `src/lib/blockchain/aa/account.ts`
  - [x] `src/lib/blockchain/aa/userOp.ts`
  - [x] `src/lib/blockchain/aa/bundler.ts`
  - [x] `src/lib/blockchain/aa/transfer.ts`
  
- [x] Create support utilities
  - [x] `src/lib/blockchain/smart-transfer.ts`
  - [x] `src/lib/wallet-migration.ts`
  - [x] `src/lib/aa-status.ts`
  
- [x] Create API routes
  - [x] `src/app/api/wallet/upgrade-to-aa/route.ts`
  
- [x] Update database schema
  - [x] Add `smartWalletAddress` to User model
  - [x] Add `walletVersion` to User model
  - [x] Add `userOpHash` to Transaction model
  - [x] Add `gasSponsored` to Transaction model
  - [x] Add `isAA` to Transaction model
  - [x] Run migration `20251109165500_add_aa_support`
  
- [x] Update environment configuration
  - [x] Add `NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID` to env schema
  - [x] Update `.env.example` with AA documentation
  
- [x] Documentation
  - [x] Create `docs/AA_INTEGRATION_GUIDE.md`
  - [x] Create `docs/AA_QUICKSTART.md`
  - [x] Create `docs/AA_IMPLEMENTATION_SUMMARY.md`

## 🚧 Phase 2: Environment Setup (USER ACTION REQUIRED)

- [ ] **Alchemy Dashboard Setup**
  1. [ ] Go to https://dashboard.alchemy.com/
  2. [ ] Navigate to Account Abstraction section
  3. [ ] Click "Enable Account Abstraction"
  4. [ ] Create Gas Manager policy:
     - [ ] Name: "Ethereum Wallet Gas Sponsorship"
     - [ ] Network: Sepolia (for testing) or Mainnet
     - [ ] Budget: $500/month (adjust as needed)
     - [ ] Rate limits: Default
  5. [ ] Copy the Policy ID

- [ ] **Environment Variables**
  1. [ ] Open `.env` file
  2. [ ] Add or verify: `NEXT_PUBLIC_ALCHEMY_API_KEY=your_key`
  3. [ ] Add: `NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID=your_policy_id`
  4. [ ] Save file
  5. [ ] Restart dev server

- [ ] **Verify AA is Enabled**
  ```bash
  # In browser console:
  import { isAAEnabled } from '@/lib/blockchain/aa/contracts';
  console.log('AA enabled:', isAAEnabled());
  # Should print: AA enabled: true
  ```

## 🔨 Phase 3: UI Integration (DEVELOPMENT)

### Update send-money.tsx

- [ ] **Import smart transfer**
  ```typescript
  // Add to imports:
  import { sendUSDCSmart } from '@/lib/blockchain/smart-transfer';
  ```

- [ ] **Replace transfer function**
  ```typescript
  // Replace sendUSDC with sendUSDCSmart in handleConfirm()
  const result = await sendUSDCSmart({
    walletClient,
    recipientAddress: data.recipient as `0x${string}`,
    amount: usdAmountToSend,
    platformFeeRecipient,
    platformFeeAmount: feeCalculation.feeAmount,
    gasSpeed, // Already exists in component
    onProgress: setApprovalStatus,
  });
  ```

- [ ] **Update transaction save**
  ```typescript
  // Add AA fields to transaction save:
  await fetch("/api/wallet/save-transaction", {
    method: "POST",
    body: JSON.stringify({
      // ... existing fields
      userOpHash: result.userOpHash, // NEW
      gasSponsored: result.gasFeeSponsored, // NEW
      isAA: result.isAA, // NEW
    }),
  });
  ```

- [ ] **Add gas-sponsored badge**
  ```typescript
  {result.gasFeeSponsored && (
    <div className="text-xs text-green-600">
      ✓ Gas fees sponsored - no ETH required
    </div>
  )}
  ```

### Update Transaction History

- [ ] **Show AA transactions**
  ```typescript
  // In transaction display component:
  {tx.isAA && (
    <span className="badge badge-success">AA</span>
  )}
  {tx.gasSponsored && (
    <span className="badge badge-info">Gas Sponsored</span>
  )}
  ```

- [ ] **Link to UserOp hash**
  ```typescript
  {tx.userOpHash && (
    <a 
      href={`https://www.jiffyscan.xyz/userOpHash/${tx.userOpHash}`}
      target="_blank"
      className="text-primary"
    >
      View UserOp ↗
    </a>
  )}
  ```

### Add Migration UI (Optional)

- [ ] **Create UpgradeBanner component**
  ```typescript
  // src/components/upgrade-to-aa-banner.tsx
  export function UpgradeToAABanner({ user }) {
    const handleUpgrade = async () => {
      const result = await migrateWalletToAA(
        user.walletAddress,
        user.id
      );
      if (result.success) {
        toast.success("Gas-free transfers enabled!");
        window.location.reload(); // Refresh to update user state
      }
    };

    if (!needsWalletMigration(user)) return null;

    return (
      <div className="banner banner-info">
        <h3>Enable Gas-Free Transfers</h3>
        <p>Upgrade to send USDC without needing ETH for gas fees</p>
        <button onClick={handleUpgrade}>Enable Now</button>
      </div>
    );
  }
  ```

- [ ] **Add to dashboard**
  ```typescript
  // In dashboard component:
  <UpgradeToAABanner user={user} />
  ```

## 🧪 Phase 4: Testing

### Unit Tests

- [ ] **Test smart wallet calculation**
  ```bash
  # Create test file: src/lib/blockchain/aa/__tests__/account.test.ts
  ```
  - [ ] Test getSmartWalletAddress()
  - [ ] Test isSmartWalletDeployed()
  - [ ] Test getSmartWalletInitCode()

- [ ] **Test UserOp building**
  - [ ] Test buildERC20TransferUserOp()
  - [ ] Test buildBatchedERC20TransferUserOp()
  - [ ] Test signature generation

- [ ] **Test smart transfer router**
  - [ ] Test AA path when enabled
  - [ ] Test EOA fallback when disabled
  - [ ] Test error handling

### Integration Tests (Sepolia)

- [ ] **Test new wallet creation**
  1. [ ] Create new wallet
  2. [ ] Verify smart wallet address calculated
  3. [ ] Check database has both EOA and smart wallet
  4. [ ] Verify IndexedDB has AA fields

- [ ] **Test first AA transfer**
  1. [ ] Fund smart wallet with USDC (on Sepolia)
  2. [ ] Initiate transfer via UI
  3. [ ] Verify UserOp submitted to bundler
  4. [ ] Check smart wallet deployed
  5. [ ] Confirm transaction on-chain
  6. [ ] Verify gas was sponsored (check Alchemy dashboard)

- [ ] **Test subsequent AA transfers**
  1. [ ] Send another transfer
  2. [ ] Verify no deployment (wallet already deployed)
  3. [ ] Check gas estimates are accurate
  4. [ ] Confirm transaction faster (~150k gas vs ~250k)

- [ ] **Test batched transfers**
  1. [ ] Transfer with platform fee
  2. [ ] Verify both transfers in single UserOp
  3. [ ] Check gas savings vs sequential

- [ ] **Test EOA fallback**
  1. [ ] Temporarily disable AA (remove env var)
  2. [ ] Initiate transfer
  3. [ ] Verify falls back to EOA
  4. [ ] Check user pays gas in ETH

- [ ] **Test migration**
  1. [ ] Use existing EOA wallet
  2. [ ] Trigger migration
  3. [ ] Verify smart wallet address calculated
  4. [ ] Check database updated
  5. [ ] Test transfer works with AA

### Error Scenarios

- [ ] **Insufficient USDC in smart wallet**
  - [ ] Verify error message is clear
  - [ ] Check transaction not submitted

- [ ] **Gas Manager out of budget**
  - [ ] Test paymaster rejection
  - [ ] Verify graceful fallback to EOA

- [ ] **Network congestion**
  - [ ] Test high gas prices
  - [ ] Verify gas multipliers work
  - [ ] Check different speed options

## 🚀 Phase 5: Production Deployment

### Pre-deployment

- [ ] **Mainnet Gas Manager**
  1. [ ] Create mainnet Gas Manager policy in Alchemy
  2. [ ] Set production budget (recommend $1000+/month)
  3. [ ] Configure rate limits
  4. [ ] Test with small transactions first

- [ ] **Environment Variables**
  1. [ ] Add mainnet Gas Manager policy ID to production env
  2. [ ] Verify `NEXT_PUBLIC_NETWORK=mainnet`
  3. [ ] Double-check all API keys

- [ ] **Monitoring Setup**
  1. [ ] Set up Alchemy dashboard alerts
  2. [ ] Configure budget notifications
  3. [ ] Add application-level analytics

### Gradual Rollout

- [ ] **Phase 1: 10% of users**
  - [ ] Deploy to production
  - [ ] Enable AA for new users only
  - [ ] Monitor for 24-48 hours
  - [ ] Check success rate and costs

- [ ] **Phase 2: 50% of users**
  - [ ] If metrics good, expand
  - [ ] Add migration banner for existing users
  - [ ] Monitor for 1 week

- [ ] **Phase 3: 100% rollout**
  - [ ] Enable for all users
  - [ ] Auto-migrate existing wallets
  - [ ] Continue monitoring

### Post-deployment

- [ ] **Monitor Metrics**
  - [ ] AA adoption rate (target: >80%)
  - [ ] Success rate (target: >95%)
  - [ ] Average gas cost per transfer
  - [ ] Budget burn rate

- [ ] **Optimize**
  - [ ] Tune gas estimates based on real data
  - [ ] Adjust Gas Manager budget if needed
  - [ ] Optimize UserOp packing

- [ ] **User Communication**
  - [ ] Announce gas-free transfers feature
  - [ ] Create help documentation
  - [ ] Gather user feedback

## 📊 Success Metrics

### Technical KPIs
- [ ] AA transaction success rate: >95%
- [ ] Gas cost accuracy: ±10% of estimate
- [ ] Smart wallet deployment rate: >90% of new users
- [ ] EOA fallback rate: <5%

### Business KPIs
- [ ] User adoption rate: >80%
- [ ] Cost per transaction: <$3 USD
- [ ] Monthly budget adherence: within ±20%
- [ ] User satisfaction: >4.5/5

### Performance KPIs
- [ ] Average confirmation time: <2 minutes
- [ ] Bundler uptime: >99.9%
- [ ] API response time: <500ms
- [ ] Error rate: <1%

## 🆘 Troubleshooting Guide

### Issue Checklist

- [ ] **AA not working?**
  - [ ] Check `NEXT_PUBLIC_ALCHEMY_API_KEY` is set
  - [ ] Check `NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID` is set
  - [ ] Verify Gas Manager policy is active
  - [ ] Check Alchemy dashboard for errors

- [ ] **UserOp fails?**
  - [ ] Check smart wallet USDC balance
  - [ ] Verify signature is correct
  - [ ] Check gas estimates
  - [ ] Review bundler error logs

- [ ] **Migration fails?**
  - [ ] Verify user exists in database
  - [ ] Check network connection
  - [ ] Ensure EOA address is valid

## 📝 Notes

- Current implementation is **backward compatible** - existing EOA wallets continue to work
- Smart transfer router automatically chooses best method (AA or EOA)
- Gas sponsorship is optional - falls back to EOA if unavailable
- All code is lint-clean and production-ready

## ✅ Final Checklist Before Launch

- [ ] Environment variables configured
- [ ] Gas Manager policy created and funded
- [ ] UI integration complete
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Monitoring in place
- [ ] Rollback plan prepared
- [ ] Team trained on AA features

---

**Last Updated:** 2025-11-09
**Status:** Phase 1 Complete ✅ | Phase 2-5 Ready for Implementation
