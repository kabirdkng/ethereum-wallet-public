import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { verifyOtp } from "@/lib/otp";
import { verifyTwilioOTP } from "@/lib/twilio";
import { checkRateLimit, getClientIp, createRateLimitError, resetRateLimit } from "@/lib/rate-limit";

const verifySchema = z.discriminatedUnion("contactType", [
  z.object({
    contactType: z.literal("email"),
    contact: z.string().email().transform((value) => value.toLowerCase()),
    code: z.string().regex(/^\d{6}$/),
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
    code: z.string().regex(/^\d{6}$/),
  }),
]);

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = verifySchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid verification payload.",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { contactType, contact, code } = parsed.data;
    const identifier = `${contactType}:${contact}`;

    // Rate limiting: 10 verification attempts per 10 minutes
    const rateLimitResult = await checkRateLimit({
      identifier: `verify:${contact}`,
      limit: 10,
      windowMs: 600000, // 10 minutes
    });

    if (!rateLimitResult.allowed) {
      return createRateLimitError(rateLimitResult.resetAt);
    }

    // IP-based rate limiting
    const clientIp = getClientIp(request);
    const ipRateLimit = await checkRateLimit({
      identifier: `verify:ip:${clientIp}`,
      limit: 20,
      windowMs: 600000,
    });

    if (!ipRateLimit.allowed) {
      return createRateLimitError(ipRateLimit.resetAt);
    }

    const record = await prisma.verificationToken.findFirst({
      where: { identifier },
      orderBy: { expires: "desc" },
    });

    if (!record) {
      return NextResponse.json(
        {
          error: "No verification request found for this contact. Please request a new code.",
        },
        { status: 404 },
      );
    }

    if (record.expires < new Date()) {
      await prisma.verificationToken.delete({
        where: {
          identifier_token: {
            identifier: record.identifier,
            token: record.token,
          },
        },
      });

      return NextResponse.json(
        {
          error: "Verification code expired. Please request a new code.",
        },
        { status: 400 },
      );
    }

    let isValid = false;

    // Use Twilio Verify for phone verification if configured
    if (contactType === "phone" && process.env.TWILIO_VERIFY_SERVICE_SID) {
      isValid = await verifyTwilioOTP(contact, code);
      console.info("[Auth] Twilio Verify check:", isValid ? "approved" : "denied");
    } else {
      // Fall back to database OTP verification
      isValid = await verifyOtp(code, record.token);
    }

    if (!isValid) {
      return NextResponse.json(
        {
          error: "Invalid verification code.",
        },
        { status: 400 },
      );
    }

    await prisma.verificationToken.delete({
      where: {
        identifier_token: {
          identifier: record.identifier,
          token: record.token,
        },
      },
    });

    const contactWhere =
      contactType === "email"
        ? { email: contact }
        : {
            phone: contact,
          };

    const user = await prisma.user.upsert({
      where: contactWhere,
      update: {},
      create: contactWhere,
    });

    const sessionToken = randomUUID();
    const sessionExpires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires: sessionExpires,
      },
    });

    // Clear rate limits on successful verification
    await resetRateLimit(`verify:${contact}`);
    await resetRateLimit(`signup:${contact}`);

    return NextResponse.json({
      success: true,
      verified: true,
      sessionToken,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        walletAddress: user.walletAddress,
        smartWalletAddress: user.smartWalletAddress,
        walletVersion: user.walletVersion,
      },
    });
  } catch (error) {
    console.error("Failed to verify OTP", error);
    return NextResponse.json(
      {
        error: "Unexpected error while verifying code.",
      },
      { status: 500 },
    );
  }
}
