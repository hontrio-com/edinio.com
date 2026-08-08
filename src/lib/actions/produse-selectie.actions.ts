"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import {
  aplicaFiltreProduse, ordoneazaProduse, type FiltreProduse,
} from "@/lib/dashboard/produse-filtre";

/**
 * Id-urile TUTUROR produselor care trec de filtrele curente.
 *
 * DE CE EXISTA. „Selecteaza tot" din lista de produse nu a insemnat niciodata
 * „produsele de pe pagina asta": selecta tot ce trecea de filtre, peste toate
 * paginile, si alimenta actiunile in masa — inclusiv stergerea. Cat timp
 * browserul avea catalogul intreg, asta iesea dintr-un `filtered.map(...)`.
 *
 * Cu felierea mutata in SQL, lista din memorie e o pagina. Se putea alege intre
 * doua lucruri: sa se schimbe intelesul lui „selecteaza tot" (adica o unealta de
 * lucru in masa care nu mai lucreaza in masa), sau sa se ceara id-urile cand chiar
 * se apasa. Al doilea, si LA CERERE: pe incarcarea obisnuita a paginii nu costa
 * nimic, iar un id are 36 de octeti fata de ~1,5 kB cat are randul intreg — la
 * eSAFE, 120 kB in loc de 4,9 MB, si numai cand cineva apasa.
 *
 * ATENTIE, `"use server"` expune FIECARE export din fisier, si fiecare trebuie sa
 * fie o functie async. De aia aici nu sta nimic altceva.
 * Vezi [[use-server-expune-fiecare-export]].
 */
export async function idurileProduselorFiltrate(
  businessId: string,
  filtre: FiltreProduse,
): Promise<{ ids: string[] } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  /*
   * Proprietatea magazinului se verifica AICI, nu se ia pe incredere din
   * argument: o actiune de server poate fi chemata cu orice corp, de oriunde.
   * Vezi [[actiuni-server-manifest-global]].
   */
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  const categories = await fetchAllRowsStrict("dashboard.products.selectie.categorii", (from, to) =>
    supabase.from("categories").select("id, name, parent_id")
      .eq("business_id", businessId).order("id").range(from, to));

  /*
   * `fetchAllRows`, nu o singura citire: PostgREST taie SILENTIOS la 1000 de
   * randuri, iar aici taierea ar fi insemnat „selecteaza tot" care selecteaza o
   * mie — si apoi o stergere in masa care lasa restul in urma, fara sa spuna
   * nimic. Vezi [[postgrest-1000-row-cap]].
   */
  const randuri = await fetchAllRowsStrict("dashboard.products.selectie", (from, to) =>
    ordoneazaProduse(
      aplicaFiltreProduse(
        supabase.from("products").select("id").eq("business_id", businessId),
        filtre,
        categories,
      ),
    ).range(from, to));

  return { ids: (randuri as { id: string }[]).map((r) => r.id) };
}
