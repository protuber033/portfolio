// Bouwt site/index.html uit data/site.json en data/projects.json.
// Een nieuw project toevoegen = een blok in projects.json erbij; hier hoeft niets te wijzigen.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { contactPagina } from './contactpagina.mjs';
import { beheerPagina } from './beheerpagina.mjs';
import { vindbaar } from './vindbaar.mjs';
import { maakOnderdelen } from './onderdelen.mjs';
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
/* De band bovenaan. Op volgorde van project zette hij drie schermen van
   dezelfde site naast elkaar: bij een lichte site werd dat één wit blok,
   bij een donkere één zwart gat. Daarom om en om licht en donker, en nooit
   twee keer hetzelfde project achter elkaar.
   De helderheid per beeld komt uit tools/beeldmeting.mjs. */
const alleBeelden = projecten.flatMap((p) => (p.beelden || [])
  .filter((b) => b.showcase !== false)
  .map((b) => ({ bestand: b.bestand, naam: p.naam, id: p.id, licht: b.licht ?? 50 })));

function meng(lijst) {
  const donker = lijst.filter((b) => b.licht < 55).sort((a, b) => a.licht - b.licht);
  const licht = lijst.filter((b) => b.licht >= 55).sort((a, b) => b.licht - a.licht);
  const uit = [];
  let pakDonker = true;

  while (donker.length || licht.length) {
    const eerste = pakDonker && donker.length ? donker : licht.length ? licht : donker;
    // zelfde project als het vorige? pak dan de volgende uit diezelfde stapel
    const vorige = uit[uit.length - 1];
    let i = 0;
    if (vorige) while (i < eerste.length - 1 && eerste[i].id === vorige.id) i++;
    uit.push(eerste.splice(i, 1)[0]);
    pakDonker = !pakDonker;
  }
  return uit;
}

const showcase = meng(alleBeelden);
const helft = Math.ceil(showcase.length / 2);
const banen = [showcase.slice(0, helft), showcase.slice(helft)];

// "React 19" en "React" zijn hetzelfde ding; voor de grafiek tellen we ze samen
const zonderVersie = (t) => t.replace(/\s+\d+(\.\d+)*$/, '');

/* ---------- onderdelen ----------
   De bouwstenen van de pagina staan in tools/onderdelen.mjs: een tegel, een
   groep, een galerij, een paneel, de uitleg bij een vakterm. "deel" is het
   hele pakket; hieronder halen we eruit wat deze bouw gebruikt.
   Dit moet boven de tellingen staan, want die gebruiken tel() al. */
const deel = maakOnderdelen({ site, projecten, esc, vet, gecontroleerd, zonderVersie });
const { groep, stroom, paneel, laag, blok, kunde, staven, tel, term, uitlegVoor, uitlegVensters } = deel;

/* ---------- wat er in de projecten zit, geteld ---------- */
const techniekTelling = tel(projecten.flatMap((p) => [...new Set((p.techniek || []).map(zonderVersie))]))
  .filter(([, n]) => n > 1).slice(0, 10);

const soortTelling = site.filters
  .filter((f) => f.sleutel !== 'alles')
  .map((f) => [f.label, projecten.filter((p) => (p.tags || []).includes(f.sleutel)).length])
  .filter(([, n]) => n > 0)
  .sort((a, b) => b[1] - a[1]);

const filterKnoppen = site.filters.map((f, i) => {
  const n = f.sleutel === 'alles'
    ? projecten.length
    : projecten.filter((p) => (p.tags || []).includes(f.sleutel)).length;
  if (!n) return '';
  return `<button type="button" class="filter" data-filter="${esc(f.sleutel)}" aria-pressed="${i === 0}">${esc(f.label)} <i>${n}</i></button>`;
}).join('');

const js = readFileSync(join(WORTEL, 'tools/gedrag.js'), 'utf8');

const css = [
  readFileSync(join(WORTEL, 'tools/stijl.css'), 'utf8'),
  readFileSync(join(WORTEL, 'tools/extra.css'), 'utf8'),
  readFileSync(join(WORTEL, 'tools/traject.css'), 'utf8'),
  readFileSync(join(WORTEL, 'tools/vloeiend.css'), 'utf8')
].join('\n');

const werkCss = readFileSync(join(WORTEL, 'tools/werkpagina.css'), 'utf8');
const werkJs = readFileSync(join(WORTEL, 'tools/werkpagina.js'), 'utf8');
const contactCss = readFileSync(join(WORTEL, 'tools/contact.css'), 'utf8');
/* Het beheer krijgt niet de hele sitestijl mee: geen showcase, geen
   keuzehulp, geen scrollanimaties. Alleen de basis voor de kleuren, de
   knoppen en het lettertype, plus zijn eigen stijlblad. */
