// Scraper oficial y adaptativo de AnimeAV1 (animeav1.com).
// Compatible con el stack SvelteKit del sitio y su API oficial.
// Sin dependencias externas (usa fetch nativo y DOMParser).

const BASE = 'https://animeav1.com';

// Resuelve la URL adecuada:
// - En el APK de Android (Capacitor / Smart TV), consulta directamente la web oficial.
// - Solo en desarrollo local en PC (localhost:5174), usa el proxy local para evitar CORS del navegador de escritorio.
function resolveUrl(url) {
  if (typeof window !== 'undefined' && window.location) {
    // Si estamos en la app nativa (Capacitor en Android / Smart TV), consultar directamente sin proxy local
    if (window.Capacitor || !window.location.port || window.location.protocol === 'capacitor:') {
      return url;
    }
    // Solo si estamos en el servidor de desarrollo local de PC (puerto 5174)
    if (window.location.hostname === 'localhost' && window.location.port === '5174') {
      return `/api/proxy?url=${encodeURIComponent(url)}`;
    }
  }
  return url;
}

function isDevProxy() {
  return typeof window !== 'undefined' && !window.Capacitor &&
    window.location?.hostname === 'localhost' && window.location?.port === '5174';
}

/**
 * Convierte un servidor embebido en una fuente de video directa reproducible con <video>/Hls.js.
 * Devuelve { url, hls } o null si no se puede extraer (el reproductor cae al iframe).
 *  - HLS (Zilla): https://player.zilla-networks.com/play/{id} -> /m3u8/{id}
 *  - MP4Upload: el mp4 real está en el HTML del embed; exige Referer mp4upload.com
 *    (en APK lo inyecta MainActivity.shouldInterceptRequest; en dev, /api/stream).
 */
export async function resolveDirectSource(srv) {
  const url = srv?.url || '';
  try {
    const z = url.match(/player\.zilla-networks\.com\/play\/([a-z0-9]{32})/i);
    if (z) return { url: `https://player.zilla-networks.com/m3u8/${z[1]}`, hls: true };

    if (/mp4upload\.com\/embed-/i.test(url)) {
      const html = await fetchHtml(url);
      const m = html.match(/src:\s*"(https?:[^"]+\.mp4[^"]*)"/i);
      if (!m) return null;
      const direct = m[1];
      return { url: isDevProxy() ? `/api/stream?url=${encodeURIComponent(direct)}` : direct, hls: false };
    }
  } catch { /* cae al iframe */ }
  return null;
}

// Fetch con headers para simular navegador
async function fetchHtml(url) {
  const target = resolveUrl(url);
  const res = await fetch(target, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Referer': BASE + '/',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al consultar ${url}`);
  return res.text();
}

// Parseo DOM isomórfico
function parse(html) {
  if (typeof DOMParser === 'undefined') {
    throw new Error('DOMParser no está disponible en este entorno.');
  }
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

// Extrae el slug de una URL del sitio:
//   /media/one-piece         -> 'one-piece'
//   /media/one-piece/1050    -> 'one-piece'
export function slugFromUrl(url = '') {
  const clean = url.split('?')[0].replace(/\/$/, '');
  const m = clean.match(/\/media\/([^\/]+)(?:\/\d+)?$/) || clean.match(/\/([^\/]+)$/);
  return m ? m[1] : '';
}

// Extrae el número de episodio de una URL:
//   /media/one-piece/1050    -> 1050
export function epNumFromUrl(url = '') {
  const m = url.match(/\/media\/[^\/]+\/(\d+)\/?$/) || url.match(/episodio[-_]?(\d+)/i) || url.match(/\/(\d+)\/?$/);
  return m ? Number(m[1]) : null;
}

/** Últimos episodios y novedades de portada */
export async function getLatest() {
  const html = await fetchHtml(BASE + '/');
  const doc = parse(html);
  return _parseCardsFromDoc(doc, html);
}

/**
 * BÚSQUEDA DINÁMICA OFICIAL en tiempo real vía POST /api/search
 * Devuelve resultados instantáneos con id, title, slug y carátula directa de cdn.animeav1.com
 */
export async function searchDynamic(query) {
  const q = (query || '').trim();
  if (!q) return [];

  const target = resolveUrl(`${BASE}/api/search`);
  const res = await fetch(target, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      'Referer': BASE + '/',
    },
    body: JSON.stringify({ query: q }),
  });

  if (!res.ok) {
    // Si falla el endpoint API, fallback al buscador HTML de catálogo
    return searchAnime(q);
  }

  const items = await res.json();
  if (!Array.isArray(items)) return [];

  return items.map((it) => ({
    id: it.id,
    slug: it.slug,
    title: it.title || it.slug,
    cover: it.id ? `https://cdn.animeav1.com/covers/${it.id}.jpg` : '',
    url: `/media/${it.slug}`,
    badge: 'Anime',
  }));
}

