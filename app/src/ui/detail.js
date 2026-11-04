// Pantalla de detalle de un anime: portada, sinopsis, lista de episodios.
import { h, btn, icon, loading, empty, toast } from './dom.js';

export function renderDetail(svc, slug, navigate) {
  const root = h('div', { class: 'detail-screen' });
  root.append(loading());

  async function load() {
    root.innerHTML = '';

    let anime;
    try {
      anime = await svc.anime.getAnimeInfo(slug);
    } catch (e) {
      root.append(empty('Error', e.message));
      return;
    }

    const isFav = await svc.favorites.isFav(slug);
    const watched = await svc.history.watchedEps(slug);

    // -- Hero --
    const hero = h('div', { class: 'detail-hero' });
    const poster = h('div', { class: 'poster' });
    if (anime.cover) {
      const img = h('img', { alt: anime.title });
      img.src = anime.cover;
      img.onerror = () => { img.src = ''; img.style.display = 'none'; };
      poster.append(img);
    }
    hero.append(poster);

    const meta = h('div', { class: 'detail-meta' });
    meta.append(h('h1', null, anime.title));

    const badges = h('div', { class: 'badges' });
    if (anime.status) {
      const isOngoing = /en.emisi|ongoing|air/i.test(anime.status);
      badges.append(h('span', { class: `badge ${isOngoing ? 'badge-sage' : 'badge-ice'}` }, anime.status));
    }
    const pastelTypes = ['badge-lilac', 'badge-ice', 'badge-peach', 'badge-rose'];
    (anime.genres || []).slice(0, 4).forEach((g, i) => {
      badges.append(h('span', { class: `badge ${pastelTypes[i % pastelTypes.length]}` }, g));
    });
    meta.append(badges);

    if (anime.synopsis) {
      meta.append(h('p', { class: 'synopsis' }, anime.synopsis));
    }

    hero.append(meta);
    root.append(hero);

    // -- Acciones --
    let favBtn;
    const actions = h('div', { class: 'detail-actions' });

    const toggleFav = async () => {
      const now = await svc.favorites.toggle(anime);
      favBtn.className = `btn ${now ? 'primary' : 'ghost'}`;
      favBtn.querySelector('span').textContent = now ? 'Guardado' : 'Favorito';
    };
    favBtn = btn(isFav ? 'Guardado' : 'Favorito', toggleFav, {
      cls: isFav ? 'primary' : 'ghost',
      ic: isFav ? 'heartFill' : 'heart',
      fill: isFav,
    });
    actions.append(favBtn);

    // Botón "Ver desde el principio"
    if (anime.episodes?.length) {
      const firstEp = [...anime.episodes].sort((a, b) => (a.num || 0) - (b.num || 0))[0];
      if (firstEp) {
        actions.append(btn('Ver ahora', () => navigate(`/watch/${slug}/${firstEp.num || 1}`), { cls: 'primary', ic: 'play' }));
      }
    }
    root.append(actions);

    // -- Lista de episodios --
    if (!anime.episodes?.length) {
      root.append(empty('Sin episodios', 'No se encontraron episodios para este anime.'));
      return;
    }

    const epSection = h('div', { class: 'episodes-list' });
    epSection.append(h('h2', null, `${anime.episodes.length} episodios`));

    const epGrid = h('div', { class: 'episodes-grid' });
    for (const ep of anime.episodes) {
      const num = ep.num ?? epNumFromUrl(ep.url);
      const isWatched = watched.has(num);
      const item = h('button', {
        type: 'button',
        class: `ep-item${isWatched ? ' watched' : ''}`,
        onclick: (e) => {
          e.preventDefault();
          navigate(`/watch/${slug}/${num}`);
        },
      });
      item.append(
        h('div', { class: 'ep-info' },
          h('div', { class: 'ep-num' }, `Episodio ${num ?? '?'}`),
          ep.name ? h('div', { class: 'ep-name' }, ep.name) : null,
        ),
        h('span', { class: 'ep-arrow' }, '›'),
      );
      epGrid.append(item);
    }
    epSection.append(epGrid);
    root.append(epSection);
  }

  load();
  return root;
}

function epNumFromUrl(url = '') {
  const m = url.match(/episodio[-_]?(\d+)/i) || url.match(/\/(\d+)\/?$/);
  return m ? Number(m[1]) : null;
}
