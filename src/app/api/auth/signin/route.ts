import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp, createRateLimitError, resetRateLimit } from "@/lib/rate-limit";

const signinSchema = z.discriminatedUnion("contactType", [
  z.object({
    contactType: z.literal("email"),
    contact: z.string().email().transform((value) => value.toLowerCase()),
    pin: z.string().length(6, "PIN must be exactly 6 digits"),
  }),
  z.object({
    contactType: z.literal("phone"),
    contact: z
      .string()
      .min(5, "Phone number is too short.")
      .max(20, "Phone number is too long.")
      .transform((value) => value.replace(/\s+/g, ""))
      .refine((value) => /^\+?[0-9]{5,15}$/.test(value), {
        message: "Phone number must contain only digits and an optional leading + sign.",
      }),
    pin: z.string().length(6, "PIN must be exactly 6 digits"),
  }),
]);

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = signinSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid sign-in credentials.",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { contactType, contact, pin } = parsed.data;

    // Rate limiting: 10 signin attempts per 15 minutes per contact
    const rateLimitResult = await checkRateLimit({
      identifier: `signin:${contact}`,
      limit: 10,
      windowMs: 900000, // 15 minutes
    });

    if (!rateLimitResult.allowed) {
      return createRateLimitError(rateLimitResult.resetAt);
    }

    // IP-based rate limiting
    const clientIp = getClientIp(request);
    const ipRateLimit = await checkRateLimit({
      identifier: `signin:ip:${clientIp}`,
      limit: 20,
      windowMs: 900000,
    });

    if (!ipRateLimit.allowed) {
      return createRateLimitError(ipRateLimit.resetAt);
    }

    // Find user by email or phone
    const user = await prisma.user.findUnique({
      where: contactType === "email" ? { email: contact } : { phone: contact },
    });

    if (!user) {
      return NextResponse.json(
        { 
          error: `No account found with this ${contactType === "email" ? "email address" : "phone number"}. Please sign up to create a new account.`,
          code: "ACCOUNT_NOT_FOUND"
        },
        { status: 404 },
      );
    }

    if (!user.pinHash) {
      return NextResponse.json(
        { 
          error: "PIN not set for this account. Please complete wallet setup to continue.",
          code: "PIN_NOT_SET"
        },
        { status: 400 },
      );
    }

    // Verify PIN
    const isPinValid = await bcrypt.compare(pin, user.pinHash);

    if (!isPinValid) {
      return NextResponse.json(
        { 
          error: "Incorrect PIN. Please try again or reset your wallet if you've forgotten it.",
          code: "INVALID_PIN"
        },
        { status: 401 },
      );
    }

    // Create new session
    const sessionToken = crypto.randomUUID();
    const expires = new Date();
    expires.setDate(expires.getDate() + 30); // 30 days

    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires,
      },
    });

    // Clear rate limits on successful signin
    await resetRateLimit(`signin:${contact}`);

    return NextResponse.json({
      success: true,
      sessionToken,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        walletAddress: user.walletAddress,
      },
    });
  } catch (error) {
    console.error("[Auth] Sign-in error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during sign-in." },
      { status: 500 },
    );
  }
}
