// Bouwt site/index.html uit data/site.json en data/projects.json.
// Een nieuw project toevoegen = een blok in projects.json erbij; hier hoeft niets te wijzigen.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { contactPagina } from './contactpagina.mjs';
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
              <span class="staaf-naam">${term(naam)}</span>
              <span class="staaf-spoor"><span class="staaf" style="width:${((n / top) * 100).toFixed(1)}%" title="${esc(naam)}: ${n} ${esc(eenheid)}"></span></span>
              <span class="staaf-waarde">${n}</span>
            </li>`).join('\n')}
          </ul>`;
}

/* ---------- onderdelen ---------- */
function statusStip(status) {
  return `<span class="stip ${esc(status)}" aria-hidden="true"></span>`;
}

function kaart(p, pre = '') {
  const beeld = p.tegel
    ? `<img src="${pre}img/${esc(p.tegel)}" width="760" height="475" loading="lazy" alt="Scherm van ${esc(p.naam)}">`
    : `<span class="geenbeeld">${esc(p.tegelTekst || '').split('\n').map(esc).join('<br>')}</span>`;
  const chips = (p.techniek || []).slice(0, 3)
    .map((t) => `<span>${esc(t)}</span>`).join('');
  return `
        <li class="kaart" data-id="${esc(p.id)}" data-tags="${esc((p.tags || []).join(' '))}" data-zoek="${esc((p.naam + ' ' + p.eenRegel + ' ' + (p.techniek || []).join(' ')).toLowerCase())}">
          <a class="kaart-knop" href="${pre}werk/${esc(p.id)}/" aria-haspopup="dialog">
            <span class="duim">${beeld}</span>
            <span class="kaart-tekst">
              <span class="kaart-status">${statusStip(p.status)}${esc(p.statusLabel)}</span>
              <span class="kaart-naam">${esc(p.naam)}</span>
              <span class="kaart-regel">${esc(p.eenRegel)}</span>
              <span class="kaart-chips">${chips}</span>
            </span>
          </a>
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
        <ul class="raster">${leden.map((p) => kaart(p)).join('')}</ul>
      </section>`;
}

function galerij(p, pre = '') {
  const beelden = p.beelden || [];
  if (!beelden.length) return '';
  const eerste = beelden[0];
  const duimen = beelden.length > 1 ? `
          <div class="duimen" role="tablist" aria-label="Schermen van ${esc(p.naam)}">
${beelden.map((b, i) => `            <button type="button" class="duimknop" role="tab" aria-selected="${i === 0}"
              data-bestand="${esc(b.bestand)}" data-titel="${esc(b.titel)}"
              data-bijschrift="${esc(b.bijschrift)}" data-alt="${esc(b.alt)}">
              <img src="${pre}img/m-${esc(b.bestand)}" width="440" height="275" loading="lazy" alt="${esc(b.titel)}">
            </button>`).join('\n')}
          </div>` : '';
  return `
        <div class="galerij" data-galerij data-basis="${pre}">${duimen}
          <figure class="groot">
            <span class="balk"><i></i><i></i><i></i><b data-rol="titel">${esc(eerste.titel)}</b></span>
            <img data-rol="groot" src="${pre}img/${esc(eerste.bestand)}" width="1400" height="875" loading="lazy" alt="${esc(eerste.alt)}">
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

// los: true levert hetzelfde paneel als losse pagina — zichtbaar, met een h1,
// en zonder de deelknop, want daar is dan de adresbalk voor.
function paneel(p, { pre = '', los = false } = {}) {
  const knop = p.url
    ? `<a class="knop knop-vol" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.urlLabel)}</a>`
    : '';
  const dicht = p.besloten ? `<p class="dicht">${esc(p.besloten)}</p>` : '';
  const schermen = galerij(p, pre);
  const titelTag = los ? 'h1' : 'h2';
  const deel = los
    ? ''
    : `\n          <button type="button" class="deel" data-deel="${esc(p.id)}">Kopieer link naar dit project</button>`;
  return `
      <article class="paneel" id="paneel-${esc(p.id)}" data-id="${esc(p.id)}"${los ? '' : ' hidden'}>
        <header class="paneel-kop">
          <p class="paneel-meta">${statusStip(p.status)}${esc(p.statusLabel)} <span class="punt">·</span> ${esc(p.periode)}</p>
          <${titelTag}>${esc(p.naam)}</${titelTag}>
          <p class="paneel-lead">${esc(p.voorWie)}</p>${deel}
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
            <ul class="techniek">${(p.techniek || []).map((t) => `<li>${term(t)}</li>`).join('')}</ul>
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
          <ul class="techniek">${l.techniek.map((t) => `<li>${term(t)}</li>`).join('')}</ul>
        </article>`;

const blok = (b) => `
        <article class="blok">
          <p class="blok-label">${esc(b.label)}</p>
          <h3>${esc(b.kop)}</h3>
          <ul class="punten">${b.punten.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
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
  readFileSync(join(WORTEL, 'tools/extra.css'), 'utf8'),
  readFileSync(join(WORTEL, 'tools/traject.css'), 'utf8'),
  readFileSync(join(WORTEL, 'tools/vloeiend.css'), 'utf8')
].join('\n');

