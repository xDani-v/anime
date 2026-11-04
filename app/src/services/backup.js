// Capa de servicios: respaldo y restauración de los datos del usuario.
// Incluye favoritos, historial y ajustes. La caché NO se respalda (se regenera sola).
// Importar FUSIONA con lo existente: no pierde lo que ya hay en el dispositivo.

export const BACKUP_APP = 'animeav1';
export const BACKUP_VERSION = 1;

const isStr = (v) => typeof v === 'string' && v.length > 0;
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

// Sanean cada registro: se descarta lo que no tenga la forma esperada (archivo corrupto o manipulado)
function cleanFavorite(r) {
  if (!r || !isStr(r.slug)) return null;
  return {
    id: r.slug, slug: r.slug,
    title: String(r.title || r.slug),
    cover: String(r.cover || ''),
    status: String(r.status || ''),
    genres: Array.isArray(r.genres) ? r.genres.map(String) : [],
    addedAt: num(r.addedAt, Date.now()),
  };
}

function cleanHistory(r) {
  if (!r || !isStr(r.slug) || !Number.isFinite(r.epNum)) return null;
  return {
    id: `${r.slug}:${r.epNum}`, slug: r.slug, epNum: r.epNum,
    title: String(r.title || r.slug),
    epName: String(r.epName || `Episodio ${r.epNum}`),
    cover: String(r.cover || ''),
    watchedAt: num(r.watchedAt, Date.now()),
    progress: Math.min(1, Math.max(0, num(r.progress))),
    position: Math.max(0, num(r.position)),
    duration: Math.max(0, num(r.duration)),
    completed: r.completed === true || num(r.progress) >= 0.9,
  };
}

function cleanSettings(r) {
  if (!r || typeof r !== 'object') return null;
  const out = { id: 'user' };
  if (r.lang === 'SUB' || r.lang === 'DUB') out.lang = r.lang;
  if (isStr(r.server)) out.server = r.server;
  if (typeof r.autoNext === 'boolean') out.autoNext = r.autoNext;
  if (r.serverBySlug && typeof r.serverBySlug === 'object') {
    out.serverBySlug = Object.fromEntries(
      Object.entries(r.serverBySlug).filter(([k, v]) => isStr(k) && isStr(v)).slice(-50),
    );
  }
  return out;
}

/** Valida y limpia un respaldo. Lanza Error con mensaje claro si no es un respaldo válido. */
export function parseBackup(obj) {
  if (!obj || typeof obj !== 'object' || obj.app !== BACKUP_APP || !obj.data) {
    throw new Error('El archivo no es un respaldo de AnimeAV1.');
  }
  if (!Number.isFinite(obj.version) || obj.version > BACKUP_VERSION) {
    throw new Error('El respaldo es de una versión más nueva de la app. Actualiza e inténtalo de nuevo.');
  }
  const d = obj.data;
  return {
    favorites: (Array.isArray(d.favorites) ? d.favorites : []).map(cleanFavorite).filter(Boolean),
    history:   (Array.isArray(d.history) ? d.history : []).map(cleanHistory).filter(Boolean),
    settings:  cleanSettings(Array.isArray(d.settings) ? d.settings[0] : d.settings),
  };
}

export function createBackupService(store) {
  return {
    async exportData() {
      const [favorites, history, settings] = await Promise.all([
        store.getAll('favorites'), store.getAll('history'), store.getAll('settings'),
      ]);
      return {
        app: BACKUP_APP,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        data: { favorites, history, settings },
      };
    },

    /** Fusiona el respaldo con los datos actuales. Devuelve un resumen de lo incorporado. */
    async importData(obj) {
      const incoming = parseBackup(obj);
      const [favs, hist] = await Promise.all([store.getAll('favorites'), store.getAll('history')]);
      const haveFav = new Set(favs.map((f) => f.id));
      const haveHist = new Map(hist.map((r) => [r.id, r]));

      const ops = [];
      let addedFavs = 0;
      let addedEps = 0;

      for (const f of incoming.favorites) {
        if (haveFav.has(f.id)) continue;           // el favorito local manda
        ops.push({ op: 'put', store: 'favorites', value: f });
        addedFavs++;
      }
      for (const r of incoming.history) {
        const cur = haveHist.get(r.id);
        if (cur && cur.watchedAt >= r.watchedAt) { // gana el registro más reciente
          // conservar "completado" aunque el local sea más nuevo
          if (r.completed && !cur.completed) ops.push({ op: 'put', store: 'history', value: { ...cur, completed: true } });
          continue;
        }
        ops.push({ op: 'put', store: 'history', value: { ...r, completed: r.completed || cur?.completed === true } });
        if (!cur) addedEps++;
      }
      if (incoming.settings) {
        const cur = (await store.get('settings', 'user')) || {};
        ops.push({ op: 'put', store: 'settings', value: { ...cur, ...incoming.settings, id: 'user' } });
      }

      if (ops.length) await store.batch(ops);
      return { favorites: addedFavs, episodes: addedEps, settings: !!incoming.settings };
    },
  };
}
