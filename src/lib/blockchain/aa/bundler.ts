/**
 * Alchemy Bundler API client for submitting UserOperations
 * Handles communication with Alchemy's EIP-4337 bundler service
 */

import { getAlchemyBundlerUrl, getGasManagerPolicyId } from "./contracts";
import { getPublicClient } from "../client";
import type { Address } from "viem";

export interface UserOperation {
  sender: string;
  nonce: string;
  initCode: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  paymasterAndData: string;
  signature: string;
}

// EntryPoint ABI for simulation and error handling
const ENTRYPOINT_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "sender", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "initCode", type: "bytes" },
          { name: "callData", type: "bytes" },
          { name: "callGasLimit", type: "uint256" },
          { name: "verificationGasLimit", type: "uint256" },
          { name: "preVerificationGas", type: "uint256" },
          { name: "maxFeePerGas", type: "uint256" },
          { name: "maxPriorityFeePerGas", type: "uint256" },
          { name: "paymasterAndData", type: "bytes" },
          { name: "signature", type: "bytes" },
        ],
        name: "userOp",
        type: "tuple",
      },
    ],
    name: "simulateHandleOp",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "opIndex", type: "uint256" },
      { name: "reason", type: "string" },
    ],
    name: "FailedOp",
    type: "error",
  },
  {
    inputs: [
      { name: "preOpGas", type: "uint256" },
      { name: "paid", type: "uint256" },
      { name: "validAfter", type: "uint48" },
      { name: "validUntil", type: "uint48" },
      { name: "targetSuccess", type: "bool" },
      { name: "targetResult", type: "bytes" },
    ],
    name: "ExecutionResult",
    type: "error",
  },
] as const;

export interface BundlerResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Simulate UserOperation execution to get revert reason
 * @param userOp - The UserOperation to simulate
 * @returns Simulation result or throws with detailed revert reason
 */
export async function simulateUserOperation(userOp: UserOperation): Promise<void> {
  const publicClient = getPublicClient();
  const ENTRYPOINT_ADDRESS: Address = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

  console.log("🔬 Simulating UserOperation before submission...");

  try {
    // Call simulateHandleOp - it ALWAYS reverts (even on success)
    await publicClient.simulateContract({
      address: ENTRYPOINT_ADDRESS,
      abi: ENTRYPOINT_ABI,
      functionName: "simulateHandleOp",
      args: [
        {
          sender: userOp.sender as Address,
          nonce: BigInt(userOp.nonce),
          initCode: userOp.initCode as `0x${string}`,
          callData: userOp.callData as `0x${string}`,
          callGasLimit: BigInt(userOp.callGasLimit),
          verificationGasLimit: BigInt(userOp.verificationGasLimit),
          preVerificationGas: BigInt(userOp.preVerificationGas),
          maxFeePerGas: BigInt(userOp.maxFeePerGas),
          maxPriorityFeePerGas: BigInt(userOp.maxPriorityFeePerGas),
          paymasterAndData: userOp.paymasterAndData as `0x${string}`,
          signature: userOp.signature as `0x${string}`,
        },
      ],
    });

    // Should never reach here
    console.log("✅ Simulation unexpectedly succeeded (no revert)");
  } catch (error: unknown) {
    // simulateHandleOp ALWAYS reverts - decode the revert to check success/failure
    if (error && typeof error === "object" && "data" in error) {
      const errorData = error as { 
        data?: { 
          errorName?: string; 
          args?: unknown[];
        }; 
        message?: string;
        cause?: {
          data?: string;
        };
      };
      
      const errorName = errorData.data?.errorName;
      const args = errorData.data?.args;

      console.log("� Simulation revert details:", {
        errorName,
        args,
        hasRawData: !!errorData.cause?.data,
      });

      // ExecutionResult means the UserOp would succeed
      if (errorName === "ExecutionResult") {
        const executionArgs = args as [bigint, bigint, number, number, boolean, string] | undefined;
        if (executionArgs && executionArgs.length >= 5) {
          const [preOpGas, paid, , , targetSuccess, targetResult] = executionArgs;
          
          if (targetSuccess) {
            console.log("✅ Simulation passed - UserOp will execute successfully:", {
              preOpGas: preOpGas.toString(),
              paid: paid.toString(),
              targetSuccess,
            });
            return; // Success!
          } else {
            console.error("❌ UserOp execution will fail - target call failed:", {
              targetSuccess,
              targetResult,
            });
            throw new Error(`UserOperation target execution will fail. Result: ${targetResult}`);
          }
        }
      }

      // FailedOp means validation/execution failed
      if (errorName === "FailedOp") {
        const failedArgs = args as [bigint, string] | undefined;
        if (failedArgs && failedArgs.length >= 2) {
          const [opIndex, reason] = failedArgs;
          console.error("❌ UserOperation validation/execution will fail:", {
            opIndex: opIndex.toString(),
            reason,
          });
          throw new Error(`UserOperation will fail: ${reason}`);
        }
      }

      // Unknown error type
      console.error("❌ Simulation failed with unknown error:", {
        errorName,
        args,
        message: errorData.message,
      });
      throw new Error(`Simulation failed: ${errorData.message || "Unknown error"}`);
    }

    // Unexpected error format
    console.error("❌ Unexpected simulation error:", error);
    throw error;
  }
}

