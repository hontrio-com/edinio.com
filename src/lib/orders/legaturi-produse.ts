import type { SupabaseClient } from "@supabase/supabase-js";
import { idsProduseDinLinii } from "@/lib/orders/miniaturi-produse";
import { esteUuid } from "@/lib/supabase/ids";

/**
 * Legaturile din „Produse comandate” (pagina comenzii, in panou): id-ul produsului -> pagina lui
 * din magazin. Cerut de proprietar pe 25.11.2026: „vreau sa poti da click pe denumirea produsului
 * si sa te trimita pe pagina produsului in magazin”.
 *
 * ⚠ LINIA COMENZII NU POARTA ADRESA, doar `product_id`. Adresa se compune din catalogul de AZI
 * (slugul produsului) si din radacina publica a magazinului, cu prefixul lui de produse
 * (`permalinkuri`). Se cere slugul, nu se trimite id-ul: pagina publica primeste si id-ul, dar
 * raspunde cu o redirectionare, iar un produs sters intre timp ar duce la o pagina de negasit.
 *
 * ⚠ NUMAI PRODUSELE ACTIVE. Pagina publica a unui produs dezactivat raspunde „negasit”
 * (`pagina-produs.tsx`), deci o legatura catre el ar fi una moarta. Linia isi arata atunci
 * numele ca text, ca si extraoptiunile (`extra_<id>`) si liniile de marketplace nelegate de
 * catalog.
 */

/** Cate id-uri pleaca intr-un `.in()`: lista sta in ADRESA cererii, nu in corp. */
const PE_CERERE = 100;

/** Legatura unei linii din harta de mai jos, sau `null`. Cheile hartii sunt id-uri cu litere mici. */
export function legaturaLiniei(harta: Record<string, string>, productId: unknown): string | null {
  return esteUuid(productId) ? harta[productId.toLowerCase()] ?? null : null;
}

/**
 * Din harta id -> slug face harta id -> adresa publica.
 *
 * @param radacinaProduse Radacina paginilor de produs, FARA bara la capat:
 *   `https://magazin.ro/produs` sau `https://www.edinio.com/casa-lumen/product`.
 */
export function legaturiDinSluguri(sluguri: Record<string, string>, radacinaProduse: string): Record<string, string> {
  const radacina = radacinaProduse.replace(/\/+$/, "");
  const legaturi: Record<string, string> = {};
  if (!radacina) return legaturi;
  for (const [id, slug] of Object.entries(sluguri)) {
    /* Slugul e scris de platforma, dar ajunge intr-un `href`: se codeaza ca segment de cale. */
    if (slug) legaturi[id] = `${radacina}/${encodeURIComponent(slug)}`;
  }
  return legaturi;
}

/**
 * Harta id -> slug pentru produsele ACTIVE din liniile unei comenzi. Se cheama cu clientul
 * COMERCIANTULUI, iar `business_id` tine interogarea in magazinul lui.
 *
 * ⚠ O citire picata NU strica pagina comenzii: harta iese goala si numele raman text. O
 * legatura lipsa e un neajuns, o pagina de comanda cazuta e o comanda pe care nu o poti expedia.
 */
export async function sluguriProduselor(
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
      supabase.from("products").select("id, slug, is_active").eq("business_id", businessId).in("id", felie)));
    const harta: Record<string, string> = {};
    for (const { data, error } of raspunsuri) {
      if (error) {
        console.error("[comanda] legaturile produselor", error.message);
        continue;
      }
      for (const p of (data ?? []) as { id: string; slug: unknown; is_active: unknown }[]) {
        const slug = typeof p.slug === "string" ? p.slug.trim() : "";
        /* ⚠ `=== true`, nu „nu e fals": un produs fara steag nu se stie ca are pagina. */
        if (slug && p.is_active === true) harta[p.id.toLowerCase()] = slug;
      }
    }
    return harta;
  } catch (e) {
    console.error("[comanda] legaturile produselor", (e as Error).message);
    return {};
  }
}
