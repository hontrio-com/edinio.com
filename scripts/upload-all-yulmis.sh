#!/bin/bash
PREVIEW="https://edinio-jo7fqosr5-hontrios-projects.vercel.app"
SECRET="royal-upload-2024-temp"
BIZ="67c78f3e-633d-41b9-8f22-1e9fda1c8074"
BASE="C:/Users/iorda/Desktop/Produse Yulmis Sound"

RESULTS_FILE="C:/Users/iorda/Desktop/EDINIOV2/edinio/scripts/upload-yulmis-results.json"
echo "[" > "$RESULTS_FILE"
FIRST=true
COUNT=0
TOTAL=27

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

# --- PRODUS 1: Cana termo-sensibila (4 imagini) ---
upload "$BASE/Produs1/Img1.jpeg" "yulmis-cana-termo-1" "Cana Termo 1"
upload "$BASE/Produs1/Img2.jpeg" "yulmis-cana-termo-2" "Cana Termo 2"
upload "$BASE/Produs1/Img3.jpeg" "yulmis-cana-termo-3" "Cana Termo 3"
upload "$BASE/Produs1/Img4.jpeg" "yulmis-cana-termo-4" "Cana Termo 4"

# --- PRODUS 2: Cana alba (2 imagini) ---
upload "$BASE/Produs2/Img.jpeg" "yulmis-cana-alba-1" "Cana Alba 1"
upload "$BASE/Produs2/Img2.jpeg" "yulmis-cana-alba-2" "Cana Alba 2"

# --- PRODUS 3: Piatra ardezie patrata (3 imagini) ---
upload "$BASE/Produs3/Img1.jpeg" "yulmis-piatra-patrata-1" "Piatra Patrata 1"
upload "$BASE/Produs3/Img2.jpeg" "yulmis-piatra-patrata-2" "Piatra Patrata 2"
upload "$BASE/Produs3/Img3.jpeg" "yulmis-piatra-patrata-3" "Piatra Patrata 3"

# --- PRODUS 4: Piatra ardezie inima (3 imagini) ---
upload "$BASE/Produs4/Img1.jpeg" "yulmis-piatra-inima-1" "Piatra Inima 1"
upload "$BASE/Produs4/Img2.jpeg" "yulmis-piatra-inima-2" "Piatra Inima 2"
upload "$BASE/Produs4/Img3.jpeg" "yulmis-piatra-inima-3" "Piatra Inima 3"

# --- PRODUS 5: Rama sticla (1 imagine) ---
upload "$BASE/Produs5/Img.jpeg" "yulmis-rama-sticla-1" "Rama Sticla 1"

# --- PRODUS 6: Perna patrata (2 imagini) ---
upload "$BASE/Produs6/Img.jpeg" "yulmis-perna-patrata-1" "Perna Patrata 1"
upload "$BASE/Produs6/Img2.jpeg" "yulmis-perna-patrata-2" "Perna Patrata 2"

# --- PRODUS 7: Perna inima (1 imagine) ---
upload "$BASE/Produs7/Img.jpeg" "yulmis-perna-inima-1" "Perna Inima 1"

# --- PRODUS 8: Breloc inima (2 imagini) ---
upload "$BASE/Produs8/Img.jpeg" "yulmis-breloc-inima-1" "Breloc Inima 1"
upload "$BASE/Produs8/Img2.jpeg" "yulmis-breloc-inima-2" "Breloc Inima 2"

# --- PRODUS 9: Breloc patrat (1 imagine) ---
upload "$BASE/Produs9/Img.jpeg" "yulmis-breloc-patrat-1" "Breloc Patrat 1"

# --- PRODUS 10: Puzzle A4 (1 imagine) ---
upload "$BASE/Produs10/Img.jpeg" "yulmis-puzzle-a4-1" "Puzzle A4 1"

# --- PRODUS 11: Tricouri (2 imagini) ---
upload "$BASE/Produs11/Img.jpeg" "yulmis-tricou-1" "Tricou 1"
upload "$BASE/Produs11/Img2.jpeg" "yulmis-tricou-2" "Tricou 2"

# --- PRODUS 12: Puzzle inima (1 imagine) ---
upload "$BASE/Produs12/Img.jpeg" "yulmis-puzzle-inima-1" "Puzzle Inima 1"

# --- PRODUS 13: Etichete (1 imagine) ---
upload "$BASE/Produs13/Img.jpeg" "yulmis-etichete-1" "Etichete 1"

# --- PRODUS 14: Punga hartie (1 imagine) ---
upload "$BASE/Produs14/Img.jpeg" "yulmis-punga-1" "Punga Hartie 1"

# --- PRODUS 15: Ceas patrat (1 imagine) ---
upload "$BASE/Produs15/Img.jpeg" "yulmis-ceas-patrat-1" "Ceas Patrat 1"

# --- PRODUS 16: Ceas rotund (1 imagine) ---
upload "$BASE/Produs16/Img.jpeg" "yulmis-ceas-rotund-1" "Ceas Rotund 1"

echo "" >> "$RESULTS_FILE"
echo "]" >> "$RESULTS_FILE"

echo "DONE! Results in $RESULTS_FILE" >&2
