"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth-store";
import { autoRestoreWallet } from "@/lib/wallet-restore";
import { getAllWallets } from "@/lib/storage/indexeddb";
import { decryptWithPin } from "@/lib/crypto/encryption";
import WalletDashboard from "@/components/wallet-dashboard";
import ProfileSection from "@/components/profile-section";
import RecoverySetup from "@/components/recovery-setup";
import SendMoney from "@/components/send-money";
import { ContactsManager } from "@/components/contacts-manager";
import { Contact } from "@/hooks/useContacts";

type DashboardTab = "wallet" | "profile" | "contacts";
type ModalState = "none" | "recovery" | "send";

export default function DashboardPage() {
  const router = useRouter();
  const t = useTranslations('dashboard');
  const { isAuthenticated, walletAddress, sessionToken } = useAuthStore();
  const [activeTab, setActiveTab] = useState<DashboardTab>("wallet");
  const [showModal, setShowModal] = useState<ModalState>("none");
  const [walletReady, setWalletReady] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [recoveryRefreshTrigger, setRecoveryRefreshTrigger] = useState(0);
  const [recoveryMnemonic, setRecoveryMnemonic] = useState<string>("");
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [sendMoneyRecipient, setSendMoneyRecipient] = useState<string>("");

  useEffect(() => {
    // Small delay to ensure Zustand has hydrated from localStorage
    const timer = setTimeout(() => {
      if (!isAuthenticated) {
        router.push("/onboarding");
        return;
      }

      if (!walletAddress || !sessionToken) {
        router.push("/onboarding");
        return;
      }

      // Auto-restore wallet if missing from IndexedDB
      const ensureWalletAvailable = async () => {
        console.log("[Dashboard] Ensuring wallet is available...");
        
        try {
          const restored = await autoRestoreWallet(sessionToken, walletAddress);
          console.log("[Dashboard] Wallet check complete, ready:", restored);
          setWalletReady(true);
        } catch (error) {
          console.error("[Dashboard] Failed to ensure wallet availability:", error);
          setWalletReady(true); // Still show dashboard, error will appear when trying to send
        }
      };

      ensureWalletAvailable();
    }, 0);

    return () => clearTimeout(timer);
  }, [isAuthenticated, walletAddress, sessionToken, router]);

  const handleEditRecovery = () => {
    // Need to decrypt wallet with PIN to get mnemonic for recovery setup
    setShowPinPrompt(true);
  };

  const handlePinSubmit = async () => {
    if (!walletAddress || pinInput.length !== 6) {
      setPinError(t('pinModal.errors.invalidPin'));
      return;
    }

    try {
      // Get encrypted wallet from IndexedDB (case-insensitive search, same as update-pin)
      const allWallets = await getAllWallets<{ ciphertext: string; iv: string; salt: string }>();
      const walletRecord = allWallets.find(
        (w) => w.address.toLowerCase() === walletAddress.toLowerCase()
      );
      
      if (!walletRecord) {
        setPinError(t('pinModal.errors.walletNotFound'));
        return;
      }

      console.log("[Dashboard] Attempting to decrypt wallet with PIN");
      const payload = walletRecord.payload as { ciphertext: string; iv: string; salt: string };
      console.log("[Dashboard] Wallet payload:", {
        hasCiphertext: !!payload.ciphertext,
        hasIv: !!payload.iv,
        hasSalt: !!payload.salt,
      });

      // Decrypt mnemonic with PIN
      const mnemonic = await decryptWithPin(payload, pinInput);
      
      console.log("[Dashboard] Successfully decrypted mnemonic");
      
      // Store mnemonic and open recovery setup
      setRecoveryMnemonic(mnemonic);
      setShowPinPrompt(false);
      setShowModal("recovery");
      setPinInput("");
      setPinError("");
    } catch (error) {
      console.error("[Dashboard] Failed to decrypt wallet:", error);
      if (error instanceof Error && error.name === "OperationError") {
        setPinError(t('pinModal.errors.incorrectPin'));
      } else {
        setPinError(t('pinModal.errors.decryptFailed'));
      }
    }
  };

  const handleSendMoney = () => {
    setShowModal("send");
  };

  const handleSendSuccess = (txHash: string) => {
    console.log("✓ Transaction successful:", txHash);
    console.log("Closing modal and triggering transaction list refresh...");
    setShowModal("none");
    // Trigger transaction list refresh in WalletDashboard
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleCloseModal = () => {
    setShowModal("none");
    setSendMoneyRecipient(""); // Clear recipient when closing
  };

  // Show loading state while ensuring wallet is available
  if (!walletReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-foreground font-medium">Loading your wallet...</p>
          <p className="text-muted text-sm mt-2">Please wait</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !walletAddress) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-16">
      {/* Tab Navigation */}
      <div className="border-b border-subtle bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveTab("wallet")}
              className={`py-4 px-2 border-b-2 font-medium text-sm transition ${
                activeTab === "wallet"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t('tabs.wallet')}
            </button>
            <button
              onClick={() => setActiveTab("contacts")}
              className={`py-4 px-2 border-b-2 font-medium text-sm transition ${
                activeTab === "contacts"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t('tabs.contacts')}
            </button>
            <button
              onClick={() => setActiveTab("profile")}
              className={`py-4 px-2 border-b-2 font-medium text-sm transition ${
                activeTab === "profile"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t('tabs.profile')}
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "wallet" && (
          <WalletDashboard 
            address={walletAddress} 
            onSendMoney={handleSendMoney}
            onSetupRecovery={handleEditRecovery}
            refreshTrigger={refreshTrigger}
          />
        )}
        
        {activeTab === "contacts" && (
          <div className="max-w-3xl mx-auto">
            <ContactsManager onSendMoney={(contact: Contact) => {
              setSendMoneyRecipient(contact.walletAddress);
              setShowModal("send");
            }} />
          </div>
        )}
        
        {activeTab === "profile" && (
          <ProfileSection 
            onEditRecovery={handleEditRecovery} 
            refreshTrigger={recoveryRefreshTrigger}
          />
        )}
      </main>

      {/* PIN Prompt Modal for Recovery Setup */}
      {showPinPrompt && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-foreground mb-4">{t('pinModal.title')}</h3>
            <p className="text-muted text-sm mb-4">
              {t('pinModal.description')}
            </p>

            {pinError && (
              <div className="mb-4 p-3 bg-error-soft border border-error rounded text-error text-sm">
                {pinError}
              </div>
            )}

            <input
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t('pinModal.placeholder')}
              maxLength={6}
              className="w-full px-4 py-3 border border-default rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && pinInput.length === 6) {
                  handlePinSubmit();
                }
              }}
            />

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowPinPrompt(false);
                  setPinInput("");
                  setPinError("");
                }}
                className="flex-1 px-4 py-2 border border-subtle rounded hover:bg-card-muted text-foreground"
              >
                {t('pinModal.cancel')}
              </button>
              <button
                onClick={handlePinSubmit}
                disabled={pinInput.length !== 6}
                className="flex-1 px-4 py-2 bg-primary text-on-primary rounded hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('pinModal.continue')}
              </button>
            </div>

            <div className="mt-4 text-center">
              <button
                onClick={() => {
                  setShowPinPrompt(false);
                  setPinInput("");
                  setPinError("");
                  router.push("/recovery");
                }}
                className="text-sm text-primary hover:underline"
              >
                {t('pinModal.forgotPin')} {t('pinModal.useRecovery')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recovery Setup Modal */}
      {showModal === "recovery" && walletAddress && recoveryMnemonic && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 relative">
            <button
              onClick={() => {
                handleCloseModal();
                setRecoveryMnemonic(""); // Clear mnemonic when closing
              }}
              className="absolute top-4 right-4 text-muted hover:text-foreground"
              aria-label="Close modal"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <RecoverySetup
              walletAddress={walletAddress}
              mnemonic={recoveryMnemonic}
              sessionToken={sessionToken || ""}
              onComplete={() => {
                handleCloseModal();
                setRecoveryMnemonic(""); // Clear mnemonic after completion
                setRecoveryRefreshTrigger(prev => prev + 1); // Trigger refresh of recovery status
              }}
            />
          </div>
        </div>
      )}

      {/* Send Money Modal */}
      {showModal === "send" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto p-6 relative">
            <button
              onClick={handleCloseModal}
              className="absolute top-4 right-4 text-muted hover:text-foreground"
              aria-label="Close modal"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <SendMoney
              onSuccess={handleSendSuccess}
              onCancel={handleCloseModal}
              initialRecipient={sendMoneyRecipient}
            />
          </div>
        </div>
      )}
    </div>
  );
}
