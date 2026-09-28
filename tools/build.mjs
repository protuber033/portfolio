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

const gecontroleerd = projecten.map((p) => p.gecontroleerd).filter(Boolean).sort().pop();

/* ---------- afgeleide cijfers: groeien vanzelf mee ---------- */
const aantal = projecten.length;
const aantalLive = projecten.filter((p) => p.status === 'live').length;
const domeinen = projecten.filter((p) => p.url && !/railway\.app/.test(p.url)).length;

// de showcase pakt automatisch alle schermen van alle projecten mee
const showcase = projecten.flatMap((p) => (p.beelden || [])
  .filter((b) => b.showcase !== false)
  .map((b) => ({ bestand: b.bestand, naam: p.naam, id: p.id })));
const helft = Math.ceil(showcase.length / 2);
const banen = [showcase.slice(0, helft), showcase.slice(helft)];

/* ---------- wat er in de projecten zit, geteld ---------- */
function tel(lijst) {
  const m = new Map();
  for (const x of lijst) m.set(x, (m.get(x) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// "React 19" en "React" zijn hetzelfde ding; voor de grafiek tellen we ze samen
const zonderVersie = (t) => t.replace(/\s+\d+(\.\d+)*$/, '');
const techniekTelling = tel(projecten.flatMap((p) => [...new Set((p.techniek || []).map(zonderVersie))]))
  .filter(([, n]) => n > 1).slice(0, 10);

const soortTelling = site.filters
  .filter((f) => f.sleutel !== 'alles')
  .map((f) => [f.label, projecten.filter((p) => (p.tags || []).includes(f.sleutel)).length])
  .filter(([, n]) => n > 0)
  .sort((a, b) => b[1] - a[1]);

function staven(rijen, eenheid) {
  const top = Math.max(...rijen.map((r) => r[1]), 1);
  return `<ul class="staven">
${rijen.map(([naam, n]) => `            <li>
              <span class="staaf-naam">${esc(naam)}</span>
              <span class="staaf-spoor"><span class="staaf" style="width:${((n / top) * 100).toFixed(1)}%" title="${esc(naam)}: ${n} ${esc(eenheid)}"></span></span>
              <span class="staaf-waarde">${n}</span>
            </li>`).join('\n')}
          </ul>`;
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
  const gecheckt = g.sleutel === 'live' && gecontroleerd
    ? `<span class="gecheckt"><span class="stip live"></span>alle ${leden.length} reageerden bij de laatste controle op ${esc(gecontroleerd)}</span>`
    : '';
  return `
      <section class="groep" data-groep="${esc(g.sleutel)}">
        <div class="groep-kop">
          <h3>${esc(g.titel)} <span class="telling">${leden.length}</span></h3>
          <p>${esc(g.uitleg)}</p>
          ${gecheckt}
        </div>
        <ul class="raster">${leden.map(kaart).join('')}</ul>
      </section>`;
}

function galerij(p) {
  const beelden = p.beelden || [];
  if (!beelden.length) return '';
  const eerste = beelden[0];
  const duimen = beelden.length > 1 ? `
          <div class="duimen" role="tablist" aria-label="Schermen van ${esc(p.naam)}">
${beelden.map((b, i) => `            <button type="button" class="duimknop" role="tab" aria-selected="${i === 0}"
              data-bestand="${esc(b.bestand)}" data-titel="${esc(b.titel)}"
              data-bijschrift="${esc(b.bijschrift)}" data-alt="${esc(b.alt)}">
              <img src="img/m-${esc(b.bestand)}" width="440" height="275" loading="lazy" alt="${esc(b.titel)}">
            </button>`).join('\n')}
          </div>` : '';
  return `
        <div class="galerij" data-galerij>${duimen}
          <figure class="groot">
            <span class="balk"><i></i><i></i><i></i><b data-rol="titel">${esc(eerste.titel)}</b></span>
            <img data-rol="groot" src="img/${esc(eerste.bestand)}" width="1400" height="875" loading="lazy" alt="${esc(eerste.alt)}">
            <figcaption data-rol="bijschrift">${esc(eerste.bijschrift)}</figcaption>
          </figure>
        </div>`;
}

function stroom(p) {
  const stappen = p.stappen || [];
  if (!stappen.length) return '';
  return `
        <div class="stroom">
          <h4>Zo loopt het van begin tot eind</h4>
          <ol class="stappen">
${stappen.map((st, i) => `            <li><span class="nr">${i + 1}</span><span class="wat">${esc(st)}</span></li>`).join('\n')}
          </ol>
        </div>`;
}

function paneel(p) {
  const knop = p.url
    ? `<a class="knop knop-vol" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.urlLabel)}</a>`
    : '';
  const dicht = p.besloten ? `<p class="dicht">${esc(p.besloten)}</p>` : '';
  const schermen = galerij(p);
  return `
      <article class="paneel" id="paneel-${esc(p.id)}" data-id="${esc(p.id)}" hidden>
        <header class="paneel-kop">
          <p class="paneel-meta">${statusStip(p.status)}${esc(p.statusLabel)} <span class="punt">·</span> ${esc(p.periode)}</p>
          <h2>${esc(p.naam)}</h2>
          <p class="paneel-lead">${esc(p.voorWie)}</p>
          <button type="button" class="deel" data-deel="${esc(p.id)}">Kopieer link naar dit project</button>
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
        ${stroom(p)}
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





const filterKnoppen = site.filters.map((f, i) => {
  const n = f.sleutel === 'alles'
    ? projecten.length
    : projecten.filter((p) => (p.tags || []).includes(f.sleutel)).length;
  if (!n) return '';
  return `<button type="button" class="filter" data-filter="${esc(f.sleutel)}" aria-pressed="${i === 0}">${esc(f.label)} <i>${n}</i></button>`;
}).join('');

const css = [
  readFileSync(join(WORTEL, 'tools/stijl.css'), 'utf8'),
  readFileSync(join(WORTEL, 'tools/extra.css'), 'utf8')
].join('\n');
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
      <a href="#werk">Werk</a>
      <a href="#lagen">Aanpak</a>
      <a href="#cijfers">Cijfers</a>
      <a href="#contact">Contact</a>
    </nav>
    <a class="knop knop-klein" href="#contact">Neem contact op</a>
  </div>
</header>

<main id="top">

  <section class="toonbank">
    <div class="showcase" aria-hidden="true">
${banen.map((baan, i) => `      <div class="baan baan-${i + 1}">
        <div class="sleep">
${[...baan, ...baan].map((b) => `          <img src="img/m-${esc(b.bestand)}" width="440" height="275" loading="${i === 0 ? 'eager' : 'lazy'}" alt="">`).join('\n')}
        </div>
      </div>`).join('\n')}
    </div>
    <p class="showcase-bij"><span class="stip live"></span>Echte schermen uit ${aantal} projecten. Hieronder kun je ze een voor een bekijken.</p>
  </section>

  <section class="kop-blok">
    <div class="binnen">
      <p class="rol">${esc(site.rol)}</p>
      <h1>${esc(site.kop)}</h1>
      <ul class="cijfers">
        <li><b>${aantal}</b> projecten</li>
        <li><b>${aantalLive}</b> draaien nu live</li>
        <li><b>${domeinen}</b> op een eigen domein</li>
      </ul>
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
          <kbd class="sneltoets">/</kbd>
        </label>
      </div>
    </div>
    <div class="binnen">
      <div id="groepen">${site.groepen.map(groep).join('')}</div>
      <p class="niets" id="niets" hidden>Geen project gevonden. Probeer een andere zoekterm of zet het filter op Alles.</p>
    </div>
  </section>

  <section class="sectie" id="lagen">
    <div class="binnen">
      <h2 class="sectie-kop">Voorkant én achterkant, door dezelfde handen</h2>
      <p class="sectie-uitleg">Bij de meeste bureaus bouwt de een de website en moet je voor alles wat erachter zit bij iemand anders zijn. Wij doen allebei, en juist daar zit de winst: de knop die de klant indrukt en de database die het antwoord geeft zijn samen ontworpen.</p>
      <div class="lagen">${site.lagen.map(laag).join('')}</div>

      <div class="bouw">
        <p class="bouw-kop">Zo zit zo'n project in elkaar</p>
        <div class="doos rand-accent">Een bezoeker opent de pagina</div>
        <p class="pijl">&darr;</p>
        <div class="doos">
          <b>De voorkant</b>
          <span>Wat hij ziet en aanklikt. Draait in zijn browser, op telefoon net zo goed als op een monitor.</span>
        </div>
        <p class="pijl">&darr; <em>vraagt gegevens op</em></p>
        <div class="doos">
          <b>De achterkant</b>
          <span>De server die controleert wie je bent, de gegevens ophaalt en het werk doet.</span>
        </div>
        <p class="pijl">&darr;</p>
        <div class="vier">
          <div class="doos klein"><b>Database</b><span>projecten, klanten, uren</span></div>
          <div class="doos klein"><b>Documenten</b><span>pdf's en foto's, afgeschermd</span></div>
          <div class="doos klein"><b>Mail</b><span>bevestiging naar de klant</span></div>
          <div class="doos klein"><b>AI</b><span>foto's lezen, tekst nakijken</span></div>
        </div>
        <p class="bouw-bij">Alles in &eacute;&eacute;n service, niet vijf losse abonnementen. Valt een betaalde dienst weg, dan schakelt de site door naar een gratis alternatief in plaats van stuk te gaan.</p>
      </div>
    </div>
  </section>

  <section class="sectie" id="cijfers">
    <div class="binnen">
      <h2 class="sectie-kop">Waar het werk in zit</h2>
      <p class="sectie-uitleg">Geteld over alle ${aantal} projecten op deze pagina. Groeit vanzelf mee als er werk bij komt.</p>
      <div class="grafieken">
        <figure class="grafiek">
          <figcaption>Techniek die in meer dan &eacute;&eacute;n project terugkomt</figcaption>
          ${staven(techniekTelling, 'projecten')}
          <p class="grafiek-bij">Aantal projecten waarin het gebruikt wordt.</p>
        </figure>
        <figure class="grafiek">
          <figcaption>Wat voor werk het is</figcaption>
          ${staven(soortTelling, 'projecten')}
          <p class="grafiek-bij">Een project kan onder meer dan &eacute;&eacute;n soort vallen.</p>
        </figure>
      </div>
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
console.log(`index.html gebouwd — ${aantal} projecten, ${aantalLive} live`);
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
