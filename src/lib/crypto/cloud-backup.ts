/**
 * Cloud Backup Encryption Utilities
 * 
 * Provides password-based encryption for wallet mnemonics stored as cloud backups.
 * Uses Web Crypto API with AES-GCM and PBKDF2.
 * 
 * NOTE: OAuth backups now use server-side encryption (see server-encryption.ts)
 * for enhanced security with HMAC-based key derivation.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

interface CloudBackupPayload {
  ciphertext: string;
  iv: string;
  salt: string;
  iterations: number; // Store iterations for forward compatibility
}

function getSubtle(): SubtleCrypto {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("Web Crypto API is unavailable in this environment.");
  }
  return window.crypto.subtle;
}

/**
 * Derive encryption key from password using PBKDF2
 * Uses 200k iterations for cloud backup (higher than PIN-based encryption)
 */
async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
  iterations = 200_000
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const baseKey = await subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function toBase64(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypt mnemonic with password for cloud backup
 */
export async function encryptMnemonicWithPassword(
  mnemonic: string,
  password: string
): Promise<CloudBackupPayload> {
  const subtle = getSubtle();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iterations = 200_000;

  const key = await deriveKeyFromPassword(password, salt, iterations);

  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(mnemonic)
  );

  return {
    ciphertext: toBase64(ciphertext),
    iv: toBase64(iv),
    salt: toBase64(salt),
    iterations,
  };
}

/**
 * Decrypt mnemonic from cloud backup using password
 */
export async function decryptMnemonicWithPassword(
  payload: CloudBackupPayload,
  password: string
): Promise<string> {
  const subtle = getSubtle();
  const iv = fromBase64(payload.iv);
  const salt = fromBase64(payload.salt);
  const iterations = payload.iterations || 200_000; // Fallback for old backups

  const key = await deriveKeyFromPassword(password, salt, iterations);

  try {
    const decrypted = await subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      key,
      fromBase64(payload.ciphertext) as unknown as BufferSource
    );

    return textDecoder.decode(decrypted);
  } catch {
    throw new Error("Invalid password or corrupted backup");
  }
}

/**
 * Validate password strength for cloud backup
 * Returns error message if invalid, null if valid
 */
export function validateBackupPassword(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }

  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  const strength = [hasUpperCase, hasLowerCase, hasNumber, hasSpecial].filter(
    Boolean
  ).length;

  if (strength < 3) {
    return "Password must contain at least 3 of: uppercase, lowercase, numbers, special characters";
  }

  return null;
}
