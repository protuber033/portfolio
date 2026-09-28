# Je site op een eigen VPS

Alles zelf draaien: jouw server, jouw nginx, jouw certificaat, root-toegang.
Railway doet het nu voor je; hier doe je het zelf. Reken op een uur voor de
eerste keer, daarna is bijwerken één commando.

## Wat je nodig hebt

- Een VPS met **Ubuntu 24.04**, 1 GB geheugen is genoeg voor deze site.
  Vanaf ongeveer €4 per maand bij Hetzner, TransIP, Vultr of DigitalOcean.
- Een domeinnaam (zie het hoofdstuk over domeinen in de hoofd-README).
- Een ssh-sleutel. Heb je die niet:

  ```bash
  ssh-keygen -t ed25519 -C "samih"
  ```

  Plak de inhoud van `~/.ssh/id_ed25519.pub` in het bestelformulier van je
  VPS-provider, bij "SSH key". Dan kun je meteen zonder wachtwoord naar binnen.

## De volgorde

### 1. Server bestellen

Kies Ubuntu 24.04, de kleinste maat, en plak je ssh-sleutel erin. Je krijgt een
IP-adres. Test of je binnenkomt:

```bash
ssh root@JOUW-IP
```

### 2. DNS alvast goedzetten

Bij je registrar, twee regels. Doe dit **nu**, want DNS heeft tijd nodig en
zonder werkende DNS krijg je straks geen certificaat.

| Type | Naam | Waarde |
| --- | --- | --- |
| A | `@` | jouw server-IP |
| A | `www` | jouw server-IP |

Controleren of het al doorgedrongen is:

```bash
nslookup samihtichtti.nl
```

### 3. Server klaarmaken

Zet de scripts erop en draai de eerste:

```bash
scp vps/*.sh root@JOUW-IP:/root/
ssh root@JOUW-IP
bash 01-server-klaarmaken.sh samih
```

Dat maakt een gewone gebruiker aan, zet de firewall dicht op alles behalve ssh
en web, installeert nginx en Node, en zet automatische beveiligingsupdates aan.

**Belangrijk:** aan het eind zet het script root-login en wachtwoorden uit.
Test in een **nieuw venster** of je binnenkomt als `samih` vóór je het oude
venster sluit. Lukt dat niet, dan heb je in het oude venster nog de kans om het
terug te draaien.

### 4. De site aanzetten

```bash
sudo bash 02-site-aanzetten.sh samihtichtti.nl protuber033/portfolio 3000
```

Dat haalt de code van GitHub, draait hem als systemd-service onder een eigen
gebruiker die verder nergens bij kan, zet nginx ervoor en haalt een gratis
certificaat op bij Let's Encrypt. Http gaat daarna automatisch door naar https.

### 5. Controleren

```bash
bash controle.sh portfolio samihtichtti.nl
```

Geeft in één scherm: draait de service, staat nginx aan, hoe lang is het
certificaat nog geldig, hoeveel schijf is vol, en of de site echt antwoordt.

## Bijwerken

Vanaf je laptop, nadat je gepusht hebt:

```bash
git add -A && git commit -m "..." && git push
bash vps/deploy.sh samih@JOUW-IP portfolio samihtichtti.nl
```

De server haalt zelf op wat op GitHub staat, herstart de service en het script
controleert daarna van buitenaf of de site nog 200 geeft.

## Wat er waar staat op de server

| Plek | Wat |
| --- | --- |
| `/srv/portfolio` | de code |
| `/etc/systemd/system/portfolio.service` | hoe de app gestart wordt |
| `/etc/nginx/sites-available/portfolio` | nginx ervoor |
| `/etc/letsencrypt/live/<domein>/` | het certificaat |
| `/var/log/nginx/portfolio.*.log` | bezoekers en fouten |

Logs van de app zelf:

```bash
sudo journalctl -u portfolio -f
```

## Hoe het beveiligd is

- **Firewall** laat alleen 22, 80 en 443 door.
- **Geen wachtwoorden over ssh**, alleen je sleutel. Root kan niet inloggen.
- **fail2ban** zet ip's die blijven proberen tijdelijk buiten de deur.
- **Automatische beveiligingsupdates** staan aan.
- De app draait als **eigen gebruiker zonder shell**, kan alleen bij zijn eigen
  map, en kan geen extra rechten krijgen.
- Let's Encrypt **vernieuwt zichzelf** via `certbot.timer`.

Wat je zelf moet blijven doen: af en toe `sudo apt upgrade` voor de rest van de
pakketten, en een keer per maand `controle.sh` draaien.

## Eerlijk over de afweging

Voor je portfolio is Railway praktischer: het herstart zichzelf, je hoeft niets
bij te houden, en het kost je geen aandacht. Een eigen VPS kost ongeveer €4 per
maand en af en toe onderhoud.

Wat je ervoor terugkrijgt is dat je het zelf kunt. Nginx, systemd, firewalls,
certificaten — dat is precies wat "back-end en hosting" op je site waarmaakt.
En de volgende keer dat een klant vraagt of jij ook de server kunt regelen,
weet je dat je ja kunt zeggen.

Mijn advies: laat de portfolio staan waar hij staat en zet hier een **tweede**
project op. Dan leer je het zonder dat je etalage eronder lijdt.
