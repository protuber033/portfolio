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

Screenshots komen in drie maten in `img/`: groot voor het projectvenster,
`t-` voor de tegel en `m-` voor de showcase-band bovenaan. Een nieuw project
verschijnt daarmee vanzelf ook in die band.

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

## Controleren voor je pusht

```
npm run check            alles behalve het internet
npm run check -- net     ook of je live adressen nog antwoorden
```

Dit draait **automatisch bij elke `git push`**. Zijn er fouten, dan gaat de push
niet door. Moet je er toch langs: `git push --no-verify`.

Wat hij nakijkt, en waarom elk punt erin staat:

| Controle | Omdat |
| --- | --- |
| velden en datums in `projects.json` | een typfout levert een halve pagina op zonder klacht |
| elk beeld waarnaar verwezen wordt bestaat | er is een keer gepubliceerd met lege tegels |
| syntax van server.js en de tools | een kapotte regex liet Railway crashen |
| `index.html` is opnieuw gebouwd | anders push je de oude pagina bij nieuwe gegevens |
| de server start écht en geeft 200 | dit is de controle die die crash had voorkomen |
| `data/` geeft 404 | je gegevens horen niet op internet te staan |
| shellscripts hebben LF | met CRLF weigert bash ze op Linux |

Na een verse clone staat de hook er niet, want die gaat niet mee in git:

```
bash tools/installeer-hook.sh
```

## Losse commando's

```
npm run scan            zoek projecten, werk datums bij
npm run shots           maak alleen ontbrekende screenshots
npm run shots -- alles  maak alle screenshots opnieuw
npm run build           bouw de pagina
npm run dev             bouwen en lokaal draaien op poort 3000
```

## Projecten die alleen in de cloud staan

RALOX, Glacio en EemlandWerkt liggen niet op deze computer, alleen op GitHub.
De scanner kijkt bewust alleen op de schijf, dus van die drie werkt hij de datums
niet bij. Verander je daar iets aan, pas dan zelf `laatsteDag` en `periode` aan in
`data/projects.json`. Bij elk zo'n project staat een `github`-veld zodat je weet
waar de code ligt.

## Zelf hosten op een VPS

In `vps/` staat een complete opzet om deze site op je eigen Linux-server te
zetten in plaats van op Railway: server klaarmaken, als service draaien, nginx
ervoor, gratis ssl, en bijwerken met één commando. Zie `vps/README.md`.

## Goed om te weten

- Screenshots hebben Chrome of Edge nodig en `sharp`. Ontbreekt sharp, draai dan
  eerst `npm install -D sharp`.
- Klantgegevens in screenshots worden niet automatisch onleesbaar gemaakt. Kijk een
  nieuwe opname na op namen, adressen en inloggegevens voordat je hem publiceert.
- De server serveert bewust alleen `index.html`, `robots.txt` en `img/`. De map
  `data/` staat dus niet op internet.

## Automatisch, elke zondag

In de Windows-taakplanner staat een taak **Portfolio bijwerken**. Die draait elke
zondag om 10:00 `tools/wekelijks.cmd`, dat op zijn beurt `npm run update` doet en
alles wegschrijft naar `update-log.txt` in deze map.

De taak publiceert bewust **niets**. Hij werkt alleen de datums, de live-controle
en ontbrekende screenshots bij. Onderaan het logbestand staat de uitvoer van
`git status`: is die leeg, dan was er niets te doen. Staat er iets, dan wacht er
werk op je — een tekst schrijven of `git push`.

De taak aanpassen of uitzetten:

```powershell
Get-ScheduledTask -TaskName 'Portfolio bijwerken'          # bekijken
Disable-ScheduledTask -TaskName 'Portfolio bijwerken'      # tijdelijk uit
Unregister-ScheduledTask -TaskName 'Portfolio bijwerken'   # helemaal weg
```

Een ander tijdstip? Pas het aan in de Taakplanner (Windows-toets, "Taakplanner"),
of maak de taak opnieuw aan met een andere `-At`.
