#!/usr/bin/env python3
"""Generate SQL INSERTs for Ralls.ro products from WooCommerce CSV + R2 upload results."""
import csv
import json
import os
import re
import hashlib

CSV_PATH = "C:/Users/iorda/Downloads/wc-product-export-10-6-2026-1781090511298.csv"
UPLOAD_RESULTS = "C:/Users/iorda/Desktop/EDINIOV2/edinio/scripts/upload-ralls-results.json"
IMG_DIR = "C:/Users/iorda/Desktop/EDINIOV2/edinio/scripts/ralls-images"
MAPPING_PATH = os.path.join(IMG_DIR, "_mapping.csv")
OUTPUT_DIR = "C:/Users/iorda/Desktop/EDINIOV2/edinio/scripts/ralls-sql"
BIZ_ID = "c2b5367e-cb77-4745-b53f-5caff358d347"

os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Load URL -> filename mapping ---
url_to_fname = {}
with open(MAPPING_PATH, "r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        url_to_fname[row["url"]] = row["filename"]

# --- Load upload results (slug -> R2 URL) ---
with open(UPLOAD_RESULTS, "r", encoding="utf-8") as f:
    results = json.load(f)

slug_to_r2 = {}
for r in results:
    if isinstance(r, dict) and "slug" in r and "url" in r:
        slug_to_r2[r["slug"]] = r["url"]

# --- Build old URL -> R2 URL mapping ---
url_to_r2 = {}
for old_url, fname in url_to_fname.items():
    slug = "ralls-" + os.path.splitext(fname)[0]
    if slug in slug_to_r2:
        url_to_r2[old_url] = slug_to_r2[slug]

print(f"Image mappings: {len(url_to_r2)} / {len(url_to_fname)}")

# --- WooCommerce category -> Edinio category mapping ---
CAT_MAP = {
    "Baieti > Compleu": "Compleu Baieti",
    "Baieti > Body": "Body Baieti",
    "Baieti > Pijama": "Pijama Baieti",
    "Baieti > Sapca": "Sapca",
    "Fete > Rochii": "Rochii",
    "Fete > Compleu": "Compleu Fete",
    "Fete > Body": "Body Fete",
    "Fete > Fusta": "Fusta",
    "Fete > Salopeta": "Salopeta",
    "Fete > Sarafan": "Sarafan",
    "Fete > Palton": "Palton",
    "Fete > Pijama": "Pijama Fete",
    "Fete > Trening": "Trening",
    "Fete > Boneta": "Boneta",
    "Fete > Vesta": "Vesta",
    "Unisex > Baveta": "Baveta",
    "Unisex > Patura": "Patura",
    "Baieti": "Compleu Baieti",
    "Fete": "Rochii",
    "Unisex": "Baveta",
}

def map_category(wc_cats: str) -> str:
    """Map WooCommerce category string to Edinio category."""
    parts = [c.strip() for c in wc_cats.split(",")]
    # Use the most specific (deepest) category
    best = parts[-1] if parts else ""
    return CAT_MAP.get(best, CAT_MAP.get(parts[0], best))

def slugify(name: str) -> str:
    s = name.lower().strip()
    s = s.replace("ă", "a").replace("â", "a").replace("î", "i").replace("ș", "s").replace("ş", "s").replace("ț", "t").replace("ţ", "t")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s

def escape_sql(s: str) -> str:
    """Escape single quotes for SQL."""
    return s.replace("'", "''").replace("\\n", "\n") if s else ""

def clean_html(html: str) -> str:
    """Clean up WooCommerce HTML description."""
    if not html:
        return ""
    h = html.replace("\\n", "").strip()
    # Remove empty paragraphs
    h = re.sub(r"<p>\s*</p>", "", h)
    return h

def make_seo(name: str, desc: str, cat: str) -> dict:
    """Generate SEO title and description."""
    title = f"{name} | Ralls.ro"
    if len(title) > 60:
        title = name[:56] + "..."

    # Clean HTML tags from description for SEO
    clean = re.sub(r"<[^>]+>", " ", desc).strip()
    clean = re.sub(r"\s+", " ", clean)
    if clean:
        seo_desc = clean[:155] + "..." if len(clean) > 155 else clean
    else:
        seo_desc = f"{name} - Haine copii lucrate manual in Romania. Comanda online de la Ralls.ro"

    if len(seo_desc) > 160:
        seo_desc = seo_desc[:157] + "..."

    return {"title": title, "description": seo_desc}

# --- Parse CSV ---
parents = []
variations_map = {}  # "id:XXXX" -> list of variation rows

with open(CSV_PATH, "r", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    for row in reader:
        tip = row.get("Tip", "")
        if tip in ("variable", "simple"):
            parents.append(row)
        elif tip == "variation":
            pid = row.get("Părinte", "").strip()
            if pid not in variations_map:
                variations_map[pid] = []
            variations_map[pid].append(row)

print(f"Products: {len(parents)}")

# --- Generate SQL ---
BATCH_SIZE = 10
batch_num = 0
all_products = []
seen_slugs = set()

for idx, p in enumerate(parents):
    wc_id = p["ID"]
    name = p["Nume"].strip()
    tip = p["Tip"]
    desc_short = clean_html(p.get("Descriere scurtă", ""))
    desc_long = clean_html(p.get("Descriere", ""))
    description = desc_short or desc_long or ""
    wc_cats = p.get("Categorii", "")
    category = map_category(wc_cats)

    # Images
    img_urls = []
    raw_imgs = p.get("Imagini", "")
    for url in raw_imgs.split(","):
        u = url.strip()
        if u and u in url_to_r2:
            img_urls.append(url_to_r2[u])

    # Slug
    slug = slugify(name)
    if slug in seen_slugs:
        slug = slug + "-" + str(idx)
    seen_slugs.add(slug)

    # Price - from variations or direct
    price = p.get("Preț obișnuit", "") or "0"
    vars_list = variations_map.get(f"id:{wc_id}", [])

    if vars_list:
        # Get price from first variation
        first_var_price = vars_list[0].get("Preț obișnuit", "")
        if first_var_price:
            price = first_var_price

    try:
        price_num = float(price)
    except:
        price_num = 0

    # Variants
    variants_json = None
    if tip == "variable" and vars_list:
        attr1_name = p.get("Nume atribut 1", "") or ""
        attr1_vals = [v.strip() for v in (p.get("Valoare (valori) atribut 1", "") or "").split(",") if v.strip()]
        attr2_name = p.get("Nume atribut 2", "") or ""
        attr2_vals = [v.strip() for v in (p.get("Valoare (valori) atribut 2", "") or "").split(",") if v.strip()]

        options = []
        if attr1_name and attr1_vals:
            options.append({"id": slugify(attr1_name), "name": attr1_name, "values": attr1_vals})
        if attr2_name and attr2_vals:
            options.append({"id": slugify(attr2_name), "name": attr2_name, "values": attr2_vals})

        # Build combinations from parent option values (since variation rows lack specific values)
        combinations = []
        if len(options) == 1:
            for val in options[0]["values"]:
                combinations.append({
                    "id": slugify(val),
                    "title": val,
                    "price": price_num,
                    "sku": "",
                    "enabled": True,
                    "stock_quantity": 100,
                })
        elif len(options) == 2:
            for v1 in options[0]["values"]:
                for v2 in options[1]["values"]:
                    title = f"{v1} / {v2}"
                    combinations.append({
                        "id": slugify(title),
                        "title": title,
                        "price": price_num,
                        "sku": "",
                        "enabled": True,
                        "stock_quantity": 100,
                    })

        if options and combinations:
            variants_json = {
                "enabled": True,
                "options": options,
                "combinations": combinations,
            }

    # SEO
    seo = make_seo(name, description, category)

    # Build page_sections
    page_sections = {"seo": seo}
    if variants_json:
        page_sections["variants"] = variants_json

    all_products.append({
        "name": name,
        "slug": slug,
        "description": description,
        "price": price_num,
        "images": img_urls,
        "category": category,
        "sort_order": idx + 1,
        "page_sections": page_sections,
    })

# --- Write SQL batches ---
batch_num = 0
for i in range(0, len(all_products), BATCH_SIZE):
    batch = all_products[i:i+BATCH_SIZE]
    batch_num += 1

    sql_lines = []
    sql_lines.append("INSERT INTO products (business_id, name, slug, description, price, images, category, is_active, is_featured, sort_order, page_sections) VALUES")

    value_parts = []
    for p in batch:
        imgs_json = json.dumps(p["images"], ensure_ascii=False)
        ps_json = json.dumps(p["page_sections"], ensure_ascii=False)

        val = f"""(
  '{BIZ_ID}',
  '{escape_sql(p["name"])}',
  '{escape_sql(p["slug"])}',
  '{escape_sql(p["description"])}',
  {p["price"]},
  '{escape_sql(imgs_json)}'::jsonb,
  '{escape_sql(p["category"])}',
  true, false, {p["sort_order"]},
  '{escape_sql(ps_json)}'::jsonb
)"""
        value_parts.append(val)

    sql_lines.append(",\n".join(value_parts))
    sql_lines.append(";\n")

    sql_path = os.path.join(OUTPUT_DIR, f"batch-{batch_num:02d}.sql")
    with open(sql_path, "w", encoding="utf-8") as f:
        f.write("\n".join(sql_lines))

print(f"\nGenerated {batch_num} SQL batch files in {OUTPUT_DIR}")
print(f"Total products: {len(all_products)}")

# Stats
cats_used = {}
for p in all_products:
    c = p["category"]
    cats_used[c] = cats_used.get(c, 0) + 1
print("\nCategory distribution:")
for c, n in sorted(cats_used.items(), key=lambda x: -x[1]):
    print(f"  {c}: {n}")
