/**
 * API Route: /api/wallet/notify-recipient
 * Sends SSE notification to recipient for optimistic transaction updates
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { sendWalletEvent } from "@/lib/sse/broadcast";

const requestSchema = z.object({
  recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid recipient address"),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash"),
  type: z.enum(["SEND", "RECEIVE"]),
  token: z.enum(["USDC", "USDT", "ETH"]),
  amount: z.string(),
  senderAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid sender address"),
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

    const { recipientAddress, txHash, token, amount, senderAddress } = parsed.data;

    // Send SSE notification to recipient
    // The recipient will see this as a "RECEIVE" transaction
    const sent = sendWalletEvent(recipientAddress, "transaction_update", {
      txHash,
      type: "RECEIVE", // From recipient's perspective
      token,
      amount,
      senderAddress,
      status: "PENDING",
      timestamp: Date.now(),
    });

    if (!sent) {
      // Recipient might not be connected, that's okay
      console.log(`[Notify Recipient] No active SSE connection for ${recipientAddress}`);
    }

    return NextResponse.json({
      success: true,
      notified: sent,
    });
  } catch (error) {
    console.error("[Notify Recipient] Error:", error);
    return NextResponse.json(
      { error: "Failed to notify recipient" },
      { status: 500 }
    );
  }
}
