// Reproductor de video optimizado para Smart TV & Mobile.
// Pantalla 100% limpia sin barras fijas, auto-ocultamiento de controles (HUD)
// y panel modal de cambio de servidor navegable con control remoto (D-Pad).

import { h, btn, iconBtn, loading, toast } from './dom.js';
import { resolveDirectSource } from '../core/scraper.js';
import { fmtTime, seekStep, seekTarget, showSkipIntro, INTRO_SKIP_SECONDS } from './seek.js';

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
  let lang = 'SUB';              // idioma activo (SUB / DUB)
  let settings = { autoNext: true };
  let pendingSeek = null;        // destino de un avance aún no aplicado (se aplica al dejar de pulsar)
  let seekTimer = null;
  let rapid = 0, lastSeekKey = 0, lastInc = 0;
  let introUsed = false;
  let autoNextCancel = null;     // función que cancela la cuenta atrás de 'siguiente episodio'
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

  const teardown = () => {
    clearTimeout(seekTimer);
    autoNextCancel?.();
    saveNow();
    window.removeEventListener('pagehide', saveNow);
    document.removeEventListener('visibilitychange', onVisibility);
    clearTimeout(hudTimer);
    window.removeEventListener('keydown', handleKey);
    window.removeEventListener('close-server-picker', _closeServerPicker);
    window.removeEventListener('popstate', onPop);
    screen.removeEventListener('mousemove', onUserActivity);
    screen.removeEventListener('touchstart', onUserActivity);
    releaseWake();
    _destroyHls();
    _closeServerPicker();
    screen.remove();
  };

  // Volver a la pantalla desde la que se abrió el reproductor (detalle, Inicio...) o, si se
  // abrió con un enlace directo, a la ficha del anime
  const closePlayer = () => {
    teardown();
    if (navigate.back) navigate.back(`/anime/${slug}`);
    else navigate(`/anime/${slug}`);
  };

  // Atrás del navegador / gesto del sistema con el reproductor abierto: cerrarlo limpiamente
  function onPop() { teardown(); }
  window.addEventListener('popstate', onPop);

  // ---- Progreso / historial ----
  let animeTitle = _humanize(slug);
  let animeCover = '';
  let resumeAt = 0;          // segundo desde el que reanudar
  let lastSaveAt = 0;
  let savedEnded = false;

  function saveNow() {
    const v = activeVideo;
    if (!v || savedEnded) return;
    const d = v.duration;
    if (!Number.isFinite(d) || d <= 0 || v.currentTime <= 0) return;
    lastSaveAt = Date.now();
    svc.history.save({
      slug, epNum: curEp, title: animeTitle, cover: animeCover, epName: `Episodio ${epNum}`,
      progress: v.currentTime / d, position: v.currentTime, duration: d,
    }).catch(() => {});
  }
  const onVisibility = () => { if (document.visibilityState === 'hidden') saveNow(); };
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', onVisibility);

  // Episodios del anime (para anterior/siguiente)
  let epNums = [];
  const curEp = Number(epNum);
  const idx = () => epNums.indexOf(curEp);
  const prevEp = () => {
    if (epNums.length) return idx() > 0 ? epNums[idx() - 1] : null;
    return curEp > 1 ? curEp - 1 : null;
  };
  const nextEp = () => {
    if (epNums.length) return idx() !== -1 && idx() < epNums.length - 1 ? epNums[idx() + 1] : null;
    return curEp + 1;
  };
  function goEpisode(n) {
    if (n == null) { toast('No hay más episodios'); return; }
    teardown();
    // replace: cambiar de episodio no apila pantallas (Atrás vuelve a donde estabas)
    if (navigate.replace) navigate.replace(`/watch/${slug}/${n}`);
    else navigate(`/watch/${slug}/${n}`);
  }

  window.addEventListener('close-server-picker', _closeServerPicker);

  // Auto-ocultamiento de la barra superior (HUD) para pantalla 100% limpia
  function showHUD() {
    topbar.classList.remove('hud-hidden');
    osd.classList.remove('hud-hidden');
    clearTimeout(hudTimer);
    if (!isPickerOpen) {
      hudTimer = setTimeout(() => {
        // No ocultar mientras el usuario navega por la barra con el D-Pad. En pausa SÍ se oculta:
        // los subtítulos van grabados en el video y la barra los taparía.
        if (topbar.contains(document.activeElement)) { showHUD(); return; }
        topbar.classList.add('hud-hidden');
        osd.classList.add('hud-hidden');
      }, 3500);
    }
  }

  // ---- Barra de progreso (OSD) ----
  function updateOsd() {
    const v = activeVideo;
    const dur = v && Number.isFinite(v.duration) ? v.duration : 0;
    const cur = pendingSeek ?? (v ? v.currentTime : 0);
    const pct = dur ? Math.min(100, (cur / dur) * 100) : 0;
    osdFill.style.width = `${pct}%`;
    osdThumb.style.left = `${pct}%`;
    let buf = 0;
    try { if (v && v.buffered.length) buf = v.buffered.end(v.buffered.length - 1); } catch { /* ignorar */ }
    osdBuf.style.width = `${dur ? Math.min(100, (buf / dur) * 100) : 0}%`;
    osdCur.textContent = fmtTime(cur);
    osdDur.textContent = fmtTime(dur);
    osdState.textContent = v?.paused ? '⏸ Pausa' : '▶';
    pauseBadge.classList.toggle('show', !!v?.paused);
    osd.classList.toggle('seeking', pendingSeek != null);

    const showSkip = !!v && showSkipIntro(v.currentTime, dur, introUsed);
    if (showSkip !== (skipBtn.style.display !== 'none')) {
      skipBtn.style.display = showSkip ? '' : 'none';
      if (!showSkip && document.activeElement === skipBtn) skipBtn.blur();
    }
  }

  function showDelta(text) {
    osdDelta.textContent = text;
    osdDelta.classList.add('show');
    clearTimeout(showDelta.t);
    showDelta.t = setTimeout(() => osdDelta.classList.remove('show'), 700);
  }

  // Avance/retroceso con aceleración: pulsaciones seguidas suben de 10 s a 30 s y a 60 s.
  // El salto real se aplica al soltar (evita peticiones de red en cada pulsación).
  function seekBy(dir) {
    const v = activeVideo;
    if (!v || !Number.isFinite(v.duration)) return;
    const now = Date.now();
    if (now - lastSeekKey < 450) {
      if (now - lastInc > 150) { rapid++; lastInc = now; }
    } else {
      rapid = 0;
    }
    lastSeekKey = now;
    const step = seekStep(rapid);
    pendingSeek = seekTarget(pendingSeek ?? v.currentTime, dir, step, v.duration);
    showDelta(`${dir > 0 ? '+' : '−'}${step} s`);
    updateOsd();
    clearTimeout(seekTimer);
    seekTimer = setTimeout(commitSeek, 400);
  }

  function commitSeek() {
    if (pendingSeek != null && activeVideo) {
      try { activeVideo.currentTime = pendingSeek; } catch { /* ignorar */ }
    }
    pendingSeek = null;
    updateOsd();
  }

  function skipIntro() {
    const v = activeVideo;
    if (!v) return;
    introUsed = true;
    v.currentTime = seekTarget(v.currentTime, 1, INTRO_SKIP_SECONDS, v.duration);
    skipBtn.blur();
    updateOsd();
    toast('Intro saltada');
  }

  function togglePlay() {
    const v = activeVideo;
    if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
    updateOsd();
  }

  function onUserActivity() {
    showHUD();
  }

  screen.addEventListener('mousemove', onUserActivity);
  screen.addEventListener('touchstart', onUserActivity);

  function handleKey(e) {
    showHUD();

    // Cuenta atrás de "siguiente episodio": Atrás cancela, flechas alternan botones, OK activa el botón
    if (autoNextCancel) {
      if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 27 || e.keyCode === 4 || e.keyCode === 10009) {
        e.preventDefault();
        autoNextCancel();
      } else if (/^Arrow/.test(e.key) || [19, 20, 21, 22].includes(e.keyCode)) {
        e.preventDefault();
        const bs = [...screen.querySelectorAll('.autonext button')];
        const i = bs.indexOf(document.activeElement);
        bs[(i + 1) % bs.length]?.focus();
      }
      return;
    }

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

    // Botón "Saltar intro" enfocado: Abajo vuelve al video, Arriba sube a la barra, OK lo activa
    if (document.activeElement === skipBtn) {
      if (e.key === 'ArrowDown' || e.keyCode === 20) {
        e.preventDefault();
        skipBtn.blur();
      } else if (e.key === 'ArrowUp' || e.keyCode === 19) {
        e.preventDefault();
        (!nextBtn.disabled ? nextBtn : topbar.querySelector('button:not([disabled])'))?.focus();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.keyCode === 21 || e.keyCode === 22) {
        e.preventDefault();
      }
      return; // Enter / OK: actúa el botón enfocado
    }

    // Navegación dentro de la barra superior (Anterior / Siguiente / Servidor)
    if (topbar.contains(document.activeElement)) {
      const btns = [...topbar.querySelectorAll('button:not([disabled])')];
      const i = btns.indexOf(document.activeElement);
      if (e.key === 'ArrowLeft' || e.keyCode === 21) {
        e.preventDefault();
        if (i > 0) btns[i - 1].focus();
      } else if (e.key === 'ArrowRight' || e.keyCode === 22) {
        e.preventDefault();
        if (i < btns.length - 1) btns[i + 1].focus();
      } else if (e.key === 'ArrowDown' || e.keyCode === 20) {
        e.preventDefault();
        document.activeElement.blur(); // devolver el control al video
        try { wrap.querySelector('iframe')?.focus(); } catch {}
      }
      // Enter / OK: se deja actuar al botón enfocado (no hacer play/pausa)
      if (e.key !== 'n' && e.key !== 'N' && e.key !== 'p' && e.key !== 'P' && e.key !== 's' && e.key !== 'S') return;
    }

    // Flecha Arriba: mostrar la barra y enfocar "Siguiente" (o el primer botón disponible)
    if (e.key === 'ArrowUp' || e.keyCode === 19) {
      e.preventDefault();
      topbar.classList.remove('hud-hidden');
      if (skipBtn.style.display !== 'none') { skipBtn.focus(); showHUD(); return; }
      (!nextBtn.disabled ? nextBtn : topbar.querySelector('button:not([disabled])'))?.focus();
      showHUD();
      return;
    }

    // Tecla para abrir selector de servidores: Flecha Abajo o tecla 's'
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      e.preventDefault();
      openServerPickerModal();
      return;
    }

    // Siguiente / anterior episodio: N / P, PageDown / PageUp, teclas multimedia
    if (e.key === 'n' || e.key === 'N' || e.key === 'MediaTrackNext' || e.key === 'PageDown' || e.keyCode === 87) {
      e.preventDefault();
      goEpisode(nextEp());
      return;
    }
    if (e.key === 'p' || e.key === 'P' || e.key === 'MediaTrackPrevious' || e.key === 'PageUp' || e.keyCode === 88) {
      e.preventDefault();
      goEpisode(prevEp());
      return;
    }

    if (activeVideo) {
      if (e.key === ' ' || e.key === 'MediaPlayPause' || e.key === 'Enter' || e.keyCode === 13 || e.keyCode === 23) {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft' || e.key === 'MediaRewind' || e.keyCode === 21) {
        e.preventDefault();
        seekBy(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'MediaFastForward' || e.keyCode === 22) {
        e.preventDefault();
        seekBy(1);
      }
    } else {
      const frame = wrap.querySelector('iframe');
      if (frame && (e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 23)) {
        try { frame.focus(); } catch {}
      }
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

  const prevBtn = btn('Anterior', () => goEpisode(prevEp()), { cls: 'ghost', ic: 'prev', title: 'Episodio anterior (P)' });
  const nextBtn = btn('Siguiente', () => goEpisode(nextEp()), { cls: 'ghost', ic: 'next', title: 'Episodio siguiente (N)' });
  function refreshNavBtns() {
    prevBtn.disabled = prevEp() == null;
    nextBtn.disabled = nextEp() == null;
  }
  refreshNavBtns();

  // Idioma (SUB / DUB): solo visible si el episodio ofrece ambos
  const langBtn = btn(`Idioma: ${lang}`, () => switchLang(), { cls: 'ghost', ic: 'refresh', title: 'Cambiar entre subtitulado y doblado' });
  langBtn.style.display = 'none';

  topbar.append(backBtn, title, prevBtn, nextBtn, langBtn, pickServerBtn);
  screen.append(topbar);

  // Zona de reproducción (100% de la pantalla)
  const wrap = h('div', { class: 'player-wrap' });
  wrap.append(loading());
  screen.append(wrap);

  // Barra de progreso inferior (OSD) y botón "Saltar intro"
  const osdFill  = h('div', { class: 'osd-fill' });
  const osdBuf   = h('div', { class: 'osd-buf' });
  const osdThumb = h('div', { class: 'osd-thumb' });
  const osdDelta = h('div', { class: 'osd-delta' });
  const osdCur   = h('span', null, '0:00');
  const osdDur   = h('span', null, '0:00');
  const osdState = h('span', { class: 'osd-state' }, '▶');
  const osdTrack = h('div', {
    class: 'osd-track',
    onclick: (e) => {                       // táctil / ratón: tocar la barra para saltar
      const v = activeVideo;
      if (!v || !Number.isFinite(v.duration)) return;
      const r = osdTrack.getBoundingClientRect();
      v.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * v.duration;
      updateOsd();
    },
  }, osdBuf, osdFill, osdThumb, osdDelta);
  const osd = h('div', { class: 'player-osd' },
    osdTrack,
    h('div', { class: 'osd-times' }, h('div', { class: 'osd-left' }, osdState, osdCur), osdDur),
  );
  const skipBtn = btn('Saltar intro', () => skipIntro(), { cls: 'primary', ic: 'next', title: `Saltar ${INTRO_SKIP_SECONDS} s` });
  skipBtn.classList.add('skip-intro');
  skipBtn.style.display = 'none';
  const pauseBadge = h('div', { class: 'pause-badge' }, '⏸ Pausa');
  screen.append(osd, pauseBadge, skipBtn);

  document.getElementById('app').append(screen);
  showHUD();

  async function init() {
    svc.anime.getAnimeInfo(slug).then((info) => {
      if (info.title) animeTitle = info.title;
      if (info.cover) animeCover = info.cover;
      epNums = (info.episodes || []).map((e) => Number(e.num)).sort((a, b) => a - b);
      refreshNavBtns();
    }).catch(() => {});

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

    try { settings = await svc.settings.get(); } catch { /* usar valores por defecto */ }
    const langs = [...new Set(allServers.map((s) => s.lang || 'SUB'))];
    if (langs.includes(settings.lang)) {
      lang = settings.lang;
    } else if (langs.length) {
      lang = langs[0];
      toast(settings.lang === 'DUB' ? 'Este episodio no tiene doblaje: mostrando subtitulado' : 'Este episodio solo está doblado');
    }
    if (langs.length > 1) langBtn.style.display = '';
    refreshLangBtn();

    if (!allServers.length) {
      wrap.innerHTML = '';
      wrap.append(h('div', { class: 'empty' },
        h('h3', null, 'Sin opciones de reproducción'),
        h('p', null, 'No se encontraron servidores de streaming para este episodio.'),
        btn('Volver', closePlayer, { cls: 'primary' })
      ));
      return;
    }

    // Reanudar donde se quedó (si no estaba terminado)
    try {
      const prev = await svc.history.get(slug, curEp);
      if (prev && prev.progress < 0.9 && prev.position > 5) {
        resumeAt = prev.position;
        toast(`Reanudando en ${_fmt(prev.position)}`);
      }
      // Registrar apertura SIN tocar el progreso existente
      await svc.history.save({ slug, epNum: curEp, title: animeTitle, cover: animeCover, epName: `Episodio ${epNum}` });
    } catch { /* el historial no debe impedir reproducir */ }

    playServer(pickServer());
  }

  const langServers = () => allServers.filter((s) => (s.lang || 'SUB') === lang);

  // Servidor a usar: el que el usuario eligió para este anime > el preferido en Ajustes > el primero
  function pickServer() {
    const list = langServers();
    const find = (name) => name && list.find((s) => (s.label || '').toLowerCase().includes(name.toLowerCase()));
    return find(settings.serverBySlug?.[slug]) || find(settings.server) || list[0] || allServers[0];
  }

  function refreshLangBtn() {
    langBtn.querySelector('span:not(.icon)').textContent = `Idioma: ${lang === 'DUB' ? 'Doblado' : 'Subtitulado'}`;
  }

  function switchLang() {
    const langs = [...new Set(allServers.map((s) => s.lang || 'SUB'))];
    if (langs.length < 2) return;
    lang = langs[(langs.indexOf(lang) + 1) % langs.length];
    refreshLangBtn();
    toast(lang === 'DUB' ? 'Cambiando a doblado…' : 'Cambiando a subtitulado…');
    playServer(pickServer()); // conserva el minuto actual (resumeAt)
  }

  // Cuenta atrás cancelable antes de pasar al siguiente episodio
  function startAutoNext(n) {
    if (autoNextCancel) return;
    let left = 5;
    const count = h('div', { class: 'autonext-count' }, `Comienza en ${left} s`);
    const go = btn('Reproducir ahora', () => { autoNextCancel?.(); goEpisode(n); }, { cls: 'primary', ic: 'play' });
    const cancel = btn('Cancelar', () => autoNextCancel?.(), { cls: 'ghost' });
    const box = h('div', { class: 'autonext' },
      h('div', { class: 'autonext-title' }, `Siguiente: episodio ${n}`),
      count,
      h('div', { class: 'autonext-actions' }, go, cancel),
    );
    screen.append(box);
    go.focus();
    const timer = setInterval(() => {
      left -= 1;
      if (left <= 0) { autoNextCancel?.(); goEpisode(n); return; }
      count.textContent = `Comienza en ${left} s`;
    }, 1000);
    autoNextCancel = () => { clearInterval(timer); box.remove(); autoNextCancel = null; };
  }

  let playToken = 0;

  async function playServer(srv) {
    const token = ++playToken;
    const original = srv; // para marcar fallos / servidor activo en el selector
    // Al cambiar de servidor, continuar desde donde iba
    if (activeVideo && activeVideo.currentTime > 5) resumeAt = activeVideo.currentTime;
    savedEnded = false;
    _destroyHls();
    activeVideo = null;
    currentServer = srv;
    wrap.innerHTML = '';
    wrap.append(loading());

    // Estrategia A: intentar extraer el video real para reproducirlo nativo (OK/D-Pad funciona)
    if (srv.type !== 'video') {
      const direct = await resolveDirectSource(srv);
      if (token !== playToken) return; // el usuario cambió de servidor
      wrap.innerHTML = '';
      if (direct) {
        srv = { ...srv, url: direct.url, type: 'video', hls: direct.hls };
      }
    }

    title.textContent = `Episodio ${epNum} — ${srv.label}`;
    showHUD();

    // 1. Video directo nativo (M3U8 o MP4) - solo archivos directos de video, nunca iframes/embeds
    const isDirectVideo = srv.type === 'video' || (/\.(mp4|m3u8)($|\?)/i.test(srv.url) && !srv.url.includes('/embed') && !srv.url.includes('.html'));

    if (isDirectVideo) {
      const video = h('video', {
        autoplay: true,
        playsinline: true,
        style: 'width:100%;height:100%;background:#000',
      });
      activeVideo = video;
      pendingSeek = null;
      introUsed = false;
      wrap.append(video);
      video.addEventListener('click', () => { togglePlay(); showHUD(); });  // táctil / ratón
      for (const ev of ['play', 'pause', 'timeupdate', 'progress', 'loadedmetadata', 'durationchange', 'seeked']) {
        video.addEventListener(ev, updateOsd);
      }
      updateOsd();
      requestWake();

      video.addEventListener('error', () => {
        _handleFailure(original);
      });

      if (srv.hls || srv.url.includes('.m3u8')) {
        _playHls(video, srv.url, original);
      } else {
        video.src = srv.url;
        video.play().catch(() => {});
      }

      video.addEventListener('loadedmetadata', () => {
        if (resumeAt > 0 && resumeAt < video.duration - 10) {
          try { video.currentTime = resumeAt; } catch { /* ignorar */ }
        }
        resumeAt = 0;
      }, { once: true });
      video.addEventListener('pause', saveNow);
      video.addEventListener('timeupdate', () => {
        if (Date.now() - lastSaveAt > 10000) saveNow();
      });
      video.addEventListener('ended', () => {
        savedEnded = true;
        svc.history.save({
          slug, epNum: curEp, title: animeTitle, cover: animeCover, epName: `Episodio ${epNum}`,
          progress: 1, position: 0, duration: video.duration || 0,
        }).catch(() => {});
        const n = nextEp();
        if (n != null && settings.autoNext !== false) startAutoNext(n);
      });
      return;
    }

    // 2. Servidores web embebidos (MP4Upload, HLS FHD, Voe, etc. en iframe)
    let embedUrl = srv.url;
    if (!embedUrl.includes('autoplay=')) {
      embedUrl += (embedUrl.includes('?') ? '&' : '?') + 'autoplay=1&autostart=true';
    }

    const frame = h('iframe', {
      class: 'player-frame',
      src: embedUrl,
      allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture',
      allowfullscreen: true,
      tabindex: '0',
    });

    frame.onload = () => {
      setTimeout(() => {
        try {
          frame.focus();
        } catch {}
      }, 100);
    };

    wrap.append(frame);
    requestWake();
    setTimeout(() => { try { frame.focus(); } catch {} }, 250);
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
    document.querySelectorAll('.server-picker-overlay').forEach((el) => el.remove());
    pickerOverlay = null;
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
      iconBtn('close', 'Cerrar', () => _closeServerPicker(), 'ghost'),
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

    langServers().forEach((srv) => {
      const isCurrent = currentServer?.url === srv.url;
      const isFailed = failedServers.has(srv.url);

      const itemBtn = h('button', {
        type: 'button',
        class: `server-pick-item${isCurrent ? ' active' : ''}${isFailed ? ' failed' : ''}`,
        tabindex: '0',
        onclick: () => {
          _closeServerPicker();
          toast(`Cargando ${srv.label}…`);
          svc.settings.rememberServer(slug, srv.label).then((st) => { settings = st; }).catch(() => {});
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
      btn('Volver al video', () => _closeServerPicker(), { cls: 'ghost' }),
    );
    modalBox.append(foot);

    // Navegación D-Pad interna para el modal
    modalBox.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 27 || e.keyCode === 4 || e.keyCode === 10009) {
        e.preventDefault();
        e.stopPropagation();
        _closeServerPicker();
        return;
      }

      if (e.keyCode === 23) {
        e.preventDefault();
        document.activeElement?.click?.();
        return;
      }

      const allBtns = [...modalBox.querySelectorAll('button:not([disabled])')];
      const curIdx = allBtns.indexOf(document.activeElement);
      if (curIdx === -1) return;

      if (e.key === 'ArrowUp' || e.keyCode === 38 || e.keyCode === 19) {
        e.preventDefault();
        if (curIdx > 0) allBtns[curIdx - 1].focus();
      } else if (e.key === 'ArrowDown' || e.keyCode === 40 || e.keyCode === 20) {
        e.preventDefault();
        if (curIdx < allBtns.length - 1) allBtns[curIdx + 1].focus();
      }
    });

    pickerOverlay.append(modalBox);
    screen.append(pickerOverlay);

    // Foco automático en el servidor relevante para control remoto
    setTimeout(() => {
      (firstFocusTarget || modalBox.querySelector('button'))?.focus();
    }, 80);
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

function _humanize(slug = '') {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function _fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
