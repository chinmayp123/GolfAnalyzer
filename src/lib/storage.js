// ─── Persistence: IndexedDB swing history + localStorage settings/profiles ───

const DB_NAME = "swingai";
const DB_VERSION = 1;
const SWINGS = "swings";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SWINGS)) {
        db.createObjectStore(SWINGS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(SWINGS, mode);
    const store = t.objectStore(SWINGS);
    const result = fn(store);
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
  });
}

/**
 * swing: {id, date, proName, proColor, overallScore, phaseScores, coaching, thumbnail}
 */
export async function saveSwing(swing) {
  const db = await openDB();
  await tx(db, "readwrite", (s) => s.put(swing));
  db.close();
}

export async function listSwings() {
  const db = await openDB();
  const all = await new Promise((resolve, reject) => {
    const req = db.transaction(SWINGS, "readonly").objectStore(SWINGS).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return all.sort((a, b) => b.id - a.id);
}

export async function deleteSwing(id) {
  const db = await openDB();
  await tx(db, "readwrite", (s) => s.delete(id));
  db.close();
}

// ─── Pro profiles (localStorage — compatible with existing saved profiles) ───

const PROFILES_KEY = "swingai_custom_profiles";

export function loadProfiles() {
  try {
    const saved = localStorage.getItem(PROFILES_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export function saveProfiles(profiles) {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch (err) {
    console.error("Failed to save profiles (likely quota):", err);
  }
}

// ─── Settings ───

const API_KEY = "swingai_claude_api_key";

export function getApiKey() {
  return localStorage.getItem(API_KEY) || "";
}

export function setApiKey(key) {
  if (key) localStorage.setItem(API_KEY, key);
  else localStorage.removeItem(API_KEY);
}
