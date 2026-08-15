"use server";

import { randomBytes } from "node:crypto";
import { enqueueAboutYouShip } from "@/lib/aboutyou/queue";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { secretDinConfig } from "@/lib/integrari/secret-server";
import { logError } from "@/lib/error-logger";
import { cheieOperatie, cuRegistru, deblocheazaOperatie, marcheazaAnulata, operatiiAtarnate } from "@/lib/operatii/registru";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import {
  anuleaza,
  catalogCurieri,
  coteaza,
  creeazaComanda,
  eticheta,
  innoshipGata,
  probaConexiune,
  puncteFixe,
  urmarestePeComenzi,
  type CurierInnoship,
  type InnoshipConfig,
  type OfertaInnoship,
} from "@/lib/innoship/client";
import {
  avertismenteExpediere,
  corpComanda,
  lipsuriExpediere,
  type AdresaComanda,
  type DateExpediere,
  type FelLivrare,
} from "@/lib/innoship/expediere";
import { cheileRaspunsului, puncteIncomplete } from "@/lib/innoship/puncte";
import { descriereRamburs, descriereStatus } from "@/lib/innoship/statusuri";
import { ziuaInRomania } from "@/lib/utils/zile-lucratoare";
import type { Json } from "@/types/database.types";

/**
 * Actiunile Innoship.
 *
 * ⚠ Spre deosebire de Posta Romana, aici contractul e complet: raspunsuri
 * documentate, endpointuri de proba care nu creeaza nimic (`/validate`,
 * `/simulate`) si credentiale de test. Deci integrarea se poate verifica pe fir
 * cap-coada inainte de prima expediere reala.
 *
 * ⚠ Si mai exista ceva ce NU are nicio alta integrare din platforma: urmarirea
 * dupa ID-UL NOSTRU de comanda. Vezi `verificaInnoshipAwbAction` — ea inchide,
 * cu o citire, fereastra „nu stiu daca s-a creat" pe care in alta parte o poate
 * inchide doar un om care se uita in panoul furnizorului.
 */

// ─── Configurare ──────────────────────────────────────────────────────────────

type Proprietar =
  | { ok: false; error: string }
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> };

async function proprietar(businessId: string): Promise<Proprietar> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { ok: false, error: "Acces interzis" };

  return { ok: true, supabase };
}

/**
 * Configurarea, citita cu SERVICE ROLE.
 *
 * ⚠ Vederea `public.store_settings` nu decripteaza pentru `authenticated`, deci pe
 * clientul comerciantului cheia ar sosi `enc.v1.…`. Service role ocoleste RLS —
 * de aceea proprietatea se verifica INAINTE, la fiecare apelant.
 */
async function configDinBaza(businessId: string): Promise<InnoshipConfig | null> {
  const { data } = await createAdminClient()
    .from("store_settings").select("innoship_config").eq("business_id", businessId).single();
  return (data?.innoship_config ?? null) as InnoshipConfig | null;
}

