#!/usr/bin/env python3
"""Download all Ralls.ro product images via old server IP."""
import csv
import os
import subprocess
import hashlib

CSV_PATH = "C:/Users/iorda/Downloads/wc-product-export-10-6-2026-1781090511298.csv"
IMG_DIR = "C:/Users/iorda/Desktop/EDINIOV2/edinio/scripts/ralls-images"
OLD_IP = "89.42.13.188"

os.makedirs(IMG_DIR, exist_ok=True)

# Parse CSV and extract image URLs
imgs = []
with open(CSV_PATH, "r", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row.get("Tip", "") in ("variable", "simple"):
            for url in row.get("Imagini", "").split(","):
                u = url.strip()
                if u and u not in [x[0] for x in imgs]:
                    # Create a short filename from the URL
                    ext = os.path.splitext(u)[1] or ".jpg"
                    short = hashlib.md5(u.encode()).hexdigest()[:12] + ext
                    imgs.append((u, short))

print(f"Total images to download: {len(imgs)}")

success = 0
fail = 0
for i, (url, fname) in enumerate(imgs):
    outpath = os.path.join(IMG_DIR, fname)
    if os.path.exists(outpath) and os.path.getsize(outpath) > 1000:
        print(f"[{i+1}/{len(imgs)}] SKIP (exists): {fname}")
        success += 1
        continue

    print(f"[{i+1}/{len(imgs)}] Downloading {fname}...", end=" ", flush=True)
    result = subprocess.run(
        ["curl", "-s", "-o", outpath, "--resolve", f"ralls.ro:443:{OLD_IP}", "-k", url],
        capture_output=True, timeout=30
    )

    if os.path.exists(outpath) and os.path.getsize(outpath) > 1000:
        print("OK")
        success += 1
    else:
        print("FAIL")
        fail += 1

print(f"\nDone: {success} OK, {fail} FAIL")

# Write URL->filename mapping
mapping_path = os.path.join(IMG_DIR, "_mapping.csv")
with open(mapping_path, "w", encoding="utf-8") as f:
    f.write("url,filename\n")
    for url, fname in imgs:
        f.write(f"{url},{fname}\n")
print(f"Mapping saved to {mapping_path}")
