import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import type { OlxConfig } from "./types";

// Enqueue an OLX sync for a product when the store has OLX connected with
// auto-sync on. Fire-and-forget — never throws into the caller (used from
// product/order actions, which must not break if OLX is down).
/**
 * ⚠ ESECURILE DE AICI SE SCRIU, NU SE INGHIT.
 *
 * Punerea la coada e „fire-and-forget": n-are voie sa arunce in apelant, fiindca
 * o pana la marketplace nu trebuie sa impiedice salvarea unui produs in magazin.
 * Dar „nu arunca" a insemnat multa vreme `catch {}` gol, adica un esec fara
 * nicio urma nicaieri.
 *
 * S-a vazut ce costa: un comerciant a schimbat pretul la 1051 de produse
 * (21.08), cererea de punere la coada a cazut, si nimeni n-a aflat. Preturile
 * s-au schimbat in magazin, la marketplace au ramas cele vechi, iar in panou nu
 * scria nimic. A fost gasit abia cand a intrebat el, dupa o zi.
 *
 * ═══ ⚠ SI `catch` NU PRINDEA NIMIC (29.08.2026, noaptea) ═══
 *
 * Nota de mai sus era scrisa de mult si suna ca o problema rezolvata. Nu era: `supabase-js` NU
 * arunca la o eroare PostgREST, o INTOARCE in `{ error }`. Iar niciuna din cele trei functii nu-l
 * citea. Deci `try/catch`-ul de aici pazea doar caderile de retea ale clientului — tocmai cazul
 * rar —, iar un refuz al bazei se scurgea in tacere, exact ca inainte de nota.
 *
 * Cel mai scump drum:
 *
 *     produs sters din Edinio -> trebuie un DELETE la OLX
 *     punerea la coada pica (RLS, coloana, orice) -> `{ error }` intors, nimeni nu-l citeste
 *     produsul dispare din magazin
 *     -> anuntul ramane ACTIV la OLX, si nimic nu mai stie de el ❌
 *
 * ⚠ Si citirea configului la fel: inghitita, `config` iesea `{}`, `connected` iesea fals, si
 * functia se intorcea linistita — adica „magazinul n-are OLX" spus pe baza unei pene.
 */
function scrieEsecul(unde: string, businessId: string, e: unknown): void {
  void logError({
    action: `olx.queue.${unde}`,
    message: e instanceof Error ? e.message : "Eroare necunoscuta la punerea in coada",
    details: { businessId },
    businessId,
    severity: "error",
  });
}

export async function enqueueOlxSync(
  businessId: string,
  productId: string | null,
  offerId: string,
  op: "upsert" | "delete",
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: ss, error: eConfig } = await admin
      .from("store_settings").select("olx_config").eq("business_id", businessId).single();
    /* ⚠ O pana nu inseamna „magazinul n-are OLX": aruncam, ca `scrieEsecul` s-o vada. */
    if (eConfig) throw new Error(`configul OLX nu s-a putut citi: ${eConfig.message}`);
    const config = (ss?.olx_config as OlxConfig) ?? {};
    if (!config.connected || !config.refresh_token) return;
    if (config.auto_sync === false) return;
    const { error: eCoada } = await admin.from("olx_sync_queue").upsert(
      { business_id: businessId, product_id: productId, offer_id: offerId, op },
      { onConflict: "business_id,offer_id,op" },
    );
    /* ⚠ `supabase-js` NU arunca la o eroare PostgREST: o intoarce. Vezi nota de sus. */
    if (eCoada) throw new Error(`punerea in coada OLX a picat: ${eCoada.message}`);
  } catch (e) {
    scrieEsecul("coada", businessId, e);
  }
}

// Batch upsert-enqueue (one config check). Used after orders (stock changes on
// several products at once). Non-throwing.
export async function enqueueOlxSyncMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  try {
    const ids = [...new Set(productIds.filter((x): x is string => !!x))];
    if (ids.length === 0) return;
    const admin = createAdminClient();
    const { data: ss, error: eConfig } = await admin
      .from("store_settings").select("olx_config").eq("business_id", businessId).single();
    if (eConfig) throw new Error(`configul OLX nu s-a putut citi: ${eConfig.message}`);
    const config = (ss?.olx_config as OlxConfig) ?? {};
    if (!config.connected || !config.refresh_token || config.auto_sync === false) return;
    const { error: eCoada } = await admin.from("olx_sync_queue").upsert(
      ids.map((id) => ({ business_id: businessId, product_id: id, offer_id: id, op: "upsert" })),
      { onConflict: "business_id,offer_id,op" },
    );
    /* ⚠ `supabase-js` NU arunca la o eroare PostgREST: o intoarce. Vezi nota de sus. */
    if (eCoada) throw new Error(`punerea in coada OLX a picat: ${eCoada.message}`);
  } catch (e) {
    scrieEsecul("coada", businessId, e);
  }
}

/**
 * Retragerea IN MASA a produselor sterse.
 *
 * ═══ ⚠ ERAU 340 DE CHEMARI, FIECARE CU CITIREA EI DE CONFIG (27.08.2026) ═══
 *
 * Stergerea in masa punea la coada cate un element PE PRODUS, pe fiecare integrare:
 * `for (const id of ids) dupaRaspuns(() => enqueue…(businessId, null, id, "delete"))`. La 340 de
 * produse × 4 integrari inseamna 1360 de chemari, fiecare citind din nou setarile magazinului.
 *
 * ⚠ SI SE INTAMPLA DUPA RASPUNS, cu `after`, care tine instanta pana se termina. Peste durata
 * maxima a functiei, ce n-a apucat se TAIE — iar ce se taie sunt tocmai retragerile: produsul e
 * sters la noi si ramane la vanzare pe marketplace, tacut.
 *
 * O citire de config, un lot de scriere. Aceeasi treaba, de 340 de ori mai putine drumuri.
 *
 * ⚠ `product_id` E NULL, si nu din neglijenta: randul se scrie DUPA ce produsul a fost sters, deci
 * o legatura spre el ar arata catre un rand care nu mai exista. `offer_id` poarta id-ul, si el e
 * tot ce trebuie ca sa se stie ce se retrage.
 */
export async function enqueueOlxStergereMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  try {
    const ids = [...new Set(productIds.filter((x): x is string => !!x))];
    if (ids.length === 0) return;
    const admin = createAdminClient();
    const { data: ss, error: eConfig } = await admin
      .from("store_settings").select("olx_config").eq("business_id", businessId).single();
    if (eConfig) throw new Error(`configul OLX nu s-a putut citi: ${eConfig.message}`);
    const config = (ss?.olx_config as OlxConfig) ?? {};
    if (!config.connected || !config.refresh_token || config.auto_sync === false) return;
    const { error: eCoada } = await admin.from("olx_sync_queue").upsert(
      ids.map((id) => ({ business_id: businessId, product_id: null, offer_id: id, op: "delete" })),
      { onConflict: "business_id,offer_id,op" },
    );
    /* ⚠ `supabase-js` NU arunca la o eroare PostgREST: o intoarce. Vezi nota de sus. */
    if (eCoada) throw new Error(`punerea in coada OLX a picat: ${eCoada.message}`);
  } catch (e) {
    scrieEsecul("coada", businessId, e);
  }
}
