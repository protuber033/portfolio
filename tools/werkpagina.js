// Alleen wat een losse projectpagina nodig heeft: de duimpjes onder de
// grote schermafbeelding. Het grote script van de homepage kan hier niet
// draaien, want dat verwacht het venster, de filters en het zoekveld.
(function () {
  [].forEach.call(document.querySelectorAll('[data-galerij]'), function (galerij) {
    var duimen = [].slice.call(galerij.querySelectorAll('.duimknop'));
    var groot = galerij.querySelector('[data-rol="groot"]');
    var titel = galerij.querySelector('[data-rol="titel"]');
    var bij = galerij.querySelector('[data-rol="bijschrift"]');
    if (!groot) return;
    duimen.forEach(function (d) {
      d.addEventListener('click', function () {
        duimen.forEach(function (o) { o.setAttribute('aria-selected', 'false'); });
        d.setAttribute('aria-selected', 'true');
        groot.src = 'img/' + d.getAttribute('data-bestand');
        groot.alt = d.getAttribute('data-alt') || '';
        if (titel) titel.textContent = d.getAttribute('data-titel') || '';
        if (bij) bij.textContent = d.getAttribute('data-bijschrift') || '';
      });
    });
  });
}());
