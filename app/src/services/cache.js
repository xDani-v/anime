// Capa de servicios: caché de resultados del scraper (stale-while-revalidate).
//  - Dato fresco (dentro del TTL)  -> se devuelve sin tocar la red.
//  - Dato vencido pero reciente     -> se devuelve AL INSTANTE y se refresca en segundo plano.
//  - Sin red y con copia vieja      -> se sirve la copia vieja en vez de fallar.
//  - Pasado STALE_MAX               -> se descarta (prune).

const TTL = {
  latest: 5 * 60 * 1000,       // 5 min
  search: 10 * 60 * 1000,      // 10 min
  anime:  30 * 60 * 1000,      // 30 min
  episode: 60 * 60 * 1000,     // 1 hora
};

// Cuánto tiempo se conserva un dato vencido como respaldo (offline / carga instantánea)
export const STALE_MAX = 7 * 24 * 60 * 60 * 1000; // 7 días

export function createCacheService(store) {
  const inflight = new Map(); // key -> Promise (evita peticiones duplicadas simultáneas)

  const service = {
    /** Solo datos frescos (compatibilidad). */
    async get(key) {
      const row = await store.get('cache', key);
      if (!row || Date.now() > row.expiresAt) return null;
      return row.data;
    },
    /** { data, fresh } o null si no existe / superó STALE_MAX. */
    async getEntry(key) {
      const row = await store.get('cache', key);
      if (!row) return null;
      const age = Date.now() - row.expiresAt;
      if (age > STALE_MAX) {
        await store.remove('cache', key);
        return null;
      }
      return { data: row.data, fresh: age <= 0 };
    },
    async set(key, data, kind = 'latest') {
      return store.put('cache', {
        id:        key,
        data,
        expiresAt: Date.now() + (TTL[kind] || TTL.latest),
      });
    },
    /**
     * Obtiene un dato con stale-while-revalidate.
     * opts.onRefresh(data): se llama si el refresco en segundo plano trae datos distintos.
     * opts.serveStale (def. true): false = con dato vencido intenta primero la red y
     *                              solo usa la copia vieja si la red falla.
     */
    async swr(key, kind, fetcher, { onRefresh, serveStale = true } = {}) {
      const entry = await service.getEntry(key);
      if (entry?.fresh) return entry.data;

      let refresh = inflight.get(key);
      if (!refresh) {
        refresh = fetcher()
          .then(async (data) => { await service.set(key, data, kind); return data; })
          .finally(() => inflight.delete(key));
        inflight.set(key, refresh);
      }

      if (!entry) return refresh; // sin copia: hay que esperar a la red (y propagar el error)

      if (serveStale) {
        refresh
          .then((data) => {
            if (onRefresh && JSON.stringify(data) !== JSON.stringify(entry.data)) onRefresh(data);
          })
          .catch(() => { /* sin red: nos quedamos con la copia vieja */ });
        return entry.data;
      }
      try { return await refresh; } catch { return entry.data; }
    },
    /** Borra lo que superó STALE_MAX. Devuelve cuántos registros eliminó. */
    async prune() {
      const rows = await store.getAll('cache');
      let n = 0;
      for (const r of rows) {
        if (Date.now() - r.expiresAt > STALE_MAX) { await store.remove('cache', r.id); n++; }
      }
      return n;
    },
    async clear() {
      const rows = await store.getAll('cache');
      for (const r of rows) await store.remove('cache', r.id);
    },
  };
  return service;
}
