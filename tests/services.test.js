// Pruebas de servicios: favoritos e historial usando el almacén en memoria.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore }    from '../app/src/data/memory.js';
import { createFavoritesService } from '../app/src/services/favorites.js';
import { createHistoryService, nextTarget, newEpisodeCount } from '../app/src/services/history.js';
import { createBackupService, parseBackup } from '../app/src/services/backup.js';
import { createCacheService, STALE_MAX } from '../app/src/services/cache.js';
import { createSettingsService, DEFAULT_SETTINGS } from '../app/src/services/settings.js';
import { shouldUpdate, httpHint } from '../app/src/services/updater.js';

function makeAnime(slug = 'one-piece') {
  return { slug, title: 'One Piece', cover: 'https://example.com/op.jpg', status: 'En emisión', genres: ['Aventura'] };
}

// ---------- Favoritos ----------

test('toggle agrega un favorito', async () => {
  const store = createMemoryStore();
  const svc = createFavoritesService(store);
  const added = await svc.toggle(makeAnime());
  assert.equal(added, true);
  assert.equal(await svc.isFav('one-piece'), true);
});

test('toggle dos veces quita el favorito', async () => {
  const store = createMemoryStore();
  const svc = createFavoritesService(store);
  await svc.toggle(makeAnime());
  const removed = await svc.toggle(makeAnime());
  assert.equal(removed, false);
  assert.equal(await svc.isFav('one-piece'), false);
});

test('getAll devuelve los favoritos ordenados por fecha', async () => {
  const store = createMemoryStore();
  const svc = createFavoritesService(store);
  await svc.toggle(makeAnime('one-piece'));
  await new Promise((r) => setTimeout(r, 5));
  await svc.toggle(makeAnime('naruto'));
  const favs = await svc.getAll();
  assert.equal(favs.length, 2);
  // El más reciente es naruto (se agregó último)
  assert.equal(favs[0].slug, 'naruto');
});

test('remove elimina un favorito', async () => {
  const store = createMemoryStore();
  const svc = createFavoritesService(store);
  await svc.toggle(makeAnime());
  await svc.remove('one-piece');
  assert.equal(await svc.isFav('one-piece'), false);
});

// ---------- Historial ----------

test('save guarda un episodio en el historial', async () => {
  const store = createMemoryStore();
  const svc = createHistoryService(store);
  await svc.save({ slug: 'one-piece', epNum: 1050, title: 'One Piece', epName: 'Episodio 1050', progress: 0.5 });
  const rec = await svc.get('one-piece', 1050);
  assert.ok(rec);
  assert.equal(rec.progress, 0.5);
});

test('isWatched devuelve true si progress >= 0.9', async () => {
  const store = createMemoryStore();
  const svc = createHistoryService(store);
  await svc.save({ slug: 'one-piece', epNum: 1, title: 'One Piece', epName: 'Ep 1', progress: 0.95 });
  assert.equal(await svc.isWatched('one-piece', 1), true);
});

test('isWatched devuelve false si progress < 0.9', async () => {
  const store = createMemoryStore();
  const svc = createHistoryService(store);
  await svc.save({ slug: 'one-piece', epNum: 2, title: 'One Piece', epName: 'Ep 2', progress: 0.5 });
  assert.equal(await svc.isWatched('one-piece', 2), false);
});

test('watchedEps devuelve Set con números de episodios vistos', async () => {
  const store = createMemoryStore();
  const svc = createHistoryService(store);
  await svc.save({ slug: 'op', epNum: 1, title: 'OP', epName: 'Ep 1', progress: 1 });
  await svc.save({ slug: 'op', epNum: 2, title: 'OP', epName: 'Ep 2', progress: 1 });
  await svc.save({ slug: 'naruto', epNum: 1, title: 'Naruto', epName: 'Ep 1', progress: 1 });
  const set = await svc.watchedEps('op');
  assert.equal(set.size, 2);
  assert.ok(set.has(1));
  assert.ok(set.has(2));
  assert.ok(!set.has(3));
});

test('clearAll vacía el historial', async () => {
  const store = createMemoryStore();
  const svc = createHistoryService(store);
  await svc.save({ slug: 'op', epNum: 1, title: 'OP', epName: 'Ep 1', progress: 0.8 });
  await svc.clearAll();
  const all = await svc.getAll();
  assert.equal(all.length, 0);
});

