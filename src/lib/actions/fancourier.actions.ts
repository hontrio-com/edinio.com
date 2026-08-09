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
  createFanCourierAwb,
  deleteFanCourierAwb,
  createFanCourierPickupOrder,
  deleteFanCourierPickupOrder,
  loadFanCourierAccount,
  type FanCourierConfig,
  type FanCourierAwbInput,
  type FanCourierPickupInput,
  type FanCourierBranch,
} from "@/lib/fancourier";

// ─── Config actions ───────────────────────────────────────────────────────────

export async function saveFanCourierConfig(
  businessId: string,
  config: FanCourierConfig,
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
    .from("store_settings").select("fan_courier_config").eq("business_id", businessId).maybeSingle();
  const configFinal = pastreazaSecretele("fan_courier_config", config, vechi?.fan_courier_config);

  const { error } = await supabase.from("store_settings").update({
    fan_courier_config: configFinal as unknown as import("@/types/database.types").Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectFanCourier(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const { error } = await supabase.from("store_settings").update({
    fan_courier_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function loadFanCourierAccountAction(
  businessId: string,
  username: string,
  password: string,
): Promise<{ branches: FanCourierBranch[] } | { error: string }> {
  const parola = await secretDinConfig(businessId, "fan_courier_config", "password", password);
  if (!parola) return { error: "Completeaza parola selfAWB." };
  return loadFanCourierAccount(username, parola);
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
  // decripteaza pentru `authenticated`, deci pe clientul utilizatorului parola
  // selfAWB ar veni `enc.v1.…` si FAN ar respinge orice AWB. Service role
  // OCOLESTE RLS — de aceea proprietatea magazinului se verifica mai sus.
  const admin = createAdminClient();
  const [{ data: settings }, { data: order }] = await Promise.all([
    admin.from("store_settings")
      .select("fan_courier_config")
      .eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = settings?.fan_courier_config as FanCourierConfig | null;
  if (!config?.enabled || !config.username || !config.password || !config.client_id) {
    return { error: "FAN Courier nu este configurat complet" as const };
  }

  return { supabase, config, order };
}

export async function createFanCourierAwbAction(
  businessId: string,
  orderId: string,
  input: FanCourierAwbInput,
): Promise<{ awbNumber: string } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & { fan_courier_awb_number?: string | null };
  if (orderData.fan_courier_awb_number) return { error: "AWB FAN Courier a fost deja creat" };

  /*
   * ⚠ FAN e, impreuna cu Woot, curierul cel mai expus: nu trimitem nicio referinta
   * a noastra in payloadul `intern-awb`, deci un AWB creat si nesalvat local ramane
   * complet ANONIM la ei — nu poate fi nici gasit, nici legat inapoi. Registrul
   * local e singurul strat care poate opri a doua apasare.
   *
   * In plus, `fanFetch` reincearca AUTOMAT orice cerere pe 401, inclusiv POST-ul de
   * creare: daca FAN raspunde 401 dupa ce a inregistrat AWB-ul, un singur apel poate
   * produce DOUA. Rezervarea nu opreste asta (e in interiorul aceluiasi apel), dar
   * macar a doua APASARE nu mai adauga o a treia.
   */
  const r = await cuRegistru(
    createAdminClient(),
    { businessId, orderId, fel: "awb", furnizor: "fancourier", cheie: cheieOperatie("awb", "fancourier", orderId) },
    async () => {
      const awbNumber = await createFanCourierAwb(config, input);
      return { referinta: awbNumber, valoare: { awbNumber } };
    },
    verdictFurnizor,
    // Pe `deja`: mai poarta comanda AWB-ul din registru? Daca nu, e urma unei
    // anulari a carei eliberare s-a pierdut — se elibereaza si se reia.
    async () => !!orderData.fan_courier_awb_number,
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };
  const awbNumber = r.fel === "facut" ? r.valoare.awbNumber : (r.referinta ?? "");

  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    fan_courier_awb_number: awbNumber,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).select("id");

  if (eScriere || !randuri || randuri.length === 0) {
    await logError({
      action: "fancourier.createAwb",
      message: `AWB FAN Courier creat (${awbNumber}), dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}`,
      details: { orderId, businessId, code: eScriere?.code },
      businessId,
      severity: "critical",
    });
  } else {
    void enqueueAboutYouShip(businessId, orderId);
  }

  return { awbNumber };
}

// ─── Pickup (courier order) actions ──────────────────────────────────────────

async function getOwnedFanConfig(businessId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" as const };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" as const };

  // Service role, ca in getConfigAndOrder: parola selfAWB pleaca la FAN, iar
  // clientul utilizatorului o primeste cifrata. Proprietatea magazinului e
  // verificata chiar deasupra, fiindca service role sare peste RLS.
  // Configul asta se scrie mai jos la loc (last_pickup_*) cu parola in clar in
  // el — corect: declansatorul de pe vedere o cripteaza inapoi la scriere.
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("store_settings").select("fan_courier_config").eq("business_id", businessId).single();

  const config = settings?.fan_courier_config as FanCourierConfig | null;
  if (!config?.enabled || !config.username || !config.password || !config.client_id) {
    return { error: "FAN Courier nu este configurat complet" as const };
  }
  return { supabase, config };
}

export async function createFanCourierPickupAction(
  businessId: string,
  input: FanCourierPickupInput,
): Promise<{ orderId: string } | { error: string }> {
  const ctx = await getOwnedFanConfig(businessId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config } = ctx;

  /*
   * ⚠ AICI DUPLICATUL ERA MAI RAU DECAT LA CEILALTI.
   *
   * Nu exista nicio garda pe server (doar `hasActivePickup` in modal), iar scrierea
   * de mai jos SUPRASCRIE `last_pickup_id`. Deci a doua apasare chema FAN a doua
   * oara SI facea prima ridicare NEANULABILA — `cancelFanCourierPickupAction`
   * raspunde „Nu exista o ridicare programata care sa poata fi anulata" fara acel id.
   *
   * Discriminantul e ZIUA ceruta: doua apasari pe aceeasi zi sunt duplicat, o
   * ridicare pentru alta zi e legitima.
   */
  const r = await cuRegistru(
    createAdminClient(),
    {
      businessId,
      orderId: null,
      fel: "ridicare",
      furnizor: "fancourier",
      cheie: cheieOperatie("ridicare", "fancourier", input.pickupDate),
    },
    async () => {
      const idRidicare = await createFanCourierPickupOrder(config, input);
      return { referinta: String(idRidicare ?? ""), valoare: { orderId: idRidicare } };
    },
    verdictFurnizor,
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };
  const idRidicare = r.fel === "facut" ? r.valoare.orderId : (r.referinta ?? "");

  // Remember the last pickup so the UI can warn about duplicates / allow cancel.
  const { error: eScriere } = await supabase.from("store_settings").update({
    fan_courier_config: {
      ...config,
      last_pickup_date: input.pickupDate,
      last_pickup_id: idRidicare || null,
    } as unknown as import("@/types/database.types").Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (eScriere) {
    await logError({
      action: "fancourier.pickup",
      message: `Ridicare FAN ceruta (${idRidicare || "fara id"}), dar configul NU s-a actualizat: ${eScriere.message}. Ridicarea nu va putea fi anulata din panou.`,
      details: { businessId, pickupDate: input.pickupDate },
      businessId,
      severity: "critical",
    });
  }

  return { orderId: idRidicare };
}

export async function cancelFanCourierPickupAction(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getOwnedFanConfig(businessId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config } = ctx;

  if (!config.last_pickup_id) {
    return { error: "Nu exista o ridicare programata din platforma care sa poata fi anulata." };
  }

  try {
    await deleteFanCourierPickupOrder(config, config.last_pickup_id);

    await supabase.from("store_settings").update({
      fan_courier_config: {
        ...config,
        last_pickup_date: null,
        last_pickup_id: null,
      } as unknown as import("@/types/database.types").Json,
      updated_at: new Date().toISOString(),
    }).eq("business_id", businessId);

    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteFanCourierAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & { fan_courier_awb_number?: string | null };
  if (!orderData.fan_courier_awb_number) return { error: "Nu exista AWB FAN Courier pentru aceasta comanda" };

  try {
    await deleteFanCourierAwb(config, orderData.fan_courier_awb_number);

    await supabase.from("orders").update({
      fan_courier_awb_number: null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

    // Fara eliberare, emiterea urmatoare ar adopta chiar AWB-ul sters.
    const eliberat = await marcheazaAnulata(createAdminClient(), businessId, cheieOperatie("awb", "fancourier", orderId));
    if (!eliberat) {
      await logError({
        action: "fancourier.deleteAwb",
        message: "AWB FAN Courier sters, dar slotul din registru NU s-a eliberat. Urmatoarea emitere pe aceasta comanda va fi refuzata.",
        details: { orderId, businessId, awb: orderData.fan_courier_awb_number },
        businessId,
        severity: "critical",
      });
    }

    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
