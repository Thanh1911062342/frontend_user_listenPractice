// Generic encrypted IndexedDB cache with TTL.
// - DB/store names are innocuous to deter casual snooping
// - Keys are hashed (SHA-256) so trackIds aren't trivially mapped
// - Values are AES-GCM encrypted with a key derived from the user token

const DB_NAME       = "_app_store";
const STORE         = "items";
const DB_VERSION    = 1;
const ENTRY_VERSION = 1;
const DEFAULT_TTL   = 24 * 60 * 60 * 1000;
const SALT_TEXT     = "lp-cache-v1";
const PBKDF2_ITERS  = 1000;

interface Entry {
  v:    number;       // schema version
  ct:   ArrayBuffer;  // ciphertext
  iv:   ArrayBuffer;  // GCM iv
  exp:  number;       // expiry epoch ms
  kind: "blob" | "json";
}

// ── IndexedDB plumbing ───────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess       = () => resolve(req.result);
    req.onerror         = () => reject(req.error);
  });
}

async function dbGet(storeKey: string): Promise<Entry | undefined> {
  const db = await openDB();
  return new Promise((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(storeKey);
    req.onsuccess = () => resolve(req.result as Entry | undefined);
    req.onerror   = () => resolve(undefined);
  });
}

async function dbPut(storeKey: string, entry: Entry): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry, storeKey);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function dbDelete(storeKey: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(storeKey);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => resolve();
  });
}

// ── Crypto helpers ───────────────────────────────────────────────────────────

async function hashKey(rawKey: string): Promise<string> {
  const data = new TextEncoder().encode(SALT_TEXT + ":" + rawKey);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}

async function deriveKey(rawKey: string): Promise<CryptoKey> {
  const token = localStorage.getItem("user_token") || "anon";
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token + ":" + rawKey),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name:       "PBKDF2",
      salt:       new TextEncoder().encode(SALT_TEXT),
      iterations: PBKDF2_ITERS,
      hash:       "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt(plain: ArrayBuffer, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return { ct, iv: iv.buffer };
}

async function decrypt(ct: ArrayBuffer, iv: ArrayBuffer, key: CryptoKey) {
  return await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    key,
    ct,
  );
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function getCachedBlob(rawKey: string): Promise<Blob | null> {
  try {
    const storeKey = await hashKey(rawKey);
    const entry    = await dbGet(storeKey);
    if (!entry || entry.v !== ENTRY_VERSION || entry.kind !== "blob") return null;
    if (Date.now() > entry.exp) {
      await dbDelete(storeKey);
      return null;
    }
    const key   = await deriveKey(rawKey);
    const plain = await decrypt(entry.ct, entry.iv, key);
    return new Blob([plain]);
  } catch {
    return null;
  }
}

export async function setCachedBlob(
  rawKey: string,
  blob: Blob,
  ttlMs: number = DEFAULT_TTL,
): Promise<void> {
  try {
    const storeKey = await hashKey(rawKey);
    const key      = await deriveKey(rawKey);
    const plain    = await blob.arrayBuffer();
    const { ct, iv } = await encrypt(plain, key);
    await dbPut(storeKey, {
      v:    ENTRY_VERSION,
      ct,
      iv,
      exp:  Date.now() + ttlMs,
      kind: "blob",
    });
  } catch {
    // non-fatal
  }
}

export async function getCachedJson<T>(rawKey: string): Promise<T | null> {
  try {
    const storeKey = await hashKey(rawKey);
    const entry    = await dbGet(storeKey);
    if (!entry || entry.v !== ENTRY_VERSION || entry.kind !== "json") return null;
    if (Date.now() > entry.exp) {
      await dbDelete(storeKey);
      return null;
    }
    const key   = await deriveKey(rawKey);
    const plain = await decrypt(entry.ct, entry.iv, key);
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
}

export async function setCachedJson(
  rawKey: string,
  value: unknown,
  ttlMs: number = DEFAULT_TTL,
): Promise<void> {
  try {
    const storeKey = await hashKey(rawKey);
    const key      = await deriveKey(rawKey);
    const plain    = new TextEncoder().encode(JSON.stringify(value));
    const { ct, iv } = await encrypt(plain.buffer, key);
    await dbPut(storeKey, {
      v:    ENTRY_VERSION,
      ct,
      iv,
      exp:  Date.now() + ttlMs,
      kind: "json",
    });
  } catch {
    // non-fatal
  }
}
