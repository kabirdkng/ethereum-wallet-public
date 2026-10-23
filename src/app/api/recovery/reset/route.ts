import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { deleteCached, cacheKeys } from "@/lib/cache/redis";

const resetSchema = z.object({
  sessionToken: z.string(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = resetSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { sessionToken } = parsed.data;

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

    // Delete all recovery contacts for this user
    const result = await prisma.recoveryContact.deleteMany({
      where: { userId: session.userId },
    });

    // Invalidate recovery contacts cache
    const cacheKey = cacheKeys.recoveryContacts(session.userId);
    await deleteCached(cacheKey);
    console.log(`[RecoveryContactsAPI] Cache invalidated for user ${session.userId}`);

    return NextResponse.json({
      success: true,
      message: "Recovery options reset successfully",
      deletedCount: result.count,
    });
  } catch (error) {
    console.error("[Recovery Reset]", error);
    return NextResponse.json(
      { error: "Failed to reset recovery options" },
      { status: 500 }
    );
  }
}
