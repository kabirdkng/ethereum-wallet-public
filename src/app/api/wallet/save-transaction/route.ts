/**
 * API Route: /api/wallet/save-transaction
 * Saves transaction details immediately after sending (before blockchain confirmation)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({
  sessionToken: z.string().min(1, "Session token required"),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash").optional(), // Optional for AA
  userOpHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid UserOperation hash").optional(), // For AA transactions
  transactionId: z.string().optional(), // For updating existing pending transactions
  type: z.enum(["SEND", "RECEIVE"]),
  token: z.enum(["USDC", "USDT", "ETH"]),
  amount: z.string(),
  recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid recipient address").optional(),
  senderAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid sender address").optional(),
  platformFee: z.string().optional(),
  gasFee: z.string().optional(),
  gasSponsored: z.boolean().optional(), // Whether gas was sponsored by Gas Manager
  isAA: z.boolean().optional(), // Whether this is an AA transaction
}).refine(
  (data) => data.txHash || data.userOpHash,
  { message: "Either txHash or userOpHash must be provided" }
);

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = requestSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { sessionToken, ...transactionData } = parsed.data;

    // Validate session
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { User: true },
    });

    if (!session || session.expires < new Date()) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    // Check if transaction already exists (by txHash or userOpHash)
    const existing = transactionData.txHash
      ? await prisma.transaction.findUnique({ where: { txHash: transactionData.txHash } })
      : transactionData.userOpHash
      ? await prisma.transaction.findUnique({ where: { userOpHash: transactionData.userOpHash } })
      : null;

    if (existing) {
      // Update existing transaction with new data (e.g., actual gas costs)
      const updated = await prisma.transaction.update({
        where: { id: existing.id },
        data: {
          // Update fields that might have changed (like actual gas cost)
          gasFee: transactionData.gasFee || existing.gasFee,
          platformFee: transactionData.platformFee || existing.platformFee,
          amount: transactionData.amount || existing.amount,
          txHash: transactionData.txHash ?? existing.txHash,
          userOpHash: transactionData.userOpHash ?? existing.userOpHash,
          gasSponsored: transactionData.gasSponsored ?? existing.gasSponsored,
          isAA: transactionData.isAA ?? existing.isAA,
        },
      });

      return NextResponse.json({
        success: true,
        transaction: {
          id: updated.id,
          txHash: updated.txHash,
          userOpHash: updated.userOpHash,
          status: updated.status,
          blockNumber: updated.blockNumber?.toString() || null,
        },
        message: "Transaction updated",
      });
    }

    // Create transaction record
    const transaction = await prisma.transaction.create({
      data: {
        userId: session.userId,
        txHash: transactionData.txHash || transactionData.userOpHash || `pending-${Date.now()}`, // Fallback for AA-only transactions
        userOpHash: transactionData.userOpHash,
        type: transactionData.type,
        token: transactionData.token,
        amount: transactionData.amount,
        recipientAddress: transactionData.recipientAddress?.toLowerCase(),
        senderAddress: transactionData.senderAddress?.toLowerCase(),
        platformFee: transactionData.platformFee,
        gasFee: transactionData.gasFee,
        gasSponsored: transactionData.gasSponsored || false,
        isAA: transactionData.isAA || false,
        status: "PENDING",
      },
    });

    // Note: Cache invalidation and SSE notifications are automatically handled
    // by the Prisma extension in src/lib/prisma.ts when transaction is created

    return NextResponse.json({
      success: true,
      transaction: {
        id: transaction.id,
        txHash: transaction.txHash,
        userOpHash: transaction.userOpHash,
        status: transaction.status,
        blockNumber: transaction.blockNumber?.toString() || null,
        gasSponsored: transaction.gasSponsored,
        isAA: transaction.isAA,
      },
    });
  } catch (error) {
    console.error("Error saving transaction:", error);
    return NextResponse.json(
      { error: "Failed to save transaction" },
      { status: 500 }
    );
  }
}
