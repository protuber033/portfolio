// De routes achter /api/beheer.
//
// Alles hier is dicht, behalve inloggen. Er is één account; wie het
// wachtwoord heeft, kan bij de mailbox. Daarom: korte tokens, een rem op
// raden, en nooit iets uit een bericht in een logregel.
//
// Apart gehouden van server.js omdat het daar niet thuishoort: die serveert
// een statische site, en dit is het enige stuk dat met de buitenwereld praat
// namens jou.
import {
  beheerKan, klopt, maakToken, tokenGeldig, uitVerzoek,
  magProberen, misLukt, gelukt
} from './beheer-auth.mjs';

const json = (res, waarde, status = 200, extra = {}) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extra
  }).end(JSON.stringify(waarde));
};

async function lichaam(req, max = 256 * 1024) {
  const stukken = [];
  let n = 0;
  for await (const stuk of req) {
    n += stuk.length;
    if (n > max) throw new Error('te groot');
    stukken.push(stuk);
  }
  if (!n) return {};
  try { return JSON.parse(Buffer.concat(stukken).toString('utf8')); } catch { return {}; }
}

const ipVan = (req) =>
  String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
  req.socket.remoteAddress || 'onbekend';

/* De buitenste laag vangt alles af.
   Reden: de verzoekafhandelaar in server.js is async, en een fout die daar
   ontsnapt is in Node geen 500 maar een afgebroken proces. Eén te groot
   verzoek, of een module die niet laadt, zou dus de hele site omleggen.
   Hieronder mag dus van alles misgaan; de bezoeker krijgt een 500 en de
   server blijft staan. */
export async function beheerRoute(req, res, url) {
  try {
    await route(req, res, url);
  } catch (err) {
    console.error('beheer: ' + err.message);
    if (res.headersSent) { res.end(); return; }
    /* Bij een te groot verzoek stoppen we met lezen. De rest staat dan nog in
       de leiding, dus we zeggen er met "connection: close" bij dat deze
       verbinding klaar is. Zonder dat probeert de browser hem opnieuw te
       gebruiken en krijgt hij een afgebroken verbinding voor zijn volgende
       vraag — wat eruitziet alsof de site plat ligt terwijl hij gewoon draait. */
    if (err.message === 'te groot') {
      json(res, { fout: 'Dat verzoek is te groot.' }, 413, { connection: 'close' });
      req.destroy();
      return;
    }
    json(res, { fout: 'Er ging iets mis bij het beheer.' }, 500);
  }
}

async function route(req, res, url) {
  const pad = url.pathname.replace(/^\/api\/beheer\/?/, '');

  if (!beheerKan) {
    return json(res, {
      fout: 'Het beheer is nog niet ingesteld. Zet BEHEER_HASH en AUTH_SECRET bij de instellingen van de server (op Railway: Variables).'
    }, 503);
  }

  /* ---------- inloggen ---------- */
  if (pad === 'inloggen' && req.method === 'POST') {
    const ip = ipVan(req);
    if (!magProberen(ip)) {
      return json(res, { fout: 'Te veel pogingen. Probeer het over een kwartier opnieuw.' }, 429);
    }
    const { wachtwoord } = await lichaam(req);
    if (!wachtwoord || !klopt(String(wachtwoord))) {
      const over = misLukt(ip);
      return json(res, {
        fout: 'Onjuist wachtwoord.',
        resterend: over
      }, 401);
    }
    gelukt(ip);
    return json(res, { token: maakToken() });
  }

  /* ---------- alles hieronder vereist een geldig token ---------- */
  if (!tokenGeldig(uitVerzoek(req))) {
    return json(res, { fout: 'Log eerst in.' }, 401);
  }

  // de mailmodule pas laden als iemand ingelogd is: scheelt een verbinding
  // opzetten bij elke serverstart, en houdt de fout klein als mail niet is
  // ingesteld
  const { mailKan, lijst, bericht, markeer, antwoord } = await import('./mail.mjs');

  if (!mailKan) {
    return json(res, {
      fout: 'De mailbox is nog niet ingesteld. Zet MAIL_ADRES en MAIL_WACHTWOORD bij de instellingen van de server (op Railway: Variables).'
    }, 503);
  }

  try {
    if (pad === 'mail' && req.method === 'GET') {
      const aantal = Math.min(100, Math.max(5, Number(url.searchParams.get('aantal')) || 30));
      return json(res, await lijst({ aantal }));
    }

    const een = pad.match(/^mail\/(\d+)$/);
    if (een && req.method === 'GET') {
      const b = await bericht(een[1]);
      return b ? json(res, b) : json(res, { fout: 'Dat bericht bestaat niet meer.' }, 404);
    }

    const lezen = pad.match(/^mail\/(\d+)\/gelezen$/);
    if (lezen && req.method === 'POST') {
      const { gelezen = true } = await lichaam(req);
      return json(res, await markeer(lezen[1], Boolean(gelezen)));
    }

    const beantwoorden = pad.match(/^mail\/(\d+)\/antwoord$/);
    if (beantwoorden && req.method === 'POST') {
      const { tekst } = await lichaam(req);
      if (!String(tekst || '').trim()) {
        return json(res, { fout: 'Een leeg antwoord versturen heeft geen zin.' }, 400);
      }
      return json(res, await antwoord({ uid: beantwoorden[1], tekst: String(tekst) }));
    }

    return json(res, { fout: 'Onbekende actie.' }, 404);
  } catch (err) {
    // de melding van de mailserver mag de gebruiker zien, de inhoud van een
    // bericht nooit — vandaar alleen err.message en geen stacktrace
    return json(res, { fout: 'De mailbox gaf een fout: ' + err.message }, 502);
  }
}
