/**
 * UserOperation builder and utilities
 * Constructs EIP-4337 UserOperations for smart wallet transactions
 */

import { encodeFunctionData, type Address, type WalletClient, hexToBytes, keccak256, encodeAbiParameters, parseAbiParameters, concat, toHex } from "viem";
import { getPublicClient } from "../client";
import { getSmartWalletAddress, getSmartWalletInitCode, isSmartWalletDeployed } from "./account";
import { ENTRYPOINT_V06_ADDRESS, ENTRYPOINT_ABI } from "./contracts";
import { getGasManagerPolicyId } from "./contracts";
import type { UserOperation } from "./bundler";

/**
 * ERC20 ABI for transfer function
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
] as const;

/**
 * SimpleAccount ABI for execute function
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
  {
    inputs: [
      {
        components: [
          { name: "target", type: "address" },
          { name: "data", type: "bytes" },
        ],
        name: "calls",
        type: "tuple[]",
      },
    ],
    name: "executeBatch",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * Build UserOperation for a single ERC20 transfer
 */
export async function buildERC20TransferUserOp(
  walletClient: WalletClient,
  tokenAddress: Address,
  recipientAddress: Address,
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

  // Encode the ERC20 transfer call
  const transferCalldata = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [recipientAddress, amount],
  });

  // Encode the smart wallet execute call
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

  // Get gas estimates
  const feeData = await publicClient.estimateFeesPerGas();
  const baseGasPrice = feeData.maxFeePerGas || BigInt(20000000000); // 20 gwei fallback
  const adjustedGasPrice = BigInt(Math.floor(Number(baseGasPrice) * gasMultiplier));
  
  // Bundler requires minimum 0.1 gwei (100000000 wei) for both fee fields
  // Add 20% buffer to handle replacement transactions ("replacement underpriced" errors)
  const minFeePerGas = BigInt(120000011); // 0.12 gwei minimum (20% above bundler requirement)
  const maxFeePerGas = adjustedGasPrice > minFeePerGas ? adjustedGasPrice : minFeePerGas;
  
  const estimatedPriorityFee = feeData.maxPriorityFeePerGas || BigInt(2000000000); // 2 gwei fallback
  const minPriorityFee = BigInt(120000000); // 0.12 gwei minimum (20% above bundler requirement)
  const maxPriorityFee = estimatedPriorityFee > minPriorityFee ? estimatedPriorityFee : minPriorityFee;

  // Gas limits (deployment requires significantly more gas)
  // Single ERC20 transfer needs ~50-60k gas, add buffer for safety
  const callGasLimit = isDeployed ? BigInt(150000) : BigInt(500000); // Sufficient for single transfer
  const verificationGasLimit = isDeployed ? BigInt(100000) : BigInt(500000); // Higher for deployment
  const preVerificationGas = isDeployed ? BigInt(50000) : BigInt(100000); // Higher for deployment

  // Build the UserOperation (without paymaster initially)
  const userOp: Partial<UserOperation> = {
    sender: smartWalletAddress,
    nonce: `0x${nonce.toString(16)}`,
    initCode: isDeployed ? "0x" : getSmartWalletInitCode(eoaAddress),
    callData: executeCalldata,
    callGasLimit: `0x${callGasLimit.toString(16)}`,
    verificationGasLimit: `0x${verificationGasLimit.toString(16)}`,
    preVerificationGas: `0x${preVerificationGas.toString(16)}`,
    maxFeePerGas: `0x${maxFeePerGas.toString(16)}`,
    maxPriorityFeePerGas: `0x${maxPriorityFee.toString(16)}`,
    paymasterAndData: "0x", // Will be filled by Gas Manager
  };

  // Request paymaster sponsorship if Gas Manager is configured
  const policyId = getGasManagerPolicyId();
  if (policyId) {
    const { requestPaymasterAndData } = await import("./bundler");
    const paymasterData = await requestPaymasterAndData(userOp);
    
    console.log("Paymaster response (single):", {
      originalCallGasLimit: userOp.callGasLimit,
      paymasterCallGasLimit: paymasterData.callGasLimit,
    });
    
    // Update UserOp with paymaster data
    userOp.paymasterAndData = paymasterData.paymasterAndData;
    
    // CRITICAL: Only override gas limits if paymaster provides HIGHER values
    if (paymasterData.callGasLimit && userOp.callGasLimit) {
      const paymasterCallGas = BigInt(paymasterData.callGasLimit);
      const ourCallGas = BigInt(userOp.callGasLimit);
      userOp.callGasLimit = paymasterCallGas > ourCallGas 
        ? paymasterData.callGasLimit 
        : userOp.callGasLimit;
      console.log("Final callGasLimit (single):", userOp.callGasLimit, `(${BigInt(userOp.callGasLimit).toString()} gas)`);
    }
    if (paymasterData.verificationGasLimit && userOp.verificationGasLimit) {
      const paymasterVerifGas = BigInt(paymasterData.verificationGasLimit);
      const ourVerifGas = BigInt(userOp.verificationGasLimit);
      userOp.verificationGasLimit = paymasterVerifGas > ourVerifGas
        ? paymasterData.verificationGasLimit
        : userOp.verificationGasLimit;
    }
    if (paymasterData.preVerificationGas && userOp.preVerificationGas) {
      const paymasterPreVerifGas = BigInt(paymasterData.preVerificationGas);
      const ourPreVerifGas = BigInt(userOp.preVerificationGas);
      userOp.preVerificationGas = paymasterPreVerifGas > ourPreVerifGas
        ? paymasterData.preVerificationGas
        : userOp.preVerificationGas;
    }
  }

  // Sign the UserOperation
  const signature = await signUserOperation(walletClient, userOp);

  return {
    ...userOp,
    signature,
  } as UserOperation;
}