// ---------- Historial: integridad de datos ----------

test('abrir un episodio (save sin progress) conserva el progreso y la posición', async () => {
  const svc = createHistoryService(createMemoryStore());
  await svc.save({ slug: 'op', epNum: 1, title: 'One Piece', progress: 0.5, position: 600, duration: 1200 });
  await svc.save({ slug: 'op', epNum: 1, title: 'One Piece' });
  const r = await svc.get('op', 1);
  assert.equal(r.progress, 0.5);
  assert.equal(r.position, 600);
});

test('un episodio completado sigue visto aunque se vuelva a ver desde el inicio', async () => {
  const svc = createHistoryService(createMemoryStore());
  await svc.save({ slug: 'op', epNum: 1, title: 'One Piece', progress: 1 });
  await svc.save({ slug: 'op', epNum: 1, title: 'One Piece', progress: 0.05, position: 60 });
  assert.equal(await svc.isWatched('op', 1), true);
  assert.ok((await svc.watchedEps('op')).has(1));
});

test('watchedEps ignora episodios solo abiertos o a medias', async () => {
  const svc = createHistoryService(createMemoryStore());
  await svc.save({ slug: 'op', epNum: 1, title: 'OP' });
  await svc.save({ slug: 'op', epNum: 2, title: 'OP', progress: 0.4 });
  await svc.save({ slug: 'op', epNum: 3, title: 'OP', progress: 0.95 });
  assert.deepEqual([...(await svc.watchedEps('op'))], [3]);
});

test('el título real no se pisa con el slug', async () => {
  const svc = createHistoryService(createMemoryStore());
  await svc.save({ slug: 'op', epNum: 1, title: 'One Piece', progress: 0.2 });
  await svc.save({ slug: 'op', epNum: 1, progress: 0.3 });
  assert.equal((await svc.get('op', 1)).title, 'One Piece');
});

// ---------- Continuar viendo ----------

test('lastPerAnime devuelve un registro por anime, el más reciente primero', async () => {
  const svc = createHistoryService(createMemoryStore());
  await svc.save({ slug: 'a', epNum: 1, title: 'A', progress: 1 });
  await new Promise((r) => setTimeout(r, 3));
  await svc.save({ slug: 'b', epNum: 4, title: 'B', progress: 0.3, position: 100 });
  await new Promise((r) => setTimeout(r, 3));
  await svc.save({ slug: 'a', epNum: 2, title: 'A', progress: 0.5, position: 200 });
  const rows = await svc.lastPerAnime();
  assert.deepEqual(rows.map((r) => `${r.slug}:${r.epNum}`), ['a:2', 'b:4']);
});

test('nextTarget: a medias reanuda el mismo episodio', () => {
  const t = nextTarget({ epNum: 3, progress: 0.4, position: 300 }, [1, 2, 3, 4]);
  assert.deepEqual([t.epNum, t.resume, t.position], [3, true, 300]);
});

test('nextTarget: terminado salta al siguiente y respeta huecos', () => {
  const t = nextTarget({ epNum: 3, progress: 1, completed: true }, [1, 2, 3, 5]);
  assert.equal(t.epNum, 5);
  assert.equal(t.resume, false);
});

test('nextTarget: último episodio terminado devuelve null', () => {
  assert.equal(nextTarget({ epNum: 4, progress: 1, completed: true }, [1, 2, 3, 4]), null);
});

test('nextTarget: sin lista de episodios pide resolverla', () => {
  const t = nextTarget({ epNum: 2, progress: 1, completed: true }, []);
  assert.equal(t.epNum, 3);
  assert.equal(t.needsEpisodes, true);
});

test('nextTarget: abierto sin avanzar repite el mismo episodio desde el inicio', () => {
  const t = nextTarget({ epNum: 1, progress: 0, position: 0 }, [1, 2]);
  assert.deepEqual([t.epNum, t.resume], [1, false]);
});

// ---------- Caché stale-while-revalidate ----------

const ageEntry = async (store, key, msPastExpiry) => {
  const row = await store.get('cache', key);
  row.expiresAt = Date.now() - msPastExpiry;
  await store.put('cache', row);
};

