// De inlog voor /beheer.
//
// Achter deze deur zit je mailbox, dus hij is strakker afgesteld dan een
// gewone inlog: één account, een kort geldig token, en een rem op raden.
//
// Het wachtwoord staat nergens in de code of in de repo. Je zet er een
// scrypt-afdruk van in de omgeving (BEHEER_HASH) en die kan niet terug
// gerekend worden naar het wachtwoord zelf. Maak hem met:
//
//   node tools/beheer-wachtwoord.mjs
import crypto from 'node:crypto';

const GEHEIM = process.env.AUTH_SECRET || '';
const AFDRUK = process.env.BEHEER_HASH || '';
const GELDIG = 4 * 60 * 60;          // vier uur; het is een mailbox, geen webshop

export const beheerKan = Boolean(GEHEIM && GEHEIM.length >= 32 && AFDRUK);

const SCRYPT = { N: 16384, r: 8, p: 1, len: 64 };

export function maakAfdruk(wachtwoord) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(wachtwoord, salt, SCRYPT.len, SCRYPT).toString('hex')}`;
}

export function klopt(wachtwoord) {
  if (!AFDRUK.startsWith('scrypt$')) return false;
  const [, salt, hash] = AFDRUK.split('$');
  if (!salt || !hash) return false;
  const berekend = crypto.scryptSync(wachtwoord, salt, SCRYPT.len, SCRYPT);
  const bewaard = Buffer.from(hash, 'hex');
  return bewaard.length === berekend.length && crypto.timingSafeEqual(bewaard, berekend);
}

/* ---------- token ---------- */

const b64 = (b) => Buffer.from(b).toString('base64url');

export function maakToken() {
  const inhoud = b64(JSON.stringify({ tot: Math.floor(Date.now() / 1000) + GELDIG }));
  return `${inhoud}.${b64(crypto.createHmac('sha256', GEHEIM).update(inhoud).digest())}`;
}

export function tokenGeldig(token) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [inhoud, handtekening] = token.split('.');
  if (!inhoud || !handtekening) return false;
  const verwacht = crypto.createHmac('sha256', GEHEIM).update(inhoud).digest();
  let gekregen;
  try { gekregen = Buffer.from(handtekening, 'base64url'); } catch { return false; }
  if (gekregen.length !== verwacht.length) return false;
  if (!crypto.timingSafeEqual(gekregen, verwacht)) return false;
  try {
    const g = JSON.parse(Buffer.from(inhoud, 'base64url').toString('utf8'));
    return typeof g.tot === 'number' && g.tot > Math.floor(Date.now() / 1000);
  } catch { return false; }
}

/* ---------- rem op raden ----------
   Vijf pogingen per kwartier per ip. Zonder rem is één wachtwoord op een
   publieke site een kwestie van lang genoeg proberen. */
const pogingen = new Map();
const VENSTER = 15 * 60 * 1000;
const MAX = 5;

export function magProberen(ip) {
  const nu = Date.now();
  const eerder = (pogingen.get(ip) || []).filter((t) => nu - t < VENSTER);
  pogingen.set(ip, eerder);
  if (pogingen.size > 2000) pogingen.clear();
  return eerder.length < MAX;
}

export function misLukt(ip) {
  const lijst = pogingen.get(ip) || [];
  lijst.push(Date.now());
  pogingen.set(ip, lijst);
  return Math.max(0, MAX - lijst.length);
}

export function gelukt(ip) { pogingen.delete(ip); }

export function uitVerzoek(req) {
  const kop = req.headers.authorization || '';
  if (kop.startsWith('Bearer ')) return kop.slice(7).trim();
  return null;
}
