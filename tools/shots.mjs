// Maakt screenshots van elk project met een live adres en zet ze klaar in img/.
//
//   npm run shots           alleen wat nog ontbreekt
//   npm run shots -- alles  alles opnieuw
//
// Cookiebanners worden vóór de opname uit de pagina gehaald, zodat je de site ziet
// en niet het toestemmingsvenster.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const alles = process.argv.includes('alles');

const CHROME_PADEN = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
];
const CHROME = CHROME_PADEN.find((p) => existsSync(p));
const POORT = 9223;

function laadSharp() {
  const pogingen = ['sharp', 'C:/Users/mstic/Desktop/funstudios/node_modules/sharp'];
  for (const p of pogingen) {
    try { return require(p); } catch { /* volgende */ }
  }
  return null;
}

const sharp = laadSharp();
if (!CHROME) { console.error('Geen Chrome of Edge gevonden.'); process.exit(1); }
if (!sharp) { console.error('sharp ontbreekt. Draai eerst: npm install -D sharp'); process.exit(1); }

const projecten = JSON.parse(readFileSync(join(WORTEL, 'data/projects.json'), 'utf8'));
const IMG = join(WORTEL, 'img');
const RUW = join(WORTEL, '.ruw');
if (!existsSync(IMG)) mkdirSync(IMG, { recursive: true });
if (!existsSync(RUW)) mkdirSync(RUW, { recursive: true });

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

const OPSCHONEN = `
(() => {
  const rx = /cookie|cookies|toestemming|consent|privacyverklaring/i;
  const weg = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 60) continue;
    if (rx.test((el.textContent || '').slice(0, 600))) weg.push(el);
  }
  weg.forEach(el => el.remove());
  document.querySelectorAll('[role="dialog"],[aria-modal="true"]').forEach(el => {
    if (rx.test(el.textContent || '')) el.remove();
  });
  document.body.style.overflow = '';
  return weg.length;
})()`;

async function verbind() {
  const peil = async () => {
    try {
      const r = await fetch('http://127.0.0.1:' + POORT + '/json/version');
      return await r.json();
    } catch { return null; }
  };
  let versie = await peil();
  let proces = null;
  if (!versie) {
    proces = spawn(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
      '--no-first-run', '--disable-extensions', '--mute-audio',
      '--remote-debugging-port=' + POORT,
      '--user-data-dir=' + join(RUW, 'chrome-profiel'),
      'about:blank'
    ], { stdio: 'ignore', detached: true });
    proces.unref();
    for (let i = 0; i < 40 && !versie; i++) { await wacht(500); versie = await peil(); }
  }
  if (!versie) throw new Error('Chrome kwam niet op');
  return { versie, proces };
}

const { versie, proces } = await verbind();
const ws = new WebSocket(versie.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let teller = 0;
const wachtend = new Map();
ws.onmessage = (ev) => {
  const bericht = JSON.parse(ev.data);
  if (bericht.id && wachtend.has(bericht.id)) {
    const { res, rej } = wachtend.get(bericht.id);
    wachtend.delete(bericht.id);
    bericht.error ? rej(new Error(bericht.error.message)) : res(bericht.result);
  }
};
const stuur = (methode, params, sessie) => new Promise((res, rej) => {
  const id = ++teller;
  wachtend.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method: methode, params: params || {}, sessionId: sessie }));
});

/* Keuring van een opname.
   Vaste scrollposities schoten bij korte pagina's in de leegte onder de
   inhoud: drie keer wit, twee keer identiek. Daarom meten we nu eerst hoe
   lang de pagina echt is, en keuren we elke opname voordat hij blijft staan. */
const ZICHT = 900;

async function keur(png) {
  const { data } = await sharp(png).resize(16, 16, { fit: 'fill' })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let wit = 0, helder = 0;
  const vinger = [];
  for (let i = 0; i < data.length; i += 3) {
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    if (max > 235 && max - min < 14) wit++;
    helder += (data[i] + data[i + 1] + data[i + 2]) / 3;
    vinger.push(Math.round((data[i] + data[i + 1] + data[i + 2]) / 3 / 16));
  }
  const n = data.length / 3;
  // de helderheid gaat mee naar projects.json: daarmee zet de bouw de band
  // om en om licht en donker in plaats van drie lichte schermen op een rij
  return { witDeel: (wit / n) * 100, licht: Math.round(helder / n / 2.55), vinger };
}

// Alleen bijna-identieke opnamen weren. Te streng en je houdt van een
// eenpagina-site maar één beeld over, terwijl de secties eronder wel
// degelijk verschillen; te soepel en je krijgt drie keer hetzelfde.
const lijktOp = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) < 60;

