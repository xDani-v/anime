// Pantalla de favoritos.
import { h, loading, empty, toast } from './dom.js';

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
      grid.append(card);
    }
    content.append(grid);
  }

  load();
  return root;
}
