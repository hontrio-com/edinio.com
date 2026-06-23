#!/usr/bin/env python3
"""
Scrape bflashh.ro (WooCommerce / WordPress) into a CSV feed for the Edinio
product import wizard.

Uses the public, unauthenticated WooCommerce Store API:
  GET /wp-json/wc/store/v1/products?per_page=100&page=N

Output columns mimic a WooCommerce product export, so Edinio's importer
auto-detects the file as "WooCommerce (CSV)" and uses the Woo preset
(handles sale/regular price, categories, images, weight).

Polite: identifies itself, paginates with a short delay, retries transient
errors. Read-only GETs against a public API.
"""
import csv
import json
import time
import urllib.request
import urllib.error
import html
import re

BASE = "https://bflashh.ro/wp-json/wc/store/v1/products"
PER_PAGE = 100
OUT_PATH = "C:/Users/iorda/Desktop/EDINIOV2/edinio/scripts/bflashh-feed.csv"
MAX_PRODUCTS = 500  # plan cap; keep the 500 most sellable, drop the rest
USER_AGENT = "Mozilla/5.0 (EdinioMigration/1.0; +https://edinio.com)"
DELAY_SECONDS = 0.4
MAX_RETRIES = 3

COLUMNS = [
    "Type", "SKU", "Name", "Published", "Is featured?",
    "Short description", "Description",
    "Regular price", "Sale price",
    "Categories", "Tags", "Images",
    "In stock?", "Stock", "Weight (kg)",
]


def fetch_page(page: int):
    url = f"{BASE}?per_page={PER_PAGE}&page={page}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                total_pages = int(r.headers.get("X-WP-TotalPages") or 0)
                total = int(r.headers.get("X-WP-Total") or 0)
                return json.load(r), total_pages, total
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            last_err = e
            print(f"  retry {attempt}/{MAX_RETRIES} (page {page}): {e}")
            time.sleep(1.5 * attempt)
    raise RuntimeError(f"Failed to fetch page {page}: {last_err}")


def money(minor: str, minor_unit: int) -> str:
    """Convert Store API minor units ('4999', unit 2) to '49.99'."""
    if minor is None or minor == "":
        return ""
    try:
        return f"{int(minor) / (10 ** minor_unit):.2f}"
    except (ValueError, TypeError):
        return ""


def clean_inline(text: str) -> str:
    """Short description -> single line of readable text."""
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def pick_categories(cats: list) -> str:
    """Comma-separated category names, dropping generic 'Vezi tot' umbrellas."""
    names = [html.unescape(c.get("name", "")).strip() for c in cats if c.get("name")]
    names = [n for n in names if not n.lower().startswith("vezi tot")] or names
    return ", ".join(dict.fromkeys(names))  # de-dupe, keep order


def product_to_row(p: dict) -> dict:
    prices = p.get("prices") or {}
    unit = prices.get("currency_minor_unit", 2)
    is_variable = p.get("type") == "variable"

    if is_variable:
        rng = prices.get("price_range") or {}
        regular = money(rng.get("min_amount"), unit) if rng else money(prices.get("regular_price"), unit)
        sale = ""  # variant-level pricing not expanded in v1
    else:
        regular = money(prices.get("regular_price"), unit)
        sale = money(prices.get("sale_price"), unit) if p.get("on_sale") else ""

    images = ", ".join(i.get("src", "") for i in (p.get("images") or []) if i.get("src"))
    tags = ", ".join(html.unescape(t.get("name", "")) for t in (p.get("tags") or []) if t.get("name"))
    weight = (p.get("weight") or "").strip()

    return {
        "Type": p.get("type", "simple"),
        "SKU": p.get("sku", "") or "",
        "Name": clean_inline(p.get("name", "")),
        "Published": "1",
        "Is featured?": "0",
        "Short description": clean_inline(p.get("short_description", "")),
        "Description": (p.get("description") or "").strip(),
        "Regular price": regular,
        "Sale price": sale,
        "Categories": pick_categories(p.get("categories") or []),
        "Tags": tags,
        "Images": images,
        "In stock?": "1" if p.get("is_in_stock") else "0",
        "Stock": p.get("low_stock_remaining") if p.get("low_stock_remaining") is not None else "",
        "Weight (kg)": weight,
    }


def flags_for(row: dict) -> dict:
    return {
        "in_stock": row["In stock?"] == "1",
        "has_image": bool(row["Images"].strip()),
        "has_cat": bool(row["Categories"].strip()),
        "has_desc": bool(row["Description"].strip() or row["Short description"].strip()),
        "has_price": bool(row["Regular price"].strip()),
    }


def drop_reason(f: dict, over_cap: bool) -> str:
    if not f["has_price"]:
        return "fara pret"
    if not f["in_stock"]:
        return "stoc epuizat"
    if not f["has_image"]:
        return "fara imagine"
    if not f["has_cat"]:
        return "fara categorie"
    return "peste limita de 500" if over_cap else "alt motiv"


def main():
    items = []  # (orig_index, row, flags)
    page = 1
    total_pages = 1

    while page <= total_pages:
        products, total_pages, total = fetch_page(page)
        if page == 1:
            print(f"Total products available: {total} across {total_pages} pages")
        if not products:
            break
        for p in products:
            row = product_to_row(p)
            items.append((len(items), row, flags_for(row)))
        print(f"  page {page}/{total_pages}: {len(products)} (running total {len(items)})")
        page += 1
        time.sleep(DELAY_SECONDS)

    # Keep the most sellable 500: in stock > has image > has category > has description,
    # then by catalog order. The worst products fall outside the cut.
    ranked = sorted(
        items,
        key=lambda it: (it[1]["Regular price"] != "", it[2]["in_stock"], it[2]["has_image"],
                        it[2]["has_cat"], it[2]["has_desc"], -it[0]),
        reverse=True,
    )
    keep = ranked[:MAX_PRODUCTS]
    drop = ranked[MAX_PRODUCTS:]
    keep.sort(key=lambda it: it[0])  # restore catalog order in the output

    with open(OUT_PATH, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(row for _, row, _ in keep)

    # Reporting
    reasons = {}
    for _, _, fl in drop:
        r = drop_reason(fl, over_cap=True)
        reasons[r] = reasons.get(r, 0) + 1
    kept_variable = sum(1 for _, row, _ in keep if row["Type"] == "variable")
    kept_oos = sum(1 for _, _, fl in keep if not fl["in_stock"])
    kept_noimg = sum(1 for _, _, fl in keep if not fl["has_image"])

    print(f"\nDone. Scraped {len(items)}, kept {len(keep)} -> {OUT_PATH}")
    print(f"Dropped {len(drop)}:")
    for r, c in sorted(reasons.items(), key=lambda kv: -kv[1]):
        print(f"  - {c}: {r}")
    print(f"Kept set: {kept_variable} variable, {kept_oos} out-of-stock, {kept_noimg} without image")


if __name__ == "__main__":
    main()
