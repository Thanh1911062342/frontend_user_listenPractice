// IndexedDB cache with AES-GCM encryption
// Keys are simple: a:trackId (audio), meta:trackId (metadata)

const DB_NAME = "_cache";
const STORE = "data";
const DB_VERSION = 1;
const DEFAULT_TTL = 24 * 60 * 60 * 1000;
const SALT = "lp-cache-v2";
const PBKDF2_ITERS = 100000;

interface CacheEntry {
  ct: ArrayBuffer;      // ciphertext
  iv: ArrayBuffer;      // IV
  type: "blob" | "json";
  exp: number;
}

// ── Encryption helpers ────────────────────────────────────────────────────────

async function deriveKey(password: string): Promise<CryptoKey> {
  const token = localStorage.getItem("user_token") || "anon";
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token + ":" + password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(SALT),
      iterations: PBKDF2_ITERS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encrypt(plaintext: ArrayBuffer, key: CryptoKey): Promise<{ ct: ArrayBuffer; iv: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { ct, iv: iv.buffer };
}

async function decrypt(ct: ArrayBuffer, iv: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  return await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, key, ct);
}

// ── IndexedDB helpers ──────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(key: string): Promise<CacheEntry | undefined> {
  const db = await openDB();
  return new Promise((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as CacheEntry | undefined);
    req.onerror = () => resolve(undefined);
  });
}

async function dbPut(key: string, entry: CacheEntry): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDelete(key: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function dbGetAll(): Promise<{ key: string; entry: CacheEntry }[]> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE);
    const store = tx.objectStore(STORE);
    const result: { key: string; entry: CacheEntry }[] = [];

    const req = store.openCursor();
    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;
      if (cursor) {
        result.push({ key: cursor.key as string, entry: cursor.value as CacheEntry });
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => resolve([]);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getCachedBlob(key: string): Promise<Blob | null> {
  try {
    const entry = await dbGet(key);
    if (!entry || entry.type !== "blob") return null;
    if (Date.now() > entry.exp) {
      await dbDelete(key);
      return null;
    }
    const cryptoKey = await deriveKey(key);
    const plain = await decrypt(entry.ct, entry.iv, cryptoKey);
    return new Blob([plain]);
  } catch (e) {
    console.error(`[Cache] Failed to decrypt blob ${key}:`, e);
    return null;
  }
}

export async function setCachedBlob(
  key: string,
  blob: Blob,
  ttlMs: number = DEFAULT_TTL
): Promise<boolean> {
  try {
    const plain = await blob.arrayBuffer();
    const cryptoKey = await deriveKey(key);
    const { ct, iv } = await encrypt(plain, cryptoKey);
    await dbPut(key, {
      ct,
      iv,
      type: "blob",
      exp: Date.now() + ttlMs,
    });
    console.log(`[Cache] Encrypted blob ${key}`);
    return true;
  } catch (e) {
    console.error(`[Cache] Failed to encrypt blob ${key}:`, e);
    return false;
  }
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  try {
    const entry = await dbGet(key);
    if (!entry || entry.type !== "json") return null;
    if (Date.now() > entry.exp) {
      await dbDelete(key);
      return null;
    }
    const cryptoKey = await deriveKey(key);
    const plain = await decrypt(entry.ct, entry.iv, cryptoKey);
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch (e) {
    console.error(`[Cache] Failed to decrypt json ${key}:`, e);
    return null;
  }
}

export async function setCachedJson(
  key: string,
  value: unknown,
  ttlMs: number = DEFAULT_TTL
): Promise<boolean> {
  try {
    const plain = new TextEncoder().encode(JSON.stringify(value));
    const cryptoKey = await deriveKey(key);
    const { ct, iv } = await encrypt(plain.buffer, cryptoKey);
    await dbPut(key, {
      ct,
      iv,
      type: "json",
      exp: Date.now() + ttlMs,
    });
    return true;
  } catch (e) {
    console.error(`[Cache] Failed to encrypt json ${key}:`, e);
    return false;
  }
}

export interface CachedAudioInfo {
  key: string;
  trackId: number;
  title: string;
  sizeBytes: number;
  cachedAtMs: number;
  expiresAtMs: number;
}

export async function listCachedAudio(): Promise<CachedAudioInfo[]> {
  try {
    const allEntries = await dbGetAll();
    console.log("[Cache] All entries:", allEntries);
    const result: CachedAudioInfo[] = [];

    for (const { key, entry } of allEntries) {
      console.log(`[Cache] Checking key: ${key}, type: ${entry.type}`);
      if (!key.startsWith("a:") || entry.type !== "blob") {
        console.log(`[Cache] Skipped ${key} - not audio blob`);
        continue;
      }

      const trackIdStr = key.substring(2);
      const trackId = parseInt(trackIdStr, 10);
      if (isNaN(trackId)) {
        console.log(`[Cache] Invalid trackId from ${key}`);
        continue;
      }

      const metaKey = `meta:${trackId}`;
      console.log(`[Cache] Looking for metadata: ${metaKey}`);
      const meta = await getCachedJson<{ title: string }>(metaKey);
      if (!meta || !meta.title) {
        console.log(`[Cache] No metadata found for ${trackId}`);
        continue;
      }

      console.log(`[Cache] Found audio: track ${trackId}, title: ${meta.title}`);
      result.push({
        key,
        trackId,
        title: meta.title,
        sizeBytes: 0,
        cachedAtMs: entry.exp - DEFAULT_TTL,
        expiresAtMs: entry.exp,
      });
    }

    console.log("[Cache] Final result:", result);
    return result;
  } catch (e) {
    console.error("[Cache] listCachedAudio error:", e);
    return [];
  }
}

export async function deleteCachedAudio(trackId: number): Promise<void> {
  try {
    const key = `a:${trackId}`;
    const metaKey = `meta:${trackId}`;
    await dbDelete(key);
    await dbDelete(metaKey);
  } catch {
    // non-fatal
  }
}

export async function setCachedAudioMeta(
  trackId: number,
  meta: { title: string }
): Promise<boolean> {
  const metaKey = `meta:${trackId}`;
  return await setCachedJson(metaKey, meta);
}

export async function isAudioCached(trackId: number): Promise<boolean> {
  try {
    const key = `a:${trackId}`;
    const entry = await dbGet(key);
    if (!entry || entry.type !== "blob") return false;
    if (Date.now() > entry.exp) {
      await dbDelete(key);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
