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
      /* Poate fi si sir: vezi `readNumber`. */
      stock_quantity?: number | string;
      price?: number | string;
    }[];
  };
  google?: { gtin?: string };
}

/**
 * Un numar dintr-un JSON scris de mai multe generatii de cod.
 *
 * In baza reala, 696 din 14.326 de combinatii tin `stock_quantity` si `price` ca
 * SIR de caractere, nu ca numar. `Number.isFinite("5")` e `false`, deci varianta
 * scurta le-ar fi citit pe toate ca 0. Nu s-ar fi stricat date, dar
 * previzualizarea ar fi aratat sute de modificari inchipuite, de la 0 la valoarea
 * adevarata, si ar fi ascuns exact schimbarile care conteaza.
 *
 * Sirul gol devine `fallback`: `Number("")` da 0, si asta si inseamna acolo.
 */
function readNumber(value: unknown, fallback: number): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const text = String(value ?? "").trim();
  if (text === "") return fallback;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Exportata pentru teste: aici a fost bug-ul cu numerele scrise ca sir. */
export function readVariants(raw: unknown): CatalogVariant[] {
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
      stock_quantity: readNumber(c.stock_quantity, 0),
      price: readNumber(c.price, 0),
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

  /*
   * Cate produse ar TREBUI sa fie. Comparatia de mai jos nu e paranoia.
   *
   * `fetchAllRows` e scris sa fie iertator: daca o fereastra eșueaza la mijlocul
   * paginarii, scrie in consola si intoarce cate randuri a strans pana atunci. E
   * potrivit pentru un sitemap sau un export, unde un rezultat incomplet e mai
   * bun decat nimic.
   *
   * Aici nu e. Un catalog incomplet inseamna produse care EXISTA, dar nu apar in
   * index, deci randurile lor din feed ar fi raportate drept negasite. Nu s-ar
   * scrie nimic greșit, dar omul ar primi un ecran plin de probleme inchipuite si
   * ar crede ca fisierul lui e de vina.
   *
   * Mai bine o eroare limpede decat un plan calculat pe jumatate de catalog.
   */
  const { count, error: countError } = await client
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);

  if (countError) throw new Error(`Nu am putut numara produsele: ${countError.message}`);

  const rows = await fetchAllRows("stock-feed.catalog", (from, to) =>
    client
      .from("products")
      .select(columns)
      .eq("business_id", businessId)
      /* Ordonare stabila: fara ea, paginarea poate sari sau repeta randuri. */
      .order("id")
      .range(from, to),
  );

  const expected = count ?? 0;
  if (rows.length < expected) {
    throw new Error(
      `Catalogul s-a citit doar pe jumatate (${rows.length} din ${expected} produse). Incearca din nou.`,
    );
  }

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
