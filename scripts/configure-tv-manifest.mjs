// Configura AndroidManifest.xml para soportar Android TV (Leanback), móviles y red completa.
import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml');

if (!fs.existsSync(manifestPath)) {
  console.log('No se encontró AndroidManifest.xml (se ejecutará tras cap add android).');
  process.exit(0);
}

let content = fs.readFileSync(manifestPath, 'utf8');

// 1. Permisos de red e Internet (imprescindibles para streaming y consultas)
const networkPermissions = `
    <!-- Permisos de red para consultas a AnimeAV1 y streaming -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
`;

if (!content.includes('android.permission.INTERNET')) {
  content = content.replace('<application', `${networkPermissions}\n    <application`);
}

// 2. Soporte dual: Móvil y Smart TV (Android TV, Google TV, Fire TV)
const tvFeatures = `
    <!-- Soporte dual: Móvil y Smart TV (permite instalar en pantallas sin touchscreen) -->
    <uses-feature android:name="android.software.leanback" android:required="false" />
    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />
`;

if (!content.includes('android.software.leanback')) {
  content = content.replace('<application', `${tvFeatures}\n    <application`);
}

// 3. Habilitar tráfico cleartext HTTP (muchos servidores de video y CDN de imágenes usan HTTP)
if (!content.includes('android:usesCleartextTraffic')) {
  content = content.replace('<application', '<application android:usesCleartextTraffic="true"');
}

// 4. Aceleración por hardware para fluidez 60 FPS en Android TV
if (!content.includes('android:hardwareAccelerated')) {
  content = content.replace('<application', '<application android:hardwareAccelerated="true"');
}

// 5. Banner para la cuadrícula de inicio de Android TV
if (!content.includes('android:banner=')) {
  content = content.replace('<application', '<application android:banner="@mipmap/ic_launcher"');
}

// 6. Añadir categoría LEANBACK_LAUNCHER a MainActivity para que aparezca en el menú de la TV
const leanbackCategory = `
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
            </intent-filter>`;

if (!content.includes('LEANBACK_LAUNCHER')) {
  content = content.replace('</activity>', `${leanbackCategory}\n        </activity>`);
}

fs.writeFileSync(manifestPath, content, 'utf8');
console.log('✓ AndroidManifest.xml configurado exitosamente para Android TV + Mobile + Network.');

// 7. Configurar MainActivity.java para autoplay de video sin requerir gestos táctiles
const activityPath = path.resolve('android/app/src/main/java/com/animeav1/app/MainActivity.java');
if (fs.existsSync(activityPath)) {
  let actContent = fs.readFileSync(activityPath, 'utf8');
  if (!actContent.includes('setMediaPlaybackRequiresUserGesture')) {
    actContent = actContent.replace(
      'public class MainActivity extends BridgeActivity {',
      `public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            android.webkit.WebView webView = this.bridge.getWebView();
            android.webkit.WebSettings settings = webView.getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }`
    );
    fs.writeFileSync(activityPath, actContent, 'utf8');
    console.log('✓ MainActivity.java configurado para autoplay de video sin gestos táctiles.');
  }

  // 8. Inyectar Referer de mp4upload.com en las peticiones <video> (sin él el CDN responde 403)
  actContent = fs.readFileSync(activityPath, 'utf8');
  if (!actContent.includes('shouldInterceptRequest')) {
    actContent = actContent.replace(
      'settings.setMediaPlaybackRequiresUserGesture(false);',
      `settings.setMediaPlaybackRequiresUserGesture(false);
            final com.getcapacitor.Bridge br = this.bridge;
            br.setWebViewClient(new com.getcapacitor.BridgeWebViewClient(br) {
                @Override
                public android.webkit.WebResourceResponse shouldInterceptRequest(android.webkit.WebView view, android.webkit.WebResourceRequest request) {
                    android.net.Uri u = request.getUrl();
                    String host = u.getHost();
                    String path = u.getPath();
                    if (host != null && host.endsWith("mp4upload.com") && path != null && path.endsWith(".mp4")) {
                        try {
                            java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(u.toString()).openConnection();
                            c.setRequestProperty("Referer", "https://www.mp4upload.com/");
                            c.setRequestProperty("User-Agent", request.getRequestHeaders().containsKey("User-Agent") ? request.getRequestHeaders().get("User-Agent") : "Mozilla/5.0");
                            String range = request.getRequestHeaders().get("Range");
                            if (range != null) c.setRequestProperty("Range", range);
                            c.setConnectTimeout(15000);
                            c.setReadTimeout(30000);
                            int code = c.getResponseCode();
                            java.util.Map<String, String> h = new java.util.HashMap<>();
                            String[] keys = {"Content-Length", "Content-Range", "Accept-Ranges"};
                            for (String k : keys) { String v = c.getHeaderField(k); if (v != null) h.put(k, v); }
                            h.put("Access-Control-Allow-Origin", "*");
                            String reason = code == 206 ? "Partial Content" : (code == 200 ? "OK" : "Error");
                            return new android.webkit.WebResourceResponse("video/mp4", null, code, reason, h,
                                code >= 400 ? c.getErrorStream() : c.getInputStream());
                        } catch (Exception ex) {
                            ex.printStackTrace();
                        }
                    }
                    return super.shouldInterceptRequest(view, request);
                }
            });`
    );
    fs.writeFileSync(activityPath, actContent, 'utf8');
    console.log('✓ MainActivity.java: Referer de mp4upload inyectado vía shouldInterceptRequest.');
  }
}