/**
 * Build UserOperation for batched ERC20 transfers
 * Uses Multicall3 to batch multiple transfers in a single execute() call
 * since Alchemy's SimpleAccount doesn't support executeBatch()
 */
export async function buildBatchedERC20TransferUserOp(
  walletClient: WalletClient,
  tokenAddress: Address,
  transfers: Array<{ to: Address; amount: bigint }>,
  gasMultiplier: number = 1.0
): Promise<UserOperation> {
  const eoaAddress = walletClient.account?.address;
  if (!eoaAddress) {
    throw new Error("Wallet client must have an account");
  }

  const publicClient = getPublicClient();
  const smartWalletAddress = await getSmartWalletAddress(eoaAddress);
  const isDeployed = await isSmartWalletDeployed(smartWalletAddress);

  console.log("🔄 Building batched transfer using Multicall3 wrapper");

  // Build Multicall3 calls for each transfer
  const multicallCalls = transfers.map((transfer) => {
    const transferCalldata = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [transfer.to, transfer.amount],
    });

    return {
      target: tokenAddress,
      allowFailure: false,
      callData: transferCalldata,
    };
  });

  // Encode Multicall3.aggregate3 call
  const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
  const multicallCalldata = encodeFunctionData({
    abi: [
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
    ],
    functionName: "aggregate3",
    args: [multicallCalls],
  });

  // Use single execute() call to Multicall3
  const executeCalldata = encodeFunctionData({
    abi: SIMPLE_ACCOUNT_ABI,
    functionName: "execute",
    args: [MULTICALL3_ADDRESS as Address, BigInt(0), multicallCalldata],
  });

  console.log("Batched transfer via Multicall3:", {
    numTransfers: transfers.length,
    transfers: transfers.map((t, i) => ({
      index: i,
      to: t.to,
      amount: t.amount.toString(),
      amountUSDC: (Number(t.amount) / 1e6).toFixed(6),
    })),
    multicallAddress: MULTICALL3_ADDRESS,
    calldataLength: executeCalldata.length,
  });

  // Get nonce from EntryPoint
  const nonce = await publicClient.readContract({
    address: ENTRYPOINT_V06_ADDRESS,
    abi: ENTRYPOINT_ABI,
    functionName: "getNonce",
    args: [smartWalletAddress, BigInt(0)],
  });

  // Get gas estimates
  const feeData = await publicClient.estimateFeesPerGas();
  const baseGasPrice = feeData.maxFeePerGas || BigInt(20000000000);
  const adjustedGasPrice = BigInt(Math.floor(Number(baseGasPrice) * gasMultiplier));
  
  // Bundler requires minimum 0.1 gwei (100000000 wei) for both fee fields
  // Add 20% buffer to handle replacement transactions ("replacement underpriced" errors)
  const minFeePerGas = BigInt(120000011); // 0.12 gwei minimum (20% above bundler requirement)
  const maxFeePerGas = adjustedGasPrice > minFeePerGas ? adjustedGasPrice : minFeePerGas;
  
  const estimatedPriorityFee = feeData.maxPriorityFeePerGas || BigInt(2000000000);
  const minPriorityFee = BigInt(120000000); // 0.12 gwei minimum (20% above bundler requirement)
  const maxPriorityFee = estimatedPriorityFee > minPriorityFee ? estimatedPriorityFee : minPriorityFee;

  // Gas limits (deployment requires significantly more gas, batched operations need extra)
  // For batched operations: Each ERC20 transfer ~50-60k gas, batch overhead ~30k, buffer for safety
  const callGasLimit = isDeployed 
    ? BigInt(250000) // Increased for batched ERC20 transfers (was 150k, too low)
    : BigInt(600000); // Higher for deployment
  const verificationGasLimit = isDeployed ? BigInt(100000) : BigInt(500000); // Higher for deployment
  const preVerificationGas = isDeployed ? BigInt(60000) : BigInt(100000); // Higher for deployment

  // Build the UserOperation (without paymaster initially)
  const userOp: Partial<UserOperation> = {
    sender: smartWalletAddress,
    nonce: `0x${nonce.toString(16)}`,
    initCode: isDeployed ? "0x" : getSmartWalletInitCode(eoaAddress),
    callData: executeCalldata,
    callGasLimit: `0x${callGasLimit.toString(16)}`,
    verificationGasLimit: `0x${verificationGasLimit.toString(16)}`,
    preVerificationGas: `0x${preVerificationGas.toString(16)}`,
    maxFeePerGas: `0x${maxFeePerGas.toString(16)}`,
    maxPriorityFeePerGas: `0x${maxPriorityFee.toString(16)}`,
    paymasterAndData: "0x",
  };

  // Request paymaster sponsorship if Gas Manager is configured
  const policyId = getGasManagerPolicyId();
  if (policyId) {
    const { requestPaymasterAndData } = await import("./bundler");
    const paymasterData = await requestPaymasterAndData(userOp);
    
    console.log("Paymaster response (batched):", {
      originalCallGasLimit: userOp.callGasLimit,
      paymasterCallGasLimit: paymasterData.callGasLimit,
    });
    
    // Update UserOp with paymaster data
    userOp.paymasterAndData = paymasterData.paymasterAndData;
    
    // CRITICAL: Only override gas limits if paymaster provides HIGHER values
    if (paymasterData.callGasLimit && userOp.callGasLimit) {
      const paymasterCallGas = BigInt(paymasterData.callGasLimit);
      const ourCallGas = BigInt(userOp.callGasLimit);
      userOp.callGasLimit = paymasterCallGas > ourCallGas 
        ? paymasterData.callGasLimit 
        : userOp.callGasLimit;
      console.log("Final callGasLimit (batched):", userOp.callGasLimit, `(${BigInt(userOp.callGasLimit).toString()} gas)`);
    }
    if (paymasterData.verificationGasLimit && userOp.verificationGasLimit) {
      const paymasterVerifGas = BigInt(paymasterData.verificationGasLimit);
      const ourVerifGas = BigInt(userOp.verificationGasLimit);
      userOp.verificationGasLimit = paymasterVerifGas > ourVerifGas
        ? paymasterData.verificationGasLimit
        : userOp.verificationGasLimit;
    }
    if (paymasterData.preVerificationGas && userOp.preVerificationGas) {
      const paymasterPreVerifGas = BigInt(paymasterData.preVerificationGas);
      const ourPreVerifGas = BigInt(userOp.preVerificationGas);
      userOp.preVerificationGas = paymasterPreVerifGas > ourPreVerifGas
        ? paymasterData.preVerificationGas
        : userOp.preVerificationGas;
    }
  }

  // Sign the UserOperation
  const signature = await signUserOperation(walletClient, userOp);

  return {
    ...userOp,
    signature,
  } as UserOperation;
}

