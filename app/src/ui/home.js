// Pantalla Home estilo TV: banner destacado + filas horizontales
// (Continuar viendo, Últimos episodios, Mis favoritos).
import { h, btn, loading, empty } from './dom.js';
import { nextTarget, prettyTitle } from '../services/history.js';
import { fmtTime } from './seek.js';

export function renderHome(svc, navigate) {
  const root = h('div', { class: 'home-screen' });
  root.append(loading());

  async function load() {
    root.innerHTML = '';

    // Contenedores en orden fijo: así cada fila aparece en su sitio aunque los datos lleguen desordenados
    const heroHolder = h('div', { class: 'hero-holder' });
    const contHolder = h('div', { class: 'row-holder' });
    const latestHolder = h('div', { class: 'row-holder' });
    const favHolder = h('div', { class: 'row-holder' });
    root.append(heroHolder, contHolder, latestHolder, favHolder);

    // Banner: "Continuar viendo" tiene prioridad sobre "Últimos episodios"; no se cambia si el usuario ya lo enfocó
    let heroPrio = 0;
    function setHero(item, prio) {
      if (prio <= heroPrio || heroHolder.contains(document.activeElement)) return;
      heroPrio = prio;
      heroHolder.replaceChildren(_hero(item, navigate));
    }

    // Las tres filas cargan en paralelo y de forma independiente
    const tasks = [
      loadContinue(svc, navigate, contHolder, setHero),
      loadLatest(svc, navigate, latestHolder, setHero, root, load),
      loadFavorites(svc, navigate, favHolder),
    ];
    await Promise.allSettled(tasks);
  }

  load();
  return root;
}

// ---------------- Banner ----------------

function _hero(item, navigate) {
  const hero = h('section', { class: 'home-hero' });
  const art = h('div', { class: 'hero-art' });
  if (item.cover) art.style.backgroundImage = `url("${item.cover}")`;

  const info = h('div', { class: 'hero-info' },
    item.badge ? h('span', { class: 'badge badge-ice' }, item.badge) : null,
    h('h1', { class: 'hero-title' }, item.title),
    item.meta ? h('div', { class: 'hero-meta' }, item.meta) : null,
    h('div', { class: 'hero-actions' },
      btn(item.label, () => navigate(item.route), { cls: 'primary', ic: 'play' }),
      btn('Más info', () => navigate(`/anime/${item.slug}`), { cls: 'ghost' }),
    ),
  );
  hero.append(art, info);
  return hero;
}

// ---------------- Filas ----------------

function _row(title, cards) {
  const row = h('div', { class: 'anime-row' }, ...cards);
  return [
    h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, title))),
    row,
  ];
}

async function loadContinue(svc, navigate, holder, setHero) {
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

  const cards = items.map(({ row, target, cover }) => {
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
    return card;
  });
  holder.replaceChildren(..._row('Continuar viendo', cards));

  const first = items[0];
  setHero({
    slug: first.row.slug,
    title: prettyTitle(first.row),
    cover: first.cover,
    badge: 'Continuar viendo',
    meta: first.target.resume && first.row.duration
      ? `Episodio ${first.target.epNum} · ${fmtTime(first.row.position)} de ${fmtTime(first.row.duration)}`
      : `Episodio ${first.target.epNum}`,
    label: first.target.resume ? `Continuar episodio ${first.target.epNum}` : `Ver episodio ${first.target.epNum}`,
    route: `/watch/${first.row.slug}/${first.target.epNum}`,
  }, 2);
}

async function loadLatest(svc, navigate, holder, setHero, root, reload) {
  let latest = [];
  let failed = null;
  const row = h('div', { class: 'anime-row' });

  // Pinta la lista conservando la posición del foco (importante con el D-Pad)
  function paint(list) {
    const focusIdx = [...row.children].findIndex((el) => el === document.activeElement);
    row.replaceChildren(...list.map((anime) => _card(anime, navigate)));
    if (focusIdx !== -1) row.children[Math.min(focusIdx, row.children.length - 1)]?.focus({ preventScroll: true });
  }

  try {
    latest = await svc.anime.getLatest({ onRefresh: (fresh) => { if (fresh?.length) paint(fresh); } });
  } catch (e) {
    failed = e;
  }

  if (!latest.length) {
    holder.replaceChildren(
      empty(
        failed ? 'Sin conexión' : 'Sin resultados',
        failed
          ? 'No se pudieron cargar los últimos episodios y no hay datos guardados. Revisa tu internet.'
          : 'No hay episodios para mostrar.',
        btn('Reintentar', () => { root.replaceChildren(loading()); reload(); }, { cls: 'primary', ic: 'refresh' }),
      ),
    );
    return;
  }

  paint(latest);
  holder.replaceChildren(
    h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Últimos episodios'))),
    row,
  );

  const a = latest[0];
  setHero({
    slug: a.slug,
    title: a.title,
    cover: a.cover,
    badge: 'Nuevo',
    meta: a.badge || '',
    label: a.epNum ? `Ver episodio ${a.epNum}` : 'Ver ahora',
    route: a.epNum ? `/watch/${a.slug}/${a.epNum}` : `/anime/${a.slug}`,
  }, 1);
}

async function loadFavorites(svc, navigate, holder) {
  let favs = [];
  try { favs = await svc.favorites.getAll(); } catch { return; }
  if (!favs.length) return;
  const cards = favs.slice(0, 20).map((f) =>
    _card({ slug: f.slug, title: f.title, cover: f.cover }, navigate, `/anime/${f.slug}`));
  holder.replaceChildren(..._row('Mis favoritos', cards));
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
