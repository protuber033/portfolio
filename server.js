// Kleine statische server: genoeg voor deze site, geen dependencies nodig.
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
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

function stripLeading(value) {
  let out = value;
  while (out.startsWith('/') || out.startsWith(sep)) out = out.slice(1);
  return out;
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  // buiten de sitemap wijzen we niets aan
  const path = join(ROOT, stripLeading(normalize(rel)));
  if (!path.startsWith(ROOT)) {
    res.writeHead(403, { 'content-type': TYPES['.txt'] }).end('Verboden');
    return;
  }

  try {
    const body = await readFile(path);
    const ext = extname(path).toLowerCase();
    res.writeHead(200, {
      'content-type': TYPES[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin'
    }).end(body);
  } catch {
    try {
      const fallback = await readFile(join(ROOT, 'index.html'));
      res.writeHead(404, { 'content-type': TYPES['.html'] }).end(fallback);
    } catch {
      res.writeHead(404, { 'content-type': TYPES['.txt'] }).end('Niet gevonden');
    }
  }
}).listen(PORT, () => console.log('Portfolio draait op poort ' + PORT));
