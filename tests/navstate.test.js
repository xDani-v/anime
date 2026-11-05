// Pruebas de la lógica pura de navegación (sin DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTopLevel, createViewStateStore } from '../app/src/ui/navstate.js';

test('isTopLevel distingue pestañas principales de subpantallas', () => {
  for (const p of ['/', '', '/catalogo', '/catalogo?genre=accion', '/buscar?q=one', '/favoritos', '/historial', '/ajustes', '/ajustes/']) {
    assert.equal(isTopLevel(p), true, p);
  }
  for (const p of ['/anime/one-piece', '/watch/one-piece/1', '/otra-cosa']) {
    assert.equal(isTopLevel(p), false, p);
  }
});

test('viewStateStore guarda, sobrescribe y descarta los más antiguos', () => {
  const st = createViewStateStore(2);
  st.set('a', { scroll: 1 });
  st.set('b', { scroll: 2 });
  st.set('a', { scroll: 10 });   // 'a' pasa a ser el más reciente
  st.set('c', { scroll: 3 });    // expulsa a 'b'
  assert.equal(st.get('b'), undefined);
  assert.equal(st.get('a').scroll, 10);
  assert.equal(st.get('c').scroll, 3);
  assert.equal(st.size, 2);
});

test('viewStateStore ignora claves o estados vacíos', () => {
  const st = createViewStateStore();
  st.set(null, { scroll: 1 });
  st.set('x', null);
  assert.equal(st.size, 0);
  assert.equal(st.get(undefined), undefined);
});
