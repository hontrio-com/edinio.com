#!/bin/bash
PREVIEW="https://edinio-jo7fqosr5-hontrios-projects.vercel.app"
SECRET="royal-upload-2024-temp"
BIZ="adc4c2b6-9c82-4815-93ea-7891419a7117"
BASE="C:/Users/iorda/Desktop/Produse Royal Boutique"

RESULTS_FILE="C:/Users/iorda/Desktop/EDINIOV2/edinio/scripts/upload-results.json"
echo "[" > "$RESULTS_FILE"
FIRST=true
COUNT=0
TOTAL=55

upload() {
  local file="$1"
  local slug="$2"
  local label="$3"
  COUNT=$((COUNT + 1))
  echo "[$COUNT/$TOTAL] $label..." >&2

  RESP=$(npx vercel curl "$PREVIEW/api/upload-temp" -s -X POST \
    -H "x-upload-secret: $SECRET" \
    -F "file=@$file" \
    -F "slug=$slug" \
    -F "business_id=$BIZ" 2>/dev/null | grep -o '{.*}')

  if [ -z "$RESP" ]; then
    echo "  FAIL: no response" >&2
    return
  fi

  echo "  OK" >&2
  if [ "$FIRST" = true ]; then
    FIRST=false
  else
    echo "," >> "$RESULTS_FILE"
  fi
  echo "$RESP" >> "$RESULTS_FILE"
}

# --- COMPLEU BATMAN ---
upload "$BASE/Compleu 2 piese/P1.jpeg" "compleu-batman-galben-1" "Batman P1"
upload "$BASE/Compleu 2 piese/P2.jpeg" "compleu-batman-galben-2" "Batman P2"

# --- SET 3 PIESE ROZ ---
upload "$BASE/Set 3 piese/P1.jpeg" "set-3-piese-roz-1" "Set3Piese P1"
upload "$BASE/Set 3 piese/P2.jpeg" "set-3-piese-roz-2" "Set3Piese P2"

# --- COMPLEU VARA FETE ---
upload "$BASE/Compleu Vara Fete/P1.jpeg" "compleu-vara-fete-mov" "Vara Fete Mov"
upload "$BASE/Compleu Vara Fete/P2.jpeg" "compleu-vara-fete-rosu" "Vara Fete Rosu"

# --- ROCHIE CU VOLANE ---
upload "$BASE/Rochie cu volane/P1.jpeg" "rochie-volane-leopard" "Rochie Leopard"
upload "$BASE/Rochie cu volane/P2.jpeg" "rochie-volane-floral" "Rochie Floral"

# --- COMPLEURI BARBATI (gofrat) ---
upload "$BASE/Compleuri Barbati/P1.jpeg" "compleu-barbati-gofrat-gri" "Barbati Gofrat Gri"
upload "$BASE/Compleuri Barbati/P2.jpeg" "compleu-barbati-gofrat-negru" "Barbati Gofrat Negru"

# --- COMPLEURI BARBATI 2 (dungi) ---
upload "$BASE/Compleuri Barbati (2)/P1.jpeg" "compleu-barbati-dungi-negru" "Barbati Dungi Negru"
upload "$BASE/Compleuri Barbati (2)/P2.jpeg" "compleu-barbati-dungi-alb" "Barbati Dungi Alb"

# --- COMPLEU MINNIE DAMA ---
upload "$BASE/Compleu Minnie/P1.jpeg" "compleu-minnie-dama-gri" "Minnie Dama Gri"
upload "$BASE/Compleu Minnie/P2.jpeg" "compleu-minnie-dama-roz" "Minnie Dama Roz"
upload "$BASE/Compleu Minnie/P3.jpeg" "compleu-minnie-dama-negru" "Minnie Dama Negru"

# --- COMPLEU BROOKLYN UNISEX ---
upload "$BASE/Compleu Unisex/P1.jpeg" "compleu-brooklyn-negru" "Brooklyn Negru"
upload "$BASE/Compleu Unisex/P2.jpeg" "compleu-brooklyn-crem" "Brooklyn Crem"
upload "$BASE/Compleu Unisex/P3.jpeg" "compleu-brooklyn-gri" "Brooklyn Gri"

# --- COMPLEU STITCH & ANGEL ---
upload "$BASE/Compleu 2 piese (2)/P1.jpeg" "compleu-stitch-angel-fuchsia" "Stitch Fuchsia"
upload "$BASE/Compleu 2 piese (2)/P2.jpeg" "compleu-stitch-angel-mauve" "Stitch Mauve"

# --- COMPLEU MINNIE FETITE ---
upload "$BASE/Compleu 2 piese (2)/P3.jpeg" "compleu-minnie-fetite-mov" "Minnie Fetite Mov"
upload "$BASE/Compleu 2 piese (2)/P4.jpeg" "compleu-minnie-fetite-roz" "Minnie Fetite Roz"

# --- COMPLEU SKYE ---
upload "$BASE/Compleu Fetite/P1.jpeg" "compleu-skye-albastru" "Skye Albastru"
upload "$BASE/Compleu Fetite/P2.jpeg" "compleu-skye-alb" "Skye Alb"

# --- COMPLEU WINNIE ---
upload "$BASE/Compleu Fetite/P3.jpeg" "compleu-winnie-roz" "Winnie Roz"
upload "$BASE/Compleu Fetite/P4.jpeg" "compleu-winnie-mov" "Winnie Mov"
upload "$BASE/Compleu Fetite/P5.jpeg" "compleu-winnie-albastru" "Winnie Albastru"

