// Simple cache using IndexedDB - no encryption for now
// Will add encryption layer later

const DB_NAME = "_cache";
const STORE = "data";
const DB_VERSION = 1;
const DEFAULT_TTL = 24 * 60 * 60 * 1000;

interface CacheEntry {
  value: ArrayBuffer | string;
  type: "blob" | "json";
  exp: number;
}

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
    return new Blob([entry.value as ArrayBuffer]);
  } catch {
    return null;
  }
}

export async function setCachedBlob(
  key: string,
  blob: Blob,
  ttlMs: number = DEFAULT_TTL
): Promise<boolean> {
  try {
    const value = await blob.arrayBuffer();
    await dbPut(key, {
      value,
      type: "blob",
      exp: Date.now() + ttlMs,
    });
    return true;
  } catch {
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
    return JSON.parse(entry.value as string) as T;
  } catch {
    return null;
  }
}

export async function setCachedJson(
  key: string,
  value: unknown,
  ttlMs: number = DEFAULT_TTL
): Promise<boolean> {
  try {
    const json = JSON.stringify(value);
    await dbPut(key, {
      value: json,
      type: "json",
      exp: Date.now() + ttlMs,
    });
    return true;
  } catch {
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
    const result: CachedAudioInfo[] = [];

    for (const { key, entry } of allEntries) {
      if (!key.startsWith("a:") || entry.type !== "blob") continue;

      const trackIdStr = key.substring(2);
      const trackId = parseInt(trackIdStr, 10);
      if (isNaN(trackId)) continue;

      const metaKey = `meta:${trackId}`;
      const metaEntry = await dbGet(metaKey);
      if (!metaEntry || metaEntry.type !== "json") continue;

      try {
        const meta = JSON.parse(metaEntry.value as string) as { title: string };
        result.push({
          key,
          trackId,
          title: meta.title,
          sizeBytes: typeof entry.value === "string" ? entry.value.length : (entry.value as ArrayBuffer).byteLength,
          cachedAtMs: entry.exp - DEFAULT_TTL,
          expiresAtMs: entry.exp,
        });
      } catch {
        // Skip if metadata invalid
      }
    }

    return result;
  } catch {
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
  try {
    const metaKey = `meta:${trackId}`;
    return await setCachedJson(metaKey, meta);
  } catch {
    return false;
  }
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
