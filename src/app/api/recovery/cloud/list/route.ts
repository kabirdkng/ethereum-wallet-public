import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCached, setCached, cacheKeys } from "@/lib/cache/redis";

export async function GET(request: Request) {
  try {
    // Get session token from Authorization header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const sessionToken = authHeader.substring(7); // Remove "Bearer " prefix

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

    // Check for force refresh query param
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "true";

    // Try to get cached cloud backups first (unless force refresh)
    if (!forceRefresh) {
      const cacheKey = cacheKeys.cloudBackups(session.userId);
      const cached = await getCached<{ backups: unknown[] }>(cacheKey);

      if (cached) {
        console.log(`[CloudBackupAPI] Cache hit for user ${session.userId}`);
        return NextResponse.json({
          success: true,
          ...cached,
          fromCache: true,
        });
      }
      console.log(`[CloudBackupAPI] Cache miss for user ${session.userId}`);
    } else {
      console.log(`[CloudBackupAPI] Force refresh for user ${session.userId}`);
    }

    // Fetch all active cloud backups for user
    const backups = await prisma.cloudBackup.findMany({
      where: {
        userId: session.userId,
        isActive: true,
      },
      select: {
        id: true,
        walletAddress: true,
        backupSource: true,
        label: true,
        recoveryHint: true,
        createdAt: true,
        updatedAt: true,
        // Exclude encrypted mnemonic and password hash for security
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const responseData = { backups };

    // Cache the response for 60 seconds (backups don't change frequently)
    const cacheKey = cacheKeys.cloudBackups(session.userId);
    await setCached(cacheKey, responseData, 60);

    return NextResponse.json({
      success: true,
      ...responseData,
    });
  } catch (error) {
    console.error("[Cloud Backup List]", error);
    return NextResponse.json(
      { error: "Failed to fetch cloud backups" },
      { status: 500 }
    );
  }
}
