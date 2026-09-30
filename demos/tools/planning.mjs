// De dagplanning van Hovenier Wilgenhof.
//
// De server rekent per ploeg de rit uit: vanaf de loods langs de klussen in
// de gekozen volgorde en weer terug. Reistijd is een schatting op basis van
// hemelsbreedte maal een omweegfactor — dat is geen routeplanner, en de
// demo zegt dat er ook bij. Wat het wél laat zien: of een dagdeel past.

const OMWEG = 1.35;          // wegen lopen nooit rechtdoor
const KMU = 42;              // gemiddelde snelheid met aanhanger door de bebouwde kom
const LADEN = 10;            // minuten uitladen en opruimen per klus

function afstandKm(a, b) {
  const R = 6371;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * OMWEG;
}

const reisMinuten = (a, b) => Math.round((afstandKm(a, b) / KMU) * 60);

function ritVan(data, ploegId, dagdeelId) {
  const dagdeel = data.dagdelen.find((d) => d.id === dagdeelId);
  const klussen = data.klussen
    .filter((k) => k.ploegId === ploegId && k.dagdeel === dagdeelId)
    .sort((a, b) => a.volgorde - b.volgorde);

  let punt = data.bedrijf.basis;
  let reis = 0;
  let km = 0;
  const stappen = [];

  for (const k of klussen) {
    const m = reisMinuten(punt, k);
    reis += m;
    km += afstandKm(punt, k);
    stappen.push({ id: k.id, reisNaartoe: m });
    punt = k;
  }
  const terug = klussen.length ? reisMinuten(punt, data.bedrijf.basis) : 0;
  reis += terug;
  km += klussen.length ? afstandKm(punt, data.bedrijf.basis) : 0;

  const werk = klussen.reduce((n, k) => n + k.minuten + LADEN, 0);
  const totaal = werk + reis;

  return {
    ploegId, dagdeel: dagdeelId,
    klussen: klussen.map((k) => k.id),
    stappen, terug,
    werkMinuten: werk,
    reisMinuten: reis,
    kilometers: Math.round(km * 10) / 10,
    totaal,
    ruimte: dagdeel.minuten - totaal,
    past: totaal <= dagdeel.minuten
  };
}

function beeld(data) {
  const ritten = [];
  for (const p of data.ploegen) {
    for (const d of data.dagdelen) ritten.push(ritVan(data, p.id, d.id));
  }
  const gepland = data.klussen.filter((k) => k.ploegId).length;
  return {
    bedrijf: data.bedrijf,
    kader: data.kader,
    plaatsen: data.plaatsen,
    ploegen: data.ploegen,
    dagdelen: data.dagdelen,
    klussen: data.klussen,
    ritten,
    samen: {
      totaal: data.klussen.length,
      gepland,
      open: data.klussen.length - gepland,
      spoedOpen: data.klussen.filter((k) => k.spoed && !k.ploegId).length,
      kilometers: Math.round(ritten.reduce((n, r) => n + r.kilometers, 0) * 10) / 10,
      teVol: ritten.filter((r) => !r.past).length
    }
  };
}

