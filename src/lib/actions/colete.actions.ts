"use server";
import { enqueueAboutYouShip } from "@/lib/aboutyou/queue";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { secretDinConfig } from "@/lib/integrari/secret-server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { cheieOperatie, cuRegistru, marcheazaAnulata } from "@/lib/operatii/registru";
import { eroareNesigura, verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import {
  getCOToken,
  getBalance,
  getPrices,
  createCOOrder,
  type COConfig,
  type COOrderExtras,
  type COReceiver,
  type COParcel,
} from "@/lib/colete";

/** Config-driven extras (repayment routing + insurance), shared by quote and AWB. */
function configExtras(config: COConfig, subtotal?: number): COOrderExtras {
  return {
    repaymentType: config.repayment_type ?? "cash",
    repaymentIban: config.repayment_iban,
    repaymentHolder: config.repayment_holder,
    ...(config.insurance_enabled && subtotal && subtotal > 0
      ? { insurance: Math.round(subtotal * 100) / 100 }
      : {}),
  };
}

/*
 * Clientul de sistem vine din `@/lib/supabase/admin`, nu se mai construieste aici.
 * Cel local era `createClient(...)` FARA genericul `<Database>`, adica exact
 * capcana din 19.08: `.rpc()` accepta orice nume de functie si orice argumente.
 */
const adminClient = createAdminClient;

// ─── Config ───────────────────────────────────────────────────────────────────

export async function saveCOConfig(
  businessId: string,
  config: COConfig,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  // Campurile secrete venite GOALE isi pastreaza valoarea salvata: formularul le
  // primeste mascate (vezi lib/integrari/secrete.ts), deci o salvare obisnuita
  // nu trebuie sa le stearga. Fara asta, mascarea ar distruge integrarea.
  // Citirea RAMANE pe clientul utilizatorului: valoarea veche doar se scrie la
  // loc, nu pleaca spre curier. Chiar daca vine cifrata (`enc.v1.…`), criptarea
  // e idempotenta, deci secretul se pastreaza neatins.
  const { data: vechi } = await supabase
    .from("store_settings").select("colete_config").eq("business_id", businessId).maybeSingle();
  const configFinal = pastreazaSecretele("colete_config", config, vechi?.colete_config);

  const { error } = await supabase.from("store_settings").update({ colete_config: configFinal as unknown as import("@/types/database.types").Json, updated_at: new Date().toISOString() }).eq("business_id", businessId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectCO(businessId: string): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const { error } = await supabase.from("store_settings").update({ colete_config: null, updated_at: new Date().toISOString() }).eq("business_id", businessId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function testCOConnection(
  businessId: string,
  clientId: string,
  clientSecret: string,
  sandbox: boolean,
): Promise<{ balance: number; bonus: number } | { error: string }> {
  try {
    const secret = await secretDinConfig(businessId, "colete_config", "client_secret", clientSecret);
    if (!secret) return { error: "Completeaza Client Secret." };
    const token = await getCOToken(clientId, secret);
    const balance = await getBalance(token, sandbox);
    return { balance: balance.amount, bonus: balance.bonus };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ─── Prices ───────────────────────────────────────────────────────────────────

export async function getCOPrices(
  businessId: string,
  receiver: COReceiver,
  parcels: COParcel[],
  repayment: number,
  /** Toggles from the AWB modal; insurance is resolved from the order when orderId is set. */
  options?: { openAtDelivery?: boolean; saturday?: boolean; orderId?: string },
): Promise<{ list: { serviceId: number; courierName: string; serviceName: string; total: number; noVat: number }[] } | { error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Neautorizat" };

    // Proprietatea asupra magazinului, INAINTE de a folosi clientul cu service
    // role: fara ea, orice comerciant logat cerea cotatii pe contul Colete al
    // ALTUI magazin — ii consuma cota de API si ii vedea tarifele negociate.
    const { data: biz } = await supabase
      .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).maybeSingle();
    if (!biz) return { error: "Magazin negasit" };

    const admin = adminClient();
    const { data: settings } = await admin.from("store_settings").select("colete_config").eq("business_id", businessId).single();
    const config = settings?.colete_config as COConfig | null;
    if (!config?.client_id || !config?.client_secret) return { error: "Colete Online nu este configurat" };

    let subtotal: number | undefined;
    if (options?.orderId && config.insurance_enabled) {
      const { data: order } = await admin
        .from("orders")
        .select("subtotal")
        .eq("id", options.orderId)
        .eq("business_id", businessId)
        .single();
      subtotal = Number(order?.subtotal) || undefined;
    }

    const token = await getCOToken(config.client_id, config.client_secret);
    const result = await getPrices(token, config.sandbox ?? false, config.sender, receiver, parcels, repayment, {
      ...configExtras(config, subtotal),
      openAtDelivery: options?.openAtDelivery,
      saturday: options?.saturday,
    });

    const list = (result.list ?? []).map(item => ({
      serviceId: item.service.id,
      courierName: item.service.courierName,
      serviceName: item.service.name,
      total: item.price.total,
      noVat: item.price.noVat,
    }));

    return { list };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ─── Create AWB ───────────────────────────────────────────────────────────────

export async function createCOAwb(
  businessId: string,
  orderId: string,
  serviceId: number,
  serviceName: string,
  receiver: COReceiver,
  parcels: COParcel[],
  repayment: number,
  options?: { openAtDelivery?: boolean; saturday?: boolean },
): Promise<{ awb: string; uniqueId: string } | { error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Neautorizat" };

    const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
    if (!biz) return { error: "Business negasit" };

    const admin = adminClient();
    const [{ data: order }, { data: settings }] = await Promise.all([
      admin.from("orders").select("id, order_number, payment_method, payment_status, subtotal").eq("id", orderId).eq("business_id", businessId).single(),
      admin.from("store_settings").select("colete_config").eq("business_id", businessId).single(),
    ]);

    if (!order) return { error: "Comanda negasita" };
    const config = settings?.colete_config as COConfig | null;
    if (!config?.client_id || !config?.client_secret) return { error: "Colete Online nu este configurat" };

    /*
     * ⚠ Colete Online e cel mai prost caz din toti sase, si de aceea garda locala
     * conteaza cel mai mult aici: NU are endpoint de anulare (vezi `detachCOAwb`,
     * care doar dezleaga local), si nu se poate interoga dupa `clientReference`.
     * Un al doilea AWB nu s-ar putea sterge din cod, ci doar de mana din contul lor.
     *
     * Pe deasupra, actiunea asta nici nu citea `colete_awb_number` inainte (citirea
     * de mai sus aduce doar id, order_number, payment_method, payment_status,
     * subtotal), deci pe server nu exista NICIO oprire — doar `hasAwb` din modal.
     */
    const r = await cuRegistru(
      admin,
      { businessId, orderId, fel: "awb", furnizor: "colete", cheie: cheieOperatie("awb", "colete", orderId) },
      async () => {
        const token = await getCOToken(config.client_id, config.client_secret);
        const rezultat = await createCOOrder(token, config.sandbox ?? false, config.sender, receiver, parcels, repayment, serviceId, {
          ...configExtras(config, Number(order.subtotal) || undefined),
          openAtDelivery: options?.openAtDelivery,
          saturday: options?.saturday,
          clientReference: order.order_number, // shows up in COD payout reports
        });
        /*
         * `coReq` intoarce `res.json() as Promise<T>` — un CAST, nu o verificare.
         * Un 2xx fara `awb`/`uniqueId` ar fi inchis slotul cu referinta goala, deci
         * comanda ar fi ramas fara AWB si fara nicio cale de a mai emite unul.
         * Ceilalti cinci curieri au deja garda asta („AWB nu a fost returnat").
         */
        if (!rezultat?.uniqueId || !rezultat?.awb) {
          throw eroareNesigura("Colete Online nu a returnat AWB-ul. Verifica in contul Colete Online inainte de a incerca din nou.");
        }
        return {
          referinta: rezultat.uniqueId,
          detalii: { awb: rezultat.awb, serviciu: serviceName },
          valoare: rezultat,
        };
      },
      verdictFurnizor,
      // Colete n-are anulare la furnizor: omul o face din contul lui si apoi
      // dezleaga aici. Daca eliberarea slotului s-a pierdut atunci, verificarea
      // asta o repara la prima emitere de dupa.
      async () => {
        const { data } = await admin
          .from("orders").select("colete_order_id")
          .eq("id", orderId).eq("business_id", businessId).maybeSingle();
        return !!data?.colete_order_id;
      },
    );

    if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

    const d = r.fel === "deja" ? (r.detalii as { awb?: string } | null) : null;
    const awb = r.fel === "facut" ? r.valoare.awb : (d?.awb ?? "");
    const uniqueId = r.fel === "facut" ? r.valoare.uniqueId : (r.referinta ?? "");

    const { error: eScriere, data: randuri } = await admin.from("orders").update({
      colete_order_id: uniqueId,
      colete_awb_number: awb,
      colete_service_name: serviceName,
      tracking_number: awb,
      status: "processing",
      updated_at: new Date().toISOString(),
      // Filtrul de magazin lipsea din scrierea asta, desi clientul e de SISTEM
      // (service role sare peste RLS). Citirea de mai sus il are, dar o scriere
      // privilegiata nu trebuie sa atarne de ordinea randurilor de deasupra.
    }).eq("id", orderId).eq("business_id", businessId).select("id");

    if (eScriere || !randuri || randuri.length === 0) {
      await logError({
        action: "colete.createAwb",
        message: `AWB Colete creat (${awb}), dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}`,
        details: { orderId, businessId, uniqueId, code: eScriere?.code },
        businessId,
        severity: "critical",
      });
    } else {
      void enqueueAboutYouShip(businessId, orderId);
    }

    return { awb, uniqueId };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ─── Detach AWB (manual cancellation) ─────────────────────────────────────────
// Colete Online has NO cancellation endpoint: the merchant cancels the shipment
// in their Colete Online account, then detaches the AWB here so the order can
// get a fresh one (e.g. after editing a wrong address).

export async function detachCOAwb(businessId: string, orderId: string): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const admin = adminClient();
  const { data: order } = await admin.from("orders")
    .select("id, colete_awb_number, tracking_number")
    .eq("id", orderId).eq("business_id", businessId).single();
  if (!order) return { error: "Comanda negasita" };
  if (!order.colete_awb_number) return { error: "Comanda nu are AWB Colete Online." };

  const { error } = await admin.from("orders").update({
    colete_awb_number: null,
    colete_order_id: null,
    colete_unique_id: null,
    colete_service_name: null,
    // tracking_number is shared across couriers — clear it only if it belongs to this AWB.
    ...(order.tracking_number === order.colete_awb_number ? { tracking_number: null } : {}),
    updated_at: new Date().toISOString(),
  }).eq("id", orderId);
  if (error) return { error: "Eroare la actualizare." };

  /*
   * Dezlegarea E anularea, la Colete: furnizorul n-are endpoint de anulare, deci
   * omul o face din contul lui si apoi apasa aici. Pentru registru inseamna acelasi
   * lucru — slotul se elibereaza, altfel AWB-ul urmator ar fi refuzat, sau mai rau,
   * ar fi „adoptat" chiar cel dezlegat.
   */
  const eliberat = await marcheazaAnulata(admin, businessId, cheieOperatie("awb", "colete", orderId));
  if (!eliberat) {
    await logError({
      action: "colete.detachAwb",
      message: "AWB Colete dezlegat, dar slotul din registru NU s-a eliberat. Urmatoarea emitere pe aceasta comanda va fi refuzata.",
      details: { orderId, businessId, awb: order.colete_awb_number },
      businessId,
      severity: "critical",
    });
  }

  revalidatePath(`/dashboard/orders/${orderId}`);
  return { success: true };
}
