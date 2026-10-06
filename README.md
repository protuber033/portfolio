# Eemland Digital

De site draait op **https://eemland-digital.nl** en wordt gebouwd uit twee
databestanden. Je past nooit HTML aan — alleen de data.

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
| `tools/beheer*.mjs` / `tools/beheer.*` | de beheerpagina en de mailbox erachter |
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
| `/api/beheer` vraagt eerst om inloggen | daarachter zit je mailbox |
| de beheerpagina staat op noindex | een postvak hoort niet in Google |
| een te groot verzoek legt de server niet om | een fout uit een async afhandelaar stopt in Node het hele proces |

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

## Het postvak op `/beheer`

Mail die op `info@eemland-digital.nl` binnenkomt kun je lezen en beantwoorden
zonder de site uit te gaan. De pagina staat op `/beheer`, is afgeschermd met een
wachtwoord en staat op `noindex` — hij komt dus niet in Google en staat ook niet
in `robots.txt`, want dat bestand is openbaar en zou het adres juist verklappen.

### Eenmalig instellen

```
npm run wachtwoord
```

Je typt een wachtwoord (minstens twaalf tekens, dit geeft toegang tot je
mailbox). Het wordt nergens opgeslagen. Wat je terugkrijgt zijn de regels die je
in Railway bij de service **site** onder *Variables* zet:

| Instelling | Wat het is |
| --- | --- |
| `BEHEER_HASH` | de afdruk van je wachtwoord — hier kun je het wachtwoord niet uit terugrekenen |
| `AUTH_SECRET` | waarmee je inlogtokens worden ondertekend, minstens 32 tekens |
| `MAIL_ADRES` | het mailadres zelf |
| `MAIL_WACHTWOORD` | het wachtwoord van die mailbox bij TransIP |
| `MAIL_HOST` | alleen nodig als je mail niet bij TransIP staat (standaard `transip.email`) |

Staan ze er niet, dan geeft `/api/beheer` netjes een 503 met uitleg in plaats van
stilletjes stuk te gaan. De pagina zelf blijft gewoon bereikbaar.

### Hoe het dicht blijft

- Eén wachtwoord, bewaard als scrypt-afdruk, vergeleken in constante tijd.
- Vijf pogingen per kwartier per ip; daarna een kwartier op slot.
- Het inlogtoken is ondertekend met HMAC en vervalt na vier uur. Hij staat in
  `sessionStorage`, dus je tab sluiten is uitloggen.
- De **html-versie** van een bericht wordt bewust niet doorgegeven, alleen de
  platte tekst. Anders bepaalt de afzender wat er in jouw beheerscherm gebeurt.
- Niets uit een bericht komt in een logregel terecht.

`npm run check` controleert elke keer opnieuw dat de lijst, een los bericht en
het versturen zonder inloggen dichtzitten, en dat de beheerpagina op `noindex`
staat en niet in de sitemap is beland.

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

## Vindbaar zijn op Google

De bouw regelt dit zelf, je hoeft er niets met de hand voor te doen:

- **Elk project krijgt een eigen adres**, `werk/<id>/`. Een zoekmachine rangschikt
  per adres, dus elf projecten in één venster zijn één resultaat en elf pagina's
  zijn elf kansen. De tegel op de homepage is een echte link daarnaartoe; met
  javascript aan opent hij nog steeds het venster.
- **`sitemap.xml` en `robots.txt`** worden meegeschreven. De sitemap noemt precies
  de pagina's die er zijn — een verwijderd project verdwijnt er automatisch uit, en
  zijn map onder `werk/` wordt opgeruimd.
- **Per pagina**: eigen titel, eigen omschrijving, canonical, absolute `og:image`
  (anders toont WhatsApp geen voorbeeld) en JSON-LD met wie je bent, wat je bedrijf
  is en welk project het betreft.
- **`www` wordt doorgestuurd** naar het adres zonder www, zodat er één versie meetelt.

`npm run check` weigert een push als een van die dingen niet klopt.

### Eenmalig: Google Search Console

Google vindt een nieuw domein niet uit zichzelf — er linkt nog niets naar. Meld het
daarom zelf aan op https://search.google.com/search-console:

1. Kies **Domein** en vul `eemland-digital.nl` in.
2. Google geeft een TXT-record. Zet dat bij TransIP op `@`, zonder aanhalingstekens.
3. Controleer of het publiek zichtbaar is voordat je op verifiëren klikt.
4. Dien daarna onder **Sitemaps** het adres `sitemap.xml` in.

Wil je liever niet via DNS: zet de code uit de meta-tag-methode in
`data/site.json` bij `googleVerificatie` en bouw opnieuw. De tag komt dan in de
kop van elke pagina.

## De contactpagina met sitescan

`/contact/` is geen formulier maar een gereedschap: een bezoeker plakt het adres
van zijn eigen website en krijgt hem doorgemeten. Pas daarna komt de vraag om
contact, en dan is het een logische volgende stap in plaats van een drempel.
De mailknop onderaan vult de gevonden punten alvast in.

| Bestand | Rol |
| --- | --- |
| `tools/sitescan.mjs` | de meting zelf, plus de bewaking op adressen |
| `tools/contactpagina.mjs` | de pagina |
| `tools/contact.css` / `tools/contact.js` | opmaak en gedrag |
| `server.js` | het adres `/api/scan` |

De server stuurt de uitkomsten **één voor één** terug (ndjson), zodat elke
controle op het scherm verschijnt op het moment dat hij echt klaar is. Er wordt
niets nagespeeld.

### Waar dit soort scanners fout gaat

Een server die op verzoek van een vreemde een adres ophaalt, kan misbruikt
worden om binnen het eigen netwerk rond te kijken — vul `169.254.169.254` in en
een slecht beveiligde server geeft vrolijk de sleutels van de hostingpartij
terug. Daarom wordt elke naam eerst omgezet naar een ip, wordt dat ip getoetst
op privébereiken, en gebeurt dat **opnieuw na elke doorverwijzing**. Verder:
alleen http en https, hoogstens drie doorverwijzingen, maximaal 3 MB lezen, en
twaalf scans per bezoeker per tien minuten.

`npm run check` toetst die weigeringen elke keer opnieuw — dat is het soort
ding dat je per ongeluk sloopt bij een refactor en pas maanden later merkt.
