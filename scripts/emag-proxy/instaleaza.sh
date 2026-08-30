#!/usr/bin/env bash
#
# Ridica proxy-ul CONNECT pentru eMAG, pe un Ubuntu gol.
#
#     scp -r scripts/emag-proxy root@<IP>:/root/
#     ssh root@<IP>
#     bash /root/emag-proxy/instaleaza.sh
#
# ═══ DE CE EXISTA SCRIPTUL ═══
#
# Serverul asta n-are nicio stare de pierdut: toata configurarea lui e fisierul de
# alaturi plus o parola. De aceea nu se plateste copie de siguranta la Contabo —
# se reface de aici in zece minute.
#
# ⚠ CE NU SE POATE REFACE E ADRESA IP. Fiecare comerciant o albeste de mana in
# contul lui eMAG. Deci serverul se poate opri si porni, dar NU se sterge si nu se
# recreeaza: un IP nou inseamna sa umble toti comerciantii din nou prin panoul eMAG.
#
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Ruleaza ca root: sudo bash $0"
  exit 1
fi

AICI="$(cd "$(dirname "$0")" && pwd)"

echo "── 1. Pachete ────────────────────────────────────────────────────────────"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq squid apache2-utils ufw fail2ban curl ca-certificates

echo "── 2. Parola proxy-ului ──────────────────────────────────────────────────"
#
# ⚠ Se GENEREAZA, nu se alege. O parola aleasa de om pe un proxy care e aparat DOAR
# de parola e singura veriga slaba a intregii integrari.
UTILIZATOR="edinio"
if [ -f /etc/squid/parole ]; then
  echo "   /etc/squid/parole exista deja — nu se rescrie."
  echo "   Ca sa faci alta parola: rm /etc/squid/parole si ruleaza scriptul din nou."
else
  PAROLA="$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 32)"
  htpasswd -b -c /etc/squid/parole "$UTILIZATOR" "$PAROLA" >/dev/null 2>&1
  chown proxy:proxy /etc/squid/parole
  chmod 600 /etc/squid/parole
  echo ""
  echo "   ╔══════════════════════════════════════════════════════════════════╗"
  echo "   ║  SCRIE ADRESA ASTA IN VERCEL, LA EMAG_PROXY_URL.                 ║"
  echo "   ║  Se arata O SINGURA DATA — parola nu se mai poate citi de aici.  ║"
  echo "   ╚══════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "   EMAG_PROXY_URL=http://${UTILIZATOR}:${PAROLA}@$(curl -4 -s --max-time 5 ifconfig.me || echo '<IP>'):3128"
  echo ""
fi

echo "── 3. Configurarea ───────────────────────────────────────────────────────"
cp /etc/squid/squid.conf "/etc/squid/squid.conf.original.$(date +%Y%m%d)" 2>/dev/null || true
cp "$AICI/squid.conf" /etc/squid/squid.conf

# Cade ACUM daca fisierul e gresit, nu la prima cerere a unui comerciant.
squid -k parse

echo "── 4. Zid de foc ─────────────────────────────────────────────────────────"
#
# ⚠ 3128 se deschide catre TOATA lumea, si nu din neglijenta: Vercel n-are IP fix,
# deci n-avem ce trece in lista. Usa e tinuta de parola SI de lista de gazde din
# `squid.conf` — chiar cu parola in mana, proxy-ul nu duce nicaieri in afara de eMAG.
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp comment 'ssh' >/dev/null
ufw allow 3128/tcp comment 'proxy emag' >/dev/null
ufw --force enable >/dev/null
ufw status numbered

echo "── 5. Impotriva incercarilor de parola ───────────────────────────────────"
cat > /etc/fail2ban/jail.d/squid.conf <<'JAIL'
# Proxy-ul e aparat doar de parola, deci incercarile repetate trebuie oprite.
[squid]
enabled  = true
port     = 3128
filter   = squid
logpath  = /var/log/squid/access.log
maxretry = 5
findtime = 600
bantime  = 3600
JAIL
systemctl restart fail2ban

echo "── 6. Pornire ────────────────────────────────────────────────────────────"
systemctl enable squid >/dev/null
systemctl restart squid
sleep 2
systemctl is-active --quiet squid && echo "   squid: pornit" || { echo "   squid NU a pornit"; journalctl -u squid -n 20 --no-pager; exit 1; }

echo ""
echo "── 7. Proba ──────────────────────────────────────────────────────────────"
echo ""
echo "   Ruleaza acum:"
echo ""
echo "     bash $AICI/proba.sh"
echo ""
echo "   Cere parola o data si spune TRECUT sau CAZUT pentru fiecare din cele trei."
echo ""
echo "   ⚠ NU te uita la codul din \`%{http_code}\` cand incerci de mana: la un tunel"
echo "   CONNECT refuzat, curl lasa acolo 000 si scrie codul proxy-ului in mesajul de"
echo "   eroare. Raspunsul CORECT arata ca un esec. De aia exista scriptul."
echo ""
echo "Gata. IP-ul de albit la eMAG: $(curl -4 -s --max-time 5 ifconfig.me || echo '<vezi panoul Contabo>')"
