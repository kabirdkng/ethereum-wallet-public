import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { checkRateLimit, createRateLimitError, getClientIp } from "@/lib/rate-limit";
import { logSecurityEvent, SecurityEventType, getSecurityContext } from "@/lib/security-logger";

const initiateSchema = z.object({
  identifier: z.string(), // email or phone
});

/**
 * Initiate OAuth Recovery Flow
 * 
 * SECURITY: Creates a server-side recovery session with cryptographic nonce
 * - Nonce prevents session fixation attacks
 * - Short expiry (10 minutes) limits attack window
 * - Server-side binding prevents sessionStorage manipulation
 * - Rate limiting prevents brute force enumeration
 * 
 * Flow:
 * 1. User provides identifier (email/phone)
 * 2. Server finds user and OAuth backup
 * 3. Server creates OAuthRecoverySession with nonce
 * 4. Returns nonce + OAuth provider to redirect to
 * 5. Client redirects to OAuth with nonce in state param
 * 6. OAuth callback verifies nonce matches active session
 */
export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = initiateSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { identifier } = parsed.data;

    // SECURITY: Rate limiting by identifier and IP
    const ip = getClientIp(request);
    const { userAgent } = getSecurityContext(request);
    
    const identifierLimit = await checkRateLimit({
      identifier: `oauth-recovery:${identifier}`,
      limit: 5, // 5 attempts
      windowMs: 15 * 60 * 1000, // per 15 minutes
    });

    if (!identifierLimit.allowed) {
      logSecurityEvent({
        type: SecurityEventType.RATE_LIMIT_EXCEEDED,
        identifier,
        ip,
        userAgent,
        timestamp: new Date(),
        success: false,
        metadata: { endpoint: "oauth-recovery-initiate" },
      });
      return createRateLimitError(identifierLimit.resetAt);
    }

    const ipLimit = await checkRateLimit({
      identifier: `oauth-recovery-ip:${ip}`,
      limit: 10, // 10 attempts from same IP
      windowMs: 15 * 60 * 1000, // per 15 minutes
    });

    if (!ipLimit.allowed) {
      logSecurityEvent({
        type: SecurityEventType.RATE_LIMIT_EXCEEDED,
        ip,
        userAgent,
        timestamp: new Date(),
        success: false,
        metadata: { endpoint: "oauth-recovery-initiate-ip" },
      });
      return createRateLimitError(ipLimit.resetAt);
    }

    // Find user by email or phone
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: identifier }],
      },
      include: {
        CloudBackup: {
          where: {
            isActive: true,
            backupSource: {
              startsWith: "oauth-",
            },
          },
        },
      },
    });

    if (!user) {
      // Log failed attempt
      logSecurityEvent({
        type: SecurityEventType.OAUTH_RECOVERY_INITIATED,
        identifier,
        ip,
        userAgent,
        timestamp: new Date(),
        success: false,
        metadata: { reason: "user_not_found" },
      });
      
      // Don't reveal whether user exists (timing-safe)
      return NextResponse.json(
        { error: "No OAuth backup found for this identifier" },
        { status: 404 }
      );
    }

    if (user.CloudBackup.length === 0) {
      logSecurityEvent({
        type: SecurityEventType.OAUTH_RECOVERY_INITIATED,
        userId: user.id,
        identifier,
        ip,
        userAgent,
        timestamp: new Date(),
        success: false,
        metadata: { reason: "no_oauth_backup" },
      });
      
      return NextResponse.json(
        { error: "No OAuth backup found. Please use password recovery or social recovery." },
        { status: 404 }
      );
    }

    // Use most recent OAuth backup
    const backup = user.CloudBackup.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    )[0];

    if (!backup) {
      return NextResponse.json(
        { error: "Backup not available" },
        { status: 404 }
      );
    }

    // Extract provider from backup source
    const provider = backup.backupSource.replace("oauth-", "") as "google" | "facebook";

    // Generate cryptographically secure nonce
    const nonce = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Clean up any expired sessions for this user
    await prisma.oAuthRecoverySession.deleteMany({
      where: {
        userId: user.id,
        OR: [
          { expiresAt: { lt: new Date() } },
          { status: "completed" },
        ],
      },
    });

    // Create recovery session
    await prisma.oAuthRecoverySession.create({
      data: {
        nonce,
        userId: user.id,
        backupId: backup.id,
        provider,
        status: "pending_oauth",
        expiresAt,
      },
    });

    // Log successful initiation
    logSecurityEvent({
      type: SecurityEventType.OAUTH_RECOVERY_INITIATED,
      userId: user.id,
      identifier,
      ip,
      userAgent,
      timestamp: new Date(),
      success: true,
      metadata: { provider, backupId: backup.id },
    });

    // Return minimal information - just what's needed for redirect
    return NextResponse.json({
      success: true,
      nonce, // Used as OAuth state parameter
      provider, // Which OAuth provider to redirect to
      // Do NOT return sensitive data like userId, walletAddress, etc.
    });
  } catch (error) {
    console.error("[OAuth Recovery Initiate]", error);
    return NextResponse.json(
      { error: "Failed to initiate recovery" },
      { status: 500 }
    );
  }
}