export async function planning({ actie, methode, invoer, data }) {
  if (!actie || actie === 'dag') return beeld(data);

  /* ---- klus verplaatsen ---- */
  if (actie === 'verplaats' && methode === 'POST') {
    const klus = data.klussen.find((k) => k.id === invoer.id);
    if (!klus) return { fout: 'Die klus bestaat niet.', status: 404 };

    // terug naar de stapel
    if (!invoer.ploegId) {
      klus.ploegId = null; klus.dagdeel = null; klus.volgorde = 0;
      return { ...beeld(data), bericht: `${klus.klant} staat weer open.` };
    }

    const ploeg = data.ploegen.find((p) => p.id === invoer.ploegId);
    const dagdeel = data.dagdelen.find((d) => d.id === invoer.dagdeel);
    if (!ploeg || !dagdeel) return { fout: 'Onbekende ploeg of dagdeel.', status: 400 };

    klus.ploegId = ploeg.id;
    klus.dagdeel = dagdeel.id;
    if (invoer.volgorde != null) {
      klus.volgorde = Number(invoer.volgorde);
    } else {
      const zitten = data.klussen.filter((k) => k.ploegId === ploeg.id && k.dagdeel === dagdeel.id && k.id !== klus.id);
      klus.volgorde = zitten.length + 1;
    }

    // volgorde opnieuw nummeren, anders lopen de nummers scheef na wat schuiven
    const rij = data.klussen
      .filter((k) => k.ploegId === ploeg.id && k.dagdeel === dagdeel.id)
      .sort((a, b) => a.volgorde - b.volgorde || (a.id === klus.id ? -1 : 1));
    rij.forEach((k, i) => { k.volgorde = i + 1; });

    const rit = ritVan(data, ploeg.id, dagdeel.id);
    return {
      ...beeld(data),
      bericht: rit.past
        ? `${klus.klant} ingepland bij ${ploeg.naam}. Die ${dagdeel.naam.toLowerCase()} houdt nog ${rit.ruimte} minuten over.`
        : `Let op: ${ploeg.naam} komt ${Math.abs(rit.ruimte)} minuten tekort in de ${dagdeel.naam.toLowerCase()}.`
    };
  }

  /* ---- volgorde binnen een rit wisselen ---- */
  if (actie === 'schuif' && methode === 'POST') {
    const klus = data.klussen.find((k) => k.id === invoer.id);
    if (!klus || !klus.ploegId) return { fout: 'Die klus staat niet in een rit.', status: 400 };
    const rij = data.klussen
      .filter((k) => k.ploegId === klus.ploegId && k.dagdeel === klus.dagdeel)
      .sort((a, b) => a.volgorde - b.volgorde);
    const i = rij.indexOf(klus);
    const j = invoer.richting === 'omhoog' ? i - 1 : i + 1;
    if (j < 0 || j >= rij.length) return beeld(data);
    rij[i] = rij[j]; rij[j] = klus;
    rij.forEach((k, n) => { k.volgorde = n + 1; });
    return beeld(data);
  }

  /* ---- automatisch verdelen: het dichtstbijzijnde eerst ---- */
  if (actie === 'vulaan' && methode === 'POST') {
    const open = data.klussen.filter((k) => !k.ploegId)
      .sort((a, b) => (b.spoed ? 1 : 0) - (a.spoed ? 1 : 0));
    let geplaatst = 0;

    for (const klus of open) {
      let beste = null;
      for (const p of data.ploegen) {
        for (const d of data.dagdelen) {
          const nu = ritVan(data, p.id, d.id);
          // wat zou het kosten om deze klus achteraan te hangen?
          const laatste = nu.klussen.length
            ? data.klussen.find((k) => k.id === nu.klussen[nu.klussen.length - 1])
            : data.bedrijf.basis;
          const extra = klus.minuten + LADEN + reisMinuten(laatste, klus) +
            reisMinuten(klus, data.bedrijf.basis) - nu.terug;
          if (nu.ruimte - extra < 0) continue;
          const omweg = reisMinuten(laatste, klus);
          if (!beste || omweg < beste.omweg) beste = { p, d, omweg };
        }
      }
      if (beste) {
        klus.ploegId = beste.p.id;
        klus.dagdeel = beste.d.id;
        klus.volgorde = data.klussen.filter((k) => k.ploegId === beste.p.id && k.dagdeel === beste.d.id).length;
        geplaatst++;
      }
    }
    return {
      ...beeld(data),
      bericht: geplaatst
        ? `${geplaatst} ${geplaatst === 1 ? 'klus' : 'klussen'} ingepland, steeds bij de ploeg die er het dichtst langs rijdt.`
        : 'Er paste niets meer bij; alle dagdelen zitten vol.'
    };
  }

  if (actie === 'leeg' && methode === 'POST') {
    for (const k of data.klussen) { k.ploegId = null; k.dagdeel = null; k.volgorde = 0; }
    return { ...beeld(data), bericht: 'Alle klussen staan weer open.' };
  }

  return { fout: 'Onbekende actie.', status: 404 };
}
