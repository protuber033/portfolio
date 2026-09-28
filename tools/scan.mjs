// Zoekt projecten op deze computer en werkt data/projects.json bij.
//
// - bestaande projecten: begin- en einddatum worden opnieuw uit git gelezen
// - nieuwe projecten: komen erbij als concept, met een ingevulde techniekenlijst
// - live-adressen worden gecontroleerd; wat niet reageert wordt gemeld
//
// De teksten (voorbeeld, wat het doet) blijven altijd van jou: die raakt dit script niet aan.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const instel = JSON.parse(readFileSync(join(WORTEL, 'data/scan.json'), 'utf8'));
const projecten = JSON.parse(readFileSync(join(WORTEL, 'data/projects.json'), 'utf8'));

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

const normaliseer = (p) => resolve(p).replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');

function git(map, args) {
  try {
    return execFileSync('git', ['-C', map, ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000
    }).trim();
  } catch {
    return '';
  }
}

function gitCijfers(map) {
  if (!map || !existsSync(join(map, '.git'))) return null;
  const eerste = git(map, ['log', '--reverse', '--format=%ad', '--date=short']).split('\n')[0];
  const laatste = git(map, ['log', '-1', '--format=%ad', '--date=short']);
  const aantal = Number(git(map, ['rev-list', '--count', 'HEAD'])) || 0;
  if (!eerste || !laatste) return null;
  return { eerste, laatste, aantal };
}

function periodeTekst(eerste, laatste) {
  const [ay, am] = eerste.split('-').map(Number);
  const [by, bm] = laatste.split('-').map(Number);
  if (ay === by && am === bm) return `${MAANDEN[am - 1]} ${ay}`;
  if (ay === by) return `${MAANDEN[am - 1]} – ${MAANDEN[bm - 1]} ${by}`;
  return `${MAANDEN[am - 1]} ${ay} – ${MAANDEN[bm - 1]} ${by}`;
}

/* ---------- technieken herkennen uit package.json / requirements.txt ---------- */
const NAMEN = {
  react: 'React', next: 'Next.js', vite: 'Vite', tailwindcss: 'Tailwind',
  three: 'three.js', '@react-three/fiber': 'React Three Fiber', 'framer-motion': 'Framer Motion',
  motion: 'Motion', express: 'Express', '@prisma/client': 'Prisma', pg: 'PostgreSQL',
  mysql2: 'MySQL', '@supabase/supabase-js': 'Supabase', '@google/genai': 'Google Gemini',
  nodemailer: 'Mail', 'pdf-lib': 'pdf-lib', pdfkit: 'PDFKit', jspdf: 'jsPDF',
  jsonwebtoken: 'JWT', bcryptjs: 'Wachtwoordhashing', bcrypt: 'Wachtwoordhashing',
  cloudinary: 'Cloudinary', leaflet: 'Leaflet', 'maplibre-gl': 'MapLibre',
  '@capacitor/core': 'Capacitor', zod: 'zod', zustand: 'zustand', recharts: 'Recharts',
  sharp: 'sharp', multer: 'Uploads', '@aws-sdk/client-s3': 'S3-opslag', flask: 'Flask'
};

function technieken(map) {
  const gevonden = new Set();
  const pkgPad = join(map, 'package.json');
  if (existsSync(pkgPad)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPad, 'utf8'));
      const alles = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      for (const naam of Object.keys(alles)) {
        if (NAMEN[naam]) gevonden.add(NAMEN[naam]);
      }
    } catch { /* onleesbare package.json slaan we over */ }
  }
  if (existsSync(join(map, 'requirements.txt'))) gevonden.add('Python');
  if (existsSync(join(map, 'docker-compose.yml')) || existsSync(join(map, 'Dockerfile'))) gevonden.add('Docker');
  return [...gevonden].slice(0, 8);
}

