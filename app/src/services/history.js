// Capa de servicios: historial de reproducción.
// { id: slug+':'+epNum, slug, epNum, title, epName, watchedAt, progress }
// progress: 0–1 (fracción vista), 1 = completado

export function createHistoryService(store) {
  return {
    async getAll() {
      const rows = await store.getAll('history');
      return rows.sort((a, b) => b.watchedAt - a.watchedAt);
    },
    async getBySlug(slug) {
      const rows = await store.byIndex('history', 'slug', slug);
      return rows.sort((a, b) => b.epNum - a.epNum);
    },
    async get(slug, epNum) { return store.get('history', `${slug}:${epNum}`); },
    /** Guarda o actualiza el progreso de un episodio. */
    async save({ slug, epNum, title, epName, progress = 0 }) {
      return store.put('history', {
        id:        `${slug}:${epNum}`,
        slug,
        epNum,
        title,
        epName:    epName || `Episodio ${epNum}`,
        watchedAt: Date.now(),
        progress:  Math.min(1, Math.max(0, progress)),
      });
    },
    async isWatched(slug, epNum) {
      const r = await store.get('history', `${slug}:${epNum}`);
      return r ? r.progress >= 0.9 : false;
    },
    async watchedEps(slug) {
      const rows = await store.byIndex('history', 'slug', slug);
      return new Set(rows.map((r) => r.epNum));
    },
    async remove(slug, epNum) { return store.remove('history', `${slug}:${epNum}`); },
    async clearAll() {
      const rows = await store.getAll('history');
      for (const r of rows) await store.remove('history', r.id);
    },
  };
}
