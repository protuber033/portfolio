// Structuur- en taalnaloop over de gebouwde pagina's en de gegevens.
//
// Dit zijn de fouten die niets laten crashen en dus door elke gewone
// controle heen glippen: een dubbele id, een knop in een link, een beeld
// zonder alt, een dode interne link, of dezelfde term op twee manieren
// geschreven. Je ziet ze pas als iemand ze je vertelt.
//
// Beide functies melden niets zelf; ze geven terug wat ze vonden, zodat
// controle.mjs het op zijn eigen manier kan tonen.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/* ---------- structuur ---------- */

export function structuur(WORTEL) {
  const fouten = [];
  const waarschuwingen = [];
  const paginas = [
    'index.html',
    'contact/index.html',
    ...readdirSync(join(WORTEL, 'werk')).map((d) => `werk/${d}/index.html`)
  ];
  const beelden = new Set(existsSync(join(WORTEL, 'img')) ? readdirSync(join(WORTEL, 'img')) : []);

  for (const bestand of paginas) {
    const ruw = readFileSync(join(WORTEL, bestand), 'utf8');
    // script- en style-blokken eruit: daar staat code, geen opmaak
    const h = ruw.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');

    const ids = [...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const geteld = {};
    ids.forEach((i) => { geteld[i] = (geteld[i] || 0) + 1; });
    const dubbel = Object.entries(geteld).filter(([, n]) => n > 1);
    if (dubbel.length) fouten.push(`${bestand}: dubbele id's — ${dubbel.map(([i, n]) => `${i} (${n}x)`).join(', ')}`);

    const genest = h.match(/<a\b[^>]*>(?:(?!<\/a>)[\s\S]){0,4000}?<button\b/g);
    if (genest) fouten.push(`${bestand}: ${genest.length}x een <button> binnen een <a> — ongeldige html`);

    const zonderAlt = h.match(/<img\b(?![^>]*\balt=)[^>]*>/g);
    if (zonderAlt) fouten.push(`${bestand}: ${zonderAlt.length} afbeelding(en) zonder alt`);

    for (const m of h.matchAll(/<img[^>]+src="([^"]+)"/g)) {
      const src = m[1];
      if (/^(https?:)?\/\//.test(src) || src.startsWith('data:')) continue;
      if (!beelden.has(src.replace(/^\/?img\//, ''))) fouten.push(`${bestand}: beeld ontbreekt — ${src}`);
    }

    for (const m of h.matchAll(/href="(\/[^"#?]*)"/g)) {
      const doel = m[1];
      if (doel.startsWith('/img/')) {
        if (!beelden.has(doel.slice(5))) fouten.push(`${bestand}: dode link — ${doel}`);
        continue;
      }
      const kale = doel.replace(/^\//, '');
      if (![kale, join(kale, 'index.html')].some((k) => existsSync(join(WORTEL, k)))) {
        fouten.push(`${bestand}: dode link — ${doel}`);
      }
    }

    for (const m of h.matchAll(/href="#([^"]+)"/g)) {
      if (!ids.includes(m[1])) fouten.push(`${bestand}: anker #${m[1]} bestaat niet op deze pagina`);
    }

    if (/<h[1-6][^>]*>\s*<\/h[1-6]>/.test(h)) fouten.push(`${bestand}: lege kop`);
    const lege = h.match(/<a\b[^>]*>\s*<\/a>/g);
    if (lege) fouten.push(`${bestand}: ${lege.length} lege link(s)`);

    for (const m of h.matchAll(/<button\b((?:(?!>)[\s\S])*)>\s*<\/button>/g)) {
      if (!/aria-label=/.test(m[1])) fouten.push(`${bestand}: knop zonder tekst en zonder aria-label`);
    }

    // inline tags wég in plaats van vervangen door een spatie, anders lees je
    // "<strong>voor</strong>." als "voor ." en meld je een fout die er niet is
    const plat = h.replace(/<\/?(strong|em|b|i|span|a|code|small|abbr)\b[^>]*>/g, '')
      .replace(/<[^>]*>/g, ' ');
    const leesteken = plat.match(/\S+\s+[.,?!](?=\s|$)/g);
    if (leesteken) waarschuwingen.push(`${bestand}: spatie voor een leesteken — ${[...new Set(leesteken)].slice(0, 3).join(' | ')}`);
    const kapot = plat.match(/Ã.|â€./g);
    if (kapot) fouten.push(`${bestand}: verkeerd gecodeerde tekens — ${[...new Set(kapot)].slice(0, 4).join(' ')}`);
  }

  return { fouten, waarschuwingen, aantal: paginas.length };
}

/* ---------- taal ---------- */

export function taal(WORTEL) {
  const fouten = [];
  const waarschuwingen = [];
  const teksten = [];

  const oogst = (o, pad, bron) => {
    if (typeof o === 'string') { if (o.length > 3) teksten.push({ bron, pad, t: o }); return; }
    if (Array.isArray(o)) return o.forEach((x, i) => oogst(x, `${pad}[${i}]`, bron));
    if (o && typeof o === 'object') return Object.entries(o).forEach(([k, v]) => oogst(v, pad ? `${pad}.${k}` : k, bron));
  };
  const bronnen = ['data/site.json', 'data/projects.json'];
  if (existsSync(join(WORTEL, 'demos/data'))) {
    for (const f of readdirSync(join(WORTEL, 'demos/data'))) bronnen.push(`demos/data/${f}`);
  }
  for (const b of bronnen) oogst(JSON.parse(readFileSync(join(WORTEL, b), 'utf8')), '', b);

  const zichtbaar = teksten.filter((x) =>
    !/^https?:|^[\w.-]+@|^#|^\/|\.(webp|png|jpg|svg|json|mjs|js|css)$/i.test(x.t) &&
    !/^[a-z0-9-]+$/.test(x.t));

  // dezelfde term op twee manieren geschreven valt een lezer op, ook al is
  // geen van beide fout. Een hoofdletter aan het begin van een zin telt niet
  // mee: dat is spelling, geen afwijking.
  const paren = [
    [/\bpdf\b/gi, 'pdf'], [/\bssl\b/gi, 'ssl'], [/\bbtw\b/gi, 'btw'],
    [/\bjava\s?script\b/gi, 'javascript'], [/\bi-?deal\b/gi, 'iDEAL'],
    [/\bweb\s?shop\b/gi, 'webshop'], [/\be-?mailadres\b/gi, 'e-mailadres']
  ];
  for (const [re, naam] of paren) {
    const vormen = new Map();
    for (const x of zichtbaar) {
      for (const m of x.t.matchAll(re)) {
        const voor = x.t.slice(0, m.index).replace(/\s+$/, '');
        if ((voor === '' || /[.!?:—]$/.test(voor)) && /^[A-Z]/.test(m[0])) continue;
        if (!vormen.has(m[0])) vormen.set(m[0], []);
        vormen.get(m[0]).push(`${x.bron} ${x.pad}`);
      }
    }
    if (vormen.size > 1) {
      waarschuwingen.push(`"${naam}" op ${vormen.size} manieren: ` +
        [...vormen.entries()].map(([v, w]) => `${v} (${w.length}x, ${w[0]})`).join(' · '));
    }
  }

  for (const x of zichtbaar) {
    for (const m of x.t.match(/\b(\w{2,})\s+\1\b/gi) || []) fouten.push(`${x.bron} ${x.pad}: "${m}" staat er twee keer`);
    if (/Ã.|â€|Â/.test(x.t)) fouten.push(`${x.bron} ${x.pad}: verkeerd gecodeerde tekens`);
    for (const m of x.t.match(/[a-z],[a-zA-Z]/g) || []) fouten.push(`${x.bron} ${x.pad}: komma zonder spatie — "${m}"`);
    if (/\s"[^"]+"/.test(x.t)) waarschuwingen.push(`${x.bron} ${x.pad}: rechte aanhalingstekens (elders staat “…”)`);
  }

  return { fouten, waarschuwingen, aantal: zichtbaar.length };
}
