// De beheerpagina: /beheer
//
// Eén pagina met twee gezichten. Niet ingelogd zie je alleen een
// wachtwoordveld; daarna wordt hetzelfde scherm een postvak. Dat kan omdat er
// niets geheims in de HTML staat — de berichten komen pas na het inloggen over
// de lijn, en de server geeft ze alleen af aan een geldig token.
//
// Geen canonical, geen og-tags, geen regel in de sitemap: dit is geen pagina
// die gevonden hoeft te worden. Hij staat ook niet in robots.txt, want dan zou
// je het adres juist publiceren. Er linkt niets naar, en noindex vangt de rest.
export function beheerPagina({ site, esc, fonts, beheerCss, beheerJs }) {
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Beheer — ${esc(site.bedrijf)}</title>
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="theme-color" content="#0A0D16">
<link rel="icon" href="/img/icoon.svg" type="image/svg+xml">
${fonts}
<style>${beheerCss}</style>
</head>
<body>
<div class="beheer-schil">

  <div class="beheer-balk">
    <span class="merk-stip" aria-hidden="true"></span>
    <b>Beheer</b>
    <span class="adres">${esc(site.email)}</span>
    <span class="rechts">
      <span class="teller" id="teller" hidden></span>
      <button type="button" class="knop knop-klein terugknop" id="terug">&larr; Lijst</button>
      <button type="button" class="knop knop-klein" id="verversen" hidden>Verversen</button>
      <button type="button" class="knop knop-klein" id="uitloggen" hidden>Uitloggen</button>
    </span>
  </div>

  <div class="inlogvak" id="inlogvak">
    <form class="inlogdoos" id="inlogform">
      <h1>Postvak</h1>
      <p>Hier lees je de mail die via de site binnenkomt, en antwoord je erop.</p>
      <label for="wachtwoord">Wachtwoord</label>
      <input type="password" id="wachtwoord" name="wachtwoord" autocomplete="current-password"
             required autofocus spellcheck="false">
      <div id="inlogmelding" aria-live="polite"></div>
      <button type="submit" class="knop knop-vol">Inloggen</button>
    </form>
  </div>

  <div class="postvak" id="postvak" hidden>
    <div class="lijstkant">
      <div id="lijst" aria-live="polite"></div>
    </div>
    <div class="leeskant">
      <p class="leeg" id="leesleeg">Kies links een bericht.</p>
      <div id="bericht" hidden></div>
    </div>
  </div>

</div>
<script>${beheerJs}</script>
</body>
</html>
`;
}
