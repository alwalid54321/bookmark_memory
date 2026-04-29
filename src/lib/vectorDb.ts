/**
 * vectorDb.ts — IndexedDB-backed vector store with cosine similarity search.
 * Stores bookmark/note embeddings and metadata locally for privacy-first RAG.
 */

const DB_NAME = 'BookmarkMemoryDB';
const DB_VERSION = 2;
const STORE_BOOKMARKS = 'bookmarks';
const STORE_NOTES = 'notes';
const STORE_META = 'meta';

export interface BookmarkEntry {
  id: string;
  url: string;
  title: string;
  folderPath: string;
  embedding: number[];
  dateAdded: number;
  tags: string[];
  summary?: string;
}

export interface NoteEntry {
  id: string;
  text: string;
  url: string;
  pageTitle: string;
  embedding: number[];
  dateAdded: number;
  tags: string[];
  color?: string;
}

export type SearchResult = {
  item: BookmarkEntry | NoteEntry;
  score: number;
  type: 'bookmark' | 'note';
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_BOOKMARKS)) {
        db.createObjectStore(STORE_BOOKMARKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_NOTES)) {
        db.createObjectStore(STORE_NOTES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── CRUD Operations ────────────────────────────────────────────────

export async function upsertBookmark(entry: BookmarkEntry): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKMARKS, 'readwrite');
    tx.objectStore(STORE_BOOKMARKS).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteBookmark(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKMARKS, 'readwrite');
    tx.objectStore(STORE_BOOKMARKS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function upsertNote(entry: NoteEntry): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, 'readwrite');
    tx.objectStore(STORE_NOTES).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteNote(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, 'readwrite');
    tx.objectStore(STORE_NOTES).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllBookmarks(): Promise<BookmarkEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKMARKS, 'readonly');
    const req = tx.objectStore(STORE_BOOKMARKS).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllNotes(): Promise<NoteEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, 'readonly');
    const req = tx.objectStore(STORE_NOTES).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Vector Search ──────────────────────────────────────────────────

export async function searchSimilar(
  queryEmbedding: number[],
  topK: number = 5,
  minScore: number = 0.25,
): Promise<SearchResult[]> {
  const [bookmarks, notes] = await Promise.all([getAllBookmarks(), getAllNotes()]);
  const results: SearchResult[] = [];

  for (const bm of bookmarks) {
    if (!bm.embedding || bm.embedding.length === 0) continue;
    const score = cosineSimilarity(queryEmbedding, bm.embedding);
    if (score >= minScore) {
      results.push({ item: bm, score, type: 'bookmark' });
    }
  }

  for (const note of notes) {
    if (!note.embedding || note.embedding.length === 0) continue;
    const score = cosineSimilarity(queryEmbedding, note.embedding);
    if (score >= minScore) {
      results.push({ item: note, score, type: 'note' });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

// ─── Metadata helpers ───────────────────────────────────────────────

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMeta(key: string): Promise<unknown> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const req = tx.objectStore(STORE_META).get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function getStats(): Promise<{ bookmarkCount: number; noteCount: number }> {
  const [bookmarks, notes] = await Promise.all([getAllBookmarks(), getAllNotes()]);
  return { bookmarkCount: bookmarks.length, noteCount: notes.length };
}

export async function clearAllData(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_BOOKMARKS, STORE_NOTES, STORE_META], 'readwrite');
    tx.objectStore(STORE_BOOKMARKS).clear();
    tx.objectStore(STORE_NOTES).clear();
    tx.objectStore(STORE_META).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