/** Búsqueda estándar en el catálogo HTML */
export async function searchAnime(query, page = 1) {
  return getCatalogo({ search: query, page });
}

/**
 * Directorio y Catálogo completo con Filtros:
 * filters: { genre, category, status, order, letter, search, page }
 */
export async function getCatalogo(filters = {}) {
  const params = new URLSearchParams();
  if (filters.page && filters.page > 1) params.set('page', filters.page);
  if (filters.genre) params.set('genre', filters.genre);
  if (filters.category) params.set('category', filters.category);
  if (filters.status) params.set('status', filters.status);
  if (filters.order && filters.order !== 'default') params.set('order', filters.order);
  if (filters.letter) params.set('letter', filters.letter);
  if (filters.search) params.set('query', filters.search);

  const qs = params.toString();
  const url = `${BASE}/catalogo${qs ? `?${qs}` : ''}`;
  const html = await fetchHtml(url);
  const doc = parse(html);

  const items = _parseCardsFromDoc(doc, html);

  // Extraer paginación si está disponible
  let totalPages = 1;
  const pagMatch = html.match(/totalPages:(\d+)/);
  if (pagMatch) totalPages = Number(pagMatch[1]);

  return {
    items,
    page: Number(filters.page || 1),
    totalPages,
    url,
  };
}

/** Información detallada de un anime */
export async function getAnimeInfo(slug) {
  const url = `${BASE}/media/${slug}`;
  const html = await fetchHtml(url);
  const doc = parse(html);

  // 1. Título
  const h1 = doc.querySelector('h1');
  const title = h1 ? h1.textContent.trim() : slug;

  // 2. Portada (covers en cdn.animeav1.com)
  const imgs = [...doc.querySelectorAll('img')];
  const coverImg = imgs.find((img) => (img.src || img.getAttribute('src') || '').includes('/covers/')) ||
                   imgs.find((img) => (img.src || img.getAttribute('src') || '').includes('cdn.animeav1.com')) ||
                   imgs[0];
  const cover = coverImg ? (coverImg.src || coverImg.getAttribute('src') || '') : '';

  // 3. Sinopsis
  let synopsis = '';
  const synopsisEl = doc.querySelector('p.text-subs, p.text-body, .synopsis, [itemprop="description"]');
  if (synopsisEl) {
    synopsis = synopsisEl.textContent.trim();
  } else {
    const synMatch = html.match(/synopsis:"([^"]+)"/);
    if (synMatch) synopsis = synMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }

  // 4. Géneros
  const genreLinks = [...doc.querySelectorAll('a[href*="/catalogo?genre="]')];
  const genres = [...new Set(genreLinks.map((a) => a.textContent.trim()).filter(Boolean))];

  // 5. Lista de episodios
  const epLinks = [...doc.querySelectorAll(`a[href*="/media/${slug}/"]`)];
  const episodesMap = new Map();

  for (const a of epLinks) {
    const href = a.getAttribute('href') || a.href || '';
    const num = epNumFromUrl(href);
    if (num && !episodesMap.has(num)) {
      episodesMap.set(num, {
        num,
        name: `Episodio ${num}`,
        url: href.startsWith('http') ? href : `${BASE}${href}`,
      });
    }
  }

  // Si no se encontraron por enlace en DOM, extraer por regex en el HTML
  if (!episodesMap.size) {
    const regex = new RegExp(`/media/${slug}/(\\d+)`, 'g');
    let m;
    while ((m = regex.exec(html)) !== null) {
      const num = Number(m[1]);
      if (!episodesMap.has(num)) {
        episodesMap.set(num, {
          num,
          name: `Episodio ${num}`,
          url: `${BASE}/media/${slug}/${num}`,
        });
      }
    }
  }

  const episodes = [...episodesMap.values()].sort((a, b) => a.num - b.num);

  return {
    slug,
    title,
    cover,
    synopsis,
    status: '',
    genres,
    episodes,
  };
}