/* ---------- vaktermen uitleggen ----------
   Op de site staan vijftig termen waar een ondernemer niets aan heeft.
   Elke term die in het woordenboek staat wordt een knopje dat een native
   popover opent. Eén popover per term, hoe vaak de term ook voorkomt —
   anders staan er honderden dezelfde uitleggen in de pagina. */
const woordenboek = site.woordenboek || {};
const sleutelVan = (t) => 'uitleg-' + String(t).toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const gebruikteTermen = new Set();

function term(tekst) {
  const kaal = zonderVersie(tekst);
  const uitleg = woordenboek[kaal];
  if (!uitleg) return esc(tekst);
  gebruikteTermen.add(kaal);
  return `<button type="button" class="term" popovertarget="${sleutelVan(kaal)}">${esc(tekst)}</button>`;
}

const uitlegVoor = (termen) => [...termen].sort()
  .filter((t) => woordenboek[t])
  .map((t) => `<div popover id="${sleutelVan(t)}" class="uitleg"><b>${esc(t)}</b>${esc(woordenboek[t])}</div>`)
  .join('\n');

const uitlegVensters = () => uitlegVoor(gebruikteTermen);
const js = readFileSync(join(WORTEL, 'tools/gedrag.js'), 'utf8');
const werkCss = readFileSync(join(WORTEL, 'tools/werkpagina.css'), 'utf8');
const werkJs = readFileSync(join(WORTEL, 'tools/werkpagina.js'), 'utf8');
const contactCss = readFileSync(join(WORTEL, 'tools/contact.css'), 'utf8');
const contactJs = readFileSync(join(WORTEL, 'tools/contact.js'), 'utf8');

/* ---------- vindbaar worden ----------
   Een zoekmachine ziet alleen wat er letterlijk in de HTML staat, en hij
   rangschikt per adres. Eén pagina met elf verstopte vensters is voor hem
   dus één resultaat; elf echte adressen zijn elf kansen. Daarom krijgt elk
   project hier ook een eigen pagina, met een eigen titel, een eigen
   omschrijving, een canonical (dit is het echte adres, reken de rest niet
   dubbel) en gegevens in JSON-LD, zodat Google weet dat er een persoon en
   een bedrijf achter zitten en niet alleen een hoop plaatjes. */
const DOMEIN = String(site.domein || '').replace(/\/+$/, '');
const abs = (pad) => DOMEIN + '/' + String(pad || '').replace(/^\/+/, '');

