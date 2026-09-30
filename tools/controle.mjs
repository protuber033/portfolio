// Controleert de boel vóór je iets live zet.
//
//   npm run check          alles behalve het internet
//   npm run check -- net   ook of je live adressen nog antwoorden
//
// Elke controle hier bestaat omdat het een keer écht misging.
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { structuur, taal } from './naloop.mjs';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const metNet = process.argv.includes('net');

let fouten = 0;
let waarschuwingen = 0;

const ok = (t) => console.log(`  ok    ${t}`);
const fout = (t) => { console.log(`  FOUT  ${t}`); fouten++; };
const let_op = (t) => { console.log(`  let op ${t}`); waarschuwingen++; };
const kop = (t) => console.log(`\n${t}`);

/* ---------------------------------------------------------------
   1. Data: klopt projects.json met zichzelf?
   Waarom: een typfout hier levert een halve pagina op zonder dat
   iets klaagt.
---------------------------------------------------------------- */
kop('Gegevens');
const projecten = JSON.parse(readFileSync(join(WORTEL, 'data/projects.json'), 'utf8'));
const site = JSON.parse(readFileSync(join(WORTEL, 'data/site.json'), 'utf8'));

const statussen = new Set(site.groepen.map((g) => g.sleutel));
const gezien = new Set();
const verplicht = ['id', 'naam', 'status', 'statusLabel', 'periode', 'eersteDag', 'laatsteDag', 'eenRegel', 'voorWie'];

