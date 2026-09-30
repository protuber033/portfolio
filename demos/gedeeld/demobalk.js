// Zet de demobalk onderaan elke demo en regelt de herstelknop.
// Aanroepen met de naam van de demo: demobalk('koffie', 'Kaap Noord').
(function () {
  window.demobalk = function (sleutel, bedrijf) {
    var balk = document.createElement('div');
    balk.className = 'demobalk';
    balk.innerHTML =
      '<span class="demobalk-stip"></span>' +
      '<span class="demobalk-tekst"><b>Werkende demo.</b> ' + bedrijf +
      ' is een bedacht bedrijf; de site is echt gebouwd en doet wat hij belooft. ' +
      'Alle namen, prijzen en gegevens zijn verzonnen. Gemaakt door ' +
      '<a href="https://eemland-digital.nl/" target="_blank" rel="noopener">Eemland Digital</a>.</span>' +
      '<button type="button" class="demobalk-knop">Herstel demo</button>';
    document.body.appendChild(balk);

    var knop = balk.querySelector('.demobalk-knop');
    knop.addEventListener('click', function () {
      knop.disabled = true;
      knop.textContent = 'Bezig…';
      fetch('/api/' + sleutel + '/herstel', { method: 'POST' })
        .then(function () { location.reload(); })
        .catch(function () {
          knop.disabled = false;
          knop.textContent = 'Herstel demo';
        });
    });
  };
}());