export async function saveInnoshipConfig(
  businessId: string,
  config: InnoshipConfig,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  // Configul vechi se citeste cu SERVICE ROLE: pe clientul comerciantului campurile
  // secrete sosesc ca siruri `enc.v1.…`, iar `pastreazaSecretele` le-ar „pastra" asa.
  // Proprietatea magazinului e dovedita mai sus. Vezi src/lib/integrari/secrete.ts.
  const { data: vechi } = await createAdminClient()
    .from("store_settings").select("innoship_config").eq("business_id", businessId).maybeSingle();

  const configFinal = pastreazaSecretele("innoship_config", config, vechi?.innoship_config) as Record<string, unknown>;

  /*
   * ⚠ Secretul de webhook se naste o singura data, la prima salvare, si nu se mai
   * schimba niciodata singur.
   *
   * E partea secreta din URL-ul pe care comerciantul il lipeste in portalul
   * Innoship. Regenerat la fiecare salvare, orice modificare de configurare — o
   * bifa, un format de eticheta — ar rupe tacut urmarirea prin webhook: Innoship
   * ar continua sa trimita catre un URL pe care nu-l mai recunoaste nimeni, iar
   * comenzile ar ramane in urma fara nicio eroare nicaieri.
   */
  if (!configFinal.webhook_secret) configFinal.webhook_secret = randomBytes(24).toString("base64url");

  const { error } = await supabase.from("store_settings").update({
    innoship_config: configFinal as unknown as Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectInnoship(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };

  const { error } = await ctx.supabase.from("store_settings").update({
    innoship_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

/**
 * Proba de conexiune.
 *
 * ⚠ Merge pe `GET /api/Courier/All` — o CITIRE pura, care nu creeaza nimic, deci
 * butonul se poate apasa de zece ori. Si aduce exact lista de care are nevoie
 * configurarea ca sa poata filtra curierii: cu ~230 disponibili, filtrul nu e o
 * inlesnire, e o conditie de lizibilitate a checkout-ului.
 */
export async function testInnoshipConnectionAction(
  businessId: string,
  config: InnoshipConfig,
): Promise<{ ok: true; curieri: CurierInnoship[] } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const cheie = await secretDinConfig(businessId, "innoship_config", "api_key", config.api_key);
  if (!cheie) return { ok: false, error: "Completeaza cheia de API." };

  const r = await probaConexiune({ ...config, api_key: cheie });
  return r.ok ? { ok: true, curieri: r.curieri } : { ok: false, error: r.eroare };
}

/**
 * Diagnostic pentru pagina de configurare.
 *
 * ⚠ Masoara chiar singurul contract pe care specificatia nu-l descrie: forma
 * randului din `FixedLocations`. Cate puncte au ramas fara denumire inseamna „am
 * ghicit gresit numele campurilor", iar lista de chei arata cum se cheama in
 * realitate — asa presupunerile din `puncte.ts` se pot scurta la adevar.
 */
export async function diagnosticInnoshipAction(
  businessId: string,
): Promise<
  | { ok: true; curieri: number; puncte: number; puncteFaraNume: number; cheiPuncte: { cheie: string; exemplu: string }[] }
  | { ok: false; error: string }
> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const config = await configDinBaza(businessId);
  if (!innoshipGata(config)) return { ok: false, error: "Innoship nu este configurat complet." };

  try {
    const [curieri, puncte] = await Promise.all([
      catalogCurieri(config),
      puncteFixe(config, { countryCode: "RO" }),
    ]);
    return {
      ok: true,
      curieri: curieri.length,
      puncte: puncte.length,
      puncteFaraNume: puncteIncomplete(puncte),
      cheiPuncte: cheileRaspunsului(puncte),
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─── Context pentru AWB ───────────────────────────────────────────────────────

async function configSiComanda(businessId: string, orderId: string) {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  const admin = createAdminClient();
  const [{ data: settings }, { data: order }] = await Promise.all([
    admin.from("store_settings").select("innoship_config").eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = (settings?.innoship_config ?? null) as InnoshipConfig | null;
  if (!innoshipGata(config)) {
    return {
      error:
        "Innoship nu e configurat complet. Ai nevoie de cheia de API si de id-ul depozitului "
        + "(„External Client Location” din portalul lor).",
    };
  }

  return { supabase, admin, config, order };
}

export type DateAwbInnoship = {
  destinatar: AdresaComanda;
  greutateKg: number;
  continut?: string | null;
  ramburs?: number;
  valoareDeclarata?: number;
  numarColete?: number;
  felLivrare: FelLivrare;
  fixedLocationId?: string | null;
  /** Curierul ales de cumparator in checkout. */
  courierId?: number | null;
  serviceId?: number | null;
  /** A treia parte a cheii ofertei. Poate lipsi legitim: nu toate au varianta. */
  optionId?: string | null;
  /**
   * Numele ofertei alese, doar pentru afisare.
   *
   * ⚠ Se duc pana pe comanda fiindca altfel panoul n-ar avea ce arata fara o
   * citire in nomenclator: `OrderResponse` intoarce `courierServiceName`, dar nu si
   * numele curierului. Acelasi rationament ca la `woot_service_name`.
   */
  courierName?: string | null;
  serviceName?: string | null;
  ziuaExpedierii?: string | null;
};

/** Referinta noastra, si cheia cu care putem intreba mai tarziu „s-a creat?". */
function referintaComenzii(order: { id: string; order_number?: string | null }): string {
  return String(order.order_number ?? order.id);
}

function dateExpedierii(
  date: DateAwbInnoship,
  order: { id: string; order_number?: string | null },
): DateExpediere {
  return {
    destinatar: date.destinatar,
    greutateKg: date.greutateKg,
    continut: date.continut,
    ramburs: date.ramburs,
    valoareDeclarata: date.valoareDeclarata,
    numarColete: date.numarColete,
    felLivrare: date.felLivrare,
    fixedLocationId: date.fixedLocationId,
    courierId: date.courierId,
    serviceId: date.serviceId,
    ziuaExpedierii: (date.ziuaExpedierii ?? "").trim() || ziuaInRomania(),
    externalOrderId: referintaComenzii(order),
  };
}

// ─── Cotare ───────────────────────────────────────────────────────────────────

/**
 * Ofertele pentru o comanda, din panou.
 *
 * ⚠ Citire pura la efect: `POST /api/Price` nu creeaza nimic. Dar E un apel platit
 * pe contul comerciantului, deci nu se cheama in bucla.
 */
export async function coteazaInnoshipAction(
  businessId: string,
  orderId: string,
  date: DateAwbInnoship,
): Promise<{ ok: true; oferte: OfertaInnoship[] } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { config, order } = ctx;

  const d = dateExpedierii({ ...date, courierId: null }, order);
  const lipsuri = lipsuriExpediere(d, config);
  if (lipsuri.length) return { ok: false, error: `Nu se pot cere preturi: ${lipsuri.join("; ")}.` };

  try {
    return { ok: true, oferte: await coteaza(config, corpComanda(d, config)) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─── Emiterea AWB ─────────────────────────────────────────────────────────────

export async function createInnoshipAwbAction(
  businessId: string,
  orderId: string,
  date: DateAwbInnoship,
): Promise<{ awb: string; avertismente: string[] } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, admin, config, order } = ctx;

  const comanda = order as typeof order & { innoship_awb_number?: string | null };
  if (comanda.innoship_awb_number) return { error: "AWB-ul Innoship a fost deja creat pentru comanda asta." };

  const d = dateExpedierii(date, order);
  /*
   * ⚠ Tot ce se poate verifica local se verifica INAINTE de rezervarea din
   * registru: o comanda careia ii lipseste lockerul n-are de ce sa ocupe un slot.
   */
  const lipsuri = lipsuriExpediere(d, config);
  if (lipsuri.length) return { error: `Nu se poate emite AWB-ul: ${lipsuri.join("; ")}.` };

  const avertismente = avertismenteExpediere(d);
  const corp = corpComanda(d, config);

  const r = await cuRegistru(
    admin,
    { businessId, orderId, fel: "awb", furnizor: "innoship", cheie: cheieOperatie("awb", "innoship", orderId) },
    async () => {
      const raspuns = await creeazaComanda(config, corp);
      const awb = (raspuns.courierShipmentId ?? "").trim();

      /*
       * ⚠ Spre deosebire de Posta Romana, aici raspunsul E documentat: AWB-ul vine
       * in `courierShipmentId`. Deci lipsa lui nu mai e „nu stim ce forma are
       * raspunsul", ci chiar un raspuns anormal — si tot `necunoscut` ramane,
       * fiindca expedierea poate exista.
       *
       * Diferenta e ca aici omul are ce apasa dupa: `verificaInnoshipAwbAction`
       * intreaba Innoship dupa ID-ul NOSTRU de comanda si lamureste singura.
       */
      if (!awb) {
        throw new Error(
          "Innoship a raspuns la emitere fara numar AWB. Apasa „Verifica la Innoship” pe comanda: "
          + "expedierea poate exista deja acolo.",
        );
      }

      return {
        referinta: awb,
        detalii: {
          clientOrderId: raspuns.clientOrderId ?? null,
          courier: raspuns.courier ?? null,
          courierServiceName: raspuns.courierServiceName ?? null,
          trackPageUrl: raspuns.trackPageUrl ?? null,
          pret: (raspuns.price ?? null) as Json,
        } as Json,
        valoare: { awb, raspuns },
      };
    },
    verdictFurnizor,
    /*
     * ⚠ NU se da `legaturaVie`, aceeasi hotarare ca la GLS, Pall-Ex si Posta:
     * `false` pe ramura `deja` inseamna „elibereaza slotul si REIA", adica a doua
     * expediere reala.
     */
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

  const dinRegistru = (r.fel === "deja" ? r.detalii : null) as Record<string, unknown> | null;
  const awb = r.fel === "facut" ? r.valoare.awb : (r.referinta ?? "");
  const raspuns = r.fel === "facut" ? r.valoare.raspuns : null;

  if (!awb) {
    return { error: "Operatia figureaza ca reusita in registru, dar fara numar AWB. Apasa „Verifica la Innoship”." };
  }

  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    innoship_awb_number: awb,
    innoship_order_id: raspuns?.clientOrderId ?? (Number(dinRegistru?.clientOrderId) || null),
    /*
     * ⚠ CU CADERE PE CURIERUL CERUT, si nu de prisos.
     *
     * `innoship_courier_id` e OBLIGATORIU in adresa etichetei si a anularii. Daca
     * raspunsul lor n-ar contine `courier` — camp optional in schema —, comanda ar
     * ramane cu un AWB pe care nu se mai poate nici tipari, nici anula. Curierul
     * pe care l-am CERUT e cea mai buna a doua sursa: la emitere il trimitem
     * mereu, ales de cumparator in checkout.
     */
    innoship_courier_id: raspuns?.courier ?? (Number(dinRegistru?.courier) || null) ?? corp.courierId ?? null,
    innoship_courier_name: date.courierName ?? null,
    innoship_service_id: corp.serviceId,
    innoship_option_id: date.optionId ?? null,
    innoship_service_name: raspuns?.courierServiceName ?? (dinRegistru?.courierServiceName as string | null) ?? date.serviceName ?? null,
    innoship_track_url: raspuns?.trackPageUrl ?? (dinRegistru?.trackPageUrl as string | null) ?? null,
    innoship_awb_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  /*
   * ⚠ Expedierea EXISTA la Innoship. Un esec de scriere nu are voie sa se intoarca
   * la om ca eroare — l-ar trimite sa apese din nou, iar registrul ar raspunde
   * „deja" si ar reface doar scrierea.
   */
  const scris = !eScriere && !!randuri && randuri.length > 0;
  if (!scris) {
    await logError({
      action: "innoship.createAwb",
      message: `AWB Innoship creat (${awb}), dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}. Numarul e in registrul de operatii externe; o noua apasare il adopta si reface scrierea.`,
      details: { orderId, businessId, awb, code: eScriere?.code },
      businessId,
      severity: "critical",
    });
  } else {
    void enqueueAboutYouShip(businessId, orderId);
  }

  return { awb, avertismente };
}

/**
 * „Verifica la Innoship" — inchide fereastra „nu stiu daca s-a creat".
 *
 * ═══ ⚠ ASTA NU EXISTA LA NICIO ALTA INTEGRARE DIN PLATFORMA ═══
 *
 * Cand o emitere pica nesigur (timeout, 5xx), registrul blocheaza si scoate cazul
 * la om. Peste tot altundeva, singura iesire e ca cineva sa deschida panoul
 * furnizorului si sa se uite cu ochii — apoi sa apese „deblocheaza", ASUMANDU-SI
 * ca expedierea nu exista.
 *
 * Innoship poate fi intrebat dupa ID-UL NOSTRU de comanda
 * (`POST /api/Track/by-external-order-id`), deci raspunsul se afla dintr-o citire:
 *
 *   gasita     -> se scrie AWB-ul pe comanda. Randul din registru ramane cum e;
 *                 nu mai conteaza, fiindca de acum garda de pe comanda opreste
 *                 orice reemitere inainte sa se ajunga la registru.
 *   negasita   -> se deblocheaza randul, si acum e o DOVADA, nu o presupunere.
 *   nu se stie -> nu se atinge nimic. O cadere de retea n-are voie sa treaca drept
 *                 dovada ca expedierea nu exista.
 */
export async function verificaInnoshipAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ ok: true; gasit: boolean; awb: string | null; mesaj: string } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { supabase, admin, config, order } = ctx;

  const comanda = order as typeof order & { innoship_awb_number?: string | null };
  if (comanda.innoship_awb_number) {
    return { ok: true, gasit: true, awb: comanda.innoship_awb_number, mesaj: "Comanda are deja AWB." };
  }

  const referinta = referintaComenzii(order);
  let gasite;
  try {
    gasite = await urmarestePeComenzi(config, [referinta]);
  } catch (e) {
    return {
      ok: false,
      error:
        `Nu s-a putut intreba Innoship (${(e as Error).message}). Nu s-a schimbat nimic — `
        + "incearca din nou peste cateva minute.",
    };
  }

  const potrivita = gasite.find((g) => (g.externalOrderId ?? "").trim() === referinta);
  const awb = (potrivita?.shipmentAwb ?? "").trim();

  if (potrivita && awb) {
    const { error } = await supabase.from("orders").update({
      innoship_awb_number: awb,
      innoship_order_id: potrivita.orderId ?? null,
      innoship_courier_id: potrivita.courier ?? null,
      innoship_track_url: potrivita.trackUrl ?? null,
      innoship_awb_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("business_id", businessId);

    if (error) return { ok: false, error: `Expedierea exista la Innoship (${awb}), dar nu s-a putut scrie pe comanda: ${error.message}` };

    void enqueueAboutYouShip(businessId, orderId);
    return {
      ok: true, gasit: true, awb,
      mesaj: `Expedierea exista la Innoship. AWB-ul ${awb} a fost pus pe comanda.`,
    };
  }

  /*
   * Nu exista acolo. ACUM deblocarea e intemeiata pe o verificare, nu pe o
   * presupunere — deci se poate face fara sa i se ceara omului sa-si asume ceva
   * ce n-are cum sa stie.
   */
  const atarnate = await operatiiAtarnate(admin, businessId, orderId);
  const aNoastra = atarnate.find((o) => o.cheie === cheieOperatie("awb", "innoship", orderId));
  if (!aNoastra) {
    return { ok: true, gasit: false, awb: null, mesaj: "Innoship nu are nicio expediere pentru comanda asta. Poti emite AWB-ul." };
  }

  const r = await deblocheazaOperatie(
    admin, businessId, aNoastra.id,
    "verificat automat prin Track/by-external-order-id: expedierea nu exista la Innoship",
  );
  if (!r.ok) return { ok: false, error: r.mesaj };

  return {
    ok: true, gasit: false, awb: null,
    mesaj: "Innoship nu are nicio expediere pentru comanda asta. Blocajul a fost ridicat — poti emite din nou.",
  };
}

// ─── Anulare ──────────────────────────────────────────────────────────────────

/**
 * Anuleaza expedierea la Innoship si scoate numarul de pe comanda.
 *
 * ⚠ Aici anularea CHIAR exista in API (`DELETE /api/Order/{courierId}/awb/{awb}`),
 * spre deosebire de Posta Romana, unde din panou se putea doar dezlega numarul.
 */
export async function deleteInnoshipAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, admin, config, order } = ctx;

  const comanda = order as typeof order & {
    innoship_awb_number?: string | null;
    innoship_courier_id?: number | null;
  };
  const awb = (comanda.innoship_awb_number ?? "").trim();
  if (!awb) return { error: "Comanda nu are AWB de la Innoship." };

  /*
   * ⚠ `courierId` e obligatoriu in ADRESA anularii. Fara el n-avem ce chema —
   * de aia se salveaza pe comanda la emitere.
   */
  const courierId = Number(comanda.innoship_courier_id);
  if (!Number.isInteger(courierId) || courierId <= 0) {
    return {
      error:
        "Comanda n-are curierul Innoship salvat, iar anularea il cere. Anuleaza expedierea "
        + "din portalul Innoship si scrie-ne, ca s-o scoatem si de pe comanda.",
    };
  }

  const r = await anuleaza(config, courierId, awb);
  if (!r.sters) return { error: `Innoship n-a putut anula expedierea: ${r.motiv}` };

  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    innoship_awb_number: null,
    innoship_order_id: null,
    innoship_courier_id: null,
    innoship_courier_name: null,
    innoship_service_id: null,
    innoship_option_id: null,
    innoship_service_name: null,
    innoship_track_url: null,
    innoship_awb_at: null,
    innoship_status_code: null,
    innoship_cod_status_code: null,
    innoship_status_checked_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  if (eScriere || !randuri?.length) {
    return { error: `Expedierea a fost anulata la Innoship, dar numarul n-a putut fi scos de pe comanda: ${eScriere?.message ?? "niciun rand modificat"}` };
  }

  /*
   * ⚠ Eliberarea slotului vine DUPA scrierea pe comanda, si numai daca aceasta a
   * prins un rand. Invers, am fi deschis reemiterea pentru o comanda care inca
   * poarta AWB-ul vechi.
   */
  await marcheazaAnulata(admin, businessId, cheieOperatie("awb", "innoship", orderId));
  return { success: true };
}

// ─── Eticheta ─────────────────────────────────────────────────────────────────

/**
 * Etichetele unei expedieri.
 *
 * ⚠ `labels` e o LISTA: o expediere cu mai multe colete are mai multe etichete.
 * Se intorc toate, iar cine le arata trebuie sa stie asta din prima.
 */
export async function getInnoshipLabelAction(
  businessId: string,
  orderId: string,
): Promise<{ ok: true; etichete: string[]; tip: string | null } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { config, order } = ctx;

  const comanda = order as typeof order & {
    innoship_awb_number?: string | null;
    innoship_courier_id?: number | null;
  };
  const awb = (comanda.innoship_awb_number ?? "").trim();
  const courierId = Number(comanda.innoship_courier_id);
  if (!awb) return { ok: false, error: "Comanda nu are AWB de la Innoship." };
  if (!Number.isInteger(courierId) || courierId <= 0) {
    return { ok: false, error: "Comanda n-are curierul Innoship salvat, iar eticheta il cere in adresa." };
  }

  try {
    const r = await eticheta(config, courierId, awb);
    if (r.etichete.length === 0) return { ok: false, error: "Innoship n-a intors nicio eticheta pentru expedierea asta." };
    return { ok: true, etichete: r.etichete, tip: r.tip };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─── Urmarire, pentru panou ───────────────────────────────────────────────────

export type StareAfisata = { cod: number | null; descriere: string; data: string | null; localitate: string | null };

export async function getInnoshipTraceAction(
  businessId: string,
  orderId: string,
): Promise<
  | { ok: true; stari: StareAfisata[]; ramburs: StareAfisata[]; trackUrl: string | null }
  | { ok: false; error: string }
> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { config, order } = ctx;

  const comanda = order as typeof order & { innoship_awb_number?: string | null };
  if (!comanda.innoship_awb_number) return { ok: false, error: "Comanda nu are AWB de la Innoship." };

  try {
    const gasite = await urmarestePeComenzi(config, [referintaComenzii(order)]);
    const u = gasite[0];
    if (!u) return { ok: true, stari: [], ramburs: [], trackUrl: null };

    const laStare = (s: { clientStatusId?: number | null; clientStatusDescription?: string | null; eventDate?: string | null; localityName?: string | null }, ramburs: boolean): StareAfisata => ({
      cod: Number.isInteger(s.clientStatusId) ? Number(s.clientStatusId) : null,
      descriere: ramburs
        ? descriereRamburs(s.clientStatusId, s.clientStatusDescription)
        : descriereStatus(s.clientStatusId, s.clientStatusDescription),
      data: (s.eventDate ?? "").trim() || null,
      localitate: (s.localityName ?? "").trim() || null,
    });

    return {
      ok: true,
      stari: (u.history ?? []).map((s) => laStare(s, false)).reverse(),
      ramburs: (u.cashOnDeliveryHistory ?? []).map((s) => laStare(s, true)).reverse(),
      trackUrl: (u.trackUrl ?? "").trim() || null,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
