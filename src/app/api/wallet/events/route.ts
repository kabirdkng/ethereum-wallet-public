/**
 * API Route: /api/wallet/events
 * Server-Sent Events (SSE) endpoint for real-time wallet updates
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registerConnection, unregisterConnection } from "@/lib/sse/broadcast";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.nextUrl.searchParams.get("sessionToken");

    if (!sessionToken) {
      console.error("[SSE Events] Missing session token");
      return new Response("Missing session token", { status: 400 });
    }

        // Validate session
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { User: true },
    });

    if (!session || session.expires < new Date()) {
      console.error("[SSE] Invalid or expired session");
      return new Response("Unauthorized", { status: 401 });
    }

    const walletAddress = session.User.walletAddress?.toLowerCase();
    let smartWalletAddress = session.User.smartWalletAddress?.toLowerCase();
    
    if (!walletAddress) {
      console.error("[SSE Events] No wallet address found for user", session.userId);
      return new Response("No wallet address found", { status: 400 });
    }

    // If smart wallet is missing, try to calculate it
    if (!smartWalletAddress && walletAddress) {
      console.warn("⚠️ Smart wallet missing in SSE events, calculating...");
      try {
        const { getSmartWalletAddress } = await import("@/lib/blockchain/aa/account");
        const calculatedSmartWallet = await getSmartWalletAddress(walletAddress as `0x${string}`);
        
        // Update database with calculated address
        await prisma.user.update({
          where: { id: session.User.id },
          data: { smartWalletAddress: calculatedSmartWallet.toLowerCase() },
        });
        
        smartWalletAddress = calculatedSmartWallet.toLowerCase();
        console.log("✅ Smart wallet calculated and saved:", smartWalletAddress);
      } catch (error) {
        console.error("Failed to calculate smart wallet:", error);
        // Continue without smart wallet if calculation fails
      }
    }

  // Create SSE stream
  const stream = new ReadableStream({
    start(controller) {
      // Store this connection for both EOA and smart wallet (if exists)
      registerConnection(walletAddress, controller);
      if (smartWalletAddress && smartWalletAddress !== walletAddress) {
        registerConnection(smartWalletAddress, controller);
      }

      // Send initial connection message
      const data = JSON.stringify({ type: "connected", timestamp: Date.now() });
      controller.enqueue(`data: ${data}\n\n`);

      console.log(`[SSE Events] ✓ Client connected for EOA ${walletAddress}${smartWalletAddress ? ` and smart wallet ${smartWalletAddress}` : ''}`);

      // Keep-alive ping every 30 seconds
      const pingInterval = setInterval(() => {
        try {
          const ping = JSON.stringify({ type: "ping", timestamp: Date.now() });
          controller.enqueue(`data: ${ping}\n\n`);
        } catch (error) {
          console.log(`[SSE Events] ✗ Error sending ping to ${walletAddress}:`, error);
          clearInterval(pingInterval);
          unregisterConnection(walletAddress);
          if (smartWalletAddress && smartWalletAddress !== walletAddress) {
            unregisterConnection(smartWalletAddress);
          }
        }
      }, 30000);

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        console.log(`[SSE Events] ✗ Client disconnected for wallet ${walletAddress}`);
        clearInterval(pingInterval);
        unregisterConnection(walletAddress);
        if (smartWalletAddress && smartWalletAddress !== walletAddress) {
          unregisterConnection(smartWalletAddress);
        }
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable buffering for Nginx
    },
  });
  } catch (error) {
    console.error("[SSE Events] Error setting up SSE connection:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
