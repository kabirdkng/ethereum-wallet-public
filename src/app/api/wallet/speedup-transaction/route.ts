/**
 * API Route: /api/wallet/speedup-transaction
 * Handles marking old transaction as replaced and creating new speed-up transaction record
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({
  sessionToken: z.string().min(1, "Session token required"),
  oldTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid old transaction hash"),
  newTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid new transaction hash"),
});

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

    const { sessionToken, oldTxHash, newTxHash } = parsed.data;

    // Validate session
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { User: true },
    });

    if (!session || session.expires < new Date()) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    // Find the old transaction
    const oldTransaction = await prisma.transaction.findUnique({
      where: { txHash: oldTxHash },
    });

    if (!oldTransaction) {
      return NextResponse.json({ error: "Original transaction not found" }, { status: 404 });
    }

    // Verify ownership
    if (oldTransaction.userId !== session.userId) {
      return NextResponse.json({ error: "Not authorized to modify this transaction" }, { status: 403 });
    }

    // Use a transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Mark old transaction as replaced
      const updated = await tx.transaction.update({
        where: { txHash: oldTxHash },
        data: { replacedByTxHash: newTxHash },
      });

      // Create new transaction record with same data but new hash
      const newTransaction = await tx.transaction.create({
        data: {
          userId: session.userId,
          txHash: newTxHash,
          type: oldTransaction.type,
          token: oldTransaction.token,
          amount: oldTransaction.amount,
          recipientAddress: oldTransaction.recipientAddress,
          senderAddress: oldTransaction.senderAddress,
          platformFee: oldTransaction.platformFee,
          gasFee: oldTransaction.gasFee, // Will be updated later with actual gas
          status: "PENDING",
        },
      });

      return { updated, newTransaction };
    });

    console.log(`[Speed-up Transaction] Replaced ${oldTxHash} with ${newTxHash}`);

    return NextResponse.json({
      success: true,
      oldTransaction: {
        id: result.updated.id,
        txHash: result.updated.txHash,
        replacedBy: result.updated.replacedByTxHash,
      },
      newTransaction: {
        id: result.newTransaction.id,
        txHash: result.newTransaction.txHash,
        status: result.newTransaction.status,
      },
    });
  } catch (error) {
    console.error("[Speed-up Transaction] Error:", error);
    return NextResponse.json(
      { error: "Failed to process speed-up transaction" },
      { status: 500 }
    );
  }
}
