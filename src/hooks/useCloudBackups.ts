"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useCloudBackupStore } from "@/stores/cloud-backup-store";
import { authenticatedFetch, createAuthHeader } from "@/lib/api/fetch-with-auth";

export function useCloudBackups() {
  const { backups, loading, error, fetched, setBackups, addBackup, removeBackup, setLoading, setError } = useCloudBackupStore();
  const sessionToken = useAuthStore((state) => state.sessionToken);
  const fetchingRef = useRef(false);

  const fetchBackups = useCallback(async (force = false) => {
    if (!sessionToken) return;
    
    // Skip fetch if already fetched and not forcing
    if (fetched && !force) return;
    
    // Skip if already fetching
    if (fetchingRef.current) return;

    try {
      fetchingRef.current = true;
      setLoading(true);
      setError(null);

      const url = `/api/recovery/cloud/list${force ? "?refresh=true" : ""}`;
      const response = await authenticatedFetch(url, {
        method: "GET",
        headers: createAuthHeader(sessionToken),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch cloud backups");
      }

      const data = await response.json();
      setBackups(data.backups || []);
    } catch (err) {
      console.error("Error fetching cloud backups:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch cloud backups");
    } finally {
      fetchingRef.current = false;
    }
  }, [sessionToken, fetched, setBackups, setLoading, setError]);

  // Auto-fetch on mount if not already fetched
  useEffect(() => {
    if (sessionToken && !fetched && !fetchingRef.current) {
      fetchBackups(false);
    }
  }, [sessionToken, fetched, fetchBackups]);

  const deleteBackup = useCallback(async (id: string) => {
    if (!sessionToken) throw new Error("Not authenticated");

    const response = await authenticatedFetch(`/api/recovery/cloud/delete/${id}`, {
      method: "DELETE",
      headers: createAuthHeader(sessionToken),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to delete cloud backup");
    }

    removeBackup(id);
  }, [sessionToken, removeBackup]);

  return {
    backups,
    loading,
    error,
    fetched,
    fetchBackups,
    addBackup,
    deleteBackup,
    invalidateCache: () => {
      // Force refetch by clearing the fetched flag
      useCloudBackupStore.getState().clearBackups();
    },
  };
}
