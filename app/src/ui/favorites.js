// Pantalla de favoritos.
import { h, loading, empty, toast } from './dom.js';
import { newEpisodeCount } from '../services/history.js';

export function renderFavorites(svc, navigate) {
  const root = h('div', { class: 'fav-screen' });
  root.append(h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Favoritos'))));

  const content = h('div', { class: 'fav-content' });
  root.append(content);
  content.append(loading());

  async function load() {
    content.innerHTML = '';

    let items;
    try {
      items = await svc.favorites.getAll();
    } catch (e) {
      toast(e.message, 'error');
      return;
    }

    if (!items || !items.length) {
      content.append(empty('Sin favoritos', 'Guarda animes desde su ficha de detalle para verlos aquí.'));
      return;
    }

    const grid = h('div', { class: 'anime-grid' });
    const covers = new Map(); // slug -> elemento .cover (para añadir el badge luego)
    for (const fav of items) {
      const card = h('div', {
        class: 'anime-card',
        tabindex: '0',
        onclick: () => navigate(`/anime/${fav.slug}`),
      });
      const cover = h('div', { class: 'cover' });
      if (fav.cover) {
        const img = h('img', { alt: fav.title, loading: 'lazy' });
        img.src = fav.cover;
        img.onerror = () => { img.src = ''; img.style.display = 'none'; };
        cover.append(img);
      }
      if (fav.status) {
        cover.append(h('span', { class: 'ep-badge' }, fav.status));
      }
      card.append(cover);
      card.append(h('div', { class: 'info' }, h('div', { class: 'title' }, fav.title)));
      covers.set(fav.slug, cover);
      grid.append(card);
    }
    content.append(grid);
    markNewEpisodes(svc, items, covers);
  }

  load();
  return root;
}

// Avisa "+N nuevos" en los favoritos que ya vienes siguiendo y tienen episodios sin ver.
// Las tarjetas se pintan primero; los avisos llegan después sin bloquear la pantalla.
async function markNewEpisodes(svc, favs, covers) {
  let rows = [];
  try { rows = await svc.history.getAll(); } catch { return; }
  const bySlug = new Map();
  for (const r of rows) {
    if (!bySlug.has(r.slug)) bySlug.set(r.slug, []);
    bySlug.get(r.slug).push(r);
  }

  // Solo los que has empezado a ver; máximo 4 consultas a la vez
  const queue = favs.filter((f) => bySlug.has(f.slug));
  async function worker() {
    while (queue.length) {
      const fav = queue.shift();
      try {
        const info = await svc.anime.getAnimeInfo(fav.slug);
        const n = newEpisodeCount((info.episodes || []).map((e) => Number(e.num)), bySlug.get(fav.slug));
        const cover = covers.get(fav.slug);
        if (n > 0 && cover?.isConnected) {
          cover.append(h('span', { class: 'ep-badge new-badge' }, n === 1 ? '+1 nuevo' : `+${n} nuevos`));
        }
      } catch { /* sin red: sin aviso */ }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
}
