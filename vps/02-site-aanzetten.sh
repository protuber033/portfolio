#!/usr/bin/env bash
#
# Zet één site neer: code ophalen, als service draaien, nginx ervoor, ssl erop.
# Draaien als root, nadat 01 gelukt is EN je DNS al naar de server wijst.
#
#   bash 02-site-aanzetten.sh portfolio.nl protuber033/portfolio 3000
#
set -euo pipefail

DOMEIN="${1:-}"
REPO="${2:-}"
POORT="${3:-3000}"
NAAM="$(echo "$DOMEIN" | cut -d. -f1)"
MAP="/srv/$NAAM"

if [ -z "$DOMEIN" ] || [ -z "$REPO" ]; then
  echo "Gebruik: bash $0 <domein> <github-gebruiker/repo> [poort]"
  echo "Bijv.:  bash $0 samihtichtti.nl protuber033/portfolio 3000"
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then echo "Draai dit als root."; exit 1; fi

echo "==> Controleren of $DOMEIN al naar deze server wijst"
MIJN_IP="$(curl -s -m 10 https://api.ipify.org || true)"
DNS_IP="$(getent ahostsv4 "$DOMEIN" | awk 'NR==1{print $1}' || true)"
echo "    server: ${MIJN_IP:-onbekend}   domein: ${DNS_IP:-nog niets}"
if [ -n "$MIJN_IP" ] && [ "$DNS_IP" != "$MIJN_IP" ]; then
  echo "    Het domein wijst nog niet hierheen. Zet eerst deze DNS-regels:"
  echo "        A     @      $MIJN_IP"
  echo "        A     www    $MIJN_IP"
  echo "    en wacht tot dat doorgedrongen is. Dan pas verder, anders mislukt het certificaat."
  read -r -p "    Toch doorgaan? (j/N) " door
  [ "$door" = "j" ] || exit 1
fi

echo "==> Code ophalen naar $MAP"
if [ -d "$MAP/.git" ]; then
  git -C "$MAP" pull --ff-only
else
  git clone "https://github.com/$REPO.git" "$MAP"
fi
cd "$MAP"
if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

echo "==> Aparte gebruiker voor de site"
id -u "www-$NAAM" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "www-$NAAM"
chown -R "www-$NAAM":"www-$NAAM" "$MAP"

echo "==> Systemd-service"
cat > "/etc/systemd/system/$NAAM.service" <<EOF
[Unit]
Description=$NAAM
After=network.target

[Service]
Type=simple
User=www-$NAAM
WorkingDirectory=$MAP
Environment=NODE_ENV=production
Environment=PORT=$POORT
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3

# de service mag alleen bij zijn eigen map
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$MAP

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$NAAM"
sleep 2
systemctl is-active --quiet "$NAAM" || { journalctl -u "$NAAM" -n 30 --no-pager; exit 1; }
echo "    service draait op poort $POORT"

echo "==> Nginx ervoor"
cat > "/etc/nginx/sites-available/$NAAM" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMEIN www.$DOMEIN;

    # certbot vult hieronder straks het ssl-gedeelte aan
    location / {
        proxy_pass http://127.0.0.1:$POORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 30s;
    }

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    gzip on;
    gzip_types text/css text/javascript application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    client_max_body_size 8m;
    access_log /var/log/nginx/$NAAM.access.log;
    error_log  /var/log/nginx/$NAAM.error.log;
}
EOF

ln -sf "/etc/nginx/sites-available/$NAAM" "/etc/nginx/sites-enabled/$NAAM"
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "    nginx staat ervoor"

echo "==> Gratis ssl-certificaat"
apt-get install -y -qq certbot python3-certbot-nginx
if certbot --nginx -d "$DOMEIN" -d "www.$DOMEIN" --redirect --agree-tos -m "tichtti@gmail.com" -n; then
  echo "    certificaat staat erop, http stuurt door naar https"
else
  echo "    certificaat is niet gelukt — meestal wijst de DNS nog niet goed."
  echo "    Probeer later opnieuw: certbot --nginx -d $DOMEIN -d www.$DOMEIN --redirect"
fi
systemctl enable --now certbot.timer 2>/dev/null || true

echo
echo "Klaar. Controleer: https://$DOMEIN"
echo "Bijwerken doe je voortaan met deploy.sh vanaf je laptop."
