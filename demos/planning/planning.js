// De dagplanning. Slepen werkt met de muis; op een telefoon tik je een klus
// aan en daarna het vak waar hij heen moet. Beide wegen komen uit op
// dezelfde aanroep, want twee manieren van invoeren is nog geen reden voor
// twee stukken logica.
(function () {
  var app = document.getElementById('app');
  var D = null, gekozen = null, bericht = null;

  var esc = function (t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; };
  var uur = function (m) {
    var h = Math.floor(Math.abs(m) / 60), r = Math.abs(m) % 60;
    return (m < 0 ? '-' : '') + (h ? h + ' u ' : '') + (r || !h ? r + ' min' : '');
  };

  function haal(pad, invoer) {
    var o = invoer ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(invoer) } : {};
    return fetch('/api/planning' + pad, o).then(function (a) { return a.json(); });
  }

  function verwerk(j) {
    if (j.fout) { bericht = { tekst: j.fout, soort: 'let' }; teken(); return; }
    D = j;
    bericht = j.bericht ? { tekst: j.bericht, soort: /let op|tekort|vol/i.test(j.bericht) ? 'let' : 'goed' } : null;
    teken();
  }

  /* ---------- kaart ---------- */
  var KB = 1000, KH = 640;
  function naarX(lon) { return ((lon - D.kader.lonMin) / (D.kader.lonMax - D.kader.lonMin)) * KB; }
  function naarY(lat) { return ((D.kader.latMax - lat) / (D.kader.latMax - D.kader.latMin)) * KH; }

  function kaart() {
    var s = '<svg class="kaart-svg" viewBox="0 0 ' + KB + ' ' + KH + '" role="img" aria-label="Schematische kaart van de regio met de klussen van vandaag">';
    s += '<rect width="' + KB + '" height="' + KH + '" fill="#E9F0E4"/>';
    // wat groen en water, puur als herkenningspunt
    s += '<path d="M0 470 C 180 430 300 520 470 495 C 640 470 780 540 1000 500 L1000 640 L0 640Z" fill="#DCE8D5"/>';
    s += '<path d="M120 0 C 180 140 150 300 230 430 C 290 530 260 610 300 640" stroke="#BFD6E8" stroke-width="16" fill="none" stroke-linecap="round"/>';
    s += '<path d="M0 355 L1000 300" stroke="#D3DCCB" stroke-width="9" fill="none"/>';
    s += '<path d="M330 0 L360 640" stroke="#D3DCCB" stroke-width="7" fill="none"/>';

    (D.plaatsen || []).forEach(function (p) {
      var x = naarX(p.lon), y = naarY(p.lat);
      s += '<circle cx="' + x + '" cy="' + y + '" r="' + (p.groot ? 7 : 5) + '" fill="#A9B9A0"/>';
      s += '<text x="' + (x + 12) + '" y="' + (y + 5) + '" font-family="Outfit, Helvetica, sans-serif" font-size="' +
        (p.groot ? 21 : 18) + '" fill="#7C8B74">' + esc(p.naam) + '</text>';
    });

    // ritten per ploeg
    D.ritten.forEach(function (r) {
      if (!r.klussen.length) return;
      var ploeg = D.ploegen.filter(function (p) { return p.id === r.ploegId; })[0];
      var punten = [D.bedrijf.basis].concat(r.klussen.map(function (id) {
        return D.klussen.filter(function (k) { return k.id === id; })[0];
      })).concat([D.bedrijf.basis]);
      var d = punten.map(function (p, i) { return (i ? 'L' : 'M') + naarX(p.lon).toFixed(1) + ' ' + naarY(p.lat).toFixed(1); }).join(' ');
      s += '<path d="' + d + '" stroke="' + ploeg.kleur + '" stroke-width="3" fill="none" opacity="' +
        (r.dagdeel === 'ochtend' ? '.85' : '.5') + '" stroke-linejoin="round"' +
        (r.dagdeel === 'middag' ? ' stroke-dasharray="9 7"' : '') + '/>';
    });

    // de klussen zelf
    D.klussen.forEach(function (k) {
      var x = naarX(k.lon), y = naarY(k.lat);
      var ploeg = k.ploegId ? D.ploegen.filter(function (p) { return p.id === k.ploegId; })[0] : null;
      var kl = ploeg ? ploeg.kleur : (k.spoed ? '#A8231F' : '#95A38D');
      var uitgelicht = gekozen === k.id;
      if (uitgelicht) s += '<circle cx="' + x + '" cy="' + y + '" r="24" fill="' + kl + '" opacity=".22"/>';
      s += '<circle cx="' + x + '" cy="' + y + '" r="' + (ploeg ? 13 : 10) + '" fill="' + kl + '" stroke="#fff" stroke-width="3"/>';
      if (ploeg) {
        s += '<text x="' + x + '" y="' + (y + 5) + '" text-anchor="middle" font-family="Outfit, Helvetica, sans-serif" font-size="14" font-weight="700" fill="#fff">' + k.volgorde + '</text>';
      } else if (k.spoed) {
        s += '<text x="' + x + '" y="' + (y + 5) + '" text-anchor="middle" font-family="Outfit, Helvetica, sans-serif" font-size="14" font-weight="700" fill="#fff">!</text>';
      }
    });

    // de loods
    var bx = naarX(D.bedrijf.basis.lon), by = naarY(D.bedrijf.basis.lat);
    s += '<rect x="' + (bx - 11) + '" y="' + (by - 11) + '" width="22" height="22" rx="4" fill="#1D261A"/>';
    s += '<text x="' + (bx + 16) + '" y="' + (by + 6) + '" font-family="Outfit, Helvetica, sans-serif" font-size="18" font-weight="600" fill="#1D261A">Loods</text>';
    return s + '</svg>';
  }

  /* ---------- schermen ---------- */
  function klusBriefje(k, inRit) {
    var ploeg = k.ploegId ? D.ploegen.filter(function (p) { return p.id === k.ploegId; })[0] : null;
    return '<div class="klus ' + esc(k.soort) + (gekozen === k.id ? ' gekozen' : '') + '" draggable="true" data-klus="' + esc(k.id) + '">' +
      '<b>' + esc(k.klant) + '</b>' +
      '<small>' + esc(k.adres) + '</small>' +
      '<span class="werk">' + esc(k.werk) + '</span>' +
      '<span class="klus-onder">' +
        (inRit && ploeg ? '<span class="nr" style="background:' + ploeg.kleur + '">' + k.volgorde + '</span>' : '') +
        '<span class="duur">' + uur(k.minuten) + '</span>' +
        (k.spoed ? '<span class="duur" style="background:var(--rood-zacht);color:var(--rood)">spoed</span>' : '') +
        (inRit
          ? '<button type="button" class="pijl" data-omhoog="' + esc(k.id) + '" aria-label="Eerder in de rit">&uarr;</button>' +
            '<button type="button" class="pijl" data-omlaag="' + esc(k.id) + '" aria-label="Later in de rit">&darr;</button>' +
            '<button type="button" class="pijl" data-open="' + esc(k.id) + '" aria-label="Terug naar de stapel">&times;</button>'
          : '') +
      '</span>' +
    '</div>';
  }

  function teken() {
    var open = D.klussen.filter(function (k) { return !k.ploegId; });
    app.className = '';
    app.innerHTML =
      '<header class="balk">' +
        '<div class="merk">' + esc(D.bedrijf.naam) + '<span>' + esc(D.bedrijf.onder) + ' · dagplanning</span></div>' +
        '<div class="balk-cijfers">' +
          '<div class="cijfer"><b>' + D.samen.gepland + '/' + D.samen.totaal + '</b><span>ingepland</span></div>' +
          '<div class="cijfer"><b>' + D.samen.kilometers + ' km</b><span>samen op de weg</span></div>' +
          '<div class="cijfer' + (D.samen.teVol ? ' let' : '') + '"><b>' + D.samen.teVol + '</b><span>dagdelen te vol</span></div>' +
        '</div>' +
        '<div class="balk-knoppen">' +
          '<button type="button" class="knop knop-vol" id="vulaan">Vul automatisch aan</button>' +
          '<button type="button" class="knop" id="leeg">Alles open</button>' +
        '</div>' +
      '</header>' +
      (bericht ? '<p class="melding ' + bericht.soort + '" style="margin-top:14px">' + esc(bericht.tekst) + '</p>' : '') +
      '<p class="hint" style="margin-top:12px">Sleep een klus naar een ploeg en een dagdeel — of tik hem aan en tik daarna het vak waar hij heen moet.</p>' +
      '<div class="romp">' +
        '<section class="kolom"><div class="kolom-kop"><h2>Nog in te plannen</h2>' +
          '<small>' + open.length + '</small></div>' +
          '<div class="kolom-in" id="stapel" data-open-vak="1">' +
            (open.length ? open.map(function (k) { return klusBriefje(k, false); }).join('')
              : '<p class="leegvak">Alles is ingepland.</p>') +
          '</div></section>' +
        '<section class="ploegen">' + D.ploegen.map(ploegBlok).join('') + '</section>' +
        '<section class="kolom kaartvak"><div class="kolom-kop"><h2>De dag op de kaart</h2>' +
          '<small>doorgetrokken = ochtend</small></div>' +
          '<div class="legenda">' + D.ploegen.map(function (p) {
            return '<span><i style="background:' + p.kleur + '"></i>' + esc(p.naam) + '</span>';
          }).join('') + '</div>' +
          kaart() +
          '<p class="kaart-voet">Schematische kaart, zelf getekend uit de coördinaten. Reistijd is een schatting op hemelsbrede afstand maal 1,35 bij 42 km/u — geen routeplanner, wel genoeg om te zien of een dagdeel past.</p>' +
        '</section>' +
      '</div>';
    koppel();
  }

  function ploegBlok(p) {
    return '<article class="ploeg">' +
      '<div class="ploeg-kop"><span class="ploeg-stip" style="background:' + p.kleur + '"></span>' +
        '<span><b>' + esc(p.naam) + '</b><small>' + esc(p.bezetting) + ' · ' + esc(p.bus) + '</small></span></div>' +
      '<div class="dagdelen">' + D.dagdelen.map(function (d) {
        var rit = D.ritten.filter(function (r) { return r.ploegId === p.id && r.dagdeel === d.id; })[0];
        var klussen = rit.klussen.map(function (id) { return D.klussen.filter(function (k) { return k.id === id; })[0]; });
        var vol = Math.min(100, Math.round((rit.totaal / d.minuten) * 100));
        return '<div class="dagdeel" data-vak="' + esc(p.id) + '|' + esc(d.id) + '">' +
          '<div class="dagdeel-kop"><b>' + esc(d.naam) + '</b><span>' + esc(d.van) + '–' + esc(d.tot) + '</span></div>' +
          '<div class="balkje' + (rit.past ? '' : ' vol') + '"><i style="width:' + vol + '%"></i></div>' +
          '<p class="ruimte' + (rit.past ? '' : ' tekort') + '">' +
            (klussen.length
              ? uur(rit.werkMinuten) + ' werk + ' + uur(rit.reisMinuten) + ' rijden · ' +
                (rit.past ? uur(rit.ruimte) + ' over' : uur(Math.abs(rit.ruimte)) + ' tekort')
              : 'nog vrij') +
          '</p>' +
          (klussen.length ? klussen.map(function (k) { return klusBriefje(k, true); }).join('')
            : '<p class="leegvak">sleep hier iets naartoe</p>') +
        '</div>';
      }).join('') + '</div>' +
    '</article>';
  }

  /* ---------- gedrag ---------- */
  function plaats(id, vak) {
    gekozen = null;
    if (vak === 'open') { haal('/verplaats', { id: id, ploegId: null }).then(verwerk); return; }
    var p = vak.split('|');
    haal('/verplaats', { id: id, ploegId: p[0], dagdeel: p[1] }).then(verwerk);
  }

  function koppel() {
    document.getElementById('vulaan').addEventListener('click', function () { haal('/vulaan', {}).then(verwerk); });
    document.getElementById('leeg').addEventListener('click', function () { haal('/leeg', {}).then(verwerk); });

    [].forEach.call(document.querySelectorAll('[data-klus]'), function (el) {
      el.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', el.getAttribute('data-klus'));
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('sleept');
      });
      el.addEventListener('dragend', function () { el.classList.remove('sleept'); });
      el.addEventListener('click', function (e) {
        if (e.target.closest('.pijl')) return;
        var id = el.getAttribute('data-klus');
        gekozen = gekozen === id ? null : id;
        teken();
      });
    });

    function vang(el, vak) {
      el.addEventListener('dragover', function (e) { e.preventDefault(); el.classList.add('over'); });
      el.addEventListener('dragleave', function () { el.classList.remove('over'); });
      el.addEventListener('drop', function (e) {
        e.preventDefault(); el.classList.remove('over');
        var id = e.dataTransfer.getData('text/plain');
        if (id) plaats(id, vak);
      });
      el.addEventListener('click', function (e) {
        if (gekozen && !e.target.closest('[data-klus]')) plaats(gekozen, vak);
      });
    }
    [].forEach.call(document.querySelectorAll('[data-vak]'), function (el) { vang(el, el.getAttribute('data-vak')); });
    var stapel = document.getElementById('stapel');
    if (stapel) vang(stapel, 'open');

    [].forEach.call(document.querySelectorAll('[data-omhoog],[data-omlaag]'), function (k) {
      k.addEventListener('click', function (e) {
        e.stopPropagation();
        var omhoog = k.hasAttribute('data-omhoog');
        haal('/schuif', { id: k.getAttribute(omhoog ? 'data-omhoog' : 'data-omlaag'), richting: omhoog ? 'omhoog' : 'omlaag' }).then(verwerk);
      });
    });
    [].forEach.call(document.querySelectorAll('[data-open]'), function (k) {
      k.addEventListener('click', function (e) { e.stopPropagation(); plaats(k.getAttribute('data-open'), 'open'); });
    });
  }

  demobalk('planning', 'Hovenier Wilgenhof');
  haal('').then(verwerk).catch(function () { app.textContent = 'De planning kon niet geladen worden.'; });
}());
