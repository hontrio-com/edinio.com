import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { CatalogEntry, CatalogVariant, StockMatchKey } from "./types";

/**
 * Incarca din catalog exact atat cat ii trebuie potrivirii.
 *
 * Doua lucruri de stiut inainte sa umbli aici:
 *
 * 1. **`fetchAllRows`, nu un `select` simplu.** Supabase taie SILENTIOS la 1000
 *    de randuri. Cu un magazin de 1200 de produse, ultimele 200 ar fi raportate
 *    ca negasite si feedul ar parea ca minte.
 *
 * 2. **`page_sections` se cere doar cand chiar trebuie.** Coloana tine si
 *    descrierile, deci pentru un catalog mare inseamna cativa megabytes. O
 *    aducem doar pentru cheile care au nevoie de variante sau de EAN.
 */

type Client = SupabaseClient<Database>;

/** Cheile care au nevoie de continutul din `page_sections`. */
function needsPageSections(matchKey: StockMatchKey): boolean {
  return matchKey === "sku_auto" || matchKey === "variant_sku" || matchKey === "gtin";
}

interface PageSectionsShape {
  variants?: {
    enabled?: boolean;
    combinations?: {
      id?: string;
      title?: string;
      sku?: string;
      stock_quantity?: number;
      price?: number;
    }[];
  };
  google?: { gtin?: string };
}

function readVariants(raw: unknown): CatalogVariant[] {
  const ps = raw as PageSectionsShape | null;
  const combos = ps?.variants?.combinations;
  if (!Array.isArray(combos)) return [];

  const out: CatalogVariant[] = [];
  for (const c of combos) {
    /* Fara id nu avem cum sa scriem inapoi in acelasi loc, deci o sarim. */
    if (!c || typeof c.id !== "string" || c.id === "") continue;
    out.push({
      id: c.id,
      title: typeof c.title === "string" ? c.title : c.id,
      sku: typeof c.sku === "string" && c.sku.trim() !== "" ? c.sku : null,
      stock_quantity: Number.isFinite(c.stock_quantity) ? Number(c.stock_quantity) : 0,
      price: Number.isFinite(c.price) ? Number(c.price) : 0,
    });
  }
  return out;
}

function readGtin(raw: unknown): string | null {
  const ps = raw as PageSectionsShape | null;
  const gtin = ps?.google?.gtin;
  return typeof gtin === "string" && gtin.trim() !== "" ? gtin : null;
}

export async function loadCatalog(
  client: Client,
  businessId: string,
  matchKey: StockMatchKey,
): Promise<CatalogEntry[]> {
  const withSections = needsPageSections(matchKey);
  const columns = withSections
    ? "id, name, sku, external_id, price, stock_quantity, track_inventory, page_sections"
    : "id, name, sku, external_id, price, stock_quantity, track_inventory";

  const rows = await fetchAllRows("stock-feed.catalog", (from, to) =>
    client
      .from("products")
      .select(columns)
      .eq("business_id", businessId)
      /* Ordonare stabila: fara ea, paginarea poate sari sau repeta randuri. */
      .order("id")
      .range(from, to),
  );

  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: typeof r.name === "string" ? r.name : "",
    sku: typeof r.sku === "string" && r.sku.trim() !== "" ? r.sku : null,
    external_id:
      typeof r.external_id === "string" && r.external_id.trim() !== "" ? r.external_id : null,
    gtin: withSections ? readGtin(r.page_sections) : null,
    price: Number(r.price ?? 0),
    stock_quantity: r.stock_quantity == null ? null : Number(r.stock_quantity),
    track_inventory: r.track_inventory === true,
    variants: withSections ? readVariants(r.page_sections) : [],
  }));
}
