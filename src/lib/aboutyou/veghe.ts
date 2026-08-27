/**
 * Veghea: produsele cu istoric de lot orb, tinute sub observatie.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ O SINGURA PRIVIRE NU DOVEDESTE CA UN LOT ORB S-A TERMINAT (27.08.2026, noaptea)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Un lot ORB — trimis, cu raspunsul pierdut — se lamurea pana acum CITIND o data ce au ei
 * (`derivaFataDeEi`). Daca la ei era deja starea de acum, lotul se inchidea ca `depasit` si nu se
 * mai revenea niciodata.
 *
 * ⚠ DAR LOTUL ALA SE POATE ASEZA LA EI SI DUPA CITIREA NOASTRA. Loturile lor se prelucreaza
 * asincron, iar in contractul lor public nu scrie nicaieri ca doua loturi diferite se aseaza in
 * ordinea trimiterii:
 *
 *     10:00  GEN 10 pleaca, raspunsul se pierde   -> `necunoscut`
 *     10:05  GEN 11 pleaca si se incheie          -> la ei e starea noua ✅
 *     10:10  citim: identic                       -> inchidem GEN 10
 *     11:30  GEN 10 se aseaza in sfarsit          -> la ei e IAR starea veche ❌
 *
 * Si de la 11:30 incolo nu mai exista nimic care sa observe asta.
 *
 * ⚠ RASPUNSUL NU E O CITIRE MAI DESTEAPTA, E MAI MULTE CITIRI, raspandite in timp. Produsul intra
 * sub veghe, iar veghea nu se stinge la prima citire curata — ci dupa cateva la rand, si dupa ce
 * fereastra s-a scurs.
 *
 * ⚠ SI ARE UN CAPAT. Dupa cateva retrimiteri care nu au adus convergenta, se striga o singura data
 * si se inceteaza retrimiterea: o bucla care se reia la nesfarsit costa o cerere la fiecare
 * trecere si nu repara nimic. Vezi `PRAG_REASERTARI`.
 *
 * ⚠ CE NU FACE FISIERUL ASTA: nu citeste nimic de la About You si nu compara nimic. Aici sta doar
 * cand se uita si cat tine veghea; comparatia e `derivaFataDeEi` din `sync.ts`. Despartirea nu e
 * de dragul curateniei — asa `sync.ts` poate importa de aici fara sa se nasca un cerc.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { randuriCitite } from "@/lib/supabase/rand-citit";

type Db = SupabaseClient<Database>;

/** Cat tine veghea de la ultima deriva gasita. */
export const FEREASTRA_VEGHE_MS = 48 * 60 * 60 * 1000;

/**
 * Cate citiri CURATE LA RAND inchid veghea.
 *
 * ⚠ Una singura era chiar defectul: „la ei e deja starea buna" nu spune nimic despre ce se aseaza
 * peste zece minute.
 */
export const PRAG_CURATE = 3;

/**
 * Cate retrimiteri se fac inainte de a striga dupa un om.
 *
 * ⚠ O deriva care nu se inchide dupa atatea retrimiteri nu e o cursa, e altceva: o mapare
 * respinsa, o valoare pe care ei o normalizeaza altfel, un camp pe care il comparam gresit.
 * Retrimis mai departe, ar fi o roata care se invarte la nesfarsit si acopera cauza.
 */
export const PRAG_REASERTARI = 5;

/** Cate veghi se duc la capat intr-o trecere, pe magazin. Fiecare costa o citire la ei. */
export const MAX_VEGHI_PE_TRECERE = 10;

export interface RandVeghe {
  id: string;
  business_id: string;
  style_key: string;
  product_id: string | null;
  motiv: string;
  pana_la: string;
  curate_la_rand: number;
  reasertari: number;
  verificari: number;
  alarma_scrisa_la: string | null;
}

/**
 * Peste cat se uita din nou.
 *
 * ⚠ RAR SI TOT MAI RAR. Primele citiri sunt dese, fiindca acolo e cel mai probabil sa se aseze
 * lotul vechi; pe urma se raresc, fiindca o veghe de doua zile la un sfert de ora ar insemna
 * aproape doua sute de cereri pentru un singur produs.
 */
