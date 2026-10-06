// De sitescan op de contactpagina. De server stuurt de uitkomsten één voor
// één terug terwijl hij ze afrondt; hier worden ze gelezen zodra ze binnen
// zijn. Er wordt dus niets nagespeeld — wat je ziet verschijnen is het moment
// waarop die controle echt klaar was.
(function () {
  var form = document.getElementById('scanform');
  if (!form) return;

  var veld = document.getElementById('scanurl');
  var knop = document.getElementById('scanknop');
  var doos = document.getElementById('scandoos');
  var uit = document.getElementById('scanuit');
  var rijen = document.getElementById('scanrijen');
  var foutvak = document.getElementById('scanfout');
  var hoofd = document.getElementById('scanhoofd');
  var ringvul = document.getElementById('ringvul');
  var ringgetal = document.getElementById('ringgetal');
  var samenKop = document.getElementById('samenkop');
  var samenTekst = document.getElementById('samentekst');
  var samenAdres = document.getElementById('samenadres');
  var vervolg = document.getElementById('scanvervolg');
  var vervolgTekst = document.getElementById('vervolgtekst');
  var vervolgMail = document.getElementById('vervolgmail');

  var OMTREK = 326.7;
  var tekens = {
    goed: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    beter: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3.2v6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="8" cy="12.6" r="1.25" fill="currentColor"/></svg>',
    probleem: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
  };
  var woorden = { goed: 'goed', beter: 'kan beter', probleem: 'probleem' };

  function maakRij(r) {
    var li = document.createElement('li');
    li.className = 'scan-rij';
    var stuk = '';
    stuk += '<span class="scan-teken ' + r.status + '">' + tekens[r.status] + '</span>';
    stuk += '<h3>' + veilig(r.naam) + '</h3>';
    stuk += '<span class="scan-waarde">' + veilig(r.waarde) +
      '<span class="scan-woord ' + r.status + '">' + woorden[r.status] + '</span></span>';
    if (r.uitleg) stuk += '<p class="scan-uitleg">' + veilig(r.uitleg) + '</p>';
    if (typeof r.meter === 'number') stuk += '<span class="meter"><i class="' + r.status + '"></i></span>';
    if (r.advies) stuk += '<p class="scan-advies">' + veilig(r.advies) + '</p>';
    li.innerHTML = stuk;
    rijen.appendChild(li);
    if (typeof r.meter === 'number') {
      var balk = li.querySelector('.meter i');
      requestAnimationFrame(function () { balk.style.width = Math.min(100, r.meter) + '%'; });
    }
    return li;
  }

  function veilig(t) {
    var d = document.createElement('div');
    d.textContent = t == null ? '' : String(t);
    return d.innerHTML;
  }

  function telOp(naar) {
    // Eerst de uitkomst neerzetten, pas daarna het optellen. In een tabblad
    // dat op de achtergrond staat tekent de browser niet en loopt
    // requestAnimationFrame niet; zonder deze regel blijft de score dan op
    // nul hangen en zie je nooit je cijfer.
    ringgetal.textContent = naar;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var begin = performance.now();
    var duur = 800;
    function stap(nu) {
      var deel = Math.min(1, (nu - begin) / duur);
      ringgetal.textContent = Math.round(naar * (1 - Math.pow(1 - deel, 3)));
      if (deel < 1) requestAnimationFrame(stap);
    }
    requestAnimationFrame(stap);
  }

  function oordeelVan(score) {
    return score >= 85 ? 'goed' : score >= 60 ? 'beter' : 'probleem';
  }

  function afronden(k, gevonden) {
    var soort = oordeelVan(k.score);
    ringvul.setAttribute('class', 'vul ' + soort);
    ringvul.style.strokeDashoffset = String(OMTREK - (OMTREK * k.score) / 100);
    telOp(k.score);

    var open = k.aantalProbleem + k.aantalBeter;
    samenKop.textContent = k.aantalProbleem
      ? 'Er zitten ' + k.aantalProbleem + ' echte knelpunten in'
      : open
        ? 'De basis staat, er is nog wat te winnen'
        : 'Dit is netjes voor elkaar';
    samenTekst.textContent = k.aantalGoed + ' van de ' + k.totaal + ' punten staan goed' +
      (open ? ', ' + open + ' ' + (open === 1 ? 'punt kan beter' : 'punten kunnen beter') + '.' : '.') +
      ' Dit is een snelle blik van buitenaf, geen volledig onderzoek.';
    samenAdres.textContent = k.adres;

    var werk = gevonden.filter(function (r) { return r.status !== 'goed'; });
    vervolgTekst.textContent = werk.length
      ? (werk.length === 1
          ? 'Er is hierboven één punt waar ik iets aan zou doen. Als je wilt loop ik dat met je door'
          : 'Ik zie hierboven ' + werk.length + ' punten waar ik iets aan zou doen. Als je wilt loop ik ze met je door') +
        ' en zeg ik eerlijk wat het kost — ook als het antwoord is dat het zo wel goed genoeg is.'
      : 'Je site staat er goed voor. Als je toch iets wilt laten bouwen dat er nu nog niet is — een dashboard, een koppeling, iets dat werk uit handen neemt — dan kijk ik graag mee.';

    var onderwerp = 'Sitescan van ' + k.adres + ' (score ' + k.score + ')';
    var tekst = 'Goedendag,\n\nIk heb mijn site laten scannen op eemland-digital.nl:\n' +
      k.adres + ' — score ' + k.score + '/100\n\n';
    if (werk.length) {
      tekst += 'Deze punten kwamen eruit:\n';
      werk.forEach(function (r) {
        tekst += '- ' + r.naam + ': ' + r.waarde + ' (' + woorden[r.status] + ')\n';
      });
      tekst += '\n';
    }
    tekst += 'Kunnen we hier eens over bellen?\n\n';
    vervolgMail.href = 'mailto:' + vervolgMail.getAttribute('data-adres') +
      '?subject=' + encodeURIComponent(onderwerp) + '&body=' + encodeURIComponent(tekst);
    vervolg.hidden = false;
  }

  function toonFout(bericht) {
    foutvak.textContent = bericht;
    foutvak.hidden = false;
    uit.hidden = false;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var adres = veld.value.trim();
    if (!adres) { veld.focus(); return; }

    rijen.innerHTML = '';
    foutvak.hidden = true;
    hoofd.hidden = true;
    vervolg.hidden = true;
    uit.hidden = false;
    doos.classList.add('bezig');
    knop.disabled = true;
    knop.textContent = 'Bezig met kijken…';
    ringvul.style.strokeDashoffset = String(OMTREK);
    ringgetal.textContent = '0';

    var gevonden = [];

    fetch('/api/scan?url=' + encodeURIComponent(adres), { headers: { accept: 'application/x-ndjson' } })
      .then(function (a) {
        if (!a.body) throw new Error('geen stroom');
        var lezer = a.body.getReader();
        var decoder = new TextDecoder();
        var rest = '';

        function verwerk(regel) {
          if (!regel.trim()) return;
          var g;
          try { g = JSON.parse(regel); } catch (err) { return; }
          if (g.soort === 'fout') { toonFout(g.bericht); return; }
          if (g.soort === 'start') { hoofd.hidden = false; samenAdres.textContent = g.adres; return; }
          if (g.soort === 'uitkomst') { gevonden.push(g); maakRij(g); return; }
          if (g.soort === 'klaar') { afronden(g, gevonden); }
        }

        function lees() {
          return lezer.read().then(function (res) {
            if (res.done) { verwerk(rest); return; }
            rest += decoder.decode(res.value, { stream: true });
            var delen = rest.split('\n');
            rest = delen.pop();
            delen.forEach(verwerk);
            return lees();
          });
        }
        return lees();
      })
      .catch(function () {
        toonFout('Ik kreeg geen verbinding met de scanner. Probeer het zo nog eens, of mail me gewoon.');
      })
      .then(function () {
        doos.classList.remove('bezig');
        knop.disabled = false;
        knop.textContent = 'Kijk ernaar';
      });
  });

  /* adres kopieren, net als op de homepage */
  var kop = document.getElementById('kopieer');
  var adresvak = document.getElementById('adres');
  if (kop && adresvak) {
    kop.addEventListener('click', function () {
      var tekst = adresvak.textContent;
      var terug = function (w) {
        kop.textContent = w;
        setTimeout(function () { kop.textContent = 'Kopieer adres'; }, 2000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(tekst).then(function () { terug('Gekopieerd'); }, function () { terug(tekst); });
      } else {
        terug(tekst);
      }
    });
  }
}());
