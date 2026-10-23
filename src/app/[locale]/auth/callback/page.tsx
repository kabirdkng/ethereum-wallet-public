"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import toast from "react-hot-toast";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSession } = useAuthStore();
  const [debugInfo, setDebugInfo] = useState<string>("");

  useEffect(() => {
    const completeOAuthSignIn = async () => {
      try {
        // Check for error from NextAuth
        const error = searchParams.get("error");
        if (error) {
          console.error("[Callback] NextAuth error:", error);
          
          let errorMessage = "Authentication failed. Please try again.";
          if (error === "AccessDenied") {
            errorMessage = "This email is already registered. Please sign in with your email and PIN.";
          } else if (error === "Configuration") {
            errorMessage = "OAuth configuration error. Please contact support.";
          }
          
          toast.error(errorMessage);
          setDebugInfo(`Error: ${errorMessage}`);
          
          setTimeout(() => {
            router.push("/onboarding");
          }, 2000);
          return;
        }

        console.log("[Callback] Starting OAuth sign-in completion...");
        setDebugInfo("Fetching session...");

        // Call our custom endpoint to complete sign-in
        const response = await fetch("/api/auth/oauth-signin");
        const result = await response.json();

        console.log("[Callback] API response:", { status: response.status, result });
        setDebugInfo(`API response: ${response.status}`);

        if (!response.ok) {
          console.error("[Callback] API error:", result);
          toast.error(result.error || "Failed to complete sign-in");
          throw new Error(result.error || "Failed to complete OAuth sign-in");
        }

        console.log("[Callback] Setting session with user:", result.data.user);
        setDebugInfo("Setting session...");

        // Store session token and user data
        setSession(result.data.sessionToken, result.data.user);
        
        toast.success("Successfully signed in!");

        console.log("[Callback] Session set, redirecting...");
        setDebugInfo("Redirecting...");

        // Redirect based on wallet status
        if (!result.data.user.walletAddress) {
          console.log("[Callback] No wallet, redirecting to onboarding");
          router.push("/onboarding");
        } else {
          console.log("[Callback] Has wallet, redirecting to dashboard");
          router.push("/dashboard");
        }
      } catch (error) {
        console.error("[Callback] OAuth callback error:", error);
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        setDebugInfo(`Error: ${errorMsg}`);
        
        if (!searchParams.get("error")) {
          toast.error("Failed to complete sign-in. Please try again.");
        }
        
        // Redirect to onboarding with error after a delay
        setTimeout(() => {
          router.push("/onboarding");
        }, 2000);
      }
    };

    completeOAuthSignIn();
  }, [router, setSession, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600">Completing sign-in...</p>
        {debugInfo && (
          <p className="mt-2 text-sm text-gray-500">{debugInfo}</p>
        )}
      </div>
    </div>
  );
}
