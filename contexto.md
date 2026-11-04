# Contexto del Proyecto: AnimeAV1 para Android TV & Mobile

Este documento contiene toda la información técnica, arquitectónica y el estado actual del proyecto para que cualquier desarrollador o IA pueda continuar el trabajo sin fricción.

---

## 1. Visión General del Proyecto

- **Objetivo:** Desarrollar una aplicación nativa para **Smart TV (Android TV / Google TV, probada en televisor TCL 55")** y dispositivos móviles Android, para ver anime en streaming extrayendo contenido directamente desde `https://animeav1.com/`.
- **Filosofía de Arquitectura:** 
  - **Zero client runtime dependencies:** No se usan frameworks pesados (React, Vue, Angular). Todo está escrito en **Vanilla JavaScript modular (ES Modules)**, HTML5 y CSS3 nativo.
  - **Sistema de Diseño:** *Pastel & Liquid Glass* (tonos oscuros, bordes luminosos celestes para el foco TV, tarjetas compactas, sin `backdrop-filter` pesados que sobrecarguen la GPU del televisor).
  - **Empaquetado Nativo:** **Capacitor 7** (`@capacitor/android`, `@capacitor/app`, `@capgo/capacitor-updater`).
  - **Repositorio GitHub:** `https://github.com/xDani-v/anime` (rama `main`).
  - **Compilación Automática:** GitHub Actions genera el APK (`app-debug.apk`) y los bundles de actualización OTA en cada `git push` a `main`.

---

## 2. Estructura de Directorios

```
anime/
├── app/                          # Código fuente de la aplicación Web (empaquetada en Android)
│   ├── css/
│   │   └── app.css               # Estilos globales, paleta Liquid Glass, layout TV y modal de servidores
│   ├── src/
│   │   ├── core/
│   │   │   └── scraper.js        # Parser y scraper de animeav1.com (catálogo, episodios, servidores)
│   │   ├── data/
│   │   │   └── idb.js            # Wrapper nativo IndexedDB (favoritos, historial, caché)
│   │   ├── services/
│   │   │   ├── anime.js          # Capa de servicio de animes
│   │   │   ├── cache.js          # Caché con TTL en IndexedDB
│   │   │   ├── favorites.js      # Gestión de favoritos
│   │   │   ├── history.js        # Historial de reproducción y progreso
│   │   │   ├── index.js          # Punto de unión de servicios
│   │   │   └── updater.js        # Actualizaciones OTA en vivo (@capgo/capacitor-updater)
│   │   ├── ui/
│   │   │   ├── catalogo.js       # Vista catálogo y filtros
│   │   │   ├── detail.js         # Vista detalle de anime y selector de episodios
│   │   │   ├── dom.js            # Helpers mínimos de DOM (h, btn, iconBtn, toast)
│   │   │   ├── favorites.js      # Vista favoritos
│   │   │   ├── history.js        # Vista historial
│   │   │   ├── home.js           # Pantalla de inicio
│   │   │   ├── player.js         # REPRODUCTOR DE VIDEO Y SELECTOR DE SERVIDORES
│   │   │   ├── search.js         # Vista de búsqueda
│   │   │   └── tv.js             # NAVEGACIÓN D-PAD Y CONTROL REMOTO PARA ANDROID TV
│   │   └── main.js               # Router SPA e inicialización
│   ├── index.html                # HTML raíz
│   └── manifest.webmanifest      # Manifiesto PWA
├── scripts/
│   ├── configure-tv-manifest.mjs # Inyecta Leanback, hardwareAccelerated y autoplay en Android
│   ├── generate-icons.mjs        # Generador de iconos desde SVG
│   └── serve.mjs                 # Servidor de desarrollo local (puerto 5174) con proxy CORS
├── tests/                        # 15 tests unitarios e integrados (node --test)
├── .github/workflows/
│   └── android-apk.yml           # CI/CD: Tests -> Bundle OTA -> Gradle assembleDebug -> GitHub Release
├── capacitor.config.json         # Configuración de Capacitor
└── package.json
```

---

## 3. EL PROBLEMA CRÍTICO ACTUAL: "No funcionó el botón para que se reproduzca"

### Descripción del síntoma:
En el televisor TCL Android TV (y también en PC si solo se usa `Enter` en lugar de `Espacio`), al entrar a ver un capítulo:
1. El reproductor carga la página embebida (`<iframe>`) del servidor (por ejemplo, MP4Upload o Zilla Networks).
2. Se ve la imagen del video con el botón de reproducción `>` (o la barra con 0:00).
3. **El usuario pulsa el botón del centro (OK / DPAD_CENTER) en el control remoto de la TV, pero el video NO comienza a reproducirse.**
4. Parece que el reproductor estuviera esperando que se le haga clic con un ratón físico al botón `>`, el cual es inalcanzable con el control remoto.

### Diagnóstico Técnico a Fondo:
1. **Aislamiento por Iframe Cross-Origin (Same-Origin Policy):**
   - Actualmente, los servidores como MP4Upload (`https://www.mp4upload.com/embed-xxxx.html`) o HLS Zilla (`https://player.zilla-networks.com/play/xxxx`) se cargan dentro de una etiqueta `<iframe>`.
   - Por seguridad del navegador (Same-Origin Policy), la ventana padre (`player.js` en `http://localhost:5174` o `https://localhost` en Capacitor) **NO tiene acceso al DOM interno del iframe**. No puede hacer `iframe.contentDocument.querySelector('video').play()`.
2. **Cómo maneja los eventos de teclado el iframe de MP4Upload (Video.js):**
   - MP4Upload utiliza internamente la librería **Video.js** con el plugin `videojs-hotkeys`.
   - En PC con teclado, `videojs-hotkeys` tiene configurada la **Barra Espaciadora (`Space` / keyCode 32)** como atajo para Play/Pausa.
   - En un televisor Smart TV **NO hay barra espaciadora**. El control remoto envía **`DPAD_CENTER` (keyCode 23)** o **`KEYCODE_ENTER` (keyCode 66 / 13)**.
   - Video.js dentro del iframe **ignora por completo el keyCode 23**. Solo responde a clics directos o a `Space`.
3. **Overlay de Anuncios interno en MP4Upload:**
   - En el código fuente HTML de MP4Upload existe este bloque:
     ```html
     <div id="overlayads">
       <iframe id="aa1fa" ... width=310 height=260></iframe>
     </div>
     <script>
       player.on('ready', function() { document.getElementById('overlayads').style.display = 'block'; });
       player.on('play', function() { document.getElementById('overlayads').style.display = 'none'; });
     </script>
     ```
   - Hay una capa transparente/anuncio flotando en medio del reproductor. En una PC con ratón, un clic cierra el anuncio o inicia el play. En la TV con control remoto, el botón central no puede hacer clic en ese elemento.
4. **El manejador actual en `player.js`:**
   - En `app/src/ui/player.js`:
     ```js
     } else {
       const frame = wrap.querySelector('iframe');
       if (frame && (e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 23)) {
         try { frame.focus(); } catch {}
       }
     }
     ```
   - Solo hace `frame.focus()`. Enfocar la etiqueta `<iframe>` no hace que el `<video>` interno comience a reproducirse.

---

## 4. Soluciones Recomendadas para la Siguiente IA

Para resolver definitivamente el problema de reproducción en Smart TV existen 2 caminos principales:

### Estrategia A: Extracción y Reproducción NATIVA (La solución definitiva y más profesional)
En lugar de incrustar iframes de terceros con anuncios y controles incompatibles, extraer la URL real del archivo de video y reproducirla con la etiqueta nativa `<video controls>` de HTML5 o con **Hls.js**.

- **¿Dónde están los videos reales?**
  1. **MP4Upload:**
     - Al consultar el HTML de `https://www.mp4upload.com/embed-j70hobym0b7k.html`, contiene en texto plano:
       `src: "https://a4.mp4upload.com:183/d/xkxzk3fez3b4quuotsrraziqjg6uyrgxnys5hr6s3jy3xbbqslfdlhtxoyjeljeghoezor6k/video.mp4"`
     - **Importante sobre MP4Upload:** Si se pide `video.mp4` directamente sin cabeceras, el servidor `a4.mp4upload.com` responde `HTTP 403 Forbidden`. **Requiere la cabecera `Referer: https://www.mp4upload.com/`**.
     - *Cómo resolver el Referer:*
       - En desarrollo local: usar el proxy ya existente `scripts/serve.mjs` (`/api/proxy?url=...`).
       - En Android nativo: Se puede usar el plugin nativo de Capacitor `@capacitor/filesystem` o configurar `WebViewClient.shouldInterceptRequest` en `MainActivity.java` para inyectar `Referer: https://www.mp4upload.com/`, O usar un plugin nativo de ExoPlayer como `@capgo/native-video-player` o `capacitor-video-player`.
  2. **HLS Directo (FHD) / Zilla Networks:**
     - El iframe es `https://player.zilla-networks.com/play/{id}`.
     - Este reproductor entrega un stream HLS `.m3u8` que puede ser reproducido de forma 100% nativa con `Hls.js` (código ya existente en `player.js`, función `_playHls`).

- **Ventaja de la Estrategia A:**
  - El usuario tiene controles nativos de TV limpios, barra de avance con flechas izquierda/derecha (-10s / +10s), play/pausa instantáneo con el botón OK del control remoto, y cero publicidad o iframes rotos.

---

### Estrategia B: Inyección o Cursor Virtual en Android TV
Si se deben mantener los iframes de terceros:
1. **Inyección de Script en WebView:**
   - En `MainActivity.java`, añadir un `WebViewClient` con `onPageFinished` que inyecte código JavaScript dentro de los iframes para que al recibir `keyCode 23` o `Enter` ejecuten:
     ```js
     document.querySelector('video')?.play();
     document.getElementById('overlayads')?.remove();
     ```
2. **Puntero/Mouse Virtual:**
   - Mapear las flechas del control a un cursor virtual flotante en pantalla y el botón OK a un evento `touch`/`click` en las coordenadas `(x, y)` del puntero.

---

## 5. Componentes Clave Ya Implementados y Funcionando

1. **Navegación TV (`app/src/ui/tv.js`):**
   - Sistema de cuadrícula espacial $O(1)$ sin recálculos pesados de DOM.
   - Manejo centralizado del botón físico Atrás de Android (`handleGlobalBack`) mediante `@capacitor/app`.
   - Soporte para `DPAD_CENTER` (código 23).
   - Doble pulsación de Atrás en Home para salir limpiamente de la app.
2. **Estilos y Rendimiento TV (`app/css/app.css`):**
   - Eliminados todos los `backdrop-filter: blur(...)` pesados y fondos fijos que producían lag en GPUs Mali de televisores TCL.
   - Densidad de cuadrícula adaptada para 55": 6 a 8 tarjetas compactas por fila en lugar de 4 tarjetas gigantes.
3. **Selector Modal de Servidores (`app/src/ui/player.js`):**
   - Tecla rápida `S` o **Flecha Abajo** en el control remoto para desplegar lista de servidores alternativos (MP4Upload, HLS FHD, Voe, Byse, UPNShare).
   - Botón de cierre funcional tanto con clic como con botón Atrás del control.
4. **Sistema de Actualizaciones OTA (`app/src/services/updater.js`):**
   - Plugin `@capgo/capacitor-updater` configurado en modo autónomo contra GitHub Releases.
   - En cada push a `main`, GitHub Actions genera `bundle.zip` y `version.json`.
   - La app en Android TV verifica `https://github.com/xDani-v/anime/releases/latest/download/version.json` a los 4 segundos de iniciar y se actualiza sola en segundo plano.
5. **Configuración Nativa Android (`scripts/configure-tv-manifest.mjs`):**
   - `android.software.leanback` habilitado (categoría `LEANBACK_LAUNCHER`).
   - `android.hardware.touchscreen` opcional (`required="false"`).
   - `android:hardwareAccelerated="true"`.
   - `android:usesCleartextTraffic="true"`.
   - `settings.setMediaPlaybackRequiresUserGesture(false);` en `MainActivity.java` para permitir autoplay.

---

## 6. Comandos de Desarrollo y Verificación

- **Servidor local con proxy CORS:**
  ```bash
  npm run serve
  ```
  Abre `http://localhost:5174/`.
- **Ruta de prueba directa:**
  `http://localhost:5174/watch/sousou-no-frieren-2nd-season/1`
- **Ejecutar suite de tests:**
  ```bash
  npm test
  ```
  (Actualmente 15 tests pasando en `tests/*.test.js`).
- **Sincronizar Capacitor:**
  ```bash
  npx cap sync android
  ```

---

## 7. Instrucciones para la Siguiente IA que tome el proyecto

1. Lee detenidamente la **Sección 3** ("El Problema Crítico Actual") y la **Sección 4** ("Soluciones Recomendadas").
2. Enfócate en **resolver la reproducción en `app/src/ui/player.js`**: la meta es que al pulsar el botón del centro del control remoto (OK / `DPAD_CENTER` / keyCode 23) en un televisor TCL 55", el video comience a reproducirse sin requerir ratón o interacción táctil.
3. Siempre prueba primero en local en `http://localhost:5174/watch/sousou-no-frieren-2nd-season/1` antes de proponer cambios a Git.
4. Mantén la regla de **cero dependencias de cliente** (Vanilla JS modular) y preserva el diseño *Pastel & Liquid Glass*.
