#!/usr/bin/env bash
#
# Trei probe care spun daca proxy-ul e configurat bine. Se ruleaza PE SERVER.
#
#     bash /root/emag-proxy/proba.sh
#
# ═══ ⚠ DE CE UN SCRIPT SI NU TREI COMENZI LIPITE ═══
#
# Fiindca, la un tunel `CONNECT`, `curl` NU pune codul proxy-ului in `%{http_code}`.
# Cand proxy-ul refuza, tunelul nu se deschide niciodata, deci nu exista niciun
# raspuns DE LA DESTINATIE — iar `%{http_code}` ramane `000`. Codul adevarat iese in
# mesajul de eroare: „CONNECT tunnel failed, response 403".
#
# Prima forma a probelor cerea sa te uiti la `%{http_code}` si sa astepti 403 si 407.
# Ce vedea omul era:
#
#     2. gazda straina refuzata (astept 403): curl: (56) CONNECT tunnel failed, response 403
#     000
#
# Adica exact raspunsul CORECT, aratand ca un esec. Cine nu stie semantica lui
# `CONNECT` n-are de unde sa-si dea seama, si ar fi pornit sa repare ceva intreg.
#
# Aici se citeste unde trebuie si se scrie TRECUT sau CAZUT, o data.
#
set -uo pipefail

UTILIZATOR="edinio"
GAZDA="127.0.0.1:3128"

if [ -t 0 ]; then
  read -rsp "Parola proxy: " PAROLA; echo; echo
else
  echo "Ruleaza scriptul interactiv (are nevoie de parola)." >&2
  exit 2
fi

trecute=0
cazute=0

# Codul pe care il da PROXY-ul la refuzul unui tunel. Iese in stderr, nu in %{http_code}.
cod_proxy() {
  curl -sS -o /dev/null -x "$1" "$2" 2>&1 >/dev/null \
    | grep -oE 'response [0-9]{3}' | grep -oE '[0-9]{3}' | head -1
}

# Codul dat de DESTINATIE, cand tunelul chiar s-a deschis.
cod_destinatie() {
  curl -sS -o /dev/null -w '%{http_code}' -x "$1" "$2" -X POST -d '{}' 2>/dev/null
}

verdict() {
  if [ "$2" = "$3" ]; then
    echo "   TRECUT   $1 (a raspuns $2)"
    trecute=$((trecute + 1))
  else
    echo "   CAZUT    $1 (astept $3, a raspuns '${2:-nimic}')"
    cazute=$((cazute + 1))
  fi
}

echo "── Probele proxy-ului eMAG ───────────────────────────────────────────────"
echo ""

# 1. Cererea ajunge la eMAG. 401 vine DE LA EI: n-am trimis acreditari eMAG, doar
#    pe cele ale proxy-ului. Deci tunelul s-a deschis si cererea a trecut.
c1="$(cod_destinatie "http://${UTILIZATOR}:${PAROLA}@${GAZDA}" "https://marketplace-api.emag.ro/api-3/vat/read")"
verdict "cererea ajunge la eMAG" "$c1" "401"

# 2. ⚠ CEA MAI IMPORTANTA. Daca gazda straina NU e refuzata, proxy-ul e un releu
#    deschis catre tot internetul, iar parola lui e singurul lucru care il apara.
c2="$(cod_proxy "http://${UTILIZATOR}:${PAROLA}@${GAZDA}" "https://example.com")"
verdict "gazda straina e refuzata" "$c2" "403"

# 3. Fara parola nu intra nimeni.
c3="$(cod_proxy "http://${GAZDA}" "https://marketplace-api.emag.ro/api-3/vat/read")"
verdict "parola chiar e ceruta" "$c3" "407"

unset PAROLA

echo ""
if [ "$cazute" -eq 0 ]; then
  echo "── Toate trei au trecut. Proxy-ul e gata. ────────────────────────────────"
  echo ""
  echo "   IP-ul de albit in contul eMAG: $(curl -4 -s --max-time 5 ifconfig.me || echo '<vezi panoul Contabo>')"
  exit 0
fi

echo "── ${cazute} din 3 au cazut. NU pune inca proxy-ul in folosinta. ─────────────"
echo ""
echo "   Daca a doua a cazut cu 200, proxy-ul e DESCHIS catre internet:"
echo "     systemctl stop squid"
echo "   si reia configurarea."
exit 1
