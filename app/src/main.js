// Punto de entrada principal. Router hash-based + inicialización de servicios.
import { openIdbStore }   from './data/idb.js';
import { createServices } from './services/index.js';
import { renderHome }     from './ui/home.js';
import { renderCatalogo } from './ui/catalogo.js';
import { renderSearch }   from './ui/search.js';
import { renderDetail }   from './ui/detail.js';
import { renderPlayer }   from './ui/player.js';
import { renderFavorites } from './ui/favorites.js';
import { renderHistory }  from './ui/history.js';
import { initTVNavigation, focusInitialTVElement } from './ui/tv.js';

// ---------- Rutas ----------
// /                  → home
// /buscar[?q=...]    → search
// /anime/:slug       → detail
// /watch/:slug/:ep   → player
// /favoritos         → favorites
// /historial         → history

let svc = null;

function navigate(path) {
  history.pushState(null, '', path);
  route(path);
}

function route(path = location.pathname + location.search) {
  const view = document.getElementById('view');
  if (!view) return;
  view.innerHTML = '';

  // Actualiza nav activo
  document.querySelectorAll('.nav-btn').forEach((b) => {
    const r = b.dataset.route;
    b.classList.toggle('active', path === r || (r !== '/' && path.startsWith(r)));
  });

  // Despacha a la pantalla correcta
  if (path === '/' || path === '') {
    view.append(renderHome(svc, navigate));

  } else if (path.startsWith('/catalogo')) {
    const params = Object.fromEntries(new URLSearchParams(path.split('?')[1] || '').entries());
    view.append(renderCatalogo(svc, navigate, params));

  } else if (path.startsWith('/buscar')) {
    const q = new URLSearchParams(path.split('?')[1]).get('q') || '';
    view.append(renderSearch(svc, navigate, q));

  } else if (path.startsWith('/anime/')) {
    const slug = path.split('/')[2];
    view.append(renderDetail(svc, slug, navigate));

  } else if (path.startsWith('/watch/')) {
    const parts = path.split('/');         // ['', 'watch', slug, epNum]
    const slug  = parts[2];
    const epNum = parts[3];
    // El player se añade sobre #app, no en #view (fullscreen)
    renderPlayer(svc, slug, epNum, navigate);

  } else if (path === '/favoritos') {
    view.append(renderFavorites(svc, navigate));

  } else if (path === '/historial') {
    view.append(renderHistory(svc, navigate));

  } else {
    view.textContent = 'Página no encontrada';
  }

  // Foco inicial automático para Smart TVs
  focusInitialTVElement();
}

// ---------- Nav buttons ----------
document.querySelectorAll('.nav-btn[data-route]').forEach((btn) => {
  btn.addEventListener('click', () => navigate(btn.dataset.route));
});

// ---------- Back/forward ----------
window.addEventListener('popstate', () => route());

// ---------- Arranque ----------
async function main() {
  const store = await openIdbStore();
  svc = createServices(store);
  initTVNavigation(navigate); // Inicializar navegación espacial para Smart TV
  route(); // renderiza la ruta inicial
}

main().catch((e) => {
  document.getElementById('view').textContent = `Error al iniciar: ${e.message}`;
  console.error(e);
});
