// Maakt de afdruk die je als BEHEER_HASH in Railway zet.
//
//   node tools/beheer-wachtwoord.mjs
//
// Je typt je wachtwoord hier in; het wordt niet opgeslagen en niet getoond.
// Wat eruit komt is een scrypt-afdruk: daar kun je het wachtwoord niet uit
// terugrekenen, dus die mag veilig in een instelling staan.
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { maakAfdruk } from './beheer-auth.mjs';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(readFileSync(join(WORTEL, 'data/site.json'), 'utf8'));

const lees = createInterface({ input: process.stdin, output: process.stdout });

const vraag = (tekst) => new Promise((klaar) => {
  // tijdens het typen niets terugschrijven naar het scherm
  const uit = process.stdout;
  const schrijf = uit.write.bind(uit);
  uit.write = (stuk, ...rest) => (String(stuk).includes(tekst) ? schrijf(stuk, ...rest) : true);
  lees.question(tekst, (antwoord) => { uit.write = schrijf; schrijf('\n'); klaar(antwoord); });
});

const wachtwoord = await vraag('Kies een wachtwoord voor /beheer: ');
lees.close();

if (wachtwoord.length < 12) {
  console.error('\nTe kort. Neem er minstens twaalf tekens voor — dit geeft toegang tot je mailbox.');
  process.exit(1);
}

console.log('Zet deze twee in Railway bij de service "site", onder Variables:\n');
console.log('BEHEER_HASH=' + maakAfdruk(wachtwoord));
console.log('AUTH_SECRET=' + (await import('node:crypto')).randomBytes(32).toString('hex'));
console.log('\nEn deze drie voor de mailbox:\n');
console.log('MAIL_ADRES=' + site.email);
console.log('MAIL_WACHTWOORD=  (het wachtwoord van die mailbox bij TransIP)');
console.log('MAIL_HOST=transip.email   (laat weg, dit is de standaard)');
console.log('\nHet wachtwoord zelf is nergens opgeslagen. Raak je het kwijt, draai dit dan opnieuw.');
