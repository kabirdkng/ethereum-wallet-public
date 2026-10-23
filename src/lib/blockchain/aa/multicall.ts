/**
 * Account Abstraction transfer utilities for SimpleAccount (Alchemy)
 * 
 * IMPORTANT: Alchemy's SimpleAccount only has execute(), NOT executeBatch()
 * For multiple transfers (recipient + platform fee), we need to:
 * 1. Send 2 sequential UserOperations (more gas but simpler)
 * 2. OR use a single UserOp that transfers to recipient, then handle fee separately
 * 
 * Current implementation: Single transfer per UserOp (caller handles batching if needed)
 */

import { encodeFunctionData, type Address, type WalletClient, keccak256, encodeAbiParameters, parseAbiParameters, maxUint256 } from "viem";
import { getPublicClient } from "../client";
import { getSmartWalletAddress, getSmartWalletInitCode, isSmartWalletDeployed } from "./account";
import { ENTRYPOINT_V06_ADDRESS, ENTRYPOINT_ABI, MULTICALL3_ADDRESS } from "./contracts";
import { getGasManagerPolicyId } from "./contracts";
import type { UserOperation } from "./bundler";

/**
 * ERC20 ABI for transfer and approve functions
 */
const ERC20_ABI = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transferFrom",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * SimpleAccount ABI - only has execute(), NOT executeBatch()
 */
const SIMPLE_ACCOUNT_ABI = [
  {
    inputs: [
      { name: "dest", type: "address" },
      { name: "value", type: "uint256" },
      { name: "func", type: "bytes" },
    ],
    name: "execute",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * Multicall3 ABI for aggregate3 function
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
 * Check if smart wallet has approved Multicall3 to spend ERC20 tokens
 */
async function hasMulticall3Approval(
  smartWalletAddress: Address,
  tokenAddress: Address
): Promise<boolean> {
  const publicClient = getPublicClient();
  
  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: [{
      inputs: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
      ],
      name: "allowance",
      outputs: [{ name: "", type: "uint256" }],
      stateMutability: "view",
      type: "function",
    }],
    functionName: "allowance",
    args: [smartWalletAddress, MULTICALL3_ADDRESS],
  });

  // Check if allowance is sufficient (we use max uint256 for unlimited approval)
  const minRequired = BigInt("1000000000000"); // 1M USDC with 6 decimals = 1 trillion base units
  return allowance >= minRequired;
}

export interface BatchedCall {
  target: Address;
  data: `0x${string}`;
}

export interface ERC20Transfer {
  tokenAddress: Address;
  recipient: Address;
  amount: bigint;
}

export interface GasEstimate {
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  totalGasLimit: bigint;
  estimatedCostWei: bigint;
  estimatedCostEth: string;
  source: 'alchemy' | 'fallback';
}

/**
 * Build UserOperation for a single ERC20 transfer
 * Since SimpleAccount only has execute(), we can't batch multiple transfers in one UserOp
 * 
 * @param walletClient - EOA wallet client (used to sign)
 * @param tokenAddress - ERC20 token address (e.g., USDC)
 * @param recipient - Recipient address
 * @param amount - Amount to transfer
 * @param gasMultiplier - Gas price multiplier (default: 1.0)
 * @returns UserOperation ready to submit to bundler
 */
