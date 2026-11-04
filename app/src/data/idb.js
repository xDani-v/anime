// Almacén persistente sobre IndexedDB. Sin dependencias.
import { DB_NAME, DB_VERSION, STORE_NAMES, MIGRATIONS } from './schema.js';

const wrap = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });

const done = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error || new Error('Transacción cancelada'));
  });

export async function openIdbStore() {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      for (let v = ev.oldVersion; v < ev.newVersion; v++) MIGRATIONS[v](req.result, req.transaction);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
    req.onblocked = () => reject(new Error('La base de datos está bloqueada por otra pestaña.'));
  });
  db.onversionchange = () => db.close();
  try { await navigator.storage?.persist?.(); } catch { /* opcional */ }

  const store = (name, mode) => db.transaction(name, mode).objectStore(name);

  return {
    getAll:   (s)         => wrap(store(s, 'readonly').getAll()),
    get:      (s, id)     => wrap(store(s, 'readonly').get(id)),
    put:      async (s, o)  => { await wrap(store(s, 'readwrite').put(o)); return o; },
    remove:   (s, id)     => wrap(store(s, 'readwrite').delete(id)),
    byIndex:  (s, f, v)   => wrap(store(s, 'readonly').index(f).getAll(v)),
    async batch(ops) {
      const names = [...new Set(ops.map((o) => o.store))];
      if (!names.length) return;
      const tx = db.transaction(names, 'readwrite');
      for (const op of ops) {
        const os = tx.objectStore(op.store);
        if (op.op === 'put') os.put(op.value);
        else os.delete(op.id);
      }
      await done(tx);
    },
    async exportAll() {
      const tx = db.transaction(STORE_NAMES, 'readonly');
      const out = {};
      await Promise.all(STORE_NAMES.map(async (n) => { out[n] = await wrap(tx.objectStore(n).getAll()); }));
      return out;
    },
    async replaceAll(payload) {
      const tx = db.transaction(STORE_NAMES, 'readwrite');
      for (const n of STORE_NAMES) {
        const os = tx.objectStore(n);
        os.clear();
        for (const o of payload[n] || []) os.put(o);
      }
      await done(tx);
    },
  };
}
