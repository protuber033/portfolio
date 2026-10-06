// De contactpagina. Geen formulier dat iets van de bezoeker vraagt, maar een
// scan die hem eerst iets geeft: zijn eigen site doorgemeten. Pas daarna komt
// de vraag om contact, en dan is het een logische volgende stap in plaats van
// een drempel.
//
// De pagina wordt hier los gehouden van build.mjs omdat hij zijn eigen stijl
// en gedrag heeft; alles wat hij van de site nodig heeft komt binnen als één
// pakketje.
export function contactPagina(ctx) {
  const { site, esc, vet, hoofd, middelen, ldJson, abs, contactCss, contactJs, aantal } = ctx;
  const c = site.contact;

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ContactPage',
        '@id': abs('contact/#pagina'),
        url: abs('contact/'),
        name: 'Contact',
        inLanguage: 'nl-NL',
        description: c.lead,
        mainEntity: { '@id': abs('#bedrijf') },
        about: { '@id': abs('#bedrijf') }
      },
      ctx.bedrijf,
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Het werk', item: abs('') },
          { '@type': 'ListItem', position: 2, name: 'Contact', item: abs('contact/') }
        ]
      }
    ]
  };

  return `<!doctype html>
<html lang="nl">
<head>
${hoofd({
    titel: `Contact — ${site.bedrijf}, Amersfoort`,
    omschrijving: 'Plak je website en ik meet hem live door: snelheid, gewicht, mobiel en wat Google ervan ziet. Daarna weet je meteen of het zin heeft om te bellen.',
    pad: 'contact/'
  })}
${middelen}
<style>${contactCss}</style>
${ldJson(ld)}
</head>
<body>
<a class="overslaan" href="#scanform">Direct naar het veld</a>

<header class="balk-boven">
  <div class="binnen">
    <a class="merk" href="/"><span class="merk-stip"></span>${esc(site.naam)}</a>
    <nav class="menu">
      <a href="/#werk">Werk</a>
      <a href="/#lagen">Aanpak</a>
      <a href="/#traject">Samenwerken</a>
      <a href="/contact/" aria-current="page">Contact</a>
    </nav>
    <a class="knop knop-klein" href="mailto:${esc(site.email)}">Mail me</a>
  </div>
</header>

<main>

  <section class="scan-kop">
    <div class="binnen">
      <h1>${esc(c.kop)}</h1>
      <p class="scan-lead">${esc(c.lead)}</p>

      <div class="scan-doos" id="scandoos">
        <p class="scan-balk"><i></i><i></i><i></i><span>sitescan</span></p>
        <form class="scan-veld" id="scanform" novalidate>
          <label for="scanurl">Het adres van je website</label>
          <input class="scan-invoer" id="scanurl" name="url" type="text" inputmode="url"
            autocomplete="url" spellcheck="false" placeholder="${esc(c.plaatshouder)}" maxlength="300">
          <button class="scan-knop" id="scanknop" type="submit">${esc(c.knop)}</button>
        </form>
        <p class="scan-onder">${vet(c.klein)}</p>
      </div>
    </div>
  </section>

  <section class="scan-uit" id="scanuit" hidden>
    <div class="binnen">
      <p class="scan-fout" id="scanfout" role="alert" hidden></p>

      <div class="scan-hoofd" id="scanhoofd" hidden>
        <div class="ring">
          <svg viewBox="0 0 124 124" aria-hidden="true">
            <circle class="spoor" cx="62" cy="62" r="52"></circle>
            <circle class="vul" id="ringvul" cx="62" cy="62" r="52"></circle>
          </svg>
          <b id="ringgetal">0</b>
        </div>
        <div class="scan-samen">
          <h2 id="samenkop">Bezig met kijken…</h2>
          <p id="samentekst">De controles verschijnen hieronder zodra ze klaar zijn.</p>
          <span class="adres" id="samenadres"></span>
        </div>
      </div>

      <ul class="scan-rijen" id="scanrijen" aria-live="polite" aria-busy="false"></ul>
    </div>
  </section>

  <section class="scan-vervolg" id="scanvervolg" hidden>
    <div class="binnen">
      <div class="vervolg-doos">
        <h2>${esc(c.vervolgKop)}</h2>
        <p id="vervolgtekst"></p>
        <div class="vervolg-knoppen">
          <a class="knop knop-vol" id="vervolgmail" data-adres="${esc(site.email)}" href="mailto:${esc(site.email)}">Stuur me deze uitkomst</a>
          <a class="knop knop-klein" href="/#werk">Bekijk eerst mijn werk (${aantal} projecten)</a>
        </div>
      </div>
    </div>
  </section>

  <section class="contact-altijd">
    <div class="binnen">
      <div class="altijd-doos">
        <div>
          <h2>${esc(c.altijdKop)}</h2>
          <p>${esc(c.altijdTekst)}</p>
        </div>
        <div class="altijd-adres">
          <span class="adres" id="adres">${esc(site.email)}</span>
          <button type="button" class="knop knop-vol" id="kopieer">Kopieer adres</button>
        </div>
      </div>
    </div>
  </section>

</main>

<footer class="voet">
  <div class="binnen">
    <p>De scan kijkt alleen naar de openbare voorkant van een site, net als een zoekmachine. ${esc(site.bedrijf)} · ${esc(site.email)}.</p>
    <p class="bijgewerkt"><a href="/#werk">Terug naar alle ${aantal} projecten</a></p>
  </div>
</footer>
<script>${contactJs}</script>
</body>
</html>
`;
}