const beheerCss = [
  readFileSync(join(WORTEL, 'tools/stijl.css'), 'utf8'),
  readFileSync(join(WORTEL, 'tools/beheer.css'), 'utf8')
].join('\n');
const beheerJs = readFileSync(join(WORTEL, 'tools/beheer.js'), 'utf8');
const contactJs = readFileSync(join(WORTEL, 'tools/contact.js'), 'utf8');

/* ---------- vindbaar worden ----------
   Titels, canonicals, JSON-LD, sitemap en robots.txt staan in tools/vindbaar.mjs.
   Hier halen we alleen op wat we nodig hebben. */
const { abs, kort, ldJson, hoofd, bedrijf, projectLd, wegwijzers } =
  vindbaar({ site, projecten, esc, zonderVersie });

const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Manrope:wght@400;500;600;700&family=Sora:wght@600;700&display=swap">`;

const middelen = `${fonts}
<style>${css}</style>`;

// het artifact heeft geen eigen <head>, dus daar blijft de titel erbij horen
const kopstuk = `<title>${esc(site.titel)}</title>\n${middelen}`;

const keuzehulp = () => {
  const h = site.keuzehulp;
  return `
<div class="hulptab-houder" id="hulptab-houder" hidden>
  <button type="button" class="hulptab" data-hulp-open>
    <i aria-hidden="true"></i>${esc(h.kop)}
  </button>
  <button type="button" class="hulptab-weg" data-hulp-tab-weg aria-label="Verberg deze knop">&times;</button>
</div>

<div popover="auto" class="hulp" id="hulp" aria-labelledby="hulp-titel">
  <button type="button" class="hulp-sluit" data-hulp-sluit aria-label="Sluiten">&times;</button>
  <div class="hulp-kop">
    <h2 id="hulp-titel">${esc(h.kop)}</h2>
    <p>${esc(h.intro)}</p>
  </div>
  <div class="hulp-stappen" id="hulp-stappen">${h.vragen.map(() => '<i></i>').join('')}<i></i></div>
  <div class="hulp-lijf" id="hulp-lijf"></div>
</div>`;
};