test('swr: dato fresco no llama a la red', async () => {
  const cache = createCacheService(createMemoryStore());
  let calls = 0;
  const fetcher = async () => { calls++; return { v: 1 }; };
  await cache.swr('k', 'latest', fetcher);
  await cache.swr('k', 'latest', fetcher);
  assert.equal(calls, 1);
});

test('swr: dato vencido se sirve al instante y se refresca en segundo plano', async () => {
  const store = createMemoryStore();
  const cache = createCacheService(store);
  await cache.swr('k', 'latest', async () => ({ v: 1 }));
  await ageEntry(store, 'k', 1000);

  let refreshed = null;
  const res = await cache.swr('k', 'latest', async () => ({ v: 2 }), { onRefresh: (d) => { refreshed = d; } });
  assert.deepEqual(res, { v: 1 });             // respuesta inmediata con lo viejo
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(refreshed, { v: 2 });       // llegó el dato nuevo
  assert.deepEqual(await cache.get('k'), { v: 2 }); // y quedó guardado
});

test('swr: sin red y con copia vieja devuelve la copia en vez de fallar', async () => {
  const store = createMemoryStore();
  const cache = createCacheService(store);
  await cache.swr('k', 'latest', async () => ({ v: 1 }));
  await ageEntry(store, 'k', 1000);
  const res = await cache.swr('k', 'latest', async () => { throw new Error('offline'); }, { serveStale: false });
  assert.deepEqual(res, { v: 1 });
});

test('swr: sin red y sin copia propaga el error', async () => {
  const cache = createCacheService(createMemoryStore());
  await assert.rejects(cache.swr('k', 'latest', async () => { throw new Error('offline'); }), /offline/);
});

test('swr: peticiones simultáneas comparten una sola llamada de red', async () => {
  const cache = createCacheService(createMemoryStore());
  let calls = 0;
  const fetcher = async () => { calls++; await new Promise((r) => setTimeout(r, 5)); return { v: 1 }; };
  await Promise.all([cache.swr('k', 'latest', fetcher), cache.swr('k', 'latest', fetcher)]);
  assert.equal(calls, 1);
});

test('prune elimina solo lo que superó STALE_MAX', async () => {
  const store = createMemoryStore();
  const cache = createCacheService(store);
  await cache.set('viejo', { v: 1 });
  await cache.set('reciente', { v: 2 });
  await ageEntry(store, 'viejo', STALE_MAX + 1000);
  await ageEntry(store, 'reciente', 1000);
  assert.equal(await cache.prune(), 1);
  assert.equal(await store.get('cache', 'viejo'), undefined);
  assert.ok(await store.get('cache', 'reciente'));
});

// ---------- Ajustes ----------

test('settings: valores por defecto y persistencia', async () => {
  const store = createMemoryStore();
  const svc = createSettingsService(store);
  assert.equal((await svc.get()).lang, DEFAULT_SETTINGS.lang);
  await svc.set({ lang: 'DUB', autoNext: false });
  const again = await createSettingsService(store).get(); // instancia nueva: lee de la base
  assert.equal(again.lang, 'DUB');
  assert.equal(again.autoNext, false);
  assert.equal(again.server, 'MP4Upload'); // lo no tocado conserva el valor por defecto
});

test('settings: rememberServer guarda por anime y limita el tamaño', async () => {
  const svc = createSettingsService(createMemoryStore());
  for (let i = 0; i < 60; i++) await svc.rememberServer(`anime-${i}`, 'Voe');
  const st = await svc.get();
  assert.equal(Object.keys(st.serverBySlug).length, 50);
  assert.equal(st.serverBySlug['anime-59'], 'Voe');
  assert.equal(st.serverBySlug['anime-0'], undefined); // se descartan los más antiguos
});

test('settings: reset vuelve a los valores por defecto', async () => {
  const svc = createSettingsService(createMemoryStore());
  await svc.set({ lang: 'DUB' });
  assert.equal((await svc.reset()).lang, 'SUB');
});

// ---------- Episodios nuevos en favoritos ----------

test('newEpisodeCount cuenta los posteriores al último completado', () => {
  const rows = [{ epNum: 1, progress: 1, completed: true }, { epNum: 2, progress: 1, completed: true }];
  assert.equal(newEpisodeCount([1, 2, 3, 4, 5], rows), 3);
});

