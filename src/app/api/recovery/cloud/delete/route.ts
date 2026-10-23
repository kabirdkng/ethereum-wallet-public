import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { deleteCached, cacheKeys } from "@/lib/cache/redis";

const deleteSchema = z.object({
  sessionToken: z.string(),
  backupId: z.string(),
  hardDelete: z.boolean().optional(), // If true, permanently delete; otherwise just deactivate
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

    const { sessionToken, backupId, hardDelete } = parsed.data;

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

    // Verify backup belongs to user
    const backup = await prisma.cloudBackup.findFirst({
      where: {
        id: backupId,
        userId: session.userId,
      },
    });

    if (!backup) {
      return NextResponse.json(
        { error: "Backup not found" },
        { status: 404 }
      );
    }

    if (hardDelete) {
      // Permanently delete the backup
      await prisma.cloudBackup.delete({
        where: { id: backupId },
      });
    } else {
      // Just deactivate it
      await prisma.cloudBackup.update({
        where: { id: backupId },
        data: { isActive: false },
      });
    }

    // Invalidate cloud backups cache
    const cacheKey = cacheKeys.cloudBackups(session.userId);
    await deleteCached(cacheKey);
    console.log(`[CloudBackupAPI] Cache invalidated for user ${session.userId}`);

    return NextResponse.json({
      success: true,
      message: hardDelete ? "Backup deleted permanently" : "Backup deactivated",
    });
  } catch (error) {
    console.error("[Cloud Backup Delete]", error);
    return NextResponse.json(
      { error: "Failed to delete cloud backup" },
      { status: 500 }
    );
  }
}
