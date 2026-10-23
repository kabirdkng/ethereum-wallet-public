import { useState, useCallback, useEffect, useRef } from "react";
import { useRecoveryContactsStore } from "@/stores/recovery-contacts-store";
import { authenticatedFetch, createAuthHeader } from "@/lib/api/fetch-with-auth";

export function useRecoveryContacts(sessionToken?: string | null) {
  const { 
    contacts, 
    loading,
    error: storeError,
    fetched, 
    setContacts, 
    setLoading,
    setError: setStoreError,
    removeContact: removeFromStore 
  } = useRecoveryContactsStore();
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const fetchContacts = useCallback(
    async (force = false) => {
      // Skip if already fetched and not forcing refresh
      if (fetched && !force) {
        return;
      }
      
      // Skip if already fetching
      if (fetchingRef.current) {
        return;
      }

      if (!sessionToken) {
        setError("Not authenticated");
        setStoreError("Not authenticated");
        return;
      }

      try {
        fetchingRef.current = true;
        setLoading(true);
        setError(null);
        setStoreError(null);

        const url = `/api/recovery/contacts${force ? "?refresh=true" : ""}`;
        const response = await authenticatedFetch(url, {
          method: "GET",
          headers: createAuthHeader(sessionToken),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch recovery contacts");
        }

        const data = await response.json();
        setContacts(data.contacts || []);
      } catch (err) {
        console.error("Error fetching recovery contacts:", err);
        const errorMsg = err instanceof Error ? err.message : "Failed to fetch recovery contacts";
        setError(errorMsg);
        setStoreError(errorMsg);
      } finally {
        setLoading(false);
        fetchingRef.current = false;
      }
    },
    [sessionToken, fetched, setContacts, setLoading, setStoreError]
  );

  // Auto-fetch on mount if not already fetched
  useEffect(() => {
    if (sessionToken && !fetched && !fetchingRef.current) {
      fetchContacts(false);
    }
  }, [sessionToken, fetched, fetchContacts]);

  const removeContact = useCallback(
    async (contactId: string) => {
      if (!sessionToken) {
        setError("Not authenticated");
        setStoreError("Not authenticated");
        return false;
      }

      try {
        setLoading(true);
        setError(null);
        setStoreError(null);

        const response = await authenticatedFetch("/api/recovery/contacts/remove", {
          method: "POST",
          headers: {
            ...createAuthHeader(sessionToken),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ contactId }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to remove contact");
        }

        // Update store immediately for instant UI update
        removeFromStore(contactId);
        return true;
      } catch (err) {
        console.error("Error removing recovery contact:", err);
        const errorMsg = err instanceof Error ? err.message : "Failed to remove contact";
        setError(errorMsg);
        setStoreError(errorMsg);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [sessionToken, removeFromStore, setLoading, setStoreError]
  );

  return {
    contacts,
    loading,
    error: error || storeError,
    fetched,
    fetchContacts,
    removeContact,
    invalidateCache: () => {
      // Force refetch by clearing the fetched flag
      useRecoveryContactsStore.getState().clearContacts();
    },
  };
}
