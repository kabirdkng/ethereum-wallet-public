import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { deleteCached, cacheKeys } from "@/lib/cache/redis";

const deleteSchema = z.object({
  sessionToken: z.string(),
  method: z.enum(["social", "password", "oauth-google", "oauth-facebook"]),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = deleteSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { sessionToken, method } = parsed.data;

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

    if (method === "social") {
      // Delete all social recovery contacts
      await prisma.recoveryContact.deleteMany({
        where: { userId: session.userId },
      });

      // Invalidate recovery contacts cache
      const cacheKey = cacheKeys.recoveryContacts(session.userId);
      await deleteCached(cacheKey);
      console.log(`[RecoveryContactsAPI] Cache invalidated for user ${session.userId}`);
      
      return NextResponse.json({
        success: true,
        message: "Social recovery deleted successfully",
      });
    } else {
      // Delete cloud backup of specified type
      const backupSource = method === "password" ? "manual" : method;
      
      await prisma.cloudBackup.deleteMany({
        where: {
          userId: session.userId,
          backupSource,
        },
      });

      // Invalidate cloud backups cache
      const cacheKey = cacheKeys.cloudBackups(session.userId);
      await deleteCached(cacheKey);
      console.log(`[CloudBackupAPI] Cache invalidated for user ${session.userId}`);

      return NextResponse.json({
        success: true,
        message: `${method} backup deleted successfully`,
      });
    }
  } catch (error) {
    console.error("[Recovery Delete]", error);
    return NextResponse.json(
      { error: "Failed to delete recovery method" },
      { status: 500 }
    );
  }
}
