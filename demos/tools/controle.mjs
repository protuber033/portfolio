// Controleert de vier demo's voordat je ze live zet.
//
//   npm run check
//
// Elke controle hier zit er omdat het misging of omdat het stil kan
// afbreken: een demo die niet meer laadt merk je pas als een klant hem
// opent, en dat is precies het verkeerde moment.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');
let fouten = 0, waarschuwingen = 0;
const ok = (t) => console.log(`  ok    ${t}`);
const fout = (t) => { console.log(`  FOUT  ${t}`); fouten++; };
const let_op = (t) => { console.log(`  let op ${t}`); waarschuwingen++; };
const kop = (t) => console.log(`\n${t}`);

const DEMOS = ['koffie', 'portaal', 'planning', 'vloot'];

/* --- 1. staat alles er? --- */
kop('Bestanden');
for (const d of DEMOS) {
  for (const p of [`${d}/index.html`, `data/${d}.json`, `tools/${d}.mjs`]) {
    if (!existsSync(join(WORTEL, p))) fout(`${p} ontbreekt`);
  }
}
for (const p of ['index.html', 'server.js', 'gedeeld/demobalk.css', 'gedeeld/demobalk.js']) {
  if (!existsSync(join(WORTEL, p))) fout(`${p} ontbreekt`);
}
if (!fouten) ok(`vier demo's compleet`);

/* --- 2. is de json geldig? --- */
kop('Gegevens');
for (const d of DEMOS) {
  try {
    JSON.parse(readFileSync(join(WORTEL, `data/${d}.json`), 'utf8'));
    ok(`data/${d}.json`);
  } catch (e) {
    fout(`data/${d}.json is stuk: ${e.message}`);
  }
}

