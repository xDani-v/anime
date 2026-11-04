// Pruebas de servicios: favoritos e historial usando el almacén en memoria.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore }    from '../app/src/data/memory.js';
import { createFavoritesService } from '../app/src/services/favorites.js';
import { createHistoryService }   from '../app/src/services/history.js';

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
