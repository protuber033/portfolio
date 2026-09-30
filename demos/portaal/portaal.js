// Het klantportaal. De server bepaalt wat je mag zien; deze kant tekent
// alleen wat er binnenkomt. Het "probeer het zelf"-blok hieronder vraagt
// expres om dossiers die niet van je zijn, zodat je die weigering ook echt
// ziet gebeuren in plaats van dat je hem moet geloven.
(function () {
  var app = document.getElementById('app');
  var ik = null, beeld = null, laatsteBewaking = null;

  var euro = function (c) { return c == null ? '' : '€ ' + (c / 100).toFixed(2).replace('.', ','); };
  var esc = function (t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; };
  var datum = function (d) {
    if (!d) return '';
    var m = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
    var p = d.split('-');
    return Number(p[2]) + ' ' + m[Number(p[1]) - 1] + ' ' + p[0];
  };
  var letters = function (n) { return String(n || '?').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase(); };

  function haal(pad, invoer) {
    var o = invoer ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(invoer) } : {};
    return fetch('/api/portaal' + pad, o).then(function (a) {
      return a.json().then(function (j) {
        j.__ok = a.ok && !j.fout;
        if (j.bewaking) laatsteBewaking = { tekst: j.bewaking, ok: j.__ok };
        if (!j.__ok && !j.fout) j.fout = 'Er ging iets mis.';
        return j;
      });
    });
  }

  var IKOON = {
    factuur: '<svg viewBox="0 0 16 16" fill="none"><path d="M3.5 2h9v12l-2-1.2L8.5 14l-2-1.2L4.5 14 3.5 13V2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6 5.5h4M6 8h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    offerte: '<svg viewBox="0 0 16 16" fill="none"><path d="M9 1.5H4a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 4 14.5h8a1.5 1.5 0 0 0 1.5-1.5V6L9 1.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9 1.5V6h4.5" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    rapport: '<svg viewBox="0 0 16 16" fill="none"><path d="M2.5 13.5h11M5 11V7m3 4V4m3 7V8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
  };
  var KLEUR = { factuur: ['var(--oranje-zacht)', 'var(--oranje)'], offerte: ['var(--merk-zacht)', 'var(--merk)'], rapport: ['var(--groen-zacht)', 'var(--groen)'] };
  var MERKJE = { open: 'open', betaald: 'betaald', klaar: 'klaar', 'wacht op akkoord': 'wacht', akkoord: 'akkoord', afgewezen: 'afgewezen' };

  /* ---------- inlogscherm ---------- */
  function tekenInlog(fout) {
    app.className = '';
    app.innerHTML =
      '<div class="inlog"><div class="inlog-zij">' +
        '<div class="inlog-merk">Van Dijk Installatie<span>Verwarming · sanitair · warmtepompen</span></div>' +
        '<div><h1>Alles van je installatie op één plek.</h1>' +
        '<p>Je offertes, facturen, onderhoudsrapporten en afspraken — zonder te hoeven bellen.</p>' +
        '<ul class="inlog-punten">' +
          ['Offertes bekijken en meteen akkoord geven', 'Facturen terugzoeken tot jaren terug', 'Onderhoudsrapporten van elke beurt', 'Een storing melden, ook buiten kantooruren'].map(function (t) {
            return '<li><svg viewBox="0 0 16 16" fill="none"><path d="M3 8.4l3.2 3.2L13 4.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' + esc(t) + '</li>';
          }).join('') +
        '</ul></div>' +
        '<p style="font-size:.8rem">033 - 555 01 20 · service@vandijkinstallatie.example</p>' +
      '</div>' +
      '<div class="inlog-vak"><div class="inlog-doos">' +
        '<h2>Inloggen</h2><p>Welkom terug bij Mijn Van Dijk.</p>' +
        (fout ? '<div class="melding fout">' + esc(fout) + '</div>' : '') +
        '<form id="inlogform">' +
          '<div class="veld"><label for="email">E-mailadres</label><input id="email" type="email" autocomplete="username" required></div>' +
          '<div class="veld"><label for="ww">Wachtwoord</label><input id="ww" type="password" autocomplete="current-password" required></div>' +
          '<button class="knop knop-vol breed" type="submit" id="inlogknop">Inloggen</button>' +
        '</form>' +
        '<div class="proefaccounts"><p>Deze demo heeft drie accounts klaarstaan — klik er een om hem in te vullen:</p>' +
          [['Marieke Bos', 'particuliere klant', 'marieke@voorbeeld.nl', 'welkom'],
           ['Hotel De Eemhof', 'zakelijke klant, groter dossier', 'beheer@eemhof.voorbeeld.nl', 'welkom'],
           ['Ruben van Dijk', 'medewerker, ziet alle klanten', 'ruben@vandijkinstallatie.example', 'monteur']]
            .map(function (a) {
              return '<button type="button" class="proefknop" data-e="' + esc(a[2]) + '" data-w="' + esc(a[3]) + '">' +
                '<i>' + letters(a[0]) + '</i><span><b>' + esc(a[0]) + '</b><small>' + esc(a[1]) + '</small></span></button>';
            }).join('') +
        '</div>' +
      '</div></div></div>';

    [].forEach.call(app.querySelectorAll('.proefknop'), function (k) {
      k.addEventListener('click', function () {
        document.getElementById('email').value = k.getAttribute('data-e');
        document.getElementById('ww').value = k.getAttribute('data-w');
        document.getElementById('inlogknop').focus();
      });
    });
    document.getElementById('inlogform').addEventListener('submit', function (e) {
      e.preventDefault();
      var knop = document.getElementById('inlogknop');
      knop.disabled = true; knop.textContent = 'Even kijken…';
      haal('/inloggen', { email: document.getElementById('email').value, wachtwoord: document.getElementById('ww').value })
        .then(function (j) {
          if (!j.__ok) {
            tekenInlog(j.fout + (j.resterend != null ? ' Nog ' + j.resterend + ' pogingen.' : ''));
            return;
          }
          ik = j.ik;
          start();
        });
    });
  }

  /* ---------- portaal ---------- */
  function start() { haal('/overzicht').then(function (j) { beeld = j; tekenPortaal(); }); }

  function bewakingsbalk() {
    if (!laatsteBewaking) return '';
    return '<div class="bewaking' + (laatsteBewaking.ok ? '' : ' nee') + '">' +
      '<svg viewBox="0 0 16 16" fill="none">' + (laatsteBewaking.ok
        ? '<path d="M8 1.5l5.5 2.2v4c0 3.2-2.3 5.6-5.5 6.8-3.2-1.2-5.5-3.6-5.5-6.8v-4L8 1.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.6 8l1.7 1.7L10.6 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>'
        : '<circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>') +
      '</svg><span><b>De server zegt:</b> ' + esc(laatsteBewaking.tekst) + '</span></div>';
  }

  function zijbalk() {
    return '<nav class="zij">' +
      '<div class="zij-merk">Mijn Van Dijk<span>' + esc(beeld.bedrijf ? beeld.bedrijf.onder : '') + '</span></div>' +
      '<p class="zij-kop">' + (ik.rol === 'medewerker' ? 'Beheer' : 'Mijn dossier') + '</p>' +
      '<button type="button" aria-current="true" id="naaroverzicht">' + (ik.rol === 'medewerker' ? 'Alle klanten' : 'Overzicht') + '</button>' +
      (ik.rol === 'klant' ? '<button type="button" id="naarstoring">Storing melden</button>' : '') +
      '<div class="zij-onder"><div class="zij-ik"><i>' + letters(ik.naam) + '</i><span><b>' + esc(ik.naam) + '</b>' +
        '<small>' + (ik.rol === 'medewerker' ? 'medewerker' : 'klant') + '</small></span></div>' +
        '<button type="button" id="uitloggen">Uitloggen</button></div>' +
    '</nav>';
  }

  function tekenPortaal() {
    app.className = '';
    app.innerHTML = '<div class="schil">' + zijbalk() + '<main class="werk" id="werk"></main></div>';
    document.getElementById('uitloggen').addEventListener('click', function () {
      haal('/uitloggen', {}).then(function () { ik = null; laatsteBewaking = null; tekenInlog(); });
    });
    document.getElementById('naaroverzicht').addEventListener('click', start);
    var st = document.getElementById('naarstoring');
    if (st) st.addEventListener('click', tekenStoring);
    if (beeld.rol === 'medewerker') tekenMedewerker(); else tekenKlant();
  }

  function documentRij(d) {
    var kl = KLEUR[d.soort] || KLEUR.rapport;
    return '<button type="button" class="rij" data-doc="' + esc(d.id) + '">' +
      '<span class="soort" style="background:' + kl[0] + ';color:' + kl[1] + '">' + (IKOON[d.soort] || '') + '</span>' +
      '<span><b>' + esc(d.titel) + '</b><small>' + esc(d.soort) + ' · ' + datum(d.datum) + '</small></span>' +
      '<span class="bedrag">' + euro(d.bedrag) + '</span>' +
      '<span class="merkje ' + (MERKJE[d.status] || 'klaar') + '">' + esc(d.status) + '</span>' +
    '</button>';
  }

  function tekenKlant() {
    var open = beeld.documenten.filter(function (d) { return d.status === 'open'; });
    var teDoen = beeld.documenten.filter(function (d) { return d.status === 'wacht op akkoord'; });
    var volgende = beeld.afspraken[0];
    var werk = document.getElementById('werk');
    werk.innerHTML =
      '<div class="werk-kop"><div><h1>Hallo ' + esc(ik.naam.split(' ')[0]) + '</h1>' +
        '<p>' + esc(beeld.klant.installatie) + ' · ' + esc(beeld.klant.contract) + '</p></div></div>' +
      bewakingsbalk() +
      '<div class="kaarten">' +
        '<div class="kaart"><p class="label">Openstaand</p><p class="getal">' +
          euro(open.reduce(function (n, d) { return n + (d.bedrag || 0); }, 0)) + '</p>' +
          '<p class="bij">' + open.length + ' ' + (open.length === 1 ? 'factuur' : 'facturen') + '</p></div>' +
        '<div class="kaart"><p class="label">Wacht op jou</p><p class="getal">' + teDoen.length + '</p>' +
          '<p class="bij">' + (teDoen.length ? 'offerte' + (teDoen.length > 1 ? 's' : '') + ' om te beoordelen' : 'niets te doen') + '</p></div>' +
        '<div class="kaart"><p class="label">Volgende afspraak</p><p class="getal" style="font-size:1.25rem">' +
          (volgende ? datum(volgende.datum) : '—') + '</p>' +
          '<p class="bij">' + (volgende ? esc(volgende.omschrijving) : 'geen afspraak gepland') + '</p></div>' +
      '</div>' +
      probeerBlok() +
      '<section class="blok"><div class="blok-kop"><h2>Je documenten</h2>' +
        '<span style="color:var(--tekst-3);font-size:.85rem">' + beeld.documenten.length + ' stuks</span></div>' +
        (beeld.documenten.length ? beeld.documenten.map(documentRij).join('') : '<p class="leeg">Nog niets.</p>') +
      '</section>' +
      '<section class="blok"><div class="blok-kop"><h2>Geplande afspraken</h2></div>' +
        (beeld.afspraken.length ? beeld.afspraken.map(function (a) {
          return '<div class="rij" style="cursor:default"><span class="soort" style="background:var(--merk-zacht);color:var(--merk)">' +
            '<svg viewBox="0 0 16 16" fill="none"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></span>' +
            '<span><b>' + esc(a.omschrijving) + '</b><small>' + datum(a.datum) + ' · ' + esc(a.dagdeel) + ' · ' + esc(a.monteur) + '</small></span>' +
            '<span></span><span></span></div>';
        }).join('') : '<p class="leeg">Geen afspraken gepland.</p>') +
      '</section>';
    koppelRijen();
  }

  function tekenMedewerker() {
    var werk = document.getElementById('werk');
    werk.innerHTML =
      '<div class="werk-kop"><div><h1>Alle klanten</h1><p>Je ziet dit overzicht omdat je als medewerker bent ingelogd.</p></div></div>' +
      bewakingsbalk() +
      probeerBlok() +
      '<section class="blok"><div class="blok-kop"><h2>Klanten</h2>' +
        '<span style="color:var(--tekst-3);font-size:.85rem">' + beeld.klanten.length + '</span></div>' +
        beeld.klanten.map(function (k) {
          return '<button type="button" class="rij" data-klant="' + esc(k.id) + '">' +
            '<span class="soort" style="background:var(--nacht);color:#fff;font-size:.72rem;font-weight:700">' + letters(k.naam) + '</span>' +
            '<span><b>' + esc(k.naam) + '</b><small>' + esc(k.soort) + ' · ' + esc(k.adres) + '</small></span>' +
            '<span class="bedrag">' + (k.volgende ? datum(k.volgende.datum) : '—') + '</span>' +
            '<span class="merkje ' + (k.open ? 'open' : 'betaald') + '">' +
              (k.open ? k.open + ' open' : 'niets open') + (k.teAkkorderen ? ' · ' + k.teAkkorderen + ' offerte' : '') + '</span>' +
          '</button>';
        }).join('') +
      '</section>';
    koppelRijen();
  }

  function probeerBlok() {
    var alle = ['k1', 'k2', 'k3'];
    var namen = { k1: 'Marieke Bos', k2: 'Hotel De Eemhof', k3: 'Bakkerij Verhoef' };
    return '<section class="probeer"><h2>Probeer het zelf: mag jij dit zien?</h2>' +
      '<p>Vraag hieronder een dossier op dat niet van jou is. Het scherm verbergt normaal wat je niet mag zien, maar dat is geen slot — de server beslist. Kijk wat er terugkomt.</p>' +
      '<div class="rijtje"><select id="probeerkeus">' +
        alle.map(function (k) {
          return '<option value="' + k + '"' + (ik.klantId === k ? ' selected' : '') + '>Dossier ' + k + ' — ' + esc(namen[k]) +
            (ik.klantId === k ? ' (dat ben jij)' : '') + '</option>';
        }).join('') +
      '</select><button type="button" class="knop" id="probeerknop">Vraag het aan de server</button></div>' +
      '<div class="uitslag" id="probeeruit">nog niets geprobeerd</div></section>';
  }

  function koppelRijen() {
    [].forEach.call(document.querySelectorAll('[data-doc]'), function (r) {
      r.addEventListener('click', function () { openDocument(r.getAttribute('data-doc')); });
    });
    [].forEach.call(document.querySelectorAll('[data-klant]'), function (r) {
      r.addEventListener('click', function () {
        haal('/dossier?klant=' + encodeURIComponent(r.getAttribute('data-klant'))).then(function (j) {
          if (!j.__ok) return;
          beeld = { rol: 'klant-via-medewerker', bedrijf: beeld.bedrijf, klant: j.klant, documenten: j.documenten, afspraken: j.afspraken };
          tekenDossierVanKlant();
        });
      });
    });
    var pk = document.getElementById('probeerknop');
    if (pk) {
      pk.addEventListener('click', function () {
        var keus = document.getElementById('probeerkeus').value;
        var uit = document.getElementById('probeeruit');
        uit.textContent = 'GET /api/portaal/dossier?klant=' + keus + '…';
        haal('/dossier?klant=' + encodeURIComponent(keus)).then(function (j) {
          uit.innerHTML = 'GET /api/portaal/dossier?klant=' + esc(keus) + '\n\n' +
            (j.__ok
              ? '<span class="ja">200 OK</span> — ' + esc(j.klant.naam) + ', ' + j.documenten.length + ' documenten\n' + esc(j.bewaking)
              : '<span class="nee">403 Verboden</span> — ' + esc(j.fout) + '\n' + esc(j.bewaking || ''));
        });
      });
    }
  }

  function tekenDossierVanKlant() {
    var werk = document.getElementById('werk');
    werk.innerHTML =
      '<div class="werk-kop"><div><h1>' + esc(beeld.klant.naam) + '</h1>' +
        '<p>' + esc(beeld.klant.adres) + ' · ' + esc(beeld.klant.installatie) + '</p></div>' +
        '<button type="button" class="knop knop-klein" id="terug">Terug naar alle klanten</button></div>' +
      bewakingsbalk() +
      '<section class="blok"><div class="blok-kop"><h2>Documenten</h2></div>' +
        (beeld.documenten.length ? beeld.documenten.map(documentRij).join('') : '<p class="leeg">Nog niets.</p>') +
      '</section>';
    document.getElementById('terug').addEventListener('click', start);
    koppelRijen();
  }

  /* ---------- document ---------- */
  function openDocument(id) {
    haal('/document?id=' + encodeURIComponent(id)).then(function (j) {
      if (!j.__ok) { toonDoos('<h2>Dat mag niet</h2><p style="color:var(--tekst-2)">' + esc(j.fout) + '</p>' +
        '<div class="melding fout" style="margin-top:14px">' + esc(j.bewaking || '') + '</div>'); return; }
      var d = j.document;
      var kanBeslissen = d.soort === 'offerte' && d.status === 'wacht op akkoord' && ik.rol === 'klant';
      toonDoos(
        '<h2>' + esc(d.titel) + '</h2>' +
        '<p style="color:var(--tekst-2);margin:0">' + esc(j.klant.naam) + ' · ' + esc(d.soort) + '</p>' +
        '<ul class="gegevens">' +
          '<li><dt>Datum</dt><dd style="margin:0">' + datum(d.datum) + '</dd></li>' +
          (d.bedrag != null ? '<li><dt>Bedrag</dt><dd style="margin:0"><b>' + euro(d.bedrag) + '</b></dd></li>' : '') +
          '<li><dt>Status</dt><dd style="margin:0"><span class="merkje ' + (MERKJE[d.status] || 'klaar') + '">' + esc(d.status) + '</span></dd></li>' +
          (d.vervalt ? '<li><dt>Vervalt op</dt><dd style="margin:0">' + datum(d.vervalt) + '</dd></li>' : '') +
          (d.geldigTot ? '<li><dt>Geldig tot</dt><dd style="margin:0">' + datum(d.geldigTot) + '</dd></li>' : '') +
        '</ul>' +
        '<div id="doosmelding"></div>' +
        (kanBeslissen
          ? '<div class="doos-knoppen"><button type="button" class="knop knop-vol" data-akkoord="1">Akkoord geven</button>' +
            '<button type="button" class="knop" data-akkoord="0">Afwijzen</button></div>'
          : '') +
        '<p style="font-size:.8rem;color:var(--tekst-3);margin-top:16px">In een echt portaal zit hier de pdf. Voor deze demo is dat weggelaten.</p>'
      );
      [].forEach.call(document.querySelectorAll('[data-akkoord]'), function (k) {
        k.addEventListener('click', function () {
          haal('/offerte', { id: d.id, akkoord: k.getAttribute('data-akkoord') === '1' }).then(function (r) {
            if (!r.__ok) { document.getElementById('doosmelding').innerHTML = '<div class="melding fout">' + esc(r.fout) + '</div>'; return; }
            sluitDoos();
            start();
          });
        });
      });
    });
  }

  function tekenStoring() {
    toonDoos(
      '<h2>Storing melden</h2><p style="color:var(--tekst-2);margin:0 0 16px">We bellen je terug om een tijd af te spreken.</p>' +
      '<div class="veld"><label for="oms">Wat is er aan de hand?</label>' +
        '<textarea id="oms" rows="4" placeholder="De ketel slaat af en geeft foutcode F28"></textarea></div>' +
      '<label style="display:flex;gap:9px;align-items:center;font-size:.9rem;margin-bottom:8px">' +
        '<input type="checkbox" id="spoed"> Geen warm water of verwarming — spoed</label>' +
      '<div id="doosmelding"></div>' +
      '<div class="doos-knoppen"><button type="button" class="knop knop-vol" id="meldknop">Melding versturen</button></div>'
    );
    document.getElementById('meldknop').addEventListener('click', function () {
      haal('/storing', { omschrijving: document.getElementById('oms').value, spoed: document.getElementById('spoed').checked })
        .then(function (j) {
          if (!j.__ok) { document.getElementById('doosmelding').innerHTML = '<div class="melding fout">' + esc(j.fout) + '</div>'; return; }
          sluitDoos();
          start();
        });
    });
  }

  function toonDoos(inhoud) {
    sluitDoos();
    var over = document.createElement('div');
    over.className = 'over'; over.id = 'over';
    over.innerHTML = '<div class="doos"><button type="button" class="dicht" id="dichtknop" aria-label="Sluiten">&times;</button>' + inhoud + '</div>';
    document.body.appendChild(over);
    document.getElementById('dichtknop').addEventListener('click', sluitDoos);
    over.addEventListener('mousedown', function (e) { if (e.target === over) sluitDoos(); });
  }
  function sluitDoos() { var o = document.getElementById('over'); if (o) o.remove(); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') sluitDoos(); });

  /* ---------- starten ---------- */
  demobalk('portaal', 'Van Dijk Installatie');
  haal('/ik').then(function (j) {
    if (j.ik) { ik = j.ik; start(); } else tekenInlog();
  }).catch(function () { app.textContent = 'Het portaal kon niet geladen worden.'; });
}());
