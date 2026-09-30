// De webshop van Kaap Noord.
//
// Alles wat er in een echte winkel mis kan gaan zit hier ook in: voorraad die
// op is terwijl iemand nog in de mand kijkt, een kortingscode die niet
// bestaat, en een betaling die mislukt. Dat laatste is de reden dat voorraad
// pas afgaat bij een geslaagde betaling en niet al bij het afrekenen — anders
// verdwijnt je voorraad in afgebroken bestellingen.
import { randomUUID } from 'node:crypto';

const BTW = 0.09;                 // levensmiddelen in Nederland

const centen = (n) => Math.round(n);

function regelsMetProduct(data) {
  return data.mand.map((r) => {
    const p = data.producten.find((x) => x.id === r.productId);
    const maling = data.malingen.find((m) => m.id === r.maling);
    return {
      ...r,
      naam: p ? p.naam : 'onbekend',
      type: p ? p.type : '',
      kleur: p ? p.kleur : '#888',
      kleur2: p ? p.kleur2 : '#bbb',
      malingNaam: maling ? maling.naam : r.maling,
      stuksprijs: p ? p.prijs : 0,
      voorraad: p ? p.voorraad : 0,
      regelTotaal: centen((p ? p.prijs : 0) * r.aantal)
    };
  });
}

function rekenen(data, bezorgingId) {
  const regels = regelsMetProduct(data);
  const subtotaal = regels.reduce((n, r) => n + r.regelTotaal, 0);

  let korting = 0;
  if (data.korting) {
    korting = data.korting.soort === 'procent'
      ? centen((subtotaal * data.korting.waarde) / 100)
      : Math.min(data.korting.waarde, subtotaal);
  }

  const bezorging = data.bezorging.find((b) => b.id === bezorgingId) || null;
  let bezorgkosten = 0;
  if (bezorging) {
    const na = subtotaal - korting;
    bezorgkosten = bezorging.gratisVanaf && na >= bezorging.gratisVanaf ? 0 : bezorging.prijs;
  }

  const totaal = Math.max(0, subtotaal - korting + bezorgkosten);
  // in Nederland staan prijzen inclusief btw, dus we rekenen hem eruit
  const btw = centen(totaal - totaal / (1 + BTW));

  return {
    regels, subtotaal, korting, bezorgkosten, totaal, btw,
    aantalStuks: regels.reduce((n, r) => n + r.aantal, 0),
    gratisVanaf: bezorging ? bezorging.gratisVanaf : 0
  };
}

function beeld(data) {
  return {
    winkel: data.winkel,
    producten: data.producten,
    malingen: data.malingen,
    bezorging: data.bezorging,
    korting: data.korting,
    bestellingen: data.bestellingen.map((b) => ({ ...b, regels: undefined })),
    ...rekenen(data, null)
  };
}

