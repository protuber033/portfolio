// Vier werkende demo's onder één server.
//
// Het idee: iedere bezoeker krijgt zijn eigen kopie van de gegevens. Wie iets
// in een winkelwagen legt of een klus verplaatst, verandert dus niets voor de
// volgende bezoeker. Dat scheelt een database, het kan niets lekken, en het
// maakt de knop "herstel demo" een kwestie van één regel.
//
// Alles staat in het geheugen. Een demo die opnieuw opstart is weer schoon,
// en dat is hier precies de bedoeling.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = process.env.PORT || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

const DEMOS = ['koffie', 'portaal', 'planning', 'vloot'];

// de uitgangssituatie, één keer van schijf gelezen
const ZAAD = Object.fromEntries(DEMOS.map((d) => [
  d, JSON.parse(readFileSync(join(ROOT, 'data', d + '.json'), 'utf8'))
]));

/* ---------- eigen kopie per bezoeker ---------- */

const UUR = 60 * 60 * 1000;
const LEEFTIJD = 3 * UUR;
const MAX_SESSIES = 800;
const sessies = new Map();

function opruimen() {
  const nu = Date.now();
  for (const [id, s] of sessies) if (nu - s.gezien > LEEFTIJD) sessies.delete(id);
  // bij een stormloop de oudste eruit, anders groeit het geheugen ongemerkt
  while (sessies.size > MAX_SESSIES) sessies.delete(sessies.keys().next().value);
}
setInterval(opruimen, 10 * 60 * 1000).unref();

function koekjes(req) {
  const uit = {};
  for (const stuk of String(req.headers.cookie || '').split(';')) {
    const i = stuk.indexOf('=');
    if (i > 0) uit[stuk.slice(0, i).trim()] = decodeURIComponent(stuk.slice(i + 1).trim());
  }
  return uit;
}

function sessieVan(req, res) {
  let id = koekjes(req).demo;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) id = null;
  if (id && !sessies.has(id)) id = null;
  if (!id) {
    id = randomUUID();
    res.setHeader('set-cookie',
      `demo=${id}; Path=/; Max-Age=${LEEFTIJD / 1000}; SameSite=Lax; HttpOnly`);
    sessies.set(id, { gezien: Date.now(), data: {} });
  }
  const s = sessies.get(id);
  s.gezien = Date.now();
  return s;
}

// structuredClone maakt een echte kopie, zodat bewerken van de ene bezoeker
// niet in het zaad terechtkomt
function gegevens(sessie, demo) {
  if (!sessie.data[demo]) sessie.data[demo] = structuredClone(ZAAD[demo]);
  return sessie.data[demo];
}

/* ---------- antwoorden ---------- */

function json(res, waarde, status = 200) {
  const tekst = JSON.stringify(waarde);
  res.writeHead(status, {
    'content-type': TYPES['.json'],
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  }).end(tekst);
}

async function lichaam(req, max = 64 * 1024) {
  const stukken = [];
  let n = 0;
  for await (const stuk of req) {
    n += stuk.length;
    if (n > max) throw new Error('te groot');
    stukken.push(stuk);
  }
  if (!n) return {};
  try { return JSON.parse(Buffer.concat(stukken).toString('utf8')); } catch { return {}; }
}

/* ---------- de vier demo's ---------- */

import { koffie } from './tools/koffie.mjs';
import { portaal } from './tools/portaal.mjs';
import { planning } from './tools/planning.mjs';
import { vloot } from './tools/vloot.mjs';

const AFHANDELAARS = { koffie, portaal, planning, vloot };

/* ---------- statische bestanden ---------- */

const INPAKBAAR = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt']);
const pakket = new Map();

function opschonen(pad) {
  let uit = normalize(pad);
  while (uit.startsWith('/') || uit.startsWith(sep)) uit = uit.slice(1);
  return uit;
}

function magDit(rel) {
  if (rel === 'index.html' || rel === 'robots.txt') return true;
  const eerste = rel.split(/[/\\]/)[0];
  return eerste === 'gedeeld' || DEMOS.includes(eerste);
}

async function statisch(req, res, rel) {
  if (!magDit(rel)) { json(res, { fout: 'niet gevonden' }, 404); return; }
  const pad = join(ROOT, rel);
  if (!pad.startsWith(ROOT)) { json(res, { fout: 'verboden' }, 403); return; }
  try {
    const inhoud = await readFile(pad);
    const ext = extname(pad).toLowerCase();
    const koppen = {
      'content-type': TYPES[ext] || 'application/octet-stream',
      // demo's veranderen vaak; een uur cache betekent dat een bezoeker een
      // oude versie ziet terwijl je net iets hebt aangepast
      'cache-control': ext === '.woff2' || ext === '.webp' || ext === '.png'
        ? 'public, max-age=86400'
        : 'no-cache',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin'
    };
    const mag = INPAKBAAR.has(ext) && inhoud.length > 1024 &&
      /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
    if (mag) {
      if (!pakket.has(rel)) pakket.set(rel, gzipSync(inhoud, { level: 6 }));
      koppen['content-encoding'] = 'gzip';
      koppen.vary = 'accept-encoding';
      res.writeHead(200, koppen).end(pakket.get(rel));
    } else {
      res.writeHead(200, koppen).end(inhoud);
    }
  } catch {
    json(res, { fout: 'niet gevonden' }, 404);
  }
}

/* ---------- de server ---------- */

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let rel = opschonen(decodeURIComponent(url.pathname));

    // api: /api/<demo>/<actie>
    if (url.pathname.startsWith('/api/')) {
      const [, , demo, ...rest] = url.pathname.split('/');
      const afhandelaar = AFHANDELAARS[demo];
      if (!afhandelaar) { json(res, { fout: 'onbekende demo' }, 404); return; }

      const sessie = sessieVan(req, res);
      const data = gegevens(sessie, demo);

      if (rest[0] === 'herstel') {
        sessie.data[demo] = structuredClone(ZAAD[demo]);
        json(res, { hersteld: true });
        return;
      }

      const invoer = req.method === 'POST' ? await lichaam(req) : {};
      const antwoord = await afhandelaar({
        actie: rest.join('/'), methode: req.method, invoer, data, url, res
      });
      if (antwoord === undefined) return;          // de demo heeft zelf geantwoord
      json(res, antwoord.fout ? antwoord : antwoord, antwoord.status || 200);
      return;
    }

    if (rel === '') rel = 'index.html';
    else if (rel.endsWith('/') || rel.endsWith(sep)) rel += 'index.html';
    else if (!extname(rel)) rel = join(rel, 'index.html');

    await statisch(req, res, rel);
  } catch (e) {
    if (!res.headersSent) json(res, { fout: 'er ging iets mis' }, 500);
    else res.end();
  }
}).listen(PORT, () => console.log('Demo\'s draaien op poort ' + PORT));
