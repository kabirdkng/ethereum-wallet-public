/**
 * API Route: /api/wallet/backup
 * Backs up encrypted wallet data to server for multi-device access
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const backupSchema = z.object({
  sessionToken: z.string().min(1, "Session token required"),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  encryptedData: z.string().min(1, "Encrypted data required"), // JSON stringified payload
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = backupSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { sessionToken, walletAddress, encryptedData } = parsed.data;

    // Validate session
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { User: true },
    });

    if (!session || session.expires < new Date()) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    // Verify wallet address matches user
    if (session.User.walletAddress?.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json({ error: "Wallet address mismatch" }, { status: 403 });
    }

    // Upsert encrypted wallet backup
    const backup = await prisma.encryptedWallet.upsert({
      where: { userId: session.userId },
      create: {
        userId: session.userId,
        walletAddress,
        encryptedData,
      },
      update: {
        encryptedData,
        walletAddress,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Wallet backed up successfully",
      backupId: backup.id,
    });
  } catch (error) {
    console.error("[Wallet Backup] Error:", error);
    return NextResponse.json({ error: "Failed to backup wallet" }, { status: 500 });
  }
}

