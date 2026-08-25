"use server";
import { enqueueAboutYouShip } from "@/lib/aboutyou/queue";
import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";
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
} from "@/lib/sameday/client";

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
  // Citirea se face cu SERVICE ROLE. De aici valoarea nu pleaca spre curier — se
  // scrie doar la loc, si `privat.cripteaza` e idempotenta, deci randul din baza ar
  // ramane corect si citit cifrat. Se citeste totusi decriptat fiindca asta e
  // contractul lui `pastreazaSecretele` (secrete.ts): altfel `configFinal` tine
  // `enc.v1.…`, si primul care adauga dupa salvare un apel catre curier sau un
  // `return { config }` rupe integrarea in tacere. Proprietatea e dovedita mai sus.
  const { data: vechi } = await createAdminClient()
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

/** Ce alege comerciantul in fereastra de AWB, peste ce a ales cumparatorul la checkout. */
export type LockerAles = {
  id: number;
  name?: string;
  address?: string;
  city?: string;
  county?: string;
};

export async function createSamedayAwbAction(
  businessId: string,
  orderId: string,
  input: SamedayAwbInput & { lockerAles?: LockerAles | null },
): Promise<
  | { awbNumber: string; awbCost: number | null; lockerReturnChargeCode: string | null }
  | { error: string }
> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & { sameday_awb_number?: string | null };
  if (orderData.sameday_awb_number) return { error: "AWB Sameday a fost deja creat" };

  /*
   * ═══ EASYBOX: ALEGEREA CUMPARATORULUI, SAU A COMERCIANTULUI ═══
   *
   * Pana acum lockerul se citea DOAR din comanda, adica din ce alesese cumparatorul la
   * checkout. Daca omul alesese livrare la adresa, comerciantul nu mai avea nicio cale sa
   * mute coletul intr-un easybox — desi Sameday ingaduie.
   *
   * ⚠ ALEGEREA COMERCIANTULUI BATE COMANDA, si asa trebuie: el o face mai tarziu, stiind
   * ceva ce cumparatorul nu stia (coletul nu incape la adresa, clientul a sunat si a cerut
   * altfel). Dar nu se face de la sine: `lockerAles` vine numai daca a apasat anume.
   *
   * ⚠ Un id de locker DPD sau Cargus nu are voie sa ajunga intr-un AWB Sameday, de-aia
   * lockerul din comanda se ia in seama doar cand `courier === "sameday"`.
   */
  const shipping = (order.shipping_address ?? {}) as {
    courier?: string;
    delivery_type?: string;
    locker_id?: string;
    locker_name?: string;
    locker_address?: string;
    locker_city?: string;
    locker_county?: string;
  };

  const lockerDinComanda =
    shipping.courier === "sameday" && shipping.delivery_type === "locker" && shipping.locker_id
      ? {
          id: Number(shipping.locker_id),
          name: shipping.locker_name,
          address: shipping.locker_address,
          city: shipping.locker_city,
          county: shipping.locker_county,
        }
      : null;

  const locker = input.lockerAles ?? lockerDinComanda;
  const areLocker = !!locker && Number.isFinite(locker.id) && locker.id > 0;

  /*
   * ⚠ La livrarea in easybox, destinatarul de pe AWB e LOCKERUL, nu casa omului — la fel ca
   * in modulul lor oficial. Iar e-mailul ramane al CUMPARATORULUI: acolo primeste codul cu
   * care deschide dulapul.
   */
  const enriched: SamedayAwbInput = areLocker
    ? {
        ...input,
        lockerId: locker!.id,
        recipientCity: locker!.city || input.recipientCity,
        recipientCounty: locker!.county || input.recipientCounty,
        recipientAddress:
          [locker!.address, locker!.name].filter(Boolean).join(" - ") || input.recipientAddress,
        recipientEmail: input.recipientEmail ?? (order.customer_email ?? undefined),
      }
    : { ...input, lockerId: undefined, recipientEmail: input.recipientEmail ?? (order.customer_email ?? undefined) };

  const r = await cuRegistru(
    createAdminClient(),
    { businessId, orderId, fel: "awb", furnizor: "sameday", cheie: cheieOperatie("awb", "sameday", orderId) },
    async () => {
      const creat = await createSamedayAwb(config, enriched);
      /* ⚠ Referinta din registru ramane NUMARUL, nu obiectul: pe ramura `deja` ea se adopta
         si se scrie inapoi pe comanda, iar acolo se asteapta un sir. */
      return { referinta: creat.awbNumber, valoare: creat };
    },
    verdictFurnizor,
    /*
     * ⚠ NU SE DA `legaturaVie`, si nu din uitare.
     *
     * Aici statea `async () => !!orderData.<coloana>` — dar `orderData` se
     * citeste INAINTE, iar mai sus exista un `return` care opreste totul daca
     * numarul exista deja. Deci in clipa apelului predicatul era garantat fals:
     * literalmente `async () => false`.
     *
     * Iar `false` pe ramura `deja` inseamna „elibereaza slotul si REIA", adica
     * inca un apel la curier. Si `deja` apare exact in cazul pentru care exista
     * registrul: AWB creat, scrierea pe comanda pierduta. Adica paza se
     * transforma tocmai acolo in AL DOILEA COLET REAL, FACTURAT.
     *
     * Fara callback, `deja` ADOPTA referinta din registru si o scrie inapoi pe
     * comanda — ce face codul de mai jos oricum.
     *
     * ⚠ Schimbul, pe fata: cazul prost devine o comanda care poarta un AWB
     * anulat (vizibil, si deja strigat in `/admin/logs` de `marcheazaAnulata`
     * cand eliberarea pica), in loc de un colet platit de doua ori.
     */
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

  const creat = r.fel === "facut" ? r.valoare : null;
  const awbNumber = creat?.awbNumber ?? (r.referinta ?? "");

  /*
   * ⚠ SE SCRIE TOT CE NE-AU DAT, nu doar numarul.
   *
   * `awbCost` e costul adevarat al transportului si nu se afla din nicio alta parte —
   * estimarea de la checkout e o estimare. Iar `lockerReturnChargeCode` ei il dau O SINGURA
   * DATA, aici: nesalvat, cumparatorul nu-si mai poate preda niciodata returul in easybox.
   *
   * ⚠ `sameday_awb_at` e marcajul dupa care umbla cronul de urmarire. Fara el, comanda n-ar
   * fi privita niciodata — vezi migratia `2026-10-18-sameday-complet.sql`.
   */
  const petic: Record<string, unknown> = {
    sameday_awb_number: awbNumber,
    sameday_awb_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (creat?.awbCost != null) petic.sameday_awb_cost = creat.awbCost;
  if (creat?.lockerReturnChargeCode) petic.sameday_locker_charge_code = creat.lockerReturnChargeCode;

  const { error: eScriere, data: randuri } = await supabase.from("orders")
    .update(petic as never).eq("id", orderId).select("id");

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
    dupaRaspuns(() => enqueueAboutYouShip(businessId, orderId), "enqueueAboutYouShip", businessId);
  }

  return {
    awbNumber,
    awbCost: creat?.awbCost ?? null,
    /* ⚠ Se intoarce ca sa fie ARATAT pe loc: e singura data cand ei il dau. */
    lockerReturnChargeCode: creat?.lockerReturnChargeCode ?? null,
  };
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

    const { data: randuri, error: eScriere } = await supabase.from("orders").update({
      sameday_awb_number: null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("business_id", businessId).select("id");
    /*
     * Scrierea locala se VERIFICA, dar esecul ei NU devine eroare catre om.
     *
     * AWB-ul e deja ANULAT la curier. Un „Eroare la actualizare" l-ar trimite pe
     * comerciant sa apese din nou, iar a doua anulare cade la curier cu „AWB
     * inexistent" si arata ca un sistem stricat. Deci se raporteaza succes si se
     * striga in `/admin/logs`: acolo ramane singura dovada ca o comanda mai poarta
     * un numar de transport care nu mai exista.
     *
     * `.eq("business_id")` nu e decorativ: fara el, zero randuri ar putea insemna
     * si „alta comanda", nu doar „scriere pierduta", si alarma ar fi ambigua.
     */
    if (eScriere || !randuri || randuri.length === 0) {
      await logError({
        action: "sameday.deleteAwb",
        message: `AWB Sameday ${orderData.sameday_awb_number} a fost anulat la curier, dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}`,
        details: { orderId, businessId, awb: orderData.sameday_awb_number, code: eScriere?.code },
        businessId, severity: "critical",
      });
    }

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
