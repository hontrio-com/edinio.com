#!/usr/bin/env python3
"""Generate upload script for Ralls images to R2."""
import csv
import os

BIZ = "c2b5367e-cb77-4745-b53f-5caff358d347"
IMG_DIR = "C:/Users/iorda/Desktop/EDINIOV2/edinio/scripts/ralls-images"
SCRIPT_OUT = "C:/Users/iorda/Desktop/EDINIOV2/edinio/scripts/upload-all-ralls.sh"

mapping = {}
with open(os.path.join(IMG_DIR, "_mapping.csv"), "r") as f:
    reader = csv.DictReader(f)
    for row in reader:
        mapping[row["url"]] = row["filename"]

with open(SCRIPT_OUT, "w", newline="\n") as f:
    f.write(f"""#!/bin/bash
PREVIEW="https://edinio-jo7fqosr5-hontrios-projects.vercel.app"
SECRET="royal-upload-2024-temp"
BIZ="{BIZ}"
BASE="{IMG_DIR}"
RESULTS="C:/Users/iorda/Desktop/EDINIOV2/edinio/scripts/upload-ralls-results.json"
echo "[" > "$RESULTS"
FIRST=true
COUNT=0
TOTAL={len(mapping)}

upload() {{
  local file="$1"
  local slug="$2"
  local label="$3"
  COUNT=$((COUNT + 1))
  echo "[$COUNT/$TOTAL] $label..." >&2
  RESP=$(npx vercel curl "$PREVIEW/api/upload-temp" -s -X POST \\
    -H "x-upload-secret: $SECRET" \\
    -F "file=@$file" \\
    -F "slug=$slug" \\
    -F "business_id=$BIZ" 2>/dev/null | grep -o '{{.*}}')
  if [ -z "$RESP" ]; then
    echo "  FAIL" >&2
    return
  fi
  echo "  OK" >&2
  if [ "$FIRST" = true ]; then
    FIRST=false
  else
    echo "," >> "$RESULTS"
  fi
  echo "$RESP" >> "$RESULTS"
}}

""")
    for url, fname in mapping.items():
        slug = "ralls-" + os.path.splitext(fname)[0]
        f.write(f'upload "$BASE/{fname}" "{slug}" "{fname}"\n')

    f.write("""
echo "" >> "$RESULTS"
echo "]" >> "$RESULTS"
echo "DONE!" >&2
""")

print(f"Script written: {SCRIPT_OUT}")
print(f"Total uploads: {len(mapping)}")
