const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

interface EncryptionPayload {
  ciphertext: string;
  iv: string;
  salt: string;
}

function getSubtle(): SubtleCrypto {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("Web Crypto API is unavailable in this environment.");
  }

  return window.crypto.subtle;
}

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = getSubtle();
  const baseKey = await subtle.importKey(
    "raw",
    textEncoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  const saltSource = salt as unknown as BufferSource;

  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltSource,
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
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)!;
  }
  return bytes;
}

export async function encryptWithPin(plaintext: string, pin: string): Promise<EncryptionPayload> {
  const subtle = getSubtle();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pin, salt);

  const ciphertext = await subtle.encrypt(
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
  const subtle = getSubtle();
  const iv = fromBase64(payload.iv);
  const salt = fromBase64(payload.salt);
  const key = await deriveKey(pin, salt);

  const decrypted = await subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    fromBase64(payload.ciphertext),
  );

  return textDecoder.decode(decrypted);
}
