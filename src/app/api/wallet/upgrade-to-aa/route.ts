/**
 * API route for upgrading existing EOA wallets to Account Abstraction
 * Updates user record with smart wallet address
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const upgradeSchema = z.object({
  userId: z.string().uuid(),
  smartWalletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = upgradeSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { userId, smartWalletAddress } = parsed.data;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, walletAddress: true, smartWalletAddress: true, walletVersion: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Update user with smart wallet address
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        smartWalletAddress,
        walletVersion: "AA", // Upgrade to Account Abstraction
      },
      select: {
        id: true,
        walletAddress: true,
        smartWalletAddress: true,
        walletVersion: true,
      },
    });

    console.log("User wallet upgraded to AA:", {
      userId,
      eoaAddress: updatedUser.walletAddress,
      smartWalletAddress: updatedUser.smartWalletAddress,
    });

    return NextResponse.json({
      success: true,
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error upgrading wallet:", error);
    return NextResponse.json({ error: "Failed to upgrade wallet" }, { status: 500 });
  }
}
