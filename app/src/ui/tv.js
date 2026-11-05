// Módulo de soporte para Smart TVs (Android TV, Fire TV, Google TV, Samsung Tizen, LG webOS).
// Implementa Navegación Espacial D-Pad, detección de control remoto,
// mapeo de teclas de hardware y desplazamiento automático fluido.

import { isTopLevel } from './navstate.js';

const TV_KEYCODES = {
  // D-Pad Arrows
  UP:    [38, 19], // ArrowUp, Android DPAD_UP
  DOWN:  [40, 20], // ArrowDown, Android DPAD_DOWN
  LEFT:  [37, 21], // ArrowLeft, Android DPAD_LEFT
  RIGHT: [39, 22], // ArrowRight, Android DPAD_RIGHT

  // Select / OK / Enter
  SELECT:[13, 23], // Enter, Android DPAD_CENTER

  // Back / Return
  BACK:  [27, 8, 4, 10009, 461], // Escape, Backspace, Android Back, Tizen Return, webOS Back

  // Media
  PLAY_PAUSE: [179, 85],
  PLAY:       [250, 126],
  PAUSE:      [19, 127],
  REWIND:     [227, 89],
  FAST_FWD:   [228, 90],
};

function isKey(e, type) {
  const codes = TV_KEYCODES[type] || [];
  return codes.includes(e.keyCode);
}

// Selector de todos los elementos interactivos enfocables en la UI
const FOCUSABLE_SELECTOR = `
  button:not([disabled]):not([tabindex="-1"]),
  a[href]:not([tabindex="-1"]),
  input:not([disabled]):not([tabindex="-1"]),
  select:not([disabled]):not([tabindex="-1"]),
  .anime-card[tabindex="0"],
  .ep-item[tabindex="0"],
  [tabindex="0"]:not([disabled])
`;

let lastBackTime = 0;

export function handleGlobalBack(navigate) {
  // 1. Si el modal de servidores está abierto, cerrarlo primero y volver al video
  const serverPicker = document.querySelector('.server-picker-overlay');
  if (serverPicker) {
    serverPicker.remove();
    window.dispatchEvent(new CustomEvent('close-server-picker'));
    return;
  }

  // 2. Si hay cualquier otro modal abierto, cerrarlo
  const generalModal = document.querySelector('.overlay');
  if (generalModal) {
    const closeBtn = generalModal.querySelector('.sheet-head button, .overlay');
    if (closeBtn) closeBtn.click();
    else generalModal.remove();
    return;
  }

  // 3. Si el reproductor de video a pantalla completa está abierto, cerrarlo y volver a los detalles
  const playerScreen = document.querySelector('.player-screen');
  if (playerScreen) {
    const backBtn = playerScreen.querySelector('.player-topbar .icon-btn');
    if (backBtn) {
      backBtn.click();
      return;
    }
    playerScreen.remove();
    return;
  }

  // 4. Subpantalla (detalle...): volver a la pantalla anterior (con su scroll y foco);
  //    pestaña principal que no es Inicio: ir a Inicio.
  const path = location.pathname;
  if (path !== '/' && path !== '') {
    if (!isTopLevel(path)) {
      if (navigate?.back) navigate.back('/');
      else history.back();
    } else if (navigate?.replace) {
      navigate.replace('/');
    } else if (navigate) {
      navigate('/');
    } else {
      history.back();
    }
    return;
  }

  // 5. Si estamos en la portada (Home /): doble pulsación en 2s para salir limpiamente
  const now = Date.now();
  if (now - lastBackTime < 2200) {
    window.Capacitor?.Plugins?.App?.exitApp?.();
  } else {
    lastBackTime = now;
    const toastEl = document.getElementById('toast');
    if (toastEl) {
      toastEl.className = 'toast show';
      toastEl.textContent = 'Presiona Atrás otra vez para salir de AnimeAV1';
      setTimeout(() => toastEl.classList.remove('show'), 2000);
    }
  }
}

