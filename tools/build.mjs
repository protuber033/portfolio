// Bouwt site/index.html uit data/site.json en data/projects.json.
// Een nieuw project toevoegen = een blok in projects.json erbij; hier hoeft niets te wijzigen.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(readFileSync(join(WORTEL, 'data/site.json'), 'utf8'));
const alleProjecten = JSON.parse(readFileSync(join(WORTEL, 'data/projects.json'), 'utf8'));
// concepten wachten op tekst en blijven uit de gepubliceerde site
const projecten = alleProjecten.filter((p) => !p.concept);
const wachtkamer = alleProjecten.filter((p) => p.concept);

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// **vet** in de opsommingen wordt <strong>
const vet = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/* ---------- afgeleide cijfers: groeien vanzelf mee ---------- */
const aantal = projecten.length;
const aantalLive = projecten.filter((p) => p.status === 'live').length;
const domeinen = projecten
  .filter((p) => p.url && !/railway\.app/.test(p.url))
  .length;

const datums = projecten.flatMap((p) => [p.eersteDag, p.laatsteDag]).filter(Boolean).sort();
const vanaf = datums[0];
const totEnMet = datums[datums.length - 1];

function maandBereik(van, tot) {
  const a = new Date(van + 'T00:00:00Z');
  const b = new Date(tot + 'T00:00:00Z');
  const start = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1);
  const eind = Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 1);
  const ticks = [];
  let y = a.getUTCFullYear();
  let m = a.getUTCMonth();
  while (Date.UTC(y, m, 1) < eind) {
    ticks.push({ y, m });
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return { start, eind, ticks };
}

const tijd = maandBereik(vanaf, totEnMet);

function procent(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return ((Date.UTC(y, m - 1, d) - tijd.start) / (tijd.eind - tijd.start)) * 100;
}

/* ---------- onderdelen ---------- */
function statusStip(status) {
  return `<span class="stip ${esc(status)}" aria-hidden="true"></span>`;
}

function kaart(p) {
  const beeld = p.tegel
    ? `<img src="img/${esc(p.tegel)}" width="760" height="475" loading="lazy" alt="${esc(p.naam)}">`
    : `<span class="geenbeeld">${esc(p.tegelTekst || '').split('\n').map(esc).join('<br>')}</span>`;
  const chips = (p.techniek || []).slice(0, 3)
    .map((t) => `<span>${esc(t)}</span>`).join('');
  return `
        <li class="kaart" data-id="${esc(p.id)}" data-tags="${esc((p.tags || []).join(' '))}" data-zoek="${esc((p.naam + ' ' + p.eenRegel + ' ' + (p.techniek || []).join(' ')).toLowerCase())}">
          <button type="button" class="kaart-knop" aria-haspopup="dialog">
            <span class="duim">${beeld}</span>
            <span class="kaart-tekst">
              <span class="kaart-status">${statusStip(p.status)}${esc(p.statusLabel)}</span>
              <span class="kaart-naam">${esc(p.naam)}</span>
              <span class="kaart-regel">${esc(p.eenRegel)}</span>
              <span class="kaart-chips">${chips}</span>
            </span>
          </button>
        </li>`;
}

function groep(g) {
  const leden = projecten.filter((p) => p.status === g.sleutel);
  if (!leden.length) return '';
  return `
      <section class="groep" data-groep="${esc(g.sleutel)}">
        <div class="groep-kop">
          <h3>${esc(g.titel)} <span class="telling">${leden.length}</span></h3>
          <p>${esc(g.uitleg)}</p>
        </div>
        <ul class="raster">${leden.map(kaart).join('')}</ul>
      </section>`;
}

function beeldFiguur(b) {
  return `
            <figure class="scherm">
              <span class="balk"><i></i><i></i><i></i><b>${esc(b.titel)}</b></span>
              <img src="img/${esc(b.bestand)}" width="1400" height="875" loading="lazy" alt="${esc(b.alt)}">
              <figcaption>${esc(b.bijschrift)}</figcaption>
            </figure>`;
}

function paneel(p) {
  const knop = p.url
    ? `<a class="knop knop-vol" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.urlLabel)}</a>`
    : '';
  const dicht = p.besloten ? `<p class="dicht">${esc(p.besloten)}</p>` : '';
  const schermen = (p.beelden || []).length
    ? `<div class="schermen">${p.beelden.map(beeldFiguur).join('')}</div>`
    : '';
  return `
      <article class="paneel" id="paneel-${esc(p.id)}" hidden>
        <header class="paneel-kop">
          <p class="paneel-meta">${statusStip(p.status)}${esc(p.statusLabel)} <span class="punt">·</span> ${esc(p.periode)}</p>
          <h2>${esc(p.naam)}</h2>
          <p class="paneel-lead">${esc(p.voorWie)}</p>
        </header>
        <div class="paneel-cols">
          <div class="vak voorbeeld">
            <h4>Zo gaat het in de praktijk</h4>
            <p>${esc(p.voorbeeld)}</p>
          </div>
          <div class="vak">
            <h4>Wat het doet</h4>
            <ul class="doet">${(p.doet || []).map((d) => `<li>${vet(d)}</li>`).join('')}</ul>
          </div>
          <div class="vak">
            <h4>Techniek</h4>
            <ul class="techniek">${(p.techniek || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
            ${knop}
            ${dicht}
          </div>
        </div>
        ${schermen}
      </article>`;
}

