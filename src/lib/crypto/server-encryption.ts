/**
 * Server-side encryption utilities using Node.js crypto
 * Used for encrypting phone numbers and other server-side data
 */

import { webcrypto } from 'crypto';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

interface EncryptionPayload {
  ciphertext: string;
  iv: string;
  salt: string;
}

async function deriveKey(pin: string, salt: Uint8Array): Promise<webcrypto.CryptoKey> {
  const baseKey = await webcrypto.subtle.importKey(
    "raw",
    textEncoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return webcrypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 150_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function toBase64(input: ArrayBuffer | Uint8Array) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  return Buffer.from(bytes).toString('base64');
}

function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

export async function encryptWithPin(plaintext: string, pin: string): Promise<EncryptionPayload> {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pin, salt);

  const ciphertext = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(plaintext),
  );

  return {
    ciphertext: toBase64(ciphertext),
    iv: toBase64(iv),
    salt: toBase64(salt),
  };
}

export async function decryptWithPin(payload: EncryptionPayload, pin: string): Promise<string> {
  const iv = fromBase64(payload.iv);
  const salt = fromBase64(payload.salt);
  const key = await deriveKey(pin, salt);

  const decrypted = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    fromBase64(payload.ciphertext),
  );

  return textDecoder.decode(decrypted);
}

/**
 * Derive a secure encryption key from OAuth ID using server-side secret
 * This prevents OAuth ID alone from being sufficient for decryption
 * 
 * SECURITY: Uses HMAC with server-side secret to derive key material
 * - OAuth ID is NOT sufficient alone (requires server secret)
 * - Different from client-side encryption (prevents client-side decryption)
 * - Server secret must be stored in ENCRYPTION_SECRET env var (32+ chars)
 */
async function deriveOAuthKey(
  oauthId: string,
  userId: string,
  salt: Uint8Array,
  serverSecret: string
): Promise<webcrypto.CryptoKey> {
  // Create HMAC of oauthId using server secret
  const hmacKey = await webcrypto.subtle.importKey(
    "raw",
    textEncoder.encode(serverSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const oauthIdBytes = textEncoder.encode(oauthId);
  const hmacSignature = await webcrypto.subtle.sign("HMAC", hmacKey, oauthIdBytes);
  
  // Combine HMAC result with userId for additional entropy
  const combined = new Uint8Array(hmacSignature.byteLength + textEncoder.encode(userId).byteLength);
  combined.set(new Uint8Array(hmacSignature), 0);
  combined.set(textEncoder.encode(userId), hmacSignature.byteLength);

  // Use HMAC result as base for PBKDF2
  const baseKey = await webcrypto.subtle.importKey(
    "raw",
    combined,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return webcrypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 150_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Server-side encryption for OAuth backups
 * Uses HMAC(oauthId, serverSecret) + userId for key derivation
 * 
 * @param plaintext - The mnemonic to encrypt
 * @param oauthId - OAuth provider's user ID
 * @param userId - Internal user ID
 * @param serverSecret - Server-side secret from env (ENCRYPTION_SECRET)
 */
export async function encryptWithOAuth(
  plaintext: string,
  oauthId: string,
  userId: string,
  serverSecret: string
): Promise<EncryptionPayload> {
  if (!serverSecret || serverSecret.length < 32) {
    throw new Error("Server secret must be at least 32 characters");
  }

  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const key = await deriveOAuthKey(oauthId, userId, salt, serverSecret);

  const ciphertext = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(plaintext)
  );

  return {
    ciphertext: toBase64(ciphertext),
    iv: toBase64(iv),
    salt: toBase64(salt),
  };
}

/**
 * Server-side decryption for OAuth backups
 * Requires both OAuth ID and server secret to decrypt
 * 
 * @param payload - Encrypted data
 * @param oauthId - OAuth provider's user ID (must match encryption)
 * @param userId - Internal user ID (must match encryption)
 * @param serverSecret - Server-side secret from env (ENCRYPTION_SECRET)
 */
export async function decryptWithOAuth(
  payload: EncryptionPayload,
  oauthId: string,
  userId: string,
  serverSecret: string
): Promise<string> {
  if (!serverSecret || serverSecret.length < 32) {
    throw new Error("Server secret must be at least 32 characters");
  }

  const iv = fromBase64(payload.iv);
  const salt = fromBase64(payload.salt);
  const key = await deriveOAuthKey(oauthId, userId, salt, serverSecret);

  try {
    const decrypted = await webcrypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      fromBase64(payload.ciphertext)
    );

    return textDecoder.decode(decrypted);
  } catch {
    throw new Error("OAuth decryption failed - invalid credentials or corrupted backup");
  }
}

