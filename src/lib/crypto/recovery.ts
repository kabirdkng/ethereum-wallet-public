import secrets from "secrets.js-grempe";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

import { encryptWithPin as serverEncryptWithPin, decryptWithPin as serverDecryptWithPin } from "./server-encryption";

/**
 * Split a mnemonic into N shares using Shamir's Secret Sharing
 * @param mnemonic - The 12 or 24 word mnemonic phrase
 * @param totalShares - Total number of shares to create (e.g., 5)
 * @param threshold - Minimum shares needed to reconstruct (e.g., 3)
 * @returns Array of hex-encoded shares
 */
export function splitMnemonic(
  mnemonic: string,
  totalShares: number,
  threshold: number
): string[] {
  // Convert mnemonic to hex
  const mnemonicHex = bytesToHex(new TextEncoder().encode(mnemonic));
  
  // Split using Shamir's Secret Sharing
  const shares = secrets.share(mnemonicHex, totalShares, threshold);
  
  return shares;
}

/**
 * Reconstruct a mnemonic from K shares (where K >= threshold)
 * @param shares - Array of hex-encoded shares
 * @returns Reconstructed mnemonic phrase
 */
export function reconstructMnemonic(shares: string[]): string {
  
  // Combine shares
  const recoveredHex = secrets.combine(shares);
  
  // Convert hex back to mnemonic
  const mnemonicBytes = hexToBytes(recoveredHex);
  
  const mnemonic = new TextDecoder().decode(mnemonicBytes);
  
  return mnemonic;
}

/**
 * Generate a random recovery code (e.g., "ABC-DEF-123")
 * @returns Recovery code string
 */
export function generateRecoveryCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Exclude confusing chars (I, O, 1, 0)
  const segments = 3;
  const segmentLength = 3;
  
  const code = Array.from({ length: segments }, () => {
    return Array.from({ length: segmentLength }, () => {
      const randomIndex = Math.floor(Math.random() * chars.length);
      return chars[randomIndex];
    }).join("");
  }).join("-");
  
  return code;
}

/**
 * Hash a phone number for privacy-preserving storage
 * @param phone - Phone number (e.g., "+50937123456")
 * @returns Hex-encoded hash
 */
export function hashPhone(phone: string): string {
  const normalized = phone.replace(/\s+/g, ""); // Remove spaces
  const hash = sha256(new TextEncoder().encode(normalized));
  return bytesToHex(hash);
}

/**
 * Encrypt a phone number for secure storage (allows decryption when needed)
 * Uses a deterministic encryption key derived from the server secret
 * Server-side only function
 * @param phone - Phone number (e.g., "+1234567890")
 * @returns JSON string of encrypted payload
 */
export async function encryptPhone(phone: string): Promise<string> {
  const normalized = phone.replace(/\s+/g, ""); // Remove spaces
  // Use a fixed "PIN" derived from server environment for deterministic encryption
  // In production, this should be from process.env.PHONE_ENCRYPTION_KEY
  const serverKey = process.env.NEXTAUTH_SECRET || "default-key-change-in-production";
  const encrypted = await serverEncryptWithPin(normalized, serverKey);
  return JSON.stringify(encrypted);
}

/**
 * Decrypt a phone number from secure storage
 * Server-side only function
 * @param encryptedPhone - JSON string of encrypted payload
 * @returns Decrypted phone number
 */
export async function decryptPhone(encryptedPhone: string): Promise<string> {
  const serverKey = process.env.NEXTAUTH_SECRET || "default-key-change-in-production";
  const encrypted = JSON.parse(encryptedPhone);
  return serverDecryptWithPin(encrypted, serverKey);
}

/**
 * Validate recovery code format
 * @param code - Recovery code to validate
 * @returns True if valid format
 */
export function isValidRecoveryCode(code: string): boolean {
  // Format: XXX-XXX-XXX (3 segments of 3 alphanumeric chars)
  return /^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/.test(code);
}
