# AnimeAV1 — Android TV & Mobile

Cliente de **AnimeAV1** 100 % local para Android (móvil y Android TV), sin servidores propios, sin cuentas, sin intermediarios ni telemetría.
Web scraping ligero empaquetado directamente en el APK, reproductor integrado (HLS adaptativo / MP4 / iframes), historial y favoritos en IndexedDB local.

## Decisión técnica

Siguiendo la misma filosofía de arquitectura limpia y minimalista de `app_sp`:
- **Web app sin dependencias en ejecución** (JS modular con ES modules, DOM nativo con función `h()`, IndexedDB para persistencia local).
- **Cero frameworks pesados** (sin React, sin Vue, sin Angular ni Virtual DOM).
- **Scraper integrado dentro del APK:** Corre directamente en el motor JavaScript local (V8 / Chromium WebView) usando `fetch()` y `DOMParser`. En apps nativas Android no existen restricciones CORS, lo que permite extraer catálogos, detalles y enlaces de streaming directamente sin necesidad de pagar ni mantener un servidor backend.
- **Empaquetado Android con Capacitor 7:** `@capacitor/core`, `@capacitor/cli` y `@capacitor/android` como herramientas exclusivas de build. La app final que se instala en el dispositivo no contiene `node_modules`.
- **Compatibilidad con Smart TV (Android TV, Fire TV, Google TV, webOS, Tizen):**
  - **Navegación Espacial D-Pad:** Algoritmo geométrico bidireccional (`Arriba`, `Abajo`, `Izquierda`, `Derecha`) para saltar de forma natural entre tarjetas y el menú con el control remoto.
  - **Auto-Scroll Centrado:** Cualquier elemento enfocado se desplaza suavemente al centro de la pantalla para nunca perder de vista el cursor en la TV.
  - **Mapeo de Control Remoto de Hardware:** Soporte para botones `Select`/`OK`, botón `Back`/`Return` (para volver de pantalla o salir del reproductor), teclas multimedia (`Play`, `Pause`, `Rewind`, `FastForward`).
  - **10-Foot UI Responsive:** Escala automáticamente en pantallas de 1080p, 2K y 4K con márgenes de seguridad para TV (Overscan safe areas), y se compacta fluidamente en móviles.
  - **Wake Lock API:** Mantiene la pantalla encendida mientras se reproduce video.

## Ejecutar en desarrollo

```bash
npm test            # Pruebas unitarias automatizadas con el test runner nativo de Node
npm run serve       # http://localhost:5174  (servidor de desarrollo ligero sin dependencias)
```

## Compilación del APK

Puedes compilarlo localmente con Gradle o dejar que GitHub Actions lo genere sin instalar nada en tu PC.

### Opción A: Con GitHub Actions (Automático)

Sube el proyecto a tu repositorio de GitHub. El workflow `.github/workflows/android-apk.yml` compilará el APK con Node 22, Temurin JDK 21 y Gradle, y lo dejará disponible en la pestaña **Actions** → Artifacts (`animeav1-apk-debug`).

### Opción B: Localmente

```bash
npm install
npm run android:add     # Solo la primera vez: genera la carpeta android/
npm run android:sync    # Sincroniza la carpeta app/ con el proyecto nativo
npm run android:open    # Abre Android Studio
# o por consola directa:
npm run android:apk     # Genera android/app/build/outputs/apk/debug/app-debug.apk
```

Instalar en tu Android TV o móvil mediante ADB:
```bash
adb connect <IP_DE_TU_TV>:5555
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Funciones principales

- **Búsqueda dinámica en tiempo real:** Conexión con `https://animeav1.com/api/search` (POST `{ query }`) para autocompletado y resultados instantáneos con portadas en alta calidad de `cdn.animeav1.com`.
- **Directorio y Catálogo completo con Filtros:** Navegación por `https://animeav1.com/catalogo` con filtros de género (Acción, Aventura, Shounen, etc.), tipo (TV, Película, OVA), estado (En emisión, Finalizado), orden y selector alfabético A-Z.
- **Nombres visibles y claros:** Tipografía destacada, títulos completos legibles y badges de categoría/episodio tanto en móvil como en Android TV.
- **Reproductor con Auto-Fallback y Descarte Inteligente:**
  - **Filtrado previo:** Descarta enlaces de descarga no reproducibles (`Mega`, `1Fichier`, etc.) y prioriza los servidores de streaming reales (`HLS/Zilla`, `Voe`, `Byse`, `MP4Upload`).
  - **Servidor predeterminado:** Arranca por defecto siempre en **MP4Upload** si está disponible. Si ese falla, el usuario puede elegir manualmente cualquier otra opción (`HLS`, `Voe`, `Byse`) desde los botones inferiores o la pantalla de opciones alternativas.
  - **Botón de cambio rápido:** Botón superior *"Cambiar servidor"* para forzar el cambio en un solo clic si un video se congela.
- **Favoritos e Historial:** Guardado de progreso y animes en IndexedDB local sin cuentas.

```
app/
  index.html, manifest.webmanifest, css/app.css, icons/icon.svg
  src/
    core/         Lógica pura y scraper: scraper.js (selectores y parsing)
    data/         IndexedDB, migraciones de esquema (schema.js), store en memoria (memory.js), idb.js
    services/     Casos de uso: anime, favorites, history, cache
    ui/           Vistas: home, search, detail, player, favorites, history + dom.js (función h)
    main.js       Router SPA y punto de entrada
assets/           Iconos fuente para el launcher (icon-only, icon-foreground, icon-background)
scripts/          Servidor estático (serve.mjs) y generador de iconos (generate-icons.mjs)
tests/            Pruebas con node --test
docs/             ARQUITECTURA.md
.github/          Workflows de compilación APK
```

Más detalle en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).
