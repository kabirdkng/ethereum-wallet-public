import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { auth } from "@/lib/auth";

/**
 * GET /api/auth/oauth-signin
 * Bridge between NextAuth OAuth callback and our custom session system
 * Called by client after successful NextAuth OAuth sign-in
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "No active OAuth session found" },
        { status: 401 }
      );
    }

    // Find user by email (NextAuth already created/updated the user)
    const user = await prisma.user.findUnique({
      where: { email: session.user.email.toLowerCase() },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found after OAuth authentication" },
        { status: 404 }
      );
    }

    // Generate custom session token for our app
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionToken,
        user: {
          id: user.id,
          email: user.email,
          walletAddress: user.walletAddress,
          smartWalletAddress: user.smartWalletAddress,
          walletVersion: user.walletVersion,
          oauthProvider: user.oauthProvider,
          oauthId: user.oauthId,
          profilePicture: user.profilePicture,
        },
      },
    });
  } catch (error) {
    console.error("[API] OAuth sign-in error:", error);
    return NextResponse.json(
      { error: "Failed to complete OAuth sign-in" },
      { status: 500 }
    );
  }
}
