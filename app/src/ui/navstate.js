// Estado de navegación: recordar scroll y foco de cada pantalla para restaurarlos al volver.
// Las partes puras (isTopLevel, createViewStateStore) no tocan el DOM y se prueban con node --test.

const TOP_LEVEL = ['/', '/catalogo', '/buscar', '/favoritos', '/historial', '/ajustes'];

/** ¿La ruta es una pestaña principal (no una subpantalla como detalle o reproductor)? */
export function isTopLevel(path = '') {
  const clean = String(path).split('?')[0].replace(/\/+$/, '') || '/';
  return TOP_LEVEL.includes(clean);
}

/** Mapa con límite (los más antiguos se descartan) para el estado de cada entrada del historial. */
export function createViewStateStore(max = 30) {
  const m = new Map();
  return {
    set(key, state) {
      if (!key || !state) return;
      m.delete(key);
      m.set(key, state);
      while (m.size > max) m.delete(m.keys().next().value);
    },
    get: (key) => (key ? m.get(key) : undefined),
    get size() { return m.size; },
  };
}

// ---------------- DOM ----------------

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex="0"]';
const focusables = (view) => [...view.querySelectorAll(FOCUSABLE)];
const sigOf = (el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);

/** Captura scroll y elemento enfocado de la vista actual. */
export function captureView() {
  const view = document.getElementById('view');
  if (!view) return null;
  const els = focusables(view);
  const idx = els.indexOf(document.activeElement);
  let sig = '';
  let occ = 0;
  if (idx !== -1) {
    sig = sigOf(els[idx]);
    occ = els.slice(0, idx).filter((e) => sigOf(e) === sig).length; // n.º de repetición con el mismo texto
  }
  return { scroll: view.scrollTop, idx, sig, occ };
}

/**
 * Restaura scroll y foco. Las pantallas cargan datos de forma asíncrona, así que se reintenta
 * mientras el contenido aparece (máx. 3 s). Si el usuario pulsa algo, se detiene.
 * onDefault: foco inicial normal, si no hay nada que restaurar o no se pudo.
 */
export function restoreView(st, view, onDefault) {
  if (!st || (st.idx < 0 && !st.scroll)) { onDefault?.(); return; }

  let done = false;
  let obs = null;
  let timer = null;
  const cancel = () => finish(true);

  function finish(ok) {
    if (done) return;
    done = true;
    obs?.disconnect();
    clearTimeout(timer);
    window.removeEventListener('keydown', cancel, true);
    window.removeEventListener('pointerdown', cancel, true);
    if (!ok) onDefault?.();
  }

  function apply(el) {
    view.scrollTop = st.scroll;
    el?.focus({ preventScroll: true });
    view.scrollTop = st.scroll;
  }

  function attempt(final = false) {
    if (done) return;
    const els = focusables(view);
    if (st.idx >= 0) {
      const same = st.sig ? els.filter((e) => sigOf(e) === st.sig) : [];
      const target = same[st.occ] ?? (final ? (same[same.length - 1] ?? els[st.idx]) : null);
      if (target) { apply(target); finish(true); }
    } else if (view.scrollHeight - view.clientHeight >= st.scroll) {
      apply(null);
      finish(true);
    }
    if (final) finish(false);
  }

  window.addEventListener('keydown', cancel, true);
  window.addEventListener('pointerdown', cancel, true);
  obs = new MutationObserver(() => attempt());
  obs.observe(view, { childList: true, subtree: true });
  timer = setTimeout(() => attempt(true), 3000);
  attempt();
}
