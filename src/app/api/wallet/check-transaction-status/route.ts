/**
 * API Route: /api/wallet/check-transaction-status
 * Checks the status of a transaction on the blockchain
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash"),
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

    const { txHash } = parsed.data;

    // Get transaction receipt from blockchain
    const { getPublicClient } = await import("@/lib/blockchain/client");
    const publicClient = getPublicClient();

    try {
      const receipt = await publicClient.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      });

      if (receipt) {
        // Transaction is confirmed
        const status = receipt.status === "success" ? "CONFIRMED" : "FAILED";
        
        // Update database and notify connected clients
        try {
          const transaction = await prisma.transaction.findUnique({
            where: { txHash },
          });

          if (transaction && transaction.status !== status) {
            // Update transaction status in database
            // Note: Cache invalidation and SSE notifications are automatically handled
            // by the Prisma extension in src/lib/prisma.ts when transaction is updated
            await prisma.transaction.update({
              where: { txHash },
              data: {
                status,
                blockNumber: receipt.blockNumber,
                confirmedAt: new Date(),
              },
            });

            console.log(`[Transaction Status] Updated ${txHash}: ${transaction.status} → ${status}`);
          }
        } catch (dbError) {
          console.error(`[Transaction Status] Failed to update database:`, dbError);
          // Continue even if DB update fails
        }
        
        return NextResponse.json({
          success: true,
          status,
          blockNumber: receipt.blockNumber.toString(),
          gasUsed: receipt.gasUsed.toString(),
        });
      } else {
        // Transaction is still pending
        return NextResponse.json({
          success: true,
          status: "PENDING",
        });
      }
    } catch {
      // Transaction not found or still pending
      console.log(`Transaction ${txHash} not found yet, likely still pending`);
      return NextResponse.json({
        success: true,
        status: "PENDING",
      });
    }
  } catch (error) {
    console.error("Error checking transaction status:", error);
    return NextResponse.json(
      { error: "Failed to check transaction status" },
      { status: 500 }
    );
  }
}
