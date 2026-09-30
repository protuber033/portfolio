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
  var mindBeweging = function () {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  // De tegel die je aanklikt groeit uit tot het scherm in het venster. De
  // browser regelt de beweging zelf; wij geven de twee beelden dezelfde naam
  // zodat hij weet dat het hetzelfde ding is. Let op: die naam mag op één
  // moment maar bij één element horen, dus we halen hem bij de tegel weg op
  // het moment dat het venster hem overneemt.
  function metOvergang(bron, doel, doen) {
    if (!document.startViewTransition || mindBeweging()) { doen(); return; }
    var wis = function () {
      if (bron) bron.style.viewTransitionName = '';
      if (doel()) doel().style.viewTransitionName = '';
    };
    if (bron) bron.style.viewTransitionName = 'beeld';
    try {
      var overgang = document.startViewTransition(function () {
        if (bron) bron.style.viewTransitionName = '';
        doen();
        var d = doel();
        if (d) d.style.viewTransitionName = 'beeld';
      });
      overgang.finished.then(wis, wis);
    } catch (e) {
      wis();
      doen();
    }
  }

  function open(id, knop) {
    var paneel = document.getElementById('paneel-' + id);
    if (!paneel || !overlay) return;
    if (overlay.hidden) {
      metOvergang(
        knop && knop.querySelector('img'),
        function () { return paneel.querySelector('[data-rol="groot"]') || paneel.querySelector('img'); },
        function () { openNu(id, knop); }
      );
      return;
    }
    openNu(id, knop);
  }

  function openNu(id, knop) {
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
    // dezelfde beweging, maar dan terug: het scherm krimpt naar zijn tegel
    var paneel = document.getElementById('paneel-' + open.huidig);
    var tegel = laatsteKnop;
    metOvergang(
      paneel && (paneel.querySelector('[data-rol="groot"]') || paneel.querySelector('img')),
      function () { return tegel && tegel.querySelector('img'); },
      sluitNu
    );
  }

  function sluitNu() {
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
    // De tegel is een echte link naar de eigen pagina van het project, zodat
    // een zoekmachine er komt en de link te delen valt. Met javascript aan
    // openen we liever het venster — behalve bij ctrl/cmd/middelste klik,
    // want dan wil iemand hem juist in een nieuw tabblad.
    knop.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      open(k.getAttribute('data-id'), knop);
    });
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
      // liever het echte adres van de projectpagina dan een #-link: die
      // laat wel een voorbeeld zien in WhatsApp en LinkedIn
      var id = knop.getAttribute('data-deel');
      var tegel = document.querySelector('.kaart[data-id="' + id + '"] .kaart-knop');
      var adres = tegel && tegel.href ? tegel.href : location.origin + location.pathname + '#' + id;
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

  /* ---------- keuzehulp ----------
     Drie vragen, en dan laten zien wat er bij iemand past. Het staat in een
     echte <dialog>, zodat de browser Escape afvangt, de rest van de pagina
     op inert zet en de toetsvolgorde binnen het venster houdt. Dat zijn
     precies de dingen die je met een losse div zelf fout doet. */
  var hulp = document.getElementById('hulp');
  var hulpBron = document.getElementById('hulp-data');
  var hulpKan = hulp && hulpBron && typeof hulp.showModal === 'function';

  // kan de browser er niets mee, dan halen we de knop weg: een knop die niets
  // doet is erger dan een knop die er niet is
  if (!hulpKan) {
    [].forEach.call(document.querySelectorAll('[data-hulp-open]'), function (k) { k.hidden = true; });
  }

  if (hulpKan) {
    var H = JSON.parse(hulpBron.textContent);
    var lijf = document.getElementById('hulp-lijf');
    var balkjes = document.getElementById('hulp-stappen');
    var antwoorden = [];

    var schrijf = function (t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; };

    function stappenBij(n) {
      [].forEach.call(balkjes.children, function (i, x) {
        i.className = x <= n ? 'aan' : '';
      });
    }

    function toonVraag(n) {
      var v = H.vragen[n];
      stappenBij(n);
      lijf.innerHTML =
        '<p class="hulp-vraag">' + schrijf(v.vraag) + '</p>' +
        '<div class="hulp-opties">' +
          v.opties.map(function (o, i) {
            return '<button type="button" class="hulp-optie" data-keuze="' + i + '">' +
              '<b>' + schrijf(o.label) + '</b><span class="pijl">&rarr;</span>' +
              '<small>' + schrijf(o.bij) + '</small></button>';
          }).join('') +
        '</div>' +
        (n > 0 ? '<p style="margin:16px 0 0"><button type="button" class="hulp-terug" data-terug>Vorige vraag</button></p>' : '');

      [].forEach.call(lijf.querySelectorAll('[data-keuze]'), function (k) {
        k.addEventListener('click', function () {
          antwoorden[n] = v.opties[Number(k.getAttribute('data-keuze'))];
          antwoorden.length = n + 1;
          if (n + 1 < H.vragen.length) toonVraag(n + 1); else toonUitkomst();
        });
      });
      var terug = lijf.querySelector('[data-terug]');
      if (terug) terug.addEventListener('click', function () { toonVraag(n - 1); });
      var eerste = lijf.querySelector('.hulp-optie');
      if (eerste) eerste.focus();
    }

    function toonUitkomst() {
      stappenBij(H.vragen.length);
      var gewild = {};
      antwoorden.forEach(function (a) { (a.tags || []).forEach(function (t) { gewild[t] = (gewild[t] || 0) + 1; }); });
      var sleutels = Object.keys(gewild);

      var treffers = H.projecten.map(function (p) {
        var score = (p.tags || []).reduce(function (n, t) { return n + (gewild[t] || 0); }, 0);
        return { p: p, score: score };
      }).filter(function (x) { return sleutels.length === 0 || x.score > 0; })
        .sort(function (a, b) { return b.score - a.score; })
        .slice(0, 3);

      var regels = antwoorden.map(function (a, i) { return H.vragen[i].vraag + ' ' + a.label; });

      lijf.innerHTML =
        '<div class="hulp-uit">' +
          '<div><p class="hulp-vraag" style="margin-bottom:8px">' + schrijf(H.slot.kop) + '</p>' +
            '<div class="hulp-antwoorden">' + antwoorden.map(function (a) {
              return '<span>' + schrijf(a.label) + '</span>';
            }).join('') + '</div></div>' +
          '<div class="hulp-treffers">' +
            treffers.map(function (t) {
              return '<button type="button" class="hulp-treffer" data-project="' + schrijf(t.p.id) + '">' +
                (t.p.tegel ? '<img src="img/' + schrijf(t.p.tegel) + '" width="64" height="40" alt="" loading="lazy">' : '<span></span>') +
                '<span><b>' + schrijf(t.p.naam) + '</b><small>' + schrijf(t.p.eenRegel) + '</small></span></button>';
            }).join('') +
          '</div>' +
          '<p style="color:var(--tekst-2);font-size:.92rem;margin:0">' + schrijf(H.slot.bij) + '</p>' +
          '<div class="hulp-knoppen">' +
            '<a class="knop knop-vol" id="hulp-mail" href="#">' + schrijf(H.slot.knop) + '</a>' +
            '<button type="button" class="knop knop-klein" data-opnieuw>Opnieuw beginnen</button>' +
          '</div>' +
        '</div>';

      var adres = 'mailto:' + H.email +
        '?subject=' + encodeURIComponent('Via de keuzehulp op je site') +
        '&body=' + encodeURIComponent('Hoi Samih,\n\n' + regels.join('\n') + '\n\nKunnen we hier eens over praten?\n\n');
      lijf.querySelector('#hulp-mail').setAttribute('href', adres);

      [].forEach.call(lijf.querySelectorAll('[data-project]'), function (k) {
        k.addEventListener('click', function () {
          var id = k.getAttribute('data-project');
          hulp.close();
          var kaart = kaarten.filter(function (c) { return c.getAttribute('data-id') === id; })[0];
          if (kaart) {
            kaart.scrollIntoView({ block: 'center', behavior: mindBeweging() ? 'auto' : 'smooth' });
            open(id, kaart.querySelector('.kaart-knop'));
          }
        });
      });
      lijf.querySelector('[data-opnieuw]').addEventListener('click', function () {
        antwoorden = [];
        toonVraag(0);
      });
    }

    [].forEach.call(document.querySelectorAll('[data-hulp-open]'), function (k) {
      k.addEventListener('click', function () {
        antwoorden = [];
        toonVraag(0);
        hulp.showModal();
      });
    });
    [].forEach.call(document.querySelectorAll('[data-hulp-sluit]'), function (k) {
      k.addEventListener('click', function () { hulp.close(); });
    });
    // klikken naast het venster sluit het ook
    hulp.addEventListener('click', function (e) {
      if (e.target === hulp) hulp.close();
    });
  }

  ververs();
  volgHash();
})();