/** Fuentes de video para reproducir un episodio (descartando enlaces de descarga) */
export async function getEpisodeSources(slug, epNum) {
  const url = `${BASE}/media/${slug}/${epNum}`;
  const html = await fetchHtml(url);
  const doc = parse(html);

  const servers = [];

  // 1. Extraer estrictamente de la sección "embeds:" de SvelteKit
  const embedsIdx = html.indexOf('embeds:');
  const downloadsIdx = html.indexOf('downloads:');
  const embedsSection = embedsIdx !== -1
    ? html.slice(embedsIdx, downloadsIdx !== -1 ? downloadsIdx : embedsIdx + 2500)
    : html;

  const serverMatches = [...embedsSection.matchAll(/\{server:"([^"]+)",url:"([^"]+)"\}/g)];
  for (const m of serverMatches) {
    const label = m[1];
    const srcUrl = m[2];

    // Descartar de raíz enlaces de descarga no reproducibles
    if (/mega\.nz|1fichier|mediafire|drive\.google/i.test(srcUrl)) continue;

    if (!servers.some((s) => s.url === srcUrl)) {
      const type = srcUrl.includes('.m3u8') ? 'video' : 'iframe';
      servers.push({ label: _labelFromServer(label, srcUrl), url: srcUrl, type });
    }
  }

  // 2. Extraer iframes directos en el documento si no se encontraron en embeds
  if (!servers.length) {
    const iframes = [...doc.querySelectorAll('iframe[src]')];
    for (const fr of iframes) {
      const src = fr.src || fr.getAttribute('src');
      if (src && !/mega\.nz|1fichier|mediafire/i.test(src) && !servers.some((s) => s.url === src)) {
        servers.push({ label: _labelFromUrl(src), url: src, type: 'iframe' });
      }
    }
  }

  // Ordenar servidores: MP4Upload siempre por defecto #1
  servers.sort((a, b) => {
    const priority = (name) => {
      const n = (name || '').toLowerCase();
      if (n.includes('mp4upload')) return 1; // Prioridad #1 por defecto
      if (n.includes('hls') || n.includes('rápido')) return 2;
      if (n.includes('voe')) return 3;
      if (n.includes('byse')) return 4;
      return 5;
    };
    return priority(a.label) - priority(b.label);
  });

  return { servers, episodeUrl: url };
}

// Extracción avanzada de tarjetas garantizando el nombre visible y limpio
function _parseCardsFromDoc(doc, rawHtml) {
  const items = [];
  const articles = [...doc.querySelectorAll('article')];

  for (const art of articles) {
    const link = art.querySelector('a[href*="/media/"]');
    if (!link) continue;

    const href = link.getAttribute('href') || link.href || '';
    const slug = slugFromUrl(href);
    if (!slug) continue;

    // Portada
    const img = art.querySelector('img');
    const cover = img ? (img.src || img.getAttribute('src') || '') : '';

    // Nombre / Título real del anime (evitando números de episodios o badges de tiempo)
    let title = '';
    const headerTitle = art.querySelector('header h1, header h2, header h3');
    const headerDiv = art.querySelector('header div');
    const srOnly = art.querySelector('.sr-only');

    if (headerTitle && headerTitle.textContent.trim()) {
      title = headerTitle.textContent.trim();
    } else if (headerDiv && headerDiv.textContent.trim()) {
      title = headerDiv.textContent.trim();
    } else if (srOnly && srOnly.textContent.trim()) {
      title = srOnly.textContent.replace(/^Ver\s+/i, '').replace(/\s+\d+$/, '').trim();
    } else if (img && img.alt && !img.alt.toLowerCase().includes('backdrop')) {
      title = img.alt.replace(/^(Portada|Póster)\s+de\s+/i, '').trim();
    }

    if (!title || title.toLowerCase() === 'backdrop') {
      title = _humanizeSlug(slug);
    }

    // Badge (Ej: TV Anime, Película, Hace 1 hora, Ep 5)
    const epNum = epNumFromUrl(href);
    let badge = '';
    if (epNum) {
      badge = `Episodio ${epNum}`;
    } else {
      const badgeEl = art.querySelector('.text-subs.font-bold, .bg-line, span.px-3');
      badge = badgeEl ? badgeEl.textContent.trim() : '';
    }

    if (!items.some((x) => x.slug === slug && x.badge === badge)) {
      items.push({
        slug,
        title,
        cover,
        badge,
        epNum,
        url: href,
      });
    }
  }

  return items;
}

function _humanizeSlug(s = '') {
  return s
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function _labelFromServer(name = '', url = '') {
  if (name && name !== 'default') return name;
  return _labelFromUrl(url);
}

function _labelFromUrl(url = '') {
  if (url.includes('zilla')) return 'HLS (Rápido)';
  if (url.includes('voe')) return 'Voe';
  if (url.includes('byse') || url.includes('byselapuix')) return 'Byse';
  if (url.includes('mp4upload')) return 'MP4Upload';
  if (url.includes('mega')) return 'Mega';
  try {
    return new URL(url).hostname.replace('www.', '').split('.')[0];
  } catch {
    return 'Servidor';
  }
}
