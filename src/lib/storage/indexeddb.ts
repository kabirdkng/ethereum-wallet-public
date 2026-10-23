export interface StoredWalletRecord<T = unknown> {
  address: string; // EOA address (primary key)
  smartWalletAddress?: string; // EIP-4337 smart wallet address (optional)
  walletVersion?: "EOA" | "AA"; // Wallet type ("EOA" for traditional, "AA" for Account Abstraction)
  payload: T;
  createdAt: string;
  hasMnemonicBackup?: boolean; // Track if user completed mnemonic backup verification
}

const DB_NAME = "wallet-vault";
const STORE_NAME = "wallets";
const DB_VERSION = 1;

function isBrowser() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

async function openDatabase(): Promise<IDBDatabase> {
  if (!isBrowser()) {
    throw new Error("IndexedDB is unavailable in this environment.");
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "address" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveWalletRecord<T>(record: StoredWalletRecord<T>): Promise<void> {
  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  db.close();
}

export async function getWalletRecord<T>(address: string): Promise<StoredWalletRecord<T> | undefined> {
  const db = await openDatabase();

  return new Promise<StoredWalletRecord<T> | undefined>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(address);
    request.onsuccess = () => resolve(request.result as StoredWalletRecord<T> | undefined);
    request.onerror = () => reject(request.error);
  }).finally(() => {
    db.close();
  });
}

export async function clearWallet(address: string): Promise<void> {
  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.delete(address);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  db.close();
}

export async function getAllWallets<T>(): Promise<StoredWalletRecord<T>[]> {
  const db = await openDatabase();

  return new Promise<StoredWalletRecord<T>[]>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as StoredWalletRecord<T>[]);
    request.onerror = () => reject(request.error);
  }).finally(() => {
    db.close();
  });
}

/**
 * Export wallet data as JSON string for transfer between origins
 * Useful when switching between localhost and ngrok, or between different browsers
 */
export async function exportWalletData(address: string): Promise<string> {
  // Use getAllWallets for case-insensitive search
  const allWallets = await getAllWallets();
  const walletRecord = allWallets.find(
    (w) => w.address.toLowerCase() === address.toLowerCase()
  );
  
  if (!walletRecord) {
    throw new Error(`Wallet not found for address: ${address}`);
  }

  return JSON.stringify(walletRecord, null, 2);
}

/**
 * Import wallet data from JSON string
 * Overwrites existing wallet data for the same address
 */
export async function importWalletData(jsonData: string): Promise<string> {
  try {
    const walletRecord = JSON.parse(jsonData) as StoredWalletRecord;
    
    // Validate the structure
    if (!walletRecord.address || !walletRecord.payload || !walletRecord.createdAt) {
      throw new Error("Invalid wallet data format");
    }

    await saveWalletRecord(walletRecord);
    return walletRecord.address;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Invalid JSON format");
    }
    throw error;
  }
}

/**
 * Mark mnemonic backup as completed for a wallet
 * This is purely client-side tracking - no server interaction
 */
export async function markMnemonicBackupComplete(address: string): Promise<void> {
  // Use getAllWallets for case-insensitive search
  const allWallets = await getAllWallets();
  const walletRecord = allWallets.find(
    (w) => w.address.toLowerCase() === address.toLowerCase()
  );
  
  if (!walletRecord) {
    throw new Error(`Wallet not found for address: ${address}`);
  }

  await saveWalletRecord({
    ...walletRecord,
    hasMnemonicBackup: true,
  });
}

/**
 * Check if mnemonic backup is completed for a wallet
 */
export async function checkMnemonicBackupStatus(address: string): Promise<boolean> {
  // Use getAllWallets for case-insensitive search
  const allWallets = await getAllWallets();
  const walletRecord = allWallets.find(
    (w) => w.address.toLowerCase() === address.toLowerCase()
  );
  return walletRecord?.hasMnemonicBackup || false;
}

