const DB_NAME = "listen-practice-audio";
const STORE = "blobs";
const DB_VERSION = 1;

interface CacheEntry {
  blob: Blob;
  updatedAt: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedAudio(
  trackId: number,
  updatedAt: string
): Promise<string | null> {
  try {
    const db = await openDB();
    const entry = await new Promise<CacheEntry | undefined>((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(trackId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });
    if (!entry || entry.updatedAt !== updatedAt) return null;
    return URL.createObjectURL(entry.blob);
  } catch {
    return null;
  }
}

export async function setCachedAudio(
  trackId: number,
  updatedAt: string,
  blob: Blob
): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ blob, updatedAt } satisfies CacheEntry, trackId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // cache write failure is non-fatal
  }
}
