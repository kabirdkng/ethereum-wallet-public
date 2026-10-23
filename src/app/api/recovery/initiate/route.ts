import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateRecoveryCode, decryptPhone } from "@/lib/crypto/recovery";
import { sendTwilioSMS } from "@/lib/twilio";
import { checkRateLimit, getClientIp, createRateLimitError } from "@/lib/rate-limit";

const initiateSchema = z.discriminatedUnion("contactType", [
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
    const parsed = initiateSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { contactType, contact } = parsed.data;

    // Rate limiting: 3 recovery attempts per 24 hours per contact
    const rateLimitResult = await checkRateLimit({
      identifier: `recovery:${contact}`,
      limit: 3,
      windowMs: 86400000, // 24 hours
    });

    if (!rateLimitResult.allowed) {
      return createRateLimitError(rateLimitResult.resetAt);
    }

    // IP-based rate limiting (5 per day)
    const clientIp = getClientIp(request);
    const ipRateLimit = await checkRateLimit({
      identifier: `recovery:ip:${clientIp}`,
      limit: 5,
      windowMs: 86400000,
    });

    if (!ipRateLimit.allowed) {
      return createRateLimitError(ipRateLimit.resetAt);
    }

    // Find user by email or phone
    const user = await prisma.user.findFirst({
      where: contactType === "email" ? { email: contact } : { phone: contact },
      include: {
        RecoveryContact: true,
      },
    });

    if (!user) {
      // Don't reveal if user exists
      return NextResponse.json(
        { error: "If this account exists, recovery instructions will be sent" },
        { status: 200 }
      );
    }

    if (user.RecoveryContact.length === 0) {
      return NextResponse.json(
        { error: "No recovery options configured for this account" },
        { status: 400 }
      );
    }

    // Check for existing active recovery request
    const existingRequest = await prisma.recoveryRequest.findFirst({
      where: {
        userId: user.id,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });

    if (existingRequest) {
      // Return the existing request instead of erroring
      const totalContacts = user.RecoveryContact.length;
      const requiredShares = existingRequest.requiredShares;

      // Create a recovery session for the user (24 hour expiry)
      const sessionToken = crypto.randomUUID();
      const sessionExpiresAt = new Date();
      sessionExpiresAt.setHours(sessionExpiresAt.getHours() + 24);

      await prisma.session.create({
        data: {
          sessionToken,
          userId: user.id,
          expires: sessionExpiresAt,
        },
      });

      return NextResponse.json({
        success: true,
        recoveryRequestId: existingRequest.id,
        requiredShares,
        totalContacts,
        expiresAt: existingRequest.expiresAt.toISOString(),
        message: "Using existing recovery request. Please collect codes from your trusted contacts.",
        isExisting: true,
        sessionToken, // Return session token for subsequent API calls
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          walletAddress: user.walletAddress,
        },
      });
    }

    // Calculate required shares (60% threshold)
    const totalContacts = user.RecoveryContact.length;
    const requiredShares = Math.ceil(totalContacts * 0.6);

    // Create recovery request (expires in 24 hours)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const recoveryRequest = await prisma.recoveryRequest.create({
      data: {
        userId: user.id,
        requiredShares,
        totalShares: totalContacts,
        status: "PENDING",
        expiresAt,
      },
    });

    // Generate recovery codes for each contact and store hashed
    const recoveryCodesData = await Promise.all(
      user.RecoveryContact.map(async (contact) => {
        const recoveryCode = generateRecoveryCode(); // e.g., "ABC-DEF-123"
        // Normalize before hashing (uppercase, remove all non-alphanumeric) to match verification
        const normalizedCode = recoveryCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        const codeHash = await bcrypt.hash(normalizedCode, 10);
        
        
        let decryptedPhone: string;
        try {
          decryptedPhone = await decryptPhone(contact.contactPhone);
        } catch (decryptError) {
          console.error(`[Recovery Initiate] Failed to decrypt phone for contact ${contact.shareIndex}:`, decryptError);
          throw new Error(`Failed to decrypt phone number for contact ${contact.shareIndex}`);
        }
        
        // Store hashed code in database
        await prisma.recoveryCode.create({
          data: {
            recoveryRequestId: recoveryRequest.id,
            shareIndex: contact.shareIndex,
            codeHash,
          },
        });
        
        return {
          shareIndex: contact.shareIndex,
          contactName: contact.contactName || `Contact ${contact.shareIndex}`,
          contactPhone: decryptedPhone,
          recoveryCode, // Send original formatted code (with dashes)
        };
      })
    );

    // Send recovery codes via SMS to contacts
    for (const codeData of recoveryCodesData) {
      const message = `Your friend needs to recover their wallet. Please provide them with this recovery code: ${codeData.recoveryCode}`;
      
      try {
        await sendTwilioSMS(codeData.contactPhone, message);
      } catch (error) {
        console.error(`[Recovery Initiate] Failed to send SMS to ${codeData.contactPhone}:`, error);
        // Continue with other contacts even if one fails
      }
    }

    // Create a recovery session for the user (24 hour expiry)
    const sessionToken = crypto.randomUUID();
    const sessionExpiresAt = new Date();
    sessionExpiresAt.setHours(sessionExpiresAt.getHours() + 24);

    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires: sessionExpiresAt,
      },
    });

    return NextResponse.json({
      success: true,
      recoveryRequestId: recoveryRequest.id,
      requiredShares,
      totalContacts,
      expiresAt: expiresAt.toISOString(),
      message: "Recovery codes have been sent to your trusted contacts. Please collect the codes from them.",
      sessionToken, // Return session token for subsequent API calls
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        walletAddress: user.walletAddress,
      },
    });
  } catch (error) {
    console.error("[Recovery Initiate]", error);
    return NextResponse.json(
      { error: "Failed to initiate recovery" },
      { status: 500 }
    );
  }
}
