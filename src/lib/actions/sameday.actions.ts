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
  createSamedayAwb,
  deleteSamedayAwb,
  loadSamedayAccount,
  type SamedayConfig,
  type SamedayAwbInput,
  type SamedayPickupPoint,
  type SamedayService,
} from "@/lib/sameday";

// ─── Config actions ───────────────────────────────────────────────────────────

export async function saveSamedayConfig(
  businessId: string,
  config: SamedayConfig,
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
    .from("store_settings").select("sameday_config").eq("business_id", businessId).maybeSingle();
  const configFinal = pastreazaSecretele("sameday_config", config, vechi?.sameday_config);

  const { error } = await supabase.from("store_settings").update({
    sameday_config: configFinal as unknown as import("@/types/database.types").Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectSameday(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const { error } = await supabase.from("store_settings").update({
    sameday_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function loadSamedayAccountAction(
  businessId: string,
  username: string,
  password: string,
  sandbox: boolean,
): Promise<{
  pickupPoints: SamedayPickupPoint[];
  services: SamedayService[];
} | { error: string }> {
  try {
    const parola = await secretDinConfig(businessId, "sameday_config", "password", password);
    if (!parola) return { error: "Completeaza parola Sameday." };
    return await loadSamedayAccount(username, parola, sandbox);
  } catch (e) {
    console.error("[sameday] loadSamedayAccountAction error:", e);
    return { error: (e as Error).message ?? "Eroare necunoscuta" };
  }
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
  // decripteaza pentru `authenticated`, deci pe clientul utilizatorului parola ar
  // veni `enc.v1.…` si Sameday ar respinge orice AWB. Service role OCOLESTE
  // RLS — de aceea proprietatea magazinului se verifica mai sus.
  const admin = createAdminClient();
  const [{ data: settings }, { data: order }] = await Promise.all([
    admin.from("store_settings")
      .select("sameday_config")
      .eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = settings?.sameday_config as SamedayConfig | null;
  if (!config?.enabled || !config.username || !config.password) {
    return { error: "Sameday nu este configurat complet" as const };
  }

  return { supabase, config, order };
}

export async function createSamedayAwbAction(
  businessId: string,
  orderId: string,
  input: SamedayAwbInput,
): Promise<{ awbNumber: string } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & { sameday_awb_number?: string | null };
  if (orderData.sameday_awb_number) return { error: "AWB Sameday a fost deja creat" };

  // Easybox delivery: derive the locker server-side from the order and use the
  // LOCKER's locality/address on the AWB (mirrors Sameday's official module,
  // which replaces the recipient address with the locker's).
  const shipping = (order.shipping_address ?? {}) as {
    courier?: string;
    delivery_type?: string;
    locker_id?: string;
    locker_name?: string;
    locker_address?: string;
    locker_city?: string;
    locker_county?: string;
  };
  const isEasyboxDelivery =
    shipping.courier === "sameday" && shipping.delivery_type === "locker" && !!shipping.locker_id;
  const lockerIdNum = isEasyboxDelivery ? Number(shipping.locker_id) : NaN;
  const enriched: SamedayAwbInput =
    isEasyboxDelivery && !Number.isNaN(lockerIdNum)
      ? {
          ...input,
          lockerId: lockerIdNum,
          recipientCity: shipping.locker_city || input.recipientCity,
          recipientCounty: shipping.locker_county || input.recipientCounty,
          recipientAddress: [shipping.locker_address, shipping.locker_name]
            .filter(Boolean)
            .join(" - ") || input.recipientAddress,
        }
      : { ...input, lockerId: undefined };

  const r = await cuRegistru(
    createAdminClient(),
    { businessId, orderId, fel: "awb", furnizor: "sameday", cheie: cheieOperatie("awb", "sameday", orderId) },
    async () => {
      const awbNumber = await createSamedayAwb(config, enriched);
      return { referinta: awbNumber, valoare: { awbNumber } };
    },
    verdictFurnizor,
    // Pe `deja`: mai poarta comanda AWB-ul din registru? Daca nu, e urma unei
    // anulari a carei eliberare s-a pierdut — se elibereaza si se reia.
    async () => !!orderData.sameday_awb_number,
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };
  const awbNumber = r.fel === "facut" ? r.valoare.awbNumber : (r.referinta ?? "");

  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    sameday_awb_number: awbNumber,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).select("id");

  // AWB-ul exista. O eroare acum l-ar trimite pe om sa apese din nou; registrul
  // l-a inregistrat, deci a doua apasare il adopta si reface scrierea.
  if (eScriere || !randuri || randuri.length === 0) {
    await logError({
      action: "sameday.createAwb",
      message: `AWB Sameday creat (${awbNumber}), dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}`,
      details: { orderId, businessId, code: eScriere?.code },
      businessId,
      severity: "critical",
    });
  } else {
    void enqueueAboutYouShip(businessId, orderId);
  }

  return { awbNumber };
}

export async function deleteSamedayAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & { sameday_awb_number?: string | null };
  if (!orderData.sameday_awb_number) return { error: "Nu exista AWB Sameday pentru aceasta comanda" };

  try {
    await deleteSamedayAwb(config, orderData.sameday_awb_number);

    await supabase.from("orders").update({
      sameday_awb_number: null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

    // Fara eliberare, emiterea urmatoare ar adopta chiar AWB-ul sters.
    const eliberat = await marcheazaAnulata(createAdminClient(), businessId, cheieOperatie("awb", "sameday", orderId));
    if (!eliberat) {
      await logError({
        action: "sameday.deleteAwb",
        message: "AWB Sameday sters, dar slotul din registru NU s-a eliberat. Urmatoarea emitere pe aceasta comanda va fi refuzata.",
        details: { orderId, businessId, awb: orderData.sameday_awb_number },
        businessId,
        severity: "critical",
      });
    }

    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
