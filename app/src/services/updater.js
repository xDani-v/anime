// Servicio de actualización OTA (Over-The-Air) para Android / Smart TV.
// Descarga e instala en segundo plano las mejoras de la interfaz publicadas en GitHub,
// evitando tener que descargar o instalar manualmente un nuevo APK en la TV.

const UPDATE_CHECK_URL = 'https://github.com/xDani-v/anime/releases/latest/download/version.json';

export async function initOTAUpdater(toast) {
  const Updater = window.Capacitor?.Plugins?.CapacitorUpdater;
  if (!Updater) return; // Solo activo en Android / Smart TV, inerte en desarrollo PC

  // 1. Notificar inmediatamente que JavaScript cargó con éxito (evita rollback automático)
  try {
    await Updater.notifyAppReady();
  } catch (err) {
    console.warn('[OTA] notifyAppReady:', err);
  }

  // 2. Comprobar actualización en segundo plano después de 4 segundos
  setTimeout(async () => {
    try {
      await _checkAndApplyUpdate(Updater, toast);
    } catch (err) {
      console.warn('[OTA] Error al comprobar actualización:', err.message);
    }
  }, 4000);
}

async function _checkAndApplyUpdate(Updater, toast) {
  let currentId = 'builtin';
  try {
    const current = await Updater.current();
    currentId = current?.bundle?.id || 'builtin';
  } catch {}

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);

  let res;
  try {
    res = await fetch(`${UPDATE_CHECK_URL}?_t=${Date.now()}`, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) return;

  const data = await res.json();
  const remoteVersion = data.version;
  const bundleUrl = data.url;

  if (!remoteVersion || !bundleUrl) return;
  if (remoteVersion === currentId) {
    console.log(`[OTA] AnimeAV1 al día (versión ${currentId})`);
    return;
  }

  console.log(`[OTA] Nueva versión disponible: ${remoteVersion} (actual: ${currentId})`);
  if (toast) toast('Descargando actualización en segundo plano…');

  const downloaded = await Updater.download({
    url: bundleUrl,
    version: remoteVersion,
  });

  if (downloaded) {
    console.log(`[OTA] Actualización descargada con éxito: ${remoteVersion}`);
    if (toast) toast('Actualización lista. Aplicando…');
    setTimeout(async () => {
      try {
        await Updater.set({ id: remoteVersion });
      } catch (e) {
        console.error('[OTA] Error al aplicar bundle:', e);
      }
    }, 1500);
  }
}
