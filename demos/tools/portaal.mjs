// Het klantportaal van Van Dijk Installatie.
//
// Waar het hier om draait: wie wat mag zien wordt hier bepaald, op de
// server, en nergens anders. Het scherm verbergt wel dingen, maar dat is
// alleen netjes — het is geen beveiliging. Wie het adres van een document
// van een andere klant intypt, krijgt hieronder een nee, en dat is de enige
// plek waar dat nee echt telt.
//
// Daarom staat in elk antwoord ook een regel `bewaking`: die vertelt de
// bezoeker wat de server zojuist heeft gecontroleerd. Normaal zie je dat
// nooit; in een demo is het juist het interessantste deel.

const MAX_POGINGEN = 5;

function schoon(gebruiker) {
  if (!gebruiker) return null;
  const { wachtwoord, ...rest } = gebruiker;   // een wachtwoord verlaat de server niet
  return rest;
}

function mag(gebruiker, klantId) {
  if (!gebruiker) return false;
  if (gebruiker.rol === 'medewerker') return true;
  return gebruiker.klantId === klantId;
}

function dossier(data, klantId) {
  const klant = data.klanten.find((k) => k.id === klantId);
  if (!klant) return null;
  return {
    klant,
    documenten: data.documenten.filter((d) => d.klantId === klantId)
      .sort((a, b) => b.datum.localeCompare(a.datum)),
    afspraken: data.afspraken.filter((a) => a.klantId === klantId)
      .sort((a, b) => a.datum.localeCompare(b.datum))
  };
}

