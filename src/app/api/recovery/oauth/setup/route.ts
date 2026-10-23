import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { encryptWithOAuth } from "@/lib/crypto/server-encryption";
import { getServerEnv } from "@/config/env";

const setupSchema = z.object({
  sessionToken: z.string(),
  walletAddress: z.string(),
  mnemonic: z.string(), // Server receives plaintext (over HTTPS), encrypts server-side
  provider: z.enum(["google", "facebook"]),
  label: z.string().optional(),
});

/**
 * Create OAuth-Encrypted Cloud Backup (Server-Side)
 * 
 * SECURITY: Encryption happens server-side with HMAC-derived key
 * - Client sends plaintext mnemonic over HTTPS
 * - Server encrypts using HMAC(oauthId, serverSecret) + userId
 * - Requires emailVerified to prevent account takeover
 * - Only one backup per OAuth provider allowed
 */
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

    const { sessionToken, walletAddress, mnemonic, provider, label } = parsed.data;
    const env = getServerEnv();

    // SECURITY: Require ENCRYPTION_SECRET for OAuth backups
    if (!env.ENCRYPTION_SECRET) {
      return NextResponse.json(
        {
          error: "Server configuration error",
          message: "OAuth backups require ENCRYPTION_SECRET to be configured. Please contact support.",
        },
        { status: 500 }
      );
    }

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

    // SECURITY: Require email verification for OAuth backups
    if (!session.User.emailVerified && session.User.email) {
      return NextResponse.json(
        {
          error: "email_verification_required",
          message: "Please verify your email before creating an OAuth backup.",
          email: session.User.email,
          needsVerification: true,
        },
        { status: 403 }
      );
    }

    // Verify wallet ownership
    if (session.User.walletAddress !== normalizedWalletAddress) {
      return NextResponse.json(
        { error: "Wallet address mismatch" },
        { status: 403 }
      );
    }

    // Verify user is authenticated with the specified provider
    if (!session.User.oauthProvider || !session.User.oauthId) {
      return NextResponse.json(
        { error: "Not authenticated with OAuth. Please sign in with Google or Facebook." },
        { status: 400 }
      );
    }

    const normalizedProvider = session.User.oauthProvider.toLowerCase();
    if (!normalizedProvider.includes(provider)) {
      return NextResponse.json(
        { error: `Please sign in with ${provider} to create this backup.` },
        { status: 400 }
      );
    }

    // Verify mnemonic matches wallet address (integrity check)
    const { mnemonicToAccount } = await import("viem/accounts");
    const account = mnemonicToAccount(mnemonic);
    
    if (account.address.toLowerCase() !== normalizedWalletAddress) {
      return NextResponse.json(
        { error: "Wallet address does not match provided mnemonic" },
        { status: 400 }
      );
    }

    // SERVER-SIDE ENCRYPTION using HMAC(oauthId, serverSecret)
    const encryptedPayload = await encryptWithOAuth(
      mnemonic,
      session.User.oauthId,
      session.userId,
      env.ENCRYPTION_SECRET
    );

    const backupSource = `oauth-${provider}`;

    // Delete existing backup of same type
    await prisma.cloudBackup.deleteMany({
      where: {
        userId: session.userId,
        backupSource,
      },
    });

    // Create new OAuth backup
    const cloudBackup = await prisma.cloudBackup.create({
      data: {
        userId: session.userId,
        walletAddress: normalizedWalletAddress,
        encryptedMnemonic: JSON.stringify(encryptedPayload),
        backupSource,
        oauthId: session.User.oauthId, // Store for verification during recovery
        label: label || `${provider.charAt(0).toUpperCase() + provider.slice(1)} Account Backup`,
      },
    });

    return NextResponse.json({
      success: true,
      backupId: cloudBackup.id,
      message: "OAuth backup created successfully",
    });
  } catch (error) {
    console.error("[OAuth Backup Setup]", error);
    return NextResponse.json(
      { error: "Failed to create OAuth backup" },
      { status: 500 }
    );
  }
}
