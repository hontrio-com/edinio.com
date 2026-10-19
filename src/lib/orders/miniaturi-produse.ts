import type { SupabaseClient } from "@supabase/supabase-js";
import { esteUuid } from "@/lib/supabase/ids";

/**
 * Miniaturile din „Produse comandate” (pagina comenzii, in panou): id-ul produsului -> prima lui poza.
 *
 * ⚠ LINIILE COMENZII NU POARTA IMAGINEA. `orders.items` tine nume, pret, cantitate si `product_id`
 * (masurat pe productie 19.10.2026: 1.362 de linii, nicio cheie de imagine). Deci poza vine din
 * catalogul de AZI, dupa aceeasi regula ca in contul cumparatorului (`cont_comanda_mea`,
 * `cont_comenzile_mele`): prima poza, numai cand e un sir. Doua reguli s-ar fi departat, iar
 * comerciantul ar fi vazut alta poza decat clientul la aceeasi linie.
 *
 * ⚠ Un produs sters, o extraoptiune (`extra_<id>`) sau o linie de marketplace nelegata de catalog n-au
 * poza: lipsesc din harta, iar ecranul pune pictograma de pana acum. Pe productie, 1.201 din 1.362 de
 * linii au gasit una.
 */

/** Cate id-uri pleaca intr-un `.in()`: lista sta in ADRESA cererii, nu in corp. */
const PE_CERERE = 100;

/** Id-urile de produs din liniile comenzii, fara dubluri, numai cele care chiar sunt UUID. */
export function idsProduseDinLinii(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  /*
   * ⚠ Numai UUID-urile: `product_id` e text liber in jsonb, iar un singur ne-UUID intr-un `.in()` face
   * PostgREST sa refuze TOT raspunsul (22P02), adica nicio miniatura pe toata comanda.
   */
  const ids = items.map((l) => (l && typeof l === "object" ? (l as { product_id?: unknown }).product_id : null));
  return [...new Set(ids.filter(esteUuid).map((id) => id.toLowerCase()))];
}

/** Poza unei linii din harta de mai jos, sau `null`. Cheile hartii sunt id-uri cu litere mici. */
export function pozaLiniei(harta: Record<string, string>, productId: unknown): string | null {
  return esteUuid(productId) ? harta[productId.toLowerCase()] ?? null : null;
}

/** Prima poza a produsului, ca in contul cumparatorului: `images[0]`, numai cand e un sir nevid. */
export function primaPoza(images: unknown): string | null {
  const p = Array.isArray(images) ? images[0] : null;
  return typeof p === "string" && p.trim() !== "" ? p.trim() : null;
}

/**
 * Harta id -> poza pentru liniile unei comenzi. Se cheama cu clientul COMERCIANTULUI: RLS il lasa sa-si
 * vada toate produsele, si pe cele inactive, iar `business_id` tine interogarea in magazinul lui.
 *
 * ⚠ O citire picata NU strica pagina comenzii: harta iese goala si fiecare linie isi pastreaza
 * pictograma. O poza lipsa e un neajuns, o pagina de comanda cazuta e o comanda pe care nu o poti
 * expedia.
 */
export async function miniaturileProduselor(
  supabase: SupabaseClient,
  businessId: string,
  items: unknown,
): Promise<Record<string, string>> {
  const ids = idsProduseDinLinii(items);
  if (ids.length === 0) return {};
  const felii: string[][] = [];
  for (let i = 0; i < ids.length; i += PE_CERERE) felii.push(ids.slice(i, i + PE_CERERE));
  try {
    const raspunsuri = await Promise.all(felii.map((felie) =>
      supabase.from("products").select("id, images").eq("business_id", businessId).in("id", felie)));
    const harta: Record<string, string> = {};
    for (const { data, error } of raspunsuri) {
      if (error) {
        console.error("[comanda] miniaturile produselor", error.message);
        continue;
      }
      for (const p of (data ?? []) as { id: string; images: unknown }[]) {
        const poza = primaPoza(p.images);
        if (poza) harta[p.id.toLowerCase()] = poza;
      }
    }
    return harta;
  } catch (e) {
    console.error("[comanda] miniaturile produselor", (e as Error).message);
    return {};
  }
}
