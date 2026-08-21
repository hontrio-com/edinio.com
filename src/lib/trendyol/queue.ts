import { createAdminClient } from "@/lib/supabase/admin";
import { bucatiDeIduri } from "@/lib/supabase/id-chunks";
import { logError } from "@/lib/error-logger";
import type { TrendyolConfig } from "./types";

/**
 * ⚠ ESECURILE DE AICI SE SCRIU, NU SE INGHIT.
 *
 * Punerea la coada e „fire-and-forget": n-are voie sa arunce in apelant, fiindca
 * o pana la Trendyol nu trebuie sa impiedice salvarea unui produs in magazin.
 * Dar „nu arunca" a insemnat multa vreme `catch {}` gol, adica un esec care nu
 * lasa nicio urma nicaieri.
 *
 * S-a vazut ce costa: VetDepo a schimbat preturile la 1051 de produse (21.08),
 * cererea de punere la coada a cazut, si NIMENI n-a aflat. Preturile s-au
 * schimbat in magazin, la Trendyol au ramas cele vechi, iar in panou nu scria
 * nimic. A fost gasit abia cand a intrebat comerciantul, dupa o zi.
 */
function inghiteDarScrie(unde: string, businessId: string, e: unknown, detalii?: Record<string, unknown>): void {
  void logError({
    action: `trendyol.queue.${unde}`,
    message: e instanceof Error ? e.message : "Eroare necunoscuta la punerea in coada",
    details: { businessId, ...detalii },
    severity: "error",
  });
}

// Enqueue a Trendyol sync when the store has Trendyol connected with auto-sync on.
// Fire-and-forget: never throws into the caller (used from product/order actions).
// offer_id == productMainId == the Edinio product id.
export async function enqueueTrendyolSync(
  businessId: string,
  productId: string | null,
  offerId: string,
  op: "upsert" | "delete",
  /**
   * Produs abia creat in magazin. DOAR asa se poate declansa publicarea automata.
   *
   * Fara distinctia asta, „Publicare automată" ar insemna cu totul altceva decat
   * scrie pe eticheta: orice atingere a unui produs — o marire de pret in masa, o
   * schimbare de categorie, o activare — ar trimite pe Trendyol tot ce a atins,
   * adica intreg catalogul dintr-o apasare.
   */
  produsNou = false,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: ss } = await admin
      .from("store_settings").select("trendyol_config").eq("business_id", businessId).single();
    const config = (ss?.trendyol_config as TrendyolConfig) ?? {};
    if (!config.connected || !config.api_key) return;
    if (config.auto_sync === false) return;
    /*
     * In mod normal se pun la coada doar produsele care au deja o listare pe
     * Trendyol: un produs nou nu se trimite nicaieri pana nu-l pregateste
     * comerciantul.
     *
     * Cu „Publicare automată" pornita, regula se inverseaza — produsul nou intra
     * in coada, iar `syncProductNow` ii construieste listarea din maparea
     * categoriei. Daca nu are categoria mapata, elementul esueaza cu un mesaj
     * clar si e vizibil in coada; nu se trimite nimic gresit la Trendyol.
     */
    if (op === "upsert" && productId && !(config.auto_publish && produsNou)) {
      const { count } = await admin
        .from("trendyol_listings").select("id", { count: "exact", head: true })
        .eq("business_id", businessId).eq("product_id", productId);
      if (!count) return;
    }
    await admin.from("trendyol_sync_queue").upsert(
      { business_id: businessId, product_id: productId, offer_id: offerId, op },
      { onConflict: "business_id,offer_id,op" },
    );
  } catch (e) {
    inghiteDarScrie("unul", businessId, e, { productId, offerId, op });
  }
}

/**
 * Punerea la coada a mai multor produse deodata.
 *
 * ═══ ⚠ ID-URILE SE TAIE PE BUCATI. AICI A FOST DEFECTUL ═══
 *
 * `.in("product_id", ids)` NU pleaca in corpul cererii, ci in ADRESA. Fiecare
 * UUID adauga 37 de semne, iar marginea respinge cererea cand adresa devine prea
 * lunga. Masuratoarea e in `supabase/id-chunks.ts`, facuta pe proiectul real:
 * pragul e intre 600 si 700 de id-uri, iar raspunsul e un 400 in text simplu,
 * care nu spune nimic despre id-uri.
 *
 * Defectul (gasit 21.08): VetDepo a schimbat pretul la 1051 de produse dintr-o
 * actiune in masa. `bulkProductAction` isi taia deja propriile cereri pe bucati
 * si chiar avertizeaza in comentariu despre pragul asta — dar chema coada asta
 * cu toate cele 1051 de id-uri deodata. Cererea a picat, `catch {}` a inghitit-o,
 * si nu s-a pus in coada NIMIC. Preturile s-au schimbat in magazin, la Trendyol
 * au ramas cele vechi, si nu s-a vazut nicaieri.
 *
 * ⚠ `bucatiDeIduri` se aplica DOAR citirii. Scrierea de la sfarsit e un `upsert`
 * cu corp, deci nu atinge limita de adresa; taiata si ea, ar fi insemnat mai
 * multe cereri fara niciun castig.
 */
async function enqueueMany(businessId: string, productIds: (string | null | undefined)[], op: "upsert" | "inventory"): Promise<void> {
  try {
    const ids = [...new Set(productIds.filter((x): x is string => !!x))];
    if (ids.length === 0) return;
    const admin = createAdminClient();
    const { data: ss } = await admin
      .from("store_settings").select("trendyol_config").eq("business_id", businessId).single();
    const config = (ss?.trendyol_config as TrendyolConfig) ?? {};
    if (!config.connected || !config.api_key || config.auto_sync === false) return;
    // Actiunile in masa NU auto-publica: ele ating produse existente, iar
    // „publicare automată" e despre produsele noi. Vezi comentariul de mai sus.
    const listedIds = new Set<string>();
    for (const bucata of bucatiDeIduri(ids)) {
      const { data: listed, error } = await admin
        .from("trendyol_listings").select("product_id").eq("business_id", businessId).in("product_id", bucata);
      if (error) throw error;
      for (const r of listed ?? []) {
        const pid = (r as { product_id: string | null }).product_id;
        if (pid) listedIds.add(pid);
      }
    }
    const rows = ids.filter((id) => listedIds.has(id))
      .map((id) => ({ business_id: businessId, product_id: id, offer_id: id, op }));
    if (rows.length === 0) return;
    const { error } = await admin.from("trendyol_sync_queue").upsert(rows, { onConflict: "business_id,offer_id,op" });
    if (error) throw error;
  } catch (e) {
    inghiteDarScrie("multe", businessId, e, { cate: productIds.length, op });
  }
}

// Full re-push (product create/update). Used after product edits.
export function enqueueTrendyolSyncMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  return enqueueMany(businessId, productIds, "upsert");
}
// Dedicated inventory push. Used after orders decrement stock.
export function enqueueTrendyolInventoryMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  return enqueueMany(businessId, productIds, "inventory");
}
