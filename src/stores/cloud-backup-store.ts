"use client";

import { create } from "zustand";

export interface CloudBackup {
  id: string;
  provider?: "google" | "facebook";
  label?: string | null;
  backupSource: string; // "manual" | "oauth-google" | "oauth-facebook"
  encryptedMnemonic?: string;
  createdAt: string;
  updatedAt?: string;
}

interface CloudBackupState {
  backups: CloudBackup[];
  loading: boolean;
  error: string | null;
  fetched: boolean; // Track if backups have been fetched
  
  setBackups: (backups: CloudBackup[]) => void;
  addBackup: (backup: CloudBackup) => void;
  removeBackup: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setFetched: (fetched: boolean) => void;
  clearBackups: () => void;
}

export const useCloudBackupStore = create<CloudBackupState>((set) => ({
  backups: [],
  loading: false,
  error: null,
  fetched: false,
  
  setBackups: (backups) => set({ backups, fetched: true, loading: false, error: null }),
  
  addBackup: (backup) =>
    set((state) => ({ backups: [...state.backups, backup] })),
  
  removeBackup: (id) =>
    set((state) => ({
      backups: state.backups.filter((b) => b.id !== id),
    })),
  
  setLoading: (loading) => set({ loading }),
  
  setError: (error) => set({ error, loading: false }),
  
  setFetched: (fetched) => set({ fetched }),
  
  clearBackups: () => set({ backups: [], loading: false, error: null, fetched: false }),
}));
