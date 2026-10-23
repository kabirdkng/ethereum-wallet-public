/**
 * Example: Accurate gas fee display in send money form
 * This shows how to integrate the new gas fee calculation
 */

import { useState, useEffect } from "react";
import { calculateTotalFeesWithGas, getGasSpeedOptions } from "@/lib/blockchain/aa/gasFees";

interface FeeBreakdown {
  recipientAmount: string;
  platformFee: string;
  gasFee: string;
  totalFees: string;
  totalDeducted: string;
  breakdown: string;
}

export function SendMoneyWithAccurateGasFees() {
  const [amount, setAmount] = useState("");
  const [feeBreakdown, setFeeBreakdown] = useState<FeeBreakdown | null>(null);
  const [gasSpeed, setGasSpeed] = useState<"slow" | "normal" | "fast" | "instant">("normal");
  const [loading, setLoading] = useState(false);

  // Calculate fees whenever amount or gas speed changes
  useEffect(() => {
    if (!amount || parseFloat(amount) <= 0) {
      setFeeBreakdown(null);
      return;
    }

    let isMounted = true;

    async function calculateFees() {
      setLoading(true);
      try {
        // Check if this is user's first transfer (wallet not deployed yet)
        const isFirstTransfer = false; // TODO: Check from wallet state

        // Get accurate fees
        const fees = await calculateTotalFeesWithGas(amount, {
          isFirstTransfer,
          gasMultiplier: 
            gasSpeed === "slow" ? 0.8 :
            gasSpeed === "fast" ? 1.3 :
            gasSpeed === "instant" ? 1.6 : 1.0,
        });

        if (isMounted) {
          setFeeBreakdown(fees);
        }
      } catch (error) {
        console.error("Error calculating fees:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    const debounce = setTimeout(calculateFees, 500);
    return () => {
      isMounted = false;
      clearTimeout(debounce);
    };
  }, [amount, gasSpeed]);

  return (
    <div className="space-y-4">
      {/* Amount Input */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Amount to Send (USDC)
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="100.00"
          className="w-full px-3 py-2 border rounded"
          step="0.01"
          min="0"
        />
      </div>

      {/* Gas Speed Selector */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Transaction Speed
        </label>
        <div className="grid grid-cols-4 gap-2">
          {(["slow", "normal", "fast", "instant"] as const).map((speed) => (
            <button
              key={speed}
              onClick={() => setGasSpeed(speed)}
              className={`px-3 py-2 border rounded capitalize ${
                gasSpeed === speed ? "bg-blue-500 text-white" : "bg-white"
              }`}
            >
              {speed}
            </button>
          ))}
        </div>
      </div>

      {/* Fee Breakdown */}
      {loading ? (
        <div className="p-4 bg-gray-50 rounded">
          <p className="text-sm text-gray-500">Calculating fees...</p>
        </div>
      ) : feeBreakdown ? (
        <div className="p-4 bg-gray-50 rounded space-y-2">
          <h3 className="font-semibold mb-3">Fee Breakdown</h3>
          
          <div className="flex justify-between text-sm">
            <span>Recipient receives:</span>
            <span className="font-medium">${feeBreakdown.recipientAmount} USDC</span>
          </div>
          
          <div className="flex justify-between text-sm">
            <span>Platform fee (1.5%):</span>
            <span className="font-medium">${feeBreakdown.platformFee} USDC</span>
          </div>
          
          <div className="flex justify-between text-sm">
            <span>Gas fee (sponsored):</span>
            <span className="font-medium">${feeBreakdown.gasFee} USDC</span>
          </div>
          
          <div className="border-t pt-2 mt-2">
            <div className="flex justify-between font-semibold">
              <span>Total withdrawn:</span>
              <span className="text-blue-600">${feeBreakdown.totalDeducted} USDC</span>
            </div>
          </div>

          <p className="text-xs text-gray-500 mt-2">
            ✓ No ETH required - gas fees included in USDC amount
          </p>
        </div>
      ) : null}

      {/* Send Button */}
      <button
        disabled={!feeBreakdown || loading}
        className="w-full px-4 py-3 bg-blue-500 text-white rounded font-medium disabled:bg-gray-300"
      >
        {loading ? "Calculating..." : `Send ${amount || "0"} USDC`}
      </button>
    </div>
  );
}

/**
 * Alternative: Show gas speed options with pricing
 */
interface GasSpeedOption {
  multiplier: number;
  gasFee: string;
  totalDeducted: string;
  estimatedTime: string;
}

interface GasSpeedOptions {
  slow: GasSpeedOption;
  normal: GasSpeedOption;
  fast: GasSpeedOption;
  instant: GasSpeedOption;
}

export function GasSpeedPicker({ amount }: { amount: string }) {
  const [options, setOptions] = useState<GasSpeedOptions | null>(null);

  useEffect(() => {
    if (!amount || parseFloat(amount) <= 0) return;

    async function loadOptions() {
      const speeds = await getGasSpeedOptions(amount);
      setOptions(speeds);
    }

    loadOptions();
  }, [amount]);

  if (!options) return <div>Loading gas options...</div>;

  return (
    <div className="grid grid-cols-2 gap-3">
      {(Object.entries(options) as [string, GasSpeedOption][]).map(([key, value]) => (
        <button
          key={key}
          className="p-3 border rounded text-left hover:border-blue-500"
        >
          <div className="font-semibold capitalize">{key}</div>
          <div className="text-sm text-gray-600">{value.estimatedTime}</div>
          <div className="text-xs text-gray-500">Total: ${value.totalDeducted}</div>
        </button>
      ))}
    </div>
  );
}
