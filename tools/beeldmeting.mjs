// Meet elk beeld en schrijft de uitkomst in projects.json.
//
// De band bovenaan zette drie schermen van hetzelfde project naast elkaar.
// Bij een lichte site wordt dat één wit blok, en bij een donkere één zwart
// gat. Met een helderheid per beeld kan de bouw ze om en om zetten.
//
// Beelden die écht leeg zijn (bijna alles wit, geen structuur) vliegen uit
// de band; in het projectvenster blijven ze staan, want daar hebben ze
// context.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const eis = createRequire('C:/Users/mstic/Desktop/funstudios/x.js');
const sharp = eis('sharp');

const pad = join(WORTEL, 'data/projects.json');
const projecten = JSON.parse(readFileSync(pad, 'utf8'));

export async function meet(bestandspad) {
  const { data } = await sharp(bestandspad).resize(16, 16, { fit: 'fill' })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let helder = 0, wit = 0, verzadiging = 0;
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    helder += (r + g + b) / 3;
    if (max > 235 && max - min < 14) wit++;
    verzadiging += max === 0 ? 0 : (max - min) / max;
  }
  const n = data.length / 3;
  return {
    licht: Math.round(helder / n / 2.55),          // 0 = zwart, 100 = wit
    witDeel: Math.round((wit / n) * 100),
    kleur: Math.round((verzadiging / n) * 100)
  };
}

let geteld = 0, geweerd = 0;
for (const p of projecten) {
  for (const b of p.beelden || []) {
    const m = await meet(join(WORTEL, 'img', 'm-' + b.bestand));
    b.licht = m.licht;
    geteld++;
    // écht leeg: bijna alles wit én nauwelijks kleur. Een lichte site haalt
    // dit niet, want daar staan tekst en vlakken op.
    const leeg = m.witDeel >= 85 && m.kleur <= 3;
    if (leeg) { b.showcase = false; geweerd++; } else if (b.showcase === false) delete b.showcase;
  }
}

writeFileSync(pad, JSON.stringify(projecten, null, 2) + '\n');
console.log(`${geteld} beelden gemeten, ${geweerd} uit de band gehaald omdat ze leeg zijn.`);
console.log('\nverdeling licht/donker:');
const alle = projecten.flatMap((p) => (p.beelden || []).filter((b) => b.showcase !== false));
const donker = alle.filter((b) => b.licht < 40).length;
const midden = alle.filter((b) => b.licht >= 40 && b.licht < 70).length;
const licht = alle.filter((b) => b.licht >= 70).length;
console.log(`  donker (<40): ${donker}   midden: ${midden}   licht (70+): ${licht}   totaal: ${alle.length}`);
