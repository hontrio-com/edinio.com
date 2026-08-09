"use server";
import { enqueueAboutYouShip } from "@/lib/aboutyou/queue";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { secretDinConfig } from "@/lib/integrari/secret-server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { cheieOperatie, cuRegistru, marcheazaAnulata } from "@/lib/operatii/registru";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import {
  createCargusAwb,
  deleteCargusAwb,
  loadCargusAccount,
  getCargusServiceId,
  validateCargusPickupOrder,
  type CargusConfig,
  type CargusAwbInput,
  type CargusPickupLocation,
  type CargusPriceTable,
} from "@/lib/cargus";

// ─── Config actions ───────────────────────────────────────────────────────────

export async function saveCargusConfig(
  businessId: string,
  config: CargusConfig,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  // Campurile secrete venite GOALE isi pastreaza valoarea salvata: formularul le
  // primeste mascate (vezi lib/integrari/secrete.ts), deci o salvare obisnuita
  // nu trebuie sa le stearga. Fara asta, mascarea ar distruge integrarea.
  // Citirea RAMANE pe clientul utilizatorului: valoarea veche doar se scrie la
  // loc, nu pleaca spre curier. Chiar daca vine cifrata (`enc.v1.…`), criptarea
  // e idempotenta, deci secretul se pastreaza neatins.
  const { data: vechi } = await supabase
    .from("store_settings").select("cargus_config").eq("business_id", businessId).maybeSingle();
  const configFinal = pastreazaSecretele("cargus_config", config, vechi?.cargus_config);

  const { error } = await supabase.from("store_settings").update({
    cargus_config: configFinal as unknown as import("@/types/database.types").Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectCargus(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const { error } = await supabase.from("store_settings").update({
    cargus_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function loadCargusAccountAction(
  businessId: string,
  username: string,
  password: string,
  subscriptionKey: string,
): Promise<{
  locations: CargusPickupLocation[];
  priceTables: CargusPriceTable[];
} | { error: string }> {
  // Formularul primeste parola si cheia MASCATE. Cand vin goale, le luam pe cele
  // salvate — altfel „reconecteaza-te" ar cere retastarea unor secrete pe care
  // comerciantul nu le mai are la indemana.
  const [parola, cheie] = await Promise.all([
    secretDinConfig(businessId, "cargus_config", "password", password),
    secretDinConfig(businessId, "cargus_config", "subscription_key", subscriptionKey),
  ]);
  if (!parola || !cheie) return { error: "Completeaza parola si Subscription Key." };
  return loadCargusAccount(username, parola, cheie);
}

// ─── AWB actions ──────────────────────────────────────────────────────────────

async function getConfigAndOrder(businessId: string, orderId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" as const };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" as const };

  // Configul se citeste cu service role: vederea public.store_settings nu mai
  // decripteaza pentru `authenticated`, deci pe clientul utilizatorului parola si
  // Subscription Key ar veni `enc.v1.…` si Cargus ar respinge orice AWB. Service
  // role OCOLESTE RLS — de aceea proprietatea magazinului se verifica mai sus.
  const admin = createAdminClient();
  const [{ data: settings }, { data: order }] = await Promise.all([
    admin.from("store_settings")
      .select("cargus_config")
      .eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = settings?.cargus_config as CargusConfig | null;
  if (!config?.enabled || !config.username || !config.password || !config.subscription_key) {
    return { error: "Cargus nu este configurat complet" as const };
  }

  return { supabase, config, order };
}

export async function createCargusAwbAction(
  businessId: string,
  orderId: string,
  input: CargusAwbInput,
): Promise<{ barCode: string; serviceName: string } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & { cargus_awb_number?: string | null };
  if (orderData.cargus_awb_number) return { error: "AWB Cargus a fost deja creat" };

  // Server-derived extras: the Ship & Go point chosen at checkout and the
  // insured value when the merchant opted in.
  const shipping = (order.shipping_address ?? {}) as {
    courier?: string;
    delivery_type?: string;
    locker_id?: string;
  };
  const isPudoDelivery =
    shipping.courier === "cargus" && shipping.delivery_type === "locker" && !!shipping.locker_id;
  const enriched: CargusAwbInput = {
    ...input,
    pudoPointId: isPudoDelivery ? (Number(shipping.locker_id) || undefined) : input.pudoPointId,
    declaredValue: config.declared_value_enabled ? (Number(order.subtotal) || undefined) : undefined,
  };

  const r = await cuRegistru(
    createAdminClient(),
    {
      businessId,
      orderId,
      fel: "awb",
      furnizor: "cargus",
      cheie: cheieOperatie("awb", "cargus", orderId),
    },
    async () => {
      const barCode = await createCargusAwb(config, enriched);
      const serviceName = enriched.pudoPointId
        ? "Ship & Go"
        : getCargusServiceId(enriched.totalWeightKg).name;
      return { referinta: barCode, detalii: { serviciu: serviceName }, valoare: { barCode, serviceName } };
    },
    verdictFurnizor,
    // Pe `deja`: mai poarta comanda AWB-ul din registru? Daca nu, e urma unei
    // anulari a carei eliberare s-a pierdut — se elibereaza si se reia.
    async () => !!orderData.cargus_awb_number,
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

  const barCode = r.fel === "facut" ? r.valoare.barCode : (r.referinta ?? "");
  const serviceName = r.fel === "facut"
    ? r.valoare.serviceName
    : ((r.detalii as { serviciu?: string } | null)?.serviciu ?? "");

  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    cargus_awb_number: barCode,
    cargus_service_name: serviceName,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).select("id");

  // AWB-ul exista si e platit: o eroare intoarsa acum l-ar trimite pe om sa apese
  // din nou. Registrul l-a inregistrat, deci a doua apasare il adopta.
  if (eScriere || !randuri || randuri.length === 0) {
    await logError({
      action: "cargus.createAwb",
      message: `AWB Cargus creat (${barCode}), dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}`,
      details: { orderId, businessId, code: eScriere?.code },
      businessId,
      severity: "critical",
    });
  } else {
    void enqueueAboutYouShip(businessId, orderId);
  }

  return { barCode, serviceName };
}

// ─── Pickup (courier order validation) ───────────────────────────────────────

/**
 * Validates the open Cargus order on the configured pickup point so the
 * courier comes for the created AWBs. Needed when the pickup point has no
 * AutomaticEOD hour configured in WebExpress.
 */
export async function requestCargusPickupAction(
  businessId: string,
  input: { pickupStart: string; pickupEnd: string },
): Promise<{ orderId: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  // Service role, ca in getConfigAndOrder: parola si Subscription Key merg la
  // Cargus, iar clientul utilizatorului le primeste cifrate. Proprietatea
  // magazinului e verificata chiar deasupra, fiindca service role sare peste RLS.
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("store_settings").select("cargus_config").eq("business_id", businessId).single();
  const config = settings?.cargus_config as CargusConfig | null;
  if (!config?.enabled || !config.username || !config.password || !config.subscription_key) {
    return { error: "Cargus nu este configurat complet" };
  }

  /*
   * Ridicarea e un efect extern fara comanda: cheama curierul la punctul de lucru.
   * Doua apasari = curierul chemat de doua ori, si Cargus n-are anulare aici.
   *
   * Discriminantul e FEREASTRA ceruta, nu ziua: doua apasari pe acelasi interval
   * sunt un duplicat, dar o a doua ridicare pe alt interval e legitima si trebuie
   * sa treaca. `orderId` ramane null — nu tine de nicio comanda.
   */
  const r = await cuRegistru(
    admin,
    {
      businessId,
      orderId: null,
      fel: "ridicare",
      furnizor: "cargus",
      cheie: cheieOperatie("ridicare", "cargus", `${input.pickupStart}..${input.pickupEnd}`),
    },
    async () => {
      const idRidicare = await validateCargusPickupOrder(config, input);
      return { referinta: String(idRidicare), valoare: { orderId: idRidicare } };
    },
    verdictFurnizor,
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };
  return { orderId: r.fel === "facut" ? r.valoare.orderId : (r.referinta ?? "") };
}

export async function deleteCargusAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & { cargus_awb_number?: string | null };
  if (!orderData.cargus_awb_number) return { error: "Nu exista AWB Cargus pentru aceasta comanda" };

  try {
    await deleteCargusAwb(config, orderData.cargus_awb_number);

    await supabase.from("orders").update({
      cargus_awb_number: null,
      cargus_service_name: null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

    // Slotul se elibereaza dupa confirmarea anularii: altfel emiterea urmatoare ar
    // „adopta" chiar AWB-ul sters si l-ar scrie inapoi pe comanda.
    const eliberat = await marcheazaAnulata(createAdminClient(), businessId, cheieOperatie("awb", "cargus", orderId));
    if (!eliberat) {
      await logError({
        action: "cargus.deleteAwb",
        message: "AWB Cargus sters, dar slotul din registru NU s-a eliberat. Urmatoarea emitere pe aceasta comanda va fi refuzata.",
        details: { orderId, businessId, awb: orderData.cargus_awb_number },
        businessId,
        severity: "critical",
      });
    }

    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
