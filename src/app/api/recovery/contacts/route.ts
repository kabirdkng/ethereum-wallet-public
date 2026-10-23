import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCached, setCached, cacheKeys } from "@/lib/cache/redis";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const sessionToken = authHeader.substring(7); // Remove "Bearer " prefix

    // Validate session
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

    // Try to get cached recovery contacts first (unless force refresh)
    if (!forceRefresh) {
      const cacheKey = cacheKeys.recoveryContacts(session.userId);
      const cached = await getCached<{ contacts: unknown[] }>(cacheKey);

      if (cached) {
        console.log(`[RecoveryContactsAPI] Cache hit for user ${session.userId}`);
        return NextResponse.json({
          success: true,
          ...cached,
          fromCache: true,
        });
      }
      console.log(`[RecoveryContactsAPI] Cache miss for user ${session.userId}`);
    } else {
      console.log(`[RecoveryContactsAPI] Force refresh for user ${session.userId}`);
    }

    // Fetch recovery contacts
    const contacts = await prisma.recoveryContact.findMany({
      where: { userId: session.userId },
      orderBy: { shareIndex: "asc" },
      select: {
        id: true,
        contactPhone: true,
        contactName: true,
        shareIndex: true,
      },
    });

    const responseData = { contacts };

    // Cache the response for 60 seconds (recovery contacts don't change frequently)
    const cacheKey = cacheKeys.recoveryContacts(session.userId);
    await setCached(cacheKey, responseData, 60);

    return NextResponse.json({
      success: true,
      ...responseData,
    });
  } catch (error) {
    console.error("[Recovery] Failed to fetch contacts:", error);
    return NextResponse.json(
      { error: "Failed to fetch recovery contacts" },
      { status: 500 }
    );
  }
}
