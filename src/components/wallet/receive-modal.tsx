"use client";

import { useState, useEffect } from "react";

interface ReceiveModalProps {
  address: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ReceiveModal({ address, isOpen, onClose }: ReceiveModalProps) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && address && !qrDataUrl) {
      // Validate that this is not an EOA address being shown
      // Smart wallet addresses should always be passed from parent
      if (!address.startsWith('0x') || address.length !== 42) {
        console.error('Invalid wallet address format:', address);
        return;
      }
      generateQRCode(address);
    }
  }, [isOpen, address, qrDataUrl]);

  const generateQRCode = async (addr: string) => {
    try {
      const QRCode = (await import('qrcode')).default;
      const dataUrl = await QRCode.toDataURL(addr, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
      setQrDataUrl(dataUrl);
    } catch (err) {
      console.error('Failed to generate QR code:', err);
    }
  };

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  if (!isOpen) return null;
  
  // Don't show modal if address is invalid or missing
  if (!address || !address.startsWith('0x') || address.length !== 42) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-default rounded-lg max-w-md w-full p-6 shadow-card">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-foreground">Receive Funds</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition"
            aria-label="Close modal"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="bg-white p-4 rounded-lg border-4 border-primary">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="Wallet QR Code" className="w-64 h-64" />
            ) : (
              <div className="w-64 h-64 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            )}
          </div>

          <div className="w-full">
            <label htmlFor="wallet-address" className="block text-sm font-medium mb-2 text-muted">
              Your Wallet Address
            </label>
            <div className="relative">
              <input
                id="wallet-address"
                type="text"
                value={address}
                readOnly
                className="w-full px-4 py-3 pr-12 rounded-lg border border-default bg-card-muted text-foreground font-mono text-xs focus:outline-none"
              />
              <button
                onClick={handleCopyAddress}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-primary text-on-primary rounded hover:bg-primary-hover transition text-sm"
              >
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="w-full bg-card-muted border border-subtle rounded-lg p-4 text-sm text-muted">
            <p className="font-medium text-foreground mb-2">How to receive funds:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Share this address or QR code with the sender</li>
              <li>Wait for them to complete the transfer</li>
              <li>Funds will appear in your wallet after confirmation</li>
            </ol>
          </div>

          <button
            onClick={onClose}
            className="w-full bg-primary text-on-primary py-3 rounded-lg font-medium hover:bg-primary-hover shadow-card transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