// Google knipt een omschrijving rond de 155 tekens af; dan liever zelf,
// op een woordgrens, dan midden in een woord.
function kort(tekst, max = 155) {
  const s = String(tekst ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const knip = s.lastIndexOf(' ', max - 1);
  return s.slice(0, knip > 40 ? knip : max - 1) + '…';
}

const ldJson = (data) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

function hoofd({ titel, omschrijving, pad, beeld, ld }) {
  const adres = abs(pad);
  const plaatje = abs(beeld || 'img/kozijnfabriek-1.webp');
  const verificatie = site.googleVerificatie
    ? `\n<meta name="google-site-verification" content="${esc(site.googleVerificatie)}">`
    : '';
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titel)}</title>
<meta name="description" content="${esc(omschrijving)}">
<link rel="canonical" href="${esc(adres)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="author" content="${esc(site.naam)}">
<meta name="theme-color" content="#0A0D16">
<link rel="icon" href="/img/icoon.svg" type="image/svg+xml">${verificatie}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.bedrijf)}">
<meta property="og:locale" content="nl_NL">
<meta property="og:url" content="${esc(adres)}">
<meta property="og:title" content="${esc(titel)}">
<meta property="og:description" content="${esc(omschrijving)}">
<meta property="og:image" content="${esc(plaatje)}">
<meta property="og:image:alt" content="Scherm uit een van de projecten van ${esc(site.naam)}">
<meta name="twitter:card" content="summary_large_image">`;
}

const alleTechniek = [...new Set(projecten.flatMap((p) => (p.techniek || []).map(zonderVersie)))].sort();

const persoon = {
  '@type': 'Person',
  '@id': abs('#samih'),
  name: site.naam,
  givenName: 'Samih',
  familyName: 'Tichtti',
  jobTitle: 'Webdeveloper — front-end en back-end',
  description: site.onderkop,
  url: abs(''),
  email: `mailto:${site.email}`,
  sameAs: [site.github],
  knowsLanguage: ['nl', 'en'],
  knowsAbout: alleTechniek,
  alumniOf: { '@type': 'CollegeOrUniversity', name: 'Hogeschool van Amsterdam' },
  worksFor: { '@id': abs('#bedrijf') },
  address: { '@type': 'PostalAddress', addressLocality: site.plaats, addressCountry: 'NL' }
};

const bedrijf = {
  '@type': 'ProfessionalService',
  '@id': abs('#bedrijf'),
  name: site.bedrijf,
  alternateName: site.naam,
  description: site.onderkop,
  url: abs(''),
  email: `mailto:${site.email}`,
  image: abs('img/kozijnfabriek-1.webp'),
  founder: { '@id': abs('#samih') },
  employee: { '@id': abs('#samih') },
  priceRange: 'Op aanvraag',
  address: { '@type': 'PostalAddress', addressLocality: site.plaats, addressCountry: 'NL' },
  areaServed: (site.regio || []).map((r) => ({ '@type': 'Place', name: r })),
  knowsAbout: alleTechniek,
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Waar ik je mee kan helpen',
    itemListElement: (site.kunnen || []).map((k) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: k.label, alternateName: k.kop, description: k.tekst }
    }))
  }
};

// Per project: een CreativeWork, zodat Google het project als eigen werk
// leest en niet als losse tekst op een pagina.
function projectLd(p) {
  const werk = {
    '@type': 'CreativeWork',
    '@id': abs(`werk/${p.id}/#project`),
    name: p.naam,
    headline: p.naam,
    description: p.voorWie,
    abstract: p.eenRegel,
    url: abs(`werk/${p.id}/`),
    inLanguage: 'nl-NL',
    author: { '@id': abs('#samih') },
    creator: { '@id': abs('#samih') },
    dateCreated: p.eersteDag,
    dateModified: p.laatsteDag,
    keywords: (p.tags || []).concat((p.techniek || []).map(zonderVersie)).join(', '),
    genre: p.statusLabel
  };
  if (p.beelden && p.beelden.length) werk.image = p.beelden.map((b) => abs(`img/${b.bestand}`));
  if (p.url) werk.sameAs = [p.url];
  return werk;
}

