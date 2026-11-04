// Punto de entrada único para todos los servicios. Recibe el store por parámetro.
import { createFavoritesService } from './favorites.js';
import { createHistoryService }   from './history.js';
import { createCacheService }     from './cache.js';
import { createAnimeService }     from './anime.js';
import { createSettingsService }  from './settings.js';
import { createBackupService }    from './backup.js';

export function createServices(store) {
  const cache     = createCacheService(store);
  const favorites = createFavoritesService(store);
  const history   = createHistoryService(store);
  const anime     = createAnimeService(cache);
  const settings  = createSettingsService(store);
  const backup    = createBackupService(store);
  return { anime, favorites, history, cache, settings, backup };
}
