// Pantalla de Ajustes: idioma y servidor preferidos, siguiente automático y datos locales.
// Todo son botones grandes (navegables con D-Pad).
import { h, btn, toast, confirmDlg } from './dom.js';

const LANGS = [['SUB', 'Subtitulado'], ['DUB', 'Doblado']];
const SERVERS = ['MP4Upload', 'HLS', 'Voe', 'Byse', 'UPNShare'];

export function renderSettings(svc, navigate) {
  const root = h('div', { class: 'settings-screen' });

  async function render() {
    const st = await svc.settings.get();
    const focusKey = document.activeElement?.dataset?.key;
    root.replaceChildren();

    const choice = (key, value, label, current) => {
      const b = btn(label, async () => {
        await svc.settings.set({ [key]: value });
        render();
      }, { cls: current === value ? 'primary' : 'ghost', ic: current === value ? 'check' : null });
      b.dataset.key = `${key}:${value}`;
      return b;
    };

    const row = (title, desc, ...controls) => h('div', { class: 'setting-row' },
      h('div', { class: 'setting-label' },
        h('div', { class: 'setting-title' }, title),
        desc ? h('div', { class: 'caption-sub' }, desc) : null,
      ),
      h('div', { class: 'setting-options' }, ...controls),
    );

    root.append(
      h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Ajustes'))),
      h('div', { class: 'settings-list' },
        row('Idioma preferido', 'Se usa al abrir un episodio. Si no existe en ese idioma, se muestra el otro.',
          ...LANGS.map(([v, l]) => choice('lang', v, l, st.lang))),
        row('Servidor preferido', 'Si falla, puedes cambiarlo desde el reproductor (flecha abajo).',
          ...SERVERS.map((s) => choice('server', s, s, st.server))),
        row('Siguiente episodio automático', 'Al terminar, cuenta atrás de 5 s que puedes cancelar.',
          choice('autoNext', true, 'Activado', st.autoNext),
          choice('autoNext', false, 'Desactivado', st.autoNext)),
        row('Respaldo', 'Guarda favoritos, historial y ajustes en un archivo, o recupéralos de otro dispositivo. Al importar se fusiona con lo que ya tienes.',
          btn('Exportar respaldo', () => exportBackup(svc), { cls: 'ghost', ic: 'download' }),
          btn('Importar respaldo', () => importBackup(svc, render), { cls: 'ghost', ic: 'share' })),
        row('Datos guardados', 'La caché acelera la app y permite ver contenido sin conexión.',
          btn('Borrar caché', async () => { await svc.cache.clear(); toast('Caché borrada'); }, { cls: 'ghost', ic: 'trash' }),
          btn('Borrar historial', async () => {
            if (await confirmDlg('¿Borrar todo el historial de reproducción?', 'Borrar', true)) {
              await svc.history.clearAll();
              toast('Historial borrado');
            }
          }, { cls: 'ghost danger', ic: 'trash' }),
          btn('Restablecer ajustes', async () => {
            await svc.settings.reset();
            toast('Ajustes restablecidos');
            render();
          }, { cls: 'ghost', ic: 'refresh' })),
      ),
      h('div', { class: 'settings-version caption-sub' }, 'AnimeAV1 · ', versionEl()),
    );

    if (focusKey) root.querySelector(`[data-key="${focusKey}"]`)?.focus({ preventScroll: true });
  }

  render();
  return root;
}

// Versión del bundle OTA (solo en Android); en PC/desarrollo indica "web"
function versionEl() {
  const el = h('span', null, 'web');
  const Updater = window.Capacitor?.Plugins?.CapacitorUpdater;
  Updater?.current?.().then((c) => { el.textContent = `versión ${c?.bundle?.id || 'integrada'}`; }).catch(() => {});
  return el;
}

async function exportBackup(svc) {
  try {
    const data = await svc.backup.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `animeav1-respaldo-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast(`Respaldo exportado (${data.data.favorites.length} favoritos, ${data.data.history.length} episodios)`);
  } catch (e) {
    toast(`No se pudo exportar: ${e.message}`, 'error');
  }
}

function importBackup(svc, refresh) {
  const input = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    try {
      const res = await svc.backup.importData(JSON.parse(await file.text()));
      toast(`Importado: ${res.favorites} favoritos nuevos, ${res.episodes} episodios nuevos`);
      refresh();
    } catch (e) {
      toast(e instanceof SyntaxError ? 'El archivo no es un JSON válido.' : e.message, 'error');
    }
  });
  document.body.append(input);
  input.click();
}
