"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import { getAllWallets, saveWalletRecord } from "@/lib/storage/indexeddb";
import { encryptWithPin, decryptWithPin } from "@/lib/crypto/encryption";

interface EncryptedWalletPayload {
  ciphertext: string;
  iv: string;
  salt: string;
}

export default function UpdatePinForm() {
  const t = useTranslations('profile');
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const { sessionToken, walletAddress } = useAuthStore();

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (newPin !== confirmPin) {
      setError(t('pinMismatch'));
      return;
    }

    if (newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
      setError(t('pinInvalid'));
      return;
    }

    if (!walletAddress) {
      setError(t('noWallet'));
      return;
    }

    setLoading(true);

    try {
      // Step 1: Retrieve encrypted wallet from IndexedDB (case-insensitive search)
      const allWallets = await getAllWallets<EncryptedWalletPayload>();
      const walletRecord = allWallets.find(
        (w) => w.address.toLowerCase() === walletAddress.toLowerCase()
      );
      
      if (!walletRecord) {
        throw new Error(t('noWallet'));
      }

      // Step 2: Decrypt wallet with current PIN to verify it's correct
      let decryptedMnemonic: string;
      try {
        decryptedMnemonic = await decryptWithPin(walletRecord.payload, currentPin);
      } catch {
        throw new Error(t('incorrectPIN'));
      }

      // Step 3: Re-encrypt wallet with new PIN
      const newEncryptedPayload = await encryptWithPin(decryptedMnemonic, newPin);

      // Step 4: Update PIN hash in database
      const response = await fetch("/api/auth/update-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken,
          currentPin,
          newPin,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update PIN");
      }

      // Step 5: Save re-encrypted wallet to IndexedDB (preserve original address casing)
      await saveWalletRecord({
        address: walletRecord.address,
        payload: newEncryptedPayload,
        createdAt: walletRecord.createdAt,
      });

      // Step 6: Update server backup with re-encrypted wallet
      try {
        const backupResponse = await fetch("/api/wallet/backup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionToken,
            walletAddress: walletRecord.address,
            encryptedData: JSON.stringify(newEncryptedPayload),
          }),
        });

        if (!backupResponse.ok) {
          console.warn("[Update PIN] Failed to update server backup");
        }
      } catch (backupError) {
        console.warn("[Update PIN] Server backup update failed:", backupError);
      }

      setSuccess(true);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");

      // Show success message for 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <h3 className="text-lg font-semibold text-foreground mb-4">{t('updatePIN')}</h3>
      
      {error && (
        <div className="mb-4 p-3 bg-error-soft border border-error rounded-lg">
          <p className="text-sm text-error">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-700">{t('pinUpdated')}</p>
        </div>
      )}

      <form onSubmit={handleUpdatePin} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            {t('currentPIN')}
          </label>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
            placeholder={t('currentPINPlaceholder')}
            maxLength={6}
            className="w-full px-4 py-3 border border-default rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            {t('newPIN')}
          </label>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
            placeholder={t('newPINPlaceholder')}
            maxLength={6}
            className="w-full px-4 py-3 border border-default rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            {t('confirmNewPIN')}
          </label>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
            placeholder={t('confirmPINPlaceholder')}
            maxLength={6}
            className="w-full px-4 py-3 border border-default rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading || !currentPin || !newPin || !confirmPin}
          className="w-full bg-primary text-on-primary py-3 rounded-lg font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? t('updating') : t('updatePIN')}
        </button>
      </form>

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs text-blue-800">
          <strong>Note:</strong> {t('pinUpdateNote')}
        </p>
      </div>
    </div>
  );
}
