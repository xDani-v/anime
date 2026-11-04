// Capa de servicios: ajustes del usuario (un único registro 'user' en el almacén 'settings').
//  lang          'SUB' | 'DUB'  idioma preferido
//  server        etiqueta del servidor preferido (MP4Upload, HLS, Voe, Byse, UPNShare)
//  autoNext      reproducir automáticamente el siguiente episodio
//  serverBySlug  último servidor elegido a mano por anime { slug: etiqueta }

export const DEFAULT_SETTINGS = {
  lang: 'SUB',
  server: 'MP4Upload',
  autoNext: true,
  serverBySlug: {},
};

const MAX_REMEMBERED = 50;

export function createSettingsService(store) {
  const api = {
    // Siempre se lee de la base (lectura barata): así una importación de respaldo se refleja al instante
    async get() {
      const row = await store.get('settings', 'user');
      const cur = { ...DEFAULT_SETTINGS, ...(row || {}) };
      delete cur.id;
      return { ...cur, serverBySlug: { ...cur.serverBySlug } };
    },
    async set(patch) {
      const cur = await api.get();
      await store.put('settings', { ...cur, ...patch, id: 'user' });
      return api.get();
    },
    /** Recuerda el servidor que el usuario eligió a mano para un anime. */
    async rememberServer(slug, label) {
      const cur = await api.get();
      const map = { ...cur.serverBySlug };
      delete map[slug];          // re-insertar al final = más reciente
      map[slug] = label;
      for (const k of Object.keys(map).slice(0, Math.max(0, Object.keys(map).length - MAX_REMEMBERED))) delete map[k];
      return api.set({ serverBySlug: map });
    },
    async reset() {
      await store.put('settings', { ...DEFAULT_SETTINGS, id: 'user' });
      return api.get();
    },
  };
  return api;
}
