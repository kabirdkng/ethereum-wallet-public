import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";

const setPinSchema = z.object({
  sessionToken: z.string(),
  pin: z.string().length(6, "PIN must be exactly 6 digits"),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = setPinSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request data.",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { sessionToken, pin } = parsed.data;

    // Validate session
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { User: true },
    });

    if (!session || session.expires < new Date()) {
      return NextResponse.json(
        { error: "Invalid or expired session." },
        { status: 401 },
      );
    }

    // Hash PIN
    const pinHash = await bcrypt.hash(pin, 10);

    // Update user with PIN hash
    const updatedUser = await prisma.user.update({
      where: { id: session.userId },
      data: { pinHash },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        phone: updatedUser.phone,
        walletAddress: updatedUser.walletAddress,
        smartWalletAddress: updatedUser.smartWalletAddress,
        walletVersion: updatedUser.walletVersion,
      },
    });
  } catch (error) {
    console.error("[Auth] Set PIN error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while setting PIN." },
      { status: 500 },
    );
  }
}
