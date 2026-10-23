import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSmartWalletAddress } from "@/lib/blockchain/aa/account";
import type { Address } from "viem";

const syncSchema = z.object({
  sessionToken: z.string().min(10, "Session token is required."),
});

/**
 * Sync smart wallet address - calculates and updates DB if missing
 * This endpoint can be called to recover missing smart wallet addresses
 */
export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = syncSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request payload.",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { sessionToken } = parsed.data;

    // Validate session
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: {
        User: {
          select: {
            id: true,
            walletAddress: true,
            smartWalletAddress: true,
          },
        },
      },
    });

    if (!session || session.expires < new Date()) {
      return NextResponse.json(
        {
          error: "Session expired or missing. Please log in again.",
        },
        { status: 401 },
      );
    }

    const user = session.User;

    if (!user.walletAddress) {
      return NextResponse.json(
        {
          error: "User does not have a wallet address.",
        },
        { status: 400 },
      );
    }

    // If smart wallet already exists, return it
    if (user.smartWalletAddress) {
      return NextResponse.json({
        success: true,
        smartWalletAddress: user.smartWalletAddress,
        source: "existing",
        message: "Smart wallet address already exists in database.",
      });
    }

    // Calculate smart wallet address
    console.log("Calculating smart wallet for user:", user.id);
    let calculatedAddress: Address;
    
    try {
      calculatedAddress = await getSmartWalletAddress(user.walletAddress as Address);
      console.log("✅ Smart wallet calculated:", calculatedAddress);
    } catch (error) {
      console.error("Failed to calculate smart wallet:", error);
      return NextResponse.json(
        {
          error: "Failed to calculate smart wallet address. This may be due to network issues.",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      );
    }

    // Update database
    try {
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { smartWalletAddress: calculatedAddress.toLowerCase() },
        select: {
          id: true,
          smartWalletAddress: true,
          walletAddress: true,
        },
      });

      console.log("✅ Smart wallet saved to database:", updatedUser.smartWalletAddress);

      return NextResponse.json({
        success: true,
        smartWalletAddress: updatedUser.smartWalletAddress,
        source: "calculated",
        message: "Smart wallet address calculated and saved successfully.",
        user: {
          id: updatedUser.id,
          walletAddress: updatedUser.walletAddress,
          smartWalletAddress: updatedUser.smartWalletAddress,
        },
      });
    } catch (updateError) {
      console.error("Failed to save smart wallet to database:", updateError);
      return NextResponse.json(
        {
          error: "Smart wallet calculated but failed to save to database.",
          smartWalletAddress: calculatedAddress,
          details: updateError instanceof Error ? updateError.message : "Unknown error",
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("Error syncing smart wallet:", error);
    return NextResponse.json(
      {
        error: "Unexpected error while syncing smart wallet.",
      },
      { status: 500 },
    );
  }
}