export function initTVNavigation(navigate) {
  // Conectar con el botón nativo Atrás de Android / Capacitor
  const AppPlugin = window.Capacitor?.Plugins?.App;
  if (AppPlugin) {
    AppPlugin.addListener('backButton', () => {
      handleGlobalBack(navigate);
    });
  }

  // Detector de interacción por puntero (mouse / touch) vs control remoto / teclado.
  let isPointerInteraction = false;
  window.addEventListener('pointerdown', () => { isPointerInteraction = true; }, true);
  window.addEventListener('mousedown',   () => { isPointerInteraction = true; }, true);
  window.addEventListener('touchstart',  () => { isPointerInteraction = true; }, true);
  window.addEventListener('keydown',     () => { isPointerInteraction = false; }, true);

  // 1. Manejo global de teclas de control remoto
  window.addEventListener('keydown', (e) => {
    // Tecla BACK del control remoto (en cualquier pantalla o modal)
    if (isKey(e, 'BACK')) {
      e.preventDefault();
      e.stopPropagation();
      handleGlobalBack(navigate);
      return;
    }

    // Tecla SELECT (código 23 / DPAD_CENTER de Android TV)
    if (isKey(e, 'SELECT') && e.keyCode === 23) {
      const active = document.activeElement;
      if (active && active !== document.body && !['input', 'textarea'].includes(active.tagName.toLowerCase())) {
        e.preventDefault();
        active.click();
        return;
      }
    }

    // Si el reproductor a pantalla completa está visible y el modal de servidores NO está abierto,
    // dejar que el reproductor maneje reproducción y pausa
    if (document.querySelector('.player-screen') && !document.querySelector('.server-picker-overlay')) {
      return;
    }

    // Navegación D-Pad (Arriba, Abajo, Izquierda, Derecha)
    if (isKey(e, 'UP')) {
      e.preventDefault();
      _moveFocus('up');
    } else if (isKey(e, 'DOWN')) {
      e.preventDefault();
      _moveFocus('down');
    } else if (isKey(e, 'LEFT')) {
      e.preventDefault();
      _moveFocus('left');
    } else if (isKey(e, 'RIGHT')) {
      e.preventDefault();
      _moveFocus('right');
    }
  });

  // 2. Auto-scroll instantáneo SOLO para navegación con D-Pad / teclado cuando un elemento recibe el foco
  document.addEventListener('focusin', (e) => {
    // Si la interacción es con mouse o touch, NUNCA scrollear en focusin
    if (isPointerInteraction) return;

    const el = e.target;
    if (!el || el === document.body) return;

    // Solo scrollear si está en el contenedor de vista o modal
    if (el.closest('#view') || el.closest('.sheet') || el.closest('.server-picker-modal')) {
      el.scrollIntoView({
        behavior: 'auto', // Auto/instantáneo: evita el lag de animaciones smooth en TV
        block: 'nearest',
        inline: 'nearest',
      });
    }
  });
}

/**
 * Enfoca automáticamente el primer elemento interactivo al cargar una vista
 */
export function focusInitialTVElement() {
  setTimeout(() => {
    // Si el reproductor a pantalla completa está visible, no mover foco
    if (document.querySelector('.player-screen')) return;

    // Si ya hay un elemento enfocado por el usuario, no cambiarlo
    if (document.activeElement && document.activeElement !== document.body) return;

    // Prioridad: primera tarjeta, primer episodio o primer botón del contenido principal
    const firstTarget = document.querySelector('#view .anime-card, #view .ep-item, #view .btn, #view input, #topbar-nav .nav-btn.active');
    if (firstTarget) {
      firstTarget.focus({ preventScroll: true });
    }
  }, 100);
}

