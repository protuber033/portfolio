// Kleine statische server: genoeg voor deze site, geen dependencies nodig.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
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

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  // buiten de sitemap wijzen we niets aan
  const path = join(ROOT, normalize(rel).replace(/^([/\])+/, ''));
  if (!path.startsWith(ROOT)) {
    res.writeHead(403).end('Verboden');
    return;
  }

  try {
    const body = await readFile(path);
    const type = TYPES[extname(path).toLowerCase()] || 'application/octet-stream';
    const cache = extname(path) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable';
    res.writeHead(200, {
      'content-type': type,
      'cache-control': cache,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin'
    }).end(body);
  } catch {
    const fallback = await readFile(join(ROOT, 'index.html'));
    res.writeHead(404, { 'content-type': TYPES['.html'] }).end(fallback);
  }
}).listen(PORT, () => console.log('Portfolio draait op poort ' + PORT));
