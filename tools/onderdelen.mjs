// De bouwstenen van de pagina: een tegel, een groep, een galerij, een
// paneel. Ze stonden midden in build.mjs tussen het inlezen en het
// wegschrijven; hier bij elkaar zie je in één oogopslag waar een stukje
// scherm vandaan komt.
//
// Let op de inspringing: de sjablonen hieronder staan bewust niet ingesprongen.
// Wat in een template-literal staat komt letterlijk in de HTML terecht, dus
// een extra tab hier is een extra tab in de uitgeleverde pagina.

export function maakOnderdelen({ site, projecten, esc, vet, gecontroleerd, zonderVersie }) {

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
        <li class="kaart" data-id="${esc(p.id)}" data-tags="${esc((p.tags || []).join(' '))}" data-zoek="${esc((p.naam + ' ' + p.eenRegel + ' ' + (p.voorWie || '') + ' ' + (p.techniek || []).join(' ')).toLowerCase())}">
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

// hoe vaak komt elk ding voor, meest voorkomende eerst
function tel(lijst) {
  const m = new Map();
  for (const x of lijst) m.set(x, (m.get(x) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

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

  return { statusStip, kaart, groep, galerij, stroom, paneel, laag, blok, kunde,
    balkje, staven, tel, term, uitlegVoor, uitlegVensters };
}
