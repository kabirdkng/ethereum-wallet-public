"use client";

import { useEffect, useCallback, useRef } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useContactsStore, type Contact } from "@/stores/contacts-store";
import { authenticatedFetch, createAuthHeader, createAuthJsonHeaders } from "@/lib/api/fetch-with-auth";

export type { Contact };

export function useContacts() {
  const { contacts, loading, error, fetched, setContacts, addContact: addContactToStore, updateContact: updateContactInStore, removeContact, setLoading, setError } = useContactsStore();
  const sessionToken = useAuthStore((state) => state.sessionToken);
  const fetchingRef = useRef(false);

  const fetchContacts = useCallback(async (force = false) => {
    if (!sessionToken) return;
    
    // Skip fetch if already fetched and not forcing
    if (fetched && !force) return;
    
    // Skip if already fetching
    if (fetchingRef.current) return;

    try {
      fetchingRef.current = true;
      setLoading(true);
      setError(null);

      const url = `/api/contacts${force ? "?refresh=true" : ""}`;
      const response = await authenticatedFetch(url, {
        headers: createAuthHeader(sessionToken),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch contacts");
      }

      const data = await response.json();
      setContacts(data.contacts || []);
    } catch (err) {
      console.error("Error fetching contacts:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch contacts");
    } finally {
      fetchingRef.current = false;
    }
  }, [sessionToken, fetched, setContacts, setLoading, setError]);

  const addContact = async (contactData: {
    name: string;
    walletAddress: string;
    notes?: string;
  }) => {
    if (!sessionToken) throw new Error("Not authenticated");

    const response = await authenticatedFetch("/api/contacts", {
      method: "POST",
      headers: createAuthJsonHeaders(sessionToken),
      body: JSON.stringify(contactData),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to add contact");
    }

    addContactToStore(data.contact);
    // Force refetch to ensure UI is updated
    await fetchContacts(true);
    return data.contact;
  };

  const updateContact = async (
    id: string,
    contactData: {
      name?: string;
      walletAddress?: string;
      notes?: string | null;
    }
  ) => {
    if (!sessionToken) throw new Error("Not authenticated");

    const response = await authenticatedFetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: createAuthJsonHeaders(sessionToken),
      body: JSON.stringify(contactData),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to update contact");
    }

    updateContactInStore(id, data.contact);
    // Force refetch to ensure UI is updated
    await fetchContacts(true);
    return data.contact;
  };

  const deleteContact = async (id: string) => {
    if (!sessionToken) throw new Error("Not authenticated");

    const response = await authenticatedFetch(`/api/contacts/${id}`, {
      method: "DELETE",
      headers: createAuthHeader(sessionToken),
    });

    if (!response.ok) {
      throw new Error("Failed to delete contact");
    }

    removeContact(id);
    // Force refetch to ensure UI is updated
    await fetchContacts(true);
  };

  const findContactByAddress = (address: string) => {
    return contacts.find(
      (c) => c.walletAddress.toLowerCase() === address.toLowerCase()
    );
  };

  // Only fetch on mount if not already fetched
  useEffect(() => {
    if (sessionToken && !fetched) {
      fetchContacts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken, fetched]);

  return {
    contacts,
    loading,
    error,
    fetchContacts,
    addContact,
    updateContact,
    deleteContact,
    findContactByAddress,
    invalidateCache: () => {
      // Force refetch by clearing the fetched flag
      useContactsStore.getState().clearContacts();
    },
  };
}
