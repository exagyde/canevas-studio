// Persistance locale des projets (IndexedDB) et des préférences (localStorage).
import { t } from '../i18n/index.js';

const DB_NAME = 'canevas-studio';
const DB_VERSION = 1;
const STORE = 'projects';

let dbPromise = null;

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error(t('project.indexedDbUnavailable')));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result;
        Promise.resolve(fn(store, (r) => (result = r))).catch(reject);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

/** Les projets contiennent des objets simples (pas de Map / Symbol) : clonage structuré direct. */
export function saveProject(project) {
  const p = { ...project, updatedAt: new Date().toISOString() };
  return tx('readwrite', (store) => {
    store.put(p);
  }).then(() => p);
}

export function loadProject(id) {
  return tx('readonly', (store, done) => {
    const req = store.get(id);
    req.onsuccess = () => done(req.result || null);
  });
}

export function deleteProject(id) {
  return tx('readwrite', (store) => {
    store.delete(id);
  });
}

export function listProjects() {
  return tx('readonly', (store, done) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const all = (req.result || []).map((p) => ({
        id: p.id,
        name: p.name,
        updatedAt: p.updatedAt,
        createdAt: p.createdAt,
        screens: (p.screens || []).map((s) => s.name),
        dataSources: (p.dataSources || []).length,
        flows: (p.flows || []).length,
        width: p.settings?.width,
        height: p.settings?.height,
      }));
      all.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      done(all);
    };
  });
}

// ---------------------------------------------------------------------------
// Préférences (clés API, fournisseur IA…) : localStorage, propre à ce navigateur
// ---------------------------------------------------------------------------

const PREFS_KEY = 'canevas-studio:prefs';

export function loadPrefs() {
  try {
    const s = localStorage.getItem(PREFS_KEY);
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* stockage indisponible */
  }
}

export function updatePrefs(patch) {
  const next = { ...loadPrefs(), ...patch };
  savePrefs(next);
  return next;
}
