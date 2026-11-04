// Capa de servicios: caché de resultados del scraper con TTL.
// Evita peticiones repetidas al mismo recurso en la misma sesión.

const TTL = {
  latest: 5 * 60 * 1000,       // 5 min
  search: 10 * 60 * 1000,      // 10 min
  anime:  30 * 60 * 1000,      // 30 min
  episode: 60 * 60 * 1000,     // 1 hora
};

export function createCacheService(store) {
  return {
    async get(key) {
      const row = await store.get('cache', key);
      if (!row) return null;
      if (Date.now() > row.expiresAt) {
        await store.remove('cache', key);
        return null;
      }
      return row.data;
    },
    async set(key, data, kind = 'latest') {
      return store.put('cache', {
        id:        key,
        data,
        expiresAt: Date.now() + (TTL[kind] || TTL.latest),
      });
    },
    async clear() {
      const rows = await store.getAll('cache');
      for (const r of rows) await store.remove('cache', r.id);
    },
  };
}
