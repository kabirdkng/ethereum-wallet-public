"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { FaTimes } from "react-icons/fa";
import jsQR from "jsqr";

interface QRScannerProps {
  onScan: (address: string) => void;
  onClose: () => void;
}

export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detectedAddress, setDetectedAddress] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  /* ---------------------------
        CAMERA START / STOP
     --------------------------- */

  const stopCamera = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  /* ---------------------------
          QR SCANNING LOOP
     --------------------------- */

  const startScanning = useCallback(() => {
    const scan = () => {
      if (!videoRef.current || !canvasRef.current) {
        rafRef.current = requestAnimationFrame(scan);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const code = jsQR(img.data, img.width, img.height, {
          inversionAttempts: "dontInvert",
        });

        if (code?.data) {
          const raw = code.data.trim();

          // ETH address validation
          const match = raw.match(/0x[a-fA-F0-9]{40}/);
          if (match) {
            const address = match[0];

            setDetectedAddress(address);
            stopCamera();
            onScan(address);
            return;
          }

          setError("QR detected but not a valid ETH address");
          setTimeout(() => setError(""), 2500);
        }
      }

      rafRef.current = requestAnimationFrame(scan);
    };

    rafRef.current = requestAnimationFrame(scan);
  }, [onScan, setError]);

  const startCamera = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });

      streamRef.current = stream;

      if (!videoRef.current) return;

      videoRef.current.srcObject = stream;
      videoRef.current.playsInline = true;

      await videoRef.current.play();

      setLoading(false);

      startScanning();
    } catch (err) {
      setError(
        "Unable to access camera: " +
          (err instanceof Error ? err.message : "Unknown error")
      );
      setLoading(false);
    }
  }, [startScanning, setError, setLoading]);

  /* ---------------------------
        AUTO START + CLEANUP
     --------------------------- */

  useEffect(() => {
    const delay = setTimeout(startCamera, 400);

    return () => {
      clearTimeout(delay);
      stopCamera();
    };
  }, [startCamera]);

  /* ---------------------------
            CLOSE HANDLING
     --------------------------- */

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  /* ---------------------------
                UI
     --------------------------- */

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-default">
          <h3 className="text-lg font-semibold text-foreground">Scan QR Code</h3>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-card-muted rounded-lg transition"
          >
            <FaTimes className="text-muted" />
          </button>
        </div>

        {/* Scanner */}
        <div className="p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <div className="relative bg-black rounded-lg overflow-hidden mb-4 aspect-square">
            <video ref={videoRef} className="w-full h-full object-cover" muted />

            {loading && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                <div className="text-white text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                  <p className="text-sm">Starting camera...</p>
                </div>
              </div>
            )}

            {!loading && (
              <div className="absolute inset-0 border-2 border-primary/30 rounded-lg pointer-events-none">
                <div className="absolute top-4 left-4 w-6 h-6 border-l-2 border-t-2 border-primary" />
                <div className="absolute top-4 right-4 w-6 h-6 border-r-2 border-t-2 border-primary" />
                <div className="absolute bottom-4 left-4 w-6 h-6 border-l-2 border-b-2 border-primary" />
                <div className="absolute bottom-4 right-4 w-6 h-6 border-r-2 border-b-2 border-primary" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white text-sm bg-black/50 px-3 py-2 rounded">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                    Point camera at QR code
                  </div>
                </div>
              </div>
            )}

            {/* Hidden canvas */}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {detectedAddress && (
            <div className="mt-4 p-3 bg-green-100 border border-green-300 rounded-lg">
              <p className="text-green-800 text-sm font-medium">Address detected!</p>
              <p className="text-xs text-muted mt-1 font-mono break-all">
                {detectedAddress}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-default">
          <button
            onClick={handleClose}
            className="w-full py-3 bg-card-muted text-foreground rounded-lg font-medium hover:bg-card transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
