import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import type { GoogleMerchantConfig } from "./types";

// Enqueue a product sync when the store has Google Merchant connected with
// auto-sync on. Fire-and-forget — never throws into the caller (used from
// product/order actions, which must not break if Google is down).
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
 */
function scrieEsecul(unde: string, businessId: string, e: unknown): void {
  void logError({
    action: `gmc.queue.${unde}`,
    message: e instanceof Error ? e.message : "Eroare necunoscuta la punerea in coada",
    details: { businessId },
    businessId,
    severity: "error",
  });
}

export async function enqueueGmcSync(
  businessId: string,
  productId: string | null,
  offerId: string,
  op: "upsert" | "delete",
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: ss } = await admin
      .from("store_settings").select("google_merchant_config").eq("business_id", businessId).single();
    const config = (ss?.google_merchant_config as GoogleMerchantConfig) ?? {};
    if (!config.connected || !config.account_id) return;
    if (config.auto_sync === false) return;
    await admin.from("gmc_sync_queue").upsert(
      { business_id: businessId, product_id: productId, offer_id: offerId, op },
      { onConflict: "business_id,offer_id,op" },
    );
  } catch (e) {
    scrieEsecul("coada", businessId, e);
  }
}

// Batch upsert-enqueue (one config check). Used after orders (stock changes on
// several products at once). Non-throwing.
export async function enqueueGmcSyncMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  try {
    const ids = [...new Set(productIds.filter((x): x is string => !!x))];
    if (ids.length === 0) return;
    const admin = createAdminClient();
    const { data: ss } = await admin
      .from("store_settings").select("google_merchant_config").eq("business_id", businessId).single();
    const config = (ss?.google_merchant_config as GoogleMerchantConfig) ?? {};
    if (!config.connected || !config.account_id || config.auto_sync === false) return;
    await admin.from("gmc_sync_queue").upsert(
      ids.map((id) => ({ business_id: businessId, product_id: id, offer_id: id, op: "upsert" })),
      { onConflict: "business_id,offer_id,op" },
    );
  } catch (e) {
    scrieEsecul("coada", businessId, e);
  }
}
