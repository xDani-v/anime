// Pantalla Home: últimos episodios y acceso rápido a favoritos/historial.
import { h, loading, empty, toast } from './dom.js';

export function renderHome(svc, navigate) {
  const root = h('div', { class: 'home-screen' });
  root.append(loading());

  async function load() {
    root.innerHTML = '';

    // -- Últimos episodios --
    const section = h('div', { class: 'section' },
      h('div', { class: 'section-head' },
        h('h2', null, 'Últimos episodios'),
      ),
    );

    let latest = [];
    try {
      latest = await svc.anime.getLatest();
    } catch (e) {
      toast(`Error al cargar: ${e.message}`, 'error');
    }

    if (!latest.length) {
      root.append(
        empty('Sin resultados', 'No se pudieron cargar los últimos episodios. ¿Tienes internet?'),
      );
      return;
    }

    root.append(section);

    const grid = h('div', { class: 'anime-grid' });
    for (const anime of latest) {
      grid.append(_card(anime, navigate));
    }
    root.append(grid);
  }

  load();
  return root;
}

function _card(anime, navigate) {
  const targetRoute = anime.epNum ? `/watch/${anime.slug}/${anime.epNum}` : `/anime/${anime.slug}`;
  const card = h('div', {
    class: 'anime-card',
    tabindex: '0',
    onclick: () => navigate(targetRoute),
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
  card.append(h('div', { class: 'info' }, h('div', { class: 'title' }, anime.title)));
  return card;
}
