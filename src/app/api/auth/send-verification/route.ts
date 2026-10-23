import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { getServerEnv } from "@/config/env";

const sendVerificationSchema = z.object({
  sessionToken: z.string(),
});

/**
 * Send Email Verification
 * 
 * Sends a verification email with a token to confirm email ownership
 */
export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = sendVerificationSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { sessionToken } = parsed.data;

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

    if (!session.User.email) {
      return NextResponse.json(
        { error: "No email address found for this account" },
        { status: 400 }
      );
    }

    if (session.User.emailVerified) {
      return NextResponse.json(
        { success: true, message: "Email already verified" },
        { status: 200 }
      );
    }

    // Generate verification token
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store verification token
    await prisma.verificationToken.upsert({
      where: {
        identifier_token: {
          identifier: session.User.email,
          token,
        },
      },
      create: {
        identifier: session.User.email,
        token,
        expires,
      },
      update: {
        token,
        expires,
      },
    });

    const env = getServerEnv();

    // Send verification email
    if (env.RESEND_API_KEY) {
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(env.RESEND_API_KEY);

        const verificationUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/auth/verify-email?token=${token}`;

        await resend.emails.send({
          from: env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
          to: session.User.email,
          subject: "Verify your email address",
          html: `
            <h2>Verify Your Email</h2>
            <p>Please click the link below to verify your email address:</p>
            <a href="${verificationUrl}">${verificationUrl}</a>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't request this, you can safely ignore this email.</p>
          `,
        });

        console.log("[Email Verification] Sent to:", session.User.email);
      } catch (emailError) {
        console.error("[Email Verification] Failed to send email:", emailError);
        // Continue - we'll show the token in development
      }
    }

    // In development, also return the token
    const isDev = process.env.NODE_ENV === "development";
    
    return NextResponse.json({
      success: true,
      message: "Verification email sent. Please check your inbox.",
      ...(isDev && { devToken: token }), // Only in development
    });
  } catch (error) {
    console.error("[Email Verification]", error);
    return NextResponse.json(
      { error: "Failed to send verification email" },
      { status: 500 }
    );
  }
}
