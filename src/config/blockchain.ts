/**
 * Blockchain configuration for Ethereum networks
 * Handles network selection and contract addresses for testnet/mainnet
 */

import { sepolia, mainnet } from "viem/chains";
import type { Chain } from "viem";

export type SupportedNetwork = "sepolia" | "mainnet";

/**
 * Contract addresses for USDC on different networks
 */
export const USDC_ADDRESSES: Record<SupportedNetwork, `0x${string}`> = {
  sepolia: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238", // Sepolia USDC
  mainnet: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // Mainnet USDC
};

/**
 * Contract addresses for USDT on different networks
 */
export const USDT_ADDRESSES: Record<SupportedNetwork, `0x${string}`> = {
  sepolia: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06", // Sepolia USDT (example)
  mainnet: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // Mainnet USDT
};

/**
 * Chain configurations
 */
export const CHAIN_CONFIG: Record<SupportedNetwork, Chain> = {
  sepolia,
  mainnet,
};

/**
 * Get the current network from environment or default to sepolia
 */
export function getCurrentNetwork(): SupportedNetwork {
  const network = process.env.NEXT_PUBLIC_NETWORK as SupportedNetwork | undefined;
  return network === "mainnet" ? "mainnet" : "sepolia";
}

/**
 * Get the chain configuration for the current network
 */
export function getCurrentChain(): Chain {
  return CHAIN_CONFIG[getCurrentNetwork()];
}

/**
 * Get USDC contract address for the current network
 */
export function getUSDCAddress(): `0x${string}` {
  return USDC_ADDRESSES[getCurrentNetwork()];
}

/**
 * Get USDT contract address for the current network
 */
export function getUSDTAddress(): `0x${string}` {
  return USDT_ADDRESSES[getCurrentNetwork()];
}

/**
 * Get RPC URL for the current network
 * Supports Alchemy, Infura, or public RPC
 */
export function getRpcUrl(): string {
  const customRpc = process.env.NEXT_PUBLIC_RPC_URL;
  if (customRpc) return customRpc;

  const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
  const network = getCurrentNetwork();

  if (alchemyKey) {
    return network === "mainnet"
      ? `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`
      : `https://eth-sepolia.g.alchemy.com/v2/${alchemyKey}`;
  }

  // Fallback to better public RPC endpoints (still rate-limited but more reliable)
  return network === "mainnet"
    ? "https://ethereum.publicnode.com"
    : "https://ethereum-sepolia-rpc.publicnode.com";
}

/**
 * ERC20 ABI for balance and transfer operations
 */
export const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { name: "_from", type: "address" },
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "transferFrom",
    outputs: [{ name: "", type: "bool" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [
      { name: "_owner", type: "address" },
      { name: "_spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { name: "_spender", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    type: "function",
  },
] as const;
