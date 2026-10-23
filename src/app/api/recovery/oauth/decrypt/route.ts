import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { decryptWithOAuth } from "@/lib/crypto/server-encryption";
import { getServerEnv } from "@/config/env";
import bcrypt from "bcryptjs";
import {
  logSecurityEvent,
  SecurityEventType,
  getSecurityContext,
} from "@/lib/security-logger";
import { getClientIp } from "@/lib/rate-limit";

const decryptSchema = z.object({
  recoverySessionId: z.string(),
  sessionToken: z.string(),
  newPin: z.string().regex(/^\d{6}$/, "PIN must be 6 digits"),
});

/**
 * Server-Side OAuth Backup Decryption
 * 
 * SECURITY: Decryption happens server-side to prevent client manipulation
 * - Verifies recovery session is oauth_verified
 * - Uses server secret + OAuth ID for decryption
 * - Re-encrypts with new PIN before sending to client
 * - Client never sees plaintext mnemonic
 * - Marks recovery session as completed
 */
export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = decryptSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { recoverySessionId, sessionToken, newPin } = parsed.data;
    const env = getServerEnv();

    // SECURITY: Require ENCRYPTION_SECRET for OAuth recovery
    if (!env.ENCRYPTION_SECRET) {
      return NextResponse.json(
        {
          error: "Server configuration error",
          message: "OAuth recovery requires ENCRYPTION_SECRET to be configured. Please contact support.",
        },
        { status: 500 }
      );
    }

    // Verify OAuth session
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

    // Get recovery session
    const recoverySession = await prisma.oAuthRecoverySession.findUnique({
      where: { id: recoverySessionId },
    });

    if (!recoverySession) {
      return NextResponse.json(
        { error: "Recovery session not found" },
        { status: 404 }
      );
    }

    // Verify recovery session is verified
    if (recoverySession.status !== "oauth_verified") {
      return NextResponse.json(
        { error: "Recovery session not verified. Please complete OAuth authentication first." },
        { status: 400 }
      );
    }

    // Verify not expired
    if (recoverySession.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Recovery session expired" },
        { status: 401 }
      );
    }

    // Verify user matches
    if (session.userId !== recoverySession.userId) {
      console.error("[SECURITY] User mismatch in decrypt:", {
        sessionUserId: session.userId,
        recoveryUserId: recoverySession.userId,
      });
      return NextResponse.json(
        { error: "Authorization failed" },
        { status: 403 }
      );
    }

    // Get backup
    const backup = await prisma.cloudBackup.findUnique({
      where: { id: recoverySession.backupId },
    });

    if (!backup) {
      return NextResponse.json(
        { error: "Backup not found" },
        { status: 404 }
      );
    }

    // Verify OAuth ID is present
    if (!session.User.oauthId) {
      return NextResponse.json(
        { error: "OAuth ID not found" },
        { status: 400 }
      );
    }

    // SERVER-SIDE DECRYPTION using HMAC(oauthId, serverSecret)
    const encryptedPayload = JSON.parse(backup.encryptedMnemonic);
    let mnemonic: string;

    try {
      mnemonic = await decryptWithOAuth(
        encryptedPayload,
        session.User.oauthId,
        session.userId,
        env.ENCRYPTION_SECRET
      );
    } catch (error) {
      console.error("[OAuth Decrypt] Decryption failed:", error);
      
      // SECURITY: Log decryption failure
      logSecurityEvent({
        type: SecurityEventType.RECOVERY_FAILED,
        userId: session.userId,
        ip: getClientIp(request),
        userAgent: getSecurityContext(request).userAgent,
        timestamp: new Date(),
        success: false,
        metadata: {
          reason: "decryption_failed",
          sessionId: recoverySession.id,
        },
      });
      
      return NextResponse.json(
        { error: "Failed to decrypt backup. OAuth credentials may not match." },
        { status: 400 }
      );
    }

    // Verify wallet address matches (integrity check)
    const { mnemonicToAccount } = await import("viem/accounts");
    const account = mnemonicToAccount(mnemonic);
    
    if (account.address.toLowerCase() !== backup.walletAddress.toLowerCase()) {
      console.error("[SECURITY] Wallet address mismatch after decryption");
      return NextResponse.json(
        { error: "Backup integrity check failed" },
        { status: 500 }
      );
    }

    // Re-encrypt with new PIN using SERVER-SIDE encryption
    const { encryptWithPin } = await import("@/lib/crypto/server-encryption");
    const reencrypted = await encryptWithPin(mnemonic, newPin);

    // Update PIN hash on user record
    const pinHash = await bcrypt.hash(newPin, 12);
    await prisma.user.update({
      where: { id: session.userId },
      data: { pinHash },
    });

        // Mark recovery session as completed
    await prisma.oAuthRecoverySession.update({
      where: { id: recoverySession.id },
      data: {
        status: "completed",
      },
    });

    // SECURITY: Log successful recovery completion
    logSecurityEvent({
      type: SecurityEventType.OAUTH_RECOVERY_SUCCESS,
      userId: session.userId,
      ip: getClientIp(request),
      userAgent: getSecurityContext(request).userAgent,
      timestamp: new Date(),
      success: true,
      metadata: {
        method: "oauth",
        provider: recoverySession.provider,
        sessionId: recoverySession.id,
      },
    });

    // Return re-encrypted wallet
    return NextResponse.json({
      success: true,
      encryptedWallet: reencrypted,
      address: account.address,
    });
  } catch (error) {
    console.error("[OAuth Decrypt]", error);
    return NextResponse.json(
      { error: "Failed to decrypt backup" },
      { status: 500 }
    );
  }
}