export async function buildERC20TransferUserOp(
  walletClient: WalletClient,
  tokenAddress: Address,
  recipient: Address,
  amount: bigint,
  gasMultiplier: number = 1.0
): Promise<UserOperation> {
  const eoaAddress = walletClient.account?.address;
  if (!eoaAddress) {
    throw new Error("Wallet client must have an account");
  }

  const publicClient = getPublicClient();
  const smartWalletAddress = await getSmartWalletAddress(eoaAddress);
  const isDeployed = await isSmartWalletDeployed(smartWalletAddress);

  console.log("🔨 Building UserOperation for single ERC20 transfer:", {
    smartWalletAddress,
    isDeployed,
    recipient,
    amount: amount.toString(),
  });

  // Encode ERC20 transfer call
  const transferCalldata = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [recipient, amount],
  });

  // Wrap in SimpleAccount.execute(tokenAddress, 0, transferCalldata)
  const executeCalldata = encodeFunctionData({
    abi: SIMPLE_ACCOUNT_ABI,
    functionName: "execute",
    args: [tokenAddress, BigInt(0), transferCalldata],
  });

  // Get nonce from EntryPoint
  const nonce = await publicClient.readContract({
    address: ENTRYPOINT_V06_ADDRESS,
    abi: ENTRYPOINT_ABI,
    functionName: "getNonce",
    args: [smartWalletAddress, BigInt(0)],
  });

  // Get initCode (only needed if wallet not deployed)
  const initCode = isDeployed ? "0x" : await getSmartWalletInitCode(eoaAddress);

  // Get current gas prices
  const feeData = await publicClient.estimateFeesPerGas();
  
  // Alchemy Bundler requires minimum 100000000 wei (0.1 gwei) for maxPriorityFeePerGas
  // Add 20% buffer to handle replacement transactions
  const minPriorityFee = BigInt(120_000_000); // 0.12 gwei minimum
  const minMaxFee = BigInt(120_000_000); // 0.12 gwei minimum
  
  const estimatedMaxFee = feeData.maxFeePerGas
    ? BigInt(Math.floor(Number(feeData.maxFeePerGas) * gasMultiplier))
    : BigInt(30_000_000_000); // 30 gwei fallback
  const maxFeePerGas = estimatedMaxFee > minMaxFee ? estimatedMaxFee : minMaxFee;
  
  const estimatedPriorityFee = feeData.maxPriorityFeePerGas
    ? BigInt(Math.floor(Number(feeData.maxPriorityFeePerGas) * gasMultiplier))
    : BigInt(2_000_000_000); // 2 gwei fallback
  const maxPriorityFeePerGas = estimatedPriorityFee > minPriorityFee ? estimatedPriorityFee : minPriorityFee;

  // Initial gas estimates (will be refined by Alchemy paymaster)
  const callGasLimit = BigInt(100_000); // Single ERC20 transfer
  const verificationGasLimit = isDeployed ? BigInt(100_000) : BigInt(500_000);
  const preVerificationGas = BigInt(60_000); // Alchemy requires ~52k minimum, use 60k for safety

  console.log("⛽ Initial gas estimation (will be refined by Alchemy):", {
    callGasLimit: callGasLimit.toString(),
    verificationGasLimit: verificationGasLimit.toString(),
    preVerificationGas: preVerificationGas.toString(),
    totalGas: (callGasLimit + verificationGasLimit + preVerificationGas).toString(),
    maxFeePerGas: maxFeePerGas.toString(),
  });

  // Get Alchemy Gas Manager policy ID
  const policyId = getGasManagerPolicyId();
  if (!policyId) {
    throw new Error(
      "NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID not set. Enable Gas Manager in Alchemy dashboard."
    );
  }

  // Construct dummy paymasterAndData (will be replaced by Alchemy's API)
  // Format: <paymaster_address><policy_id>
  const dummyPaymasterAndData = "0x";

  // Build UserOperation
  const userOp: UserOperation = {
    sender: smartWalletAddress,
    nonce: `0x${nonce.toString(16)}`,
    initCode,
    callData: executeCalldata,
    callGasLimit: `0x${callGasLimit.toString(16)}`,
    verificationGasLimit: `0x${verificationGasLimit.toString(16)}`,
    preVerificationGas: `0x${preVerificationGas.toString(16)}`,
    maxFeePerGas: `0x${maxFeePerGas.toString(16)}`,
    maxPriorityFeePerGas: `0x${maxPriorityFeePerGas.toString(16)}`,
    paymasterAndData: dummyPaymasterAndData,
    signature: "0x", // Will be set after getting paymaster data
  };

  // Get paymaster sponsorship from Alchemy
  console.log("💰 Requesting paymaster sponsorship from Alchemy...");
  const sponsoredUserOp = await getPaymasterSponsoredUserOp(userOp, policyId);

  // Sign the UserOperation
  console.log("✍️  Signing UserOperation...");
  const signedUserOp = await signUserOperation(walletClient, sponsoredUserOp);

  console.log("✅ Batched UserOperation built and signed:", {
    sender: signedUserOp.sender,
    nonce: signedUserOp.nonce,
    hasPaymaster: signedUserOp.paymasterAndData !== "0x",
    hasSignature: signedUserOp.signature !== "0x",
  });

  return signedUserOp;
}

/**
 * Get paymaster-sponsored UserOperation from Alchemy
 * This calls Alchemy's Gas Manager API to sponsor the gas
 */
