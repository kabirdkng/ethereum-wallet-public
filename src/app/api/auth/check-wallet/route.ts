import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const checkWalletSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = checkWalletSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { walletAddress } = parsed.data;

    // Check if user exists with this wallet address
    // Note: We use findMany and filter in-memory for case-insensitive comparison
    // since walletAddress is nullable and Prisma doesn't support case-insensitive for nullable fields
    const users = await prisma.user.findMany({
      where: {
        walletAddress: {
          not: null,
        },
      },
      select: {
        walletAddress: true,
      },
    });

    const user = users.find(
      (u) => u.walletAddress?.toLowerCase() === walletAddress.toLowerCase()
    );

    return NextResponse.json({
      exists: !!user,
      walletAddress: user?.walletAddress || null,
    });
  } catch (error) {
    console.error("Check wallet error:", error);
    return NextResponse.json(
      { error: "Failed to check wallet" },
      { status: 500 }
    );
  }
}
