// De winkel van Kaap Noord. Alle rekenwerk gebeurt op de server — deze kant
// toont alleen wat er terugkomt. Dat is bewust: een winkelwagen die zijn
// eigen totaal uitrekent, is een winkelwagen die je kunt bijstellen in je
// browser voordat je afrekent.
(function () {
  var staat = null;
  var gekozen = { product: null, maling: 'bonen', aantal: 1 };
  var afreken = { stap: 0, bezorging: 'post', bestelling: null, bank: null };

  var el = function (id) { return document.getElementById(id); };
  var euro = function (c) { return '€ ' + (c / 100).toFixed(2).replace('.', ','); };
  var veilig = function (t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; };

  /* ---------- de zak ---------- */
  function zak(p) {
    var k = veilig(p.kleur), k2 = veilig(p.kleur2);
    return '<svg viewBox="0 0 120 158" role="img" aria-label="Zak ' + veilig(p.naam) + '">' +
      '<path d="M14 30h92l-6 118a10 10 0 0 1-10 9H30a10 10 0 0 1-10-9L14 30Z" fill="' + k + '"/>' +
      '<path d="M14 30h92l-2 34H16L14 30Z" fill="' + k2 + '" opacity=".55"/>' +
      '<path d="M20 30 14 14a4 4 0 0 1 4-5h84a4 4 0 0 1 4 5l-6 16H20Z" fill="' + k + '" opacity=".75"/>' +
      '<path d="M18 9h84" stroke="' + k2 + '" stroke-width="3" stroke-linecap="round" opacity=".8"/>' +
      '<rect x="30" y="76" width="60" height="46" rx="4" fill="#F6F1E8" opacity=".95"/>' +
      // een lange naam krijgt een kleinere letter in plaats van drie puntjes
      '<text x="60" y="94" text-anchor="middle" font-family="Georgia, serif" font-weight="700" fill="#22180F"' +
        ' font-size="' + (p.naam.length > 13 ? 8.5 : p.naam.length > 9 ? 10 : 12) + '">' +
        veilig(p.naam) + '</text>' +
      '<text x="60" y="108" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="6.5" letter-spacing="1.2" fill="#9A8571">' +
        veilig(String(p.type || '').toUpperCase()) + '</text>' +
      '<text x="60" y="118" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="6" fill="#9A8571">250 GRAM</text>' +
      '<circle cx="86" cy="46" r="5" fill="#F6F1E8" opacity=".5"/>' +
      '</svg>';
  }

  function brandmeter(n) {
    var uit = '<span class="brandmeter" title="Brandingsgraad ' + n + ' van 5" aria-label="Brandingsgraad ' + n + ' van 5">';
    for (var i = 1; i <= 5; i++) uit += '<i class="' + (i <= n ? 'aan' : '') + '"></i>';
    return uit + '</span>';
  }

  /* ---------- ophalen ---------- */
  function haal(pad, invoer) {
    var opties = invoer
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(invoer) }
      : {};
    return fetch('/api/koffie' + pad, opties).then(function (a) {
      return a.json().then(function (j) {
        if (!a.ok || j.fout) throw new Error(j.fout || 'Er ging iets mis.');
        return j;
      });
    });
  }

  function verwerk(j) {
    if (j.producten) staat = j;
    tekenRaster();
    tekenTelling();
    return j;
  }

  /* ---------- raster ---------- */
  function tekenRaster() {
    if (!staat) return;
    el('verhaal').textContent = staat.winkel.verhaal;
    el('raster').innerHTML = staat.producten.map(function (p) {
      var op = p.voorraad === 0;
      var krap = !op && p.voorraad <= 10;
      var vlag = op ? '<span class="vlag op">Uitverkocht</span>'
        : p.populair ? '<span class="vlag">Veel besteld</span>' : '';
      return '<button type="button" class="kaart" data-id="' + veilig(p.id) + '">' +
        '<span class="kaart-beeld" style="background:linear-gradient(160deg,' + veilig(p.kleur2) + '22,transparent)">' +
          vlag + zak(p) +
        '</span>' +
        '<span class="kaart-tekst">' +
          '<span class="kaart-boven"><span class="kaart-naam">' + veilig(p.naam) + '</span>' +
          '<span class="kaart-prijs">' + euro(p.prijs) + '</span></span>' +
          '<span class="kaart-herkomst">' + veilig(p.herkomst) + '</span>' +
          '<span class="kaart-regel">' + veilig(p.regel) + '</span>' +
          '<span class="smaken">' + p.smaak.map(function (s) { return '<span>' + veilig(s) + '</span>'; }).join('') + '</span>' +
          '<span class="voorraadregel ' + (op ? 'op' : krap ? 'krap' : '') + '"><i></i>' +
            (op ? 'Op — volgende brandsessie dinsdag' : krap ? 'Nog ' + p.voorraad + ' zak op de plank' : p.voorraad + ' zak op voorraad') +
          '</span>' +
        '</span>' +
      '</button>';
    }).join('');

    [].forEach.call(document.querySelectorAll('.kaart'), function (k) {
      k.addEventListener('click', function () { opendProduct(k.getAttribute('data-id')); });
    });
  }

  function tekenTelling() {
    var b = el('mandtelling');
    var n = staat ? staat.aantalStuks : 0;
    b.textContent = n;
    b.hidden = !n;
  }

  /* ---------- productpaneel ---------- */
  function opendProduct(id) {
    var p = staat.producten.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    gekozen = { product: p, maling: 'bonen', aantal: 1 };
    tekenProduct();
    toon('paneelover');
  }

  function tekenProduct() {
    var p = gekozen.product;
    var op = p.voorraad === 0;
    el('paneel').innerHTML =
      '<button type="button" class="sluit" data-sluit aria-label="Sluiten">&times;</button>' +
      '<div class="pan-in">' +
        '<div class="pan-beeld" style="background:linear-gradient(160deg,' + veilig(p.kleur2) + '26,transparent)">' + zak(p) + '</div>' +
        '<div class="pan-tekst">' +
          '<p class="kaart-herkomst">' + veilig(p.type) + '</p>' +
          '<h2 id="paneelnaam">' + veilig(p.naam) + '</h2>' +
          '<p style="color:var(--inkt-2);margin:10px 0 0">' + veilig(p.regel) + '</p>' +
          '<div class="pan-rij">' +
            '<div><dt>Herkomst</dt><dd style="margin:0">' + veilig(p.herkomst) + '</dd></div>' +
            '<div><dt>Hoogte</dt><dd style="margin:0">' + veilig(p.hoogte) + '</dd></div>' +
            '<div><dt>Proces</dt><dd style="margin:0">' + veilig(p.proces) + '</dd></div>' +
            '<div><dt>Branding</dt><dd style="margin:0">' + brandmeter(p.branding) + '</dd></div>' +
          '</div>' +
          '<div class="smaken" style="margin-top:16px">' + p.smaak.map(function (s) { return '<span>' + veilig(s) + '</span>'; }).join('') + '</div>' +
          '<p class="pan-prijs">' + euro(p.prijs) + ' <small>per 250 gram</small></p>' +
          '<p class="veldkop">Hoe zullen we hem malen?</p>' +
          '<div class="keuzes" id="malingen">' +
            staat.malingen.map(function (m) {
              return '<button type="button" class="keuze" data-maling="' + veilig(m.id) + '" aria-pressed="' +
                (m.id === gekozen.maling) + '">' + veilig(m.naam) + '</button>';
            }).join('') +
          '</div>' +
          '<p class="veldkop">Aantal zakken</p>' +
          '<div class="pan-acties">' +
            '<span class="teller">' +
              '<button type="button" id="min" aria-label="Minder">&minus;</button>' +
              '<span id="aantal">' + gekozen.aantal + '</span>' +
              '<button type="button" id="plus" aria-label="Meer">+</button>' +
            '</span>' +
            '<button type="button" class="knop knop-vol" id="inmand"' + (op ? ' disabled' : '') + '>' +
              (op ? 'Uitverkocht' : 'In de mand') + '</button>' +
          '</div>' +
          '<div id="panmelding"></div>' +
        '</div>' +
      '</div>';

    [].forEach.call(el('malingen').children, function (k) {
      k.addEventListener('click', function () {
        gekozen.maling = k.getAttribute('data-maling');
        [].forEach.call(el('malingen').children, function (o) { o.setAttribute('aria-pressed', 'false'); });
        k.setAttribute('aria-pressed', 'true');
      });
    });
    el('min').addEventListener('click', function () {
      gekozen.aantal = Math.max(1, gekozen.aantal - 1); el('aantal').textContent = gekozen.aantal;
    });
    el('plus').addEventListener('click', function () {
      gekozen.aantal = Math.min(20, gekozen.aantal + 1); el('aantal').textContent = gekozen.aantal;
    });
    el('inmand').addEventListener('click', function () {
      var knop = el('inmand');
      knop.disabled = true;
      haal('/mand/toevoegen', { productId: p.id, maling: gekozen.maling, aantal: gekozen.aantal })
        .then(function (j) {
          verwerk(j);
          verberg('paneelover');
          openMand();
        })
        .catch(function (e) {
          el('panmelding').innerHTML = '<p class="melding fout">' + veilig(e.message) + '</p>';
          knop.disabled = false;
        });
    });
  }

  /* ---------- mand en afrekenen ---------- */
  function openMand() {
    afreken.stap = 0;
    tekenLade();
    toon('mandover');
  }

  function somblok(s) {
    var uit = '<div class="somregel"><span>Subtotaal</span><span>' + euro(s.subtotaal) + '</span></div>';
    if (s.korting) uit += '<div class="somregel korting"><span>Korting' +
      (staat.korting ? ' (' + veilig(staat.korting.code) + ')' : '') + '</span><span>− ' + euro(s.korting) + '</span></div>';
    if (afreken.stap >= 1) {
      uit += '<div class="somregel"><span>Bezorging</span><span>' +
        (s.bezorgkosten ? euro(s.bezorgkosten) : 'gratis') + '</span></div>';
    }
    uit += '<div class="somregel groot"><span>Totaal</span><span>' + euro(s.totaal) + '</span></div>';
    uit += '<div class="somregel" style="font-size:.8rem;color:var(--inkt-3)"><span>waarvan btw (9%)</span><span>' + euro(s.btw) + '</span></div>';
    return uit;
  }

  function tekenLade() {
    var lade = el('lade');
    var stappen = '<div class="stappen">' +
      [0, 1, 2, 3].map(function (i) { return '<i class="' + (i <= afreken.stap ? 'aan' : '') + '"></i>'; }).join('') +
      '</div>';

    if (afreken.stap === 3) { tekenKlaar(); return; }
    if (afreken.stap === 2) { tekenBetalen(stappen); return; }
    if (afreken.stap === 1) { tekenGegevens(stappen); return; }

    // stap 0: de mand
    var lijst = staat.regels.length
      ? staat.regels.map(function (r) {
          return '<div class="mandregel">' + zak(r) +
            '<div><h3>' + veilig(r.naam) + '</h3>' +
            '<p class="maling">' + veilig(r.malingNaam) + ' · ' + euro(r.stuksprijs) + ' per zak</p>' +
            '<div class="onder"><span class="teller">' +
              '<button type="button" data-min="' + veilig(r.regelId) + '" aria-label="Minder">&minus;</button>' +
              '<span>' + r.aantal + '</span>' +
              '<button type="button" data-plus="' + veilig(r.regelId) + '" aria-label="Meer">+</button>' +
            '</span>' +
            '<button type="button" class="weg" data-weg="' + veilig(r.regelId) + '">verwijder</button></div></div>' +
            '<span class="prijs">' + euro(r.regelTotaal) + '</span></div>';
        }).join('')
      : '<p class="lade-leeg">Je mand is nog leeg.<br>Kies hiernaast een koffie.</p>';

    lade.innerHTML = stappen +
      '<div class="lade-kop"><h2>Je mand</h2>' +
        '<button type="button" class="sluit" data-sluit style="position:static" aria-label="Sluiten">&times;</button></div>' +
      '<div class="lade-lijst">' + lijst + '</div>' +
      (staat.regels.length
        ? '<div class="lade-voet">' +
            '<div class="codeveld">' +
              '<input id="code" placeholder="Kortingscode" value="' + (staat.korting ? veilig(staat.korting.code) : '') + '">' +
              '<button type="button" class="knop" id="codeknop">Pas toe</button>' +
            '</div>' +
            '<div id="lademelding"></div>' +
            somblok(staat) +
            '<button type="button" class="knop knop-vol" id="naargegevens" style="width:100%;margin-top:14px">Verder naar bezorging</button>' +
            '<p style="font-size:.78rem;color:var(--inkt-3);margin:10px 0 0;text-align:center">Probeer <b>EERSTEZAK</b> of <b>BAKFIETS</b></p>' +
          '</div>'
        : '');

    [].forEach.call(lade.querySelectorAll('[data-min],[data-plus],[data-weg]'), function (k) {
      k.addEventListener('click', function () {
        var id = k.getAttribute('data-min') || k.getAttribute('data-plus') || k.getAttribute('data-weg');
        var r = staat.regels.filter(function (x) { return x.regelId === id; })[0];
        var nieuw = k.hasAttribute('data-weg') ? 0 : r.aantal + (k.hasAttribute('data-plus') ? 1 : -1);
        haal('/mand/wijzig', { regelId: id, aantal: nieuw })
          .then(function (j) { verwerk(j); tekenLade(); })
          .catch(function (e) { melding('lademelding', e.message, 'fout'); });
      });
    });
    var codeknop = el('codeknop');
    if (codeknop) {
      codeknop.addEventListener('click', function () {
        haal('/korting', { code: el('code').value })
          .then(function (j) { verwerk(j); tekenLade(); if (j.bericht) melding('lademelding', j.bericht, 'goed'); })
          .catch(function (e) { melding('lademelding', e.message, 'fout'); });
      });
    }
    var verder = el('naargegevens');
    if (verder) verder.addEventListener('click', function () { afreken.stap = 1; tekenLade(); });
  }

  function melding(id, tekst, soort) {
    var vak = el(id);
    if (vak) vak.innerHTML = '<p class="melding ' + soort + '">' + veilig(tekst) + '</p>';
  }

  function tekenGegevens(stappen) {
    var lade = el('lade');
    lade.innerHTML = stappen +
      '<div class="lade-kop"><h2>Waar mag het heen?</h2>' +
        '<button type="button" class="sluit" data-sluit style="position:static" aria-label="Sluiten">&times;</button></div>' +
      '<div class="lade-lijst">' +
        '<div class="bezorgkeuze">' +
          staat.bezorging.map(function (b) {
            return '<label><input type="radio" name="bez" value="' + veilig(b.id) + '"' +
              (b.id === afreken.bezorging ? ' checked' : '') + '>' +
              '<span><b>' + veilig(b.naam) + '</b>' +
              (b.toelichting ? '<small>' + veilig(b.toelichting) + '</small>' : '') +
              (b.gratisVanaf ? '<small>Gratis vanaf ' + euro(b.gratisVanaf) + '</small>' : '') + '</span>' +
              '<span style="font-weight:600">' + (b.prijs ? euro(b.prijs) : 'gratis') + '</span></label>';
          }).join('') +
        '</div>' +
        '<div class="veld"><label for="naam">Naam</label><input id="naam" autocomplete="name" placeholder="Jouw naam"></div>' +
        '<div class="veld"><label for="email">E-mailadres</label><input id="email" type="email" autocomplete="email" placeholder="jij@voorbeeld.nl"></div>' +
        '<div class="tweekolom" id="adresvelden">' +
          '<div class="veld"><label for="postcode">Postcode</label><input id="postcode" autocomplete="postal-code" placeholder="3812 AB"></div>' +
          '<div class="veld"><label for="huisnummer">Huisnummer</label><input id="huisnummer" placeholder="42"></div>' +
        '</div>' +
        '<div id="gegevensmelding"></div>' +
      '</div>' +
      '<div class="lade-voet" id="somvak"></div>';

    function ververs() {
      haal('/rekenen?bezorging=' + encodeURIComponent(afreken.bezorging)).then(function (s) {
        el('somvak').innerHTML = somblok(s) +
          '<button type="button" class="knop knop-vol" id="naarbetalen" style="width:100%;margin-top:14px">Naar betalen</button>' +
          '<button type="button" class="weg" id="terugmand" style="width:100%;margin-top:12px">Terug naar je mand</button>';
        el('naarbetalen').addEventListener('click', afrekenen);
        el('terugmand').addEventListener('click', function () { afreken.stap = 0; tekenLade(); });
      });
      el('adresvelden').style.display = afreken.bezorging === 'afhalen' ? 'none' : '';
    }
    [].forEach.call(lade.querySelectorAll('input[name=bez]'), function (r) {
      r.addEventListener('change', function () { afreken.bezorging = r.value; ververs(); });
    });
    ververs();
  }

  function afrekenen() {
    var knop = el('naarbetalen');
    knop.disabled = true;
    haal('/afrekenen', {
      bezorging: afreken.bezorging,
      gegevens: {
        naam: el('naam').value, email: el('email').value,
        postcode: el('postcode').value, huisnummer: el('huisnummer').value
      }
    }).then(function (j) {
      afreken.bestelling = j.bestelling;
      afreken.stap = 2;
      tekenLade();
    }).catch(function (e) {
      melding('gegevensmelding', e.message, 'fout');
      knop.disabled = false;
    });
  }

  var BANKEN = [
    { naam: 'ING', kleur: '#FF6200' }, { naam: 'Rabobank', kleur: '#000066' },
    { naam: 'ABN AMRO', kleur: '#0D8B3E' }, { naam: 'bunq', kleur: '#3394D6' },
    { naam: 'ASN Bank', kleur: '#C8102E' }, { naam: 'Knab', kleur: '#7AB800' }
  ];

  function tekenBetalen(stappen) {
    var b = afreken.bestelling;
    var lade = el('lade');

    if (!afreken.bank) {
      lade.innerHTML = stappen +
        '<div class="lade-kop"><h2>Betalen</h2>' +
          '<button type="button" class="sluit" data-sluit style="position:static" aria-label="Sluiten">&times;</button></div>' +
        '<div class="lade-lijst">' +
          '<p style="color:var(--inkt-2);margin-top:0">Bestelling <b>' + veilig(b.nummer) + '</b> staat klaar. Kies je bank.</p>' +
          '<div class="banken">' +
            BANKEN.map(function (x, i) {
              return '<button type="button" class="bank" data-bank="' + i + '">' +
                '<i style="background:' + x.kleur + '"></i>' + veilig(x.naam) + '</button>';
            }).join('') +
          '</div>' +
          '<p style="font-size:.8rem;color:var(--inkt-3)">Dit is een nagebootste betaalstap. Er gaat geen geld heen en weer, en je kunt zo meteen zelf kiezen of de betaling lukt of mislukt.</p>' +
        '</div>';
      [].forEach.call(lade.querySelectorAll('[data-bank]'), function (k) {
        k.addEventListener('click', function () {
          afreken.bank = BANKEN[Number(k.getAttribute('data-bank'))];
          tekenLade();
        });
      });
      return;
    }

    lade.innerHTML = stappen +
      '<div class="lade-kop"><h2>' + veilig(afreken.bank.naam) + '</h2>' +
        '<button type="button" class="sluit" data-sluit style="position:static" aria-label="Sluiten">&times;</button></div>' +
      '<div class="lade-lijst">' +
        '<div class="bankscherm" style="border-top:4px solid ' + veilig(afreken.bank.kleur) + '">' +
          '<p style="margin:0;color:var(--inkt-3);font-size:.85rem">Betaalverzoek van Kaap Noord</p>' +
          '<p class="bedrag">' + euro(b.totaal) + '</p>' +
          '<div class="bonregel" style="display:flex;justify-content:space-between;font-size:.88rem"><span>Kenmerk</span><span>' + veilig(b.nummer) + '</span></div>' +
          '<div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">' +
            '<button type="button" class="knop knop-vol" id="betaalok" style="flex:1">Betaling bevestigen</button>' +
            '<button type="button" class="knop" id="betaalnee" style="flex:1">Annuleren</button>' +
          '</div>' +
        '</div>' +
        '<div id="betaalmelding"></div>' +
        '<button type="button" class="weg" id="andereBank" style="width:100%;margin-top:14px">Andere bank kiezen</button>' +
      '</div>';

    el('andereBank').addEventListener('click', function () { afreken.bank = null; tekenLade(); });
    el('betaalok').addEventListener('click', function () { betaal(true); });
    el('betaalnee').addEventListener('click', function () { betaal(false); });
  }

  function betaal(geslaagd) {
    el('betaalok').disabled = true;
    el('betaalnee').disabled = true;
    haal('/betaling', { bestelling: afreken.bestelling.id, geslaagd: geslaagd, bank: afreken.bank.naam })
      .then(function (j) {
        afreken.bestelling = j.bestelling;
        if (j.winkel) { staat = j.winkel; tekenRaster(); tekenTelling(); }
        if (geslaagd) { afreken.stap = 3; tekenLade(); }
        else {
          melding('betaalmelding', 'De betaling is afgebroken. Je bestelling staat nog klaar — probeer het nog eens.', 'fout');
          el('betaalok').disabled = false;
          el('betaalnee').disabled = false;
        }
      });
  }

  function tekenKlaar() {
    var b = afreken.bestelling;
    el('lade').innerHTML =
      '<div class="lade-kop"><h2>Gelukt</h2>' +
        '<button type="button" class="sluit" data-sluit style="position:static" aria-label="Sluiten">&times;</button></div>' +
      '<div class="lade-lijst">' +
        '<div class="klaar">' +
          '<div class="vink"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
          '<h2 style="font-size:1.6rem">Bedankt, ' + veilig(b.gegevens.naam.split(' ')[0]) + '</h2>' +
          '<p style="color:var(--inkt-2)">We hebben je bestelling binnen. Je krijgt een bevestiging op ' +
            veilig(b.gegevens.email) + '.</p>' +
          '<div class="bon">' +
            '<div class="bonregel kop"><span>' + veilig(b.nummer) + '</span><span>' + veilig(b.bezorging.split(',')[0]) + '</span></div>' +
            b.regels.map(function (r) {
              return '<div class="bonregel"><span>' + r.aantal + '× ' + veilig(r.naam) +
                ' <span style="color:var(--inkt-3)">' + veilig(r.malingNaam.toLowerCase()) + '</span></span>' +
                '<span>' + euro(r.regelTotaal) + '</span></div>';
            }).join('') +
            (b.korting ? '<div class="bonregel" style="color:var(--groen)"><span>Korting ' + veilig(b.kortingCode) + '</span><span>− ' + euro(b.korting) + '</span></div>' : '') +
            '<div class="bonregel"><span>Bezorging</span><span>' + (b.bezorgkosten ? euro(b.bezorgkosten) : 'gratis') + '</span></div>' +
            '<div class="bonregel kop" style="border-bottom:0;border-top:1px solid var(--lijn);padding-top:10px;margin-top:10px">' +
              '<span>Betaald via ' + veilig(b.bank) + '</span><span>' + euro(b.totaal) + '</span></div>' +
          '</div>' +
          '<button type="button" class="knop knop-vol" id="verderwinkelen" style="width:100%;margin-top:18px">Verder kijken</button>' +
        '</div>' +
      '</div>';
    el('verderwinkelen').addEventListener('click', function () {
      afreken = { stap: 0, bezorging: 'post', bestelling: null, bank: null };
      verberg('mandover');
    });
  }

  /* ---------- overlays ---------- */
  function toon(id) { el(id).hidden = false; document.body.style.overflow = 'hidden'; }
  function verberg(id) { el(id).hidden = true; document.body.style.overflow = ''; }

  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-sluit]')) {
      verberg('paneelover'); verberg('mandover');
    }
  });
  ['paneelover', 'mandover'].forEach(function (id) {
    el(id).addEventListener('mousedown', function (e) { if (e.target === el(id)) verberg(id); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { verberg('paneelover'); verberg('mandover'); }
  });
  el('mandknop').addEventListener('click', openMand);

  /* ---------- starten ---------- */
  demobalk('koffie', 'Kaap Noord');
  haal('').then(verwerk).catch(function () {
    el('raster').innerHTML = '<p class="melding fout">De winkel kon niet geladen worden.</p>';
  });
}());
