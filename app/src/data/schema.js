// Esquema de la base local (IndexedDB) y sus migraciones. Sin dependencias.
//
// Almacenes:
//   favorites — anime guardados como favorito
//   history   — episodios vistos (un registro por episodio)
//   settings  — configuración del usuario (un único registro 'user')
//   cache     — caché de datos del scraper con TTL

export const DB_NAME = 'animeav1';
export const DB_VERSION = 1;

export const STORES = {
  favorites: { indexes: [] },
  history:   { indexes: ['slug'] },
  settings:  { indexes: [] },
  cache:     { indexes: [] },
};
export const STORE_NAMES = Object.keys(STORES);
export const SCHEMA_VERSION = DB_VERSION;

export const MIGRATIONS = [
  /* v1 */ (db) => {
    // favorites: { id: slug, slug, title, cover, status, genres, addedAt }
    db.createObjectStore('favorites', { keyPath: 'id' });

    // history: { id: slug+':'+epNum, slug, epNum, title, epName, watchedAt, progress }
    const hist = db.createObjectStore('history', { keyPath: 'id' });
    hist.createIndex('slug', 'slug', { unique: false });

    // settings: { id: 'user', theme: 'dark'|'amoled' }
    db.createObjectStore('settings', { keyPath: 'id' });

    // cache: { id: cacheKey, data, expiresAt }
    db.createObjectStore('cache', { keyPath: 'id' });
  },
];
