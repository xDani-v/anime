// Pruebas del módulo core/scraper.js — partes puras que no necesitan red ni DOM.
// Las partes que requieren DOMParser (parseo de HTML) se prueban aparte con APK/navegador.
// Ejecutar: node --test tests/scraper.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Importamos solo las funciones puras (no hacen fetch)
import { slugFromUrl, epNumFromUrl, parseEmbeds } from '../app/src/core/scraper.js';

test('slugFromUrl extrae el slug correctamente', () => {
  assert.equal(slugFromUrl('https://animeav1.com/media/one-piece/'), 'one-piece');
  assert.equal(slugFromUrl('https://animeav1.com/media/shingeki-no-kyojin'), 'shingeki-no-kyojin');
  assert.equal(slugFromUrl('/media/naruto-shippuden/5'), 'naruto-shippuden');
  assert.equal(slugFromUrl('/media/dark-machine-the-animation/4'), 'dark-machine-the-animation');
  assert.equal(slugFromUrl(''), '');
});

test('slugFromUrl con URLs sin trailing slash', () => {
  assert.equal(slugFromUrl('https://animeav1.com/media/boku-no-hero'), 'boku-no-hero');
});

test('epNumFromUrl extrae número de episodio', () => {
  assert.equal(epNumFromUrl('https://animeav1.com/media/one-piece/1050'), 1050);
  assert.equal(epNumFromUrl('/media/naruto/1/'), 1);
  assert.equal(epNumFromUrl('/media/db/300'), 300);
  assert.equal(epNumFromUrl('/media/dark-machine-the-animation/4'), 4);
});

test('epNumFromUrl devuelve null si no hay número', () => {
  assert.equal(epNumFromUrl('https://animeav1.com/anime/one-piece/'), null);
  assert.equal(epNumFromUrl(''), null);
});

test('parseEmbeds separa SUB y DUB y mantiene el orden', () => {
  const html = 'x embeds:{SUB:[{server:"HLS",url:"https://z/play/a"},{server:"MP4Upload",url:"https://m/embed-1.html"}],' +
    'DUB:[{server:"HLS",url:"https://z/play/b"}]},downloads:{SUB:[{server:"Mega",url:"https://mega.nz/x"}]}';
  const r = parseEmbeds(html);
  assert.deepEqual(r.map((e) => `${e.lang}:${e.server}`), ['SUB:HLS', 'SUB:MP4Upload', 'DUB:HLS']);
  assert.ok(!r.some((e) => e.url.includes('mega')), 'no debe incluir descargas');
});

test('parseEmbeds sin embeds devuelve lista vacía', () => {
  assert.deepEqual(parseEmbeds('<html></html>'), []);
});
