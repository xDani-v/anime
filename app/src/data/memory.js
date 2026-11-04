// Almacén en memoria con la misma interfaz que IndexedDB. Usado en pruebas.
import { STORE_NAMES } from './schema.js';

export function createMemoryStore() {
  const data = Object.fromEntries(STORE_NAMES.map((n) => [n, new Map()]));
  const clone = (o) => structuredClone(o);
  const check = (s) => { if (!data[s]) throw new Error(`Almacén desconocido: ${s}`); };

  return {
    async getAll(s)       { check(s); return [...data[s].values()].map(clone); },
    async get(s, id)      { check(s); const v = data[s].get(id); return v ? clone(v) : undefined; },
    async put(s, o)       { check(s); data[s].set(o.id, clone(o)); return o; },
    async remove(s, id)   { check(s); data[s].delete(id); },
    async byIndex(s, f, v){ check(s); return [...data[s].values()].filter((o) => o[f] === v).map(clone); },
    async batch(ops) {
      for (const op of ops) check(op.store);
      for (const op of ops) {
        if (op.op === 'put') data[op.store].set(op.value.id, clone(op.value));
        else data[op.store].delete(op.id);
      }
    },
    async exportAll() {
      const out = {};
      for (const n of STORE_NAMES) out[n] = [...data[n].values()].map(clone);
      return out;
    },
    async replaceAll(payload) {
      for (const n of STORE_NAMES) {
        data[n].clear();
        for (const o of payload[n] || []) data[n].set(o.id, clone(o));
      }
    },
  };
}
