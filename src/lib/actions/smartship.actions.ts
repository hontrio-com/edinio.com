"use server";

import { enqueueAboutYouShip } from "@/lib/aboutyou/queue";
import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { secretDinConfig } from "@/lib/integrari/secret-server";
import { logError } from "@/lib/error-logger";
import { cheieOperatie, cuRegistru, deblocheazaOperatie, marcheazaAnulata, operatiiAtarnate } from "@/lib/operatii/registru";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import {
  acceptaOfertaTransport, anuleaza, cautaDupaComanda, cereOfertaTransport, coteaza, creeazaAwb,
  deconturi, detaliiDecont, disponibilitateRidicare, eticheta, facturi,
  lockereEasybox, lockereFanbox, ofertaTransport, probaConexiune, programeazaRidicare,
  refuzaOfertaTransport, smartshipGata, sold, urmareste,
  type DecontSmartship, type ExpeditorSalvat, type FacturaSmartship, type FormatEticheta,
  type LinieDecont, type OfertaTransport, type RidicareFedex, type SmartshipConfig, type SoldSmartship,
} from "@/lib/smartship/client";
import {
  avertismenteExpediere, corpCotare, corpEmitere, lipsuriExpediere, referintaComenzii,
  type AdresaComanda, type DateExpediere, type FelLivrare,
} from "@/lib/smartship/expediere";
import { rezolvaLocalitatea } from "@/lib/smartship/geo";
import { cheileRaspunsului, lockereIncomplete } from "@/lib/smartship/lockere";
import { ofertePosibile, type OfertaAratata } from "@/lib/smartship/preturi";
import { descriereStatus } from "@/lib/smartship/statusuri";
import type { Json } from "@/types/database.types";

/**
 * Actiunile SmartShip.
 *
 * ⚠ SmartShip NU are mediu de proba si NU are endpoint de validare: fiecare
 * emitere e reala si facturata din prima. Spre deosebire de Innoship
 * (`/validate`, `/simulate`) si de Packeta (`packetAttributesValid`), aici nu
 * exista niciun apel care sa spuna „datele astea ar trece" fara sa creeze nimic.
 *
 * De aceea TOT ce se poate verifica local se verifica INAINTE de rezervarea din
 * registru — vezi `lipsuriExpediere` — iar cotarea (`POST /cost`, care nu creeaza
 * nimic) e pasul dinaintea emiterii, ca la ceilalti brokeri.
 *
 * ⚠ In schimb au ceva ce n-are decat Innoship: cautarea dupa ID-UL NOSTRU de
 * comanda. Vezi `verificaSmartshipAwbAction` — inchide, cu o citire, fereastra
 * „nu stiu daca s-a creat".
 */

// ─── Proprietate si configurare ───────────────────────────────────────────────

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
 * clientul comerciantului cheia ar sosi `enc.v1.…` — un sir plauzibil care ar
 * produce 301 la fiecare apel, fara ca nimic sa spuna de ce. Service role
 * ocoleste RLS, de aceea proprietatea se verifica INAINTE, la fiecare apelant.
 * Vezi [[criptare-credentiale-vedere]].
 */
async function configDinBaza(businessId: string): Promise<SmartshipConfig | null> {
  /* ⚠ `error` se ia si se ARUNCA. Ignorat, o citire cazuta iesea ca „nicio configurare",
     iar apelantii scriu apoi INTREGUL obiect inapoi — deci golul inchipuit s-ar fi scris
     peste acreditari. Vezi incidentul Trendyol din 24.08.2026 si `pazeste_secretele`.
     ⚠ `maybeSingle`: un magazin fara rand e legitim; o citire cazuta nu e. */
  const { data, error } = await createAdminClient()
    .from("store_settings").select("smartship_config").eq("business_id", businessId).maybeSingle();
  if (error) throw new Error(`Configurarea nu s-a putut citi: ${error.message}`);
  return (data?.smartship_config ?? null) as SmartshipConfig | null;
}

