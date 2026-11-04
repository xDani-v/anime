// Pantalla de Catálogo completo con filtros dinámicos (animeav1.com/catalogo)
import { h, btn, loading, empty, toast } from './dom.js';

const GENRES = [
  { id: '', name: 'Todos los géneros' },
  { id: 'accion', name: 'Acción' },
  { id: 'aventura', name: 'Aventura' },
  { id: 'comedia', name: 'Comedia' },
  { id: 'drama', name: 'Drama' },
  { id: 'fantasia', name: 'Fantasía' },
  { id: 'romance', name: 'Romance' },
  { id: 'shounen', name: 'Shounen' },
  { id: 'sobrenatural', name: 'Sobrenatural' },
  { id: 'misterio', name: 'Misterio' },
  { id: 'sci-fi', name: 'Sci-Fi' },
  { id: 'recuentos-de-la-vida', name: 'Recuentos de la vida' },
  { id: 'isekai', name: 'Isekai' },
  { id: 'ecchi', name: 'Ecchi' },
  { id: 'mecha', name: 'Mecha' },
  { id: 'deportes', name: 'Deportes' },
  { id: 'magia', name: 'Magia' },
  { id: 'suspense', name: 'Suspense' },
  { id: 'terror', name: 'Terror' },
];

const TYPES = [
  { id: '', name: 'Tipo: Todos' },
  { id: 'tv', name: 'TV Anime' },
  { id: 'movie', name: 'Película' },
  { id: 'ova', name: 'OVA' },
  { id: 'ona', name: 'ONA' },
  { id: 'special', name: 'Especial' },
];

const STATUSES = [
  { id: '', name: 'Estado: Todos' },
  { id: 'en-emision', name: 'En emisión' },
  { id: 'finalizado', name: 'Finalizado' },
];

const ORDERS = [
  { id: 'default', name: 'Orden: Por defecto' },
  { id: 'recent', name: 'Más recientes' },
  { id: 'views', name: 'Más vistos' },
  { id: 'rating', name: 'Mejor calificados' },
  { id: 'title', name: 'Alfabético' },
];

export function renderCatalogo(svc, navigate, initialFilters = {}) {
  const root = h('div', { class: 'catalogo-screen' });

  // Estado local de los filtros
  const state = {
    genre: initialFilters.genre || '',
    category: initialFilters.category || '',
    status: initialFilters.status || '',
    order: initialFilters.order || 'default',
    letter: initialFilters.letter || '',
    page: Number(initialFilters.page || 1),
    totalPages: 1,
  };

  // Encabezado
  const head = h('div', { class: 'section' },
    h('div', { class: 'section-head' },
      h('h2', null, 'Directorio de Animes'),
    ),
  );
  root.append(head);

  // Barra de filtros
  const filterWrap = h('div', { class: 'catalogo-filters-wrap' });

  // 1. Selector de género
  const genreSelect = h('select', {
    class: 'filter-select',
    onchange: (e) => { state.genre = e.target.value; state.page = 1; load(); },
  }, ...GENRES.map((g) => h('option', { value: g.id, selected: state.genre === g.id }, g.name)));

  // 2. Selector de tipo
  const typeSelect = h('select', {
    class: 'filter-select',
    onchange: (e) => { state.category = e.target.value; state.page = 1; load(); },
  }, ...TYPES.map((t) => h('option', { value: t.id, selected: state.category === t.id }, t.name)));

  // 3. Selector de estado
  const statusSelect = h('select', {
    class: 'filter-select',
    onchange: (e) => { state.status = e.target.value; state.page = 1; load(); },
  }, ...STATUSES.map((s) => h('option', { value: s.id, selected: state.status === s.id }, s.name)));

  // 4. Selector de orden
  const orderSelect = h('select', {
    class: 'filter-select',
    onchange: (e) => { state.order = e.target.value; state.page = 1; load(); },
  }, ...ORDERS.map((o) => h('option', { value: o.id, selected: state.order === o.id }, o.name)));

  filterWrap.append(genreSelect, typeSelect, statusSelect, orderSelect);
  root.append(filterWrap);

  // 5. Barra horizontal de letras A-Z
  const lettersBar = h('div', { class: 'letters-bar' });
  const letters = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
  const allLetterBtn = h('button', {
    class: `letter-btn${!state.letter ? ' active' : ''}`,
    onclick: () => {
      state.letter = '';
      state.page = 1;
      _updateLetterBtns();
      load();
    },
  }, 'Todos');
  lettersBar.append(allLetterBtn);

  const letterBtnEls = [];
  for (const l of letters) {
    const b = h('button', {
      class: `letter-btn${state.letter === l ? ' active' : ''}`,
      onclick: () => {
        state.letter = state.letter === l ? '' : l;
        state.page = 1;
        _updateLetterBtns();
        load();
      },
    }, l);
    letterBtnEls.push({ letter: l, el: b });
    lettersBar.append(b);
  }
  root.append(lettersBar);

  function _updateLetterBtns() {
    allLetterBtn.classList.toggle('active', !state.letter);
    for (const item of letterBtnEls) {
      item.el.classList.toggle('active', state.letter === item.letter);
    }
  }

  // Contenedor de resultados
  const content = h('div', { class: 'catalogo-content' });
  root.append(content);

  // Paginación inferior
  const paginationBar = h('div', { class: 'pagination-bar' });
  root.append(paginationBar);

  async function load() {
    content.innerHTML = '';
    content.append(loading());
    paginationBar.innerHTML = '';

    try {
      const res = await svc.anime.getCatalogo({
        genre: state.genre,
        category: state.category,
        status: state.status,
        order: state.order,
        letter: state.letter,
        page: state.page,
      });

      content.innerHTML = '';
      const items = res.items || [];
      state.totalPages = res.totalPages || 1;

      if (!items.length) {
        content.append(empty('Sin animes', 'No se encontraron animes con los filtros seleccionados.'));
        return;
      }

      const grid = h('div', { class: 'anime-grid' });
      for (const anime of items) {
        grid.append(_card(anime, navigate));
      }
      content.append(grid);

      // Renderizar paginador
      _renderPagination();
    } catch (e) {
      content.innerHTML = '';
      toast(`Error al cargar catálogo: ${e.message}`, 'error');
    }
  }

  function _renderPagination() {
    paginationBar.innerHTML = '';
    if (state.totalPages <= 1) return;

    const prevBtn = btn('« Anterior', () => {
      if (state.page > 1) {
        state.page--;
        load();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, { cls: 'ghost', disabled: state.page <= 1 });

    const info = h('span', { class: 'pag-info' }, `Página ${state.page} de ${state.totalPages}`);

    const nextBtn = btn('Siguiente »', () => {
      if (state.page < state.totalPages) {
        state.page++;
        load();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, { cls: 'ghost', disabled: state.page >= state.totalPages });

    paginationBar.append(prevBtn, info, nextBtn);
  }

  load();
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
  if (anime.badge) {
    cover.append(h('span', { class: 'ep-badge' }, anime.badge));
  }
  card.append(cover);

  // Título del anime visible
  const info = h('div', { class: 'info' });
  info.append(h('div', { class: 'title' }, anime.title));
  card.append(info);

  return card;
}
