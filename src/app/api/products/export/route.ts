import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseShippingClasses } from "@/lib/shipping/rules";

// Complete product catalogue export → CSV.
// Column headers intentionally match the import auto-mapper synonyms (see
// src/lib/import/presets.ts), so an exported file re-imports cleanly (round-trip).

const PAGE = 1000;

type Cat = { id: string; name: string; parent_id: string | null };

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function num(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "";
}

// ── Variants (page_sections.variants) → 2 CSV columns ───────────────────────
// Combination price/stock can be either string (saved from the product form) or
// number (saved from an import), so everything goes through num()/String().
//  • "Optiuni variante": axis defs  → "Marime: S, M, L | Culoare: Rosu, Negru"
//  • "Variante": one combination per line →
//      "S / Rosu | pret=79.99 | pret_vechi=99 | sku=ABC | stoc=10 | activ=da | imagine=URL"
type VOpt = { name?: string; values?: unknown };
type VCombo = {
  title?: string;
  price?: number | string | null;
  compare_at_price?: number | string | null;
  sku?: string;
  stock_quantity?: number | string | null;
  image?: string;
  enabled?: boolean;
};
type VS = { enabled?: boolean; options?: VOpt[]; combinations?: VCombo[] };

function variantOptionsCell(v: VS | null | undefined): string {
  if (!v?.enabled || !Array.isArray(v.options)) return "";
  return v.options
    .map((o) => {
      const name = (o?.name ?? "").trim();
      const vals = Array.isArray(o?.values)
        ? (o!.values as unknown[]).map((x) => String(x).trim()).filter(Boolean)
        : [];
      return name && vals.length ? `${name}: ${vals.join(", ")}` : "";
    })
    .filter(Boolean)
    .join(" | ");
}