/**
 * Send a UserOperation to Alchemy's bundler with automatic retry on underpriced errors
 * @param userOp - The UserOperation to send
 * @param walletClient - Optional wallet client for re-signing on retry (required for proper retry)
 * @param retryCount - Internal retry counter (do not set manually)
 * @returns The UserOperation hash
 */
export async function sendUserOperation(
  userOp: UserOperation, 
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walletClient?: any,
  retryCount: number = 0
): Promise<string> {
  const bundlerUrl = getAlchemyBundlerUrl();
  const policyId = getGasManagerPolicyId();
  const MAX_RETRIES = 3;
  const GAS_INCREASE_MULTIPLIER = 1.2; // 20% increase per retry

  // Simulate before sending to get detailed error if it will fail
  // TEMPORARILY DISABLED: viem v2 error decoding needs more work
  // try {
  //   await simulateUserOperation(userOp);
  // } catch (simError) {
  //   console.error("❌ Pre-submission simulation failed:", simError);
  //   throw simError;
  // }

  console.log("Sending UserOperation to bundler:", {
    bundlerUrl,
    hasPolicyId: !!policyId,
    sender: userOp.sender,
    retryAttempt: retryCount,
    currentMaxFee: userOp.maxFeePerGas,
    currentPriorityFee: userOp.maxPriorityFeePerGas,
  });

  try {
    const response = await fetch(bundlerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(policyId ? { "Alchemy-AA-Gas-Policy-Id": policyId } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendUserOperation",
        params: [
          userOp,
          "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", // EntryPoint v0.6
        ],
      }),
    });

    const data = (await response.json()) as BundlerResponse<string>;

    if (data.error) {
      console.error("Bundler error:", data.error);
      
      // Check for replacement underpriced error and related nonce conflicts
      const errorMessage = data.error.message.toLowerCase();
      const isUnderpricedError = 
        errorMessage.includes('replacement transaction underpriced') ||
        errorMessage.includes('replacement underpriced') ||
        errorMessage.includes('underpriced') ||
        errorMessage.includes('nonce too high') ||
        errorMessage.includes('nonce too low') ||
        errorMessage.includes('already known') ||
        errorMessage.includes('transaction underpriced');
      
      if (isUnderpricedError && retryCount < MAX_RETRIES) {
        console.warn(`⚠️ Gas/nonce error detected: "${data.error.message}". Retrying with higher gas (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
        
        if (!walletClient) {
          console.error("Cannot retry: walletClient not provided to sendUserOperation");
          throw new Error(`Bundler error: ${data.error.message}`);
        }
        
        // Safety check: if we've been retrying the same error, increase backoff
        if (retryCount >= 2) {
          console.warn(`⚠️ Multiple retries for same error type. Adding extra delay...`);
        }
        
        // Increase gas prices by multiplier
        const currentMaxFee = BigInt(userOp.maxFeePerGas);
        const currentPriorityFee = BigInt(userOp.maxPriorityFeePerGas);
        
        const newMaxFee = BigInt(Math.floor(Number(currentMaxFee) * GAS_INCREASE_MULTIPLIER));
        const newPriorityFee = BigInt(Math.floor(Number(currentPriorityFee) * GAS_INCREASE_MULTIPLIER));
        
        console.log("💰 Gas price adjustment:", {
          oldMaxFee: currentMaxFee.toString(),
          newMaxFee: newMaxFee.toString(),
          oldPriorityFee: currentPriorityFee.toString(),
          newPriorityFee: newPriorityFee.toString(),
          increasePercentage: `${((GAS_INCREASE_MULTIPLIER - 1) * 100).toFixed(1)}%`,
        });
        
        // Get fresh nonce in case of nonce conflicts
        const publicClient = getPublicClient();
        const ENTRYPOINT_ADDRESS: Address = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
        
        let freshNonce;
        try {
          freshNonce = await publicClient.readContract({
            address: ENTRYPOINT_ADDRESS,
            abi: [
              {
                inputs: [
                  { name: "sender", type: "address" },
                  { name: "key", type: "uint192" }
                ],
                name: "getNonce",
                outputs: [{ name: "nonce", type: "uint256" }],
                stateMutability: "view",
                type: "function",
              },
            ],
            functionName: "getNonce",
            args: [userOp.sender as Address, BigInt(0)],
          });
          
          console.log("🔄 Fresh nonce fetched for retry:", {
            originalNonce: userOp.nonce,
            freshNonce: `0x${freshNonce.toString(16)}`,
          });
        } catch (nonceError) {
          console.warn("Could not fetch fresh nonce, using original:", nonceError);
          freshNonce = BigInt(userOp.nonce);
        }
        
        // Create updated UserOp with higher gas and fresh nonce (without signature yet)
        const updatedUserOp: Partial<UserOperation> = {
          ...userOp,
          nonce: `0x${freshNonce.toString(16)}`,
          maxFeePerGas: `0x${newMaxFee.toString(16)}`,
          maxPriorityFeePerGas: `0x${newPriorityFee.toString(16)}`,
          signature: "0x", // Will be re-signed
        };
        
        // If we have a paymaster, we need to re-request sponsorship with new gas prices
        if (policyId && userOp.paymasterAndData !== "0x") {
          console.log("🔄 Re-requesting paymaster sponsorship with updated gas prices...");
          
          try {
            const paymasterData = await requestPaymasterAndData(updatedUserOp);
            
            updatedUserOp.paymasterAndData = paymasterData.paymasterAndData;
            
            // Update gas limits if paymaster provides higher values
            if (paymasterData.callGasLimit) {
              const paymasterCallGas = BigInt(paymasterData.callGasLimit);
              const ourCallGas = BigInt(updatedUserOp.callGasLimit || 0);
              if (paymasterCallGas > ourCallGas) {
                updatedUserOp.callGasLimit = paymasterData.callGasLimit;
              }
            }
            if (paymasterData.verificationGasLimit) {
              const paymasterVerifGas = BigInt(paymasterData.verificationGasLimit);
              const ourVerifGas = BigInt(updatedUserOp.verificationGasLimit || 0);
              if (paymasterVerifGas > ourVerifGas) {
                updatedUserOp.verificationGasLimit = paymasterData.verificationGasLimit;
              }
            }
            if (paymasterData.preVerificationGas) {
              const paymasterPreVerifGas = BigInt(paymasterData.preVerificationGas);
              const ourPreVerifGas = BigInt(updatedUserOp.preVerificationGas || 0);
              if (paymasterPreVerifGas > ourPreVerifGas) {
                updatedUserOp.preVerificationGas = paymasterData.preVerificationGas;
              }
            }
            
            console.log("✓ Paymaster sponsorship re-approved with higher gas");
          } catch (paymasterError) {
            console.error("Failed to get paymaster sponsorship for retry:", paymasterError);
            throw new Error("Failed to get gas sponsorship for retry. Please try again.");
          }
        }
        
        // Re-sign the UserOp with updated gas prices and paymaster data
        const { signUserOperationRetry } = await import("./userOp");
        const newSignature = await signUserOperationRetry(walletClient, updatedUserOp);
        updatedUserOp.signature = newSignature;
        
        console.log("✓ UserOperation re-signed with new gas prices");
        
        // Wait with exponential backoff before retrying
        const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 8000); // Max 8 seconds
        console.log(`⏳ Waiting ${backoffDelay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        
        // Recursive retry with increased gas
        return sendUserOperation(updatedUserOp as UserOperation, walletClient, retryCount + 1);
      }
      
      throw new Error(`Bundler error: ${data.error.message}`);
    }

    if (!data.result) {
      throw new Error("No result from bundler");
    }

    console.log("✅ UserOperation submitted successfully:", {
      userOpHash: data.result,
      retriesNeeded: retryCount,
    });

    return data.result;
  } catch (error) {
    console.error("Error sending UserOperation:", error);
    throw error;
  }
}

