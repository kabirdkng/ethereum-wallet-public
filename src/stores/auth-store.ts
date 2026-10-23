"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface User {
  id: string;
  identifier: string;
  walletAddress: string;
  smartWalletAddress: string | null;
  oauthProvider?: string;
  oauthId?: string;
  email?: string;
  phone?: string;
  profilePicture?: string;
  createdAt: string;
}

interface AuthState {
  // Session data
  sessionToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  
  // Wallet data
  walletAddress: string | null;
  hasWallet: boolean;
  
  // Actions
  setSession: (token: string, user: User) => void;
  setWallet: (address: string) => void;
  clearSession: () => void;
  updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // Initial state
      sessionToken: null,
      user: null,
      isAuthenticated: false,
      walletAddress: null,
      hasWallet: false,

      // Set session after successful login/signup
      setSession: (token: string, user: User) =>
        set({
          sessionToken: token,
          user,
          isAuthenticated: true,
          walletAddress: user.walletAddress || null,
          hasWallet: !!user.walletAddress,
        }),

      // Set wallet address after wallet creation/registration
      setWallet: (address: string) =>
        set((state) => ({
          walletAddress: address,
          hasWallet: true,
          user: state.user ? { ...state.user, walletAddress: address } : null,
        })),

      // Clear session on logout
      clearSession: () => {
        set({
          sessionToken: null,
          user: null,
          isAuthenticated: false,
          walletAddress: null,
          hasWallet: false,
        });
        // Dynamically import stores to avoid circular dependencies
        import("./wallet-data-store").then(({ useWalletDataStore }) => {
          useWalletDataStore.getState().clearWalletData();
        });
        import("./contacts-store").then(({ useContactsStore }) => {
          useContactsStore.getState().clearContacts();
        });
        import("./cloud-backup-store").then(({ useCloudBackupStore }) => {
          useCloudBackupStore.getState().clearBackups();
        });
        import("./recovery-contacts-store").then(({ useRecoveryContactsStore }) => {
          useRecoveryContactsStore.getState().clearContacts();
        });
      },      // Update user data
      updateUser: (userData: Partial<User>) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        })),
    }),
    {
      name: "auth-storage", // localStorage key
      storage: createJSONStorage(() => localStorage),
    }
  )
);
