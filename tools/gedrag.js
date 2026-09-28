(function () {
  var kaarten = [].slice.call(document.querySelectorAll('.kaart'));
  var groepen = [].slice.call(document.querySelectorAll('.groep'));
  var filters = [].slice.call(document.querySelectorAll('.filter'));
  var zoekveld = document.getElementById('zoekveld');
  var niets = document.getElementById('niets');
  var overlay = document.getElementById('overlay');
  var venster = overlay ? overlay.querySelector('.venster') : null;
  var titelId = 'venster-titel';
  var laatsteKnop = null;
  var huidigFilter = 'alles';

  /* ---------- filteren en zoeken ---------- */
  function past(kaart) {
    var tags = ' ' + (kaart.getAttribute('data-tags') || '') + ' ';
    if (huidigFilter !== 'alles' && tags.indexOf(' ' + huidigFilter + ' ') === -1) return false;
    var term = (zoekveld && zoekveld.value || '').trim().toLowerCase();
    if (!term) return true;
    return (kaart.getAttribute('data-zoek') || '').indexOf(term) > -1;
  }

  function ververs() {
    var zichtbaar = 0;
    kaarten.forEach(function (k) {
      var toon = past(k);
      k.hidden = !toon;
      if (toon) zichtbaar++;
    });
    groepen.forEach(function (g) {
      var over = [].slice.call(g.querySelectorAll('.kaart')).filter(function (k) { return !k.hidden; });
      g.hidden = over.length === 0;
      var telling = g.querySelector('.telling');
      if (telling) telling.textContent = over.length;
    });
    if (niets) niets.hidden = zichtbaar > 0;
  }

  filters.forEach(function (f) {
    f.addEventListener('click', function () {
      filters.forEach(function (o) { o.setAttribute('aria-pressed', 'false'); });
      f.setAttribute('aria-pressed', 'true');
      huidigFilter = f.getAttribute('data-filter');
      ververs();
    });
  });

  if (zoekveld) {
    zoekveld.addEventListener('input', ververs);
    zoekveld.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { zoekveld.value = ''; ververs(); }
    });
  }

  /* ---------- venster met de projectuitleg ---------- */
  function open(id, knop) {
    var paneel = document.getElementById('paneel-' + id);
    if (!paneel || !overlay) return;
    [].forEach.call(overlay.querySelectorAll('.paneel'), function (p) { p.hidden = true; });
    paneel.hidden = false;
    var kop = paneel.querySelector('h2');
    if (kop) { kop.id = titelId; }
    overlay.hidden = false;
    document.body.classList.add('vast');
    laatsteKnop = knop || null;
    open.huidig = id;
    if (venster) { venster.scrollTop = 0; venster.focus(); }
    overlay.scrollTop = 0;
    try { history.replaceState(null, '', '#' + id); } catch (e) { /* geeft niet */ }
  }

  function sluit() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    open.huidig = null;
    document.body.classList.remove('vast');
    if (laatsteKnop) { laatsteKnop.focus(); laatsteKnop = null; }
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* geeft niet */ }
  }

  // vorige of volgende project, alleen door wat nu zichtbaar is
  function stap(richting) {
    if (!open.huidig) return;
    var zichtbaar = kaarten.filter(function (k) { return !k.hidden; });
    var nu = zichtbaar.findIndex(function (k) { return k.getAttribute('data-id') === open.huidig; });
    if (nu === -1) return;
    var volgende = zichtbaar[(nu + richting + zichtbaar.length) % zichtbaar.length];
    if (volgende) open(volgende.getAttribute('data-id'), volgende.querySelector('.kaart-knop'));
  }

  kaarten.forEach(function (k) {
    var knop = k.querySelector('.kaart-knop');
    if (!knop) return;
    knop.addEventListener('click', function () { open(k.getAttribute('data-id'), knop); });
  });

  var sluitknop = document.getElementById('sluit');
  if (sluitknop) sluitknop.addEventListener('click', sluit);

  /* ---------- galerij: klik een klein scherm, zie het groot ---------- */
  [].forEach.call(document.querySelectorAll('[data-galerij]'), function (galerij) {
    var groot = galerij.querySelector('[data-rol="groot"]');
    var titel = galerij.querySelector('[data-rol="titel"]');
    var bijschrift = galerij.querySelector('[data-rol="bijschrift"]');
    var duimen = [].slice.call(galerij.querySelectorAll('.duimknop'));
    duimen.forEach(function (d) {
      d.addEventListener('click', function () {
        duimen.forEach(function (o) { o.setAttribute('aria-selected', 'false'); });
        d.setAttribute('aria-selected', 'true');
        groot.src = 'img/' + d.getAttribute('data-bestand');
        groot.alt = d.getAttribute('data-alt') || '';
        titel.textContent = d.getAttribute('data-titel') || '';
        bijschrift.textContent = d.getAttribute('data-bijschrift') || '';
      });
    });
  });

  /* ---------- link naar één project kopieren ---------- */
  [].forEach.call(document.querySelectorAll('[data-deel]'), function (knop) {
    knop.addEventListener('click', function () {
      var adres = location.origin + location.pathname + '#' + knop.getAttribute('data-deel');
      var klaar = function (tekst) {
        knop.textContent = tekst;
        setTimeout(function () { knop.textContent = 'Kopieer link naar dit project'; }, 2200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(adres).then(function () { klaar('Link gekopieerd'); },
          function () { klaar(adres); });
      } else {
        klaar(adres);
      }
    });
  });

  /* ---------- licht dat de muis volgt ---------- */
  var bezig = false;
  document.addEventListener('mousemove', function (e) {
    if (bezig) return;
    bezig = true;
    requestAnimationFrame(function () {
      bezig = false;
      var knop = e.target && e.target.closest ? e.target.closest('.kaart-knop') : null;
      if (!knop) return;
      var vak = knop.getBoundingClientRect();
      knop.style.setProperty('--mx', (e.clientX - vak.left) + 'px');
      knop.style.setProperty('--my', (e.clientY - vak.top) + 'px');
    });
  });

  if (overlay) {
    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) sluit();
    });
  }

  document.addEventListener('keydown', function (e) {
    var inVeld = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '');
    if (e.key === 'Escape') { sluit(); return; }
    if (e.key === '/' && !inVeld && zoekveld) {
      e.preventDefault();
      zoekveld.focus();
      zoekveld.select();
      return;
    }
    if (overlay && !overlay.hidden) {
      if (e.key === 'ArrowRight') { e.preventDefault(); stap(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); stap(-1); }
    }
  });

  // een link als .../#kozijnfabriek opent dat project meteen
  function volgHash() {
    var id = (location.hash || '').replace('#', '');
    if (!id) return;
    var kaart = kaarten.filter(function (k) { return k.getAttribute('data-id') === id; })[0];
    if (kaart) open(id, kaart.querySelector('.kaart-knop'));
  }
  window.addEventListener('hashchange', volgHash);

  /* ---------- e-mailadres kopieren ---------- */
  var knopKopieer = document.getElementById('kopieer');
  var adres = document.getElementById('adres');
  if (knopKopieer && adres) {
    var terug = function () {
      setTimeout(function () { knopKopieer.textContent = 'Kopieer adres'; }, 2000);
    };
    var selecteer = function () {
      try {
        var r = document.createRange();
        r.selectNodeContents(adres);
        var s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
        knopKopieer.textContent = 'Selecteer en kopieer';
      } catch (e) { /* het adres staat er gewoon */ }
      terug();
    };
    knopKopieer.addEventListener('click', function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(adres.textContent).then(function () {
          knopKopieer.textContent = 'Gekopieerd';
          terug();
        }, selecteer);
      } else {
        selecteer();
      }
    });
  }

  ververs();
  volgHash();
})();
