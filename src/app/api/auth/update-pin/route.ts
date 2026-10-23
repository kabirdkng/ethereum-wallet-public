import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const updatePinSchema = z.object({
  sessionToken: z.string().min(1, "Session token required"),
  currentPin: z.string().length(6, "Current PIN must be exactly 6 digits"),
  newPin: z.string().length(6, "New PIN must be exactly 6 digits"),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = updatePinSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { sessionToken, currentPin, newPin } = parsed.data;

    // Validate session
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { User: true },
    });

    if (!session || session.expires < new Date()) {
      return NextResponse.json(
        { error: "Invalid or expired session." },
        { status: 401 }
      );
    }

    const user = session.User;

    if (!user.pinHash) {
      return NextResponse.json(
        { error: "No PIN set for this account." },
        { status: 400 }
      );
    }

    // Verify current PIN
    const isCurrentPinValid = await bcrypt.compare(currentPin, user.pinHash);

    if (!isCurrentPinValid) {
      return NextResponse.json(
        { error: "Current PIN is incorrect." },
        { status: 401 }
      );
    }

    // Prevent reusing the same PIN
    const isSamePin = await bcrypt.compare(newPin, user.pinHash);
    if (isSamePin) {
      return NextResponse.json(
        { error: "New PIN must be different from current PIN." },
        { status: 400 }
      );
    }

    // Hash new PIN
    const newPinHash = await bcrypt.hash(newPin, 12);

    // Update user
    await prisma.user.update({
      where: { id: user.id },
      data: { pinHash: newPinHash },
    });

    return NextResponse.json({ 
      success: true,
      message: "PIN updated successfully. Please use your new PIN for future transactions."
    });
  } catch (error) {
    console.error("[Auth] Update PIN error:", error);
    return NextResponse.json(
      { error: "Failed to update PIN." },
      { status: 500 }
    );
  }
}