/**
 * Sign a UserOperation with the EOA's private key
 * The signature proves ownership of the smart wallet
 */
async function signUserOperation(
  walletClient: WalletClient,
  userOp: Partial<UserOperation>
): Promise<string> {
  try {
    // Hash the UserOperation according to EIP-4337
    const userOpHash = getUserOperationHash(userOp);

    // Sign with the EOA (wallet client)
    const signature = await walletClient.signMessage({
      // @ts-expect-error - account is guaranteed to exist
      account: walletClient.account,
      message: { raw: hexToBytes(userOpHash as `0x${string}`) },
    });

    console.log("UserOperation signed:", {
      sender: userOp.sender,
      signature: signature.slice(0, 10) + "...",
    });

    return signature;
  } catch (error) {
    console.error("Error signing UserOperation:", error);
    throw new Error("Failed to sign UserOperation");
  }
}

/**
 * Re-sign a UserOperation for retry (exported for use in bundler retry logic)
 * Used when gas prices are increased after "replacement underpriced" errors
 */
export async function signUserOperationRetry(
  walletClient: WalletClient,
  userOp: Partial<UserOperation>
): Promise<string> {
  return signUserOperation(walletClient, userOp);
}

/**
 * Calculate the UserOperation hash for signing
 * Follows EIP-4337 specification
 * Reference: https://eips.ethereum.org/EIPS/eip-4337#specification
 */
