#!/usr/bin/env bash
#
# Maakt een verse Ubuntu-server klaar. Draaien als root, één keer.
#
#   ssh root@JOUW-IP
#   bash 01-server-klaarmaken.sh samih
#
# Wat het doet: een gewone gebruiker aanmaken, de firewall dichtzetten op alles
# behalve ssh en web, nginx en Node installeren, en inbraakpogingen blokkeren.
set -euo pipefail

GEBRUIKER="${1:-samih}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Draai dit als root: ssh root@server, dan bash $0"
  exit 1
fi

echo "==> Pakketten bijwerken"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

echo "==> Basisgereedschap installeren"
apt-get install -y -qq \
  curl git ufw fail2ban unattended-upgrades nginx ca-certificates gnupg

echo "==> Node 22 installeren"
if ! command -v node >/dev/null 2>&1; then
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs
fi
echo "    node $(node -v), npm $(npm -v)"

echo "==> Gebruiker $GEBRUIKER aanmaken"
if ! id "$GEBRUIKER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$GEBRUIKER"
  usermod -aG sudo "$GEBRUIKER"
fi

# de ssh-sleutel waarmee je nu binnenkwam meeverhuizen
if [ -f /root/.ssh/authorized_keys ]; then
  install -d -m 700 -o "$GEBRUIKER" -g "$GEBRUIKER" "/home/$GEBRUIKER/.ssh"
  install -m 600 -o "$GEBRUIKER" -g "$GEBRUIKER" \
    /root/.ssh/authorized_keys "/home/$GEBRUIKER/.ssh/authorized_keys"
  echo "    ssh-sleutel gekopieerd naar $GEBRUIKER"
fi

echo "==> Firewall"
# eerst toestaan, dan pas aanzetten — anders sluit je jezelf buiten
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status numbered

echo "==> Automatische beveiligingsupdates"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> fail2ban"
systemctl enable --now fail2ban

echo "==> ssh dichtzetten"
SLEUTELS="/home/$GEBRUIKER/.ssh/authorized_keys"
if [ -s "$SLEUTELS" ]; then
  sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
  sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  sshd -t && systemctl reload ssh
  echo "    root-login en wachtwoorden uit. Alleen nog met je sleutel."
else
  echo "    LET OP: geen ssh-sleutel gevonden voor $GEBRUIKER."
  echo "    Wachtwoordlogin blijft aan, anders kom je er niet meer in."
  echo "    Zet eerst je sleutel erop:  ssh-copy-id $GEBRUIKER@$(hostname -I | awk '{print $1}')"
  echo "    Draai daarna dit script opnieuw."
fi

echo
echo "Klaar. Test nu in een NIEUW venster of je binnenkomt:"
echo "    ssh $GEBRUIKER@$(hostname -I | awk '{print $1}')"
echo "Werkt dat? Dan pas dit venster sluiten."
echo "Daarna: bash 02-site-aanzetten.sh <domein> <github-repo> <poort>"
