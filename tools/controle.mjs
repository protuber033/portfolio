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
const teControleren = ['server.js', 'tools/build.mjs', 'tools/scan.mjs', 'tools/shots.mjs', 'tools/controle.mjs', 'tools/gedrag.js'];
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
    const proeven = [
      ['de pagina zelf', '/', 200],
      ['een afbeelding', eerste ? `/img/${eerste}` : '/img/', eerste ? 200 : 404],
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
    stoppen();
  }, 1800);
});

/* ---------------------------------------------------------------
   6. Shellscripts: draaien die straks op Linux?
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
   7. Optioneel: antwoorden je live adressen nog?
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