function getUserOperationHash(userOp: Partial<UserOperation>): `0x${string}` {
  try {
    const publicClient = getPublicClient();
    const chainId = publicClient.chain?.id || 11155111; // Default to Sepolia

    // Pack the UserOperation struct according to EIP-4337
    // This must match exactly what the EntryPoint expects
    const packedUserOp = encodeAbiParameters(
      parseAbiParameters([
        'address', // sender
        'uint256', // nonce
        'bytes32', // initCode hash
        'bytes32', // callData hash
        'uint256', // callGasLimit
        'uint256', // verificationGasLimit
        'uint256', // preVerificationGas
        'uint256', // maxFeePerGas
        'uint256', // maxPriorityFeePerGas
        'bytes32', // paymasterAndData hash
      ]),
      [
        userOp.sender as Address,
        BigInt(userOp.nonce || 0),
        keccak256((userOp.initCode || '0x') as `0x${string}`),
        keccak256((userOp.callData || '0x') as `0x${string}`),
        BigInt(userOp.callGasLimit || 0),
        BigInt(userOp.verificationGasLimit || 0),
        BigInt(userOp.preVerificationGas || 0),
        BigInt(userOp.maxFeePerGas || 0),
        BigInt(userOp.maxPriorityFeePerGas || 0),
        keccak256((userOp.paymasterAndData || '0x') as `0x${string}`),
      ]
    );

    // Hash the packed UserOp
    const userOpHash = keccak256(packedUserOp);
    
    // Combine with EntryPoint address and chain ID according to EIP-4337
    const finalHash = keccak256(
      encodeAbiParameters(
        parseAbiParameters(['bytes32', 'address', 'uint256']),
        [userOpHash, ENTRYPOINT_V06_ADDRESS, BigInt(chainId)]
      )
    );
    
    console.log("UserOperation hash details:", {
      sender: userOp.sender,
      nonce: userOp.nonce,
      chainId,
      entryPoint: ENTRYPOINT_V06_ADDRESS,
      packedHash: userOpHash.slice(0, 10) + "...",
      finalHash: finalHash.slice(0, 10) + "...",
    });

    return finalHash;
  } catch (error) {
    console.error("Error calculating UserOperation hash:", error);
    // Fallback to simpler hash if the above fails
    const fallbackData = concat([
      (userOp.sender || '0x') as `0x${string}`,
      toHex(BigInt(userOp.nonce || 0)),
      (userOp.callData || '0x') as `0x${string}`,
    ]);
    return keccak256(fallbackData);
  }
}

/**
 * Wait for UserOperation to be included in a block
 * Polls for the receipt and returns the transaction hash
 */
export async function waitForUserOperation(
  userOpHash: string,
  maxAttempts: number = 60,
  intervalMs: number = 2000
): Promise<string> {
  const { getUserOperationReceipt } = await import("./bundler");

  console.log("Waiting for UserOperation confirmation:", {
    userOpHash,
    maxAttempts,
    intervalMs,
  });

  for (let i = 0; i < maxAttempts; i++) {
    const receipt = await getUserOperationReceipt(userOpHash);

    if (receipt) {
      if (receipt.success) {
        console.log("UserOperation confirmed:", {
          userOpHash,
          transactionHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
        });

        return receipt.transactionHash;
      } else {
        console.error("UserOperation failed:", {
          userOpHash,
          receipt,
        });
        
        const txHash = receipt.transactionHash;
        const explorerUrl = `https://sepolia.etherscan.io/tx/${txHash}`;
        
        // Try to get the actual revert reason from the transaction receipt
        let revertReason = "";
        try {
          const publicClient = getPublicClient();
          const txReceipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
          
          if (txReceipt.status === 'reverted') {
            console.log("Transaction reverted. Logs:", txReceipt.logs);
            
            // Try to decode the revert reason from logs
            // AA failures typically emit events with failure reasons
            if (txReceipt.logs && txReceipt.logs.length > 0) {
              revertReason = ` Check logs for details.`;
            }
          }
        } catch (err) {
          console.warn("Could not fetch transaction receipt:", err);
        }
        
        throw new Error(
          `UserOperation execution failed. ` +
          `Transaction: ${txHash}.${revertReason} ` +
          `View details: ${explorerUrl}`
        );
      }
    }

    // Log progress every 10 attempts
    if (i % 10 === 0 && i > 0) {
      console.log(`Still waiting for UserOperation... (attempt ${i}/${maxAttempts})`);
    }

    // Wait before next attempt
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  console.error("UserOperation timeout:", {
    userOpHash,
    maxAttempts,
    message: "Check bundler or block explorer for details",
  });

  throw new Error(
    `UserOperation not confirmed after ${maxAttempts} attempts (${(maxAttempts * intervalMs) / 1000}s). ` +
    `UserOp hash: ${userOpHash.slice(0, 10)}...`
  );
}