/**
 * Get UserOperation receipt (transaction hash and status)
 * @param userOpHash - The UserOperation hash
 * @returns The receipt with transaction hash
 */
export async function getUserOperationReceipt(userOpHash: string): Promise<{
  success: boolean;
  transactionHash: string;
  blockNumber: string;
  actualGasUsed: string;
} | null> {
  const bundlerUrl = getAlchemyBundlerUrl();

  try {
    const response = await fetch(bundlerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getUserOperationReceipt",
        params: [userOpHash],
      }),
    });

    const data = (await response.json()) as BundlerResponse<{
      success: boolean;
      receipt: {
        transactionHash: string;
        blockNumber: string;
      };
      actualGasUsed: string;
    }>;

    if (data.error) {
      console.error("Error getting UserOperation receipt:", data.error);
      return null;
    }

    if (!data.result) {
      // No receipt yet - operation still pending
      return null;
    }

    console.log("UserOperation receipt received:", {
      userOpHash: userOpHash.slice(0, 10) + "...",
      success: data.result.success,
      txHash: data.result.receipt?.transactionHash?.slice(0, 10) + "...",
    });

    return {
      success: data.result.success,
      transactionHash: data.result.receipt.transactionHash,
      blockNumber: data.result.receipt.blockNumber,
      actualGasUsed: data.result.actualGasUsed,
    };
  } catch (error) {
    console.error("Error fetching UserOperation receipt:", error);
    return null;
  }
}

