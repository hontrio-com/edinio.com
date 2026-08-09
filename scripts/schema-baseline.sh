#!/usr/bin/env bash
#
# Schema COMPLETA a productiei, in `migrations/000-schema-baseline.sql`.
#
#     bash scripts/schema-baseline.sh            # regenereaza fisierul
#     bash scripts/schema-baseline.sh --check    # NU scrie: doar spune daca difera
#
# ═══ DE CE EXISTA ═══
#
# `migrations/` erau petice incrementale peste o schema care n-a fost niciodata
# scrisa in Git. Masurat la 18.08.2026: 49 din 58 de tabele din productie n-aveau
# NICIUN `create table` in repo — intre ele `products`, `orders`, `businesses`,
# `users_profile`. O baza goala plus tot repo-ul NU producea Edinio.
#
# Asta nu se vede pana in ziua in care ai nevoie, si atunci e prea tarziu. S-a
# vazut totusi o data, mic: `catalog_cuvinte_murdar` exista in productie si
# nicaieri in repo, fiindca fusese creata dintr-o consola SQL si atat.
#
# Fisierul generat contine tabele, coloane, `default`-uri, constrangeri,
# indexuri, vederi, functii, declansatoare, RLS cu politici, extensii, tipuri si
# GRANTURI — inclusiv cele pe COLOANA, care sunt chiar apararea impotriva
# ridicarii de privilegii prin `role` (RLS verifica RANDURI, nu COLOANE). Niciun
# rand de date.
#
# ═══ CE NU ACOPERA ═══
#
#   * schemele administrate de Supabase (`auth`, `storage`, `vault`) — le pune
#     platforma la crearea proiectului;
#   * SECRETUL din Vault cu care `store_settings` decripteaza cele 39 de campuri.
#     Pe o baza noua vederea se creeaza, dar nu decripteaza pana nu pui cheia.
#
# ═══ CUM SE APLICA PE O BAZA GOALA ═══
#
#   1. `migrations/000-prelude-platforma.sql`  (DOAR pe Postgres gol, nu pe Supabase)
#   2. `migrations/000-schema-baseline.sql`    (fisierul asta)
#
# ATAT. NU se mai aplica nimic altceva.
#
# ⚠ TEXTUL DE AICI SPUNEA ALTCEVA, SI ERA FALS: „restul migratiilor, in ordinea
# datei — sunt istoricul de DUPA baseline". Nu sunt de DUPA: baseline-ul e un dump
# REGENERAT al productiei (istoricul lui git arata 13 regenerari), deci le contine
# deja pe toate. Urmata literal, indicatia de dinainte:
#
#   * pica in `migrations/2026-08-05-format-slug-magazin.sql`, pe o constrangere
#     care exista deja — si atunci cine „forteaza mai departe" reaplica prin
#     `create or replace` corpuri VECHI peste cele noi din snapshot
#     (`blocheaza_escaladare_users_profile` apare in 4 migratii,
#     `incheie_operatie_externa` in 3, `revendica_stoc_comanda` in 2);
#   * iar cine se opreste cuminte la prima eroare ramane deja cu o baza DEGRADATA,
#     fiindca tot ce e inaintea acelui fisier s-a aplicat cu succes — inclusiv
#     `2026-08-04-blocare-escaladare-rol.sql`, care reda lui `authenticated` UPDATE
#     pe `mfa_otp`, `mfa_otp_expires_at` si `mfa_email_enabled`, adica exact trei
#     granturi pe care productia de azi le tine INCHISE.
#
# Deci: `migrations/` si `scripts/migrations/` sunt ISTORIC. Nu se reaplica la
# restaurare.
#
# ⚠ MARCAJUL DE TAIERE NU E IN FISIER, si nici in numele migratiilor (numele merg
# mai departe decat commiturile, iar cele doua dosare au conventii diferite). E
# commit-ul ultimei regenerari:
#
#     git log -1 --format="%h %ad" --date=short -- migrations/000-schema-baseline.sql
#
# O migratie se aplica peste baseline daca si numai daca a fost ADAUGATA dupa acel
# commit. Regula fiind ca baseline-ul se regenereaza odata cu fiecare schimbare de
# schema, lista aceea ar trebui sa fie mereu goala — iar CI-ul chiar o verifica si
# pica daca nu e. Toate detaliile in `migrations/CITESTE-INTAI.md`.
#
# ═══ CHEI ═══
#
# Le ia din mediu, iar daca nu-s acolo, din `.env.local`. ATENTIE: `.env.local`
# scris de Vercel CLI are valorile GOALE, deci de obicei trebuie date pe linie:
#
#     NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
#     SUPABASE_SERVICE_ROLE_KEY=eyJ... \
#     bash scripts/schema-baseline.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=migrations/000-schema-baseline.sql
MOD="${1:-}"

din_env_local() {
  [ -f .env.local ] || return 0
  sed -n "s/^$1=//p" .env.local | head -1 | tr -d '"'"'"'\r'
}

URL="${NEXT_PUBLIC_SUPABASE_URL:-}"; [ -n "$URL" ] || URL=$(din_env_local NEXT_PUBLIC_SUPABASE_URL)
KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"; [ -n "$KEY" ] || KEY=$(din_env_local SUPABASE_SERVICE_ROLE_KEY)
if [ -z "$URL" ] || [ -z "$KEY" ]; then
  echo "Lipsesc NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY." >&2
  echo "(.env.local scris de Vercel CLI are valorile goale — da-le pe linie de comanda)" >&2
  exit 2
fi

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

curl -sS -f -X POST "$URL/rest/v1/rpc/genereaza_schema_baseline" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{}' \
  | python -c 'import sys,json; sys.stdout.write(json.loads(sys.stdin.read()))' > "$TMP"

# Un raspuns fara tabele inseamna ca generatorul a raspuns ceva, dar gresit.
# Fara verificarea asta, o eroare ar suprascrie baseline-ul bun cu un fisier gol —
# adica exact tiparul „200, dar continutul e gresit" pe care il tot reparam.
grep -q 'create table' "$TMP" || { echo "raspuns fara tabele — NU se scrie nimic" >&2; exit 1; }

rezumat() {
  printf '%s linii · %s tabele · %s politici · %s functii · %s indexuri\n' \
    "$(wc -l < "$1")" "$(grep -c 'create table' "$1")" "$(grep -c 'create policy' "$1")" \
    "$(grep -c 'CREATE OR REPLACE FUNCTION' "$1")" "$(grep -c 'INDEX' "$1")"
}

if [ "$MOD" = "--check" ]; then
  if [ ! -f "$OUT" ]; then echo "$OUT lipseste cu totul" >&2; exit 1; fi
  if diff -q "$OUT" "$TMP" >/dev/null; then
    echo "schema din Git = schema din productie ($(rezumat "$OUT"))"
    exit 0
  fi
  echo "DERIVA: productia difera de $OUT" >&2
  diff "$OUT" "$TMP" | head -60 >&2
  echo "..." >&2
  echo "Ruleaza fara --check si include fisierul in commit." >&2
  exit 1
fi

cp "$TMP" "$OUT"
echo "$OUT: $(rezumat "$OUT")"