// Algoritmo de Navegación D-Pad de Alta Velocidad (Optimizada para Smart TVs)
function _moveFocus(direction) {
  const current = document.activeElement;

  // 1. Navegación directa en el menú superior
  if (current?.closest('#topbar-nav')) {
    const navBtns = [...document.querySelectorAll('#topbar-nav .nav-btn')];
    const idx = navBtns.indexOf(current);
    if (idx !== -1) {
      if (direction === 'left' && idx > 0) {
        navBtns[idx - 1].focus();
        return;
      }
      if (direction === 'right' && idx < navBtns.length - 1) {
        navBtns[idx + 1].focus();
        return;
      }
      if (direction === 'down') {
        const first = document.querySelector('#view .anime-card, #view .ep-item, #view .btn, #view input');
        if (first) {
          first.focus();
          return;
        }
      }
    }
  }

  // 1b. Home con banner y filas horizontales: izquierda/derecha dentro de la fila,
  //     arriba/abajo entre banner y filas manteniendo la columna más cercana
  const homeRow = current?.closest('.anime-row');
  const inHero = current?.closest('.home-hero');
  if (homeRow || inHero) {
    const blocks = [...document.querySelectorAll('#view .home-hero, #view .anime-row')]
      .filter((el) => el.querySelector('button, .anime-card'));
    const here = blocks.findIndex((b) => b.contains(current));
    const items = (b) => [...b.querySelectorAll('.anime-card, button:not([disabled])')];

    if (direction === 'left' || direction === 'right') {
      const list = items(blocks[here]);
      const i = list.indexOf(current);
      const next = list[i + (direction === 'right' ? 1 : -1)];
      if (next) { next.focus(); return; }
      if (direction === 'left' && homeRow) return; // borde izquierdo de la fila: no salir
      if (direction === 'right') return;           // borde derecho: no salir
    } else {
      const target = blocks[here + (direction === 'down' ? 1 : -1)];
      if (target) {
        const list = items(target);
        const cx = current.getBoundingClientRect().left + current.getBoundingClientRect().width / 2;
        let best = list[0];
        let bestD = Infinity;
        for (const el of list) {
          const r = el.getBoundingClientRect();
          const d = Math.abs(r.left + r.width / 2 - cx);
          if (d < bestD) { bestD = d; best = el; }
        }
        best?.focus();
        return;
      }
      if (direction === 'up') {                    // sobre el primer bloque: subir al menú
        document.querySelector('#topbar-nav .nav-btn.active, #topbar-nav .nav-btn')?.focus();
      }
      return; // abajo del último bloque: nada más que recorrer
    }
  }

  // 2. Navegación directa en cuadrículas (anime-grid o episodes-grid) - Cero lag, O(1)
  const grid = current?.closest('.anime-grid, .episodes-grid, .server-picker-grid');
  if (grid) {
    const items = [...grid.children].filter((el) =>
      el.getAttribute('tabindex') === '0' || el.tagName === 'BUTTON' || el.classList.contains('anime-card')
    );
    const idx = items.indexOf(current);
    if (idx !== -1 && items.length > 0) {
      // Calcular número de columnas de forma ultrarrápida
      let cols = 1;
      const firstTop = items[0].offsetTop;
      while (cols < items.length && items[cols].offsetTop === firstTop) {
        cols++;
      }

      if (direction === 'left') {
        if (idx > 0) {
          items[idx - 1].focus();
          return;
        }
      } else if (direction === 'right') {
        if (idx < items.length - 1) {
          items[idx + 1].focus();
          return;
        }
      } else if (direction === 'down') {
        if (idx + cols < items.length) {
          items[idx + cols].focus();
          return;
        } else if (idx < items.length - 1) {
          items[items.length - 1].focus();
          return;
        }
      } else if (direction === 'up') {
        if (idx - cols >= 0) {
          items[idx - cols].focus();
          return;
        } else {
          // Si está en la primera fila, subir al nav superior o acciones previas
          const topTarget = document.querySelector('.detail-actions .btn, #topbar-nav .nav-btn.active, #topbar-nav .nav-btn');
          if (topTarget) {
            topTarget.focus();
            return;
          }
        }
      }
    }
  }

  // 3. Fallback espacial geométrico para otros elementos
  const focusables = [...document.querySelectorAll(FOCUSABLE_SELECTOR)].filter((el) => {
    return el.offsetWidth > 0 && el.offsetHeight > 0;
  });

  if (!focusables.length) return;

  if (!current || current === document.body || !focusables.includes(current)) {
    focusables[0].focus();
    return;
  }

  const curRect = current.getBoundingClientRect();
  const curCenter = {
    x: curRect.left + curRect.width / 2,
    y: curRect.top + curRect.height / 2,
  };

  let bestCandidate = null;
  let minDistance = Infinity;

  for (const candidate of focusables) {
    if (candidate === current) continue;

    const candRect = candidate.getBoundingClientRect();
    const candCenter = {
      x: candRect.left + candRect.width / 2,
      y: candRect.top + candRect.height / 2,
    };

    const dx = candCenter.x - curCenter.x;
    const dy = candCenter.y - curCenter.y;

    let isValidDir = false;
    let primaryDist = 0;
    let secondaryDist = 0;

    switch (direction) {
      case 'up':
        isValidDir = dy < -6;
        primaryDist = Math.abs(dy);
        secondaryDist = Math.abs(dx);
        break;
      case 'down':
        isValidDir = dy > 6;
        primaryDist = Math.abs(dy);
        secondaryDist = Math.abs(dx);
        break;
      case 'left':
        isValidDir = dx < -6;
        primaryDist = Math.abs(dx);
        secondaryDist = Math.abs(dy);
        break;
      case 'right':
        isValidDir = dx > 6;
        primaryDist = Math.abs(dx);
        secondaryDist = Math.abs(dy);
        break;
    }

    if (!isValidDir) continue;

    const distance = primaryDist + secondaryDist * 2.2;
    if (distance < minDistance) {
      minDistance = distance;
      bestCandidate = candidate;
    }
  }

  if (bestCandidate) {
    bestCandidate.focus();
  }
}
