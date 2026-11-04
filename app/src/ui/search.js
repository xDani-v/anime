// Pantalla de búsqueda dinámica en tiempo real vía POST /api/search
import { h, loading, empty, toast } from './dom.js';

export function renderSearch(svc, navigate, initialQuery = '') {
  const root = h('div', { class: 'search-screen' });

  const bar = h('div', { class: 'search-bar' });
  const input = h('input', {
    type: 'search',
    placeholder: 'Escribe para buscar anime en vivo…',
    value: initialQuery,
    autocomplete: 'off',
    autofocus: true,
  });
  bar.append(input);
  root.append(bar);

  const statusText = h('div', { class: 'search-status', style: 'padding: 8px 16px; font-size: 0.8rem; color: var(--text2);' });
  root.append(statusText);

  const results = h('div', { class: 'search-results' });
  root.append(results);

  let debounce;
  let currentQuery = '';

  async function doSearch(q) {
    q = q.trim();
    if (!q) {
      currentQuery = '';
      statusText.textContent = '';
      results.innerHTML = '';
      return;
    }
    if (q === currentQuery) return;
    currentQuery = q;

    statusText.textContent = `Buscando "${q}"…`;
    results.innerHTML = '';
    results.append(loading());

    try {
      // 1. Usar la API dinámica de búsqueda
      let items = await svc.anime.searchDynamic(q);

      // Si no devolvió nada por API, intentar vía catálogo
      if (!items || !items.length) {
        const catRes = await svc.anime.search(q);
        items = catRes?.items || catRes || [];
      }

      results.innerHTML = '';
      if (!items.length) {
        statusText.textContent = '';
        results.append(empty('Sin resultados', `No se encontró ningún anime para "${q}".`));
        return;
      }

      statusText.textContent = `${items.length} resultados para "${q}"`;
      const grid = h('div', { class: 'anime-grid' });
      for (const anime of items) {
        grid.append(_card(anime, navigate));
      }
      results.append(grid);
    } catch (e) {
      results.innerHTML = '';
      statusText.textContent = '';
      toast(`Error al buscar: ${e.message}`, 'error');
    }
  }

  // Búsqueda dinámica reactiva mientras se escribe
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => doSearch(input.value), 280);
  });

  if (initialQuery) doSearch(initialQuery);
  else setTimeout(() => input.focus(), 60);

  return root;
}

function _card(anime, navigate) {
  const card = h('div', {
    class: 'anime-card',
    tabindex: '0',
    onclick: () => navigate(`/anime/${anime.slug}`),
  });

  const cover = h('div', { class: 'cover' });
  if (anime.cover) {
    const img = h('img', { alt: anime.title, loading: 'lazy' });
    img.src = anime.cover;
    img.onerror = () => { img.src = ''; img.style.display = 'none'; };
    cover.append(img);
  }
  if (anime.badge) cover.append(h('span', { class: 'ep-badge' }, anime.badge));
  card.append(cover);

  // Nombre del anime visible y legible
  const info = h('div', { class: 'info' });
  const title = h('div', { class: 'title' }, anime.title);
  info.append(title);
  card.append(info);

  return card;
}
