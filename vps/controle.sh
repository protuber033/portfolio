#!/usr/bin/env bash
#
# Even kijken of alles nog gezond is. Draaien op de server.
#
#   bash controle.sh portfolio samihtichtti.nl
#
set -uo pipefail

NAAM="${1:-portfolio}"
DOMEIN="${2:-}"

streep() { printf '\n%s\n' "-- $1 --"; }

streep "service"
systemctl is-active "$NAAM" >/dev/null 2>&1 \
  && echo "draait sinds $(systemctl show -p ActiveEnterTimestamp --value "$NAAM")" \
  || { echo "STAAT UIT"; systemctl status "$NAAM" --no-pager -n 10; }

streep "nginx"
systemctl is-active nginx >/dev/null 2>&1 && echo "draait" || echo "STAAT UIT"
nginx -t 2>&1 | tail -2

streep "certificaat"
if [ -n "$DOMEIN" ] && [ -f "/etc/letsencrypt/live/$DOMEIN/cert.pem" ]; then
  EIND=$(openssl x509 -enddate -noout -in "/etc/letsencrypt/live/$DOMEIN/cert.pem" | cut -d= -f2)
  DAGEN=$(( ( $(date -d "$EIND" +%s) - $(date +%s) ) / 86400 ))
  echo "geldig tot $EIND  ($DAGEN dagen)"
  [ "$DAGEN" -lt 21 ] && echo "LET OP: vernieuwing hoort automatisch te gaan, controleer certbot.timer"
else
  echo "geen certificaat gevonden voor ${DOMEIN:-<geen domein opgegeven>}"
fi
systemctl is-active certbot.timer >/dev/null 2>&1 && echo "automatische vernieuwing staat aan" || echo "automatische vernieuwing STAAT UIT"

streep "firewall"
ufw status | head -8

streep "schijf en geheugen"
df -h / | tail -1 | awk '{print "schijf: "$3" van "$2" gebruikt ("$5")"}'
free -h | awk 'NR==2{print "geheugen: "$3" van "$2" gebruikt"}'

streep "updates"
apt-get -s upgrade 2>/dev/null | grep -c "^Inst" | awk '{print $1" pakketten kunnen bijgewerkt worden"}'

streep "site"
if [ -n "$DOMEIN" ]; then
  curl -s -o /dev/null -w "https://%{url_effective} -> %{http_code} in %{time_total}s\n" -m 15 "https://$DOMEIN"
fi

streep "laatste fouten"
journalctl -u "$NAAM" -p err -n 10 --no-pager 2>/dev/null | tail -10 || echo "geen"
echo
