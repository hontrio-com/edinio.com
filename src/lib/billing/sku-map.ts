import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { idsDeCautat } from "@/lib/billing/invoice-lines";

/**
 * De unde se citesc codurile: clientul APELANTULUI, nu unul facut pe loc. Pe calea
 * automata apelantul are clientul de sistem; unul cu cookie-uri ar citi anonim si
 * ar pierde SKU-ul produselor dezactivate.
 */
export type SursaCoduri = { supabase: SupabaseClient<Database>; businessId: string };

/**
 * Codurile de articol ale produselor de pe o comanda, pentru toate cele trei case
 * de facturare.
 *
 * Era scrisa de trei ori, identic, si toate trei aveau aceleasi trei defecte:
 *
 * 1. Trimiteau in `.in("id", …)` toate id-urile din comanda, inclusiv
 *    `extra_<id>`. PostgREST refuza atunci TOT raspunsul cu 400, deci harta iesea
 *    goala si nicio linie nu mai primea cod.
 * 2. `error` nu era citit niciodata — doar un `try/catch` care nu se declanseaza,
 *    fiindca `supabase-js` nu arunca. Orice cadere trecea drept „n-are SKU-uri".
 * 3. Isi faceau singure clientul, cel cu cookie-urile utilizatorului, chiar si pe
 *    calea automata, unde apelantul are deja clientul de sistem: citirea rula
 *    atunci ANONIM, prin politica publica, deci un produs dezactivat sau un
 *    magazin nepublicat isi pierdea codul in tacere.
 *
 * Codul lipsa NU opreste emiterea: e best-effort de la bun inceput, iar un refuz
 * pe calea automata e mut, deci ar lasa comenzi tacit nefacturate. Se semnaleaza
 * doar CADEREA interogarii, prin `onWarn` — un produs fara SKU completat e
 * alegerea comerciantului, si sunt magazine intregi asa: un avertisment pe fiecare
 * emitere ar ineca tocmai semnalul care conteaza. `onWarn` e parametru, nu import,
 * fiindca `logError` e „use server" si ar face modulul neincarcabil in teste.
 */
export async function fetchSkuMap(
  supabase: SupabaseClient<Database>,
  businessId: string,
  items: { product_id?: string | null }[],
  onWarn?: (m: { message: string; details: Record<string, unknown> }) => void,
): Promise<Map<string, string>> {
  const ids = idsDeCautat(items);
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("products").select("id, sku").eq("business_id", businessId).in("id", ids);
  if (error) {
    onWarn?.({ message: error.message, details: { businessId, cerute: ids.length } });
    return new Map();
  }

  const skus = new Map<string, string>();
  for (const p of data ?? []) {
    if (p.sku) skus.set(p.id as string, String(p.sku));
  }
  return skus;
}