const laag = (l) => `
        <article class="laag">
          <p class="laag-label">${esc(l.label)}</p>
          <h3>${esc(l.kop)}</h3>
          <p>${esc(l.tekst)}</p>
          <ul class="techniek">${l.techniek.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        </article>`;

const kunde = (k) => `
        <article class="kunde">
          <p class="kunde-label">${esc(k.label)}</p>
          <h3>${esc(k.kop)}</h3>
          <p>${esc(k.tekst)}</p>
          <p class="bewijs">${esc(k.bewijs)}</p>
        </article>`;

const balkje = (p) => {
  const links = procent(p.eersteDag);
  const breed = Math.max(procent(p.laatsteDag) - links, 1.2);
  return `
          <div class="rij">
            <span class="rij-naam">${esc(p.naam)}</span>
            <span class="spoor"><span class="balkje ${esc(p.status)}" style="left:${links.toFixed(2)}%;width:${breed.toFixed(2)}%"></span></span>
          </div>`;
};

const tijdlijnRijen = [...projecten]
  .sort((a, b) => (a.eersteDag < b.eersteDag ? -1 : 1))
  .map(balkje).join('');

const assen = tijd.ticks.map((t) => t.m === 0
  ? `<span class="jaar">${MAANDEN[t.m]} '${String(t.y).slice(2)}</span>`
  : `<span>${MAANDEN[t.m]}</span>`).join('');

const filterKnoppen = site.filters.map((f, i) => {
  const n = f.sleutel === 'alles'
    ? projecten.length
    : projecten.filter((p) => (p.tags || []).includes(f.sleutel)).length;
  if (!n) return '';
  return `<button type="button" class="filter" data-filter="${esc(f.sleutel)}" aria-pressed="${i === 0}">${esc(f.label)} <i>${n}</i></button>`;
}).join('');

const css = readFileSync(join(WORTEL, 'tools/stijl.css'), 'utf8');
const js = readFileSync(join(WORTEL, 'tools/gedrag.js'), 'utf8');

const kopstuk = `<title>${esc(site.titel)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Manrope:wght@400;500;600;700&family=Sora:wght@600;700&display=swap">
<style>${css}</style>`;

