// Haalt een openbare website op en meet hem door. Levert de uitkomsten stuk
// voor stuk op, zodat de pagina ze kan tonen op het moment dat ze echt klaar
// zijn in plaats van achteraf allemaal tegelijk.
//
// Wat hier vooral in zit is de bewaking. Een server die op verzoek van een
// bezoeker een adres ophaalt, kan misbruikt worden om binnen het eigen netwerk
// rond te kijken: vul een adres in dat naar 192.168.x.x of naar het
// metadata-adres van de hostingpartij wijst en de server haalt dat braaf op.
// Daarom wordt elk adres eerst omgezet naar een ip en dat ip getoetst, ook na
// elke doorverwijzing.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_BYTES = 3 * 1024 * 1024;   // verder lezen heeft geen zin voor een meting
const MAX_SPRONGEN = 3;
const TIJD_PAGINA = 12000;
const TIJD_KLEIN = 6000;
const MAX_ONDERDELEN = 12;

/* ---------- bewaking ---------- */

function priveIPv4(ip) {
  const d = ip.split('.').map(Number);
  if (d.length !== 4 || d.some((n) => Number.isNaN(n))) return true;
  const [a, b] = d;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;              // link-local, ook de metadata van cloudpartijen
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;                // 192.0.0.0/24
  if (a === 100 && b >= 64 && b <= 127) return true;    // carrier-grade nat
  if (a === 198 && (b === 18 || b === 19)) return true;  // meetnetwerk
  if (a >= 224) return true;                            // multicast en hoger
  return false;
}

function priveIPv6(ip) {
  const k = ip.toLowerCase();
  if (k === '::' || k === '::1') return true;
  if (k.startsWith('fe80') || k.startsWith('fc') || k.startsWith('fd')) return true;
  const mapped = k.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return priveIPv4(mapped[1]);
  return false;
}

async function veiligeURL(ruw) {
  // een adres met een ander voorvoegsel (file:, ftp:, gopher:) hoort er niet
  // bij; zonder deze regel zou 'https://' ervoor geplakt worden en verandert
  // het in iets dat toevallig wel parseert
  if (/^[a-z][a-z0-9+.-]*:/i.test(ruw) && !/^https?:/i.test(ruw)) {
    return { fout: 'Alleen gewone webadressen, dus http of https.' };
  }
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(ruw) ? ruw : 'https://' + ruw);
  } catch {
    return { fout: 'Dat lijkt me geen webadres. Probeer het eens als jouwbedrijf.nl' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { fout: 'Alleen gewone webadressen, dus http of https.' };
  }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host.includes('.') || /\.(local|internal|localhost|test|localdomain)$/i.test(host)) {
    return { fout: 'Dat adres bestaat alleen binnen een netwerk, daar kan ik niet bij.' };
  }
  if (isIP(host)) {
    const prive = isIP(host) === 4 ? priveIPv4(host) : priveIPv6(host);
    if (prive) return { fout: 'Dat is een adres binnen een netwerk, daar kijk ik niet.' };
    return { url: u };
  }
  let adressen;
  try {
    adressen = await lookup(host, { all: true });
  } catch {
    return { fout: 'Dat adres bestaat niet, of de naamserver antwoordt niet.' };
  }
  if (!adressen.length) return { fout: 'Dat adres bestaat niet.' };
  for (const { address, family } of adressen) {
    const prive = family === 4 ? priveIPv4(address) : priveIPv6(address);
    if (prive) return { fout: 'Dat adres wijst naar een netwerk van binnen, daar kijk ik niet.' };
  }
  return { url: u };
}

/* ---------- ophalen ---------- */

