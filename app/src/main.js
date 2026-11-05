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
import { renderSettings } from './ui/settings.js';
import { initTVNavigation, focusInitialTVElement } from './ui/tv.js';
import { toast } from './ui/dom.js';
import { initOTAUpdater } from './services/updater.js';
import { createViewStateStore, captureView, restoreView } from './ui/navstate.js';

// ---------- Rutas ----------
// /                  → home
// /buscar[?q=...]    → search
// /anime/:slug       → detail
// /watch/:slug/:ep   → player
// /favoritos         → favorites
// /historial         → history

let svc = null;

// Cada entrada del historial lleva { idx, key }: idx = profundidad dentro de la app,
// key = identificador para recordar su scroll y foco al volver.
const viewStates = createViewStateStore(30);
let currentKey = null;
const newKey = () => Math.random().toString(36).slice(2);

function navigate(path, { replace = false } = {}) {
  viewStates.set(currentKey, captureView()); // recordar dónde estaba el usuario en la pantalla que deja
  const idx = (history.state?.idx ?? 0) + (replace ? 0 : 1);
  currentKey = newKey();
  history[replace ? 'replaceState' : 'pushState']({ idx, key: currentKey }, '', path);
  route(path);
}
// Reemplaza la entrada actual (p. ej. cambiar de episodio sin apilar pantallas)
navigate.replace = (path) => navigate(path, { replace: true });
// Vuelve a la pantalla anterior; si no la hay (se abrió directo), va a `fallback`
navigate.back = (fallback = '/') => {
  if ((history.state?.idx ?? 0) > 0) history.back();
  else navigate(fallback, { replace: true });
};

function route(path = location.pathname + location.search, restore = null) {
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

  } else if (path === '/ajustes') {
    view.append(renderSettings(svc, navigate));

  } else {
    view.textContent = 'Página no encontrada';
  }

  // Al volver atrás: restaurar scroll y foco; si no hay nada que restaurar, foco inicial para Smart TVs
  if (restore) restoreView(restore, view, focusInitialTVElement);
  else focusInitialTVElement();
}

// ---------- Nav buttons ----------
document.querySelectorAll('.nav-btn[data-route]').forEach((btn) => {
  btn.addEventListener('click', () => navigate(btn.dataset.route));
});

// ---------- Estado de conexión ----------
window.addEventListener('offline', () => toast('Sin conexión: mostrando datos guardados', 'error'));
window.addEventListener('online',  () => toast('Conexión restablecida'));

// ---------- Back/forward ----------
window.addEventListener('popstate', () => {
  viewStates.set(currentKey, captureView());
  currentKey = history.state?.key ?? newKey();
  route(undefined, viewStates.get(currentKey));
});

// ---------- Arranque ----------
async function main() {
  initOTAUpdater(toast); // Inicializar actualizaciones en vivo OTA para Smart TV & Android
  const store = await openIdbStore();
  svc = createServices(store);
  svc.cache.prune().catch(() => {}); // limpia datos de caché muy antiguos
  currentKey = history.state?.key ?? newKey();
  history.replaceState({ idx: history.state?.idx ?? 0, key: currentKey }, '');
  initTVNavigation(navigate); // Inicializar navegación espacial para Smart TV
  route(); // renderiza la ruta inicial
}

main().catch((e) => {
  document.getElementById('view').textContent = `Error al iniciar: ${e.message}`;
  console.error(e);
});
