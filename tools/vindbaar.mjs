// Alles wat met vindbaar zijn te maken heeft, bij elkaar.
//
// Een zoekmachine ziet alleen wat er letterlijk in de HTML staat, en hij
// rangschikt per adres. Eén pagina met vijftien verstopte vensters is voor
// hem dus één resultaat; vijftien echte adressen zijn vijftien kansen.
// Daarom krijgt elk project een eigen pagina met een eigen titel, een eigen
// omschrijving, een canonical (dit is het echte adres, reken de rest niet
// dubbel) en gegevens in JSON-LD, zodat Google weet dat er een persoon en
// een bedrijf achter zitten en niet alleen een hoop plaatjes.
//
// Het stond eerst midden in build.mjs. Hier bij elkaar is het te overzien
// en kun je het aanpassen zonder de rest van de bouw te raken.

export function vindbaar({ site, projecten, esc, zonderVersie }) {
  const DOMEIN = String(site.domein || '').replace(/\/+$/, '');
  const abs = (pad) => DOMEIN + '/' + String(pad || '').replace(/^\/+/, '');

  // Google knipt een omschrijving rond de 155 tekens af; dan liever zelf,
  // op een woordgrens, dan midden in een woord.
  function kort(tekst, max = 155) {
    const s = String(tekst ?? '').replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    const knip = s.lastIndexOf(' ', max - 1);
    return s.slice(0, knip > 40 ? knip : max - 1) + '…';
  }

  const ldJson = (data) =>
    `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

  function hoofd({ titel, omschrijving, pad, beeld }) {
    const adres = abs(pad);
    const plaatje = abs(beeld || 'img/kozijnfabriek-1.webp');
    const verificatie = site.googleVerificatie
      ? `\n<meta name="google-site-verification" content="${esc(site.googleVerificatie)}">`
      : '';
    return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titel)}</title>
<meta name="description" content="${esc(omschrijving)}">
<link rel="canonical" href="${esc(adres)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="author" content="${esc(site.naam)}">
<meta name="theme-color" content="#0A0D16">
<link rel="icon" href="/img/icoon.svg" type="image/svg+xml">${verificatie}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.bedrijf)}">
<meta property="og:locale" content="nl_NL">
<meta property="og:url" content="${esc(adres)}">
<meta property="og:title" content="${esc(titel)}">
<meta property="og:description" content="${esc(omschrijving)}">
<meta property="og:image" content="${esc(plaatje)}">
<meta property="og:image:alt" content="Scherm uit een van de projecten van ${esc(site.naam)}">
<meta name="twitter:card" content="summary_large_image">`;
  }

  const alleTechniek = [...new Set(projecten.flatMap((p) => (p.techniek || []).map(zonderVersie)))].sort();

  const persoon = {
    '@type': 'Person',
    '@id': abs('#samih'),
    name: site.naam,
    givenName: 'Samih',
    familyName: 'Tichtti',
    jobTitle: 'Webdeveloper — front-end en back-end',
    description: site.onderkop,
    url: abs(''),
    email: `mailto:${site.email}`,
    sameAs: [site.github],
    knowsLanguage: ['nl', 'en'],
    knowsAbout: alleTechniek,
    alumniOf: { '@type': 'CollegeOrUniversity', name: 'Hogeschool van Amsterdam' },
    worksFor: { '@id': abs('#bedrijf') },
    address: { '@type': 'PostalAddress', addressLocality: site.plaats, addressCountry: 'NL' }
  };

  const bedrijf = {
    '@type': 'ProfessionalService',
    '@id': abs('#bedrijf'),
    name: site.bedrijf,
    alternateName: site.naam,
    description: site.onderkop,
    url: abs(''),
    email: `mailto:${site.email}`,
    image: abs('img/kozijnfabriek-1.webp'),
    founder: { '@id': abs('#samih') },
    employee: { '@id': abs('#samih') },
    priceRange: 'Op aanvraag',
    address: { '@type': 'PostalAddress', addressLocality: site.plaats, addressCountry: 'NL' },
    areaServed: (site.regio || []).map((r) => ({ '@type': 'Place', name: r })),
    knowsAbout: alleTechniek,
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Waar ik je mee kan helpen',
      itemListElement: (site.kunnen || []).map((k) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: k.label, alternateName: k.kop, description: k.tekst }
      }))
    }
  };

  // Per project: een CreativeWork, zodat Google het project als eigen werk
  // leest en niet als losse tekst op een pagina.
  function projectLd(p) {
    const werk = {
      '@type': 'CreativeWork',
      '@id': abs(`werk/${p.id}/#project`),
      name: p.naam,
      headline: p.naam,
      description: p.voorWie,
      abstract: p.eenRegel,
      url: abs(`werk/${p.id}/`),
      inLanguage: 'nl-NL',
      author: { '@id': abs('#samih') },
      creator: { '@id': abs('#samih') },
      dateCreated: p.eersteDag,
      dateModified: p.laatsteDag,
      keywords: (p.tags || []).concat((p.techniek || []).map(zonderVersie)).join(', '),
      genre: p.statusLabel
    };
    if (p.beelden && p.beelden.length) werk.image = p.beelden.map((b) => abs(`img/${b.bestand}`));
    if (p.url) werk.sameAs = [p.url];
    return werk;
  }

  /* De wegwijzers. Google vindt een nieuw domein niet uit zichzelf: er linkt
     nog niets naar. Een sitemap is de lijst die je hem zelf aanreikt, en de
     regel in robots.txt vertelt waar die lijst staat. */
  function wegwijzers() {
    const vandaag = new Date().toISOString().slice(0, 10);
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${abs('')}</loc>
    <lastmod>${vandaag}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${abs('contact/')}</loc>
    <lastmod>${vandaag}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
${projecten.map((p) => `  <url>
    <loc>${abs(`werk/${p.id}/`)}</loc>
    <lastmod>${p.laatsteDag || vandaag}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n')}
</urlset>
`;
    const robots = `User-agent: *
Allow: /

Sitemap: ${abs('sitemap.xml')}
`;
    return { sitemap, robots };
  }

  return { abs, kort, ldJson, hoofd, persoon, bedrijf, projectLd, wegwijzers };
}
