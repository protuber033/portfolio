// Kleine statische server zonder dependencies. Serveert alleen de pagina,
// de beelden en robots.txt — data/ en tools/ blijven binnenskamers.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = process.env.PORT || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

function opschonen(pad) {
  let uit = normalize(pad);
  while (uit.startsWith('/') || uit.startsWith(sep)) uit = uit.slice(1);
  return uit;
}

function magDit(rel) {
  if (rel === 'index.html' || rel === 'robots.txt') return true;
  return rel.startsWith('img' + sep) || rel.startsWith('img/');
}

async function pagina() {
  return readFile(join(ROOT, 'index.html'));
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let rel = opschonen(decodeURIComponent(url.pathname));
  if (rel === '') rel = 'index.html';

  if (!magDit(rel)) {
    res.writeHead(404, { 'content-type': TYPES['.html'] }).end(await pagina());
    return;
  }

  const pad = join(ROOT, rel);
  if (!pad.startsWith(ROOT)) {
    res.writeHead(403, { 'content-type': TYPES['.txt'] }).end('Verboden');
    return;
  }

  try {
    const inhoud = await readFile(pad);
    const ext = extname(pad).toLowerCase();
    res.writeHead(200, {
      'content-type': TYPES[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin'
    }).end(inhoud);
  } catch {
    try {
      res.writeHead(404, { 'content-type': TYPES['.html'] }).end(await pagina());
    } catch {
      res.writeHead(404, { 'content-type': TYPES['.txt'] }).end('Niet gevonden');
    }
  }
}).listen(PORT, () => console.log('Portfolio draait op poort ' + PORT));
