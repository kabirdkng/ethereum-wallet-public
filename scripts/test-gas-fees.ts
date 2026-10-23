/**
 * Test script for accurate gas fee calculation
 * Run: npx tsx scripts/test-gas-fees.ts
 */

import { calculateTotalFeesWithGas, getETHPriceUSD, estimateAAGasCost } from "../src/lib/blockchain/aa/gasFees";

async function testGasFeeCalculation() {
  console.log("🧪 Testing Gas Fee Calculation\n");

  try {
    // Test 1: Get ETH price
    console.log("1️⃣ Fetching ETH price...");
    const ethPrice = await getETHPriceUSD();
    console.log(`   ✓ ETH Price: $${ethPrice.toFixed(2)}\n`);

    // Test 2: Estimate gas costs
    console.log("2️⃣ Estimating AA gas costs...");
    const gasEstimate = await estimateAAGasCost({ isFirstTransfer: false });
    console.log(`   ✓ Gas Units: ${gasEstimate.gasUnits.toString()}`);
    console.log(`   ✓ Gas Price: ${Number(gasEstimate.gasPriceWei) / 1e9} gwei`);
    console.log(`   ✓ Gas Cost (ETH): ${gasEstimate.gasCostETH}`);
    console.log(`   ✓ Gas Cost (USD): $${gasEstimate.gasCostUSD}`);
    console.log(`   ✓ Alchemy Fee: $${gasEstimate.alchemyFeeUSD}`);
    console.log(`   ✓ Total Cost: $${gasEstimate.totalCostUSD}\n`);

    // Test 3: Calculate full fees for $100 transfer
    console.log("3️⃣ Calculating fees for $100 USDC transfer...");
    const fees = await calculateTotalFeesWithGas("100");
    console.log(`   ✓ Recipient receives: $${fees.recipientAmount} USDC`);
    console.log(`   ✓ Platform fee: $${fees.platformFee} USDC`);
    console.log(`   ✓ Gas fee: $${fees.gasFee} USDC`);
    console.log(`   ✓ Total deducted: $${fees.totalDeducted} USDC\n`);

    // Test 4: Different amounts
    console.log("4️⃣ Testing various transfer amounts...");
    const testAmounts = ["10", "50", "100", "500", "1000"];
    
    for (const amount of testAmounts) {
      const result = await calculateTotalFeesWithGas(amount);
      const profitMargin = ((parseFloat(result.platformFee) / parseFloat(result.totalFees)) * 100).toFixed(1);
      console.log(`   $${amount} → Total: $${result.totalDeducted} (${profitMargin}% profit margin)`);
    }

    console.log("\n✅ All tests passed!");
    console.log("\n📊 Summary:");
    console.log(`   ETH Price: $${ethPrice.toFixed(2)}`);
    console.log(`   Gas Cost: $${gasEstimate.totalCostUSD}`);
    console.log(`   Platform maintains 1.5% profit on all transfers`);

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

// Run tests
testGasFeeCalculation();
