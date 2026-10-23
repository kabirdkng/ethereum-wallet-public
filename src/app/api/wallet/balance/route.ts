/**
 * API Route: /api/wallet/balance
 * Fetches wallet balances (USDC, USDT, ETH) with Redis caching
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCached, setCached, cacheKeys } from "@/lib/cache/redis";
import {
  getUSDCBalance,
  getUSDTBalance,
  getETHBalance,
  formatBalance,
  estimateTransferCount,
  estimateUSDCTransferGas,
} from "@/lib/blockchain/tokens";

const requestSchema = z.object({
  sessionToken: z.string().min(1, "Session token required"),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  forceRefresh: z.boolean().optional().default(false), // Force bypass cache
});

interface BalanceResponse {
  usdc: string;
  usdt: string;
  eth: string;
  estimatedTransfers: number;
  gasPerTransfer: string;
}

export async function POST(request: Request) {
  try {
    let json;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid or empty request body" },
        { status: 400 }
      );
    }

    const parsed = requestSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { sessionToken, walletAddress, forceRefresh } = parsed.data;

    // Validate session
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { User: true },
    });

    if (!session || session.expires < new Date()) {
      console.error("Invalid or expired session");
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    // Verify wallet address matches user (checking both EOA and smart wallet)
    const userEOA = session.User.walletAddress?.toLowerCase();
    let userSmartWallet = session.User.smartWalletAddress?.toLowerCase();
    const requestedAddress = walletAddress.toLowerCase();
    
    // If smart wallet is missing, try to calculate it
    if (!userSmartWallet && userEOA) {
      console.warn("⚠️ Smart wallet missing in balance fetch, calculating...");
      try {
        const { getSmartWalletAddress } = await import("@/lib/blockchain/aa/account");
        const calculatedSmartWallet = await getSmartWalletAddress(userEOA as `0x${string}`);
        
        // Update database with calculated address
        await prisma.user.update({
          where: { id: session.User.id },
          data: { smartWalletAddress: calculatedSmartWallet.toLowerCase() },
        });
        
        userSmartWallet = calculatedSmartWallet.toLowerCase();
        console.log("✅ Smart wallet calculated and saved:", userSmartWallet);
      } catch (error) {
        console.error("Failed to calculate smart wallet:", error);
        // Continue with EOA if calculation fails
      }
    }
    
    if (requestedAddress !== userEOA && requestedAddress !== userSmartWallet) {
      console.error(`Wallet mismatch: requested ${requestedAddress}, user has EOA ${userEOA} and smart wallet ${userSmartWallet}`);
      return NextResponse.json({ error: "Wallet address mismatch" }, { status: 403 });
    }

    // Always fetch balance from smart wallet if it exists, otherwise use EOA
    // Smart wallet holds the actual funds for AA transactions
    const balanceAddress = userSmartWallet || session.User.walletAddress;
    if (!balanceAddress) {
      return NextResponse.json({ error: "No wallet address found" }, { status: 400 });
    }
    console.log(`Fetching balance for ${balanceAddress} (${session.User.smartWalletAddress ? 'Smart Wallet' : 'EOA'})`);

    // Try to get cached balances first (unless force refresh)
    if (!forceRefresh) {
      const cacheKey = cacheKeys.balances(balanceAddress);
      const cached = await getCached<BalanceResponse>(cacheKey);

      if (cached) {
        console.log(`[BalanceAPI] Cache hit for ${balanceAddress}`);
        return NextResponse.json({
          success: true,
          ...cached,
          fromCache: true,
        });
      }
      console.log(`[BalanceAPI] Cache miss for ${balanceAddress}`);
    }

    // Fetch balances from blockchain
    try {
      const [usdcRaw, usdtRaw, ethRaw] = await Promise.all([
        getUSDCBalance(balanceAddress as `0x${string}`),
        getUSDTBalance(balanceAddress as `0x${string}`),
        getETHBalance(balanceAddress as `0x${string}`),
      ]);

      const balances = {
        usdc: formatBalance(usdcRaw),
        usdt: formatBalance(usdtRaw),
        eth: formatBalance(ethRaw, 8),
      };

      const gasCost = await estimateUSDCTransferGas(false);
      const transfers = await estimateTransferCount(ethRaw, false);

      const responseData: BalanceResponse = {
        ...balances,
        estimatedTransfers: transfers,
        gasPerTransfer: gasCost,
      };

      // Cache the response for 15 seconds (balances change frequently)
      const cacheKey = cacheKeys.balances(balanceAddress);
      await setCached(cacheKey, responseData, 15);
      console.log(`[BalanceAPI] Cached balances for ${balanceAddress}`);

      return NextResponse.json({
        success: true,
        ...responseData,
      });
    } catch (error) {
      console.error("Error fetching balances from blockchain:", error);
      return NextResponse.json(
        { error: "Failed to fetch wallet balances" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error in balance API:", error);
    return NextResponse.json(
      { error: "Failed to fetch wallet balances" },
      { status: 500 }
    );
  }
}
