/**
 * Authenticated Fetch Utility
 * 
 * Wraps the native fetch API to automatically handle session invalidation.
 * When a 401 Unauthorized response is received, it automatically logs out the user
 * by clearing the session from the auth store.
 * 
 * This prevents users from seeing stale data or broken UI when their session expires.
 */

import { useAuthStore } from "@/stores/auth-store";

interface AuthenticatedFetchOptions extends RequestInit {
  /** If true, skips automatic logout on 401 responses */
  skipAutoLogout?: boolean;
}

/**
 * Fetch wrapper that automatically handles session invalidation
 * 
 * @param input - URL or Request object
 * @param init - Fetch options with optional skipAutoLogout flag
 * @returns Promise<Response>
 * 
 * @example
 * ```typescript
 * const response = await authenticatedFetch("/api/wallet/balance", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({ sessionToken, walletAddress }),
 * });
 * ```
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: AuthenticatedFetchOptions
): Promise<Response> {
  const { skipAutoLogout, ...fetchOptions } = init || {};

  try {
    const response = await fetch(input, fetchOptions);

    // Auto-logout on 401 Unauthorized (invalid/expired session)
    if (response.status === 401 && !skipAutoLogout) {
      console.warn(
        "[Auth] Session invalid or expired. Auto-logging out user.",
        { url: input.toString() }
      );
      
      // Clear session from auth store - this will trigger redirect to login
      useAuthStore.getState().clearSession();
      
      // Optional: Show user-friendly message
      // You could integrate with a toast library here if desired
      if (typeof window !== "undefined") {
        console.info("[Auth] Redirecting to login due to expired session");
      }
    }

    return response;
  } catch (error) {
    // Network errors, parsing errors, etc. - don't trigger auto-logout
    console.error("[Auth] Fetch error:", error);
    throw error;
  }
}

/**
 * Helper to create Authorization header with Bearer token
 * 
 * @example
 * ```typescript
 * const response = await authenticatedFetch("/api/contacts", {
 *   method: "GET",
 *   headers: createAuthHeader(sessionToken),
 * });
 * ```
 */
export function createAuthHeader(sessionToken: string): HeadersInit {
  return {
    "Authorization": `Bearer ${sessionToken}`,
  };
}

/**
 * Helper to create both Authorization and Content-Type headers
 * 
 * @example
 * ```typescript
 * const response = await authenticatedFetch("/api/wallet/balance", {
 *   method: "POST",
 *   headers: createAuthJsonHeaders(sessionToken),
 *   body: JSON.stringify({ walletAddress }),
 * });
 * ```
 */
export function createAuthJsonHeaders(sessionToken: string): HeadersInit {
  return {
    "Authorization": `Bearer ${sessionToken}`,
    "Content-Type": "application/json",
  };
}
