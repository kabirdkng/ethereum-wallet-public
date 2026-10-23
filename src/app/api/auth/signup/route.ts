import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { generateOtp, hashOtp, otpExpiresAt } from "@/lib/otp";
import { sendTwilioVerifyOTP } from "@/lib/twilio";
import { getServerEnv } from "@/config/env";
import { checkRateLimit, getClientIp, createRateLimitError } from "@/lib/rate-limit";

async function sendEmailOtp(to: string, otp: string) {
  const env = getServerEnv();
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    console.info("[Auth] RESEND credentials missing. Logging OTP for development.");
    console.info("[Auth] email OTP for", to, ":", otp);
    return;
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const result = await resend.emails.send({
      from,
      to,
      subject: "Your verification code",
      text: `Your verification code is ${otp}. It expires in 10 minutes.`,
    });
    
    if (result.error) {
      console.error("[Auth] Resend API error:", result.error);
      console.info("[Auth] Falling back to console logging. OTP for", to, ":", otp);
    } else {
      console.info("[Auth] Email OTP sent to", to, "via Resend. ID:", result.data?.id);
    }
  } catch (error) {
    console.error("[Auth] Failed to send email via Resend:", error);
    console.info("[Auth] email OTP for", to, ":", otp);
  }
}

async function sendSmsOtp(to: string, otp: string) {
  const env = getServerEnv();
  const verifyServiceSid = env.TWILIO_VERIFY_SERVICE_SID;

  // Use Twilio Verify if configured
  if (verifyServiceSid) {
    try {
      await sendTwilioVerifyOTP(to);
      console.info("[Auth] Twilio Verify OTP sent to", to);
      return;
    } catch (error) {
      console.error("[Auth] Twilio Verify failed:", error);
      // Fall through to console logging
    }
  }

  // Fallback: Log OTP to console for development
  console.info("[Auth] TWILIO_VERIFY_SERVICE_SID not configured. Logging OTP for development.");
  console.info("[Auth] OTP for", to, ":", otp);
}

const contactSchema = z.discriminatedUnion("contactType", [
  z.object({
    contactType: z.literal("email"),
    contact: z.string().email().transform((value) => value.toLowerCase()),
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
  }),
]);

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = contactSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid contact information provided.",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { contactType, contact } = parsed.data;
    
    // Rate limiting: 5 signups per hour per contact
    const rateLimitResult = await checkRateLimit({
      identifier: `signup:${contact}`,
      limit: 5,
      windowMs: 3600000, // 1 hour
    });

    if (!rateLimitResult.allowed) {
      return createRateLimitError(rateLimitResult.resetAt);
    }

    // Also rate limit by IP to prevent abuse
    const clientIp = getClientIp(request);
    const ipRateLimit = await checkRateLimit({
      identifier: `signup:ip:${clientIp}`,
      limit: 10,
      windowMs: 3600000,
    });

    if (!ipRateLimit.allowed) {
      return createRateLimitError(ipRateLimit.resetAt);
    }
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: contactType === "email" ? { email: contact } : { phone: contact },
    });

    if (existingUser) {
      return NextResponse.json(
        { 
          error: `An account with this ${contactType === "email" ? "email address" : "phone number"} already exists. Please sign in instead.`,
          code: "ACCOUNT_EXISTS"
        },
        { status: 409 }, // 409 Conflict
      );
    }

    const identifier = `${contactType}:${contact}`;

    const otp = generateOtp();
    const hashedOtp = await hashOtp(otp);

    await prisma.verificationToken.deleteMany({ where: { identifier } });

    await prisma.verificationToken.create({
      data: {
        identifier,
        token: hashedOtp,
        expires: otpExpiresAt(),
      },
    });

    if (contactType === "email") {
      await sendEmailOtp(contact, otp);
    } else {
      await sendSmsOtp(contact, otp);
    }

    return NextResponse.json({
      message: "Verification code sent.",
      channel: contactType,
      ...(process.env.NODE_ENV !== "production" ? { devCode: otp } : {}),
    });
  } catch (error) {
    console.error("Failed to create verification token", error);
    return NextResponse.json(
      {
        error: "Unexpected error while requesting verification code.",
      },
      { status: 500 },
    );
  }
}
