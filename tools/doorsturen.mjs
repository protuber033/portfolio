// Klantsites die onder een map van eemland-digital.nl draaien, maar als eigen
// Railway-service leven. Een verzoek naar /herbstreatment/... gaat ongewijzigd
// door naar die service; de bezoeker blijft op eemland-digital.nl.
//
// De klantsite moet zelf onder hetzelfde pad gebouwd zijn (Vite: base
// '/herbstreatment/'), anders kloppen de verwijzingen naar scripts en beelden niet.
// Een nieuwe klant toevoegen = één regel hieronder.
import { request } from 'node:https';

const DOORSTUREN = {
  // map: [host, cookie-voorvoegsel dat de klantsite zelf gebruikt]
  '/herbstreatment': ['herbstreatment-production.up.railway.app', 'hb_'],
};

// Alleen wat een bezoeker nodig heeft.
const MEE_HEEN = ['accept', 'accept-encoding', 'accept-language', 'if-none-match', 'if-modified-since', 'range', 'user-agent', 'content-type', 'content-length'];
const MEE_TERUG = ['content-type', 'content-encoding', 'content-length', 'cache-control', 'etag', 'last-modified', 'vary', 'location', 'content-range', 'accept-ranges', 'content-disposition', 'set-cookie'];
const SCHRIJVEN = ['POST', 'PUT', 'PATCH', 'DELETE'];

/** Geeft true terug als het verzoek hier is afgehandeld. */
export function doorsturen(req, res, url) {
  const map = Object.keys(DOORSTUREN).find((m) => url.pathname === m || url.pathname.startsWith(m + '/'));
  if (!map) return false;
  const [host, cookiePrefix] = DOORSTUREN[map];

  // Zonder slash erachter kloppen relatieve verwijzingen niet.
  if (url.pathname === map) {
    res.writeHead(301, { location: map + '/' + url.search }).end();
    return true;
  }
  // Lezen mag overal, schrijven alleen naar de API van de klantsite.
  const isApi = url.pathname.startsWith(map + '/api/');
  if (!(req.method === 'GET' || req.method === 'HEAD' || (isApi && SCHRIJVEN.includes(req.method)))) {
    res.writeHead(405, { allow: isApi ? 'GET, HEAD, POST, PUT, PATCH, DELETE' : 'GET, HEAD' }).end();
    return true;
  }

  const kop = { host };
  for (const k of MEE_HEEN) if (req.headers[k]) kop[k] = req.headers[k];
  // Alleen de eigen cookies van de klantsite, nooit die van eemland-digital.nl zelf.
  const koekjes = String(req.headers.cookie || '').split(/;\s*/).filter((c) => c.startsWith(cookiePrefix));
  if (koekjes.length) kop.cookie = koekjes.join('; ');
  // Zodat de klantsite het echte bezoekersadres ziet (voor zijn eigen limieten). Het laatste
  // adres is wat Railway zelf toevoegt; eerdere kan een bezoeker zelf meesturen.
  const bezoeker = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',').pop().trim();
  if (bezoeker) kop['x-forwarded-for'] = bezoeker;

  const naar = request({ host, path: url.pathname + url.search, method: req.method, headers: kop, timeout: 15000 }, (antwoord) => {
    const terug = {};
    for (const k of MEE_TERUG) if (antwoord.headers[k]) terug[k] = antwoord.headers[k];
    // Een doorverwijzing van de klantsite naar zijn eigen Railway-adres houden we op ons domein.
    if (terug.location) terug.location = String(terug.location).replace('https://' + host, '');
    res.writeHead(antwoord.statusCode || 502, terug);
    antwoord.pipe(res);
  });
  naar.on('timeout', () => naar.destroy(new Error('time-out')));
  naar.on('error', (err) => {
    console.error('doorsturen ' + map + ' mislukt: ' + err.message);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Deze pagina is even niet bereikbaar.');
  });
  if (SCHRIJVEN.includes(req.method)) req.pipe(naar);
  else naar.end();
  return true;
}