// Volgt doorverwijzingen zelf, zodat elke sprong opnieuw getoetst wordt.
async function haal(start, { methode = 'GET', tijd = TIJD_PAGINA, maxBytes = MAX_BYTES } = {}) {
  let huidig = start;
  const sprongen = [];
  for (let i = 0; i <= MAX_SPRONGEN; i++) {
    const check = await veiligeURL(huidig.href);
    if (check.fout) return { fout: check.fout };

    const begin = performance.now();
    let antwoord;
    try {
      antwoord = await fetch(check.url, {
        method: methode,
        redirect: 'manual',
        signal: AbortSignal.timeout(tijd),
        headers: {
          'user-agent': 'EemlandDigital-Sitescan/1.0 (+https://eemland-digital.nl/contact/)',
          accept: 'text/html,application/xhtml+xml,*/*'
        }
      });
    } catch (e) {
      return { fout: e.name === 'TimeoutError' ? 'De site antwoordde niet binnen de tijd.' : 'Ik kreeg geen verbinding met die site.' };
    }
    const koppen = performance.now() - begin;

    if (antwoord.status >= 300 && antwoord.status < 400 && antwoord.headers.get('location')) {
      let volgende;
      try { volgende = new URL(antwoord.headers.get('location'), check.url); } catch { return { fout: 'De site verwijst door naar een adres dat ik niet begrijp.' }; }
      sprongen.push({ van: check.url.href, naar: volgende.href, status: antwoord.status });
      try { await antwoord.body?.cancel(); } catch { /* al dicht */ }
      huidig = volgende;
      continue;
    }

    let bytes = 0;
    let tekst = '';
    if (methode === 'GET' && antwoord.body) {
      const lezer = antwoord.body.getReader();
      const stukken = [];
      while (bytes < maxBytes) {
        const { done, value } = await lezer.read();
        if (done) break;
        bytes += value.length;
        stukken.push(value);
      }
      try { await lezer.cancel(); } catch { /* al klaar */ }
      tekst = Buffer.concat(stukken).toString('utf8');
    } else {
      bytes = Number(antwoord.headers.get('content-length') || 0);
    }

    return {
      url: check.url,
      eindadres: check.url.href,
      status: antwoord.status,
      koppen: Math.round(koppen),
      totaal: Math.round(performance.now() - begin),
      bytes,
      tekst,
      headers: antwoord.headers,
      sprongen
    };
  }
  return { fout: 'De site blijft doorverwijzen.' };
}

/* ---------- lezen van de html ---------- */

const pak = (html, re) => (html.match(re) || [])[1];

function onderdelen(html, basis) {
  const uit = [];
  const voeg = (ruw, soort) => {
    if (!ruw || /^data:|^javascript:|^#/i.test(ruw)) return;
    try {
      const u = new URL(ruw, basis);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
      if (!uit.some((o) => o.href === u.href)) uit.push({ href: u.href, soort });
    } catch { /* onbruikbaar adres, overslaan */ }
  };
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) voeg(m[1], 'beeld');
  for (const m of html.matchAll(/<source[^>]+srcset=["']([^"'\s,]+)/gi)) voeg(m[1], 'beeld');
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) voeg(m[1], 'script');
  for (const m of html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)) voeg(m[1], 'stijl');
  return uit;
}

async function weeg(lijst) {
  const gewogen = await Promise.all(lijst.slice(0, MAX_ONDERDELEN).map(async (o) => {
    try {
      const r = await haal(new URL(o.href), { methode: 'HEAD', tijd: TIJD_KLEIN });
      if (r.fout || !r.status || r.status >= 400) return { ...o, bytes: 0, gelukt: false };
      return { ...o, bytes: r.bytes || 0, type: r.headers?.get('content-type') || '', gelukt: true };
    } catch {
      return { ...o, bytes: 0, gelukt: false };
    }
  }));
  return gewogen;
}

/* ---------- oordelen ---------- */

const kb = (n) => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.round(n / 1024) + ' kB');
const sec = (ms) => (ms >= 1000 ? (ms / 1000).toFixed(1) + ' s' : ms + ' ms');

function oordeel(waarde, goedOnder, beterOnder) {
  if (waarde < goedOnder) return 'goed';
  if (waarde < beterOnder) return 'beter';
  return 'probleem';
}

/* ---------- de scan zelf ---------- */

