// Het live dashboard. De browser vraagt hier niets: hij houdt één verbinding
// open en de server duwt er regels doorheen zodra er iets gebeurt. Valt de
// verbinding weg, dan zet EventSource hem zelf weer op — dat is precies de
// reden om hiervoor server-sent events te gebruiken en geen websocket.
(function () {
  var app = document.getElementById('app');
  var D = null, verbonden = false, vorigeWagens = {}, eersteTekening = true;

  var esc = function (t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; };
  var getal = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  var klok = function (iso) {
    var d = iso ? new Date(iso) : new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
  };

  var TEKEN = {
    goed: '<svg viewBox="0 0 16 16" fill="none"><path d="M3 8.4l3.2 3.2L13 4.8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    let: '<svg viewBox="0 0 16 16" fill="none"><path d="M8 3.4v5.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="8" cy="12.2" r="1.2" fill="currentColor"/></svg>',
    slecht: '<svg viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    rit: '<svg viewBox="0 0 16 16" fill="none"><path d="M1.5 11V5h8v6M9.5 7h3l2 2.4V11M1.5 11h1.6M6.4 11h3.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="4.6" cy="11.6" r="1.5" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="11.6" r="1.5" stroke="currentColor" stroke-width="1.4"/></svg>'
  };

  function stiptheid(p) { return p >= 95 ? 'goed' : p >= 90 ? 'let' : 'slecht'; }
  function stiptWoord(p) { return p >= 95 ? 'op schema' : p >= 90 ? 'let op' : 'te veel te laat'; }

  /* ---------- grafiek ---------- */
  var GB = 620, GH = 170, MARGE = { l: 34, r: 8, b: 20, t: 8 };

  function grafiek() {
    var rijen = D.geschiedenis;
    if (rijen.length < 2) return '<p style="color:var(--tekst-3);padding:20px 0;font-size:.85rem">De eerste meetpunten komen eraan…</p>';

    var begin = rijen[0].ritten;
    var waarden = rijen.map(function (r) { return r.ritten - begin; });
    var max = Math.max(1, Math.max.apply(null, waarden));
    var bl = GB - MARGE.l - MARGE.r, bh = GH - MARGE.t - MARGE.b;
    var x = function (i) { return MARGE.l + (i / (rijen.length - 1)) * bl; };
    var y = function (v) { return MARGE.t + bh - (v / max) * bh; };

    var lijn = waarden.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
    var vlak = lijn + ' L' + x(rijen.length - 1).toFixed(1) + ' ' + (MARGE.t + bh) + ' L' + MARGE.l + ' ' + (MARGE.t + bh) + ' Z';

    var strepen = '';
    for (var n = 0; n <= 3; n++) {
      var w = Math.round((max / 3) * n);
      var yy = y(w);
      strepen += '<line class="raster" x1="' + MARGE.l + '" y1="' + yy.toFixed(1) + '" x2="' + (GB - MARGE.r) + '" y2="' + yy.toFixed(1) + '"/>' +
        '<text class="aslabel" x="' + (MARGE.l - 7) + '" y="' + (yy + 3).toFixed(1) + '" text-anchor="end">' + w + '</text>';
    }

    return '<svg viewBox="0 0 ' + GB + ' ' + GH + '" id="svggrafiek" role="img" aria-label="Geleverde ritten sinds je dit scherm opende">' +
      '<defs><linearGradient id="verloop" x1="0" x2="0" y1="0" y2="1">' +
        '<stop offset="0%" stop-color="#5B8CFF" stop-opacity=".22"/><stop offset="100%" stop-color="#5B8CFF" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      strepen +
      '<path class="vlak" d="' + vlak + '"/>' +
      '<path class="lijn" d="' + lijn + '"/>' +
      '<circle class="punt" cx="' + x(rijen.length - 1).toFixed(1) + '" cy="' + y(waarden[waarden.length - 1]).toFixed(1) + '" r="4.5"/>' +
      '<rect id="vangvlak" x="' + MARGE.l + '" y="' + MARGE.t + '" width="' + bl + '" height="' + bh + '" fill="transparent" style="cursor:crosshair"/>' +
    '</svg><div class="tip" id="tip"></div>';
  }

  function koppelGrafiek() {
    var svg = document.getElementById('svggrafiek');
    var vang = document.getElementById('vangvlak');
    var tip = document.getElementById('tip');
    if (!svg || !vang || !tip) return;
    var rijen = D.geschiedenis;
    var begin = rijen[0].ritten;

    vang.addEventListener('mousemove', function (e) {
      var doos = svg.getBoundingClientRect();
      var deel = (e.clientX - doos.left) / doos.width;
      var i = Math.max(0, Math.min(rijen.length - 1, Math.round(((deel * GB) - MARGE.l) / (GB - MARGE.l - MARGE.r) * (rijen.length - 1))));
      var r = rijen[i];
      tip.innerHTML = '<b>' + (r.ritten - begin) + ' ritten geleverd</b><span>' + klok(new Date(r.op).toISOString()) +
        ' · ' + r.onderweg + ' wagens onderweg</span>';
      tip.style.left = ((MARGE.l + (i / (rijen.length - 1)) * (GB - MARGE.l - MARGE.r)) / GB * doos.width) + 'px';
      tip.style.top = (doos.height * 0.35) + 'px';
      tip.style.opacity = '1';
    });
    vang.addEventListener('mouseleave', function () { tip.style.opacity = '0'; });
  }

  /* ---------- tekenen ---------- */
  function teken(nieuweGebeurtenis) {
    var k = D.kengetallen;
    var st = stiptheid(k.opTijdPercentage);
    app.className = '';
    app.innerHTML =
      '<header class="balk">' +
        '<div class="merk"><b>' + esc(D.bedrijf.naam) + '</b><span>' + esc(D.bedrijf.onder) + ' · ' + esc(D.bedrijf.standplaats) + '</span></div>' +
        '<div class="pols' + (verbonden ? '' : ' weg') + '"><i></i>' + (verbonden ? 'live verbonden' : 'verbinding weg, opnieuw proberen…') + '</div>' +
      '</header>' +
      '<div class="romp"><div>' +
        '<section class="held"><p class="label">Ritten geleverd vandaag</p>' +
          '<p class="getal" id="hoofdgetal">' + getal(k.ritten) + '</p>' +
          '<p class="bij">' + getal(k.kilometers) + ' kilometer gereden · ' + k.onderweg + ' van de ' + k.inBedrijf + ' wagens nu onderweg</p></section>' +
        '<div class="tegels">' +
          tegel('Op tijd geleverd', k.opTijdPercentage + '%', st, stiptWoord(k.opTijdPercentage)) +
          // een vinkje bij te late ritten zou een geruststelling zijn die er
          // niet is; alleen nul te laat is goed nieuws
          tegel('Te laat', String(k.teLaat),
            k.teLaat === 0 ? 'goed' : st === 'goed' ? 'neutraal' : 'let',
            k.teLaat ? 'gemiddeld ' + k.gemiddeldeVertraging + ' min vertraging' : 'niets te laat') +
          tegel('Wagens onderweg', String(k.onderweg), 'neutraal', 'van ' + k.inBedrijf + ' in bedrijf') +
        '</div>' +
        '<section class="blok"><div class="blok-kop"><h2>Geleverde ritten sinds je dit scherm opende</h2>' +
          '<small>elke ' + '2,6' + ' seconden een meetpunt</small></div>' +
          '<div class="grafiek">' + grafiek() + '</div></section>' +
        '<section class="blok"><div class="blok-kop"><h2>De vloot</h2><small>' + D.wagens.length + ' wagens</small></div>' +
          D.wagens.map(function (w) {
            var wisselde = vorigeWagens[w.id] && vorigeWagens[w.id] !== w.status;
            return '<div class="wagen' + (wisselde && !eersteTekening ? ' knippert' : '') + '">' +
              '<span class="kenteken">' + esc(w.kenteken) + '</span>' +
              '<span><b>' + esc(w.chauffeur) + '</b><small>' + esc(w.soort) + ' · ' + esc(w.regio) +
                (w.volgende ? ' · volgende: ' + esc(w.volgende) : '') + ' · ' + w.ritten + ' ritten</small></span>' +
              '<span class="staat ' + esc(w.status) + '">' + esc(w.status) + '</span>' +
            '</div>';
          }).join('') +
        '</section>' +
      '</div>' +
      '<aside><section class="blok"><div class="blok-kop"><h2>Wat er nu binnenkomt</h2>' +
          '<small>' + klok() + '</small></div>' +
        '<div class="stroom">' +
          (D.gebeurtenissen.length ? D.gebeurtenissen.map(function (g, i) {
            var soort = g.soort === 'telaat' ? 'telaat' : g.soort === 'status' ? 'status' : 'gelost';
            var teken = g.soort === 'telaat' ? TEKEN.let : g.soort === 'status' ? TEKEN.rit : TEKEN.goed;
            return '<div class="melding ' + soort + (i === 0 && nieuweGebeurtenis ? ' nieuw' : '') + '">' +
              '<i>' + teken + '</i><span><p>' + esc(g.tekst) + '</p><time>' + klok(g.op) + '</time></span></div>';
          }).join('') : '<p style="padding:20px 16px;color:var(--tekst-3);font-size:.85rem">Nog geen meldingen.</p>') +
        '</div>' +
        '<p class="uitleg">Deze pagina vraagt niets op. De server houdt <b>één verbinding</b> open en stuurt er een regel doorheen zodra er iets gebeurt. Zet dit scherm in twee tabbladen naast elkaar — ze hangen aan dezelfde stroom en lopen gelijk.</p>' +
      '</section></aside></div>';

    vorigeWagens = {};
    D.wagens.forEach(function (w) { vorigeWagens[w.id] = w.status; });
    eersteTekening = false;
    koppelGrafiek();
  }

  function tegel(label, waarde, soort, bij) {
    return '<div class="tegel"><p class="label">' + esc(label) + '</p>' +
      '<p class="waarde ' + soort + '">' + esc(waarde) + '</p>' +
      '<p class="bij ' + soort + '">' + (TEKEN[soort] || '') + esc(bij) + '</p></div>';
  }

  /* ---------- de verbinding ---------- */
  var bron = new EventSource('/api/vloot/stroom');
  bron.addEventListener('begin', function (e) {
    verbonden = true;
    D = JSON.parse(e.data);
    teken(false);
  });
  bron.addEventListener('tik', function (e) {
    verbonden = true;
    var pakket = JSON.parse(e.data);
    D = pakket;
    teken(Boolean(pakket.gebeurtenis));
  });
  bron.addEventListener('error', function () {
    verbonden = false;
    if (D) teken(false);
    // EventSource probeert zelf opnieuw; we laten alleen zien dat het even weg is
  });

  demobalk('vloot', 'Kempen Transport');
}());
