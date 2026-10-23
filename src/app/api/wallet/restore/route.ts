/**
 * API Route: /api/wallet/restore
 * Restores encrypted wallet data from server for multi-device access
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const restoreSchema = z.object({
  sessionToken: z.string().min(1, "Session token required"),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = restoreSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { sessionToken } = parsed.data;

    // Validate session
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { User: { include: { EncryptedWallet: true } } },
    });

    if (!session || session.expires < new Date()) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    // Check if user has a backup
    if (!session.User.EncryptedWallet) {
      return NextResponse.json({ error: "No wallet backup found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      walletAddress: session.User.EncryptedWallet.walletAddress,
      encryptedData: session.User.EncryptedWallet.encryptedData,
    });
  } catch (error) {
    console.error("[Wallet Restore] Error:", error);
    return NextResponse.json({ error: "Failed to restore wallet" }, { status: 500 });
  }
}