export async function* scanStroom(ruwAdres) {
  const check = await veiligeURL(ruwAdres);
  if (check.fout) { yield { soort: 'fout', bericht: check.fout }; return; }

  yield { soort: 'start', adres: check.url.href };

  const pagina = await haal(check.url);
  if (pagina.fout) { yield { soort: 'fout', bericht: pagina.fout }; return; }
  if (pagina.status >= 400) {
    yield { soort: 'fout', bericht: `De site antwoordde met een foutcode (${pagina.status}). Staat hij wel online?` };
    return;
  }

  const html = pagina.tekst;
  const eind = new URL(pagina.eindadres);
  const uitkomsten = [];
  const geef = (r) => { uitkomsten.push(r); return { soort: 'uitkomst', ...r }; };

  /* 1. bereikbaar en veilig */
  {
    const https = eind.protocol === 'https:';
    const vanafHttp = pagina.sprongen.some((s) => s.van.startsWith('http://') && s.naar.startsWith('https://'));
    const status = https ? (vanafHttp || check.url.protocol === 'https:' ? 'goed' : 'beter') : 'probleem';
    yield geef({
      sleutel: 'veilig',
      naam: 'Beveiligde verbinding',
      status,
      waarde: https ? 'https, geldig slot' : 'geen https',
      uitleg: https
        ? 'Bezoekers zien een slotje en hun gegevens gaan versleuteld over de lijn.'
        : 'Browsers zetten er "niet veilig" bij, en Google zet zo\'n site lager.',
      advies: https ? null : 'Een certificaat is tegenwoordig gratis. Dit is een half uur werk en het scheelt direct vertrouwen.'
    });
  }

  /* 2. snelheid */
  {
    const status = oordeel(pagina.totaal, 600, 1500);
    yield geef({
      sleutel: 'snelheid',
      naam: 'Hoe snel de pagina binnenkomt',
      status,
      waarde: sec(pagina.totaal),
      meter: Math.max(6, Math.min(100, Math.round((pagina.totaal / 3000) * 100))),
      uitleg: `Eerste antwoord na ${sec(pagina.koppen)}, alles binnen na ${sec(pagina.totaal)}. Gemeten vanaf mijn server in Amsterdam.`,
      advies: status === 'goed' ? null : 'Meestal zit dit in te zware afbeeldingen of in een server die per bezoeker opnieuw aan het rekenen slaat. Allebei op te lossen.'
    });
  }

  /* 3. mobiel */
  {
    const viewport = /<meta[^>]+name=["']viewport["']/i.test(html);
    yield geef({
      sleutel: 'mobiel',
      naam: 'Werkt op een telefoon',
      status: viewport ? 'goed' : 'probleem',
      waarde: viewport ? 'ingesteld voor mobiel' : 'niet ingesteld',
      uitleg: viewport
        ? 'De pagina vertelt de telefoon hoe breed hij zichzelf moet tonen.'
        : 'Zonder die instelling toont een telefoon de pagina uitgezoomd, en Google beoordeelt je site op de mobiele versie.',
      advies: viewport ? null : 'Eén regel in de kop van de pagina, maar de rest van de opmaak moet daarna wel meebewegen.'
    });
  }

  /* 4. gewicht en beelden */
  {
    const gevonden = onderdelen(html, eind);
    const gewogen = await weeg(gevonden);
    const beelden = gewogen.filter((o) => o.soort === 'beeld');
    const totaalBytes = pagina.bytes + gewogen.reduce((n, o) => n + o.bytes, 0);
    const zwaar = beelden.filter((o) => o.bytes > 300 * 1024);
    const modern = beelden.filter((o) => /\.(webp|avif)(\?|$)/i.test(o.href) || /(webp|avif)/i.test(o.type || ''));
    const status = oordeel(totaalBytes, 1024 * 1024, 2.5 * 1024 * 1024);
    const deel = gevonden.length > MAX_ONDERDELEN ? ` (de eerste ${MAX_ONDERDELEN} van ${gevonden.length} onderdelen)` : '';
    yield geef({
      sleutel: 'gewicht',
      naam: 'Hoeveel de pagina weegt',
      status,
      waarde: kb(totaalBytes),
      meter: Math.max(6, Math.min(100, Math.round((totaalBytes / (3 * 1024 * 1024)) * 100))),
      uitleg: `${kb(pagina.bytes)} aan pagina plus ${gewogen.length} onderdelen${deel}. ` +
        (beelden.length
          ? `${beelden.length} afbeeldingen, waarvan ${modern.length} in een modern formaat${zwaar.length ? ` en ${zwaar.length} zwaarder dan 300 kB` : ''}.`
          : gewogen.some((o) => o.soort === 'script')
            ? 'Deze pagina bouwt zichzelf op met javascript, dus de afbeeldingen komen pas later. Ik meet hier alleen wat er in de bron staat.'
            : 'Geen afbeeldingen gevonden in de pagina zelf.'),
      advies: status === 'goed' && !zwaar.length
        ? null
        : 'Dezelfde foto\'s in webp zijn meestal drie tot vijf keer kleiner zonder zichtbaar verschil. Dat doe ik automatisch bij het uploaden, dan kan niemand het vergeten.'
    });
  }

  /* 5. vindbaar op Google */
  {
    const titel = pak(html, /<title[^>]*>([^<]*)<\/title>/i);
    const omschrijving = pak(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
    const h1 = (html.match(/<h1[\s>]/gi) || []).length;
    const canoniek = /<link[^>]+rel=["']canonical["']/i.test(html);
    const ogBeeld = /<meta[^>]+property=["']og:image["']/i.test(html);
    const mist = [];
    if (!titel) mist.push('de pagina heeft helemaal geen titel');
    else if (titel.length > 65) mist.push(`de titel is ${titel.length} tekens en wordt in het zoekresultaat afgeknipt`);
    if (!omschrijving) mist.push('er staat geen omschrijving in, dus Google knipt zelf maar een stukje tekst uit de pagina');
    if (h1 === 0) mist.push('er is geen hoofdkop, dus het is niet duidelijk waar de pagina over gaat');
    else if (h1 > 1) mist.push(`er staan ${h1} hoofdkoppen op de pagina, dat hoort er één te zijn`);
    if (!canoniek) mist.push('er is geen canonical, dan kan dezelfde pagina onder twee adressen dubbel geteld worden');
    if (!ogBeeld) mist.push('er is geen voorbeeldplaatje, dus een link in WhatsApp of LinkedIn blijft kaal');
    const status = mist.length === 0 ? 'goed' : mist.length <= 2 ? 'beter' : 'probleem';
    yield geef({
      sleutel: 'vindbaar',
      naam: 'Wat Google van de pagina ziet',
      status,
      waarde: mist.length ? `${mist.length} van de 5 punten open` : 'alles ingevuld',
      uitleg: titel ? `Je titel is nu: "${titel.slice(0, 80)}${titel.length > 80 ? '…' : ''}"` : 'De pagina heeft helemaal geen titel.',
      advies: mist.length ? `Wat opvalt: ${mist.join('; ')}.` : null
    });
  }

  /* 6. wegwijzers */
  {
    const [robots, sitemap] = await Promise.all([
      haal(new URL('/robots.txt', eind), { tijd: TIJD_KLEIN, maxBytes: 64 * 1024 }),
      haal(new URL('/sitemap.xml', eind), { methode: 'HEAD', tijd: TIJD_KLEIN })
    ]);
    const heeftRobots = !robots.fout && robots.status === 200;
    const heeftSitemap = (!sitemap.fout && sitemap.status === 200) ||
      (heeftRobots && /sitemap:/i.test(robots.tekst || ''));
    const status = heeftRobots && heeftSitemap ? 'goed' : heeftRobots || heeftSitemap ? 'beter' : 'probleem';
    yield geef({
      sleutel: 'wegwijzers',
      naam: 'Wegwijzers voor de zoekmachine',
      status,
      waarde: `${heeftRobots ? 'robots.txt' : 'geen robots.txt'} · ${heeftSitemap ? 'sitemap' : 'geen sitemap'}`,
      uitleg: 'Een sitemap is de lijst met pagina\'s die je Google zelf aanreikt. Zonder die lijst moet hij alles zelf maar tegenkomen.',
      advies: status === 'goed' ? null : 'Deze twee bestanden laat ik automatisch meeschrijven bij elke aanpassing, dan kunnen ze niet verouderen.'
    });
  }

  /* 7. netjes opgeruimd */
  {
    const kopType = pagina.headers?.get('content-type') || '';
    const compressie = pagina.headers?.get('content-encoding') || '';
    const cache = pagina.headers?.get('cache-control') || '';
    const punten = [kopType.includes('charset'), Boolean(compressie), Boolean(cache)].filter(Boolean).length;
    const status = punten === 3 ? 'goed' : punten >= 2 ? 'beter' : 'probleem';
    yield geef({
      sleutel: 'server',
      naam: 'Hoe de server hem uitlevert',
      status,
      waarde: `${punten} van 3 goed ingesteld`,
      uitleg: `Tekensoort ${kopType.includes('charset') ? 'vastgelegd' : 'niet vastgelegd'} · ` +
        `${compressie ? 'ingepakt verstuurd (' + compressie + ')' : 'niet ingepakt'} · ` +
        `${cache ? 'bewaarregels ingesteld' : 'geen bewaarregels'}.`,
      advies: status === 'goed' ? null : 'Dit zijn instellingen op de server, geen werk aan je site zelf. Een middag, en elke bezoeker daarna merkt het.'
    });
  }

  const punten = uitkomsten.reduce((n, r) => n + (r.status === 'goed' ? 1 : r.status === 'beter' ? 0.5 : 0), 0);
  const score = Math.round((punten / uitkomsten.length) * 100);
  yield {
    soort: 'klaar',
    score,
    adres: eind.href,
    aantalGoed: uitkomsten.filter((r) => r.status === 'goed').length,
    aantalBeter: uitkomsten.filter((r) => r.status === 'beter').length,
    aantalProbleem: uitkomsten.filter((r) => r.status === 'probleem').length,
    totaal: uitkomsten.length
  };
}

export { veiligeURL };
