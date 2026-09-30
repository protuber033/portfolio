// Het dashboard van Kempen Transport.
//
// Dit is de enige demo waar de server uit zichzelf blijft praten. Hij houdt
// een open verbinding vast (server-sent events) en duwt er een regel doorheen
// zodra er iets gebeurt. Geen pagina die elke vijf seconden opnieuw vraagt of
// er nog nieuws is — dat scheelt verkeer en het voelt direct.
//
// Elke bezoeker heeft zijn eigen vloot, dus de klok tikt per bezoeker. Zet je
// twee tabbladen open, dan hangen ze aan dezelfde stroom en zie je hetzelfde
// gebeuren. Sluit je alles, dan stopt de simulatie vanzelf.

const TIK = 2600;

// per sessie: de open verbindingen en de klok die erbij hoort
const kanalen = new WeakMap();

function kanaalVan(data) {
  if (!kanalen.has(data)) kanalen.set(data, { luisteraars: new Set(), klok: null });
  return kanalen.get(data);
}

const kies = (l) => l[Math.floor(Math.random() * l.length)];

function nieuweGebeurtenis(data) {
  const rijdend = data.wagens.filter((w) => w.status === 'onderweg');
  const soort = Math.random();

  // een rit afronden is het vaakst
  if (rijdend.length && soort < 0.62) {
    const w = kies(rijdend);
    const vertraging = Math.random() < 0.18 ? 3 + Math.floor(Math.random() * 22) : 0;
    const km = 8 + Math.floor(Math.random() * 46);
    w.ritten += 1;
    const was = w.volgende;
    w.volgende = kies(data.plaatsen);

    data.teller.ritten += 1;
    data.teller.kilometers += km;
    if (vertraging) { data.teller.teLaat += 1; data.teller.vertragingMinuten += vertraging; }
    else data.teller.opTijd += 1;

    return {
      soort: vertraging ? 'telaat' : 'gelost',
      tekst: vertraging
        ? `${w.kenteken} loste in ${was} met ${vertraging} min vertraging`
        : `${w.kenteken} loste op tijd in ${was}`,
      wagen: w.id, kilometers: km, vertraging
    };
  }

  // of een wagen wisselt van toestand
  const w = kies(data.wagens.filter((x) => x.status !== 'werkplaats'));
  if (!w) return null;
  const volgorde = { onderweg: 'laden', laden: 'onderweg', pauze: 'onderweg' };
  const nieuw = volgorde[w.status] || 'onderweg';
  w.status = nieuw;
  if (nieuw === 'onderweg' && !w.volgende) w.volgende = kies(data.plaatsen);
  return {
    soort: 'status',
    tekst: `${w.kenteken} (${w.chauffeur.split(' ')[0]}) is nu ${nieuw}`,
    wagen: w.id
  };
}

function momentopname(data) {
  const t = data.teller;
  const totaal = t.opTijd + t.teLaat;
  return {
    bedrijf: data.bedrijf,
    wagens: data.wagens,
    kengetallen: {
      ritten: t.ritten,
      opTijdPercentage: totaal ? Math.round((t.opTijd / totaal) * 1000) / 10 : 100,
      kilometers: t.kilometers,
      teLaat: t.teLaat,
      gemiddeldeVertraging: t.teLaat ? Math.round((t.vertragingMinuten / t.teLaat) * 10) / 10 : 0,
      onderweg: data.wagens.filter((w) => w.status === 'onderweg').length,
      inBedrijf: data.wagens.filter((w) => w.status !== 'werkplaats').length
    },
    geschiedenis: data.geschiedenis.slice(-30),
    gebeurtenissen: data.gebeurtenissen.slice(0, 14)
  };
}

function tik(data) {
  const g = nieuweGebeurtenis(data);
  if (g) {
    g.op = new Date().toISOString();
    data.gebeurtenissen.unshift(g);
    if (data.gebeurtenissen.length > 60) data.gebeurtenissen.length = 60;
  }
  // één punt per tik voor de grafiek: hoeveel ritten er in dit venster af kwamen
  const laatste = data.geschiedenis[data.geschiedenis.length - 1];
  const geleverd = g && (g.soort === 'gelost' || g.soort === 'telaat') ? 1 : 0;
  data.geschiedenis.push({
    op: Date.now(),
    ritten: (laatste ? laatste.ritten : 0) + geleverd,
    perTik: geleverd,
    onderweg: data.wagens.filter((w) => w.status === 'onderweg').length
  });
  if (data.geschiedenis.length > 120) data.geschiedenis.shift();
  return g;
}

export async function vloot({ actie, data, res }) {
  /* ---- de open verbinding ---- */
  if (actie === 'stroom') {
    const kanaal = kanaalVan(data);

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no'
    });

    const stuur = (naam, waarde) => {
      try { res.write(`event: ${naam}\ndata: ${JSON.stringify(waarde)}\n\n`); } catch { /* al weg */ }
    };

    stuur('begin', momentopname(data));
    kanaal.luisteraars.add(res);

    if (!kanaal.klok) {
      kanaal.klok = setInterval(() => {
        const g = tik(data);
        const pakket = { gebeurtenis: g, ...momentopname(data) };
        for (const l of kanaal.luisteraars) {
          try { l.write(`event: tik\ndata: ${JSON.stringify(pakket)}\n\n`); } catch { kanaal.luisteraars.delete(l); }
        }
      }, TIK);
      kanaal.klok.unref?.();
    }

    const opruimen = () => {
      kanaal.luisteraars.delete(res);
      // niemand kijkt meer, dus ook niets meer te simuleren
      if (!kanaal.luisteraars.size && kanaal.klok) {
        clearInterval(kanaal.klok);
        kanaal.klok = null;
      }
    };
    res.on('close', opruimen);
    res.on('error', opruimen);
    return undefined;                    // we hebben zelf geantwoord
  }

  if (!actie || actie === 'nu') return momentopname(data);

  return { fout: 'Onbekende actie.', status: 404 };
}