export function urmatoareaVerificareMs(curateLaRand: number): number {
  const UN_SFERT = 15 * 60 * 1000;
  const SASE_ORE = 6 * 60 * 60 * 1000;
  return Math.min(SASE_ORE, UN_SFERT * 2 ** Math.max(0, curateLaRand));
}

/**
 * Veghea s-a terminat: fereastra s-a scurs SI ultimele citiri au fost curate.
 *
 * ⚠ AMANDOUA CONDITIILE. Numai fereastra ar inchide o veghe care tocmai a gasit deriva; numai
 * sirul curat ar inchide-o la un ceas dupa pornire, adica exact prea devreme.
 */
export function vegheaSAIncheiat(
  r: { pana_la: string; curate_la_rand: number }, acum = Date.now(),
): boolean {
  return Date.parse(r.pana_la) <= acum && r.curate_la_rand >= PRAG_CURATE;
}

/**
 * Pune un produs sub veghe. Intoarce `false` daca n-a putut fi scris.
 *
 * ⚠ RASPUNSUL SE CITESTE LA APELANT, si acolo hotaraste daca lotul se mai poate inchide. Scrisa
 * pe tacute, veghea ar fi o promisiune goala tocmai in clipa in care stim ca produsul e in
 * primejdie.
 *
 * ⚠ NU SCURTEAZA O VEGHE CARE MERGE. `pana_la` se duce inainte, niciodata inapoi: un al doilea
 * motiv aparut peste unul vechi nu are voie sa taie observatia care era deja pornita.
 */
export async function pornesteVeghea(
  admin: Db, businessId: string, styleKey: string, productId: string | null, motiv: string,
): Promise<boolean> {
  const acum = Date.now();
  const panaLa = new Date(acum + FEREASTRA_VEGHE_MS).toISOString();

  const { data, error } = await admin
    .from("aboutyou_veghe").select("id, pana_la")
    .eq("business_id", businessId).eq("style_key", styleKey).maybeSingle();
  if (error) return false;

  if (data) {
    const veche = Date.parse((data as { pana_la: string }).pana_la);
    const { error: eUpd } = await admin.from("aboutyou_veghe").update({
      /* ⚠ Numai in fata: vezi nota de mai sus. */
      pana_la: Number.isFinite(veche) && veche > acum + FEREASTRA_VEGHE_MS
        ? (data as { pana_la: string }).pana_la : panaLa,
      motiv,
      product_id: productId,
      updated_at: new Date(acum).toISOString(),
    } as never).eq("id", (data as { id: string }).id);
    return !eUpd;
  }

  const { error: eIns } = await admin.from("aboutyou_veghe").insert({
    business_id: businessId, style_key: styleKey, product_id: productId, motiv,
    pana_la: panaLa,
    urmatoarea_verificare: new Date(acum + urmatoareaVerificareMs(0)).toISOString(),
  } as never);
  /*
   * ⚠ O cursa cu alta instanta care tocmai a pornit aceeasi veghe nu e un esec: cheia unica a
   * respins randul al doilea, dar veghea EXISTA — si asta era tot ce ceream.
   */
  if (eIns && (eIns as { code?: string }).code === "23505") return true;
  return !eIns;
}

/** Veghile scadente ale unui magazin, cele mai vechi intai. */
export async function veghiScadente(
  admin: Db, businessId: string, limita = MAX_VEGHI_PE_TRECERE,
): Promise<RandVeghe[]> {
  return randuriCitite<RandVeghe>("aboutyou.veghiScadente", await admin
    .from("aboutyou_veghe")
    .select("id, business_id, style_key, product_id, motiv, pana_la, curate_la_rand, reasertari, verificari, alarma_scrisa_la")
    .eq("business_id", businessId)
    .lte("urmatoarea_verificare", new Date().toISOString())
    .order("urmatoarea_verificare", { ascending: true })
    .limit(limita) as never);
}
