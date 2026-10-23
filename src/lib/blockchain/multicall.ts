/**
 * Multicall utilities for batching multiple transactions
 * Optimizes gas costs by executing multiple operations in a single transaction
 */

import { encodeFunctionData } from "viem";
import { ERC20_ABI } from "@/config/blockchain";

/**
 * Multicall3 ABI (minimal interface for aggregate3 function)
 * Deployed at same address on all chains: 0xcA11bde05977b3631167028862bE2a173976CA11
 */
const MULTICALL3_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" },
        ],
        name: "calls",
        type: "tuple[]",
      },
    ],
    name: "aggregate3",
    outputs: [
      {
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
        name: "returnData",
        type: "tuple[]",
      },
    ],
    stateMutability: "payable",
    type: "function",
  },
] as const;

/**
 * Multicall3 contract address (same on all EVM chains)
 */
export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

interface TransferCall {
  to: `0x${string}`;
  amount: bigint;
}

/**
 * Batch multiple ERC20 transfers into a single transaction using Multicall3
 * @param walletClient - Configured wallet client with account
 * @param tokenAddress - ERC20 token contract address
 * @param transfers - Array of transfer calls (recipient + amount)
 * @param allowFailure - Whether to allow individual transfers to fail (default: false)
 * @returns Transaction hash
 */
export async function batchERC20Transfers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walletClient: any,
  tokenAddress: `0x${string}`,
  transfers: TransferCall[],
  allowFailure: boolean = false,
  gasMultiplier: number = 1.0
): Promise<`0x${string}`> {
  console.log("batchERC20Transfers called with:", {
    tokenAddress,
    transfers: transfers.map(t => ({ to: t.to, amount: t.amount.toString() })),
    allowFailure,
    multicallAddress: MULTICALL3_ADDRESS,
    userAddress: walletClient.account.address
  });

  // Encode each transferFrom call (not transfer!)
  // transferFrom is needed because Multicall3 is making the call, not the user directly
  const calls = transfers.map((transfer) => ({
    target: tokenAddress,
    allowFailure,
    callData: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transferFrom",
      args: [walletClient.account.address, transfer.to, transfer.amount],
    }),
  }));

  console.log("Encoded calls:", calls);

  // Get current gas price and apply multiplier
  const publicClient = (await import("./client")).getPublicClient();
  const feeData = await publicClient.estimateFeesPerGas();
  
  const maxFeePerGas = feeData.maxFeePerGas 
    ? BigInt(Math.floor(Number(feeData.maxFeePerGas) * gasMultiplier))
    : undefined;
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas
    ? BigInt(Math.floor(Number(feeData.maxPriorityFeePerGas) * gasMultiplier))
    : undefined;

  console.log("Gas settings:", {
    multiplier: gasMultiplier,
    maxFeePerGas: maxFeePerGas?.toString(),
    maxPriorityFeePerGas: maxPriorityFeePerGas?.toString()
  });

  // Execute multicall with custom gas
  const hash = await walletClient.writeContract({
    address: MULTICALL3_ADDRESS,
    abi: MULTICALL3_ABI,
    functionName: "aggregate3",
    args: [calls],
    ...(maxFeePerGas && { maxFeePerGas }),
    ...(maxPriorityFeePerGas && { maxPriorityFeePerGas }),
  });

  console.log("Multicall3 transaction hash:", hash);
  return hash;
}

/**
 * Check if multicall3 is available on the current chain
 * @param chainId - Chain ID to check
 * @returns true if multicall3 is available (it's deployed on all major chains)
 */
export function isMulticallAvailable(chainId?: number): boolean {
  // Multicall3 is deployed on all major chains at the same address
  // Including mainnet (1), sepolia (11155111), goerli (5), polygon (137), etc.
  // For simplicity, we assume it's always available
  // In production, you might want to verify the contract exists
  return chainId !== undefined;
}

/**
 * Batch a transfer with platform fee using Multicall3
 * Requires token approval for Multicall3 before execution
 * 
 * @param walletClient - Configured wallet client with account
 * @param tokenAddress - ERC20 token contract address
 * @param recipientAddress - Main recipient address
 * @param recipientAmount - Amount to send to recipient
 * @param feeRecipient - Platform fee recipient address
 * @param feeAmount - Platform fee amount
 * @param onProgress - Optional callback for status updates
 * @returns Transaction hash
 */
export async function batchTransferWithFee(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walletClient: any,
  tokenAddress: `0x${string}`,
  recipientAddress: `0x${string}`,
  recipientAmount: bigint,
  feeRecipient: `0x${string}`,
  feeAmount: bigint,
  onProgress?: (status: 'checking' | 'approving' | 'approved' | 'transferring') => void,
  gasMultiplier: number = 1.0
): Promise<`0x${string}`> {
  const totalAmount = recipientAmount + feeAmount;
  
  onProgress?.('checking');
  console.log("batchTransferWithFee: Checking token approval for Multicall3");
  
  // Check current allowance for Multicall3
  const publicClient = (await import("./client")).getPublicClient();
  const currentAllowance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [walletClient.account.address, MULTICALL3_ADDRESS],
  }) as bigint;
  
  console.log("Current Multicall3 allowance:", {
    currentAllowance: currentAllowance.toString(),
    requiredAmount: totalAmount.toString(),
    needsApproval: currentAllowance < totalAmount
  });
  
  // If allowance is insufficient, approve Multicall3 to spend tokens
  if (currentAllowance < totalAmount) {
    onProgress?.('approving');
    console.log("Approving Multicall3 to spend", totalAmount.toString(), "tokens");
    
    // Get current gas price and apply multiplier for approval
    const feeData = await publicClient.estimateFeesPerGas();
    const maxFeePerGas = feeData.maxFeePerGas 
      ? BigInt(Math.floor(Number(feeData.maxFeePerGas) * gasMultiplier))
      : undefined;
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas
      ? BigInt(Math.floor(Number(feeData.maxPriorityFeePerGas) * gasMultiplier))
      : undefined;
    
    const approvalHash = await walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [MULTICALL3_ADDRESS, totalAmount],
      ...(maxFeePerGas && { maxFeePerGas }),
      ...(maxPriorityFeePerGas && { maxPriorityFeePerGas }),
    });
    
    console.log("✓ Approval transaction broadcast:", approvalHash);
    console.log("Waiting for approval to be indexed (fast polling)...");
    
    // Fast poll for allowance update - checks every 500ms for up to 60 seconds
    let attempts = 0;
    const maxAttempts = 120; // 120 * 500ms = 60 seconds max
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
      
      const updatedAllowance = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [walletClient.account.address, MULTICALL3_ADDRESS],
      }) as bigint;
      
      if (updatedAllowance >= totalAmount) {
        console.log(`✓ Approval confirmed after ${(attempts + 1) * 500}ms`);
        onProgress?.('approved');
        break;
      }
      
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      throw new Error("Approval transaction timed out. Please try again.");
    }
  } else {
    onProgress?.('approved');
  }
  
  // Now execute the batched transfer
  onProgress?.('transferring');
  return batchERC20Transfers(
    walletClient,
    tokenAddress,
    [
      { to: recipientAddress, amount: recipientAmount },
      { to: feeRecipient, amount: feeAmount },
    ],
    false, // Don't allow failures - both transfers must succeed
    gasMultiplier // Pass gas multiplier through
  );
}