export async function saveSmartshipConfig(
  businessId: string,
  config: SmartshipConfig,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  // Configul vechi se citeste cu SERVICE ROLE: pe clientul comerciantului campurile
  // secrete sosesc ca siruri `enc.v1.…`, iar `pastreazaSecretele` le-ar „pastra" asa.
  const { data: vechi } = await createAdminClient()
    .from("store_settings").select("smartship_config").eq("business_id", businessId).maybeSingle();

  const configFinal = pastreazaSecretele("smartship_config", config, vechi?.smartship_config);

  const { error } = await supabase.from("store_settings").update({
    smartship_config: configFinal as unknown as Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectSmartship(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };

  const { error } = await ctx.supabase.from("store_settings").update({
    smartship_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

/**
 * Proba de conexiune.
 *
 * ⚠ Aduce si EXPEDITORII, nu doar un „merge". `sender.city` e un id numeric din
 * nomenclatorul lor si e cel mai usor camp de gresit din toata configurarea —
 * scris de mana, un id gresit trimite coletele in alt oras fara nicio eroare.
 * `/account/senders` il da gata (`localitate_id`), impreuna cu sectorul.
 */
export async function testSmartshipConnectionAction(
  businessId: string,
  cheieDinFormular?: string,
): Promise<
  | { ok: true; expeditori: ExpeditorSalvat[]; sold: SoldSmartship | null }
  | { ok: false; error: string }
> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const cheie = await secretDinConfig(businessId, "smartship_config", "api_key", cheieDinFormular);
  if (!cheie) return { ok: false, error: "Completeaza cheia de API." };

  const salvata = await configDinBaza(businessId);
  const r = await probaConexiune({ ...(salvata ?? { enabled: true, api_key: "" }), api_key: cheie });
  return r.ok ? { ok: true, expeditori: r.expeditori, sold: r.sold } : { ok: false, error: r.eroare };
}

export async function getSmartshipSoldAction(
  businessId: string,
): Promise<{ ok: true; sold: SoldSmartship } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const config = await configDinBaza(businessId);
  if (!config?.api_key) return { ok: false, error: "SmartShip nu e conectat." };

  try {
    return { ok: true, sold: await sold(config) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Curierii pe care ii da contul, pentru filtrul din configurare.
 *
 * ⚠ NU EXISTA un endpoint de nomenclator de curieri. Tabelul din documentatia lor
 * e „generat automat din platforma" si sta doar pe pagina web — deci singura cale
 * de a afla ce curieri are contul ASTA e o cotare de proba.
 *
 * ⚠ E o citire pura: `/cost` nu creeaza nimic si nu costa nimic. Dar ce intoarce
 * depinde de RUTA cerută (greutate, ramburs, destinatie), deci lista poate fi mai
 * scurta decat cea reala — ecranul o spune, ca omul sa nu creada ca un curier
 * lipseste din cont cand de fapt lipseste doar de pe ruta de proba.
 */
export async function getSmartshipCurieriAction(
  businessId: string,
  destinatie?: { oras?: string; judet?: string },
): Promise<{ ok: true; curieri: { id: number; nume: string; siContractPropriu: boolean }[] } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const config = await configDinBaza(businessId);
  if (!smartshipGata(config)) {
    return { ok: false, error: "Completeaza intai cheia de API si adresa de ridicare." };
  }

  const oras = (destinatie?.oras ?? "").trim() || "Cluj-Napoca";
  const judet = (destinatie?.judet ?? "").trim() || "Cluj";

  try {
    const loc = await rezolvaLocalitatea(config, oras, judet);
    if (!loc) return { ok: false, error: `SmartShip nu recunoaste localitatea ${oras}, ${judet}.` };

    const date: DateExpediere = {
      destinatar: {
        /* ⚠ Substituenti: cotarea depinde de destinatie, greutate si ramburs.
           Si numele are DOUA cuvinte dinadins — e regula lor de validare. */
        nume: "Client Nou",
        strada: "Strada Principala",
        numar: "1",
        oras,
        judet,
        telefon: "0700000000",
        cityId: loc.cityId,
        sector: loc.sector,
      },
      greutateKg: 1,
      felLivrare: "domiciliu",
      numarColete: 1,
    };

    const lipsuri = lipsuriExpediere(date, config);
    if (lipsuri.length) return { ok: false, error: `Nu se pot cere preturi: ${lipsuri.join("; ")}.` };

    const r = await coteaza(config, corpCotare(date, config));

    /*
     * ⚠ Se DEDUPLICA pe id-ul curierului, desi `/cost` poate intoarce doua linii
     * pentru acelasi curier (una pe contractul comerciantului, una pe cel
     * SmartShip). Motivul: filtrul `curieri_permisi` e o lista de ID-URI — el
     * spune „ce curieri se ofera", nu „pe ce contract". Lasate doua randuri,
     * panoul ar arata doua casute care se bifeaza IMPREUNA, iar omul ar crede ca
     * poate alege contractul de acolo.
     */
    const peId = new Map<number, { id: number; nume: string; siContractPropriu: boolean }>();
    for (const o of ofertePosibile(r.costs)) {
      const existent = peId.get(o.courierId);
      if (existent) {
        existent.siContractPropriu ||= o.contractPropriu;
        continue;
      }
      peId.set(o.courierId, {
        id: o.courierId,
        nume: o.numeCurier || `Curier ${o.courierId}`,
        siContractPropriu: o.contractPropriu,
      });
    }
    return { ok: true, curieri: [...peId.values()] };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Diagnostic pentru pagina de configurare.
 *
 * ⚠ Masoara chiar singura necunoscuta din tot contractul lor: forma randului din
 * `/geolocation/easybox` si `/geolocation/fanbox`, singurele doua endpointuri fara
 * exemplu de raspuns. Cate lockere au ramas fara id inseamna „am ghicit gresit
 * numele campurilor", iar lista de chei arata cum se cheama in realitate.
 */
export async function diagnosticSmartshipAction(
  businessId: string,
): Promise<
  | {
      ok: true;
      easybox: number; easyboxFaraId: number;
      fanbox: number; fanboxFaraId: number;
      chei: { cheie: string; exemplu: string }[];
      eroareFanbox: string | null;
    }
  | { ok: false; error: string }
> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const config = await configDinBaza(businessId);
  if (!smartshipGata(config)) return { ok: false, error: "SmartShip nu e configurat complet." };

  try {
    const easybox = await lockereEasybox(config);

    /*
     * ⚠ FANbox merge NUMAI pe contract propriu, deci un esec aici e purtare
     * normala pentru cei mai multi comercianti si n-are voie sa strice tot
     * diagnosticul. Se pastreaza ca text, langa restul.
     */
    let fanbox: Awaited<ReturnType<typeof lockereFanbox>> = [];
    let eroareFanbox: string | null = null;
    try { fanbox = await lockereFanbox(config); }
    catch (e) { eroareFanbox = (e as Error).message; }

    return {
      ok: true,
      easybox: easybox.length,
      easyboxFaraId: lockereIncomplete(easybox),
      fanbox: fanbox.length,
      fanboxFaraId: lockereIncomplete(fanbox),
      chei: cheileRaspunsului(easybox.length > 0 ? easybox : fanbox),
      eroareFanbox,
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
    admin.from("store_settings").select("smartship_config").eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = (settings?.smartship_config ?? null) as SmartshipConfig | null;
  if (!smartshipGata(config)) {
    return {
      error:
        "SmartShip nu e configurat complet. Ai nevoie de cheia de API si de adresa de ridicare "
        + "(apasa „Incarca expeditorii” in configurare).",
    };
  }

  return { supabase, admin, config, order };
}

export type DateAwbSmartship = {
  destinatar: Omit<AdresaComanda, "cityId" | "sector">;
  greutateKg: number;
  continut?: string | null;
  ramburs?: number;
  valoareDeclarata?: number;
  numarColete?: number;
  felLivrare: FelLivrare;
  lockerId?: number | string | null;
  /** Curierul ales de cumparator sau de comerciant. */
  courierId?: number | null;
  /** ⚠ A doua parte a cheii ofertei. Vezi `preturi.ts`. */
  contractPropriu?: boolean;
  courierName?: string | null;
  laSchimb?: boolean;
  notaDpd?: string | null;
};

/**
 * Datele expedierii, cu localitatea rezolvata in id-ul lor.
 *
 * ⚠ Rezolvarea e un apel de retea (cachat), deci se face O SINGURA data si se
 * foloseste si la cotare, si la emitere: doua rezolvari separate ar putea alege
 * localitati diferite daca nomenclatorul se schimba intre ele, iar comanda ar
 * pleca spre alt oras decat cel cotat.
 */
async function pregatesteExpedierea(
  config: SmartshipConfig,
  date: DateAwbSmartship,
  order: { id: string; order_number?: string | null },
  businessId: string,
): Promise<{ ok: true; date: DateExpediere } | { ok: false; error: string }> {
  const d = date.destinatar;
  let loc;
  try {
    loc = await rezolvaLocalitatea(config, d.oras, d.judet);
  } catch (e) {
    return {
      ok: false,
      error: `Nu s-a putut citi nomenclatorul SmartShip de localitati: ${(e as Error).message}`,
    };
  }

  if (!loc) {
    return {
      ok: false,
      error:
        `SmartShip nu recunoaste localitatea „${d.oras}” din judetul „${d.judet ?? "—"}”. `
        + "Corecteaza adresa comenzii — ei livreaza dupa id-ul localitatii, nu dupa nume.",
    };
  }

  return {
    ok: true,
    date: {
      destinatar: { ...d, cityId: loc.cityId, sector: loc.sector },
      greutateKg: date.greutateKg,
      continut: date.continut,
      ramburs: date.ramburs,
      valoareDeclarata: date.valoareDeclarata,
      numarColete: date.numarColete,
      felLivrare: date.felLivrare,
      lockerId: date.lockerId,
      courierId: date.courierId,
      contractPropriu: date.contractPropriu,
      laSchimb: date.laSchimb,
      notaDpd: date.notaDpd,
      orderId: referintaComenzii(order.order_number, businessId),
    },
  };
}

// ─── Cotare ───────────────────────────────────────────────────────────────────

/**
 * Ofertele pentru o comanda, din panou.
 *
 * ⚠ Citire pura la efect: `POST /cost` nu creeaza nimic. Dar E un apel pe contul
 * comerciantului, deci nu se cheama in bucla.
 *
 * ⚠ Cand comanda merge la LOCKER, `/cost` intoarce DOAR varianta la locker si
 * trece peste `curier_preferat` — o spune documentatia lor. Deci lista de aici e
 * a lockerului, si e in regula sa aiba un singur rand.
 */
export async function coteazaSmartshipAction(
  businessId: string,
  orderId: string,
  date: DateAwbSmartship,
): Promise<{ ok: true; oferte: OfertaAratata[]; greutateFacturata: number | null } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { config, order } = ctx;

  /* Fara curier: la cotare raspund cu toti cei care pot duce coletul. */
  const pregatita = await pregatesteExpedierea(config, { ...date, courierId: null }, order, businessId);
  if (!pregatita.ok) return { ok: false, error: pregatita.error };

  const lipsuri = lipsuriExpediere(pregatita.date, config);
  if (lipsuri.length) return { ok: false, error: `Nu se pot cere preturi: ${lipsuri.join("; ")}.` };

  try {
    const r = await coteaza(config, corpCotare(pregatita.date, config));
    return {
      ok: true,
      oferte: ofertePosibile(r.costs, config),
      greutateFacturata: r.greutateCalculata,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─── Emiterea AWB ─────────────────────────────────────────────────────────────

export async function createSmartshipAwbAction(
  businessId: string,
  orderId: string,
  date: DateAwbSmartship,
): Promise<{ awb: string; avertismente: string[] } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, admin, config, order } = ctx;

  const comanda = order as typeof order & { smartship_awb_number?: string | null };
  if (comanda.smartship_awb_number) {
    return { error: "AWB-ul SmartShip a fost deja creat pentru comanda asta." };
  }

  if (!Number.isInteger(Number(date.courierId)) || Number(date.courierId) <= 0) {
    return { error: "Alege curierul inainte de a emite: SmartShip cere `courier_id` la emitere." };
  }

  const pregatita = await pregatesteExpedierea(config, date, order, businessId);
  if (!pregatita.ok) return { error: pregatita.error };

  /*
   * ⚠ Tot ce se poate verifica local se verifica INAINTE de rezervarea din
   * registru: o comanda careia ii lipseste lockerul n-are de ce sa ocupe un slot.
   * Aici conteaza dublu — SmartShip n-are endpoint de validare, deci fiecare
   * greseala lasata sa treaca e o cerere reala care cade cu 999.
   */
  const lipsuri = lipsuriExpediere(pregatita.date, config);
  if (lipsuri.length) return { error: `Nu se poate emite AWB-ul: ${lipsuri.join("; ")}.` };

  const avertismente = avertismenteExpediere(pregatita.date, config);
  const corp = corpEmitere(pregatita.date, config);

  const r = await cuRegistru(
    admin,
    { businessId, orderId, fel: "awb", furnizor: "smartship", cheie: cheieOperatie("awb", "smartship", orderId) },
    async () => {
      const raspuns = await creeazaAwb(config, corp);
      return {
        referinta: raspuns.awb,
        detalii: {
          courier_id: raspuns.courier_id ?? corp.courier_id,
          courier_name: raspuns.courier_name ?? date.courierName ?? null,
          own_contract: raspuns.own_contract ?? !!corp.use_own_contract,
          cost: raspuns.cost ?? null,
          tracking_url: raspuns.tracking_url ?? null,
        } as Json,
        valoare: raspuns,
      };
    },
    verdictFurnizor,
    /*
     * ⚠ NU se da `legaturaVie`, aceeasi hotarare ca la Innoship, GLS, Pall-Ex si
     * Posta: `false` pe ramura `deja` inseamna „elibereaza slotul si REIA", adica
     * o a doua expediere reala, platita. Cazul pentru care ar fi fost bun — o
     * anulare a carei eliberare s-a pierdut — se rezolva aici altfel, si mai
     * bine: `verificaSmartshipAwbAction` intreaba SmartShip dupa id-ul NOSTRU de
     * comanda si lamureste cu o DOVADA.
     */
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

  const dinRegistru = (r.fel === "deja" ? r.detalii : null) as Record<string, unknown> | null;
  const raspuns = r.fel === "facut" ? r.valoare : null;
  const awb = r.fel === "facut" ? r.valoare.awb : (r.referinta ?? "");

  if (!awb) {
    return { error: "Operatia figureaza ca reusita in registru, dar fara numar AWB. Apasa „Verifica la SmartShip”." };
  }

  const numarDin = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    smartship_awb_number: awb,
    /*
     * ⚠ CU CADERE PE CURIERUL CERUT. `smartship_courier_id` nu e obligatoriu in
     * adresa etichetei sau a anularii (acolo se trimite doar AWB-ul), dar fara el
     * panoul n-ar sti ce curier duce coletul, iar reemiterea dupa o corectare ar
     * pleca oarba. Curierul pe care l-am CERUT e cea mai buna a doua sursa.
     */
    smartship_courier_id: raspuns?.courier_id ?? numarDin(dinRegistru?.courier_id) ?? corp.courier_id,
    smartship_courier_name: raspuns?.courier_name ?? (dinRegistru?.courier_name as string | null) ?? date.courierName ?? null,
    /* ⚠ A doua parte a cheii ofertei: fara ea, o reemitere ar putea pleca pe
       celalalt contract, la alt pret. Vezi `preturi.ts`. */
    smartship_own_contract: raspuns?.own_contract ?? (dinRegistru?.own_contract as boolean | null) ?? !!corp.use_own_contract,
    smartship_cost: raspuns?.cost ?? numarDin(dinRegistru?.cost),
    smartship_tracking_url: raspuns?.tracking_url ?? (dinRegistru?.tracking_url as string | null) ?? null,
    smartship_awb_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  /*
   * ⚠ Expedierea EXISTA la SmartShip. Un esec de scriere n-are voie sa se intoarca
   * la om ca eroare — l-ar trimite sa apese din nou, iar registrul ar raspunde
   * „deja" si ar reface doar scrierea.
   */
  const scris = !eScriere && !!randuri && randuri.length > 0;
  if (!scris) {
    await logError({
      action: "smartship.createAwb",
      message: `AWB SmartShip creat (${awb}), dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}. Numarul e in registrul de operatii externe; o noua apasare il adopta si reface scrierea.`,
      details: { orderId, businessId, awb, code: eScriere?.code },
      businessId,
      severity: "critical",
    });
  } else {
    dupaRaspuns(() => enqueueAboutYouShip(businessId, orderId), "enqueueAboutYouShip", businessId);
  }

  return { awb, avertismente };
}

/**
 * „Verifica la SmartShip" — inchide fereastra „nu stiu daca s-a creat".
 *
 * Cand o emitere pica nesigur (timeout, 5xx, cod necunoscut), registrul blocheaza
 * si scoate cazul la om. La GLS, Packeta sau Posta singura iesire ar fi ca cineva
 * sa deschida panoul furnizorului si sa-si ASUME ca expedierea nu exista.
 *
 * SmartShip poate fi intrebat dupa ID-UL NOSTRU de comanda
 * (`GET /awb/order_id/{order_id}`), deci raspunsul se afla dintr-o citire:
 *
 *   gasita        -> se scrie AWB-ul pe comanda;
 *   gasita ANULATA-> nu se scrie nimic (un AWB anulat nu duce niciun colet), dar
 *                    blocajul se ridica: la ei nu mai exista nimic viu;
 *   negasita      -> se deblocheaza randul, si acum e o DOVADA;
 *   nu se stie    -> nu se atinge nimic. O cadere de retea n-are voie sa treaca
 *                    drept dovada ca expedierea nu exista.
 */
export async function verificaSmartshipAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ ok: true; gasit: boolean; awb: string | null; mesaj: string } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { supabase, admin, config, order } = ctx;

  const comanda = order as typeof order & { smartship_awb_number?: string | null };
  if (comanda.smartship_awb_number) {
    return { ok: true, gasit: true, awb: comanda.smartship_awb_number, mesaj: "Comanda are deja AWB." };
  }

  const referinta = referintaComenzii(order.order_number, businessId);
  let gasita;
  try {
    gasita = await cautaDupaComanda(config, referinta);
  } catch (e) {
    return {
      ok: false,
      error:
        `Nu s-a putut intreba SmartShip (${(e as Error).message}). Nu s-a schimbat nimic — `
        + "incearca din nou peste cateva minute.",
    };
  }

  /*
   * ⚠ Un AWB ANULAT nu se adopta. Scris pe comanda, ar arata ca un transport
   * care exista si marfa n-ar pleca niciodata — mai rau decat blocajul. Slotul
   * se elibereaza insa, fiindca la ei chiar nu mai e nimic viu pe comanda asta.
   */
  const anulat = gasita?.status === 10;

  if (gasita?.awb && !anulat) {
    const { error } = await supabase.from("orders").update({
      smartship_awb_number: gasita.awb,
      smartship_tracking_url: gasita.trackingUrl,
      smartship_status_code: gasita.status,
      smartship_awb_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("business_id", businessId);

    if (error) {
      return { ok: false, error: `Expedierea exista la SmartShip (${gasita.awb}), dar nu s-a putut scrie pe comanda: ${error.message}` };
    }

    dupaRaspuns(() => enqueueAboutYouShip(businessId, orderId), "enqueueAboutYouShip", businessId);
    return {
      ok: true, gasit: true, awb: gasita.awb,
      mesaj: `Expedierea exista la SmartShip. AWB-ul ${gasita.awb} a fost pus pe comanda.`,
    };
  }

  /*
   * ═══ ⚠ CODUL 301 INSEAMNA DOUA LUCRURI DEODATA ═══
   *
   * Documentatia lor il descrie asa: „Cheie API invalida" SI „AWB-ul nu exista
   * sau nu apartine contului tau". Adica exact raspunsul pe care `cautaDupaComanda`
   * il traduce in „nu s-a creat nimic".
   *
   * Deci un comerciant care si-a rotit cheia si a uitat s-o schimbe aici ar apasa
   * „Verifica", ar primi 301, iar noi am DEBLOCA registrul spunandu-i ca avem
   * dovada — cand de fapt expedierea poate exista si e platita. A doua apasare pe
   * „Creeaza AWB" ar face al doilea transport.
   *
   * Se cere deci o a doua citire, pura, care nu depinde de comanda: daca soldul
   * raspunde, cheia e buna si 301-ul chiar insemna „nu exista". Daca nu, nu se
   * atinge nimic — o cheie stricata n-are voie sa treaca drept dovada.
   */
  if (!gasita) {
    try {
      await sold(config);
    } catch (e) {
      return {
        ok: false,
        error:
          "SmartShip n-a gasit nicio expediere pentru comanda asta, dar nici cheia de API nu "
          + `raspunde (${(e as Error).message}). Nu deblocam nimic pe baza unui raspuns care poate `
          + "insemna doar ca e invalida cheia. Verifica cheia in configurare si reia.",
      };
    }
  }

  const atarnate = await operatiiAtarnate(admin, businessId, orderId);
  const aNoastra = atarnate.find((o) => o.cheie === cheieOperatie("awb", "smartship", orderId));

  const explicatie = anulat
    ? `SmartShip are pentru comanda asta un AWB ANULAT (${gasita?.awb}). Nu l-am pus pe comanda: un AWB anulat nu duce niciun colet.`
    : "SmartShip nu are nicio expediere pentru comanda asta.";

  if (!aNoastra) {
    return { ok: true, gasit: false, awb: null, mesaj: `${explicatie} Poti emite AWB-ul.` };
  }

  const r = await deblocheazaOperatie(
    admin, businessId, aNoastra.id,
    anulat
      ? "verificat automat prin /awb/order_id: expedierea de la SmartShip e anulata"
      : "verificat automat prin /awb/order_id: expedierea nu exista la SmartShip",
  );
  if (!r.ok) return { ok: false, error: r.mesaj };

  return {
    ok: true, gasit: false, awb: null,
    mesaj: `${explicatie} Blocajul a fost ridicat — poti emite din nou.`,
  };
}

// ─── Anulare ──────────────────────────────────────────────────────────────────

/**
 * Anuleaza expedierea si scoate numarul de pe comanda.
 *
 * ⚠ La SmartShip anularea PROPAGA la curier si intoarce costul in creditul
 * contului — deci nu e o simpla dezlegare locala, ca la Posta. Si e un GET care
 * schimba ceva; vezi `anuleaza()` din client.
 */
export async function deleteSmartshipAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true; mesaj: string } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, admin, config, order } = ctx;

  const comanda = order as typeof order & { smartship_awb_number?: string | null };
  const awb = (comanda.smartship_awb_number ?? "").trim();
  if (!awb) return { error: "Comanda nu are AWB de la SmartShip." };

  const r = await anuleaza(config, awb);
  if (!r.anulat) {
    return {
      error: r.definitiv
        ? `${r.motiv} Scoate expedierea din contul SmartShip daca mai e nevoie; de pe comanda nu o putem sterge fara sa fim siguri ca nu mai circula.`
        : `SmartShip n-a putut anula expedierea: ${r.motiv}`,
    };
  }

  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    smartship_awb_number: null,
    smartship_courier_id: null,
    smartship_courier_name: null,
    smartship_own_contract: null,
    smartship_cost: null,
    smartship_tracking_url: null,
    smartship_awb_at: null,
    smartship_status_code: null,
    smartship_status_checked_at: null,
    smartship_pickup_code: null,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  if (eScriere || !randuri?.length) {
    return { error: `Expedierea a fost anulata la SmartShip, dar numarul n-a putut fi scos de pe comanda: ${eScriere?.message ?? "niciun rand modificat"}` };
  }

  /*
   * ⚠ Eliberarea slotului vine DUPA scrierea pe comanda, si numai daca aceasta a
   * prins un rand. Invers, am fi deschis reemiterea pentru o comanda care inca
   * poarta AWB-ul vechi.
   *
   * ⚠ Si REZULTATUL SE CITESTE. Aruncat, un esec aici ar lasa randul `reusit`,
   * iar emiterea urmatoare ar intra pe ramura „adopta rezultatul" si ar scrie
   * inapoi pe comanda AWB-ul ANULAT — transport inexistent, marfa care nu pleaca.
   * Exact defectul gasit la Packeta. Aici omul afla, si are ce apasa:
   * „Verifica la SmartShip" ridica blocajul cu o dovada.
   */
  const eliberat = await marcheazaAnulata(admin, businessId, cheieOperatie("awb", "smartship", orderId));
  if (!eliberat) {
    await logError({
      action: "smartship.deleteAwb",
      message: `AWB ${awb} anulat la SmartShip si scos de pe comanda, dar slotul din registru NU s-a eliberat. O reemitere ar putea adopta numarul anulat pana se apasa „Verifica la SmartShip”.`,
      details: { orderId, businessId, awb },
      businessId,
      severity: "warning",
    });
    return {
      success: true,
      mesaj:
        "Expedierea a fost anulata. Daca vrei sa emiti alta pentru comanda asta si butonul refuza, "
        + "apasa intai „Verifica la SmartShip”.",
    };
  }

  return {
    success: true,
    mesaj: r.eraDejaAnulat
      ? "Expedierea era deja anulata la SmartShip. Am scos numarul de pe comanda."
      : "Expedierea a fost anulata la SmartShip, iar costul se intoarce in creditul contului.",
  };
}

// ─── Eticheta ─────────────────────────────────────────────────────────────────

/**
 * Eticheta, ca PDF.
 *
 * ⚠ NU se foloseste `pdf_link` din raspunsul de emitere: acela contine CHEIA DE
 * API in cale (`smartship.ro/api/CHEIA_TA_API/print/…`). Trimis catre browser sau
 * salvat pe comanda, ar publica credentiala magazinului. Eticheta urca prin
 * serverul nostru, cu cheia in antet.
 */
export async function getSmartshipLabelAction(
  businessId: string,
  orderId: string,
  format?: FormatEticheta,
): Promise<{ ok: true; pdfBase64: string } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { config, order } = ctx;

  const comanda = order as typeof order & { smartship_awb_number?: string | null };
  const awb = (comanda.smartship_awb_number ?? "").trim();
  if (!awb) return { ok: false, error: "Comanda nu are AWB de la SmartShip." };

  try {
    const r = await eticheta(config, awb, format ?? config.format_eticheta ?? "A4");
    return { ok: true, pdfBase64: r.pdfBase64 };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─── Urmarire, pentru panou ───────────────────────────────────────────────────

export type StareAfisata = { descriere: string; data: string | null; localitate: string | null };

export async function getSmartshipTraceAction(
  businessId: string,
  orderId: string,
): Promise<
  | { ok: true; status: number | null; descriere: string; stari: StareAfisata[]; trackingUrl: string | null; curier: string | null }
  | { ok: false; error: string }
> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { config, order } = ctx;

  const comanda = order as typeof order & { smartship_awb_number?: string | null };
  const awb = (comanda.smartship_awb_number ?? "").trim();
  if (!awb) return { ok: false, error: "Comanda nu are AWB de la SmartShip." };

  try {
    const u = await urmareste(config, awb);
    return {
      ok: true,
      status: u.status,
      descriere: descriereStatus(u.status, u.descriere),
      /*
       * ⚠ Evenimentele se ARATA, dar nu se traduc: `event_id` n-are niciun
       * nomenclator publicat. Textul e al lor, asa cum l-au scris.
       */
      stari: u.evenimente.map((e) => ({
        descriere: (e.description ?? "").trim() || "Eveniment fara descriere",
        data: (e.date ?? "").trim() || null,
        localitate: (e.locality ?? "").trim() || null,
      })),
      trackingUrl: u.trackingUrl,
      curier: u.curier,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─── Ridicarea FedEx ──────────────────────────────────────────────────────────

export async function getSmartshipPickupSlotsAction(
  businessId: string,
  orderId: string,
): Promise<{ ok: true; optiuni: RidicareFedex[] } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { config, order } = ctx;

  const comanda = order as typeof order & { smartship_awb_number?: string | null };
  const awb = (comanda.smartship_awb_number ?? "").trim();
  if (!awb) return { ok: false, error: "Comanda nu are AWB de la SmartShip." };

  try {
    return { ok: true, optiuni: await disponibilitateRidicare(config, awb) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Programeaza ridicarea FedEx.
 *
 * ⚠ UNA SINGURA PE AWB (codul lor 305), deci trece prin registru cu
 * `fel: "ridicare"`, ca la DPD si FAN. Fara el, doua apasari repezi ar produce o
 * a doua comanda de ridicare pe care curierul o factureaza.
 */
export async function programeazaSmartshipPickupAction(
  businessId: string,
  orderId: string,
  interval: { pickup_date: string; ready_time: string; latest_time: string },
): Promise<{ ok: true; cod: string | null; mesaj: string } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { supabase, admin, config, order } = ctx;

  const comanda = order as typeof order & {
    smartship_awb_number?: string | null;
    smartship_pickup_code?: string | null;
  };
  const awb = (comanda.smartship_awb_number ?? "").trim();
  if (!awb) return { ok: false, error: "Comanda nu are AWB de la SmartShip." };
  if (comanda.smartship_pickup_code) {
    return { ok: false, error: `Ridicarea e deja programata (cod ${comanda.smartship_pickup_code}). SmartShip accepta una singura pe AWB.` };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(interval.pickup_date)) {
    return { ok: false, error: "Ziua ridicarii trebuie sa fie de forma AAAA-LL-ZZ." };
  }
  if (!/^\d{2}:\d{2}$/.test(interval.ready_time) || !/^\d{2}:\d{2}$/.test(interval.latest_time)) {
    return { ok: false, error: "Orele trebuie sa fie de forma HH:MM." };
  }

  const r = await cuRegistru(
    admin,
    { businessId, orderId, fel: "ridicare", furnizor: "smartship", cheie: cheieOperatie("ridicare", "smartship", awb) },
    async () => {
      const rez = await programeazaRidicare(config, awb, interval);
      return {
        referinta: rez.cod ?? awb,
        detalii: { cod: rez.cod, locatie: rez.locatie, ...interval } as Json,
        valoare: rez,
      };
    },
    verdictFurnizor,
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { ok: false, error: r.mesaj };

  const cod = r.fel === "facut" ? r.valoare.cod : (r.referinta ?? null);

  const { error } = await supabase.from("orders").update({
    smartship_pickup_code: cod,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId);

  if (error) {
    await logError({
      action: "smartship.pickup",
      message: `Ridicarea FedEx a fost programata (${cod}), dar codul nu s-a scris pe comanda: ${error.message}`,
      details: { orderId, businessId, awb },
      businessId,
      severity: "warning",
    });
  }

  return {
    ok: true, cod,
    mesaj: "Ridicarea a fost programata. Expeditorul primeste confirmarea pe email de la FedEx.",
  };
}

// ─── Oferte de transport (marfa grea) ─────────────────────────────────────────

/**
 * ⚠ FLUXUL ASTA NU E O COTARE, si nu se poarta ca una.
 *
 * Cererea pleaca la un OM din echipa SmartShip, iar raspunsul vine peste ore sau
 * zile. De aceea referinta se scrie PE COMANDA: fara ea, solicitarea s-ar pierde
 * in clipa in care comerciantul inchide pagina, si nimeni n-ar mai putea accepta
 * oferta cand aceasta soseste.
 */
export async function cereOfertaTransportAction(
  businessId: string,
  orderId: string,
  /**
   * ⚠ Campurile in plus sunt EXACT cele pe care le trimite formularul.
   *
   * Documentatia mai are doua (`pickup_deadline`, `delivery_deadline`), amandoua
   * text liber — dar un parametru pe care nicio interfata nu-l completeaza e cod
   * mort, iar termenele incap oricum in `mesaj`. Vezi lectia din
   * [[packeta-integrare]], unde `packeta_external_tracking` n-a fost scris
   * niciodata fiindca nimeni nu chema calea care il producea.
   */
  date: DateAwbSmartship & {
    truckType?: string | null;
    grupaj?: boolean;
    adr?: boolean;
    temperaturaControlata?: boolean;
    buget?: number | null;
    mesaj?: string | null;
  },
): Promise<{ ok: true; ref: string; stare: string | null } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const comanda = order as typeof order & { smartship_offer_ref?: string | null };
  if (comanda.smartship_offer_ref) {
    return { ok: false, error: `Comanda are deja o solicitare de oferta (${comanda.smartship_offer_ref}).` };
  }

  const pregatita = await pregatesteExpedierea(config, { ...date, courierId: null }, order, businessId);
  if (!pregatita.ok) return { ok: false, error: pregatita.error };

  const lipsuri = lipsuriExpediere(pregatita.date, config);
  if (lipsuri.length) return { ok: false, error: `Nu se poate cere oferta: ${lipsuri.join("; ")}.` };

  const corp = corpCotare(pregatita.date, config);
  /* Campurile proprii ofertei: nu intra in tipul comun, fiindca nu exista la /cost. */
  const continut = corp.content as typeof corp.content & Record<string, unknown>;
  if (date.truckType) continut.truck_type = date.truckType;
  if (date.grupaj !== undefined) continut.groupage = !!date.grupaj;
  if (date.adr !== undefined) continut.adr = !!date.adr;
  if (date.temperaturaControlata !== undefined) continut.temperature_controlled = !!date.temperaturaControlata;
  if (Number(date.buget) > 0) continut.budget = Number(date.buget);
  if (date.mesaj) continut.message = String(date.mesaj).slice(0, 1000);
  continut.client_reference = referintaComenzii(order.order_number, businessId);

  try {
    const r = await cereOfertaTransport(config, { ...corp, content: continut });

    const { error } = await supabase.from("orders").update({
      smartship_offer_ref: r.ref,
      smartship_offer_status: r.stare ?? "new",
      updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("business_id", businessId);

    if (error) {
      /*
       * ⚠ Solicitarea EXISTA la ei. Referinta nescrisa inseamna ca nimeni n-o mai
       * poate gasi din panou — deci se striga tare, cu referinta in mesaj.
       */
      await logError({
        action: "smartship.ofertaTransport",
        message: `Solicitarea de oferta ${r.ref} a fost inregistrata la SmartShip, dar referinta NU s-a scris pe comanda: ${error.message}`,
        details: { orderId, businessId, ref: r.ref },
        businessId,
        severity: "critical",
      });
      return { ok: false, error: `Solicitarea a fost trimisa (referinta ${r.ref}), dar nu s-a putut lega de comanda. Noteaza referinta.` };
    }

    return { ok: true, ref: r.ref, stare: r.stare };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function getOfertaTransportAction(
  businessId: string,
  orderId: string,
): Promise<{ ok: true; oferta: OfertaTransport } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const comanda = order as typeof order & { smartship_offer_ref?: string | null };
  const ref = (comanda.smartship_offer_ref ?? "").trim();
  if (!ref) return { ok: false, error: "Comanda nu are nicio solicitare de oferta." };

  try {
    const oferta = await ofertaTransport(config, ref);
    /* Starea se retine, ca panoul s-o poata arata fara sa intrebe de fiecare data. */
    if (oferta.request_status) {
      await supabase.from("orders")
        .update({ smartship_offer_status: oferta.request_status })
        .eq("id", orderId).eq("business_id", businessId);
    }
    return { ok: true, oferta };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Accepta oferta.
 *
 * ⚠ CREEAZA UN AWB REAL si scade pretul din credit. Trece prin registru cu
 * ACEEASI cheie ca emiterea obisnuita: o comanda are un singur transport,
 * indiferent pe ce drum a venit. Asa nu se poate ajunge la doua expedieri pentru
 * aceeasi comanda — una din modal, una din oferta.
 */
export async function acceptaOfertaTransportAction(
  businessId: string,
  orderId: string,
): Promise<{ ok: true; awb: string } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { supabase, admin, config, order } = ctx;

  const comanda = order as typeof order & {
    smartship_offer_ref?: string | null;
    smartship_awb_number?: string | null;
  };
  const ref = (comanda.smartship_offer_ref ?? "").trim();
  if (!ref) return { ok: false, error: "Comanda nu are nicio solicitare de oferta." };
  if (comanda.smartship_awb_number) {
    return { ok: false, error: "Comanda are deja AWB de la SmartShip." };
  }

  const r = await cuRegistru(
    admin,
    { businessId, orderId, fel: "awb", furnizor: "smartship", cheie: cheieOperatie("awb", "smartship", orderId) },
    async () => {
      const rez = await acceptaOfertaTransport(config, ref);
      return {
        referinta: rez.awb,
        detalii: { tracking_url: rez.trackingUrl, cost: rez.cost, ref } as Json,
        valoare: rez,
      };
    },
    verdictFurnizor,
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { ok: false, error: r.mesaj };

  const dinRegistru = (r.fel === "deja" ? r.detalii : null) as Record<string, unknown> | null;
  const awb = r.fel === "facut" ? r.valoare.awb : (r.referinta ?? "");
  if (!awb) return { ok: false, error: "Oferta figureaza ca acceptata, dar fara numar AWB." };

  const cost = r.fel === "facut" ? r.valoare.cost : Number(dinRegistru?.cost) || null;
  const trackingUrl = r.fel === "facut" ? r.valoare.trackingUrl : (dinRegistru?.tracking_url as string | null) ?? null;

  const { error } = await supabase.from("orders").update({
    smartship_awb_number: awb,
    smartship_tracking_url: trackingUrl,
    smartship_cost: cost,
    smartship_awb_at: new Date().toISOString(),
    smartship_offer_status: "accepted",
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId);

  if (error) {
    await logError({
      action: "smartship.acceptaOferta",
      message: `Oferta ${ref} a fost acceptata si AWB-ul ${awb} exista la SmartShip, dar comanda NU s-a actualizat: ${error.message}`,
      details: { orderId, businessId, awb, ref },
      businessId,
      severity: "critical",
    });
  } else {
    dupaRaspuns(() => enqueueAboutYouShip(businessId, orderId), "enqueueAboutYouShip", businessId);
  }

  return { ok: true, awb };
}

export async function refuzaOfertaTransportAction(
  businessId: string,
  orderId: string,
  motiv?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const comanda = order as typeof order & { smartship_offer_ref?: string | null };
  const ref = (comanda.smartship_offer_ref ?? "").trim();
  if (!ref) return { ok: false, error: "Comanda nu are nicio solicitare de oferta." };

  try {
    await refuzaOfertaTransport(config, ref, motiv);
    await supabase.from("orders")
      .update({ smartship_offer_status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", orderId).eq("business_id", businessId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─── Contabilitate ────────────────────────────────────────────────────────────

/**
 * Facturile si deconturile de ramburs.
 *
 * ⚠ Citiri pure, si singurul loc din platforma unde comerciantul isi vede banii
 * din ramburs asa cum ii vede SmartShip. Nu misca nimic in comenzi: la fel ca
 * statusul rambursului de la Innoship, mutarea automata a lui `payment_status`
 * ramane o faza separata, dupa ce s-a vazut pe date reale ce inseamna cifrele.
 */
export async function getSmartshipDeconturiAction(
  businessId: string,
  pagina = 1,
): Promise<{ ok: true; deconturi: DecontSmartship[]; pagini: number } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const config = await configDinBaza(businessId);
  if (!config?.api_key) return { ok: false, error: "SmartShip nu e conectat." };

  try {
    const r = await deconturi(config, Math.max(1, Math.floor(pagina)), 50);
    return { ok: true, deconturi: r.deconturi, pagini: r.pagini };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function getSmartshipDecontAction(
  businessId: string,
  numar: string,
): Promise<{ ok: true; numar: string | null; data: string | null; valoare: number | null; linii: LinieDecont[] } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const config = await configDinBaza(businessId);
  if (!config?.api_key) return { ok: false, error: "SmartShip nu e conectat." };
  if (!numar.trim()) return { ok: false, error: "Lipseste numarul decontului." };

  try {
    return { ok: true, ...(await detaliiDecont(config, numar.trim())) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function getSmartshipFacturiAction(
  businessId: string,
  pagina = 1,
): Promise<{ ok: true; facturi: FacturaSmartship[]; pagini: number } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const config = await configDinBaza(businessId);
  if (!config?.api_key) return { ok: false, error: "SmartShip nu e conectat." };

  try {
    const r = await facturi(config, Math.max(1, Math.floor(pagina)), 50);
    return { ok: true, facturi: r.facturi, pagini: r.pagini };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
