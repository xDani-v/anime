// Capa de servicios: historial de reproducción.
// { id: slug+':'+epNum, slug, epNum, title, epName, watchedAt, progress, position, duration, completed }
// progress: 0–1 (fracción vista) · position/duration: segundos (para reanudar)
// completed: marca persistente (se mantiene aunque se vuelva a ver el episodio)

export const WATCHED_THRESHOLD = 0.9;
const isCompleted = (r) => !!r && (r.completed === true || r.progress >= WATCHED_THRESHOLD);

/** Título legible: registros antiguos guardaron el slug como título. */
export function prettyTitle(item = {}) {
  const t = item.title || item.slug || '';
  if (t.includes('-') && !t.includes(' ')) {
    return t.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return t;
}

/**
 * Qué episodio corresponde "continuar" dado el último registro de un anime.
 * epNums: lista ordenada de episodios conocidos ([] si aún no se sabe).
 * Devuelve { epNum, resume, position, needsEpisodes } o null si no hay nada que continuar.
 *  - a medias (progreso < 90 % y > 5 s) -> mismo episodio, reanudando
 *  - abierto sin avanzar               -> mismo episodio desde el inicio
 *  - terminado                         -> siguiente episodio (null si era el último)
 */
export function nextTarget(row, epNums = []) {
  if (!row) return null;
  const inProgress = row.progress < WATCHED_THRESHOLD && (row.position || 0) > 5;
  if (inProgress) return { epNum: row.epNum, resume: true, position: row.position };
  if (!isCompleted(row)) return { epNum: row.epNum, resume: false, position: 0 };
  if (!epNums.length) return { epNum: row.epNum + 1, resume: false, position: 0, needsEpisodes: true };
  const next = epNums.find((n) => n > row.epNum);
  return next == null ? null : { epNum: next, resume: false, position: 0 };
}

/**
 * Cuántos episodios nuevos tiene un anime que el usuario ya viene siguiendo.
 * Cuenta los episodios posteriores al último completado. Si nunca terminó ninguno
 * (no lo ha empezado de verdad) devuelve 0: no tiene sentido avisar de "nuevos".
 */
export function newEpisodeCount(epNums = [], rows = []) {
  const done = rows.filter(isCompleted).map((r) => r.epNum);
  if (!done.length) return 0;
  const last = Math.max(...done);
  return epNums.filter((n) => n > last).length;
}

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
    /** Último episodio visto de cada anime (uno por anime), más reciente primero. */
    async lastPerAnime(limit = 12) {
      const rows = (await store.getAll('history')).sort((a, b) => b.watchedAt - a.watchedAt);
      const seen = new Set();
      const out = [];
      for (const r of rows) {
        if (seen.has(r.slug)) continue;
        seen.add(r.slug);
        out.push(r);
        if (out.length >= limit) break;
      }
      return out;
    },
    async lastWatched(slug) {
      const rows = await store.byIndex('history', 'slug', slug);
      return rows.sort((a, b) => b.watchedAt - a.watchedAt)[0] || null;
    },
    async get(slug, epNum) { return store.get('history', `${slug}:${epNum}`); },
    /**
     * Guarda o actualiza un episodio SIN perder datos previos:
     *  - progress/position omitidos → se conservan los anteriores (p. ej. al solo abrir el episodio).
     *  - completed es persistente: volver a ver un episodio no lo desmarca.
     *  - title solo se sobrescribe si llega un título real (no vacío).
     */
    async save({ slug, epNum, title, epName, cover, progress, position, duration }) {
      const id = `${slug}:${epNum}`;
      const prev = await store.get('history', id);
      const prog = progress === undefined
        ? (prev?.progress ?? 0)
        : Math.min(1, Math.max(0, progress));
      return store.put('history', {
        id,
        slug,
        epNum,
        title:     title || prev?.title || slug,
        epName:    epName || prev?.epName || `Episodio ${epNum}`,
        cover:     cover || prev?.cover || '',
        watchedAt: Date.now(),
        progress:  prog,
        position:  position === undefined ? (prev?.position ?? 0) : Math.max(0, position),
        duration:  duration === undefined ? (prev?.duration ?? 0) : Math.max(0, duration),
        completed: prog >= WATCHED_THRESHOLD || prev?.completed === true,
      });
    },
    async isWatched(slug, epNum) {
      return isCompleted(await store.get('history', `${slug}:${epNum}`));
    },
    /** Episodios realmente vistos (completados), no los simplemente abiertos. */
    async watchedEps(slug) {
      const rows = await store.byIndex('history', 'slug', slug);
      return new Set(rows.filter(isCompleted).map((r) => r.epNum));
    },
    async remove(slug, epNum) { return store.remove('history', `${slug}:${epNum}`); },
    async clearAll() {
      const rows = await store.getAll('history');
      for (const r of rows) await store.remove('history', r.id);
    },
  };
}