/**
 * Estimate UserOperation gas limits
 * @param userOp - The UserOperation to estimate
 * @returns Gas estimates
 */
export async function estimateUserOperationGas(userOp: Partial<UserOperation>): Promise<{
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
}> {
  const bundlerUrl = getAlchemyBundlerUrl();

  try {
    const response = await fetch(bundlerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_estimateUserOperationGas",
        params: [
          userOp,
          "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", // EntryPoint v0.6
        ],
      }),
    });

    const data = (await response.json()) as BundlerResponse<{
      callGasLimit: string;
      verificationGasLimit: string;
      preVerificationGas: string;
    }>;

    if (data.error) {
      console.error("Error estimating gas:", data.error);
      // Return conservative defaults
      return {
        callGasLimit: "0x30d40", // 200,000
        verificationGasLimit: "0x30d40", // 200,000
        preVerificationGas: "0xc350", // 50,000
      };
    }

    if (!data.result) {
      throw new Error("No result from gas estimation");
    }

    console.log("Gas estimates:", data.result);

    return data.result;
  } catch (error) {
    console.error("Error estimating UserOperation gas:", error);
    // Return conservative defaults
    return {
      callGasLimit: "0x30d40", // 200,000
      verificationGasLimit: "0x30d40", // 200,000
      preVerificationGas: "0xc350", // 50,000
    };
  }
}