const binnenkant = `<a class="overslaan" href="#werk">Direct naar het werk</a>
<div class="leesbalk" aria-hidden="true"></div>

<header class="balk-boven">
  <div class="binnen">
    <a class="merk" href="#top"><span class="merk-stip"></span>${esc(site.naam)}</a>
    <nav class="menu">
      <a href="#werk">Werk</a>
      <a href="#lagen">Aanpak</a>
      <a href="#traject">Samenwerken</a>
      <a href="${abs('contact/')}">Contact</a>
    </nav>
    <button type="button" class="palet-hint" data-palet-open>
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4.6" stroke="currentColor" stroke-width="1.5"/><path d="M10.6 10.6L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      Zoek <kbd data-palet-toets>Ctrl K</kbd>
    </button>
    <a class="knop knop-klein" href="${abs('contact/')}">Neem contact op</a>
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
      <p class="kop-knoppen">
        <button type="button" class="knop knop-vol" data-hulp-open>Wat past bij jou?</button>
        <a class="knop knop-klein" href="#werk">Of blader zelf door het werk</a>
      </p>
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
      <p class="sectie-uitleg">Bij de meeste bureaus bouwt de een de website en moet je voor alles wat erachter zit bij iemand anders zijn. Ik doe allebei, en juist daar zit de winst: de knop die de klant indrukt en de database die het antwoord geeft zijn samen ontworpen.</p>
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

  <section class="sectie" id="traject">
    <div class="binnen">
      <h2 class="sectie-kop">${esc(site.traject.kop)}</h2>
      <p class="sectie-uitleg">${esc(site.traject.intro)}</p>

      <div class="stroom stroom-los">
        <h4>Zo loopt het</h4>
        <ol class="stappen">
${site.traject.stappen.map((st, i) => `          <li><span class="nr">${i + 1}</span><span class="wat">${esc(st)}</span></li>`).join('\n')}
        </ol>
      </div>

      <div class="blokken">${site.traject.blokken.map(blok).join('')}</div>
    </div>
  </section>

  <section class="sectie" id="contact">
    <div class="binnen">
      <div class="contact">
        <div>
          <h2>Zullen we kijken wat er mogelijk is?</h2>
          <p>Heb je al een website? Plak hem in de scan, dan meet ik hem nu voor je door — snelheid, gewicht, mobiel en wat Google ervan ziet. Je weet binnen een paar seconden of het zin heeft om verder te praten.</p>
          <p><a class="knop knop-vol" href="${abs('contact/')}">Meet mijn site door</a></p>
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
    <p>Alle schermen op deze pagina zijn echte screenshots van de draaiende projecten. Klantgegevens zijn onleesbaar gemaakt. ${esc(site.bedrijf)} · Amersfoort.</p>
    <p class="bijgewerkt">Bijgewerkt ${new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })} · ${aantal} projecten</p>
  </div>
</footer>

<div class="overlay" id="overlay" hidden>
  <div class="venster" role="dialog" aria-modal="true" aria-labelledby="venster-titel" tabindex="-1">
    <button type="button" class="sluit" id="sluit" aria-label="Sluiten">&times;</button>
    <div id="venster-inhoud">${projecten.map((p) => paneel(p)).join('')}</div>
  </div>
</div>

${keuzehulp()}

<div popover="auto" class="palet" id="palet" aria-label="Snel zoeken">
  <div class="palet-veld">
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4.6" stroke="currentColor" stroke-width="1.5"/><path d="M10.6 10.6L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    <input id="palet-invoer" type="text" autocomplete="off" spellcheck="false"
      placeholder="Zoek een project of een onderdeel…" aria-controls="palet-lijst">
  </div>
  <ul class="palet-lijst" id="palet-lijst" role="listbox" aria-label="Resultaten"></ul>
  <p class="palet-voet">
    <span><kbd>&uarr;</kbd> <kbd>&darr;</kbd> kiezen</span>
    <span><kbd>Enter</kbd> openen</span>
    <span><kbd>Esc</kbd> sluiten</span>
  </p>
</div>

<!-- De browser laadt een projectpagina alvast zodra je met je muis in de
     buurt komt. Klik je erop, dan staat hij er al. -->
<script type="speculationrules">
{
  "prerender": [
    { "where": { "href_matches": "/werk/*" }, "eagerness": "moderate" },
    { "where": { "href_matches": "/contact/" }, "eagerness": "moderate" }
  ]
}
</script>

<script type="application/json" id="hulp-data">${JSON.stringify({
  vragen: site.keuzehulp.vragen,
  slot: site.keuzehulp.slot,
  email: site.email,
  projecten: projecten.map((p) => ({
    id: p.id, naam: p.naam, eenRegel: p.eenRegel, tags: p.tags || [], tegel: p.tegel || null,
    // vooraf samengesteld: iemand zoekt op "koffie" of "hovenier", en die
    // woorden staan alleen in de uitgebreide omschrijving
    zoek: [p.naam, p.eenRegel, p.voorWie, (p.tags || []).join(' '), (p.techniek || []).join(' ')]
      .join(' ').toLowerCase()
  }))
}).replace(/</g, '\\u003c')}</script>

${uitlegVensters()}
`;

const script = `<script>${js}</script>`;

const omschrijvingHome = kort(`${site.naam} bouwt websites en bedrijfssoftware voor Nederlandse bedrijven: ` +
  `front-end en back-end, allebei geoptimaliseerd. ${aantal} projecten, ${aantalLive} live.`);

const homeLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': abs('#site'),
      url: abs(''),
      name: site.bedrijf,
      alternateName: site.naam,
      inLanguage: 'nl-NL',
      publisher: { '@id': abs('#bedrijf') }
    },
    bedrijf,
    {
      '@type': 'CollectionPage',
      '@id': abs('#werk'),
      url: abs(''),
      name: 'Het werk',
      isPartOf: { '@id': abs('#site') },
      about: { '@id': abs('#bedrijf') },
      mainEntity: {
        '@type': 'ItemList',
        name: 'Projecten',
        numberOfItems: aantal,
        itemListElement: projecten.map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: p.naam,
          url: abs(`werk/${p.id}/`)
        }))
      }
    }
  ]
};

const pagina = `<!doctype html>
<html lang="nl">
<head>
${hoofd({ titel: site.titel, omschrijving: omschrijvingHome, pad: '' })}
${middelen}
${ldJson(homeLd)}
</head>
<body>
${binnenkant}
${script}
</body>
</html>
`;

// dezelfde pagina zonder eigen <html>-omhulsel, voor publicatie als artifact
const artifact = `${kopstuk}\n${binnenkant}\n${script}\n`;

/* ---------- een echte pagina per project ----------
   Dezelfde inhoud als in het venster, maar op een eigen adres. Bezoekers
   met javascript zien nog steeds het venster (de tegel is een link, het
   script vangt de klik op); zoekmachines en mensen die de link delen
   komen op deze pagina uit. */
