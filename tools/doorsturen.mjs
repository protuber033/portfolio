// Klantsites die onder een map van eemland-digital.nl draaien, maar als eigen
// Railway-service leven. Een verzoek naar /herbstreatment/... gaat ongewijzigd
// door naar die service; de bezoeker blijft op eemland-digital.nl.
//
// De klantsite moet zelf onder hetzelfde pad gebouwd zijn (Vite: base
// '/herbstreatment/'), anders kloppen de verwijzingen naar scripts en beelden niet.
// Een nieuwe klant toevoegen = één regel hieronder.
import { request } from 'node:https';

const DOORSTUREN = {
  '/herbstreatment': 'herbstreatment-production.up.railway.app',
};

// Alleen wat een bezoeker nodig heeft; cookies en dergelijke gaan niet mee.
const MEE_HEEN = ['accept', 'accept-encoding', 'accept-language', 'if-none-match', 'if-modified-since', 'range', 'user-agent'];
const MEE_TERUG = ['content-type', 'content-encoding', 'content-length', 'cache-control', 'etag', 'last-modified', 'vary', 'location', 'content-range', 'accept-ranges'];

/** Geeft true terug als het verzoek hier is afgehandeld. */
export function doorsturen(req, res, url) {
  const map = Object.keys(DOORSTUREN).find((m) => url.pathname === m || url.pathname.startsWith(m + '/'));
  if (!map) return false;

  // Zonder slash erachter kloppen relatieve verwijzingen niet.
  if (url.pathname === map) {
    res.writeHead(301, { location: map + '/' + url.search }).end();
    return true;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end();
    return true;
  }

  const kop = { host: DOORSTUREN[map] };
  for (const k of MEE_HEEN) if (req.headers[k]) kop[k] = req.headers[k];

  const naar = request({ host: DOORSTUREN[map], path: url.pathname + url.search, method: req.method, headers: kop, timeout: 15000 }, (antwoord) => {
    const terug = {};
    for (const k of MEE_TERUG) if (antwoord.headers[k]) terug[k] = antwoord.headers[k];
    // Een doorverwijzing van de klantsite naar zijn eigen Railway-adres houden we op ons domein.
    if (terug.location) terug.location = String(terug.location).replace('https://' + DOORSTUREN[map], '');
    res.writeHead(antwoord.statusCode || 502, terug);
    antwoord.pipe(res);
  });
  naar.on('timeout', () => naar.destroy(new Error('time-out')));
  naar.on('error', (err) => {
    console.error('doorsturen ' + map + ' mislukt: ' + err.message);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Deze pagina is even niet bereikbaar.');
  });
  naar.end();
  return true;
}
