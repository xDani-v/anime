// Configura AndroidManifest.xml para soportar Android TV (Leanback) y móviles a la vez.
import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml');

if (!fs.existsSync(manifestPath)) {
  console.log('No se encontró AndroidManifest.xml (se ejecutará tras cap add android).');
  process.exit(0);
}

let content = fs.readFileSync(manifestPath, 'utf8');

// 1. Añadir uses-feature para Leanback y pantalla táctil opcional (imprescindible para Android TV)
const tvFeatures = `
    <!-- Soporte dual: Móvil y Smart TV (Android TV, Google TV, Fire TV) -->
    <uses-feature android:name="android.software.leanback" android:required="false" />
    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />
`;

if (!content.includes('android.software.leanback')) {
  content = content.replace('<application', `${tvFeatures}\n    <application`);
}

// 2. Banner para la cuadrícula de inicio de Android TV
if (!content.includes('android:banner=')) {
  content = content.replace('<application', '<application android:banner="@mipmap/ic_launcher"');
}

// 3. Añadir categoría LEANBACK_LAUNCHER a MainActivity para que aparezca en el menú de la TV
const leanbackCategory = `
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
            </intent-filter>`;

if (!content.includes('LEANBACK_LAUNCHER')) {
  // Insertar justo antes del cierre del activity principal
  content = content.replace('</activity>', `${leanbackCategory}\n        </activity>`);
}

fs.writeFileSync(manifestPath, content, 'utf8');
console.log('✓ AndroidManifest.xml configurado exitosamente para Android TV + Mobile.');