function werkPagina(p) {
  const anderen = projecten.filter((q) => q.id !== p.id);
  const titel = `${p.naam} — werk van ${site.bedrijf}`;
  const omschrijving = kort(`${p.eenRegel} ${p.voorWie}`);
  const beeld = p.beelden && p.beelden.length
    ? `img/${p.beelden[0].bestand}`
    : (p.tegel ? `img/${p.tegel}` : null);
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      projectLd(p),
      bedrijf,
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Het werk', item: abs('') },
          { '@type': 'ListItem', position: 2, name: p.naam, item: abs(`werk/${p.id}/`) }
        ]
      }
    ]
  };
  return `<!doctype html>
<html lang="nl">
<head>
${hoofd({ titel, omschrijving, pad: `werk/${p.id}/`, beeld })}
${middelen}
<style>${werkCss}</style>
${ldJson(ld)}
</head>
<body>
<a class="overslaan" href="#project">Direct naar dit project</a>

<header class="balk-boven">
  <div class="binnen">
    <a class="merk" href="/"><span class="merk-stip"></span>${esc(site.naam)}</a>
    <nav class="menu">
      <a href="/#werk">Werk</a>
      <a href="/#lagen">Aanpak</a>
      <a href="/#traject">Samenwerken</a>
      <a href="/contact/">Contact</a>
    </nav>
    <a class="knop knop-klein" href="/contact/">Neem contact op</a>
  </div>
</header>

<main class="los-wikkel" id="project">
  <div class="binnen">
    <nav class="kruimels" aria-label="Kruimelpad">
      <a href="/">${esc(site.naam)}</a> <span aria-hidden="true">/</span>
      <a href="/#werk">Het werk</a> <span aria-hidden="true">/</span>
      <span aria-current="page">${esc(p.naam)}</span>
    </nav>
    <div class="los-doos">${paneel(p, { pre: '/', los: true })}</div>
    <div class="verder">
      <h2>Ander werk van mij</h2>
      <ul>
${anderen.map((q) => `        <li><a href="/werk/${esc(q.id)}/">${esc(q.naam)}</a></li>`).join('\n')}
      </ul>
    </div>
  </div>
</main>

${uitlegVoor(new Set((p.techniek || []).map(zonderVersie)))}

<footer class="voet">
  <div class="binnen">
    <p>Alle schermen hierboven zijn echte screenshots van het draaiende project. Klantgegevens zijn onleesbaar gemaakt. ${esc(site.bedrijf)} · ${esc(site.email)}.</p>
    <p class="bijgewerkt"><a href="/#werk">Terug naar alle ${aantal} projecten</a></p>
  </div>
</footer>
<script>${werkJs}</script>
</body>
</html>
`;
}

const { sitemap, robots } = wegwijzers();

writeFileSync(join(WORTEL, 'index.html'), pagina);
writeFileSync(join(WORTEL, 'artifact.html'), artifact);
writeFileSync(join(WORTEL, 'sitemap.xml'), sitemap);
writeFileSync(join(WORTEL, 'robots.txt'), robots);
const contactMap = join(WORTEL, 'contact');
mkdirSync(contactMap, { recursive: true });
writeFileSync(join(contactMap, 'index.html'), contactPagina({
  site, esc, vet, hoofd, middelen, ldJson, abs, bedrijf, contactCss, contactJs, aantal
}));

const beheerMap = join(WORTEL, 'beheer');
mkdirSync(beheerMap, { recursive: true });
writeFileSync(join(beheerMap, 'index.html'), beheerPagina({ site, esc, fonts, beheerCss, beheerJs }));

const werkMap = join(WORTEL, 'werk');
mkdirSync(werkMap, { recursive: true });
for (const p of projecten) {
  const map = join(werkMap, p.id);
  mkdirSync(map, { recursive: true });
  writeFileSync(join(map, 'index.html'), werkPagina(p));
}
// een project dat uit de lijst gaat, moet ook van het web af: anders blijft
// er een adres bestaan dat Google al kent en dat niemand meer bedoelt
const levend = new Set(projecten.map((p) => p.id));
for (const naam of readdirSync(werkMap)) {
  if (!levend.has(naam)) {
    rmSync(join(werkMap, naam), { recursive: true, force: true });
    console.log(`werk/${naam}/ verwijderd, dat project staat niet meer in de lijst`);
  }
}
console.log(`index.html gebouwd — ${aantal} projecten, ${aantalLive} live`);
console.log(`${projecten.length} projectpagina's onder werk/, plus contact/, beheer/, sitemap.xml en robots.txt`);
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
