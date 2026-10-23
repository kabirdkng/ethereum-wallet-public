import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { encryptPhone } from "@/lib/crypto/recovery";
import { deleteCached, cacheKeys } from "@/lib/cache/redis";

// Validate recovery contact schema
const contactSchema = z.object({
  phone: z.string().min(10),
  name: z.string().optional(),
  share: z.string(), // Plaintext Shamir share (will be stored encrypted with phone hash for privacy)
});

const setupSchema = z.object({
  sessionToken: z.string(),
  walletAddress: z.string(),
  contacts: z.array(contactSchema).min(3).max(5),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = setupSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { sessionToken, walletAddress, contacts } = parsed.data;

    // Normalize wallet address for comparison (addresses are case-insensitive)
    const normalizedWalletAddress = walletAddress.toLowerCase();

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

    // Verify wallet ownership (compare lowercase addresses)
    if (session.User.walletAddress !== normalizedWalletAddress) {
      return NextResponse.json(
        { error: "Wallet address mismatch" },
        { status: 403 }
      );
    }

    // Delete existing recovery contacts if any (allow reset/edit)
    const existingContacts = await prisma.recoveryContact.findMany({
      where: { userId: session.userId },
    });

    if (existingContacts.length > 0) {
      await prisma.recoveryContact.deleteMany({
        where: { userId: session.userId },
      });
    }

    // Prepare recovery contacts with shares
    // Shares are stored as-is (plaintext shares from Shamir split)
    // They will be encrypted with recovery codes when user initiates recovery
    const recoveryContacts = await Promise.all(
      contacts.map(async (contact, index) => {
        const encryptedPhone = await encryptPhone(contact.phone);

        return {
          userId: session.userId,
          contactPhone: encryptedPhone,
          contactName: contact.name || null,
          shareIndex: index + 1,
          share: contact.share,
        };
      })
    );

    // Save all contacts in transaction
    await prisma.recoveryContact.createMany({
      data: recoveryContacts,
    });

    // Invalidate recovery contacts cache
    const cacheKey = cacheKeys.recoveryContacts(session.userId);
    await deleteCached(cacheKey);
    console.log(`[RecoveryContactsAPI] Cache invalidated for user ${session.userId}`);

    const threshold = Math.ceil(contacts.length * 0.6);

    return NextResponse.json({
      success: true,
      message: "Recovery setup complete. Contacts will receive SMS codes.",
      contactCount: contacts.length,
      threshold,
    });
  } catch (error) {
    console.error("[Recovery Setup]", error);
    return NextResponse.json(
      { error: "Failed to setup recovery" },
      { status: 500 }
    );
  }
}
