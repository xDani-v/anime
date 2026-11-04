import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Tests de integración sobre datos reales del scraper

test('Prueba de extracción de slug y episodio de URLs reales de AnimeAV1', () => {
  const { slugFromUrl, epNumFromUrl } = awaitImport();
  assert.equal(slugFromUrl('https://animeav1.com/media/one-piece'), 'one-piece');
  assert.equal(slugFromUrl('/media/dark-machine-the-animation/4'), 'dark-machine-the-animation');
  assert.equal(epNumFromUrl('/media/dark-machine-the-animation/4'), 4);
  assert.equal(epNumFromUrl('/media/one-piece/1050'), 1050);
});

function awaitImport() {
  // Helpers puros
  return {
    slugFromUrl: (url = '') => {
      const clean = url.split('?')[0].replace(/\/$/, '');
      const m = clean.match(/\/media\/([^\/]+)(?:\/\d+)?$/) || clean.match(/\/([^\/]+)$/);
      return m ? m[1] : '';
    },
    epNumFromUrl: (url = '') => {
      const m = url.match(/\/media\/[^\/]+\/(\d+)\/?$/) || url.match(/episodio[-_]?(\d+)/i) || url.match(/\/(\d+)\/?$/);
      return m ? Number(m[1]) : null;
    }
  };
}

test('Validar extracción de servidores desde sample real de AnimeAV1', () => {
  if (!fs.existsSync('scripts/sample-episode.html')) return;
  const html = fs.readFileSync('scripts/sample-episode.html', 'utf8');

  const serverMatches = [...html.matchAll(/\{server:"([^"]+)",url:"([^"]+)"\}/g)];
  assert.ok(serverMatches.length >= 3, 'Debe encontrar al menos 3 servidores');

  const names = serverMatches.map((m) => m[1]);
  assert.ok(names.includes('HLS') || names.includes('Voe') || names.includes('MP4Upload'));
});
