import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";

const recoverySessionSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = recoverySessionSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { walletAddress } = parsed.data;

    // Find user with this wallet address (case-insensitive)
    const users = await prisma.user.findMany({
      where: {
        walletAddress: {
          not: null,
        },
      },
    });

    const user = users.find(
      (u) => u.walletAddress?.toLowerCase() === walletAddress.toLowerCase()
    );

    if (!user) {
      return NextResponse.json(
        { error: "No account found with this wallet address" },
        { status: 404 }
      );
    }

    // Create a recovery session
    const sessionToken = nanoid(32);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry

    const session = await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires: expiresAt,
      },
    });

    return NextResponse.json({
      sessionToken: session.sessionToken,
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
    console.error("Create recovery session error:", error);
    return NextResponse.json(
      { error: "Failed to create recovery session" },
      { status: 500 }
    );
  }
}
