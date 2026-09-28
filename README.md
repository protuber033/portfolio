# Portfolio van Samih Tichtti

De site draait op https://site-production-a63e.up.railway.app en wordt gebouwd uit
twee databestanden. Je past nooit HTML aan — alleen de data.

## Een nieuw project toevoegen

```
npm run update
```

Dat doet drie dingen achter elkaar:

1. **scan** — loopt je mappen af (zie `data/scan.json`), vindt projecten met een
   git-geschiedenis, werkt begin- en einddatums bij en zet nieuwe projecten er als
   concept bij. Controleert meteen of de live-adressen nog reageren.
2. **shots** — maakt screenshots van elk project met een `url`, haalt cookiebanners
   eruit, en zet ze als webp in `img/`.
3. **build** — schrijft `index.html` en `artifact.html` opnieuw.

### De wachtkamer

Wat de scanner nieuw vindt komt **niet meteen op de site**. Het krijgt
`"concept": true` en blijft daarmee onzichtbaar voor bezoekers. Zo vult je
portfolio zich niet vanzelf met oefenmapjes.

Een gevonden project publiceren:

1. vul in `data/projects.json` de `eenRegel`, `voorWie`, `voorbeeld` en `doet` in
2. zet er een `url` bij als het ergens draait
3. haal `"concept": true` weg of zet hem op `false`
4. `npm run shots && npm run build`

Een project dat je nooit wilt zien: zet het pad in `negeerPaden` in
`data/scan.json`. Daar staan nu je HvA-oefenmappen en de dubbele Lumière-map in.

Live zetten:

```
git add -A
git commit -m "Nieuw project erbij"
git push
```

Railway bouwt daarna vanzelf opnieuw.

## De bestanden

| Bestand | Waarvoor |
| --- | --- |
| `data/projects.json` | alle projecten: teksten, techniek, links, screenshots |
| `data/site.json` | jouw naam, e-mail, de drie lagen, wat je kan, de groepen |
| `data/scan.json` | welke mappen de scanner afloopt |
| `tools/build.mjs` | bouwt de pagina |
| `tools/scan.mjs` | vindt projecten en werkt datums bij |
| `tools/shots.mjs` | maakt de screenshots |
| `tools/stijl.css` | alle opmaak |
| `tools/gedrag.js` | filteren, zoeken en het projectvenster |
| `index.html` | gegenereerd — niet met de hand aanpassen |
| `artifact.html` | dezelfde pagina, zonder eigen html-omhulsel |

## Losse commando's

```
npm run scan            zoek projecten, werk datums bij
npm run shots           maak alleen ontbrekende screenshots
npm run shots -- alles  maak alle screenshots opnieuw
npm run build           bouw de pagina
npm run dev             bouwen en lokaal draaien op poort 3000
```

## Goed om te weten

- Screenshots hebben Chrome of Edge nodig en `sharp`. Ontbreekt sharp, draai dan
  eerst `npm install -D sharp`.
- Klantgegevens in screenshots worden niet automatisch onleesbaar gemaakt. Kijk een
  nieuwe opname na op namen, adressen en inloggegevens voordat je hem publiceert.
- De server serveert bewust alleen `index.html`, `robots.txt` en `img/`. De map
  `data/` staat dus niet op internet.
