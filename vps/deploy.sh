#!/usr/bin/env bash
#
# Nieuwe versie live zetten. Draaien vanaf je eigen laptop, in Git Bash.
#
#   bash vps/deploy.sh samih@1.2.3.4 portfolio samihtichtti.nl
#
# Het pusht niets zelf: de server haalt op wat al op GitHub staat.
# Dus eerst gewoon: git add -A && git commit && git push
set -euo pipefail

SERVER="${1:-}"
NAAM="${2:-portfolio}"
DOMEIN="${3:-}"

if [ -z "$SERVER" ]; then
  echo "Gebruik: bash $0 <gebruiker@server> [naam] [domein]"
  exit 1
fi

echo "==> Zijn je wijzigingen al gepusht?"
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "    Je hebt nog niet-opgeslagen wijzigingen:"
  git status --short
  read -r -p "    Toch doorgaan? (j/N) " door
  [ "$door" = "j" ] || exit 1
fi

echo "==> Server bijwerken"
ssh "$SERVER" "bash -s" <<EOF
set -euo pipefail
cd /srv/$NAAM
sudo git pull --ff-only
if [ -f package-lock.json ]; then sudo npm ci --omit=dev; else sudo npm install --omit=dev; fi
sudo chown -R www-$NAAM:www-$NAAM /srv/$NAAM
sudo systemctl restart $NAAM
sleep 2
sudo systemctl is-active --quiet $NAAM && echo "    service draait" || { sudo journalctl -u $NAAM -n 30 --no-pager; exit 1; }
EOF

if [ -n "$DOMEIN" ]; then
  echo "==> Controle van buitenaf"
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 15 "https://$DOMEIN" || echo 000)
  echo "    https://$DOMEIN geeft $CODE"
  [ "$CODE" = "200" ] || { echo "    Dat is niet goed. Kijk met: ssh $SERVER 'sudo journalctl -u $NAAM -n 50'"; exit 1; }
fi

echo "Klaar."
