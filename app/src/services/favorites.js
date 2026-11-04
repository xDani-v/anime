// Capa de servicios: favoritos — CRUD sobre el almacén 'favorites'.
// { id: slug, slug, title, cover, status, genres, addedAt }

export function createFavoritesService(store) {
  return {
    async getAll() {
      const rows = await store.getAll('favorites');
      return rows.sort((a, b) => b.addedAt - a.addedAt);
    },
    async get(slug) { return store.get('favorites', slug); },
    async toggle(anime) {
      const existing = await store.get('favorites', anime.slug);
      if (existing) {
        await store.remove('favorites', anime.slug);
        return false; // ya no es favorito
      }
      await store.put('favorites', {
        id:      anime.slug,
        slug:    anime.slug,
        title:   anime.title,
        cover:   anime.cover,
        status:  anime.status || '',
        genres:  anime.genres || [],
        addedAt: Date.now(),
      });
      return true; // ahora es favorito
    },
    async isFav(slug) { return !!(await store.get('favorites', slug)); },
    async remove(slug) { return store.remove('favorites', slug); },
  };
}
