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

async function schiet(url, scroll, naar) {
  const { targetId } = await stuur('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await stuur('Target.attachToTarget', { targetId, flatten: true });
  try {
    await stuur('Page.enable', {}, sessionId);
    await stuur('Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false }, sessionId);
    await stuur('Page.navigate', { url }, sessionId);
    await wacht(9000);
    try { await stuur('Runtime.evaluate', { expression: OPSCHONEN, returnByValue: true }, sessionId); } catch { /* geeft niet */ }
    if (scroll) {
      await stuur('Runtime.evaluate', { expression: `window.scrollTo(0,${scroll})` }, sessionId);
      await wacht(1600);
    }
    await wacht(800);
    const opname = await stuur('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
    writeFileSync(naar, Buffer.from(opname.data, 'base64'));
    return true;
  } catch (e) {
    console.log('  mislukt:', e.message);
    return false;
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
  const posities = [0, 1500, 3000];
  const beelden = [];
  for (let i = 0; i < posities.length; i++) {
    const ruw = join(RUW, `${p.id}-${i + 1}.png`);
    const gelukt = await schiet(p.url, posities[i], ruw);
    if (!gelukt) continue;
    const bestand = `${p.id}-${i + 1}.webp`;
    await sharp(ruw).resize({ width: 1400, withoutEnlargement: true })
      .webp({ quality: 72 }).toFile(join(IMG, bestand));
    // klein formaat voor de showcase bovenaan de pagina
    await sharp(ruw).resize({ width: 440 })
      .webp({ quality: 64 }).toFile(join(IMG, 'm-' + bestand));
    beelden.push({
      bestand,
      titel: i === 0 ? 'homepage' : `sectie ${i + 1}`,
      bijschrift: i === 0 ? 'De pagina zoals een bezoeker hem ziet.' : 'Verder op de pagina.',
      alt: `Schermafbeelding van ${p.naam}.`
    });
    if (i === 0) {
      const tegel = `t-${p.id}.webp`;
      await sharp(ruw).resize({ width: 760 }).webp({ quality: 66 }).toFile(join(IMG, tegel));
      p.tegel = tegel;
    }
    gemaakt++;
  }
  if (beelden.length && (!p.beelden || !p.beelden.length || alles)) p.beelden = beelden;
}

ws.close();
if (proces) { try { proces.kill(); } catch { /* al weg */ } }

writeFileSync(join(WORTEL, 'data/projects.json'), JSON.stringify(projecten, null, 2) + '\n');
console.log(`\n${gemaakt} schermafbeelding(en) gemaakt.`);
if (gemaakt) console.log('Bijschriften staan er standaard in — pas ze aan in data/projects.json als je iets beters weet.');
process.exit(0);