async function getPaymasterSponsoredUserOp(
  userOp: UserOperation,
  policyId: string
): Promise<UserOperation> {
  const bundlerUrl = (await import("./contracts")).getAlchemyBundlerUrl();

  const response = await fetch(bundlerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "alchemy_requestPaymasterAndData",
      params: [
        {
          policyId,
          entryPoint: ENTRYPOINT_V06_ADDRESS,
          userOperation: {
            sender: userOp.sender,
            nonce: userOp.nonce,
            initCode: userOp.initCode,
            callData: userOp.callData,
            callGasLimit: userOp.callGasLimit,
            verificationGasLimit: userOp.verificationGasLimit,
            preVerificationGas: userOp.preVerificationGas,
            maxFeePerGas: userOp.maxFeePerGas,
            maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Paymaster request failed: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.error) {
    console.error("Paymaster error:", data.error);
    throw new Error(`Paymaster error: ${data.error.message}`);
  }

  if (!data.result) {
    throw new Error("No paymaster data returned");
  }

  console.log("✅ Received paymaster sponsorship:", {
    paymasterAndData: data.result.paymasterAndData.substring(0, 20) + "...",
    gasLimitsUpdated: !!(data.result.callGasLimit || data.result.verificationGasLimit),
  });

  // Alchemy returns optimized gas estimates - use them!
  const finalCallGasLimit = data.result.callGasLimit || userOp.callGasLimit;
  const finalVerificationGasLimit = data.result.verificationGasLimit || userOp.verificationGasLimit;
  const finalPreVerificationGas = data.result.preVerificationGas || userOp.preVerificationGas;
  const finalMaxFeePerGas = data.result.maxFeePerGas || userOp.maxFeePerGas;
  const finalMaxPriorityFeePerGas = data.result.maxPriorityFeePerGas || userOp.maxPriorityFeePerGas;

  // Log Alchemy's optimized gas estimates
  console.log("⛽ Alchemy's optimized gas estimates:", {
    callGasLimit: finalCallGasLimit,
    verificationGasLimit: finalVerificationGasLimit,
    preVerificationGas: finalPreVerificationGas,
    totalGas: (
      BigInt(finalCallGasLimit) + 
      BigInt(finalVerificationGasLimit) + 
      BigInt(finalPreVerificationGas)
    ).toString(),
    maxFeePerGas: finalMaxFeePerGas,
    estimatedCostWei: (
      (BigInt(finalCallGasLimit) + BigInt(finalVerificationGasLimit) + BigInt(finalPreVerificationGas)) * 
      BigInt(finalMaxFeePerGas)
    ).toString(),
    sponsoredByPaymaster: true,
  });

  // Update UserOp with paymaster data and Alchemy's gas estimates
  return {
    ...userOp,
    paymasterAndData: data.result.paymasterAndData,
    callGasLimit: finalCallGasLimit,
    verificationGasLimit: finalVerificationGasLimit,
    preVerificationGas: finalPreVerificationGas,
    maxFeePerGas: finalMaxFeePerGas,
    maxPriorityFeePerGas: finalMaxPriorityFeePerGas,
  };
}

/**
 * Sign UserOperation with EOA wallet
 */
async function signUserOperation(
  walletClient: WalletClient,
  userOp: UserOperation
): Promise<UserOperation> {
  const { hexToBytes } = await import("viem");

  // Hash the UserOperation
  const userOpHash = getUserOperationHash(userOp);

  console.log("Signing UserOp hash:", userOpHash);

  if (!walletClient.account) {
    throw new Error("Wallet client must have an account to sign");
  }

  // Sign with EOA
  const signature = await walletClient.signMessage({
    account: walletClient.account,
    message: { raw: hexToBytes(userOpHash) },
  });

  return {
    ...userOp,
    signature,
  };
}

/**
 * Calculate UserOperation hash (EIP-4337 spec)
 */
function getUserOperationHash(userOp: UserOperation): `0x${string}` {
  const CHAIN_ID = BigInt(11155111); // Sepolia (update for mainnet)

  const userOpHash = keccak256(
    encodeAbiParameters(
      parseAbiParameters([
        "address",
        "uint256",
        "bytes32",
        "bytes32",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "bytes32",
      ]),
      [
        userOp.sender as `0x${string}`,
        BigInt(userOp.nonce),
        keccak256(userOp.initCode as `0x${string}`),
        keccak256(userOp.callData as `0x${string}`),
        BigInt(userOp.callGasLimit),
        BigInt(userOp.verificationGasLimit),
        BigInt(userOp.preVerificationGas),
        BigInt(userOp.maxFeePerGas),
        BigInt(userOp.maxPriorityFeePerGas),
        keccak256(userOp.paymasterAndData as `0x${string}`),
      ]
    )
  );

  return keccak256(
    encodeAbiParameters(
      parseAbiParameters(["bytes32", "address", "uint256"]),
      [userOpHash, ENTRYPOINT_V06_ADDRESS, CHAIN_ID]
    )
  );
}

/**
 * Build and send TWO UserOperations using Multicall3 pattern:
 * 1. First UserOp: Approve Multicall3 (if not already approved)
 * 2. Second UserOp: Multicall3.aggregate3 with transferFrom for batched transfers
 * 
 * Returns the batching UserOp (caller waits for this one)
 * Approval happens in background if needed
 */
export async function buildRecipientAndFeeTransferUserOp(
  walletClient: WalletClient,
  tokenAddress: Address,
  recipientAddress: Address,
  recipientAmount: bigint,
  feeRecipient: Address,
  feeAmount: bigint,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  gasMultiplier: number = 1.0 // TODO: Apply gas multiplier to fee calculations
): Promise<UserOperation> {
  const eoaAddress = walletClient.account?.address;
  if (!eoaAddress) {
    throw new Error("Wallet client must have an account");
  }

  const smartWalletAddress = await getSmartWalletAddress(eoaAddress);
  
  console.log("🔨 Building batched transfer with Multicall3:", {
    recipientAddress,
    recipientAmount: recipientAmount.toString(),
    feeRecipient,
    feeAmount: feeAmount.toString(),
  });
  
  // Check if Multicall3 has approval
  const hasApproval = await hasMulticall3Approval(smartWalletAddress, tokenAddress);
  
  if (!hasApproval) {
    console.log("⚠️  Multicall3 not approved yet - sending approval UserOp first");
    
    // Build and send approval UserOp
    const approvalCalldata = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [MULTICALL3_ADDRESS, maxUint256],
    });
    
    const approveExecuteCalldata = encodeFunctionData({
      abi: SIMPLE_ACCOUNT_ABI,
      functionName: "execute",
      args: [tokenAddress, BigInt(0), approvalCalldata],
    });
    
    // Build approval UserOp (simplified - we'll need full UserOp building logic)
    // For now, submit it in background
    const publicClient = getPublicClient();
    const nonce = await publicClient.readContract({
      address: ENTRYPOINT_V06_ADDRESS,
      abi: ENTRYPOINT_ABI,
      functionName: "getNonce",
      args: [smartWalletAddress, BigInt(0)],
    });
    
    const isDeployed = await isSmartWalletDeployed(smartWalletAddress);
    const initCode = isDeployed ? "0x" : await getSmartWalletInitCode(eoaAddress);
    
    const feeData = await publicClient.estimateFeesPerGas();
    const minFee = BigInt(120_000_000);
    const maxFeePerGas = (feeData.maxFeePerGas && feeData.maxFeePerGas > minFee) ? feeData.maxFeePerGas : minFee;
    const maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas && feeData.maxPriorityFeePerGas > minFee) ? feeData.maxPriorityFeePerGas : minFee;
    
    const approvalUserOp: UserOperation = {
      sender: smartWalletAddress,
      nonce: `0x${nonce.toString(16)}`,
      initCode,
      callData: approveExecuteCalldata,
      callGasLimit: "0x" + BigInt(100_000).toString(16),
      verificationGasLimit: "0x" + (isDeployed ? BigInt(100_000) : BigInt(500_000)).toString(16),
      preVerificationGas: "0x" + BigInt(60_000).toString(16),
      maxFeePerGas: `0x${maxFeePerGas.toString(16)}`,
      maxPriorityFeePerGas: `0x${maxPriorityFeePerGas.toString(16)}`,
      paymasterAndData: "0x",
      signature: "0x",
    };
    
    const policyId = getGasManagerPolicyId();
    if (policyId) {
      const sponsoredApprovalUserOp = await getPaymasterSponsoredUserOp(approvalUserOp, policyId);
      const signedApprovalUserOp = await signUserOperation(walletClient, sponsoredApprovalUserOp);
      
      // Submit approval synchronously and wait for confirmation
      const { sendUserOperation, waitForUserOpConfirmation } = await import("./bundler");
      
      console.log("📤 Submitting approval UserOp and waiting for confirmation...");
      
      try {
        const approvalHash = await sendUserOperation(signedApprovalUserOp, walletClient);
        console.log("✅ Multicall3 approval UserOp submitted:", approvalHash);
        
        // Wait for the approval to be confirmed before proceeding
        // This ensures the nonce is consumed before we build the transfer UserOp
        console.log("⏳ Waiting for approval confirmation...");
        await waitForUserOpConfirmation(approvalHash);
        console.log("✅ Approval confirmed, proceeding with transfer");
        
        // Add a small delay to ensure nonce is properly updated
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error("❌ Multicall3 approval failed:", error);
        throw new Error(`Approval transaction failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  
  // Build Multicall3 aggregate3 call with transferFrom
  const multicallCalls = [
    {
      target: tokenAddress,
      allowFailure: false,
      callData: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transferFrom",
        args: [smartWalletAddress, recipientAddress, recipientAmount],
      }),
    },
    {
      target: tokenAddress,
      allowFailure: false,
      callData: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transferFrom",
        args: [smartWalletAddress, feeRecipient, feeAmount],
      }),
    },
  ];
  
  const multicallCalldata = encodeFunctionData({
    abi: MULTICALL3_ABI,
    functionName: "aggregate3",
    args: [multicallCalls],
  });
  
  const executeCalldata = encodeFunctionData({
    abi: SIMPLE_ACCOUNT_ABI,
    functionName: "execute",
    args: [MULTICALL3_ADDRESS, BigInt(0), multicallCalldata],
  });
  
  // Build full UserOp for the batched transfer
  const publicClient = getPublicClient();
  const nonce = await publicClient.readContract({
    address: ENTRYPOINT_V06_ADDRESS,
    abi: ENTRYPOINT_ABI,
    functionName: "getNonce",
    args: [smartWalletAddress, BigInt(0)],
  });
  
  const isDeployed = await isSmartWalletDeployed(smartWalletAddress);
  const initCode = isDeployed ? "0x" : await getSmartWalletInitCode(eoaAddress);
  
  const feeData = await publicClient.estimateFeesPerGas();
  const minFee = BigInt(120_000_000);
  const maxFeePerGas = (feeData.maxFeePerGas && feeData.maxFeePerGas > minFee) ? feeData.maxFeePerGas : minFee;
  const maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas && feeData.maxPriorityFeePerGas > minFee) ? feeData.maxPriorityFeePerGas : minFee;
  
  const userOp: UserOperation = {
    sender: smartWalletAddress,
    nonce: `0x${nonce.toString(16)}`,
    initCode,
    callData: executeCalldata,
    callGasLimit: "0x" + BigInt(150_000).toString(16), // Higher for Multicall3
    verificationGasLimit: "0x" + (isDeployed ? BigInt(100_000) : BigInt(500_000)).toString(16),
    preVerificationGas: "0x" + BigInt(60_000).toString(16),
    maxFeePerGas: `0x${maxFeePerGas.toString(16)}`,
    maxPriorityFeePerGas: `0x${maxPriorityFeePerGas.toString(16)}`,
    paymasterAndData: "0x",
    signature: "0x",
  };
  
  const policyId = getGasManagerPolicyId();
  if (!policyId) {
    throw new Error("Gas Manager policy ID required");
  }
  
  const sponsoredUserOp = await getPaymasterSponsoredUserOp(userOp, policyId);
  const signedUserOp = await signUserOperation(walletClient, sponsoredUserOp);
  
  console.log("✅ Batched Multicall3 UserOp built");
  
  return signedUserOp;
}

/**
 * Extract gas estimate details from a UserOperation
 * Useful for showing gas breakdown in UI
 */
export function getGasEstimateFromUserOp(userOp: UserOperation): GasEstimate {
  const callGasLimit = BigInt(userOp.callGasLimit);
  const verificationGasLimit = BigInt(userOp.verificationGasLimit);
  const preVerificationGas = BigInt(userOp.preVerificationGas);
  const maxFeePerGas = BigInt(userOp.maxFeePerGas);
  const maxPriorityFeePerGas = BigInt(userOp.maxPriorityFeePerGas);
  
  const totalGasLimit = callGasLimit + verificationGasLimit + preVerificationGas;
  const estimatedCostWei = totalGasLimit * maxFeePerGas;
  const estimatedCostEth = (Number(estimatedCostWei) / 1e18).toFixed(6);
  
  return {
    callGasLimit,
    verificationGasLimit,
    preVerificationGas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    totalGasLimit,
    estimatedCostWei,
    estimatedCostEth,
    source: userOp.paymasterAndData !== "0x" ? 'alchemy' : 'fallback',
  };
}
