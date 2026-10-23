import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { isAAEnabled } from "@/lib/blockchain/aa/contracts";

const registerSchema = z.object({
  sessionToken: z.string().min(10, "Session token is required."),
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/u, "Address must be a valid Ethereum address."),
  smartWalletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/u, "Smart wallet address must be a valid Ethereum address."),
  publicKey: z
    .string()
    .regex(/^0x[a-fA-F0-9]+$/u, "Public key must be a hex string.")
    .optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = registerSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid wallet payload submitted.",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { sessionToken, address, smartWalletAddress } = parsed.data;
    
    // CRITICAL: Validate that smart wallet address is provided when AA is enabled
    if (isAAEnabled() && !smartWalletAddress) {
      return NextResponse.json(
        {
          error: "Smart wallet address is required. Account Abstraction is enabled.",
        },
        { status: 400 },
      );
    }
    
    // Validate that EOA and smart wallet are different addresses
    if (smartWalletAddress && address.toLowerCase() === smartWalletAddress.toLowerCase()) {
      return NextResponse.json(
        {
          error: "Smart wallet address cannot be the same as EOA address.",
        },
        { status: 400 },
      );
    }

    const session = await prisma.session.findUnique({ where: { sessionToken } });

    if (!session || session.expires < new Date()) {
      return NextResponse.json(
        {
          error: "Session expired or missing. Please restart onboarding.",
        },
        { status: 401 },
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: session.userId },
      data: {
        walletAddress: address.toLowerCase(),
        smartWalletAddress: smartWalletAddress.toLowerCase(),
        walletVersion: "AA",
      },
    });

    return NextResponse.json({
      success: true,
      registered: true,
      address: address.toLowerCase(),
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
    console.error("Failed to register wallet address", error);
    return NextResponse.json(
      {
        error: "Unexpected error while registering wallet.",
      },
      { status: 500 },
    );
  }
}
