/* Het postvak in de browser.
   Twee dingen zijn hier met opzet streng:
   1. De inhoud van een bericht gaat nooit via innerHTML de pagina in. Een
      afzender bepaalt die tekst, en dat is precies iemand die je geen
      scriptje in je eigen beheerscherm wilt laten zetten. Alles via
      textContent.
   2. Het token staat in sessionStorage, niet in localStorage. Tab dicht is
      uitgelogd. Op de server verloopt hij na vier uur. */
(() => {
  const SLEUTEL = 'beheer-token';
  const vind = (id) => document.getElementById(id);

  const inlogvak = vind('inlogvak');
  const inlogform = vind('inlogform');
  const wachtwoordveld = vind('wachtwoord');
  const inlogmelding = vind('inlogmelding');
  const postvak = vind('postvak');
  const lijstvak = vind('lijst');
  const berichtvak = vind('bericht');
  const leesleeg = vind('leesleeg');
  const teller = vind('teller');
  const knopVerversen = vind('verversen');
  const knopUitloggen = vind('uitloggen');
  const knopTerug = vind('terug');

  let token = sessionStorage.getItem(SLEUTEL) || '';
  let berichten = [];
  let open = null;

  /* ---------- praten met de server ---------- */
  async function vraag(pad, opties = {}) {
    const koppen = { 'content-type': 'application/json' };
    if (token) koppen.authorization = 'Bearer ' + token;
    const antw = await fetch('/api/beheer/' + pad, { ...opties, headers: koppen });
    let data = {};
    try { data = await antw.json(); } catch { /* lege of kapotte body */ }
    if (antw.status === 401 && token) {
      uitloggen();
      throw new Error('Je sessie is verlopen. Log opnieuw in.');
    }
    if (!antw.ok) throw new Error(data.fout || 'Er ging iets mis (' + antw.status + ').');
    return data;
  }

  function melden(waar, tekst, soort) {
    waar.textContent = '';
    if (!tekst) return;
    const p = document.createElement('p');
    p.className = 'melding ' + (soort || 'fout');
    p.textContent = tekst;
    waar.append(p);
  }

  /* ---------- inloggen en uitloggen ---------- */
  inlogform.addEventListener('submit', async (e) => {
    e.preventDefault();
    const knop = inlogform.querySelector('button');
    knop.disabled = true;
    knop.textContent = 'Bezig…';
    melden(inlogmelding, '');
    try {
      const data = await vraag('inloggen', {
        method: 'POST',
        body: JSON.stringify({ wachtwoord: wachtwoordveld.value })
      });
      token = data.token;
      sessionStorage.setItem(SLEUTEL, token);
      wachtwoordveld.value = '';
      await binnen();
    } catch (err) {
      melden(inlogmelding, err.message);
      wachtwoordveld.select();
    } finally {
      knop.disabled = false;
      knop.textContent = 'Inloggen';
    }
  });

  function uitloggen() {
    token = '';
    berichten = [];
    open = null;
    sessionStorage.removeItem(SLEUTEL);
    postvak.hidden = true;
    document.body.classList.remove('leest');
    inlogvak.hidden = false;
    teller.hidden = true;
    knopVerversen.hidden = true;
    knopUitloggen.hidden = true;
    wachtwoordveld.focus();
  }

  knopUitloggen.addEventListener('click', uitloggen);

  async function binnen() {
    inlogvak.hidden = true;
    postvak.hidden = false;
    knopVerversen.hidden = false;
    knopUitloggen.hidden = false;
    await laadLijst();
  }

  /* ---------- de lijst ---------- */
  const datum = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const vandaag = d.toDateString() === new Date().toDateString();
    return vandaag
      ? d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  };

  async function laadLijst() {
    knopVerversen.disabled = true;
    try {
      const data = await vraag('mail?aantal=50');
      berichten = data.berichten || [];
      toonLijst();
      teller.hidden = false;
      teller.textContent = '';
      const n = document.createElement('b');
      n.textContent = String(data.ongelezen);
      teller.append(n, document.createTextNode(' ongelezen van ' + data.totaal));
    } catch (err) {
      melden(lijstvak, err.message);
    } finally {
      knopVerversen.disabled = false;
    }
  }

  knopVerversen.addEventListener('click', laadLijst);

  function toonLijst() {
    lijstvak.textContent = '';
    if (!berichten.length) {
      const p = document.createElement('p');
      p.className = 'leeg';
      p.textContent = 'Nog geen mail in dit postvak.';
      lijstvak.append(p);
      return;
    }
    for (const b of berichten) {
      const knop = document.createElement('button');
      knop.type = 'button';
      knop.className = b.gelezen ? 'regel gelezen' : 'regel';
      if (open === b.uid) knop.setAttribute('aria-current', 'true');

      const stip = document.createElement('span');
      stip.className = 'stip';
      stip.setAttribute('aria-hidden', 'true');

      const midden = document.createElement('span');
      const van = document.createElement('span');
      van.className = 'van';
      van.textContent = b.van || '(onbekende afzender)';
      const onderwerp = document.createElement('span');
      onderwerp.className = 'onderwerp';
      onderwerp.textContent = b.onderwerp;
      midden.append(van, onderwerp);
      if (b.beantwoord) {
        const vlag = document.createElement('span');
        vlag.className = 'vlag';
        vlag.textContent = 'beantwoord';
        midden.append(vlag);
      }

      const wanneer = document.createElement('span');
      wanneer.className = 'wanneer';
      wanneer.textContent = datum(b.op);

      knop.append(stip, midden, wanneer);
      knop.addEventListener('click', () => openBericht(b.uid));
      lijstvak.append(knop);
    }
  }

  /* ---------- een bericht lezen ---------- */
  async function openBericht(uid) {
    open = uid;
    toonLijst();
    document.body.classList.add('leest');
    leesleeg.hidden = true;
    berichtvak.hidden = false;
    berichtvak.textContent = 'Bezig met ophalen…';
    try {
      const b = await vraag('mail/' + uid);
      toonBericht(b);
      const inLijst = berichten.find((x) => x.uid === uid);
      if (inLijst && !inLijst.gelezen) {
        // meteen in de lijst bijwerken, niet wachten op de mailserver
        inLijst.gelezen = true;
        toonLijst();
        vraag('mail/' + uid + '/gelezen', {
          method: 'POST',
          body: JSON.stringify({ gelezen: true })
        }).then(laadLijst).catch(() => { /* de vlag is bijzaak */ });
      }
    } catch (err) {
      melden(berichtvak, err.message);
    }
  }

  function toonBericht(b) {
    berichtvak.textContent = '';

    const kop = document.createElement('div');
    kop.className = 'bericht-kop';
    const titel = document.createElement('h2');
    titel.textContent = b.onderwerp;
    const afzender = document.createElement('p');
    afzender.className = 'afzender';
    const naam = document.createElement('b');
    naam.textContent = b.van;
    const adres = document.createElement('span');
    adres.textContent = b.vanAdres;
    const op = document.createElement('span');
    op.textContent = b.op ? new Date(b.op).toLocaleString('nl-NL') : '';
    afzender.append(naam, adres, op);
    kop.append(titel, afzender);

    const tekst = document.createElement('div');
    tekst.className = 'bericht-tekst';
    tekst.textContent = b.tekst;

    berichtvak.append(kop, tekst);

    if (b.bijlagen && b.bijlagen.length) {
      const vak = document.createElement('div');
      vak.className = 'bijlagen';
      for (const bij of b.bijlagen) {
        const s = document.createElement('span');
        const kb = Math.max(1, Math.round((bij.grootte || 0) / 1024));
        s.textContent = bij.naam + ' · ' + kb + ' kB';
        vak.append(s);
      }
      berichtvak.append(vak);
      const uitleg = document.createElement('p');
      uitleg.className = 'bijlage-bij';
      uitleg.textContent = 'Bijlagen open je in je gewone mailprogramma; hier zie je alleen dat ze er zijn.';
      berichtvak.append(uitleg);
    }

    berichtvak.append(antwoordvak(b));
  }

  /* ---------- antwoorden ---------- */
  function antwoordvak(b) {
    const vak = document.createElement('div');
    vak.className = 'antwoordvak';

    const kop = document.createElement('h3');
    kop.textContent = 'Antwoord aan ' + (b.vanAdres || 'de afzender');

    const veld = document.createElement('textarea');
    veld.placeholder = 'Goedendag,';
    veld.setAttribute('aria-label', 'Jouw antwoord');

    const knoppen = document.createElement('div');
    knoppen.className = 'knoppen';
    const verstuur = document.createElement('button');
    verstuur.type = 'button';
    verstuur.className = 'knop knop-vol';
    verstuur.textContent = 'Versturen';
    const bij = document.createElement('span');
    bij.className = 'wanneer';
    bij.textContent = 'Ctrl + Enter verstuurt ook';
    knoppen.append(verstuur, bij);

    const melding = document.createElement('div');
    melding.setAttribute('aria-live', 'polite');

    vak.append(kop, veld, knoppen, melding);

    async function versturen() {
      const tekst = veld.value.trim();
      if (!tekst) {
        melden(melding, 'Er staat nog niets in je antwoord.');
        veld.focus();
        return;
      }
      verstuur.disabled = true;
      verstuur.textContent = 'Versturen…';
      melden(melding, '');
      try {
        const uit = await vraag('mail/' + b.uid + '/antwoord', {
          method: 'POST',
          body: JSON.stringify({ tekst })
        });
        veld.value = '';
        melden(melding, 'Verstuurd naar ' + uit.naar + '.', 'goed');
        // de bevestiging staat onder de knop en dus net buiten beeld
        melding.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        await laadLijst();
      } catch (err) {
        melden(melding, err.message);
      } finally {
        verstuur.disabled = false;
        verstuur.textContent = 'Versturen';
      }
    }

    verstuur.addEventListener('click', versturen);
    veld.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        versturen();
      }
    });
    return vak;
  }

  /* ---------- bediening ---------- */
  knopTerug.addEventListener('click', () => {
    document.body.classList.remove('leest');
    open = null;
    toonLijst();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !document.body.classList.contains('leest')) return;
    const inEenVeld = /^(input|textarea)$/i.test(document.activeElement?.tagName || '');
    if (!inEenVeld) knopTerug.click();
  });

  /* ---------- opstarten ----------
     Een token uit een vorige keer kan verlopen zijn. We proberen het gewoon;
     levert dat een 401 op, dan zet vraag() ons terug op het inlogscherm. */
  if (token) binnen().catch(() => uitloggen());
  else wachtwoordveld.focus();
})();
