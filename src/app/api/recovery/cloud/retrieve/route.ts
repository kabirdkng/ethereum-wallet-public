import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

const retrieveSchema = z.object({
  identifier: z.string(), // email or phone
  backupId: z.string().optional(), // If multiple backups exist, user can specify which one
  password: z.string().optional(), // For manual backups
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = retrieveSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { identifier, backupId, password } = parsed.data;

    // Find user by email or phone
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: identifier }],
      },
      include: {
        CloudBackup: {
          where: {
            isActive: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "No account found with this identifier" },
        { status: 404 }
      );
    }

    if (user.CloudBackup.length === 0) {
      return NextResponse.json(
        { error: "No cloud backups found for this account" },
        { status: 404 }
      );
    }

    // If backupId specified, find that specific backup
    let backup;
    if (backupId) {
      backup = user.CloudBackup.find((b) => b.id === backupId);
      if (!backup) {
        return NextResponse.json(
          { error: "Backup not found" },
          { status: 404 }
        );
      }
    } else {
      // Use most recent backup
      backup = user.CloudBackup.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      )[0];
    }

    if (!backup) {
      return NextResponse.json(
        { error: "No backup available" },
        { status: 404 }
      );
    }

    // Verify password for manual backups
    if (backup.backupSource === "manual") {
      if (!password) {
        return NextResponse.json(
          { error: "Password required for this backup" },
          { status: 400 }
        );
      }

      if (!backup.passwordHash) {
        return NextResponse.json(
          { error: "Backup configuration error" },
          { status: 500 }
        );
      }

      const passwordValid = await bcrypt.compare(password, backup.passwordHash);
      if (!passwordValid) {
        return NextResponse.json(
          { error: "Invalid password" },
          { status: 401 }
        );
      }
    }

    // Create a recovery session for the user (24 hour expiry)
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires: expiresAt,
      },
    });

    // Return encrypted mnemonic (client will decrypt it)
    // SECURITY: Minimal information disclosure
    return NextResponse.json({
      success: true,
      backup: {
        id: backup.id,
        walletAddress: backup.walletAddress,
        encryptedMnemonic: backup.encryptedMnemonic,
        backupSource: backup.backupSource,
        recoveryHint: backup.recoveryHint,
        label: backup.label,
      },
      sessionToken, // Return session token for subsequent API calls
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        walletAddress: user.walletAddress,
        smartWalletAddress: user.smartWalletAddress,
        walletVersion: user.walletVersion,
        oauthProvider: user.oauthProvider,
      },
    });
  } catch (error) {
    console.error("[Cloud Backup Retrieve]", error);
    return NextResponse.json(
      { error: "Failed to retrieve cloud backup" },
      { status: 500 }
    );
  }
}
