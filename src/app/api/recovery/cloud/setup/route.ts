import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { deleteCached, cacheKeys } from "@/lib/cache/redis";

const setupSchema = z.object({
  sessionToken: z.string(),
  walletAddress: z.string(),
  encryptedMnemonic: z.string(), // Client sends pre-encrypted mnemonic
  password: z.string().optional(), // For password verification (will be hashed)
  recoveryHint: z.string().optional(),
  backupSource: z.enum(["manual", "oauth-google", "oauth-facebook"]),
  label: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = setupSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      sessionToken,
      walletAddress,
      encryptedMnemonic,
      password,
      recoveryHint,
      backupSource,
      label,
    } = parsed.data;

    // Normalize wallet address
    const normalizedWalletAddress = walletAddress.toLowerCase();

    // Verify session
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { User: true },
    });

    if (!session || session.expires < new Date()) {
      return NextResponse.json(
        { error: "Invalid or expired session" },
        { status: 401 }
      );
    }

    // Verify wallet ownership
    if (session.User.walletAddress !== normalizedWalletAddress) {
      return NextResponse.json(
        { error: "Wallet address mismatch" },
        { status: 403 }
      );
    }

    // Hash password if provided (for manual backups)
    let passwordHash: string | null = null;
    if (password && backupSource === "manual") {
      passwordHash = await bcrypt.hash(password, 12);
    }

    // For OAuth backups, store the OAuth ID for server-side verification during recovery
    let oauthId: string | null = null;
    if (backupSource.startsWith("oauth-")) {
      oauthId = session.User.oauthId;
      if (!oauthId) {
        return NextResponse.json(
          { error: "OAuth ID not found. Please sign out and sign back in with your OAuth provider." },
          { status: 400 }
        );
      }
    }

    // Delete existing backups of the same type for this user
    // Hard delete - only one backup per method type should exist
    await prisma.cloudBackup.deleteMany({
      where: {
        userId: session.userId,
        backupSource,
      },
    });

    // Create new cloud backup (replaces previous backup of same type)
    const cloudBackup = await prisma.cloudBackup.create({
      data: {
        userId: session.userId,
        walletAddress: normalizedWalletAddress,
        encryptedMnemonic,
        passwordHash,
        recoveryHint: recoveryHint || null,
        backupSource,
        oauthId, // Store OAuth ID for verification during recovery
        label: label || null,
      },
    });

    // Invalidate cloud backups cache
    const cacheKey = cacheKeys.cloudBackups(session.userId);
    await deleteCached(cacheKey);
    console.log(`[CloudBackupAPI] Cache invalidated for user ${session.userId}`);

    return NextResponse.json({
      success: true,
      backupId: cloudBackup.id,
      message: "Cloud backup created successfully",
    });
  } catch (error) {
    console.error("[Cloud Backup Setup]", error);
    return NextResponse.json(
      { error: "Failed to create cloud backup" },
      { status: 500 }
    );
  }
}
