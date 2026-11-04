# Arquitectura y Diseño Técnico

Este proyecto aplica rigurosamente el mismo patrón arquitectónico de **`app_sp`**: diseño desacoplado en capas, sin frameworks de terceros, cero dependencias en producción y testeabilidad en Node.js puro.

## Capas de la Aplicación

| Capa | Ubicación | Responsabilidad | Depende de |
|---|---|---|---|
| **UI** | `app/src/ui/` | Vistas (Home, Search, Detail, Player, Favorites, History), helpers DOM (`h()`), modales y toasts | `services` |
| **Servicios** | `app/src/services/` | Casos de uso de la app, persistencia y control de caché en memoria/IndexedDB | `core`, `data` |
| **Core (Puro / Scraper)** | `app/src/core/` | Lógica de parsing HTML, extracción de slugs, selectores de AnimeAV1 y fuentes de streaming | Ninguna |
| **Datos** | `app/src/data/` | IndexedDB, esquema versionado (`schema.js`), migraciones y almacén en memoria para tests | Ninguna |

---

## Modelo de Datos Local (IndexedDB, v1)

La base de datos se llama `animeav1` y consta de 4 almacenes:

1. **`favorites`** (Key: `id` = `slug`):
   - Almacena los animes guardados por el usuario.
   - Campos: `{ id, slug, title, cover, status, genres, addedAt }`.
2. **`history`** (Key: `id` = `slug:epNum`, índice: `slug`):
   - Registra el progreso de visualización de cada episodio.
   - Campos: `{ id, slug, epNum, title, epName, watchedAt, progress }`.
   - Si `progress >= 0.9`, el episodio se marca visualmente como completado.
3. **`cache`** (Key: `id` = clave de consulta):
   - Almacena respuestas previas del scraping para navegación instantánea y ahorro de ancho de banda.
   - Campos: `{ id, data, expiresAt }`.
   - TTL: 5 min para últimas novedades, 10 min para búsquedas, 30 min para fichas de anime, 1 h para episodios.
4. **`settings`** (Key: `id` = `'user'`):
   - Preferencias de visualización y reproductor.

---

## Sistema de Diseño Visual: Pastel & Liquid Glass

La interfaz se rige por un sistema de diseño propio, contemporáneo y unificado:

1. **Paleta Pastel:**
   - **Ice:** `#A5C8E4` (azul pastel claro)
   - **Rose:** `#F4C2C2` (rosa pastel)
   - **Peach:** `#FFD1BA` (durazno suave)
   - **Lilac:** `#D8B4F8` (lila pastel)
   - **Sage:** `#B8D8BA` (verde salvia)
2. **Material Liquid Glass:**
   - Superficies translúcidas (`backdrop-filter: blur(22px) saturate(180%)`).
   - Sombras difuminadas (*Soft Shadows*) y bordes de cristal sutiles (`1px solid rgba(255,255,255,0.09)`).
   - Fondos oscuros satinados con luces ambientales radiales suaves.
3. **Tipografía Inter:**
   - Display: 40px / 46px (destacados)
   - Title: 22px / 28px (secciones)
   - Body: 15px / 22px (texto principal)
   - Caption: 11px / 14px (badges y metadatos)
4. **Iconografía Minimal Line (1.5px):**
   - Iconos lineales minimalistas uniformes en cuadrícula de 24×24px con trazo de 1.5px.
5. **Fluid Motion & Keyboard First:**
   - Transiciones progresivas `cubic-bezier(0.4, 0, 0.2, 1)`.
   - Navegación optimizada para control remoto de Android TV y teclado con halo translúcido Ice.

---

## Estrategia de Web Scraping sin Backend (Zero-Server)

1. **Sin CORS en el APK:** Las peticiones HTTP disparadas desde el WebView de una aplicación Android nativa empaquetada con Capacitor se ejecutan dentro del contexto de aplicación nativa, lo cual elimina las restricciones cross-origin que suelen bloquear las consultas desde un navegador común.
2. **Parsing nativo con `DOMParser`:** El WebView de Chromium integra un motor DOM completo (`DOMParser`). El scraping no necesita librerías externas de Node (como `cheerio` o `jsdom`) en el dispositivo.
3. **Aislamiento de selectores (`SEL`):** Todos los selectores CSS de AnimeAV1 están centralizados en un objeto constante en `core/scraper.js`. Si el sitio modifica su plantilla, solo se requiere cambiar una línea en ese archivo.

---

## Soporte para Android TV y Control Remoto

- **Navegación espacial D-Pad:** La función generadora `h()` en `dom.js` asigna automáticamente `tabindex="0"` y un listener del evento `keydown` (detectando `Enter` / `keyCode 13`) a todo contenedor interactivo con `onclick`.
- **Enfoque visible (`:focus-visible`):** Estilos CSS con halos de contraste, desplazamiento y elevación para una clara identificación del elemento activo desde el sillón a metros de distancia.
- **Teclas multimedia:**
  - `Enter` / `MediaPlayPause` / Espacio: Pausar y reanudar.
  - `ArrowLeft` / `MediaRewind`: Retroceder 10 segundos.
  - `ArrowRight` / `MediaFastForward`: Avanzar 10 segundos.
  - `Escape` / `Backspace` / Botón 4 (Android Back): Cerrar el reproductor y volver a la ficha.
- **Wake Lock API:** La pantalla se mantiene encendida de forma automática mientras se reproduce un episodio.
