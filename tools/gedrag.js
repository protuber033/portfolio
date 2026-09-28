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
    if (venster) { venster.scrollTop = 0; venster.focus(); }
    overlay.scrollTop = 0;
  }

  function sluit() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    document.body.classList.remove('vast');
    if (laatsteKnop) { laatsteKnop.focus(); laatsteKnop = null; }
  }

  kaarten.forEach(function (k) {
    var knop = k.querySelector('.kaart-knop');
    if (!knop) return;
    knop.addEventListener('click', function () { open(k.getAttribute('data-id'), knop); });
  });

  var sluitknop = document.getElementById('sluit');
  if (sluitknop) sluitknop.addEventListener('click', sluit);

  if (overlay) {
    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) sluit();
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') sluit();
  });

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
})();
