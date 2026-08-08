import { orSafeTerm } from "@/lib/orders/pagination";
import type { PostgrestFilterBuilder } from "@supabase/postgrest-js";

/**
 * Filtrele listei de produse din panou, dintr-un singur loc.
 *
 * Pana acum traiau in `ProductsClient`, peste TOT catalogul adus in browser: la
 * eSAFE inseamna 4,9 MB de randuri ca sa se arate douazeci si cinci. Mutate pe
 * server, aceleasi reguli trebuie scrise in SQL — iar scrise si acolo si aici, ar
 * fi doua raspunsuri la aceeasi intrebare. De aia stau in fisierul asta, si le
 * folosesc si pagina (pentru o pagina de randuri), si actiunea care intoarce
 * id-urile pentru „selecteaza tot".
 *
 * Sunt copiate LITERAL din memo-ul `filtered` de dinainte, cu aceleasi ciudatenii:
 * cautarea prinde nume/categorie/SKU, iar „fara stoc" inseamna
 * `track_inventory && (stock_quantity ?? 0) <= 0` — deci un produs care nu tine
 * socoteala stocului nu e niciodata „fara stoc", oricat de gol ar fi.
 */

export interface FiltreProduse {
  cautare: string;
  categorie: string;
  stare: "all" | "active" | "inactive";
  stoc: "all" | "in" | "out";
  pagina: number;
}

export const PRODUSE_PE_PAGINA = 25;

function unul(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export function citesteFiltreProduse(sp: Record<string, string | string[] | undefined>): FiltreProduse {
  const stare = unul(sp.stare);
  const stoc = unul(sp.stoc);
  const pagina = parseInt(unul(sp.page), 10);
  return {
    cautare: unul(sp.search).slice(0, 100),
    categorie: unul(sp.cat).slice(0, 200),
    stare: stare === "active" || stare === "inactive" ? stare : "all",
    stoc: stoc === "in" || stoc === "out" ? stoc : "all",
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

/**
 * Categoria plus copiii ei DIRECTI — un singur nivel.
 *
 * Nu recursiv, si nu din greseala: asa facea `subtreeByName` in browser, iar
 * catalogul public foloseste alt ajutator, recursiv (`numeSubarbore`). Adus aici
 * pe cel recursiv, filtrul din panou ar fi inceput sa arate alte produse decat
 * pana acum, fara ca nimeni sa fi cerut asta.
 */
export function subarboreUnNivel(
  categories: { id: string; name: string; parent_id: string | null }[],
  nume: string,
): string[] {
  const parinte = categories.find((c) => c.name === nume);
  if (!parinte) return [nume];
  return [nume, ...categories.filter((c) => c.parent_id === parinte.id).map((c) => c.name)];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Interogare = PostgrestFilterBuilder<any, any, any, any, any>;

/**
 * Aplica filtrele pe o interogare de `products`, oricare ar fi coloanele cerute.
 *
 * Aceeasi functie pentru pagina de randuri si pentru lista de id-uri, ca „ce se
 * vede" si „ce se selecteaza cu Selecteaza tot" sa nu se poata despartI niciodata.
 */
export function aplicaFiltreProduse(
  q: Interogare,
  filtre: FiltreProduse,
  categories: { id: string; name: string; parent_id: string | null }[],
): Interogare {
  // Pachetele au pagina lor; lista de produse nu le-a aratat niciodata.
  let out = q.eq("is_bundle", false);

  const termen = orSafeTerm(filtre.cautare);
  if (termen) {
    out = out.or(`name.ilike.%${termen}%,category.ilike.%${termen}%,sku.ilike.%${termen}%`);
  }
  if (filtre.categorie) {
    out = out.in("category", subarboreUnNivel(categories, filtre.categorie));
  }
  if (filtre.stare === "active") out = out.eq("is_active", true);
  if (filtre.stare === "inactive") out = out.eq("is_active", false);

  /*
   * „Fara stoc" = tine socoteala SI a ajuns la zero. `stock_quantity` NULL
   * inseamna zero (in browser era `?? 0`), deci intra si el — iar `lte` singur ar
   * fi sarit peste NULL, fiindca in SQL orice comparatie cu NULL da necunoscut.
   */
  if (filtre.stoc === "out") {
    out = out.eq("track_inventory", true).or("stock_quantity.lte.0,stock_quantity.is.null");
  }
  if (filtre.stoc === "in") {
    out = out.or("track_inventory.eq.false,track_inventory.is.null,stock_quantity.gt.0");
  }
  return out;
}

/**
 * Ordinea listei, identica cu sortarea din browser, plus departajare pe `id`.
 *
 * `id`-ul la sfarsit nu e cosmetic: felierea se face acum in SQL, cu LIMIT/OFFSET,
 * iar fara ordine TOTALA doua cereri pentru pagini diferite pot aseza altfel
 * randurile egale — un produs apare pe doua pagini si altul pe niciuna. Aceeasi
 * lectie ca la catalogul public (lib/storefront/catalog/sortare.ts).
 */
export function ordoneazaProduse(q: Interogare): Interogare {
  return q
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
}