const binnenkant = `<a class="overslaan" href="#werk">Direct naar het werk</a>

<header class="balk-boven">
  <div class="binnen">
    <a class="merk" href="#top"><span class="merk-stip"></span>${esc(site.naam)}</a>
    <nav class="menu">
      <a href="#lagen">Aanpak</a>
      <a href="#werk">Werk</a>
      <a href="#tijdlijn">Tijdlijn</a>
      <a href="#contact">Contact</a>
    </nav>
    <a class="knop knop-klein" href="#contact">Neem contact op</a>
  </div>
</header>

<main id="top">

  <section class="kop-blok">
    <div class="binnen">
      <p class="rol">${esc(site.rol)}</p>
      <h1>${esc(site.kop)}</h1>
      <p class="onderkop">${esc(site.onderkop)}</p>
      <ul class="cijfers">
        <li><b>${aantal}</b> projecten</li>
        <li><b>${aantalLive}</b> draaien nu live</li>
        <li><b>${domeinen}</b> op een eigen domein</li>
      </ul>
    </div>
  </section>

  <section class="sectie" id="lagen">
    <div class="binnen">
      <h2 class="sectie-kop">Voorkant én achterkant, door dezelfde handen</h2>
      <p class="sectie-uitleg">Bij de meeste bureaus bouwt de een de website en moet je voor alles wat erachter zit bij iemand anders zijn. Wij doen allebei, en juist daar zit de winst: de knop die de klant indrukt en de database die het antwoord geeft zijn samen ontworpen.</p>
      <div class="lagen">${site.lagen.map(laag).join('')}</div>
    </div>
  </section>

  <section class="sectie" id="werk">
    <div class="binnen">
      <h2 class="sectie-kop">Het werk</h2>
      <p class="sectie-uitleg">Klik een project aan voor het hele verhaal: een voorbeeld uit de praktijk, wat het doet en schermen van de draaiende versie.</p>
    </div>
    <div class="regelbalk">
      <div class="binnen regelbalk-binnen">
        <div class="filters">${filterKnoppen}</div>
        <label class="zoek">
          <span class="vzw">Zoek in projecten</span>
          <input type="search" id="zoekveld" placeholder="Zoek op naam of techniek" autocomplete="off">
        </label>
      </div>
    </div>
    <div class="binnen">
      <div id="groepen">${site.groepen.map(groep).join('')}</div>
      <p class="niets" id="niets" hidden>Geen project gevonden. Probeer een andere zoekterm of zet het filter op Alles.</p>
    </div>
  </section>

  <section class="sectie" id="tijdlijn">
    <div class="binnen">
      <h2 class="sectie-kop">Wanneer ik waaraan werkte</h2>
      <p class="sectie-uitleg">Elk balkje loopt van de eerste tot de laatste dag dat ik aan dat project werkte. Afgelezen uit de projecten zelf.</p>
      <div class="gantt">
        <div class="assen" style="grid-template-columns: repeat(${tijd.ticks.length}, minmax(0, 1fr))">${assen}</div>
        ${tijdlijnRijen}
      </div>
      <p class="legenda"><span><i class="balkje live"></i> draait live</span><span><i class="balkje prototype"></i> prototype</span><span><i class="balkje studie"></i> studieproject</span></p>
    </div>
  </section>

  <section class="sectie" id="kunnen">
    <div class="binnen">
      <h2 class="sectie-kop">Waar ik je mee kan helpen</h2>
      <p class="sectie-uitleg">Alles hieronder draait al ergens. Geen lijstje met technieken die ik ooit eens geprobeerd heb.</p>
      <div class="kundes">${site.kunnen.map(kunde).join('')}</div>
    </div>
  </section>

  <section class="sectie" id="contact">
    <div class="binnen">
      <div class="contact">
        <div>
          <h2>Zullen we kijken wat er mogelijk is?</h2>
          <p>Vertel me wat er nu handmatig gaat of blijft liggen. Ik kijk mee, denk mee en zeg eerlijk wat het wordt — ook als dat &ldquo;dit heb je niet nodig&rdquo; is.</p>
        </div>
        <div class="contact-doos">
          <span class="adres" id="adres">${esc(site.email)}</span>
          <button type="button" class="knop knop-vol" id="kopieer">Kopieer adres</button>
        </div>
      </div>
    </div>
  </section>

</main>

<footer class="voet">
  <div class="binnen">
    <p>Alle schermen op deze pagina zijn echte screenshots van de draaiende projecten. Klantgegevens zijn onleesbaar gemaakt. ${esc(site.naam)} · ${esc(site.opleiding)}.</p>
    <p class="bijgewerkt">Bijgewerkt ${new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })} · ${aantal} projecten</p>
  </div>
</footer>

<div class="overlay" id="overlay" hidden>
  <div class="venster" role="dialog" aria-modal="true" aria-labelledby="venster-titel" tabindex="-1">
    <button type="button" class="sluit" id="sluit" aria-label="Sluiten">&times;</button>
    <div id="venster-inhoud">${projecten.map(paneel).join('')}</div>
  </div>
</div>
`;

const script = `<script>${js}</script>`;

const pagina = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="${esc(site.naam)} bouwt websites en bedrijfssoftware voor Nederlandse bedrijven: front-end en back-end, allebei geoptimaliseerd. ${aantal} projecten, ${aantalLive} live.">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#0A0D16">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(site.titel)}">
<meta property="og:description" content="${esc(site.onderkop)}">
<meta property="og:image" content="img/kozijnfabriek-1.webp">
<meta name="twitter:card" content="summary_large_image">
${kopstuk}
</head>
<body>
${binnenkant}
${script}
</body>
</html>
`;

// dezelfde pagina zonder eigen <html>-omhulsel, voor publicatie als artifact
const artifact = `${kopstuk}\n${binnenkant}\n${script}\n`;

writeFileSync(join(WORTEL, 'index.html'), pagina);
writeFileSync(join(WORTEL, 'artifact.html'), artifact);
console.log(`index.html gebouwd — ${aantal} projecten, ${aantalLive} live, tijdlijn ${vanaf} t/m ${totEnMet}`);
if (wachtkamer.length) {
  console.log(`${wachtkamer.length} in de wachtkamer (nog niet gepubliceerd): ` +
    wachtkamer.map((p) => p.naam).join(', '));
}

// waarschuwen over beelden die niet bestaan
const missend = [];
for (const p of projecten) {
  if (p.tegel && !existsSync(join(WORTEL, 'img', p.tegel))) missend.push(p.tegel);
  for (const b of p.beelden || []) {
    if (!existsSync(join(WORTEL, 'img', b.bestand))) missend.push(b.bestand);
  }
}
if (missend.length) console.log('let op, deze beelden ontbreken nog: ' + missend.join(', '));
