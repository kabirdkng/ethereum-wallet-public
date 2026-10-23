"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { checkMnemonicBackupStatus } from "@/lib/storage/indexeddb";

export function useMnemonicBackup() {
  const [hasMnemonicBackup, setHasMnemonicBackup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetched, setFetched] = useState(false);
  
  const { user } = useAuthStore();
  const walletAddress = user?.smartWalletAddress;

  const checkBackupStatus = useCallback(async () => {
    if (!walletAddress) {
      setLoading(false);
      setFetched(true);
      return;
    }

    try {
      setLoading(true);
      const status = await checkMnemonicBackupStatus(walletAddress);
      setHasMnemonicBackup(status);
      setFetched(true);
    } catch (error) {
      console.error("Failed to check mnemonic backup status:", error);
      setHasMnemonicBackup(false);
      setFetched(true);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  const refreshBackupStatus = useCallback(() => {
    setFetched(false);
    checkBackupStatus();
  }, [checkBackupStatus]);

  useEffect(() => {
    let isMounted = true;

    const wrappedCheckBackupStatus = async () => {
      if (!walletAddress) {
        if (isMounted) {
          setLoading(false);
          setFetched(true);
        }
        return;
      }

      try {
        if (isMounted) {
          setLoading(true);
        }
        const status = await checkMnemonicBackupStatus(walletAddress);
        
        if (isMounted) {
          setHasMnemonicBackup(status);
          setFetched(true);
        }
      } catch (error) {
        console.error("Failed to check mnemonic backup status:", error);
        if (isMounted) {
          setHasMnemonicBackup(false);
          setFetched(true);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    // Listen for mnemonic backup completion events
    const handleBackupCompleted = (event: CustomEvent) => {
      const { walletAddress: eventWalletAddress } = event.detail;
      if (eventWalletAddress?.toLowerCase() === walletAddress?.toLowerCase()) {
        refreshBackupStatus();
      }
    };

    wrappedCheckBackupStatus();

    // Add event listener for backup completion
    window.addEventListener('mnemonicBackupCompleted', handleBackupCompleted as EventListener);

    return () => {
      isMounted = false;
      window.removeEventListener('mnemonicBackupCompleted', handleBackupCompleted as EventListener);
    };
  }, [walletAddress, refreshBackupStatus]);

  return {
    hasMnemonicBackup,
    loading,
    fetched,
    refreshBackupStatus,
  };
}