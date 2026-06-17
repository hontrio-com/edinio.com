import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  // Categories → resolve full hierarchical path (Parinte > Copil) for round-trip.
  const { data: catRows } = await supabase
    .from("categories")
    .select("id, name, parent_id")
    .eq("business_id", biz.id);
  const cats = (catRows ?? []) as Cat[];
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
      .select("name, price, compare_at_price, description, sku, category, tags, images, stock_quantity, track_inventory, weight_grams, is_active, is_featured, slug, external_id")
      .eq("business_id", biz.id)
      .eq("is_bundle", false)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: "Eroare la export." }, { status: 500 });
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const header = [
    "Nume", "Pret", "Pret vechi", "Descriere", "SKU", "Categorie", "Etichete",
    "Imagini", "Stoc", "Greutate", "Publicat", "Recomandat", "Slug", "ID extern",
  ];

  const lines = [header.map(csvCell).join(",")];
  for (const p of rows) {
    const images = Array.isArray(p.images) ? (p.images as string[]).filter(Boolean) : [];
    const tags = Array.isArray(p.tags) ? (p.tags as string[]).filter(Boolean) : [];
    const tracked = p.track_inventory === true;
    lines.push([
      csvCell(p.name as string),
      num(p.price as number),
      num(p.compare_at_price as number | null),
      csvCell(p.description as string | null),
      csvCell(p.sku as string | null),
      csvCell(categoryPath(p.category as string | null)),
      csvCell(tags.join(", ")),
      csvCell(images.join(" | ")),
      tracked ? num(p.stock_quantity as number | null) : "",
      p.weight_grams != null ? `${p.weight_grams} g` : "",
      p.is_active ? "Da" : "Nu",
      p.is_featured ? "Da" : "Nu",
      csvCell(p.slug as string | null),
      csvCell(p.external_id as string | null),
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
