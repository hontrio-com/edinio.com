/**
 * Ce s-a CERUT sa fie publicat, tinut minte separat de ce a apucat sa intre in coada.
 *
 * ═══ ⚠ O PUNERE LA COADA PICATA PIERDEA INTENTIA PENTRU TOTDEAUNA ═══
 *
 * Lantul era: produsul se salveaza, apoi `enqueue…` il pune la coada. Salvarea reuseste, iar
 * punerea la coada e un efect lateral care se poate rata — plan depasit, politica, o pana de o
 * clipa a bazei. Am facut ca refuzul sa se VADA (`throw` in `inghiteDarScrie`), dar pierderea
 * ramanea pierdere: nimic nu mai relua lucrarea.
 *
 * ⚠ SI NU SE POATE PRESUPUNE. „Produs fara listare, deci publica-l" ar fi cea mai fireasca
 * plasa — si e gresita: cele mai multe produse fara listare sunt chiar produse pe care
 * comerciantul nu le-a vrut niciodata acolo. Plasa aia ar publica intreg catalogul.
 *
 * De-aia se scrie INTENTIA: „la ora asta, pentru produsul asta, s-a cerut publicarea pe
 * marketplace-ul asta". Randul se scrie o data si se sterge doar cand exista dovada ca s-a
 * facut — nu cand am crezut noi.
 *
 * ⚠ SE SCRIE INAINTEA COZII, dinadins. Invers, o pana intre cele doua ar pierde exact cazul
 * pentru care exista tabela.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";

type Db = SupabaseClient<Database>;

export type MarketplacePublicare = "trendyol" | "emag" | "aboutyou";
export type SursaPublicare = "auto_publish" | "import" | "manual";

/**
 * Noteaza ca s-a cerut publicarea.
 *
 * ⚠ NU ARUNCA. E o plasa de siguranta: daca nici ea nu se poate scrie, lucrarea principala
 * (salvarea produsului) n-are de ce sa pice. Se scrie in jurnal si se merge mai departe.
 *
 * ⚠ `ignoreDuplicates`: o a doua cerere pentru acelasi produs nu are ce adauga, iar un upsert
 * care rescrie ar sterge `incercari` si `ultima_eroare` — adica tocmai istoria din care se vede
 * ca ceva nu merge.
 */
export async function noteazaIntentia(
  admin: Db,
  p: { businessId: string; productIds: string[]; marketplace: MarketplacePublicare; sursa?: SursaPublicare },
): Promise<void> {
  const ids = [...new Set(p.productIds.filter(Boolean))];
  if (ids.length === 0) return;
  try {
    const { error } = await admin.from("intentii_publicare").upsert(
      ids.map((product_id) => ({
        business_id: p.businessId,
        product_id,
        marketplace: p.marketplace,
        sursa: p.sursa ?? "auto_publish",
      })) as never,
      { onConflict: "business_id,product_id,marketplace", ignoreDuplicates: true },
    );
    if (error) throw error;
  } catch (e) {
    await logError({
      action: `${p.marketplace}/intentie-publicare`,
      message: `intentia de publicare nu s-a putut nota: ${e instanceof Error ? e.message : String(e)}`,
      details: { cate: ids.length, sursa: p.sursa ?? "auto_publish" },
      businessId: p.businessId, severity: "warning",
    });
  }
}

/**
 * Intentia s-a implinit: exista listare, sau produsul a plecat.
 *
 * ⚠ SE MARCHEAZA, NU SE STERGE. Randul ramane ca urma a ce s-a cerut si cand — util cand
 * comerciantul intreaba de ce un produs a ajuns acolo.
 */
export async function inchideIntentia(
  admin: Db, businessId: string, productIds: string[], marketplace: MarketplacePublicare,
): Promise<void> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return;
  const acum = new Date().toISOString();
  await admin.from("intentii_publicare")
    .update({ rezolvat_la: acum, ultima_eroare: null, updated_at: acum } as never)
    .eq("business_id", businessId).eq("marketplace", marketplace)
    .is("rezolvat_la", null).in("product_id", ids);
}

export interface IntentieNeimplinita {
  id: string;
  product_id: string;
  incercari: number;
}

/**
 * Cererile care inca n-au ajuns nicaieri.
 *
 * ⚠ CU PLAFON DE INCERCARI. Un produs care nu se poate publica — fara categorie mapata, fara
 * marca — n-are rost sa fie reluat la nesfarsit: ar arde bugetul de cereri al magazinului
 * pentru ceva ce numai omul poate repara. Dupa plafon randul ramane, cu eroarea scrisa, si se
 * vede in panou.
 */
export async function intentiiNeimplinite(
  admin: Db, businessId: string, marketplace: MarketplacePublicare, limita = 20,
): Promise<IntentieNeimplinita[]> {
  const { data, error } = await admin
    .from("intentii_publicare").select("id, product_id, incercari")
    .eq("business_id", businessId).eq("marketplace", marketplace)
    .is("rezolvat_la", null).lt("incercari", MAX_INCERCARI)
    .order("cerut_la", { ascending: true })
    .limit(limita);
  /* ⚠ O citire picata NU inseamna „nicio intentie": ar fi facut plasa sa taca exact cand baza
     clipeste, adica exact cand se pierd puneri la coada. */
  if (error) throw error;
  return (data ?? []) as IntentieNeimplinita[];
}

/** Dupa atatea incercari, plasa se opreste si lasa randul vizibil. */
export const MAX_INCERCARI = 5;

/** O incercare s-a consumat, si se tine minte de ce n-a mers. */
export async function insemneazaIncercarea(
  admin: Db, id: string, incercariAcum: number, eroare: string | null,
): Promise<void> {
  await admin.from("intentii_publicare")
    .update({ incercari: incercariAcum + 1, ultima_eroare: eroare, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
}