function beschrijving(map) {
  for (const naam of ['README.md', 'readme.md']) {
    const pad = join(map, naam);
    if (!existsSync(pad)) continue;
    const regels = readFileSync(pad, 'utf8').split('\n');
    for (const regel of regels) {
      const schoon = regel.trim();
      if (!schoon || schoon.startsWith('#') || schoon.startsWith('<') || schoon.startsWith('!')) continue;
      if (schoon.length > 20) return schoon.replace(/[*_`]/g, '').slice(0, 180);
    }
  }
  return '';
}

/* ---------- mappen aflopen ---------- */
const negeer = new Set(instel.negeer.map((n) => n.toLowerCase()));
const kandidaten = new Map();

function loop(map, diepte) {
  if (diepte > instel.diepte) return;
  let inhoud;
  try { inhoud = readdirSync(map, { withFileTypes: true }); } catch { return; }

  const isProject = inhoud.some((e) => e.name === '.git') ||
    inhoud.some((e) => e.name === 'package.json');
  if (isProject) {
    kandidaten.set(normaliseer(map), map.replace(/\\/g, '/'));
    return; // niet verder graven in een project
  }

  for (const e of inhoud) {
    if (!e.isDirectory()) continue;
    if (negeer.has(e.name.toLowerCase()) || e.name.startsWith('.')) continue;
    loop(join(map, e.name), diepte + 1);
  }
}

for (const wortel of instel.mappen) {
  if (existsSync(wortel)) loop(wortel, 1);
}

/* ---------- bestaande projecten bijwerken ---------- */
const opKaart = new Map();
for (const p of projecten) {
  if (p.map) opKaart.set(normaliseer(p.map), p);
}
const genegeerd = new Set((instel.negeerPaden || []).map(normaliseer));

const gewijzigd = [];
for (const p of projecten) {
  if (!p.map || !existsSync(p.map)) continue;
  const c = gitCijfers(p.map);
  if (!c) continue;
  if (p.eersteDag !== c.eerste || p.laatsteDag !== c.laatste) {
    gewijzigd.push(`${p.naam}: ${p.laatsteDag} → ${c.laatste}`);
    p.eersteDag = c.eerste;
    p.laatsteDag = c.laatste;
    p.periode = periodeTekst(c.eerste, c.laatste);
  }
}

/* ---------- nieuwe projecten toevoegen ---------- */
const nieuw = [];
for (const [sleutel, map] of kandidaten) {
  if (opKaart.has(sleutel) || genegeerd.has(sleutel)) continue;
  const c = gitCijfers(map);
  if (!c || c.aantal < instel.minimumCommits) continue;

  const naam = basename(map);
  const id = naam.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (projecten.some((p) => p.id === id)) continue;

  const concept = {
    id,
    naam,
    status: 'prototype',
    statusLabel: 'Prototype',
    map,
    periode: periodeTekst(c.eerste, c.laatste),
    eersteDag: c.eerste,
    laatsteDag: c.laatste,
    eenRegel: beschrijving(map) || 'Nog geen omschrijving — vul deze aan in data/projects.json.',
    voorWie: beschrijving(map) || 'Nog geen omschrijving.',
    voorbeeld: 'Nog te schrijven: wat merkt een gebruiker hiervan in de praktijk?',
    doet: ['Nog te schrijven.'],
    techniek: technieken(map),
    tags: ['software'],
    url: null,
    urlLabel: null,
    besloten: 'Draait lokaal.',
    tegel: null,
    tegelTekst: 'NOG GEEN SCHERMAFBEELDING',
    beelden: [],
    concept: true
  };
  projecten.push(concept);
  nieuw.push(`${naam}  (${map})`);
}

/* ---------- live-adressen controleren ---------- */
const stuk = [];
async function controleer() {
  const vandaag = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  await Promise.all(projecten.filter((p) => p.url).map(async (p) => {
    try {
      const antwoord = await fetch(p.url, { redirect: 'follow', signal: AbortSignal.timeout(12000) });
      p.bereikbaar = antwoord.ok;
      p.gecontroleerd = vandaag;
      if (!antwoord.ok) stuk.push(`${p.naam}: ${p.url} geeft ${antwoord.status}`);
    } catch {
      p.bereikbaar = false;
      p.gecontroleerd = vandaag;
      stuk.push(`${p.naam}: ${p.url} reageert niet`);
    }
  }));
}

await controleer();

projecten.sort((a, b) => {
  const orde = { live: 0, prototype: 1, studie: 2, archief: 3 };
  if (orde[a.status] !== orde[b.status]) return orde[a.status] - orde[b.status];
  return b.laatsteDag.localeCompare(a.laatsteDag);
});

writeFileSync(join(WORTEL, 'data/projects.json'), JSON.stringify(projecten, null, 2) + '\n');

/* ---------- verslag ---------- */
console.log(`gescand: ${kandidaten.size} mappen met een project erin`);
console.log(`in de lijst: ${projecten.length} projecten`);
if (gewijzigd.length) console.log('\nbijgewerkte datums:\n  ' + gewijzigd.join('\n  '));
if (nieuw.length) {
  console.log('\nNIEUW GEVONDEN - in de wachtkamer, nog NIET op de site:\n  ' + nieuw.join('\n  '));
  console.log('  publiceren : vul de teksten in data/projects.json en zet \"concept\" op false');
  console.log('  nooit tonen: zet het pad in \"negeerPaden\" in data/scan.json');
}
if (stuk.length) console.log('\nLET OP, deze adressen reageerden niet:\n  ' + stuk.join('\n  '));
const conceptenOver = projecten.filter((p) => p.concept);
if (conceptenOver.length) {
  console.log(`\n${conceptenOver.length} project(en) wachten nog op tekst: ` +
    conceptenOver.map((p) => p.naam).join(', '));
}
