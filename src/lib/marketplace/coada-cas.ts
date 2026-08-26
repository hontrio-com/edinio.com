import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";

/**
 * Scrierile intr-o coada de marketplace, cu COMPARE-AND-SET pe generatie.
 *
 * ═══ ⚠ FARA EA, O CERERE NOUA DISPARE SUB UNA VECHE ═══
 *
 * Cozile au `generation bigint` si un declansator care o creste la fiecare update. Rostul ei
 * e o singura intrebare: „randul pe care il scriu acum e chiar cel pe care l-am revendicat?"
 *
 * Fara ea:
 *
 *   10:00  omul schimba titlul       -> rand A in coada
 *   10:01  lucratorul revendica A si pleaca la furnizor (cateva secunde)
 *   10:01  omul schimba pretul       -> `upsert` peste acelasi rand, deci acum e B
 *   10:02  lucratorul termina A si face `delete where id = X`
 *
 * B DISPARE, desi n-a plecat niciodata. Comerciantul vede pretul schimbat in magazin si
 * vechi la furnizor, fara nicio eroare nicaieri — chiar felul de pierdere tacuta pe care
 * cozile astea exista sa-l impiedice.
 *
 * ⚠ CU `and generation = <cea revendicata>`, stergerea nu prinde nimic, iar randul B ramane
 * si se ia la trecerea urmatoare.
 *
 * ⚠ SI DE-AIA `revendica_din_coada` INTOARCE RANDUL INTREG (`to_jsonb(q.*)`): generatia era
 * deja acolo, doar ca lucratorul Trendyol n-o citea. Masurat pe 26.08.2026: coloana exista,
 * declansatorul exista, si toate scrierile erau `.eq("id", ...)` goale.
 */

type Db = SupabaseClient<Database>;

/**
 * Numele cozilor care au `generation`. Lista alba, ca la `revendica_din_coada`.
 *
 * ⚠ `aboutyou_sync_queue` a intrat pe 26.08.2026, si tot dupa o masuratoare: coloana si
 * declansatorul `trg_generatie` existau in baza, lucratorul trecea prin `revendica_din_coada`
 * (deci generatia venea deja in raspuns), si toate cinci scrierile lui erau `.eq("id", ...)`
 * goale. Exact starea in care era Trendyol in dimineata aceleiasi zile.
 */
export type NumeCoada = "trendyol_sync_queue" | "emag_sync_queue" | "aboutyou_sync_queue";

/** Ce trebuie sa poarte un element ca sa poata fi scris in siguranta. */
export interface ElementRevendicat {
  id: string;
  business_id: string;
  /**
   * Generatia de la revendicare.
   *
   * ⚠ Poate lipsi: `revendica_din_coada` intoarce randul intreg, dar un apelant vechi sau o
   * coada fara coloana ar da `undefined`. Atunci se scrie FARA paza — vezi `fara`.
   */
  generation?: number | null;
}

/**
 * Scrierea fara paza, cand nu stim generatia.
 *
 * ⚠ E O CADERE INAPOI, NU O SCURTATURA. Mai bine se scrie fara paza decat sa nu se scrie
 * deloc: un element care nu-si poate marca incercarea s-ar relua la nesfarsit. Dar se
 * intampla numai daca randul n-a venit prin `revendica_din_coada`.
 */
function fara(g: unknown): boolean {
  return !Number.isFinite(g as number);
}

/**
 * Sterge elementul, dar NUMAI daca nimeni nu l-a rescris intre timp.
 *
 * Intoarce `true` cand chiar s-a sters. `false` inseamna „a venit o cerere mai noua", si
 * atunci se elibereaza inchirierea ca ea sa poata fi luata imediat.
 */
export async function stergeDacaNeschimbat(
  admin: Db, coada: NumeCoada, el: ElementRevendicat,
): Promise<boolean> {
  if (fara(el.generation)) {
    await admin.from(coada).delete().eq("id", el.id);
    return true;
  }

  const { data, error } = await admin.from(coada)
    .delete().eq("id", el.id).eq("generation", el.generation!).select("id");

  if (error) {
    await logError({
      action: `${coada}/cas`,
      message: `elementul de coada n-a putut fi sters: ${error.message}`,
      details: { id: el.id }, businessId: el.business_id, severity: "warning",
    });
    return false;
  }

  if ((data ?? []).length > 0) return true;
  await elibereazaPentruCerereaNoua(admin, coada, el);
  return false;
}

/**
 * Scrie un petic peste element, dar NUMAI daca nimeni nu l-a rescris intre timp.
 *
 * ⚠ CEA MAI IMPORTANTA FOLOSIRE E ABANDONUL. Scris peste o cerere noua, ar opri-o definitiv
 * fara s-o fi incercat vreodata — iar `revendica_din_coada` sare peste `abandonat_la is not
 * null`, deci n-ar mai lua-o nimeni.
 */
export async function scrieDacaNeschimbat(
  admin: Db, coada: NumeCoada, el: ElementRevendicat, petic: Record<string, unknown>,
): Promise<boolean> {
  if (fara(el.generation)) {
    await admin.from(coada).update(petic as never).eq("id", el.id);
    return true;
  }

  const { data, error } = await admin.from(coada)
    .update(petic as never).eq("id", el.id).eq("generation", el.generation!).select("id");

  if (error) {
    await logError({
      action: `${coada}/cas`,
      message: `elementul de coada n-a putut fi actualizat: ${error.message}`,
      details: { id: el.id }, businessId: el.business_id, severity: "warning",
    });
    return false;
  }

  if ((data ?? []).length > 0) return true;
  await elibereazaPentruCerereaNoua(admin, coada, el);
  return false;
}

/**
 * Cererea noua nu asteapta expirarea inchirierii celei vechi.
 *
 * ⚠ Punerea la coada NU sterge `revendicat_pana` — dinadins: sters de acolo, un al doilea
 * lucrator ar putea revendica randul cat timp primul e inca in aer, si acelasi produs ar
 * pleca de doua ori. Deci curatarea o face lucratorul, DUPA ce a terminat, si numai cand
 * chiar vede o generatie mai noua.
 *
 * ⚠ `gt("generation", ...)` face conditia sigura: se elibereaza numai un rand care CHIAR a
 * fost rescris. Fara ea, s-ar putea desface inchirierea altcuiva.
 */
export async function elibereazaPentruCerereaNoua(
  admin: Db, coada: NumeCoada, el: ElementRevendicat,
): Promise<void> {
  if (fara(el.generation)) return;
  await admin.from(coada)
    .update({ revendicat_pana: null } as never)
    .eq("id", el.id).gt("generation", el.generation!);
}
