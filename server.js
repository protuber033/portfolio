// Kleine statische server zonder dependencies. Serveert alleen de pagina,
// de beelden en robots.txt — data/ en tools/ blijven binnenskamers.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanStroom } from './tools/sitescan.mjs';
import { beheerRoute } from './tools/beheer-routes.mjs';
import { gzipSync, brotliCompressSync, constants as zlibConstants } from 'node:zlib';

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

/* De sitescan achter de contactpagina. Hij haalt op verzoek een vreemde site
   op, dus hij is begrensd: een bezoeker mag er een handvol per tien minuten,
   anders is het een gratis meetdienst voor iemand anders. De toetsing van het
   adres zelf zit in tools/sitescan.mjs. */
const scanGeheugen = new Map();
const SCAN_MAX = 12;
const SCAN_VENSTER = 10 * 60 * 1000;

function magScannen(ip) {
  const nu = Date.now();
  const eerder = (scanGeheugen.get(ip) || []).filter((t) => nu - t < SCAN_VENSTER);
  if (eerder.length >= SCAN_MAX) return false;
  eerder.push(nu);
  if (scanGeheugen.size > 5000) scanGeheugen.clear();
  scanGeheugen.set(ip, eerder);
  return true;
}

function bezoekerIP(req) {
  const doorgegeven = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return doorgegeven || req.socket.remoteAddress || 'onbekend';
}

async function scanAfhandelen(req, res, url) {
  const adres = (url.searchParams.get('url') || '').trim();
  const regel = (o) => res.write(JSON.stringify(o) + '\n');

  if (!adres || adres.length > 300) {
    res.writeHead(400, { 'content-type': 'application/x-ndjson; charset=utf-8' });
    regel({ soort: 'fout', bericht: 'Vul een webadres in, bijvoorbeeld jouwbedrijf.nl' });
    res.end();
    return;
  }
  if (!magScannen(bezoekerIP(req))) {
    res.writeHead(429, { 'content-type': 'application/x-ndjson; charset=utf-8' });
    regel({ soort: 'fout', bericht: 'Je hebt er net een paar achter elkaar gedaan. Over tien minuten mag het weer.' });
    res.end();
    return;
  }

  res.writeHead(200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-accel-buffering': 'no'
  });

  let weg = false;
  req.on('close', () => { weg = true; });

  try {
    for await (const gebeurtenis of scanStroom(adres)) {
      if (weg) return;
      regel(gebeurtenis);
    }
  } catch {
    if (!weg) regel({ soort: 'fout', bericht: 'Er ging iets mis tijdens het kijken. Probeer het zo nog eens.' });
  }
  if (!weg) res.end();
}

function opschonen(pad) {
  let uit = normalize(pad);
  while (uit.startsWith('/') || uit.startsWith(sep)) uit = uit.slice(1);
  return uit;
}

function magDit(rel) {
  if (rel === 'index.html' || rel === 'robots.txt' || rel === 'sitemap.xml') return true;
  if (rel.startsWith('img' + sep) || rel.startsWith('img/')) return true;
  // werk/<project>/index.html: elk project heeft ook een eigen adres
  if (rel.startsWith('werk' + sep) || rel.startsWith('werk/')) return true;
  if (rel.startsWith('contact' + sep) || rel.startsWith('contact/')) return true;
  // de beheerpagina zelf is gewoon een pagina; wat erachter zit is dicht
  return rel.startsWith('beheer' + sep) || rel.startsWith('beheer/');
}

async function pagina() {
  return readFile(join(ROOT, 'index.html'));
}

/* Tekst ingepakt versturen. Html, css en javascript worden drie tot vijf keer
   kleiner; beelden zijn al gecomprimeerd en worden daarom overgeslagen. De
   uitkomst wordt onthouden, want de bestanden veranderen niet terwijl de
   server draait. */
const INPAKBAAR = new Set(['.html', '.txt', '.xml', '.svg', '.json', '.css', '.js']);
const pakket = new Map();

function inpakken(rel, ext, inhoud, accepteert) {
  if (!INPAKBAAR.has(ext) || inhoud.length < 1024) return null;
  const vorm = /\bbr\b/.test(accepteert) ? 'br' : /\bgzip\b/.test(accepteert) ? 'gzip' : null;
  if (!vorm) return null;
  const sleutel = vorm + ':' + rel;
  if (!pakket.has(sleutel)) {
    pakket.set(sleutel, vorm === 'br'
      ? brotliCompressSync(inhoud, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } })
      : gzipSync(inhoud, { level: 6 }));
  }
  return { vorm, inhoud: pakket.get(sleutel) };
}

/* Node stopt bij een fout die uit een async verzoekafhandelaar ontsnapt het
   hele proces. Eén verkeerd verzoek zou de site dus platleggen. Daarom gaat
   alles door deze mantel heen: wat er ook misgaat, de bezoeker krijgt een 500
   en de server blijft staan. */
createServer((req, res) => {
  afhandelen(req, res).catch((err) => {
    console.error('verzoek mislukt: ' + err.message);
    if (!res.headersSent) res.writeHead(500, { 'content-type': TYPES['.txt'] });
    res.end('Er ging iets mis.');
  });
}).listen(PORT, () => console.log('Portfolio draait op poort ' + PORT));

async function afhandelen(req, res) {
  // www en zonder www zijn voor een zoekmachine twee adressen met dezelfde
  // inhoud. We sturen www door, dan is er één versie die meetelt.
  const host = String(req.headers.host || '');
  if (host.toLowerCase().startsWith('www.')) {
    res.writeHead(301, { location: 'https://' + host.slice(4) + req.url }).end();
    return;
  }

  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/scan') {
    await scanAfhandelen(req, res, url);
    return;
  }

  if (url.pathname.startsWith('/api/beheer')) {
    await beheerRoute(req, res, url);
    return;
  }

  let rel = opschonen(decodeURIComponent(url.pathname));
  if (rel === '') rel = 'index.html';
  // een map vraagt om zijn index.html — /werk/glacio/ net als /werk/glacio
  else if (rel.endsWith('/') || rel.endsWith(sep)) rel += 'index.html';
  else if (!extname(rel)) rel = join(rel, 'index.html');

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
    const ingepakt = inpakken(rel, ext, inhoud, String(req.headers['accept-encoding'] || ''));
    const koppen = {
      'content-type': TYPES[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin'
    };
    if (ingepakt) {
      koppen['content-encoding'] = ingepakt.vorm;
      koppen.vary = 'accept-encoding';
    }
    /* De beheerpagina mag niet in de lijst van iemand anders hangen: anders
       kan een vreemde pagina hem onzichtbaar over zijn eigen knoppen leggen en
       jou op "versturen" laten klikken terwijl je iets anders denkt aan te
       raken. En hij hoort nergens in een geschiedenis thuis. */
    if (rel.startsWith('beheer')) {
      koppen['x-frame-options'] = 'DENY';
      koppen['content-security-policy'] = "frame-ancestors 'none'";
      koppen['referrer-policy'] = 'no-referrer';
      koppen['cache-control'] = 'no-store';
    }
    res.writeHead(200, koppen).end(ingepakt ? ingepakt.inhoud : inhoud);
  } catch {
    try {
      res.writeHead(404, { 'content-type': TYPES['.html'] }).end(await pagina());
    } catch {
      res.writeHead(404, { 'content-type': TYPES['.txt'] }).end('Niet gevonden');
    }
  }
}