/**
 * Request paymaster sponsorship from Alchemy Gas Manager
 * @param userOp - The UserOperation to sponsor (without signature)
 * @returns Updated UserOperation with paymaster data
 */
export async function requestPaymasterAndData(
  userOp: Partial<UserOperation>
): Promise<{
  paymasterAndData: string;
  callGasLimit?: string;
  verificationGasLimit?: string;
  preVerificationGas?: string;
}> {
  const bundlerUrl = getAlchemyBundlerUrl();
  const policyId = getGasManagerPolicyId();

  if (!policyId) {
    console.warn("No Gas Manager policy ID configured - paymaster not available");
    return { paymasterAndData: "0x" };
  }

  console.log("Requesting paymaster sponsorship:", {
    sender: userOp.sender,
    policyId,
  });

  try {
    const response = await fetch(bundlerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Alchemy-AA-Gas-Policy-Id": policyId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_requestPaymasterAndData",
        params: [
          {
            policyId,
            entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
            userOperation: userOp,
          },
        ],
      }),
    });

    const data = (await response.json()) as BundlerResponse<{
      paymasterAndData: string;
      callGasLimit?: string;
      verificationGasLimit?: string;
      preVerificationGas?: string;
    }>;

    if (data.error) {
      console.error("Paymaster error:", data.error);
      throw new Error(`Paymaster error: ${data.error.message}`);
    }

    if (!data.result) {
      throw new Error("No paymaster data returned");
    }

    console.log("Paymaster sponsorship approved:", {
      paymasterAndData: data.result.paymasterAndData.slice(0, 20) + "...",
    });

    return data.result;
  } catch (error) {
    console.error("Error requesting paymaster:", error);
    throw error;
  }
}

/**
 * Wait for UserOperation to be confirmed (included in a block)
 * @param userOpHash - The UserOperation hash to wait for
 * @param timeoutMs - Maximum time to wait in milliseconds (default: 30 seconds)
 * @returns Promise that resolves when UserOp is confirmed
 */
export async function waitForUserOpConfirmation(
  userOpHash: string,
  timeoutMs: number = 30000
): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 2000; // Check every 2 seconds
  
  console.log(`⏳ Waiting for UserOp confirmation: ${userOpHash.slice(0, 10)}...`);
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      const receipt = await getUserOperationReceipt(userOpHash);
      
      if (receipt) {
        if (receipt.success) {
          console.log(`✅ UserOp confirmed successfully: ${userOpHash.slice(0, 10)}...`);
          return;
        } else {
          throw new Error(`UserOperation failed: ${userOpHash}`);
        }
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error(`Error checking UserOp status: ${error}`);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }
  
  throw new Error(`UserOperation confirmation timeout after ${timeoutMs}ms: ${userOpHash}`);
}

/**
 * Get supported EntryPoint addresses
 * @returns Array of EntryPoint addresses supported by the bundler
 */
export async function getSupportedEntryPoints(): Promise<string[]> {
  const bundlerUrl = getAlchemyBundlerUrl();

  try {
    const response = await fetch(bundlerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_supportedEntryPoints",
        params: [],
      }),
    });

    const data = (await response.json()) as BundlerResponse<string[]>;

    if (data.error || !data.result) {
      console.error("Error getting supported entry points:", data.error);
      return ["0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"]; // Default to v0.6
    }

    return data.result;
  } catch (error) {
    console.error("Error fetching supported EntryPoints:", error);
    return ["0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"]; // Default to v0.6
  }
}
