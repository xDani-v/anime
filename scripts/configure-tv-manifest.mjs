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
