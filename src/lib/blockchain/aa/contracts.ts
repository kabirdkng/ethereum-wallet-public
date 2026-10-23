/**
 * Account Abstraction contract addresses and bundler configuration
 * SimpleAccount implementation from Alchemy (EIP-4337 compatible)
 */

import { getClientEnv } from "@/config/env";

/**
 * SimpleAccountFactory addresses (deploys smart contract wallets)
 * Same address on all networks thanks to CREATE2
 */
export const SIMPLE_ACCOUNT_FACTORY_ADDRESS = "0x9406Cc6185a346906296840746125a0E44976454" as const;

/**
 * EntryPoint v0.6 address (EIP-4337 canonical)
 * Same address on all networks
 */
export const ENTRYPOINT_V06_ADDRESS = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789" as const;

/**
 * Multicall3 address for batched ERC20 transfers with Account Abstraction
 * Same address on all EVM chains
 * 
 * Pattern: Smart wallet approves Multicall3 once, then all transfers use:
 * SimpleAccount.execute(Multicall3, aggregate3([transferFrom(...), transferFrom(...)]))
 */
export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

/**
 * Get Alchemy bundler URL for current network
 */
export function getAlchemyBundlerUrl(): string {
  const env = getClientEnv();
  const network = env.NEXT_PUBLIC_NETWORK;
  const apiKey = env.NEXT_PUBLIC_ALCHEMY_API_KEY;

  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_ALCHEMY_API_KEY is required for Account Abstraction");
  }

  const bundlerUrls = {
    sepolia: `https://eth-sepolia.g.alchemy.com/v2/${apiKey}`,
    mainnet: `https://eth-mainnet.g.alchemy.com/v2/${apiKey}`,
  };

  return bundlerUrls[network as keyof typeof bundlerUrls] || bundlerUrls.sepolia;
}

/**
 * Get Gas Manager policy ID from environment
 */
export function getGasManagerPolicyId(): string | null {
  return process.env.NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID || null;
}

/**
 * Check if Account Abstraction is enabled
 * Requires both API key and Gas Manager policy
 */
export function isAAEnabled(): boolean {
  const env = getClientEnv();
  const hasPolicyId = !!process.env.NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID;
  
  return !!env.NEXT_PUBLIC_ALCHEMY_API_KEY && hasPolicyId;
}

/**
 * SimpleAccountFactory ABI (minimal - only what we need)
 */
export const SIMPLE_ACCOUNT_FACTORY_ABI = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "uint256" },
    ],
    name: "getAddress",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "uint256" },
    ],
    name: "createAccount",
    outputs: [{ name: "ret", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * EntryPoint ABI (minimal - only what we need)
 */
export const ENTRYPOINT_ABI = [
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
        name: "userOps",
        type: "tuple[]",
      },
      { name: "beneficiary", type: "address" },
    ],
    name: "handleOps",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "sender", type: "address" }, { name: "key", type: "uint192" }],
    name: "getNonce",
    outputs: [{ name: "nonce", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
