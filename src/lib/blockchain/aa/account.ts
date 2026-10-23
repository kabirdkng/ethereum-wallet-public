/**
 * Smart account address calculation and management
 * Deterministically generates EIP-4337 smart wallet addresses from EOA addresses
 */

import { encodeFunctionData, getContract, type Address } from "viem";
import { getPublicClient } from "../client";
import {
  SIMPLE_ACCOUNT_FACTORY_ADDRESS,
  SIMPLE_ACCOUNT_FACTORY_ABI,
  ENTRYPOINT_V06_ADDRESS,
} from "./contracts";

/**
 * Retry utility with exponential backoff
 * @param fn - Async function to retry
 * @param maxAttempts - Maximum number of retry attempts (default: 3)
 * @param baseDelayMs - Base delay in milliseconds (default: 1000)
 * @returns Result of the function
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | unknown;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxAttempts) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        console.log(`Retry attempt ${attempt}/${maxAttempts} failed, waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw lastError;
}

/**
 * Calculate the smart wallet address for a given EOA owner (internal, no retry)
 * Uses CREATE2 for deterministic address generation
 * 
 * @param eoaAddress - The EOA address that will own the smart wallet
 * @param salt - Salt for CREATE2 (default: 0 for first wallet)
 * @returns The smart wallet address that will be deployed
 */
async function _getSmartWalletAddressInternal(
  eoaAddress: Address,
  salt: bigint = BigInt(0)
): Promise<Address> {
  const publicClient = getPublicClient();

  const factoryContract = getContract({
    address: SIMPLE_ACCOUNT_FACTORY_ADDRESS,
    abi: SIMPLE_ACCOUNT_FACTORY_ABI,
    client: publicClient,
  });

  const address = await factoryContract.read.getAddress([eoaAddress, salt]);

  console.log("Smart wallet address calculated:", {
    owner: eoaAddress,
    smartWallet: address,
    salt: salt.toString(),
  });

  return address as Address;
}

/**
 * Calculate the smart wallet address for a given EOA owner with retry logic
 * Uses CREATE2 for deterministic address generation
 * 
 * @param eoaAddress - The EOA address that will own the smart wallet
 * @param salt - Salt for CREATE2 (default: 0 for first wallet)
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @returns The smart wallet address that will be deployed
 * @throws Error if calculation fails after all retries
 */
export async function getSmartWalletAddress(
  eoaAddress: Address,
  salt: bigint = BigInt(0),
  maxRetries: number = 3
): Promise<Address> {
  try {
    return await retryWithBackoff(
      () => _getSmartWalletAddressInternal(eoaAddress, salt),
      maxRetries,
      1000
    );
  } catch (error) {
    console.error("Error calculating smart wallet address after retries:", error);
    throw new Error(`Failed to calculate smart wallet address: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if a smart wallet is already deployed
 * @param smartWalletAddress - The smart wallet address to check
 * @returns true if deployed, false otherwise
 */
export async function isSmartWalletDeployed(smartWalletAddress: Address): Promise<boolean> {
  const publicClient = getPublicClient();

  try {
    const bytecode = await publicClient.getBytecode({ address: smartWalletAddress });
    return !!bytecode && bytecode !== "0x";
  } catch (error) {
    console.error("Error checking smart wallet deployment:", error);
    return false;
  }
}

/**
 * Get the initCode for deploying a smart wallet
 * Used in the first UserOperation to deploy the wallet
 * 
 * @param eoaAddress - The EOA address that will own the smart wallet
 * @param salt - Salt for CREATE2 (default: 0)
 * @returns The initCode bytes
 */
export function getSmartWalletInitCode(
  eoaAddress: Address,
  salt: bigint = BigInt(0)
): `0x${string}` {
  try {
    // Encode the createAccount function call
    const createAccountCalldata = encodeFunctionData({
      abi: SIMPLE_ACCOUNT_FACTORY_ABI,
      functionName: "createAccount",
      args: [eoaAddress, salt],
    });

    // initCode = factory address + createAccount calldata
    const initCode = `${SIMPLE_ACCOUNT_FACTORY_ADDRESS}${createAccountCalldata.slice(2)}` as `0x${string}`;

    console.log("Generated initCode:", {
      owner: eoaAddress,
      salt: salt.toString(),
      initCodeLength: initCode.length,
    });

    return initCode;
  } catch (error) {
    console.error("Error generating initCode:", error);
    throw new Error("Failed to generate smart wallet initCode");
  }
}

/**
 * Get wallet deployment status and info
 * @param eoaAddress - The EOA address
 * @returns Deployment status and addresses
 */
export async function getWalletDeploymentInfo(eoaAddress: Address): Promise<{
  eoaAddress: Address;
  smartWalletAddress: Address;
  isDeployed: boolean;
  needsDeployment: boolean;
}> {
  const smartWalletAddress = await getSmartWalletAddress(eoaAddress);
  const isDeployed = await isSmartWalletDeployed(smartWalletAddress);

  return {
    eoaAddress,
    smartWalletAddress,
    isDeployed,
    needsDeployment: !isDeployed,
  };
}

/**
 * Get the EntryPoint address (needed for UserOperations)
 */
export function getEntryPointAddress(): Address {
  return ENTRYPOINT_V06_ADDRESS;
}

/**
 * Calculate the counterfactual address (same as getSmartWalletAddress but with better naming)
 * "Counterfactual" means the address exists before deployment
 */
export const getCounterfactualAddress = getSmartWalletAddress;
