import { NextResponse } from "next/server";
import { z } from "zod";
import { mnemonicToAccount } from "viem/accounts";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { reconstructMnemonic } from "@/lib/crypto/recovery";

const verifySchema = z.object({
  recoveryRequestId: z.string(),
  recoveryCodes: z.array(z.object({
    code: z.string(),
    // shareIndex is now optional - we'll match codes against all stored hashes
    shareIndex: z.number().int().min(1).optional(),
  })).min(1),
  newPin: z.string().min(6).max(20),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    
    const parsed = verifySchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { recoveryRequestId, recoveryCodes } = parsed.data;

    // Find recovery request
    const recoveryRequest = await prisma.recoveryRequest.findUnique({
      where: { id: recoveryRequestId },
      include: {
        User: {
          include: { RecoveryContact: true },
        },
        RecoveryCode: true, // Include recovery codes
      },
    });

    if (!recoveryRequest) {
      return NextResponse.json(
        { error: "Recovery request not found" },
        { status: 404 }
      );
    }

    if (recoveryRequest.status !== "PENDING") {
      return NextResponse.json(
        { error: "Recovery request already processed" },
        { status: 400 }
      );
    }

    if (recoveryRequest.expiresAt < new Date()) {
      await prisma.recoveryRequest.update({
        where: { id: recoveryRequestId },
        data: { status: "EXPIRED" },
      });

      return NextResponse.json(
        { error: "Recovery request expired. Please initiate again." },
        { status: 410 }
      );
    }

    // Verify we have enough shares
    if (recoveryCodes.length < recoveryRequest.requiredShares) {
      return NextResponse.json(
        {
          error: `Need ${recoveryRequest.requiredShares} recovery codes, got ${recoveryCodes.length}`,
        },
        { status: 400 }
      );
    }

    // Verify codes and collect shares - match each code against all stored codes
    const sharesForReconstruction: string[] = [];
    const usedShareIndices = new Set<number>();

    for (const { code } of recoveryCodes) {
      // Normalize code to uppercase and remove all non-alphanumeric characters
      const normalizedCode = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      
      // Try to match this code against all stored codes
      let matchedShare: string | null = null;
      
      for (const storedCode of recoveryRequest.RecoveryCode) {
        // Skip if we already used this share
        if (usedShareIndices.has(storedCode.shareIndex)) {
          continue;
        }
        
        const isValid = await bcrypt.compare(normalizedCode, storedCode.codeHash);
        if (isValid) {
          
          // Find the contact with this share
          const contact = recoveryRequest.User.RecoveryContact.find(
            c => c.shareIndex === storedCode.shareIndex
          );
          
          if (!contact || !contact.share) {
            return NextResponse.json(
              { error: `Share ${storedCode.shareIndex} data missing. Recovery setup may be incomplete.` },
              { status: 400 }
            );
          }
          
          matchedShare = contact.share;
          usedShareIndices.add(storedCode.shareIndex);
          break;
        }
      }
      
      if (!matchedShare) {
        return NextResponse.json(
          { error: `Invalid recovery code: "${code}". Please check and try again.` },
          { status: 400 }
        );
      }
      
      sharesForReconstruction.push(matchedShare);
    }
    

    // Reconstruct mnemonic
    let mnemonic: string;
    try {
      mnemonic = reconstructMnemonic(sharesForReconstruction);
    } catch (error) {
      console.error("[Recovery] Failed to reconstruct mnemonic", error);
      return NextResponse.json(
        { error: "Failed to reconstruct wallet. Invalid shares provided." },
        { status: 400 }
      );
    }

    // Mark recovery as complete
    await prisma.recoveryRequest.update({
      where: { id: recoveryRequestId },
      data: { 
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    // Derive wallet address from mnemonic
    let walletAddress: string;
    try {
      const account = mnemonicToAccount(mnemonic);
      walletAddress = account.address;
    } catch (error) {
      console.error("[Recovery Verify] Failed to derive wallet address:", error);
      throw error;
    }

    // Update user's wallet address if not set
    if (!recoveryRequest.User.walletAddress) {
      await prisma.user.update({
        where: { id: recoveryRequest.User.id },
        data: { walletAddress },
      });
    } else {
    }

    // Return mnemonic to client (will be encrypted with new PIN client-side)
    // This is secure because it's over HTTPS and immediately encrypted by client
    return NextResponse.json({
      success: true,
      mnemonic, // Client will encrypt with newPin immediately
      walletAddress,
      message: "Wallet recovered successfully. Please save your new PIN securely.",
    });
  } catch (error) {
    console.error("[Recovery Verify] Unexpected error:", error);
    if (error instanceof Error) {
      console.error("[Recovery Verify] Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
    }
    return NextResponse.json(
      { error: "Failed to verify recovery" },
      { status: 500 }
    );
  }
}
