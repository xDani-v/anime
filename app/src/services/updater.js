// Servicio de actualización OTA (Over-The-Air) para Android / Smart TV.
// Descarga e instala en segundo plano las mejoras de la interfaz publicadas en GitHub,
// evitando tener que descargar o instalar manualmente un nuevo APK en la TV.
//
// Flujo (plugin @capgo/capacitor-updater en modo manual):
//   1. current()  -> versión del bundle activo (bundle.version; el id es un valor aleatorio del plugin)
//   2. fetch version.json del release "latest" de GitHub  -> { version, url }
//   3. si version != la activa: download({ url, version, checksum }) devuelve un BundleInfo con su PROPIO id
//      (checksum = SHA-256 del zip, obligatorio en el plugin; lo publica el workflow en version.json)
//   4. set({ id: bundle.id }) activa ese bundle y recarga la app
// Cada comprobación deja su resultado en localStorage para mostrarlo en Ajustes (diagnóstico en la TV).

const UPDATE_CHECK_URL = 'https://github.com/xDani-v/anime/releases/latest/download/version.json';
const LS_KEY = 'ota:last';

/** ¿Hay que actualizar? Solo si el remoto publica una versión distinta de la activa. */
export function shouldUpdate(currentVersion, remoteVersion) {
  return !!remoteVersion && String(remoteVersion) !== String(currentVersion);
}

/** Mensaje comprensible para un código HTTP al pedir version.json. */
export function httpHint(status) {
  if (status === 404) return 'No se encontró version.json (404). Revisa que el workflow haya publicado el release y que el repositorio sea público.';
  if (status === 403 || status === 429) return `GitHub rechazó la consulta (${status}). Reintenta más tarde.`;
  if (status >= 500) return `GitHub no responde (${status}).`;
  return `Respuesta inesperada (${status}).`;
}

function record(status) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ ...status, at: Date.now() })); } catch { /* sin almacenamiento */ }
  return status;
}

/** Último resultado de comprobación guardado (o null). */
export function lastOtaStatus() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** La descarga puede fallar un instante si GitHub está reemplazando el archivo o la red parpadea: reintentar. */
async function downloadWithRetry(Updater, opts, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await Updater.download(opts);
    } catch (e) {
      last = e;
      console.warn(`[OTA] Descarga fallida (intento ${i + 1}/${tries}):`, e?.message || e);
      if (i < tries - 1) await sleep(2000 * (i + 1));
    }
  }
  throw last;
}

function getUpdater() {
  return window.Capacitor?.Plugins?.CapacitorUpdater || null;
}

export async function initOTAUpdater(toast) {
  const Updater = getUpdater();
  if (!Updater) return; // Solo activo en Android / Smart TV, inerte en desarrollo PC

  // 1. Notificar inmediatamente que JavaScript cargó con éxito (evita rollback automático)
  try {
    await Updater.notifyAppReady();
  } catch (err) {
    console.warn('[OTA] notifyAppReady:', err);
  }

  // 2. Comprobar actualización en segundo plano después de 4 segundos
  setTimeout(() => { checkForUpdate(toast); }, 4000);
}

/**
 * Comprueba (y aplica) una actualización. Nunca lanza: devuelve
 * { state: 'unavailable' | 'uptodate' | 'updated' | 'error', current, remote, detail }.
 */
export async function checkForUpdate(toast) {
  const Updater = getUpdater();
  if (!Updater) return record({ state: 'unavailable', detail: 'Solo disponible en la app Android.' });

  let current = 'integrada';
  try {
    const c = await Updater.current();
    current = c?.bundle?.version || c?.bundle?.id || 'integrada';
  } catch { /* seguir con el valor por defecto */ }

  try {
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

    if (!res.ok) return record({ state: 'error', current, detail: httpHint(res.status) });

    const data = await res.json();
    const remote = data.version;
    if (!remote || !data.url) return record({ state: 'error', current, detail: 'version.json no tiene "version" o "url".' });
    if (!data.checksum) return record({ state: 'error', current, remote, detail: 'version.json no trae "checksum" (SHA-256 del bundle): el plugin lo exige para descargar.' });

    if (!shouldUpdate(current, remote)) {
      console.log(`[OTA] AnimeAV1 al día (versión ${current})`);
      return record({ state: 'uptodate', current, remote, detail: 'Estás en la última versión.' });
    }

    console.log(`[OTA] Nueva versión disponible: ${remote} (actual: ${current})`);
    toast?.('Descargando actualización en segundo plano…');

    // ¿Ya está descargada (p. ej. una comprobación anterior se cortó antes de aplicarla)?
    let bundle = null;
    try {
      const { bundles } = await Updater.list();
      bundle = (bundles || []).find((b) => b.version === remote && b.status !== 'error') || null;
    } catch { /* si list() no está disponible, se descarga */ }

    if (!bundle) bundle = await downloadWithRetry(Updater, { url: data.url, version: remote, checksum: data.checksum });
    if (!bundle?.id) return record({ state: 'error', current, remote, detail: 'La descarga no devolvió un bundle válido.' });

    record({ state: 'updated', current, remote, detail: `Actualizando a ${remote}…` });
    toast?.('Actualización lista. Aplicando…');
    // set() activa el bundle por SU id (no por el nombre de la versión) y recarga la app
    setTimeout(async () => {
      try {
        await Updater.set({ id: bundle.id });
      } catch (e) {
        console.error('[OTA] Error al aplicar bundle:', e);
        record({ state: 'error', current, remote, detail: `No se pudo aplicar: ${e?.message || e}` });
      }
    }, 1200);
    return { state: 'updated', current, remote, detail: `Actualizando a ${remote}…` };
  } catch (err) {
    const detail = err?.name === 'AbortError' ? 'Sin respuesta de GitHub (tiempo agotado).' : `Error: ${err?.message || err}`;
    console.warn('[OTA] Error al comprobar actualización:', err);
    return record({ state: 'error', current, detail });
  }
}