export async function koffie({ actie, methode, invoer, data, url }) {
  /* ---- de winkel bekijken ---- */
  if (!actie || actie === 'winkel') return beeld(data);

  if (actie === 'rekenen') {
    return { ...rekenen(data, invoer.bezorging || url.searchParams.get('bezorging')) };
  }

  /* ---- mand ---- */
  if (actie === 'mand/toevoegen' && methode === 'POST') {
    const p = data.producten.find((x) => x.id === invoer.productId);
    if (!p) return { fout: 'Dat product bestaat niet.', status: 404 };
    if (!data.malingen.some((m) => m.id === invoer.maling)) {
      return { fout: 'Kies eerst hoe we het moeten malen.', status: 400 };
    }
    const aantal = Math.max(1, Math.min(20, Number(invoer.aantal) || 1));

    const alIn = data.mand
      .filter((r) => r.productId === p.id)
      .reduce((n, r) => n + r.aantal, 0);
    if (p.voorraad === 0) return { fout: `${p.naam} is uitverkocht.`, status: 409 };
    if (alIn + aantal > p.voorraad) {
      return {
        fout: `We hebben nog ${p.voorraad} zak ${p.naam} op de plank${alIn ? `, en je hebt er al ${alIn} in je mand` : ''}.`,
        status: 409
      };
    }

    // dezelfde koffie met dezelfde maling wordt één regel
    const bestaand = data.mand.find((r) => r.productId === p.id && r.maling === invoer.maling);
    if (bestaand) bestaand.aantal += aantal;
    else data.mand.push({ regelId: randomUUID().slice(0, 8), productId: p.id, maling: invoer.maling, aantal });

    return { ...beeld(data), bericht: `${p.naam} toegevoegd.` };
  }

  if (actie === 'mand/wijzig' && methode === 'POST') {
    const regel = data.mand.find((r) => r.regelId === invoer.regelId);
    if (!regel) return { fout: 'Die regel staat niet meer in je mand.', status: 404 };
    const aantal = Number(invoer.aantal) || 0;
    if (aantal <= 0) {
      data.mand = data.mand.filter((r) => r.regelId !== invoer.regelId);
      return beeld(data);
    }
    const p = data.producten.find((x) => x.id === regel.productId);
    const andere = data.mand
      .filter((r) => r.productId === regel.productId && r.regelId !== regel.regelId)
      .reduce((n, r) => n + r.aantal, 0);
    if (andere + aantal > p.voorraad) {
      return { fout: `Meer dan ${p.voorraad} zak ${p.naam} hebben we niet.`, status: 409 };
    }
    regel.aantal = Math.min(20, aantal);
    return beeld(data);
  }

  if (actie === 'mand/leeg' && methode === 'POST') {
    data.mand = [];
    data.korting = null;
    return beeld(data);
  }

  /* ---- kortingscode ---- */
  if (actie === 'korting' && methode === 'POST') {
    const code = String(invoer.code || '').trim().toUpperCase();
    if (!code) { data.korting = null; return beeld(data); }
    const gevonden = data.kortingen.find((k) => k.code === code);
    if (!gevonden) return { fout: `De code ${code} kennen we niet.`, status: 404 };
    data.korting = gevonden;
    return { ...beeld(data), bericht: gevonden.toelichting + ' toegepast.' };
  }

  /* ---- afrekenen ---- */
  if (actie === 'afrekenen' && methode === 'POST') {
    if (!data.mand.length) return { fout: 'Je mand is leeg.', status: 400 };

    const bezorging = data.bezorging.find((b) => b.id === invoer.bezorging);
    if (!bezorging) return { fout: 'Kies hoe we het moeten bezorgen.', status: 400 };

    const g = invoer.gegevens || {};
    const mist = [];
    if (!String(g.naam || '').trim()) mist.push('je naam');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(g.email || ''))) mist.push('een geldig e-mailadres');
    if (bezorging.id !== 'afhalen') {
      if (!/^\d{4}\s?[a-zA-Z]{2}$/.test(String(g.postcode || '').trim())) mist.push('een geldige postcode');
      if (!String(g.huisnummer || '').trim()) mist.push('je huisnummer');
    }
    if (mist.length) {
      const lijst = mist.length === 1
        ? mist[0]
        : `${mist.slice(0, -1).join(', ')} en ${mist[mist.length - 1]}`;
      return { fout: `We missen nog ${lijst}.`, status: 400 };
    }

    // nog één keer kijken of alles er echt is
    for (const r of data.mand) {
      const p = data.producten.find((x) => x.id === r.productId);
      if (!p || p.voorraad < r.aantal) {
        return { fout: `${p ? p.naam : 'Een product'} is intussen uitverkocht. Pas je mand even aan.`, status: 409 };
      }
    }

    const som = rekenen(data, bezorging.id);
    const nummer = 'KN-' + String(1240 + data.bestellingen.length + 1);
    const bestelling = {
      id: randomUUID().slice(0, 12),
      nummer,
      status: 'wacht op betaling',
      besteldOp: new Date().toISOString(),
      bezorging: bezorging.naam,
      bezorgingId: bezorging.id,
      gegevens: { naam: g.naam, email: g.email, postcode: g.postcode || '', huisnummer: g.huisnummer || '' },
      regels: som.regels.map((r) => ({ naam: r.naam, malingNaam: r.malingNaam, aantal: r.aantal, regelTotaal: r.regelTotaal })),
      subtotaal: som.subtotaal,
      korting: som.korting,
      kortingCode: data.korting ? data.korting.code : null,
      bezorgkosten: som.bezorgkosten,
      btw: som.btw,
      totaal: som.totaal
    };
    data.bestellingen.push(bestelling);
    return { bestelling };
  }

  /* ---- betaling ---- */
  if (actie === 'betaling' && methode === 'POST') {
    const b = data.bestellingen.find((x) => x.id === invoer.bestelling);
    if (!b) return { fout: 'Die bestelling kennen we niet.', status: 404 };
    if (b.status !== 'wacht op betaling') return { bestelling: b };

    if (!invoer.geslaagd) {
      b.status = 'betaling mislukt';
      return { bestelling: b, bericht: 'De betaling is niet gelukt. Je bestelling staat nog klaar.' };
    }

    // pas nu gaat de voorraad eraf
    for (const r of data.mand) {
      const p = data.producten.find((x) => x.id === r.productId);
      if (p) p.voorraad = Math.max(0, p.voorraad - r.aantal);
    }
    b.status = 'betaald';
    b.bank = invoer.bank || 'onbekend';
    b.betaaldOp = new Date().toISOString();
    data.mand = [];
    data.korting = null;
    return { bestelling: b, winkel: beeld(data) };
  }

  if (actie === 'bestelling') {
    const id = url.searchParams.get('id');
    const b = data.bestellingen.find((x) => x.id === id);
    return b ? { bestelling: b } : { fout: 'Onbekende bestelling.', status: 404 };
  }

  return { fout: 'Onbekende actie.', status: 404 };
}