# --- COMPLEU DAMA FUNDA LEOPARD ---
upload "$BASE/Compleu Dama/P1.jpeg" "compleu-dama-funda-verde" "Dama Funda Verde"
upload "$BASE/Compleu Dama/P2.jpeg" "compleu-dama-funda-rosu" "Dama Funda Rosu"
upload "$BASE/Compleu Dama/P3.jpeg" "compleu-dama-funda-bej" "Dama Funda Bej"
upload "$BASE/Compleu Dama/P4.jpeg" "compleu-dama-funda-roz" "Dama Funda Roz"

# --- PAPUCI BARBATI ---
upload "$BASE/Papuci Barbati/P1.jpeg" "papuci-sport-barbati" "Papuci Barbati"

# --- ROCHITE MICKEY & MINNIE ---
upload "$BASE/Rochite Mikey & MINNIE/P1.jpeg" "rochita-mickey-minnie-roz" "Rochita MM Roz"
upload "$BASE/Rochite Mikey & MINNIE/P2.jpeg" "rochita-minnie-albastru-rosu" "Rochita Minnie Albastru"
upload "$BASE/Rochite Mikey & MINNIE/P3.jpeg" "rochita-kidlife-neagra" "Rochita KIDLIFE"

# --- BLUZA DAMA ---
upload "$BASE/Bluza Dama/P1.jpeg" "bluza-dama-verde" "Bluza Verde"
upload "$BASE/Bluza Dama/P2.jpeg" "bluza-dama-rosu" "Bluza Rosu"
upload "$BASE/Bluza Dama/P3.jpeg" "bluza-dama-negru" "Bluza Negru"

# --- PAPUCI CU OCHI ---
upload "$BASE/Papuci cu ochi/P1.jpeg" "papuci-ochi-negru" "Papuci Ochi Negru"
upload "$BASE/Papuci cu ochi/P2.jpeg" "papuci-ochi-alb" "Papuci Ochi Alb"
upload "$BASE/Papuci cu ochi/P3.jpeg" "papuci-ochi-prezentare" "Papuci Ochi Prezentare"
upload "$BASE/Papuci cu ochi/P4.jpeg" "papuci-ochi-roz" "Papuci Ochi Roz"

# --- BALERINI DAMA ---
upload "$BASE/Balerin Dama/P1.jpeg" "balerini-dama-floral-colorat" "Balerini Colorat"
upload "$BASE/Balerin Dama/P2.jpeg" "balerini-dama-floral-albastru" "Balerini Albastru"
upload "$BASE/Balerin Dama/P3.jpeg" "balerini-dama-auriu" "Balerini Auriu"
upload "$BASE/Balerin Dama/P4.jpeg" "balerini-dama-floral-bleu" "Balerini Bleu"

# --- PANTALONI SCURTI FETITE ---
upload "$BASE/Pantaloni Bumbac Gograt/P1.jpeg" "pantaloni-scurti-frozen-roz" "Pantaloni Frozen"
upload "$BASE/Pantaloni Bumbac Gograt/P2.jpeg" "pantaloni-scurti-minnie-verde" "Pantaloni Minnie Verde"
upload "$BASE/Pantaloni Bumbac Gograt/P3.jpeg" "pantaloni-scurti-minnie-alb" "Pantaloni Minnie Alb"
upload "$BASE/Pantaloni Bumbac Gograt/P4.jpeg" "pantaloni-scurti-minnie-mov" "Pantaloni Minnie Mov"

# --- TRICOU BUMBAC (dama, S/M/L) ---
upload "$BASE/Tricou Bumbac/P1.jpeg" "tricou-angels-alb" "Tricou Angels"
upload "$BASE/Tricou Bumbac/P2.jpeg" "tricou-bff-surori" "Tricou BFF"
upload "$BASE/Tricou Bumbac/P3.jpeg" "tricou-bugs-bunny-negru" "Tricou Bugs Bunny"
upload "$BASE/Tricou Bumbac/P4.jpeg" "tricou-fashion-girl" "Tricou Fashion Girl"

# --- TRICOURI BUMBAC (unisex, 2XL-6XL) ---
upload "$BASE/Tricouri Bumbac/p1.jpeg" "tricou-jeans-bleu-dama" "Tricou Jeans Bleu D"
upload "$BASE/Tricouri Bumbac/p8.jpeg" "tricou-jeans-bleu-barbat" "Tricou Jeans Bleu B"
upload "$BASE/Tricouri Bumbac/p2.jpeg" "tricou-black-negru-dama" "Tricou Black D"
upload "$BASE/Tricouri Bumbac/p6.jpeg" "tricou-black-negru-barbat" "Tricou Black B"
upload "$BASE/Tricouri Bumbac/p3.jpeg" "tricou-jeans-rosu-barbat" "Tricou Jeans Rosu B"
upload "$BASE/Tricouri Bumbac/p4.jpeg" "tricou-jeans-rosu-dama" "Tricou Jeans Rosu D"
upload "$BASE/Tricouri Bumbac/p5.jpeg" "tricou-la-alb-dama" "Tricou LA D"
upload "$BASE/Tricouri Bumbac/p7.jpeg" "tricou-la-alb-barbat" "Tricou LA B"

echo "" >> "$RESULTS_FILE"
echo "]" >> "$RESULTS_FILE"

echo "DONE! Results in $RESULTS_FILE" >&2