test('newEpisodeCount es 0 si no terminó ningún episodio o está al día', () => {
  assert.equal(newEpisodeCount([1, 2, 3], []), 0);
  assert.equal(newEpisodeCount([1, 2, 3], [{ epNum: 1, progress: 0.3, completed: false }]), 0);
  assert.equal(newEpisodeCount([1, 2], [{ epNum: 2, progress: 1, completed: true }]), 0);
});

// ---------- Respaldo ----------

async function seed(store) {
  await store.put('favorites', { id: 'op', slug: 'op', title: 'One Piece', cover: '', status: '', genres: [], addedAt: 1 });
  await store.put('history', { id: 'op:1', slug: 'op', epNum: 1, title: 'One Piece', epName: 'Episodio 1', watchedAt: 100, progress: 1, position: 0, duration: 1400, completed: true });
  await store.put('settings', { id: 'user', lang: 'DUB' });
  await store.put('cache', { id: 'k', data: 1, expiresAt: 1 });
}

test('backup: exporta favoritos, historial y ajustes, sin caché', async () => {
  const store = createMemoryStore();
  await seed(store);
  const out = await createBackupService(store).exportData();
  assert.equal(out.app, 'animeav1');
  assert.equal(out.data.favorites.length, 1);
  assert.equal(out.data.history.length, 1);
  assert.equal(out.data.settings[0].lang, 'DUB');
  assert.equal(out.data.cache, undefined);
});

test('backup: exportar e importar en otro dispositivo restaura todo', async () => {
  const a = createMemoryStore();
  await seed(a);
  const dump = JSON.parse(JSON.stringify(await createBackupService(a).exportData()));
  const b = createMemoryStore();
  const res = await createBackupService(b).importData(dump);
  assert.deepEqual([res.favorites, res.episodes, res.settings], [1, 1, true]);
  assert.equal((await b.get('settings', 'user')).lang, 'DUB');
});

test('backup: importar fusiona y gana el registro más reciente', async () => {
  const store = createMemoryStore();
  await store.put('history', { id: 'op:1', slug: 'op', epNum: 1, title: 'OP', epName: 'E1', watchedAt: 500, progress: 0.4, position: 300, duration: 1000, completed: false });
  const dump = { app: 'animeav1', version: 1, data: { favorites: [], history: [
    { slug: 'op', epNum: 1, title: 'OP', watchedAt: 100, progress: 1 },   // más viejo pero completado
    { slug: 'op', epNum: 2, title: 'OP', watchedAt: 200, progress: 0.5 },
  ], settings: [] } };
  await createBackupService(store).importData(dump);
  const e1 = await store.get('history', 'op:1');
  assert.equal(e1.position, 300);          // se conserva el más reciente (local)
  assert.equal(e1.completed, true);        // pero no se pierde que ya estaba completado
  assert.ok(await store.get('history', 'op:2'));
});

test('backup: rechaza archivos que no son un respaldo y descarta registros corruptos', () => {
  assert.throws(() => parseBackup({ foo: 1 }), /no es un respaldo/);
  assert.throws(() => parseBackup({ app: 'animeav1', version: 99, data: {} }), /más nueva/);
  const ok = parseBackup({ app: 'animeav1', version: 1, data: {
    favorites: [{ slug: 'a' }, { title: 'sin slug' }, null],
    history: [{ slug: 'a', epNum: 'x' }, { slug: 'a', epNum: 3, progress: 7 }],
  } });
  assert.equal(ok.favorites.length, 1);
  assert.equal(ok.history.length, 1);
  assert.equal(ok.history[0].progress, 1); // valores fuera de rango se acotan
});

// ---------- OTA ----------

test('shouldUpdate solo si el remoto publica otra versión', () => {
  assert.equal(shouldUpdate('abc1234', 'def5678'), true);
  assert.equal(shouldUpdate('abc1234', 'abc1234'), false);
  assert.equal(shouldUpdate('abc1234', undefined), false);
  assert.equal(shouldUpdate('1.0.0', 'abc1234'), true); // bundle integrado -> primera actualización
});

test('httpHint explica el 404 de version.json', () => {
  assert.match(httpHint(404), /público/);
  assert.match(httpHint(503), /503/);
});