const middelen = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Manrope:wght@400;500;600;700&family=Sora:wght@600;700&display=swap">
<style>${css}</style>`;

// het artifact heeft geen eigen <head>, dus daar blijft de titel erbij horen
const kopstuk = `<title>${esc(site.titel)}</title>\n${middelen}`;

const keuzehulp = () => {
  const h = site.keuzehulp;
  return `
<dialog class="hulp" id="hulp" aria-labelledby="hulp-titel">
  <button type="button" class="hulp-sluit" data-hulp-sluit aria-label="Sluiten">&times;</button>
  <div class="hulp-kop">
    <h2 id="hulp-titel">${esc(h.kop)}</h2>
    <p>${esc(h.intro)}</p>
  </div>
  <div class="hulp-stappen" id="hulp-stappen">${h.vragen.map(() => '<i></i>').join('')}<i></i></div>
  <div class="hulp-lijf" id="hulp-lijf"></div>
</dialog>`;
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
    <p>Alle schermen op deze pagina zijn echte screenshots van de draaiende projecten. Klantgegevens zijn onleesbaar gemaakt. ${esc(site.naam)} · ${esc(site.bedrijf)} · ${esc(site.opleiding)}.</p>
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

<script type="application/json" id="hulp-data">${JSON.stringify({
  vragen: site.keuzehulp.vragen,
  slot: site.keuzehulp.slot,
  email: site.email,
  projecten: projecten.map((p) => ({
    id: p.id, naam: p.naam, eenRegel: p.eenRegel, tags: p.tags || [], tegel: p.tegel || null
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
    persoon,
    bedrijf,
    {
      '@type': 'CollectionPage',
      '@id': abs('#werk'),
      url: abs(''),
      name: 'Het werk',
      isPartOf: { '@id': abs('#site') },
      about: { '@id': abs('#samih') },
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
  const titel = `${p.naam} — project van ${site.naam}`;
  const omschrijving = kort(`${p.eenRegel} ${p.voorWie}`);
  const beeld = p.beelden && p.beelden.length
    ? `img/${p.beelden[0].bestand}`
    : (p.tegel ? `img/${p.tegel}` : null);
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      projectLd(p),
      persoon,
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
    <p>Alle schermen hierboven zijn echte screenshots van het draaiende project. Klantgegevens zijn onleesbaar gemaakt. ${esc(site.naam)} · ${esc(site.bedrijf)} · ${esc(site.email)}.</p>
    <p class="bijgewerkt"><a href="/#werk">Terug naar alle ${aantal} projecten</a></p>
  </div>
</footer>
<script>${werkJs}</script>
</body>
</html>
`;
}

/* ---------- wegwijzers voor de zoekmachine ----------
   Google vindt een nieuw domein niet uit zichzelf: er linkt nog niets naar.
   Een sitemap is de lijst die je hem zelf aanreikt, en de regel in robots.txt
   vertelt waar die lijst staat. */
const vandaag = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${abs('')}</loc>
    <lastmod>${vandaag}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${abs('contact/')}</loc>
    <lastmod>${vandaag}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
${projecten.map((p) => `  <url>
    <loc>${abs(`werk/${p.id}/`)}</loc>
    <lastmod>${p.laatsteDag || vandaag}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n')}
</urlset>
`;

const robots = `User-agent: *
Allow: /

Sitemap: ${abs('sitemap.xml')}
`;

writeFileSync(join(WORTEL, 'index.html'), pagina);
writeFileSync(join(WORTEL, 'artifact.html'), artifact);
writeFileSync(join(WORTEL, 'sitemap.xml'), sitemap);
writeFileSync(join(WORTEL, 'robots.txt'), robots);
const contactMap = join(WORTEL, 'contact');
mkdirSync(contactMap, { recursive: true });
writeFileSync(join(contactMap, 'index.html'), contactPagina({
  site, esc, vet, hoofd, middelen, ldJson, abs, persoon, bedrijf, contactCss, contactJs, aantal
}));

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
console.log(`${projecten.length} projectpagina's onder werk/, plus sitemap.xml en robots.txt`);
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
