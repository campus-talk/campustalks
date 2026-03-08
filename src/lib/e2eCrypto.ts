/**
 * E2E Encryption utility using Web Crypto API
 * - ECDH for key exchange
 * - AES-GCM for message encryption
 * - Private keys stored in IndexedDB
 */

const DB_NAME = "campustalks_e2e";
const STORE_NAME = "keys";
const PRIVATE_KEY_ID = "my_private_key";

// ─── IndexedDB helpers ───

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeInDB(key: string, value: any): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getFromDB(key: string): Promise<any> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Key generation ───

const ECDH_PARAMS: EcKeyGenParams = {
  name: "ECDH",
  namedCurve: "P-256",
};

export async function generateKeyPair(): Promise<{ publicKeyJwk: JsonWebKey; privateKey: CryptoKey }> {
  const keyPair = await crypto.subtle.generateKey(ECDH_PARAMS, false, ["deriveKey"]);

  // Export public key as JWK for storage in DB
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

  // Store private key in IndexedDB (non-extractable)
  await storeInDB(PRIVATE_KEY_ID, keyPair.privateKey);

  return { publicKeyJwk, privateKey: keyPair.privateKey };
}

export async function getStoredPrivateKey(): Promise<CryptoKey | null> {
  try {
    return await getFromDB(PRIVATE_KEY_ID);
  } catch {
    return null;
  }
}

// ─── Key import ───

export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, ECDH_PARAMS, true, []);
}

// ─── Derive shared secret ───

async function deriveSharedKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ─── Encrypt / Decrypt ───

export async function encryptMessage(
  plaintext: string,
  myPrivateKey: CryptoKey,
  theirPublicKeyJwk: JsonWebKey
): Promise<string> {
  const theirPublicKey = await importPublicKey(theirPublicKeyJwk);
  const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKey);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sharedKey,
    encoded
  );

  // Pack iv + ciphertext as base64
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decryptMessage(
  encryptedBase64: string,
  myPrivateKey: CryptoKey,
  theirPublicKeyJwk: JsonWebKey
): Promise<string> {
  const theirPublicKey = await importPublicKey(theirPublicKeyJwk);
  const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKey);

  const combined = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    sharedKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

// ─── Public key serialization (for DB storage) ───

export function serializePublicKey(jwk: JsonWebKey): string {
  return JSON.stringify(jwk);
}

export function deserializePublicKey(serialized: string): JsonWebKey {
  return JSON.parse(serialized);
}
