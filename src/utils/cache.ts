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
const INDEX_KEY     = "cache_index";

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

async function dbGetAll(): Promise<{ key: string; entry: Entry }[]> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE);
    const store = tx.objectStore(STORE);
    const result: { key: string; entry: Entry }[] = [];

    const req = store.openCursor();
    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;
      if (cursor) {
        result.push({ key: cursor.key as string, entry: cursor.value as Entry });
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => resolve([]);
  });
}

// ── Index management (for metadata retrieval) ────────────────────────────────

function getIndex(): Record<string, string> {
  try {
    const data = localStorage.getItem(INDEX_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function setIndex(index: Record<string, string>): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    // non-fatal
  }
}

function addToIndex(storeKey: string, rawKey: string): void {
  const index = getIndex();
  index[storeKey] = rawKey;
  setIndex(index);
}

function getFromIndex(storeKey: string): string | null {
  return getIndex()[storeKey] ?? null;
}

function removeFromIndex(storeKey: string): void {
  const index = getIndex();
  delete index[storeKey];
  setIndex(index);
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
): Promise<boolean> {
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
    addToIndex(storeKey, rawKey);
    return true;
  } catch {
    return false;
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

export interface CachedAudioInfo {
  storeKey: string;  // already hashed key
  sizeBytes: number;
  cachedAtMs: number;
  expiresAtMs: number;
}

export async function listCachedAudio(): Promise<CachedAudioInfo[]> {
  try {
    const allEntries = await dbGetAll();
    const audioEntries = allEntries.filter((e) => e.entry.kind === "blob" && !e.key.endsWith(":meta"));
    return audioEntries.map((e) => ({
      storeKey: e.key,
      sizeBytes: new Uint8Array(e.entry.ct).byteLength,
      cachedAtMs: e.entry.exp - DEFAULT_TTL,
      expiresAtMs: e.entry.exp,
    }));
  } catch {
    return [];
  }
}

export async function deleteCachedAudio(storeKey: string): Promise<void> {
  try {
    await dbDelete(storeKey);
    // Also delete metadata
    await dbDelete(storeKey + ":meta");
    // Remove from index
    removeFromIndex(storeKey);
  } catch {
    // non-fatal
  }
}

export async function setCachedAudioMeta(
  rawKey: string,
  meta: { trackId: number; title: string }
): Promise<boolean> {
  try {
    const storeKey = await hashKey(rawKey);
    const key = await deriveKey(rawKey);
    const plain = new TextEncoder().encode(JSON.stringify(meta));
    const { ct, iv } = await encrypt(plain.buffer, key);
    await dbPut(storeKey + ":meta", {
      v: ENTRY_VERSION,
      ct,
      iv,
      exp: Date.now() + DEFAULT_TTL,
      kind: "json",
    });
    return true;
  } catch {
    return false;
  }
}

export async function getCachedAudioMeta(
  storeKey: string
): Promise<{ trackId: number; title: string } | null> {
  try {
    const entry = await dbGet(storeKey + ":meta");
    if (!entry || entry.v !== ENTRY_VERSION) return null;
    if (Date.now() > entry.exp) {
      await dbDelete(storeKey + ":meta");
      removeFromIndex(storeKey);
      return null;
    }
    const rawKey = getFromIndex(storeKey);
    if (!rawKey) return null;
    const key = await deriveKey(rawKey);
    const plain = await decrypt(entry.ct, entry.iv, key);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}

export async function isAudioCached(rawKey: string): Promise<boolean> {
  try {
    const storeKey = await hashKey(rawKey);
    const entry = await dbGet(storeKey);
    if (!entry || entry.v !== ENTRY_VERSION || entry.kind !== "blob") return false;
    if (Date.now() > entry.exp) {
      await dbDelete(storeKey);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Migration: populate index from existing IndexedDB entries
export async function migrateIndexFromExisting(): Promise<void> {
  try {
    const allEntries = await dbGetAll();
    const audioEntries = allEntries.filter((e) => e.entry.kind === "blob" && !e.key.endsWith(":meta"));
    const index = getIndex();
    let updated = false;

    for (const { key: storeKey } of audioEntries) {
      if (index[storeKey]) continue; // Already indexed

      // Try to find the original key by attempting decryption with pattern "a:N"
      const metaEntry = allEntries.find((e) => e.key === storeKey + ":meta");
      if (!metaEntry) continue;

      // Try trackIds from 1 to 10000
      for (let trackId = 1; trackId <= 10000; trackId++) {
        const tryKey = `a:${trackId}`;
        try {
          const derivedKey = await deriveKey(tryKey);
          const plain = await decrypt(metaEntry.entry.ct, metaEntry.entry.iv, derivedKey);
          const meta = JSON.parse(new TextDecoder().decode(plain)) as { trackId: number; title: string };
          if (meta.trackId === trackId) {
            addToIndex(storeKey, tryKey);
            updated = true;
            break;
          }
        } catch {
          // Wrong key, try next
        }
      }
    }

    if (updated) {
      setIndex(index);
    }
  } catch {
    // Silent fail
  }
}