// Opent de pagina één keer en maakt daar alle opnamen in, op posities die bij
// de werkelijke lengte passen. Scheelt ook twee keer opnieuw laden.
async function schietAlles(url, maak) {
  const { targetId } = await stuur('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await stuur('Target.attachToTarget', { targetId, flatten: true });
  const gelukt = [];
  try {
    await stuur('Page.enable', {}, sessionId);
    await stuur('Emulation.setDeviceMetricsOverride',
      { width: 1440, height: ZICHT, deviceScaleFactor: 2, mobile: false }, sessionId);
    await stuur('Page.navigate', { url }, sessionId);
    await wacht(9000);
    try { await stuur('Runtime.evaluate', { expression: OPSCHONEN, returnByValue: true }, sessionId); } catch { /* geeft niet */ }

    const meting = await stuur('Runtime.evaluate',
      { expression: 'document.documentElement.scrollHeight', returnByValue: true }, sessionId);
    const hoogte = Number(meting?.result?.value) || ZICHT;
    const max = Math.max(0, hoogte - ZICHT);

    // korte pagina? dan is één scherm werkelijk alles wat er is
    const posities = max < 300 ? [0]
      : max < 1500 ? [0, max]
        : [0, Math.round(max * 0.40), Math.round(max * 0.75)];

    const gezien = [];
    for (const [i, pos] of posities.entries()) {
      // een lege plek? dan een stukje hoger proberen, daar staat meestal wel iets
      for (const poging of [pos, Math.max(0, pos - 450)]) {
        await stuur('Runtime.evaluate', { expression: `window.scrollTo(0,${poging})` }, sessionId);
        await wacht(poging === 0 ? 800 : 1500);
        const opname = await stuur('Page.captureScreenshot',
          { format: 'png', captureBeyondViewport: false }, sessionId);
        const png = Buffer.from(opname.data, 'base64');
        const { witDeel, licht, vinger } = await keur(png);

        if (witDeel > 88) { if (poging !== pos) console.log(`  positie ${pos}px: leeg, overgeslagen`); continue; }
        if (gezien.some((v) => lijktOp(v, vinger))) { if (poging !== pos) console.log(`  positie ${pos}px: zelfde als een eerdere, overgeslagen`); continue; }

        gezien.push(vinger);
        gelukt.push(await maak(png, i, gelukt.length, licht));
        break;
      }
    }
    return gelukt;
  } catch (e) {
    console.log('  mislukt:', e.message);
    return gelukt;
  } finally {
    await stuur('Target.closeTarget', { targetId });
  }
}

let gemaakt = 0;
for (const p of projecten) {
  if (!p.url) continue;
  const compleet = (p.beelden || []).length > 0 &&
    p.beelden.every((b) => existsSync(join(IMG, b.bestand))) &&
    p.tegel && existsSync(join(IMG, p.tegel));
  if (compleet && !alles) continue;

  console.log(`${p.naam} — schermen maken van ${p.url}`);
  const beelden = await schietAlles(p.url, async (png, _pos, nr, licht) => {
    const ruw = join(RUW, `${p.id}-${nr + 1}.png`);
    writeFileSync(ruw, png);
    const bestand = `${p.id}-${nr + 1}.webp`;
    await sharp(ruw).resize({ width: 1400, withoutEnlargement: true })
      .webp({ quality: 72 }).toFile(join(IMG, bestand));
    // klein formaat voor de band bovenaan de pagina
    await sharp(ruw).resize({ width: 440 })
      .webp({ quality: 64 }).toFile(join(IMG, 'm-' + bestand));
    if (nr === 0) {
      const tegel = `t-${p.id}.webp`;
      await sharp(ruw).resize({ width: 760 }).webp({ quality: 66 }).toFile(join(IMG, tegel));
      p.tegel = tegel;
    }
    gemaakt++;
    // Een zelfgeschreven bijschrift is meer waard dan "sectie 2". Staat er al
    // een tekst bij dit bestand, dan houden we die — anders ben je ze elke
    // keer kwijt als je opnieuw schiet.
    const oud = (p.beelden || []).find((b) => b.bestand === bestand);
    return {
      bestand,
      licht,
      titel: oud?.titel || (nr === 0 ? 'homepage' : `sectie ${nr + 1}`),
      bijschrift: oud?.bijschrift || (nr === 0 ? 'De pagina zoals een bezoeker hem ziet.' : 'Verder op de pagina.'),
      alt: oud?.alt || `Schermafbeelding van ${p.naam}.`
    };
  });
  console.log(`  ${beelden.length} bruikbare opname(n)`);
  if (beelden.length && (!p.beelden || !p.beelden.length || alles)) p.beelden = beelden;
}

ws.close();
if (proces) { try { proces.kill(); } catch { /* al weg */ } }

writeFileSync(join(WORTEL, 'data/projects.json'), JSON.stringify(projecten, null, 2) + '\n');
console.log(`\n${gemaakt} schermafbeelding(en) gemaakt.`);
if (gemaakt) console.log('Bijschriften staan er standaard in — pas ze aan in data/projects.json als je iets beters weet.');
process.exit(0);
