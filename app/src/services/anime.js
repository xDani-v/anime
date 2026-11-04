// Capa de servicios: anime — envuelve el scraper con caché inteligente.
import { getLatest, searchDynamic, searchAnime, getCatalogo, getAnimeInfo, getEpisodeSources } from '../core/scraper.js';

export function createAnimeService(cache) {
  async function cached(key, kind, fetcher) {
    const hit = await cache.get(key);
    if (hit) return hit;
    const data = await fetcher();
    await cache.set(key, data, kind);
    return data;
  }

  return {
    getLatest: () =>
      cached('latest', 'latest', getLatest),

    // Búsqueda dinámica ultra-rápida (oficial vía POST /api/search)
    searchDynamic: (query) =>
      cached(`dynsearch:${query.toLowerCase().trim()}`, 'search', () => searchDynamic(query)),

    // Directorio y catálogo con filtros
    getCatalogo: (filters = {}) => {
      const key = `cat:${JSON.stringify(filters)}`;
      return cached(key, 'latest', () => getCatalogo(filters));
    },

    search: (query, page = 1) =>
      cached(`search:${query}:${page}`, 'search', () => searchAnime(query, page)),

    getAnimeInfo: (slug) =>
      cached(`anime:${slug}`, 'anime', () => getAnimeInfo(slug)),

    getEpisodeSources: (slug, epNum) =>
      cached(`ep:${slug}:${epNum}`, 'episode', () => getEpisodeSources(slug, epNum)),
  };
}
