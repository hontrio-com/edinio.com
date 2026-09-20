import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { OfferTrigger } from "./offer.types";

/*
  ═══════════════════════════════════════════════════════════════════════════
  OFERTA „REDUCERE CANTITATE" SCRIE PRAGURILE PE PRODUSE
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ DE CE SE SCRIE, IN LOC SA SE CITEASCA LA AFISARE.

  Configuratia treptelor (`products.page_sections.quantity_tiers`) e citita din
  OPT locuri de pe calea pretului: pagina produsului, cosul, fereastra de
  comanda, poarta comenzii, editarea comenzii, cosul abandonat, exportul. Daca
  oferta s-ar rezolva la afisare, fiecare dintre ele ar fi trebuit sa stie si sa
  repete regula „produsul isi bate oferta" - opt copii ale aceleiasi hotarari,
  care se departeaza una de alta la prima retusare. Iar un loc uitat inseamna
  pret afisat diferit de pret incasat, adica exact defectul pe care
  `cart/pret-linie.ts` il povesteste in capul lui.

  Asa, calea pretului ramane neatinsa: citeste tot un singur camp. Oferta e doar
  cine l-a scris, si o spune prin `dinOferta`.

  ⚠ TOATA TREABA E O SINGURA FRAZA SQL (`aplica_praguri_oferta`), nu un `update`
  pe fiecare produs. Prima scriere trimitea cate o cerere de rand: la magazinul
  demo, cu 63 de produse, actiunea nu mai apuca sa raspunda si comutatorul din
  lista sarea inapoi - oferta parea ca nu se stinge. La eSafe, cu 3.351 de
  produse, ar fi fost 3.351 de dus-intors.
*/

export interface RezultatAplicare {
  scrise: number;
  sarite: number;
  retrase: number;
}

/**
 * Aduce produsele la zi cu oferta: scrie pragurile unde trebuie, le scoate de
 * unde nu mai trebuie.
 *
 * ⚠ SE RULEAZA SI LA STINGERE, nu doar la salvare. O oferta oprita care ar lasa
 * pragurile pe produse ar insemna o reducere pe care comerciantul crede ca a
 * oprit-o si care se incaseaza mai departe.
 */
export async function aplicaPraguriCantitate(
  supabase: SupabaseClient<Database>,
  businessId: string,
  offerId: string,
  trigger: OfferTrigger,
  praguri: { min_qty: number; percent: number }[],
  activa: boolean,
): Promise<RezultatAplicare> {
  const { data, error } = await supabase.rpc("aplica_praguri_oferta", {
    p_business: businessId,
    p_oferta: offerId,
    p_scope: trigger.scope,
    p_produse: trigger.scope === "products" ? trigger.productIds : [],
    p_categorii: trigger.scope === "categories" ? trigger.categories : [],
    p_praguri: praguri as never,
    p_activa: activa,
  });
  if (error) throw new Error(error.message);

  const r = (data ?? {}) as { scrise?: number; sarite?: number; retrase?: number };
  return {
    scrise: Number(r.scrise) || 0,
    sarite: Number(r.sarite) || 0,
    retrase: Number(r.retrase) || 0,
  };
}
