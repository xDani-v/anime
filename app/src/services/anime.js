// Capa de servicios: anime — envuelve el scraper con caché stale-while-revalidate.
// Cada método acepta opts.onRefresh(data) para enterarse si el refresco en segundo plano trajo cambios.
import { getLatest, searchDynamic, searchAnime, getCatalogo, getAnimeInfo, getEpisodeSources } from '../core/scraper.js';

export function createAnimeService(cache) {
  const cached = (key, kind, fetcher, opts) => cache.swr(key, kind, fetcher, opts);

  return {
    getLatest: (opts) =>
      cached('latest', 'latest', getLatest, opts),

    // Búsqueda dinámica ultra-rápida (oficial vía POST /api/search)
    searchDynamic: (query, opts) =>
      cached(`dynsearch:${query.toLowerCase().trim()}`, 'search', () => searchDynamic(query), opts),

    // Directorio y catálogo con filtros
    getCatalogo: (filters = {}, opts) => {
      const key = `cat:${JSON.stringify(filters)}`;
      return cached(key, 'latest', () => getCatalogo(filters), opts);
    },

    search: (query, page = 1, opts) =>
      cached(`search:${query}:${page}`, 'search', () => searchAnime(query, page), opts),

    getAnimeInfo: (slug, opts) =>
      cached(`anime:${slug}`, 'anime', () => getAnimeInfo(slug), opts),

    // Los enlaces de video caducan: con dato vencido se intenta primero la red
    getEpisodeSources: (slug, epNum) =>
      cached(`ep:${slug}:${epNum}`, 'episode', () => getEpisodeSources(slug, epNum), { serveStale: false }),
  };
}