for (const p of projecten) {
  const waar = p.id || p.naam || '(naamloos)';
  for (const veld of verplicht) {
    if (!p[veld]) fout(`${waar}: veld "${veld}" ontbreekt`);
  }
  if (gezien.has(p.id)) fout(`${waar}: deze id komt twee keer voor`);
  gezien.add(p.id);

  if (!statussen.has(p.status)) {
    fout(`${waar}: status "${p.status}" hoort bij geen enkele groep in site.json`);
  }
  for (const d of ['eersteDag', 'laatsteDag']) {
    if (p[d] && !/^\d{4}-\d{2}-\d{2}$/.test(p[d])) fout(`${waar}: ${d} "${p[d]}" is geen datum`);
  }
  if (p.eersteDag && p.laatsteDag && p.eersteDag > p.laatsteDag) {
    fout(`${waar}: eersteDag ligt na laatsteDag`);
  }
  if (p.url && !/^https?:\/\//.test(p.url)) fout(`${waar}: url begint niet met http`);
  if (p.url && !p.urlLabel) fout(`${waar}: url zonder urlLabel, dan krijgt de knop geen tekst`);
  if (p.concept) let_op(`${waar}: staat nog als concept, komt niet op de site`);
  if (!p.beelden?.length && !p.tegelTekst) {
    let_op(`${waar}: geen schermen en geen vervangende tekst, de tegel blijft leeg`);
  }
}
if (!fouten) ok(`${projecten.length} projecten, alle velden aanwezig`);

/* ---------------------------------------------------------------
   2. Beelden: bestaat alles waar de pagina naar wijst?
   Waarom: ik heb een keer gepubliceerd met ontbrekende tegels.
---------------------------------------------------------------- */
kop('Beelden');
const aanwezig = new Set(readdirSync(join(WORTEL, 'img')));
let mis = 0;
for (const p of projecten) {
  if (p.tegel && !aanwezig.has(p.tegel)) { fout(`${p.id}: tegel ${p.tegel} ontbreekt`); mis++; }
  for (const b of p.beelden || []) {
    if (!aanwezig.has(b.bestand)) { fout(`${p.id}: ${b.bestand} ontbreekt`); mis++; }
    if (b.showcase !== false && !aanwezig.has('m-' + b.bestand)) {
      fout(`${p.id}: m-${b.bestand} ontbreekt (nodig voor de band bovenaan)`);
      mis++;
    }
    if (!b.alt) let_op(`${p.id}: ${b.bestand} heeft geen alt-tekst`);
  }
}
if (!mis) ok(`${aanwezig.size} bestanden in img/, alles waarnaar verwezen wordt bestaat`);

/* ---------------------------------------------------------------
   3. Syntax: valt er iets om vóór het de server raakt?
   Waarom: een kapotte regex in server.js liet Railway crashen.
---------------------------------------------------------------- */
kop('Syntax');
const teControleren = ['server.js', 'tools/build.mjs', 'tools/scan.mjs', 'tools/shots.mjs', 'tools/controle.mjs', 'tools/gedrag.js', 'tools/werkpagina.js',
  'tools/sitescan.mjs', 'tools/contactpagina.mjs', 'tools/contact.js'];
for (const bestand of teControleren) {
  const pad = join(WORTEL, bestand);
  if (!existsSync(pad)) { let_op(`${bestand} bestaat niet`); continue; }
  try {
    execFileSync(process.execPath, ['--check', pad], { stdio: 'pipe' });
    ok(bestand);
  } catch (e) {
    fout(`${bestand}: ${String(e.stderr || e).split('\n').slice(0, 3).join(' ')}`);
  }
}

/* ---------------------------------------------------------------
   4. De pagina is opnieuw gebouwd uit de huidige gegevens
   Waarom: het is zo gebeurd dat je data aanpast en de pagina
   vergeet te bouwen, en dan push je de oude.
---------------------------------------------------------------- */
kop('Pagina bijgewerkt');
const voor = existsSync(join(WORTEL, 'index.html')) ? readFileSync(join(WORTEL, 'index.html'), 'utf8') : '';
try {
  execFileSync(process.execPath, [join(WORTEL, 'tools/build.mjs')], { stdio: 'pipe' });
  const na = readFileSync(join(WORTEL, 'index.html'), 'utf8');
  const zelfde = voor.replace(/Bijgewerkt [^<]*/g, '') === na.replace(/Bijgewerkt [^<]*/g, '');
  if (zelfde) ok('index.html was al actueel');
  else let_op('index.html was verouderd en is zojuist opnieuw gebouwd — commit hem mee');
} catch (e) {
  fout(`bouwen mislukt: ${String(e.stderr || e).split('\n').slice(0, 3).join(' ')}`);
}

/* ---------------------------------------------------------------
   5. Start de server echt en antwoordt hij?
   Waarom: dit is de controle die de crash op Railway had voorkomen.
---------------------------------------------------------------- */
kop('Server draait echt');
const POORT = 4700 + Math.floor(Math.random() * 200);
await new Promise((klaar) => {
  const proces = spawn(process.execPath, [join(WORTEL, 'server.js')], {
    env: { ...process.env, PORT: String(POORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let uitvoer = '';
  proces.stdout.on('data', (d) => { uitvoer += d; });
  proces.stderr.on('data', (d) => { uitvoer += d; });

  const stoppen = () => { try { proces.kill(); } catch { /* al weg */ } klaar(); };

  proces.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      fout(`server stopte meteen met code ${code}`);
      console.log('        ' + uitvoer.split('\n').slice(0, 6).join('\n        '));
      klaar();
    }
  });

  setTimeout(async () => {
    const basis = `http://127.0.0.1:${POORT}`;
    const eerste = projecten.find((p) => p.tegel)?.tegel;
    const eersteId = projecten[0]?.id;
    const proeven = [
      ['de pagina zelf', '/', 200],
      ['een afbeelding', eerste ? `/img/${eerste}` : '/img/', eerste ? 200 : 404],
      ['robots.txt', '/robots.txt', 200],
      ['sitemap.xml', '/sitemap.xml', 200],
      ['projectpagina met streep', eersteId ? `/werk/${eersteId}/` : '/werk/', eersteId ? 200 : 404],
      ['projectpagina zonder streep', eersteId ? `/werk/${eersteId}` : '/werk', eersteId ? 200 : 404],
      ['onbekend project geeft 404', '/werk/bestaat-niet/', 404],
      ['onbekend pad geeft 404', '/bestaat-niet', 404],
      ['gegevens niet bereikbaar', '/data/projects.json', 404]
    ];
    for (const [wat, pad, verwacht] of proeven) {
      try {
        const a = await fetch(basis + pad, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
        if (a.status === verwacht) ok(`${wat} (${a.status})`);
        else fout(`${wat}: kreeg ${a.status}, verwachtte ${verwacht}`);
      } catch (e) {
        fout(`${wat}: geen antwoord (${e.message})`);
      }
    }

    // De sitescan haalt op verzoek een vreemd adres op. Zonder bewaking is dat
    // een manier om de server binnen zijn eigen netwerk te laten rondkijken,
    // dus dat wordt hier elke keer opnieuw getoetst.
    const weigeringen = [
      ['scan vraagt om een adres', '', 'Vul een webadres in'],
      ['scan weigert een adres in het netwerk', '192.168.1.1', 'netwerk'],
      ['scan weigert localhost', 'localhost', 'netwerk'],
      ['scan weigert het metadata-adres van de host', '169.254.169.254', 'netwerk'],
      ['scan weigert een ander soort adres', 'file:///etc/passwd', 'http of https']
    ];
    for (const [wat, adres, moet] of weigeringen) {
      try {
        const a = await fetch(`${basis}/api/scan?url=${encodeURIComponent(adres)}`, { signal: AbortSignal.timeout(10000) });
        const tekst = await a.text();
        if (tekst.includes(moet)) ok(wat);
        else fout(`${wat}: kreeg "${tekst.slice(0, 100).replace(/\n/g, ' ')}"`);
      } catch (e) {
        fout(`${wat}: geen antwoord (${e.message})`);
      }
    }

    // tekst hoort ingepakt over de lijn te gaan
    try {
      const a = await fetch(basis + '/', { headers: { 'accept-encoding': 'gzip' }, signal: AbortSignal.timeout(8000) });
      const vorm = a.headers.get('content-encoding');
      if (vorm) ok(`pagina wordt ingepakt verstuurd (${vorm})`);
      else fout('pagina gaat onverpakt over de lijn, dat is zonde van de bandbreedte');
    } catch (e) {
      fout(`inpakken: geen antwoord (${e.message})`);
    }

    stoppen();
  }, 1800);
});

/* ---------------------------------------------------------------
   6. Vindbaarheid: kan Google hier iets mee?
   Waarom: dit is stil kapot te maken. Een vergeten canonical, een
   relatieve og:image of een sitemap die een verwijderd project nog
   noemt zie je niet aan de pagina, en je merkt het pas als je niet
   gevonden wordt. Dus controleren we het per pagina.
---------------------------------------------------------------- */
kop('Vindbaar voor Google');
const domein = String(site.domein || '').replace(/\/+$/, '');
if (!domein) {
  fout('site.json heeft geen "domein" — dan kan geen canonical kloppen');
} else {
  const paginas = [
    ['index.html', `${domein}/`],
    [join('contact', 'index.html'), `${domein}/contact/`],
    ...projecten.map((p) => [join('werk', p.id, 'index.html'), `${domein}/werk/${p.id}/`])
  ];
  let seoMis = 0;
  const seoFout = (t) => { fout(t); seoMis++; };

  for (const [bestand, verwacht] of paginas) {
    const pad = join(WORTEL, bestand);
    if (!existsSync(pad)) { seoFout(`${bestand} bestaat niet — heb je gebouwd?`); continue; }
    const h = readFileSync(pad, 'utf8');
    const pak = (re) => (h.match(re) || [])[1];

    const canoniek = pak(/<link rel="canonical" href="([^"]+)"/);
    if (canoniek !== verwacht) seoFout(`${bestand}: canonical is "${canoniek}", verwacht "${verwacht}"`);

    const titel = pak(/<title>([^<]*)<\/title>/);
    if (!titel) seoFout(`${bestand}: geen <title>`);
    else if (titel.length > 65) let_op(`${bestand}: titel is ${titel.length} tekens, Google knipt rond 60 af`);

    const omschrijving = pak(/<meta name="description" content="([^"]*)"/);
    if (!omschrijving) seoFout(`${bestand}: geen omschrijving`);
    else if (omschrijving.length < 50) let_op(`${bestand}: omschrijving is maar ${omschrijving.length} tekens`);

    const beeld = pak(/<meta property="og:image" content="([^"]*)"/);
    if (!beeld) seoFout(`${bestand}: geen og:image`);
    else if (!/^https?:\/\//.test(beeld)) seoFout(`${bestand}: og:image "${beeld}" is relatief, dan werkt het voorbeeld in WhatsApp niet`);

    const koppen = (h.match(/<h1[\s>]/g) || []).length;
    if (koppen !== 1) seoFout(`${bestand}: ${koppen} keer een h1, er moet er precies één zijn`);

    const ld = pak(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (!ld) seoFout(`${bestand}: geen JSON-LD`);
    else {
      try { JSON.parse(ld); } catch (e) { seoFout(`${bestand}: JSON-LD is geen geldige JSON (${e.message})`); }
    }
  }
  if (!seoMis) ok(`${paginas.length} pagina's: canonical, titel, omschrijving, og:image, één h1 en geldige JSON-LD`);

  // de sitemap moet precies de pagina's noemen die er zijn
  const sitemapPad = join(WORTEL, 'sitemap.xml');
  if (!existsSync(sitemapPad)) fout('sitemap.xml ontbreekt');
  else {
    const inSitemap = [...readFileSync(sitemapPad, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const moeten = paginas.map(([, u]) => u);
    const teveel = inSitemap.filter((u) => !moeten.includes(u));
    const tekort = moeten.filter((u) => !inSitemap.includes(u));
    if (teveel.length) fout(`sitemap noemt adressen die niet bestaan: ${teveel.join(', ')}`);
    if (tekort.length) fout(`sitemap mist: ${tekort.join(', ')}`);
    if (!teveel.length && !tekort.length) ok(`sitemap noemt precies de ${moeten.length} pagina's die er zijn`);
  }

  const robotsPad = join(WORTEL, 'robots.txt');
  if (!existsSync(robotsPad)) fout('robots.txt ontbreekt');
  else if (!readFileSync(robotsPad, 'utf8').includes(`${domein}/sitemap.xml`))
    fout('robots.txt verwijst niet naar de sitemap, dan moet Google hem zelf raden');
  else ok('robots.txt wijst naar de sitemap');

  // een verweesde map onder werk/ zou een adres in de lucht houden dat
  // niemand meer bedoelt, maar dat Google al kent
  const werkMap = join(WORTEL, 'werk');
  if (existsSync(werkMap)) {
    const levend = new Set(projecten.map((p) => p.id));
    const wees = readdirSync(werkMap).filter((d) => !levend.has(d));
    if (wees.length) fout(`werk/ heeft mappen van projecten die niet meer bestaan: ${wees.join(', ')}`);
    else ok('geen verweesde projectpagina\'s');
  }

  // Search Console mag op twee manieren: een meta-tag in de kop, of een
  // TXT-record bij de registrar. Het tweede dekt het hele domein en laat in
  // de pagina niets achter, dus dan staat hier alleen een aantekening.
  // Een popovertarget die nergens naar wijst geeft geen foutmelding: er
  // gebeurt gewoon niets als je klikt. Dat ontdek je pas als iemand het je
  // vertelt, dus controleren we het per pagina.
  let weesKnopjes = 0;
  for (const [bestand] of paginas) {
    const h = readFileSync(join(WORTEL, bestand), 'utf8');
    const knoppen = new Set([...h.matchAll(/popovertarget="([^"]+)"/g)].map((m) => m[1]));
    const vensters = new Set([...h.matchAll(/<div popover id="([^"]+)"/g)].map((m) => m[1]));
    const wees = [...knoppen].filter((id) => !vensters.has(id));
    if (wees.length) { fout(`${bestand}: ${wees.length} uitlegknopje(s) zonder uitleg — klikken doet niets`); weesKnopjes += wees.length; }
  }
  if (!weesKnopjes) ok('elk uitlegknopje heeft zijn uitleg op dezelfde pagina');

  if (site.searchConsole) ok(`Search Console: ${site.searchConsole}`);
  else if (site.googleVerificatie) ok('Search Console-code staat in de kop van elke pagina');
  else let_op('nog geen Search Console — zonder die koppeling weet je niet of Google je ziet');
}

/* ---------------------------------------------------------------
   7. Structuur en taal: de fouten die niets laten crashen
   Waarom: een dubbele id, een dode link, een beeld zonder alt of dezelfde
   term op twee manieren geschreven merkt niemand aan een foutmelding.
---------------------------------------------------------------- */
kop('Structuur van de pagina\'s');
{
  const s = structuur(WORTEL);
  s.fouten.forEach(fout);
  s.waarschuwingen.forEach(let_op);
  if (!s.fouten.length) ok(`${s.aantal} pagina's: geen dubbele id's, dode links of beelden zonder alt`);
}

kop('Taal');
{
  const t = taal(WORTEL);
  t.fouten.forEach(fout);
  t.waarschuwingen.forEach(let_op);
  if (!t.fouten.length && !t.waarschuwingen.length) ok(`${t.aantal} teksten nagelopen, niets gevonden`);
  else if (!t.fouten.length) ok(`${t.aantal} teksten nagelopen, geen fouten`);
}

/* ---------------------------------------------------------------
   8. Shellscripts: draaien die straks op Linux?
   Waarom: Windows zet CRLF erin en dan weigert bash ze.
---------------------------------------------------------------- */
kop('Shellscripts');
const vpsMap = join(WORTEL, 'vps');
if (existsSync(vpsMap)) {
  for (const bestand of readdirSync(vpsMap).filter((f) => f.endsWith('.sh'))) {
    const pad = join(vpsMap, bestand);
    const ruw = readFileSync(pad);
    if (ruw.includes('\r\n')) fout(`${bestand}: heeft CRLF-regeleindes, bash weigert hem op Linux`);
    else ok(`${bestand}: LF`);
    try {
      execFileSync('bash', ['-n', pad], { stdio: 'pipe' });
    } catch (e) {
      fout(`${bestand}: ${String(e.stderr || e).split('\n')[0]}`);
    }
  }
} else {
  let_op('geen vps/ map gevonden');
}

/* ---------------------------------------------------------------
   9. Optioneel: antwoorden je live adressen nog?
---------------------------------------------------------------- */
if (metNet) {
  kop('Live adressen');
  const adressen = [...new Set(projecten.filter((p) => p.url).map((p) => p.url))];
  await Promise.all(adressen.map(async (u) => {
    try {
      const a = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
      a.ok ? ok(`${u} (${a.status})`) : fout(`${u} geeft ${a.status}`);
    } catch {
      fout(`${u} reageert niet`);
    }
  }));
}

/* ---------------------------------------------------------------
   Uitkomst
---------------------------------------------------------------- */
console.log('');
if (fouten) {
  console.log(`${fouten} fout(en), ${waarschuwingen} waarschuwing(en). Niet pushen.`);
  process.exit(1);
}
console.log(`Alles in orde. ${waarschuwingen} waarschuwing(en).`);
process.exit(0);
