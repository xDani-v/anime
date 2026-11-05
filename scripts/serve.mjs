// Servidor estático mínimo para desarrollo local con PROXY CORS integrado.
// Uso: node scripts/serve.mjs [puerto]
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../app', import.meta.url)));
const port = Number(process.argv[2]) || 5174;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.woff2': 'font/woff2',
};

http.createServer(async (req, res) => {
  // CORS Headers universales para desarrollo
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${port}`);

  // Streaming de video con Referer de mp4upload y soporte Range (solo desarrollo)
  if (parsedUrl.pathname === '/api/stream') {
    const targetUrl = parsedUrl.searchParams.get('url');
    if (!targetUrl) { res.writeHead(400).end('Falta parámetro url'); return; }
    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.mp4upload.com/',
      };
      if (req.headers.range) headers.Range = req.headers.range;
      const upstream = await fetch(targetUrl, { headers });
      const out = { 'cache-control': 'no-store' };
      for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const v = upstream.headers.get(k);
        if (v) out[k] = v;
      }
      out['content-type'] = 'video/mp4';
      res.writeHead(upstream.status, out);
      if (!upstream.body) { res.end(); return; }
      const { Readable } = await import('node:stream');
      const stream = Readable.fromWeb(upstream.body);
      res.on('close', () => stream.destroy());
      stream.on('error', () => res.end());
      stream.pipe(res);
    } catch (err) {
      res.writeHead(502).end(`Error stream: ${err.message}`);
    }
    return;
  }

  // Endpoint PROXY para evitar CORS en el navegador durante desarrollo
  if (parsedUrl.pathname === '/api/proxy') {
    const targetUrl = parsedUrl.searchParams.get('url');
    if (!targetUrl) {
      res.writeHead(400, { 'content-type': 'text/plain' }).end('Falta parámetro url');
      return;
    }

    try {
      let reqBody = null;
      if (req.method === 'POST') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        reqBody = Buffer.concat(chunks);
      }

      const upstream = await fetch(targetUrl, {
        method: req.method,
        body: reqBody,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/html, */*',
          'Content-Type': req.headers['content-type'] || 'application/json',
          'Referer': 'https://animeav1.com/',
        }
      });
      const body = await upstream.text();
      res.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(body);
    } catch (err) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' }).end(`Error proxy: ${err.message}`);
    }
    return;
  }

  // Servir archivos estáticos de app/
  let p = normalize(decodeURIComponent(parsedUrl.pathname));
  if (p.endsWith('/') || p.endsWith('\\')) p += 'index.html';
  const file = join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }

  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': types[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    }).end(body);
  } catch {
    // SPA fallback: cualquier ruta desconocida sirve index.html
    try {
      const body = await readFile(join(root, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(body);
    } catch {
      res.writeHead(404).end('No encontrado');
    }
  }
}).listen(port, () => console.log(`AnimeAV1 listo en http://localhost:${port}`));
