import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const verifySchema = z.object({
  sessionToken: z.string(),
  backupId: z.string(),
});

/**
 * Verify OAuth ID Server-Side
 * 
 * CRITICAL SECURITY: This endpoint verifies that the OAuth ID from the current
 * authenticated session matches the OAuth ID that created the backup.
 * This prevents attackers from bypassing client-side checks by injecting fake OAuth IDs.
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

    const { sessionToken, backupId } = parsed.data;

    // Verify session and get authenticated user
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

    // Get the backup
    const backup = await prisma.cloudBackup.findUnique({
      where: { id: backupId },
    });

    if (!backup) {
      return NextResponse.json(
        { error: "Backup not found" },
        { status: 404 }
      );
    }

    // Verify backup belongs to the user
    if (backup.userId !== session.userId) {
      return NextResponse.json(
        { error: "Unauthorized: Backup does not belong to this user" },
        { status: 403 }
      );
    }

    // CRITICAL: Verify this is an OAuth backup
    if (!backup.backupSource.startsWith("oauth-")) {
      return NextResponse.json(
        { error: "This backup is not an OAuth backup" },
        { status: 400 }
      );
    }

    // CRITICAL: Verify the backup has an OAuth ID stored
    if (!backup.oauthId) {
      return NextResponse.json(
        { error: "Backup OAuth ID not found. This backup may be from an older version." },
        { status: 400 }
      );
    }

    // CRITICAL: Verify the current session's OAuth ID matches the backup's OAuth ID
    if (!session.User.oauthId) {
      return NextResponse.json(
        { error: "You are not authenticated with OAuth. Please sign in with your OAuth provider." },
        { status: 401 }
      );
    }

    if (session.User.oauthId !== backup.oauthId) {
      return NextResponse.json(
        {
          error: "OAuth account mismatch",
          message: "The OAuth account you signed in with does not match the account that created this backup.",
        },
        { status: 403 }
      );
    }

    // CRITICAL: Verify the OAuth provider matches
    const backupProvider = backup.backupSource.replace("oauth-", "");
    const sessionProvider = session.User.oauthProvider?.toLowerCase();
    
    if (sessionProvider !== backupProvider && !sessionProvider?.includes(backupProvider)) {
      return NextResponse.json(
        {
          error: "OAuth provider mismatch",
          message: `This backup was created with ${backupProvider}, but you signed in with ${sessionProvider}.`,
        },
        { status: 403 }
      );
    }

    // All verifications passed!
    return NextResponse.json({
      success: true,
      verified: true,
      message: "OAuth verification successful",
    });
  } catch (error) {
    console.error("[OAuth Verification]", error);
    return NextResponse.json(
      { error: "Failed to verify OAuth credentials" },
      { status: 500 }
    );
  }
}
