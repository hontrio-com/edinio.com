import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { curataTextSeo, SEO_DESCRIERE_CATEGORIE_MAX } from "@/lib/seo";

/** Ce afla ecranul Produse > Categorii despre descrierile pentru Google scrise pe categorii. */
export interface DescrieriPanou {
  /** id -> textul care se publica. Numai categoriile cu text propriu; lipsa = textul automat. */
  descrieri: Record<string, string>;
  /**
   * `false` = citirea a cazut, deci NU se stie ce e salvat. Panoul nu are voie sa spuna atunci
   * „text automat": ar fi o afirmatie falsa despre o categorie care poate avea text scris.
   */
  citite: boolean;
}

/**
 * Descrierile pentru Google ale categoriilor unui magazin, pentru ecranul din panou.
 *
 * ═══ ⚠ SEPARAT DE LISTA CATEGORIILOR, SI TOLERANT ═══
 *
 * Coloana nu intra in selectul listei (`categories/page.tsx`): o coloana necunoscuta pica TOATA
 * interogarea (42703), iar lista citita bland ar fi iesit goala, adica „Nicio categorie creata"
 * pe toate magazinele. Comerciantul si-ar fi refacut de mana categoriile pe care le avea. Asa,
 * inaintea migratiei (sau la orice alta eroare) cade doar citirea de aici.
 *
 * ⚠ CITIRE COMPLETA SAU NIMIC (`fetchAllRowsStrict`), nu blanda: o fereastra pierduta ar fi
 * aratat pe jumatate din categorii eticheta gri, adica „text automat", peste un text scris. Iar
 * editorul ar fi pornit gol pe ele. La eroare, `citite: false`, iar editorul o spune.
 *
 * Numai randurile cu text (`not.is.null`): de obicei sunt putine sau niciunul. Textul trece prin
 * `curataTextSeo(…, 300)`, ca in vitrina (`citesteSeoCategorie`), deci panoul arata exact ce se
 * publica, si pentru un text scris ocolind salvarea, direct prin PostgREST.
 */
export async function citesteDescrierileCategoriilor(
  supabase: Pick<SupabaseClient<Database>, "from">,
  businessId: string,
): Promise<DescrieriPanou> {
  try {
    const randuri = await fetchAllRowsStrict("dashboard.categories.descrieri", (from, to) =>
      supabase
        .from("categories")
        .select("id, seo_description")
        .eq("business_id", businessId)
        .not("seo_description", "is", null)
        .order("id")
        .range(from, to),
    );
    const descrieri: Record<string, string> = {};
    for (const r of randuri) {
      const text = curataTextSeo(r.seo_description, SEO_DESCRIERE_CATEGORIE_MAX);
      if (text) descrieri[r.id] = text;
    }
    return { descrieri, citite: true };
  } catch (e) {
    console.error("[categorii] descrierile pentru Google n-au putut fi citite:", e instanceof Error ? e.message : e);
    return { descrieri: {}, citite: false };
  }
}
