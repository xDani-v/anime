// Generador de PNG válidos de 512x512 nativo sin dependencias (usando node:zlib)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createPng(width, height, getPixel) {
  // Signature PNG
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);   // bit depth: 8
  ihdr.writeUInt8(6, 9);   // color type: 6 (RGBA)
  ihdr.writeUInt8(0, 10);  // compression: 0
  ihdr.writeUInt8(0, 11);  // filter: 0
  ihdr.writeUInt8(0, 12);  // interlace: 0
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Raw image scanlines: cada fila empieza con un byte de filtro (0)
  const raw = Buffer.alloc(height * (width * 4 + 1));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }

  // IDAT chunk
  const compressed = zlib.deflateSync(raw);
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(8 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// Tabla CRC32
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Directorio assets/
const outDir = path.resolve('assets');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// 1. icon-background.png: fondo oscuro degradado
const bgPng = createPng(512, 512, (x, y, w, h) => {
  const d = Math.sqrt(Math.pow(x - w / 2, 2) + Math.pow(y - h / 2, 2)) / (w / 1.4);
  const v = Math.max(12, Math.min(28, Math.round(28 - d * 16)));
  return [v, v, v + 2, 255];
});
fs.writeFileSync(path.join(outDir, 'icon-background.png'), bgPng);

// 2. icon-foreground.png: triángulo de play rojo transparente en los bordes
const fgPng = createPng(512, 512, (x, y, w, h) => {
  // Círculo central o triángulo
  const cx = 256, cy = 256;
  const dx = x - cx, dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Anillo
  if (dist >= 170 && dist <= 190) {
    return [230, 57, 70, 255];
  }

  // Triángulo Play: x entre 200 y 350, y relativo a x
  if (x >= 210 && x <= 340) {
    const halfH = (x - 210) * 0.7;
    if (Math.abs(y - 256) <= halfH + 2) {
      return [230, 57, 70, 255];
    }
  }

  return [0, 0, 0, 0];
});
fs.writeFileSync(path.join(outDir, 'icon-foreground.png'), fgPng);

// 3. icon-only.png: icono completo compuesto
const onlyPng = createPng(512, 512, (x, y, w, h) => {
  const [fr, fg, fb, fa] = [
    ...((x >= 210 && x <= 340 && Math.abs(y - 256) <= (x - 210) * 0.7 + 2) ||
        (Math.sqrt((x - 256) ** 2 + (y - 256) ** 2) >= 170 && Math.sqrt((x - 256) ** 2 + (y - 256) ** 2) <= 190))
      ? [230, 57, 70, 255]
      : [0, 0, 0, 0]
  ];
  if (fa === 255) return [fr, fg, fb, 255];
  const d = Math.sqrt(Math.pow(x - w / 2, 2) + Math.pow(y - h / 2, 2)) / (w / 1.4);
  const v = Math.max(14, Math.min(28, Math.round(28 - d * 14)));
  return [v, v, v + 2, 255];
});
fs.writeFileSync(path.join(outDir, 'icon-only.png'), onlyPng);

console.log('Iconos PNG generados exitosamente en assets/.');