/* --- 3. syntax --- */
kop('Syntax');
const scripts = ['server.js', 'gedeeld/demobalk.js', ...DEMOS.flatMap((d) => [`tools/${d}.mjs`, ...readdirSync(join(WORTEL, d)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`)])];
for (const s of scripts) {
  try {
    execFileSync(process.execPath, ['--check', join(WORTEL, s)], { stdio: 'pipe' });
    ok(s);
  } catch (e) {
    fout(`${s}: ${String(e.stderr || e).split('\n').slice(0, 3).join(' ')}`);
  }
}

/* --- 4. het hidden-attribuut --- */
kop('Verborgen panelen blijven verborgen');
// Een eigen display-regel wint het van het hidden-attribuut. Dat kostte een
// keer een demo waarin elk paneel meteen openstond.
for (const d of DEMOS) {
  const css = readdirSync(join(WORTEL, d)).filter((f) => f.endsWith('.css'));
  const inhoud = css.map((f) => readFileSync(join(WORTEL, d, f), 'utf8')).join('\n');
  if (!css.length) continue;
  if (/\[hidden\]\s*\{[^}]*display\s*:\s*none/.test(inhoud)) ok(`${d}: heeft de hidden-regel`);
  else fout(`${d}: mist \`[hidden] { display: none !important }\` — panelen kunnen openstaan`);
}

/* --- 5. draaien ze echt? --- */
kop('De demo\'s draaien');
const POORT = 5200 + Math.floor(Math.random() * 300);
await new Promise((klaar) => {
  const proces = spawn(process.execPath, [join(WORTEL, 'server.js')], {
    env: { ...process.env, PORT: String(POORT) }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let uitvoer = '';
  proces.stdout.on('data', (c) => { uitvoer += c; });
  proces.stderr.on('data', (c) => { uitvoer += c; });
  proces.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      fout(`server stopte meteen met code ${code}`);
      console.log('        ' + uitvoer.split('\n').slice(0, 6).join('\n        '));
      klaar();
    }
  });

  setTimeout(async () => {
    const basis = `http://127.0.0.1:${POORT}`;
    const stop = () => { try { proces.kill(); } catch { /* al weg */ } klaar(); };

    for (const [wat, pad, verwacht] of [
      ['de overzichtspagina', '/', 200],
      ...DEMOS.map((d) => [`${d} laadt`, `/${d}/`, 200]),
      ['gedeelde stijl', '/gedeeld/demobalk.css', 200],
      ['gegevens niet bereikbaar', '/data/koffie.json', 404],
      ['broncode niet bereikbaar', '/tools/koffie.mjs', 404],
      ['onbekend pad', '/bestaatniet', 404]
    ]) {
      try {
        const a = await fetch(basis + pad, { signal: AbortSignal.timeout(8000) });
        a.status === verwacht ? ok(`${wat} (${a.status})`) : fout(`${wat}: kreeg ${a.status}, verwachtte ${verwacht}`);
      } catch (e) { fout(`${wat}: geen antwoord (${e.message})`); }
    }

    // elke bezoeker een eigen kopie
    try {
      const a = await fetch(`${basis}/api/koffie/mand/toevoegen`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId: 'havik', maling: 'bonen', aantal: 1 })
      });
      const koekje = a.headers.get('set-cookie');
      const mijn = await a.json();
      const ander = await (await fetch(`${basis}/api/koffie`)).json();
      if (koekje && mijn.aantalStuks === 1 && ander.aantalStuks === 0) ok('elke bezoeker heeft zijn eigen gegevens');
      else fout(`eigen kopie klopt niet: ik ${mijn.aantalStuks}, ander ${ander.aantalStuks}`);
    } catch (e) { fout(`eigen kopie: ${e.message}`); }

    // het portaal mag niets weggeven zonder inlog
    try {
      const j = await (await fetch(`${basis}/api/portaal/dossier?klant=k2`)).json();
      j.fout ? ok('portaal weigert zonder inlog') : fout('portaal gaf een dossier weg zonder inlog');
    } catch (e) { fout(`portaal: ${e.message}`); }

    // en niet het dossier van een ander na inloggen
    try {
      const a = await fetch(`${basis}/api/portaal/inloggen`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'marieke@voorbeeld.nl', wachtwoord: 'welkom' })
      });
      const koekje = (a.headers.get('set-cookie') || '').split(';')[0];
      const inlog = await a.json();
      if (inlog.ik && inlog.ik.wachtwoord !== undefined) fout('het portaal stuurt een wachtwoord terug');
      const j = await (await fetch(`${basis}/api/portaal/dossier?klant=k2`, { headers: { cookie: koekje } })).json();
      j.fout ? ok('portaal weigert het dossier van een ander') : fout('portaal gaf het dossier van een andere klant vrij');
    } catch (e) { fout(`portaal rechten: ${e.message}`); }

    // de stroom van het dashboard moet meteen iets sturen.
    // Een stroom die open blijft staan houdt bij het afsluiten een handle
    // vast; op Windows klapt node daar met een assertion op uit, ná de
    // uitslag. Vandaar dat we hem hier expliciet afbreken.
    const stopper = new AbortController();
    try {
      const a = await fetch(`${basis}/api/vloot/stroom`, { signal: stopper.signal });
      const lezer = a.body.getReader();
      const { value } = await lezer.read();
      const tekst = new TextDecoder().decode(value);
      tekst.includes('event: begin') ? ok('dashboard stuurt meteen een momentopname') : fout('dashboard stuurt niets bij het verbinden');
    } catch (e) {
      fout(`dashboardstroom: ${e.message}`);
    } finally {
      stopper.abort();
    }

    stop();
  }, 1800);
});

console.log('');
if (fouten) console.log(`${fouten} fout(en), ${waarschuwingen} waarschuwing(en). Niet pushen.`);
else console.log(`Alles in orde. ${waarschuwingen} waarschuwing(en).`);

// exitCode in plaats van process.exit(): dan mag node zijn verbindingen
// eerst netjes dichtdoen en eindigt hij op de code die we bedoelen
process.exitCode = fouten ? 1 : 0;
