// Pantalla Home: últimos episodios y acceso rápido a favoritos/historial.
import { h, btn, loading, empty, toast } from './dom.js';
import { nextTarget, prettyTitle } from '../services/history.js';

export function renderHome(svc, navigate) {
  const root = h('div', { class: 'home-screen' });
  root.append(loading());

  async function load() {
    root.innerHTML = '';

    // -- Continuar viendo (datos locales: aparece al instante) --
    const contHolder = h('div', { class: 'continue-holder' });
    root.append(contHolder);
    loadContinue(svc, navigate, contHolder);

    // -- Últimos episodios (caché al instante + refresco en segundo plano) --
    const section = h('div', { class: 'section' },
      h('div', { class: 'section-head' },
        h('h2', null, 'Últimos episodios'),
      ),
    );
    const grid = h('div', { class: 'anime-grid' });

    // Pinta la lista conservando la posición del foco (importante con el D-Pad)
    function paint(list) {
      const kids = [...grid.children];
      const focusIdx = kids.findIndex((el) => el === document.activeElement);
      grid.replaceChildren(...list.map((anime) => _card(anime, navigate)));
      if (focusIdx !== -1) grid.children[Math.min(focusIdx, grid.children.length - 1)]?.focus({ preventScroll: true });
    }

    let latest = [];
    let failed = null;
    try {
      latest = await svc.anime.getLatest({ onRefresh: (fresh) => { if (fresh?.length) paint(fresh); } });
    } catch (e) {
      failed = e;
    }

    if (!latest.length) {
      root.append(
        empty(
          failed ? 'Sin conexión' : 'Sin resultados',
          failed
            ? 'No se pudieron cargar los últimos episodios y no hay datos guardados. Revisa tu internet.'
            : 'No hay episodios para mostrar.',
          btn('Reintentar', () => { root.replaceChildren(loading()); load(); }, { cls: 'primary', ic: 'refresh' }),
        ),
      );
      return;
    }

    root.append(section);
    paint(latest);
    root.append(grid);
  }

  load();
  return root;
}

async function loadContinue(svc, navigate, holder) {
  let rows = [];
  try { rows = await svc.history.lastPerAnime(12); } catch { return; }
  if (!rows.length) return;

  // Resolver destino; si terminó un episodio hace falta la lista (cacheada) para el siguiente
  const items = (await Promise.all(rows.map(async (row) => {
    let epNums = [];
    let info = null;
    const needInfo = !row.cover || nextTarget(row)?.needsEpisodes;
    if (needInfo) {
      try {
        info = await svc.anime.getAnimeInfo(row.slug);
        epNums = (info.episodes || []).map((e) => Number(e.num)).sort((a, b) => a - b);
      } catch { /* sin red: usar lo que haya */ }
    }
    const target = nextTarget(row, epNums);
    if (!target || (target.needsEpisodes && !epNums.length)) return null;
    return { row, target, cover: row.cover || info?.cover || '' };
  }))).filter(Boolean);

  if (!items.length) return;

  const grid = h('div', { class: 'anime-grid' });
  for (const { row, target, cover } of items) {
    const card = _card(
      { slug: row.slug, title: prettyTitle(row), cover, badge: `Ep ${target.epNum}` },
      navigate,
      `/watch/${row.slug}/${target.epNum}`,
    );
    if (target.resume && row.duration) {
      const pct = Math.round(Math.min(1, row.position / row.duration) * 100);
      card.querySelector('.cover').append(
        h('div', { class: 'card-progress' }, h('div', { class: 'card-progress-fill', style: `width:${pct}%` })),
      );
    }
    grid.append(card);
  }
  holder.append(
    h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Continuar viendo'))),
    grid,
  );
}

function _card(anime, navigate, route) {
  const targetRoute = route || (anime.epNum ? `/watch/${anime.slug}/${anime.epNum}` : `/anime/${anime.slug}`);
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
