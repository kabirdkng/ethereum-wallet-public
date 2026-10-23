import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logSecurityEvent, SecurityEventType, getSecurityContext } from "@/lib/security-logger";

const verifySchema = z.object({
  nonce: z.string(),
  sessionToken: z.string(), // From OAuth sign-in
});

/**
 * Verify OAuth Recovery Session
 * 
 * SECURITY: Server-side verification that prevents sessionStorage manipulation
 * - Verifies nonce from OAuth state matches active recovery session
 * - Ensures OAuth ID from authenticated session matches backup's OAuth ID
 * - Checks session hasn't expired
 * - Updates session status to prevent reuse
 * 
 * Called after successful OAuth sign-in during recovery flow
 */
export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = verifySchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { nonce, sessionToken } = parsed.data;
    const { ip, userAgent } = getSecurityContext(request);

    // Verify the OAuth session
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { User: true },
    });

    if (!session || session.expires < new Date()) {
      return NextResponse.json(
        { error: "Invalid or expired OAuth session" },
        { status: 401 }
      );
    }

    // Find recovery session by nonce
    const recoverySession = await prisma.oAuthRecoverySession.findUnique({
      where: { nonce },
      include: {
        User: true,
      },
    });

    if (!recoverySession) {
      return NextResponse.json(
        { error: "Invalid recovery nonce" },
        { status: 404 }
      );
    }

    // Verify not expired
    if (recoverySession.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Recovery session expired. Please start over." },
        { status: 401 }
      );
    }

    // Verify status is still pending
    if (recoverySession.status !== "pending_oauth") {
      return NextResponse.json(
        { error: "Recovery session already used or completed" },
        { status: 400 }
      );
    }

    // CRITICAL: Verify the OAuth user matches the recovery user
    if (session.userId !== recoverySession.userId) {
      // Log potential attack attempt
      console.error("[SECURITY] OAuth recovery user mismatch:", {
        recoveryUserId: recoverySession.userId,
        oauthUserId: session.userId,
        nonce,
      });

      logSecurityEvent({
        type: SecurityEventType.USER_MISMATCH,
        userId: session.userId,
        ip,
        userAgent,
        timestamp: new Date(),
        success: false,
        metadata: {
          expectedUserId: recoverySession.userId,
          actualUserId: session.userId,
          nonce,
        },
      });

      return NextResponse.json(
        { error: "Authentication failed - user mismatch" },
        { status: 403 }
      );
    }

    // Get the backup to verify OAuth ID
    const backup = await prisma.cloudBackup.findUnique({
      where: { id: recoverySession.backupId },
    });

    if (!backup) {
      return NextResponse.json(
        { error: "Backup not found" },
        { status: 404 }
      );
    }

    // CRITICAL: Verify OAuth ID matches
    if (!session.User.oauthId) {
      return NextResponse.json(
        { error: "OAuth ID not found in session" },
        { status: 400 }
      );
    }

    if (backup.oauthId !== session.User.oauthId) {
      console.error("[SECURITY] OAuth ID mismatch:", {
        backupOAuthId: backup.oauthId,
        sessionOAuthId: session.User.oauthId,
        nonce,
      });

      logSecurityEvent({
        type: SecurityEventType.OAUTH_MISMATCH,
        userId: session.userId,
        ip,
        userAgent,
        timestamp: new Date(),
        success: false,
        metadata: {
          backupId: backup.id,
          nonce,
        },
      });

      return NextResponse.json(
        {
          error: "OAuth account mismatch",
          message: "You must sign in with the same OAuth account that created this backup.",
        },
        { status: 403 }
      );
    }

    // CRITICAL: Verify provider matches
    const backupProvider = backup.backupSource.replace("oauth-", "");
    if (recoverySession.provider !== backupProvider) {
      return NextResponse.json(
        {
          error: "Provider mismatch",
          message: `This backup requires ${backupProvider} authentication.`,
        },
        { status: 400 }
      );
    }

    // Update recovery session status
    await prisma.oAuthRecoverySession.update({
      where: { id: recoverySession.id },
      data: {
        status: "oauth_verified",
        verifiedAt: new Date(),
      },
    });

    // Log successful verification
    logSecurityEvent({
      type: SecurityEventType.OAUTH_RECOVERY_VERIFIED,
      userId: session.userId,
      ip,
      userAgent,
      timestamp: new Date(),
      success: true,
      metadata: {
        backupId: backup.id,
        provider: recoverySession.provider,
        nonce,
      },
    });

    // Return backup data for decryption (now that we've verified everything)
    return NextResponse.json({
      success: true,
      verified: true,
      backup: {
        id: backup.id,
        walletAddress: backup.walletAddress,
        encryptedMnemonic: backup.encryptedMnemonic,
      },
      // Return recovery session ID for final completion
      recoverySessionId: recoverySession.id,
    });
  } catch (error) {
    console.error("[OAuth Recovery Verify]", error);
    return NextResponse.json(
      { error: "Failed to verify recovery session" },
      { status: 500 }
    );
  }
}
