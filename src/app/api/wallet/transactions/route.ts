/**
 * API Route: /api/wallet/transactions
 * Fetches transaction history from blockchain and syncs to database
 * Uses Redis caching to avoid redundant fetches
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCached, setCached, cacheKeys } from "@/lib/cache/redis";

const requestSchema = z.object({
  sessionToken: z.string().min(1, "Session token required"),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().max(100).optional().default(20),
  syncBlockchain: z.boolean().optional().default(false), // Only sync from blockchain when explicitly requested
});

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

    const { sessionToken, walletAddress, page, limit, syncBlockchain } = parsed.data;

    // Validate session
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { User: true },
    });

    if (!session || session.expires < new Date()) {
      console.error("Invalid or expired session");
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    // Verify wallet address matches user (check both EOA and smart wallet)
    const userEOA = session.User.walletAddress?.toLowerCase();
    let userSmartWallet = session.User.smartWalletAddress?.toLowerCase();
    const requestedAddress = walletAddress.toLowerCase();
    
    // If smart wallet is missing, try to calculate it
    if (!userSmartWallet && userEOA) {
      console.warn("⚠️ Smart wallet missing in transactions fetch, calculating...");
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

    // Always use smart wallet for transactions if it exists, otherwise use EOA
    // This ensures we only show smart wallet transactions (not EOA transactions)
    const transactionAddress = userSmartWallet || session.User.walletAddress;
    if (!transactionAddress) {
      return NextResponse.json({ error: "No wallet address found" }, { status: 400 });
    }
    console.log(`Fetching transactions for ${transactionAddress} (${session.User.smartWalletAddress ? 'Smart Wallet' : 'EOA'})`);

    // Try to get cached transactions first (unless syncing from blockchain)
    if (!syncBlockchain) {
      const cacheKey = cacheKeys.transactions(transactionAddress, page, limit);
      const cached = await getCached<{
        transactions: unknown[];
        synced: number;
        pagination: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
          hasMore: boolean;
        };
      }>(cacheKey);

      if (cached) {
        return NextResponse.json({
          success: true,
          ...cached,
          fromCache: true,
        });
      }
    }

    // Only sync from blockchain if explicitly requested (to avoid rate limits)
    let syncedCount = 0;
    if (syncBlockchain) {
      try {
        const { getTransactionHistory } = await import("@/lib/blockchain/tokens");
        const blockchainTxs = await getTransactionHistory(transactionAddress as `0x${string}`);

        // Sync transactions to database (upsert to avoid duplicates)
        const syncedTxs = await Promise.all(
          blockchainTxs.map(async (tx) => {
            // Check if transaction already exists
            const existing = await prisma.transaction.findUnique({
              where: { txHash: tx.txHash },
            });

            if (existing) {
              // Update status if changed
              if (existing.status !== tx.status) {
                return prisma.transaction.update({
                  where: { txHash: tx.txHash },
                  data: {
                    status: tx.status,
                    blockNumber: tx.blockNumber,
                    confirmedAt: new Date(tx.timestamp * 1000),
                  },
                });
              }
              return existing;
            }

            // Create new transaction record
            return prisma.transaction.create({
              data: {
                userId: session.userId,
                txHash: tx.txHash,
                type: tx.type,
                token: tx.token,
                amount: tx.amount,
                recipientAddress: tx.toAddress.toLowerCase(),
                senderAddress: tx.fromAddress.toLowerCase(),
                status: tx.status,
                blockNumber: tx.blockNumber,
                confirmedAt: new Date(tx.timestamp * 1000),
              },
            });
          })
        );
        
        syncedCount = syncedTxs.length;
      } catch (error) {
        console.error("Error syncing from blockchain:", error);
        // Continue with database query even if sync fails
      }
    }

    // Get platform fee recipient to filter out platform fee transfers
    const { getPlatformFeeRecipient } = await import("@/config/env");
    const platformFeeRecipient = getPlatformFeeRecipient()?.toLowerCase();

    // Normalize wallet address to lowercase for comparison
    const walletLower = transactionAddress.toLowerCase();
    
    // Calculate pagination offset
    const skip = (page - 1) * limit;
    
    // Get total count for pagination metadata (exclude replaced transactions)
    // Only fetch transactions for the smart wallet, not the EOA
    const totalCount = await prisma.transaction.count({
      where: {
        AND: [
          {
            OR: [
              { senderAddress: walletLower },
              { recipientAddress: walletLower },
            ],
          },
          {
            replacedByTxHash: null, // Exclude transactions that were replaced by speed-up
          },
        ],
      },
    });
    
    const allTransactions = await prisma.transaction.findMany({
      where: {
        AND: [
          {
            OR: [
              { senderAddress: walletLower },
              { recipientAddress: walletLower },
            ],
          },
          {
            replacedByTxHash: null, // Exclude transactions that were replaced by speed-up
          },
        ],
      },
      orderBy: [
        { confirmedAt: "desc" }, // Confirmed transactions sorted by blockchain time (newest first)
        { createdAt: "desc" }, // Pending transactions without confirmedAt sorted by creation time
      ],
      skip,
      take: limit + 50, // Fetch extra to account for filtering platform fee transfers
    });

    // Sort to ensure PENDING transactions appear first, then confirmed by blockchain time
    const sortedTransactions = allTransactions.sort((a, b) => {
      // PENDING transactions (no confirmedAt) come first
      if (!a.confirmedAt && b.confirmedAt) return -1;
      if (a.confirmedAt && !b.confirmedAt) return 1;
      
      // Both pending or both confirmed - sort by confirmedAt (or createdAt as fallback)
      const aTime = a.confirmedAt || a.createdAt;
      const bTime = b.confirmedAt || b.createdAt;
      return bTime.getTime() - aTime.getTime(); // Newest first
    });

    // Filter out platform fee transfers (they're included in the main transaction's platformFee field)
    const filteredTransactions = sortedTransactions.filter((tx) => {
      // Keep transaction if it's NOT a transfer to the platform fee recipient
      // Platform fee transfers are standalone transfers to the fee wallet
      const isSend = tx.senderAddress?.toLowerCase() === walletLower;
      const isFeePayout = isSend && 
                          tx.recipientAddress?.toLowerCase() === platformFeeRecipient &&
                          !tx.platformFee; // Platform fee field is only set on the main transaction
      
      return !isFeePayout;
    }).slice(0, limit); // Limit to requested page size after filtering

    // Format transactions for frontend
    // Dynamically determine transaction type based on current user's wallet address
    const formattedTxs = filteredTransactions.map((tx) => {
      // Determine if this is a SEND or RECEIVE from current user's perspective
      const isSend = tx.senderAddress?.toLowerCase() === walletLower;
      const actualType = isSend ? "SEND" : "RECEIVE";
      
      return {
        id: tx.id,
        txHash: tx.txHash,
        type: actualType, // Use dynamically determined type, not stored type
        token: tx.token,
        amount: tx.amount,
        recipientAddress: tx.recipientAddress,
        senderAddress: tx.senderAddress,
        platformFee: tx.platformFee,
        gasFee: tx.gasFee,
        status: tx.status,
        createdAt: tx.createdAt.toISOString(),
        confirmedAt: tx.confirmedAt?.toISOString() || null,
        blockNumber: tx.blockNumber?.toString() || null,
      };
    });

    const responseData = {
      transactions: formattedTxs,
      synced: syncedCount,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: skip + filteredTransactions.length < totalCount,
      },
    };

    // Cache the response for 30 seconds (balances update frequently)
    // Only cache when not syncing from blockchain (cached data is DB data only)
    if (!syncBlockchain) {
      const cacheKey = cacheKeys.transactions(transactionAddress, page, limit);
      await setCached(cacheKey, responseData, 30);
    }

    return NextResponse.json({
      success: true,
      ...responseData,
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return NextResponse.json(
      { error: "Failed to fetch transaction history" },
      { status: 500 }
    );
  }
}