export async function portaal({ actie, methode, invoer, data, url }) {
  const ik = data.gebruikers.find((g) => g.id === data.ingelogdAls) || null;

  /* ---- inloggen ---- */
  if (actie === 'inloggen' && methode === 'POST') {
    if (data.pogingen >= MAX_POGINGEN) {
      return { fout: 'Te vaak mis. Herstel de demo om het opnieuw te proberen.', status: 429 };
    }
    const email = String(invoer.email || '').trim().toLowerCase();
    const gevonden = data.gebruikers.find((g) => g.email.toLowerCase() === email);

    // bewust één en dezelfde melding: anders kun je raden welke adressen
    // bestaan door te kijken welke foutmelding je terugkrijgt
    if (!gevonden || gevonden.wachtwoord !== String(invoer.wachtwoord || '')) {
      data.pogingen += 1;
      return {
        fout: 'Dat e-mailadres en wachtwoord horen niet bij elkaar.',
        resterend: MAX_POGINGEN - data.pogingen,
        status: 401
      };
    }
    data.pogingen = 0;
    data.ingelogdAls = gevonden.id;
    return {
      ik: schoon(gevonden),
      bewaking: gevonden.rol === 'medewerker'
        ? 'Ingelogd als medewerker — je mag elk dossier openen.'
        : `Ingelogd als klant — je mag alleen dossier ${gevonden.klantId} openen.`
    };
  }

  if (actie === 'uitloggen' && methode === 'POST') {
    data.ingelogdAls = null;
    return { ik: null };
  }

  /* ---- alles hieronder vereist een inlog ---- */
  if (actie === 'ik') {
    return { ik: schoon(ik), bedrijf: data.bedrijf };
  }

  if (!ik) return { fout: 'Je bent niet ingelogd.', status: 401 };

  if (actie === 'overzicht') {
    if (ik.rol === 'medewerker') {
      return {
        ik: schoon(ik),
        bedrijf: data.bedrijf,
        rol: 'medewerker',
        klanten: data.klanten.map((k) => ({
          ...k,
          open: data.documenten.filter((d) => d.klantId === k.id && d.status === 'open').length,
          teAkkorderen: data.documenten.filter((d) => d.klantId === k.id && d.status === 'wacht op akkoord').length,
          volgende: data.afspraken.filter((a) => a.klantId === k.id).sort((a, b) => a.datum.localeCompare(b.datum))[0] || null
        })),
        bewaking: `Je bent medewerker, dus de server stuurt alle ${data.klanten.length} dossiers mee.`
      };
    }
    const d = dossier(data, ik.klantId);
    return {
      ik: schoon(ik), bedrijf: data.bedrijf, rol: 'klant', ...d,
      bewaking: `De server heeft alleen de gegevens van ${d.klant.naam} opgezocht. De andere ${data.klanten.length - 1} dossiers zijn nooit ingeladen.`
    };
  }

  /* ---- één dossier openen: hier zit de controle ---- */
  if (actie === 'dossier') {
    const klantId = url.searchParams.get('klant');
    if (!mag(ik, klantId)) {
      return {
        fout: `Je hebt geen toegang tot dossier ${klantId}.`,
        bewaking: `Geweigerd. Je bent ingelogd als ${ik.rol}${ik.klantId ? ` van dossier ${ik.klantId}` : ''} en vroeg om ${klantId}.`,
        status: 403
      };
    }
    const d = dossier(data, klantId);
    if (!d) return { fout: 'Dat dossier bestaat niet.', status: 404 };
    return { ...d, ik: schoon(ik), bewaking: `Toegestaan. ${ik.rol === 'medewerker' ? 'Medewerkers mogen elk dossier.' : 'Dit is je eigen dossier.'}` };
  }

  /* ---- één document ophalen ---- */
  if (actie === 'document') {
    const id = url.searchParams.get('id');
    const doc = data.documenten.find((d) => d.id === id);
    if (!doc) return { fout: 'Dat document bestaat niet.', status: 404 };
    if (!mag(ik, doc.klantId)) {
      return {
        fout: `Document ${id} hoort bij een andere klant.`,
        bewaking: `Geweigerd. ${id} hoort bij dossier ${doc.klantId}, jij mag ${ik.klantId}.`,
        status: 403
      };
    }
    const klant = data.klanten.find((k) => k.id === doc.klantId);
    return { document: doc, klant, bewaking: `Toegestaan. ${id} hoort bij dossier ${doc.klantId}.` };
  }

  /* ---- offerte accepteren of afwijzen ---- */
  if (actie === 'offerte' && methode === 'POST') {
    const doc = data.documenten.find((d) => d.id === invoer.id);
    if (!doc) return { fout: 'Die offerte bestaat niet.', status: 404 };
    if (!mag(ik, doc.klantId)) {
      return { fout: 'Dat is niet jouw offerte.', bewaking: `Geweigerd. ${invoer.id} hoort bij dossier ${doc.klantId}.`, status: 403 };
    }
    if (doc.soort !== 'offerte') return { fout: 'Dat is geen offerte.', status: 400 };
    if (doc.status !== 'wacht op akkoord') return { fout: `Deze offerte is al ${doc.status}.`, status: 409 };

    doc.status = invoer.akkoord ? 'akkoord' : 'afgewezen';
    doc.beslotenOp = new Date().toISOString().slice(0, 10);
    data.meldingen.unshift({
      tekst: `${doc.titel} is ${doc.status} door ${ik.naam}.`,
      op: new Date().toISOString()
    });
    return {
      document: doc,
      bewaking: `Toegestaan en opgeslagen. Van Dijk krijgt hier bericht van.`
    };
  }

  /* ---- storing melden ---- */
  if (actie === 'storing' && methode === 'POST') {
    const omschrijving = String(invoer.omschrijving || '').trim();
    if (omschrijving.length < 10) {
      return { fout: 'Vertel iets meer, dan kan de monteur zich voorbereiden (minstens tien tekens).', status: 400 };
    }
    const klantId = ik.rol === 'medewerker' ? invoer.klantId : ik.klantId;
    if (!mag(ik, klantId)) return { fout: 'Niet jouw dossier.', status: 403 };

    const nieuw = {
      id: 'a' + (data.afspraken.length + 1) + Date.now().toString(36).slice(-3),
      klantId,
      datum: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
      dagdeel: invoer.spoed ? 'zo snel mogelijk' : 'ochtend',
      omschrijving: (invoer.spoed ? 'SPOED — ' : '') + omschrijving.slice(0, 200),
      monteur: 'nog toewijzen'
    };
    data.afspraken.push(nieuw);
    return {
      afspraak: nieuw,
      bewaking: `Opgeslagen bij dossier ${klantId}${ik.rol === 'klant' ? ' — de server negeert een meegestuurd ander dossier' : ''}.`
    };
  }

  return { fout: 'Onbekende actie.', status: 404 };
}
