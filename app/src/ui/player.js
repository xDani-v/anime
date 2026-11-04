// Reproductor de video optimizado para Smart TV & Mobile.
// Pantalla 100% limpia sin barras fijas, auto-ocultamiento de controles (HUD)
// y panel modal de cambio de servidor navegable con control remoto (D-Pad).

import { h, btn, iconBtn, loading, toast } from './dom.js';

let hlsInstance = null; // instancia activa de Hls.js

/** Carga hls.js desde CDN la primera vez que se necesita */
async function loadHlsJs() {
  if (window.Hls) return window.Hls;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
    s.onload  = () => resolve(window.Hls);
    s.onerror = () => reject(new Error('No se pudo cargar el motor HLS'));
    document.head.append(s);
  });
}

export function renderPlayer(svc, slug, epNum, navigate) {
  // Limpiar cualquier reproductor activo previo
  document.querySelectorAll('.player-screen').forEach((p) => p.remove());

  const screen = h('div', { class: 'player-screen' });
  let wakeLock = null;
  let activeVideo = null;
  let allServers = [];
  let currentServer = null;
  const failedServers = new Set();
  let hudTimer = null;
  let isPickerOpen = false;

  async function requestWake() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch { /* ignorar */ }
  }

  function releaseWake() {
    if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  }

  const closePlayer = () => {
    clearTimeout(hudTimer);
    window.removeEventListener('keydown', handleKey);
    screen.removeEventListener('mousemove', onUserActivity);
    screen.removeEventListener('touchstart', onUserActivity);
    releaseWake();
    _destroyHls();
    screen.remove();
    navigate(`/anime/${slug}`);
  };

  // Auto-ocultamiento de la barra superior (HUD) para pantalla 100% limpia
  function showHUD() {
    topbar.classList.remove('hud-hidden');
    clearTimeout(hudTimer);
    if (!isPickerOpen) {
      hudTimer = setTimeout(() => {
        topbar.classList.add('hud-hidden');
      }, 3500);
    }
  }

  function onUserActivity() {
    showHUD();
  }

  screen.addEventListener('mousemove', onUserActivity);
  screen.addEventListener('touchstart', onUserActivity);

  function handleKey(e) {
    showHUD();

    // Si el modal de servidores está abierto, dejar que el modal gestione el D-Pad
    if (isPickerOpen) {
      if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 27 || e.keyCode === 4 || e.keyCode === 10009) {
        e.preventDefault();
        _closeServerPicker();
      }
      return;
    }

    // Tecla BACK del control remoto
    if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 27 || e.keyCode === 4 || e.keyCode === 10009) {
      e.preventDefault();
      closePlayer();
      return;
    }

    // Tecla para abrir selector de servidores: Flecha Abajo o tecla 's'
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      e.preventDefault();
      openServerPickerModal();
      return;
    }

    if (!activeVideo) return;

    if (e.key === ' ' || e.key === 'MediaPlayPause') {
      e.preventDefault();
      if (activeVideo.paused) activeVideo.play();
      else activeVideo.pause();
    } else if (e.key === 'ArrowLeft' || e.key === 'MediaRewind') {
      e.preventDefault();
      activeVideo.currentTime = Math.max(0, activeVideo.currentTime - 10);
      toast('-10s');
    } else if (e.key === 'ArrowRight' || e.key === 'MediaFastForward') {
      e.preventDefault();
      activeVideo.currentTime = Math.min(activeVideo.duration || 999999, activeVideo.currentTime + 10);
      toast('+10s');
    }
  }
  window.addEventListener('keydown', handleKey);

  // Barra superior flotante translúcida
  const topbar = h('div', { class: 'player-topbar' });
  const backBtn = iconBtn('back', 'Volver', closePlayer, 'ghost');
  const title = h('span', { class: 'ep-title' }, `Cargando episodio ${epNum}…`);

  // Botón para desplegar el selector de servidores
  const pickServerBtn = btn('Cambiar servidor', () => {
    openServerPickerModal();
  }, { cls: 'ghost', ic: 'refresh', title: 'Ver servidores disponibles' });

  topbar.append(backBtn, title, pickServerBtn);
  screen.append(topbar);

  // Zona de reproducción (100% de la pantalla)
  const wrap = h('div', { class: 'player-wrap' });
  wrap.append(loading());
  screen.append(wrap);

  document.getElementById('app').append(screen);
  showHUD();

  async function init() {
    let sources;
    try {
      sources = await svc.anime.getEpisodeSources(slug, epNum);
    } catch (e) {
      wrap.innerHTML = '';
      wrap.append(h('p', { class: 'loading' }, `Error: ${e.message}`));
      return;
    }

    allServers = sources.servers || [];
    title.textContent = `Episodio ${epNum}`;

    if (!allServers.length) {
      wrap.innerHTML = '';
      wrap.append(h('div', { class: 'empty' },
        h('h3', null, 'Sin opciones de reproducción'),
        h('p', null, 'No se encontraron servidores de streaming para este episodio.'),
        btn('Volver', closePlayer, { cls: 'primary' })
      ));
      return;
    }

    // Prioridad por defecto: MP4Upload siempre primero
    const mp4Server = allServers.find((s) => (s.label || '').toLowerCase().includes('mp4upload'));
    const defaultServer = mp4Server || allServers[0];

    playServer(defaultServer);

    // Guarda en historial
    await svc.history.save({ slug, epNum: Number(epNum), title: slug, epName: `Episodio ${epNum}`, progress: 0.01 });
  }

  function playServer(srv) {
    _destroyHls();
    activeVideo = null;
    currentServer = srv;
    wrap.innerHTML = '';

    title.textContent = `Episodio ${epNum} — ${srv.label}`;
    showHUD();

    if (srv.type === 'iframe') {
      // Iframe blindado contra publicidad y popups
      const frame = h('iframe', {
        class: 'player-frame',
        src: srv.url,
        sandbox: 'allow-scripts allow-same-origin allow-forms',
        allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture',
        allowfullscreen: true,
        referrerpolicy: 'no-referrer',
      });

      frame.onerror = () => _handleFailure(srv);
      wrap.append(frame);
      requestWake();
      return;
    }

    // Video directo (MP4 o M3U8)
    const video = h('video', {
      controls: true,
      autoplay: true,
      playsinline: true,
      style: 'width:100%;height:100%;background:#000',
    });
    activeVideo = video;
    wrap.append(video);
    requestWake();

    video.addEventListener('error', () => {
      _handleFailure(srv);
    });

    if (srv.url.includes('.m3u8')) {
      _playHls(video, srv.url, srv);
    } else {
      video.src = srv.url;
      video.play().catch(() => {});
    }

    video.addEventListener('pause', () => _saveProgress(video));
    video.addEventListener('ended', () => _saveProgress(video, 1));
  }

  async function _playHls(video, src, srv) {
    try {
      const Hls = await loadHlsJs();
      if (Hls.isSupported()) {
        hlsInstance = new Hls({ enableWorker: true, lowLatencyMode: true });
        hlsInstance.loadSource(src);
        hlsInstance.attachMedia(video);
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
        hlsInstance.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) _handleFailure(srv);
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        video.play().catch(() => {});
      } else {
        _handleFailure(srv);
      }
    } catch {
      _handleFailure(srv);
    }
  }

  // Si un servidor falla, abre el menú de selección para que el usuario elija manualmente con el control
  function _handleFailure(failedSrv) {
    if (!failedSrv) return;
    failedServers.add(failedSrv.url);
    toast(`${failedSrv.label} no disponible. Selecciona otra opción.`, 'error');
    openServerPickerModal(failedSrv);
  }

  // MODAL / PANEL DE SELECCIÓN DE SERVIDOR PARA SMART TV
  let pickerOverlay = null;

  function _closeServerPicker() {
    if (pickerOverlay) {
      pickerOverlay.remove();
      pickerOverlay = null;
    }
    isPickerOpen = false;
    showHUD();
  }

  function openServerPickerModal(failedNotice = null) {
    if (isPickerOpen) return;
    isPickerOpen = true;
    showHUD();

    pickerOverlay = h('div', {
      class: 'server-picker-overlay',
      onclick: (e) => {
        if (e.target === pickerOverlay) _closeServerPicker();
      },
    });

    const modalBox = h('div', { class: 'server-picker-modal' });

    // Cabecera del modal
    const head = h('div', { class: 'server-picker-head' },
      h('div', null,
        h('h3', null, 'Seleccionar Servidor'),
        h('div', { class: 'caption-sub' }, 'Usa las flechas del control y pulsa OK para reproducir'),
      ),
      iconBtn('minus', 'Cerrar', _closeServerPicker, 'ghost'),
    );
    modalBox.append(head);

    if (failedNotice) {
      const alert = h('div', { class: 'server-failed-alert' },
        h('span', null, `⚠️ ${failedNotice.label} no respondió. Elige una opción alternativa:`),
      );
      modalBox.append(alert);
    }

    // Lista de botones grandes de servidores para Smart TV
    const list = h('div', { class: 'server-picker-grid' });
    let firstFocusTarget = null;

    allServers.forEach((srv) => {
      const isCurrent = currentServer?.url === srv.url;
      const isFailed = failedServers.has(srv.url);

      const itemBtn = h('button', {
        type: 'button',
        class: `server-pick-item${isCurrent ? ' active' : ''}${isFailed ? ' failed' : ''}`,
        tabindex: '0',
        onclick: () => {
          _closeServerPicker();
          toast(`Cargando ${srv.label}…`);
          playServer(srv);
        },
      },
        h('div', { class: 'server-pick-info' },
          h('span', { class: 'server-pick-name' }, srv.label),
          h('span', { class: 'server-pick-status' },
            isCurrent ? '● Reproduciendo ahora' : (isFailed ? '✕ No disponible' : 'Disponible')
          ),
        ),
        h('span', { class: 'server-pick-icon' }, isCurrent ? '✓' : '▶'),
      );

      if (!isFailed && !firstFocusTarget) {
        firstFocusTarget = itemBtn;
      }
      if (isCurrent) {
        firstFocusTarget = itemBtn;
      }

      list.append(itemBtn);
    });

    modalBox.append(list);

    const foot = h('div', { class: 'server-picker-foot' },
      btn('Volver al video', _closeServerPicker, { cls: 'ghost' }),
    );
    modalBox.append(foot);

    pickerOverlay.append(modalBox);
    screen.append(pickerOverlay);

    // Foco automático en el servidor relevante para control remoto
    setTimeout(() => {
      (firstFocusTarget || modalBox.querySelector('button'))?.focus();
    }, 80);
  }

  async function _saveProgress(video, forceProgress) {
    const progress = forceProgress ?? (video.duration ? video.currentTime / video.duration : 0);
    await svc.history.save({ slug, epNum: Number(epNum), title: slug, epName: `Episodio ${epNum}`, progress });
  }

  init();
  return screen;
}

function _destroyHls() {
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
}