function variantCombosCell(v: VS | null | undefined): string {
  if (!v?.enabled || !Array.isArray(v.combinations)) return "";
  const lines: string[] = [];
  for (const c of v.combinations) {
    const title = (c?.title ?? "").trim();
    if (!title) continue;
    const parts = [title];
    const price = num(c.price);
    if (price !== "") parts.push(`pret=${price}`);
    const cmp = num(c.compare_at_price);
    if (cmp !== "") parts.push(`pret_vechi=${cmp}`);
    const sku = (c.sku ?? "").trim();
    if (sku) parts.push(`sku=${sku}`);
    const stoc = num(c.stock_quantity);
    if (stoc !== "") parts.push(`stoc=${stoc}`);
    parts.push(`activ=${c.enabled === false ? "nu" : "da"}`);
    const img = (c.image ?? "").trim();
    if (img) parts.push(`imagine=${img}`);
    lines.push(parts.join(" | "));
  }
  return lines.join("\n");
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, slug")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!biz) return NextResponse.json({ error: "Magazin negasit" }, { status: 404 });

  // Shipping classes live as JSON on store_settings; map id -> name so the export
  // is human-readable and re-imports by name (see the committer's reverse lookup).
  const { data: settings } = await supabase
    .from("store_settings")
    .select("shipping_classes")
    .eq("business_id", biz.id)
    .maybeSingle();
  const shipClassName = new Map<string, string>();
  for (const c of parseShippingClasses(settings?.shipping_classes ?? [])) {
    shipClassName.set(c.id, c.name);
  }

  // Categories → resolve full hierarchical path (Parinte > Copil) for round-trip.
  // Windowed: cataloagele importate pot depasi cap-ul de 1000 de randuri PostgREST.
  const catRows: Cat[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("categories")
      .select("id, name, parent_id")
      .eq("business_id", biz.id)
      .order("id")
      .range(from, from + PAGE - 1);
    catRows.push(...((data ?? []) as Cat[]));
    if (!data || data.length < PAGE) break;
  }
  const cats = catRows;
  const catById = new Map(cats.map((c) => [c.id, c]));
  const catByName = new Map<string, Cat>();
  for (const c of cats) if (!catByName.has(c.name)) catByName.set(c.name, c);

  function categoryPath(name: string | null): string {
    if (!name) return "";
    const row = catByName.get(name);
    if (!row) return name; // free-text category not in the categories table
    const parts: string[] = [];
    let cur: Cat | undefined = row;
    let guard = 0;
    while (cur && guard++ < 8) {
      parts.unshift(cur.name);
      cur = cur.parent_id ? catById.get(cur.parent_id) : undefined;
    }
    return parts.join(" > ");
  }

  // Fetch every (non-bundle) product, paginated so large catalogues export fully.
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("products")
      .select("name, price, compare_at_price, description, sku, category, tags, images, stock_quantity, track_inventory, weight_grams, is_active, is_featured, slug, external_id, shipping_class, page_sections")
      .eq("business_id", biz.id)
      .eq("is_bundle", false)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: "Eroare la export." }, { status: 500 });
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  type PS = {
    short_description?: string;
    stock_status?: string;
    low_stock_threshold?: number;
    dimensions?: { length?: number; width?: number; height?: number };
    specifications?: { label?: string; value?: string }[];
    quantity_tiers?: { enabled?: boolean; mode?: string; tier2_price?: number; tier2_percent?: number; tier2_badge?: string; tier3_price?: number; tier3_percent?: number; tier3_badge?: string };
    seo?: { title?: string; description?: string };
    google?: { gtin?: string; brand?: string };
  };
  const ssOut: Record<string, string> = { in_stock: "in stoc", out_of_stock: "epuizat", preorder: "precomanda" };

  // Full column set — keep in sync with the import template (src/lib/import/templates.ts).
  const header = [
    "Nume", "Pret", "Pret vechi", "Descriere scurta", "Descriere", "SKU", "EAN", "Brand", "Categorie",
    "Etichete", "Imagini", "Stoc", "Prag stoc redus", "Status stoc", "Greutate",
    "Lungime (cm)", "Latime (cm)", "Inaltime (cm)", "Clasa transport", "Publicat", "Recomandat",
    "Specificatii", "Upsell - mod", "Upsell 2 buc - valoare", "Upsell 2 buc - eticheta",
    "Upsell 3 buc - valoare", "Upsell 3 buc - eticheta", "Slug", "ID extern",
    "Titlu SEO", "Descriere SEO", "Optiuni variante", "Variante",
  ];

  const lines = [header.map(csvCell).join(",")];
  for (const p of rows) {
    const images = Array.isArray(p.images) ? (p.images as string[]).filter(Boolean) : [];
    const tags = Array.isArray(p.tags) ? (p.tags as string[]).filter(Boolean) : [];
    const tracked = p.track_inventory === true;
    const ps = (p.page_sections ?? {}) as PS;
    const dim = ps.dimensions ?? {};
    const specs = Array.isArray(ps.specifications)
      ? ps.specifications.filter((s) => s?.label && s?.value).map((s) => `${s.label}: ${s.value}`).join(" | ")
      : "";
    const variants = ((p.page_sections ?? {}) as { variants?: VS }).variants;
    const qt = ps.quantity_tiers;
    const upsellOn = !!(qt && qt.enabled);
    const isPct = qt?.mode === "percent";
    const tierVal = (price?: number, pct?: number): string => {
      if (!upsellOn) return "";
      const v = isPct ? pct : price;
      return v != null && v > 0 ? num(v) : "";
    };
    lines.push([
      csvCell(p.name as string),
      num(p.price as number),
      num(p.compare_at_price as number | null),
      csvCell(ps.short_description ?? ""),
      csvCell(p.description as string | null),
      csvCell(p.sku as string | null),
      csvCell(ps.google?.gtin ?? ""),
      csvCell(ps.google?.brand ?? ""),
      csvCell(categoryPath(p.category as string | null)),
      csvCell(tags.join(", ")),
      csvCell(images.join(" | ")),
      tracked ? num(p.stock_quantity as number | null) : "",
      ps.low_stock_threshold != null ? num(ps.low_stock_threshold) : "",
      ps.stock_status ? (ssOut[ps.stock_status] ?? ps.stock_status) : "",
      p.weight_grams != null ? `${p.weight_grams} g` : "",
      dim.length ? num(dim.length) : "",
      dim.width ? num(dim.width) : "",
      dim.height ? num(dim.height) : "",
      csvCell(p.shipping_class ? (shipClassName.get(p.shipping_class as string) ?? "") : ""),
      p.is_active ? "Da" : "Nu",
      p.is_featured ? "Da" : "Nu",
      csvCell(specs),
      upsellOn ? (isPct ? "procent" : "suma") : "",
      tierVal(qt?.tier2_price, qt?.tier2_percent),
      upsellOn ? csvCell(qt?.tier2_badge ?? "") : "",
      tierVal(qt?.tier3_price, qt?.tier3_percent),
      upsellOn ? csvCell(qt?.tier3_badge ?? "") : "",
      csvCell(p.slug as string | null),
      csvCell(p.external_id as string | null),
      csvCell(ps.seo?.title ?? ""),
      csvCell(ps.seo?.description ?? ""),
      csvCell(variantOptionsCell(variants)),
      csvCell(variantCombosCell(variants)),
    ].join(","));
  }

  // UTF-8 BOM so Excel renders Romanian diacritics correctly; CRLF line endings.
  const csv = "﻿" + lines.join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  const filename = `produse-${biz.slug ?? "magazin"}-${date}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
