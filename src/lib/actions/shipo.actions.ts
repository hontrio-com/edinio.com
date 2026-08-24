"use server";

import { enqueueAboutYouShip } from "@/lib/aboutyou/queue";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { secretDinConfig } from "@/lib/integrari/secret-server";
import { logError } from "@/lib/error-logger";
import { cheieOperatie, cuRegistru, marcheazaAnulata } from "@/lib/operatii/registru";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import {
  adreseExpeditor, anuleaza, cautaOrase, coordPentruPuncte, creeazaExpediere, curieri, eticheta,
  probaConexiune, puncte, servicii, shipoGata, tarife, validesteExpediere,
  type AdresaExpeditor, type ContShipo, type CurierShipo, type FormatEticheta,
  type ServiciuShipo, type ShipoConfig,
} from "@/lib/shipo/client";
import {
  corpExpediere, corpTarife, lipsuriExpediere, livreazaInPunct,
  type AdresaComanda, type DateExpediere, type FelLivrare,
} from "@/lib/shipo/expediere";
import { localitateShipo, orasulPotrivit } from "@/lib/shipo/localitati";
import { ofertePosibile, type OfertaShipo } from "@/lib/shipo/preturi";
import { MAX_PUNCTE, normalizeazaPuncte, RAZA_IMPLICITA_KM, type PunctAratat } from "@/lib/shipo/puncte";
import type { Json } from "@/types/database.types";

/**
 * Actiunile Shipo.
 *
 * ⚠ SPRE DEOSEBIRE DE SMARTSHIP, SHIPO ARE VALIDARE FARA EFECT: `POST
 * /shipment/validate` primeste exact aceiasi parametri ca emiterea si nu creeaza
 * nimic. E folosita in „Testeaza conexiunea", ca omul sa afle ca o adresa cade
 * inainte sa plateasca un transport.
 *
 * ⚠ IN SCHIMB N-ARE CAUTARE DUPA REFERINTA NOASTRA. In corpul lui `POST
 * /shipment` nu exista niciun camp pentru numarul comenzii — `order_id` din
 * raspunsurile lor e id-ul ridicarii atribuit de CURIER. Deci fereastra „am
 * trimis si n-am primit raspuns" NU se poate inchide cu o citire, ca la SmartShip
 * si Innoship: singura plasa e registrul de operatii externe, ca la Woot si FAN
 * Courier. De aia orice esec ambiguu la emitere iese `necunoscut` si BLOCHEAZA,
 * iar deblocarea se face de om, din /admin/operatii.
 */

// ─── Proprietate si configurare ───────────────────────────────────────────────

type Proprietar =
  | { ok: false; error: string }
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> };

/**
 * ⚠ NEEXPORTAT, si nu din stil.
 *
 * `"use server"` face din FIECARE export al fisierului un endpoint HTTP
 * inregistrat in manifestul global. Exportat, ajutorul asta ar lasa pe oricine
 * sa-si aleaga `businessId`. Nici `tsc`, nici eslint nu prind asta.
 */
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
 * produce 403 la fiecare `/auth`, fara ca nimic sa spuna de ce, si comerciantul
 * ar reconecta degeaba. Service role ocoleste RLS, de aceea proprietatea se
 * verifica INAINTE, la fiecare apelant. Vezi [[criptare-credentiale-vedere]].
 */
async function configDinBaza(businessId: string): Promise<ShipoConfig | null> {
  /* ⚠ `error` se ia si se ARUNCA. Ignorat, o citire cazuta iesea ca „nicio configurare",
     iar apelantii scriu apoi INTREGUL obiect inapoi — deci golul inchipuit s-ar fi scris
     peste acreditari. Vezi incidentul Trendyol din 24.08.2026 si `pazeste_secretele`.
     ⚠ `maybeSingle`: un magazin fara rand e legitim; o citire cazuta nu e. */
  const { data, error } = await createAdminClient()
    .from("store_settings").select("shipo_config").eq("business_id", businessId).maybeSingle();
  if (error) throw new Error(`Configurarea nu s-a putut citi: ${error.message}`);
  return (data?.shipo_config ?? null) as ShipoConfig | null;
}

export async function saveShipoConfig(
  businessId: string,
  config: ShipoConfig,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  // Configul vechi se citeste cu SERVICE ROLE: pe clientul comerciantului campurile
  // secrete sosesc ca siruri `enc.v1.…`, iar `pastreazaSecretele` le-ar „pastra" asa.
  const { data: vechi } = await createAdminClient()
    .from("store_settings").select("shipo_config").eq("business_id", businessId).maybeSingle();

  const configFinal = pastreazaSecretele("shipo_config", config, vechi?.shipo_config);

  const { error } = await supabase.from("store_settings").update({
    shipo_config: configFinal as unknown as Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectShipo(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };

  const { error } = await ctx.supabase.from("store_settings").update({
    shipo_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

/**
 * Proba de conexiune, care si ADUCE adresele de ridicare.
 *
 * ⚠ Nu raspunde doar „merge": fara o adresa de ridicare aleasa, nici cotarea nici
 * emiterea nu se pot forma, iar un buton care ar trece cu configurarea incompleta
 * ar lasa comerciantul sa creada ca e gata. Vezi si defectul fGO, unde „testeaza
 * conexiunea" chema un nomenclator public si trecea cu credentiale inventate.
 */
export async function testShipoConnectionAction(
  businessId: string,
  cheieDinFormular?: string,
): Promise<{ ok: true; cont: ContShipo; adrese: AdresaExpeditor[] } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  /* Cheia din formular bate pe cea salvata: omul tocmai a lipit-o si vrea s-o probeze. */
  const api_key = await secretDinConfig(businessId, "shipo_config", "api_key", cheieDinFormular);
  if (!api_key) return { ok: false, error: "Pune cheia de API Shipo inainte de a testa." };

  const r = await probaConexiune({ enabled: true, api_key });
  if (!r.ok) return { ok: false, error: r.eroare };
  return { ok: true, cont: r.cont, adrese: r.adrese };
}

/** Adresele de ridicare, pentru selectorul din configurare. */
export async function getShipoAdreseAction(
  businessId: string,
): Promise<{ ok: true; adrese: AdresaExpeditor[] } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const config = await configDinBaza(businessId);
  if (!(config?.api_key ?? "").trim()) return { ok: false, error: "Pune cheia de API Shipo mai intai." };
  try {
    return { ok: true, adrese: await adreseExpeditor(config as ShipoConfig) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Curierii si serviciile contului, pentru filtrul din configurare.
 *
 * Se citesc din `/rates/services` + `/couriers`: primul da tipurile de adresa
 * (fara care nu stim ce e locker), al doilea numele omenesti.
 */
export async function getShipoServiciiAction(
  businessId: string,
): Promise<{ ok: true; servicii: ServiciuShipo[]; curieri: CurierShipo[] } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const config = await configDinBaza(businessId);
  if (!shipoGata(config)) return { ok: false, error: "Configureaza intai cheia si adresa de ridicare." };
  try {
    /*
     * ⚠ Se citesc AMANDOUA, si lista de curieri NU e decorativa: sloganurile
     * („fancourier", „cargus"…) sunt singura cheie a filtrului din configurare, iar
     * documentatia lor pomeneste doar patru. Un slug ghicit si scris de noi in
     * `curieri_permisi` ar scoate TACUT curierul acela din checkout — filtrul e pe
     * egalitate de sir. De aia lista de bifat vine din contul comerciantului.
     */
    const [s, c] = await Promise.all([servicii(config), curieri(config)]);
    return { ok: true, servicii: s, curieri: c };
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
    admin.from("store_settings").select("shipo_config").eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = (settings?.shipo_config ?? null) as ShipoConfig | null;
  if (!shipoGata(config)) {
    return {
      error:
        "Shipo nu e configurat complet. Ai nevoie de cheia de API si de adresa de ridicare "
        + "(apasa „Testeaza conexiunea” in configurare si alege una).",
    };
  }

  return { supabase, admin, config, order };
}

export type DateAwbShipo = {
  destinatar: AdresaComanda;
  greutateKg: number;
  continut?: string | null;
  nota?: string | null;
  ramburs?: number;
  valoareDeclarata?: number;
  numarColete?: number;
  felLivrare: FelLivrare;
  /** Punctul ales de client sau de comerciant. */
  punctId?: number | null;
  punctNume?: string | null;
  /** ⚠ CHEIA ofertei. Vezi `preturi.ts` — la Shipo e `rate_id`, si numai el. */
  rateId?: number | null;
  /**
   * Curierul din spatele ofertei alese, ca sa se vada pe comanda.
   *
   * ⚠ Vine din COTARE, nu din raspunsul de emitere: `POST /shipment` intoarce doar
   * `expedition`, `awb` si etichetele — nimic despre cine duce coletul. Fara ele,
   * panoul ar arata un AWB fara curier, iar comerciantul n-ar sti pe cine sa sune.
   */
  courierSlug?: string | null;
  courierName?: string | null;
  /** Pretul cotat, pastrat ca sa se poata compara cu factura brokerului. */
  cost?: number | null;
};

function dateExpediere(date: DateAwbShipo): DateExpediere {
  return {
    destinatar: date.destinatar,
    greutateKg: date.greutateKg,
    continut: date.continut,
    nota: date.nota,
    ramburs: date.ramburs,
    valoareDeclarata: date.valoareDeclarata,
    numarColete: date.numarColete,
    felLivrare: date.felLivrare,
    punctId: date.punctId,
  };
}

/**
 * Serviciul ales, cu tipul lui de adresa.
 *
 * ⚠ Se citeste din `/rates/services` la fiecare emitere, si nu din lene: raspunsul
 * de tarife NU spune daca serviciul livreaza la adresa sau in locker, iar de asta
 * depinde ce campuri intra in corp. Ghicit, un serviciu de locker ar primi campuri
 * de adresa si ar cadea la validare — dupa ce clientul a platit.
 */
async function serviciulAles(
  config: ShipoConfig,
  rateId: number,
): Promise<{ ok: true; serviciu: ServiciuShipo } | { ok: false; error: string }> {
  let lista: ServiciuShipo[];
  try {
    lista = await servicii(config);
  } catch (e) {
    return { ok: false, error: `Nu s-a putut citi lista de servicii Shipo: ${(e as Error).message}` };
  }
  const serviciu = lista.find((s) => s.id === rateId);
  if (!serviciu) {
    return {
      ok: false,
      error:
        `Serviciul Shipo ales (${rateId}) nu mai e in contul tau. `
        + "Cere din nou preturile si alege alta optiune.",
    };
  }
  return { ok: true, serviciu };
}

// ─── Cotare ───────────────────────────────────────────────────────────────────

/**
 * Ofertele pentru o comanda, din panou.
 *
 * ⚠ Citire pura la efect: `POST /rates` nu creeaza nimic. Dar E un apel pe contul
 * comerciantului, deci nu se cheama in bucla.
 */
export async function coteazaShipoAction(
  businessId: string,
  orderId: string,
  date: DateAwbShipo,
): Promise<{ ok: true; oferte: OfertaShipo[] } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { config } = ctx;

  try {
    const d = dateExpediere(date);
    const [t, s] = await Promise.all([tarife(config, corpTarife(config, d)), servicii(config)]);
    return {
      ok: true,
      oferte: ofertePosibile(t, s, config, { cuRamburs: (date.ramburs ?? 0) > 0 }),
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Punctele de ridicare pentru un serviciu, din panou.
 *
 * ⚠ Curierul si tipul punctului sunt deduse de ei din `rate_id`, deci lista e deja
 * a serviciului ales — nu trebuie filtrata dupa curier.
 */
export async function getShipoPuncteAction(
  businessId: string,
  rateId: number,
  oras: string,
  judet?: string | null,
): Promise<{ ok: true; puncte: PunctAratat[] } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const config = await configDinBaza(businessId);
  if (!shipoGata(config)) return { ok: false, error: "Shipo nu e configurat complet." };

  try {
    return { ok: true, puncte: await puncteAproape(config, rateId, oras, judet) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Punctele dintr-o localitate, cu cea mai buna cautare pe care o putem face.
 *
 * ⚠ TREI incercari, in ordine, si fiecare rezolva o problema anume:
 *
 * 1. DUPA COORDONATE, luate din `/city`. E cea mai buna, si singura care merge in
 *    Bucuresti: acolo punctele lor au `city: "Sectorul 4"`, iar un filtru
 *    `city=Bucuresti` — care e numele pe care il avem noi din comanda — n-ar
 *    potrivi niciun rand. Coordonatele nu au problema asta.
 *    ⚠ Si tot aici se face RASUCIREA: `/city` da `[lng, lat]`, `/points` cere
 *    `lat,lng`. Vezi `coordPentruPuncte`.
 * 2. DUPA JUDET, cand orasul e Bucuresti si coordonatele n-au iesit. Judetul lor
 *    e „Bucuresti" chiar si pentru sectoare.
 * 3. DUPA ORAS, pentru restul tarii.
 *
 * Filtrarea dupa judet nu e disponibila la toti curierii (raspund 400 cu
 * „Filtering by county is not available for this courier"), deci esecul ei nu
 * opreste nimic — se trece la urmatoarea.
 */
async function puncteAproape(
  config: ShipoConfig,
  rateId: number,
  oras: string,
  judet?: string | null,
): Promise<PunctAratat[]> {
  const localitate = localitateShipo(oras, judet);

  let coord: string | null = null;
  try {
    const orase = await cautaOrase(config, localitate);
    /* ⚠ NU primul rand: `/city` e cautare pe termen si intoarce si omonime din
       alte judete. Vezi `orasulPotrivit`. */
    coord = coordPentruPuncte(orasulPotrivit(orase, oras, judet)?.coord);
  } catch {
    /* Nomenclatorul de orase nu e obligatoriu pentru cautare — se cade pe nume. */
  }

  const incearca = async (filtru: Parameters<typeof puncte>[1]): Promise<PunctAratat[]> => {
    try {
      return normalizeazaPuncte(await puncte(config, filtru));
    } catch {
      return [];
    }
  };

  if (coord) {
    const dupaCoord = await incearca({
      rate_id: rateId, coord, radius: RAZA_IMPLICITA_KM, max_results: MAX_PUNCTE,
    });
    if (dupaCoord.length) return dupaCoord;
  }

  if (localitate === "Bucuresti") {
    const dupaJudet = await incearca({ rate_id: rateId, county: "Bucuresti", max_results: MAX_PUNCTE });
    if (dupaJudet.length) return dupaJudet;
  }

  return incearca({ rate_id: rateId, city: localitate, max_results: MAX_PUNCTE });
}

// ─── Emiterea AWB ─────────────────────────────────────────────────────────────

export async function createShipoAwbAction(
  businessId: string,
  orderId: string,
  date: DateAwbShipo,
): Promise<{ awb: string } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, admin, config, order } = ctx;

  const comanda = order as typeof order & { shipo_awb_number?: string | null };
  if (comanda.shipo_awb_number) {
    return { error: "AWB-ul Shipo a fost deja creat pentru comanda asta." };
  }

  const rateId = Number(date.rateId);
  if (!Number.isInteger(rateId) || rateId <= 0) {
    return { error: "Alege serviciul inainte de a emite: Shipo cere `rate_id` la emitere." };
  }

  const ales = await serviciulAles(config, rateId);
  if (!ales.ok) return { error: ales.error };

  const d = dateExpediere(date);

  /*
   * ⚠ Tot ce se poate verifica local se verifica INAINTE de rezervarea din
   * registru: o comanda careia ii lipseste punctul de ridicare n-are de ce sa
   * ocupe un slot, iar cum Shipo n-are cautare dupa referinta noastra, un slot
   * blocat degeaba se deschide numai de mana.
   */
  const lipsuri = lipsuriExpediere(d, ales.serviciu);
  if (lipsuri.length) return { error: `Nu se poate emite AWB-ul: ${lipsuri.join("; ")}.` };

  const corp = corpExpediere(config, d, ales.serviciu);

  const r = await cuRegistru(
    admin,
    { businessId, orderId, fel: "awb", furnizor: "shipo", cheie: cheieOperatie("awb", "shipo", orderId) },
    async () => {
      const raspuns = await creeazaExpediere(config, corp);
      return {
        referinta: raspuns.awb ?? "",
        detalii: {
          expedition: raspuns.expedition,
          label_a4: raspuns.label_a4,
          label_a6: raspuns.label_a6,
        } as Json,
        valoare: raspuns,
      };
    },
    verdictFurnizor,
    /*
     * ⚠ NU se da `legaturaVie`, aceeasi hotarare ca la Innoship, GLS, Pall-Ex,
     * Posta si SmartShip: `false` pe ramura `deja` inseamna „elibereaza slotul si
     * REIA", adica o a doua expediere reala, platita. Aici e cu atat mai apasat cu
     * cat Shipo NU are cautare dupa referinta noastra — n-am avea cum sa dovedim
     * ca prima expediere nu exista.
     */
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

  const dinRegistru = (r.fel === "deja" ? r.detalii : null) as Record<string, unknown> | null;
  const raspuns = r.fel === "facut" ? r.valoare : null;
  const awb = r.fel === "facut" ? (r.valoare.awb ?? "") : (r.referinta ?? "");

  if (!awb) {
    return {
      error:
        "Operatia figureaza ca reusita in registru, dar fara numar AWB. "
        + "Verifica expedierea in contul Shipo si deblocheaz-o din /admin/operatii.",
    };
  }

  const numarDin = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    shipo_awb_number: awb,
    shipo_expedition_id: raspuns?.expedition ?? numarDin(dinRegistru?.expedition),
    shipo_rate_id: rateId,
    shipo_courier_slug: (date.courierSlug ?? "").trim() || null,
    shipo_courier_name: (date.courierName ?? "").trim() || null,
    shipo_cost: numarDin(date.cost),
    shipo_point_id: livreazaInPunct(ales.serviciu) ? Number(date.punctId) || null : null,
    shipo_point_name: livreazaInPunct(ales.serviciu) ? (date.punctNume ?? null) : null,
    shipo_awb_at: new Date().toISOString(),
    status: order.status === "pending" || order.status === "confirmed" ? "processing" : order.status,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  if (eScriere || !randuri?.length) {
    /*
     * ⚠ AWB-ul EXISTA la ei, dar comanda nu-l poarta. Fara semnal, comerciantul ar
     * apasa din nou si registrul l-ar opri fara sa spuna de ce.
     */
    await logError({
      action: "shipo/awb-scriere",
      message: `AWB Shipo ${awb} creat, dar nescris pe comanda ${orderId}: ${eScriere?.message ?? "niciun rand"}`,
      details: { businessId, orderId, awb },
      severity: "critical",
    });
    return { error: `AWB-ul ${awb} a fost creat la Shipo, dar nu s-a putut scrie pe comanda. Noteaza-l si anunta suportul.` };
  }

  /* `void`, ca la ceilalti unsprezece: coada About You e best-effort si nu are
     voie sa tina raspunsul catre comerciant sau sa rupa emiterea daca pica. */
  void enqueueAboutYouShip(businessId, orderId);
  return { awb };
}

/** Sterge AWB-ul de pe comanda, dupa ce l-a anulat la ei. */
export async function deleteShipoAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true; eraDejaAnulat: boolean } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, admin, config, order } = ctx;

  const awb = (order as { shipo_awb_number?: string | null }).shipo_awb_number ?? "";
  if (!awb) return { error: "Comanda n-are AWB Shipo." };

  let rezultat;
  try {
    rezultat = await anuleaza(config, awb);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!rezultat.anulat) return { error: rezultat.motiv };

  /*
   * ⚠ SE GOLESC TOATE COLOANELE, nu doar numarul.
   *
   * `shipo_status_code` lasat scris inseamna ca, la o reemitere pe aceeasi
   * comanda, cronul citeste codul VECHI: daca era final, expedierea NOUA iese din
   * urmarire la prima trecere si comanda nu se mai misca niciodata. Iar
   * `shipo_status_checked_at` ramas ar trimite coletul nou la coada rotatiei in
   * loc de cap.
   */
  const { error: eScriere } = await supabase.from("orders").update({
    shipo_awb_number: null,
    shipo_expedition_id: null,
    shipo_rate_id: null,
    shipo_courier_slug: null,
    shipo_courier_name: null,
    shipo_cost: null,
    shipo_tracking_url: null,
    shipo_awb_at: null,
    shipo_status_code: null,
    shipo_status_checked_at: null,
    shipo_point_id: null,
    shipo_point_name: null,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  if (eScriere) return { error: eScriere.message };

  /*
   * ⚠ ABIA DUPA scriere, si rezultatul SE CITESTE: un slot ramas `reusit` face ca
   * emiterea urmatoare sa intre pe ramura „adopta rezultatul" si sa scrie inapoi
   * AWB-ul ANULAT — transport inexistent, marfa care nu pleaca, si un blocaj
   * invizibil. Defectul a fost trait la Packeta.
   */
  const eliberat = await marcheazaAnulata(admin, businessId, cheieOperatie("awb", "shipo", orderId));
  if (!eliberat) {
    await logError({
      action: "shipo/eliberare-slot",
      message: `AWB Shipo ${awb} anulat, dar slotul din registru n-a fost eliberat pentru comanda ${orderId}`,
      details: { businessId, orderId, awb },
      severity: "critical",
    });
  }

  return { success: true, eraDejaAnulat: rezultat.eraDejaAnulat };
}

/**
 * Eticheta AWB, ca base64.
 *
 * ⚠ Linkul lor NU se da direct in browser: vezi `eticheta()` din client — id-ul
 * din numele fisierului e secvential, iar o eticheta poarta numele, telefonul si
 * adresa cumparatorului.
 */
export async function getShipoEtichetaAction(
  businessId: string,
  orderId: string,
  format?: FormatEticheta,
): Promise<{ ok: true; base64: string; nume: string } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { admin, config, order } = ctx;

  const awb = (order as { shipo_awb_number?: string | null }).shipo_awb_number ?? "";
  if (!awb) return { ok: false, error: "Comanda n-are AWB Shipo." };

  /*
   * Adresa etichetei sta in detaliile operatiei din registru: raspunsul de creare
   * o aduce, iar coloana de pe comanda n-o pastreaza dinadins (vezi migratia).
   */
  const { data: op } = await admin
    .from("operatii_externe").select("detalii")
    .eq("business_id", businessId).eq("cheie", cheieOperatie("awb", "shipo", orderId))
    .maybeSingle();

  const detalii = (op?.detalii ?? {}) as { label_a4?: string | null; label_a6?: string | null };
  const dorit = (format ?? config.format_eticheta ?? "A4") === "A6" ? detalii.label_a6 : detalii.label_a4;
  const url = (dorit ?? detalii.label_a4 ?? detalii.label_a6 ?? "").trim();
  if (!url) {
    return { ok: false, error: "Nu am adresa etichetei pentru AWB-ul asta. Descarc-o din contul Shipo." };
  }

  try {
    const e = await eticheta(config, url);
    return { ok: true, base64: e.base64, nume: e.nume };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Valideaza datele expedierii FARA sa creeze nimic.
 *
 * Shipo e singurul dintre cei sase brokeri care are asa ceva pe acelasi corp ca
 * emiterea. Se foloseste inainte de emiterile in lot, ca omul sa vada ce comenzi
 * ar cadea inainte sa plateasca transporturile care trec.
 */
export async function validesteShipoAction(
  businessId: string,
  orderId: string,
  date: DateAwbShipo,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { config } = ctx;

  const rateId = Number(date.rateId);
  if (!Number.isInteger(rateId) || rateId <= 0) return { ok: false, error: "Alege serviciul mai intai." };
  const ales = await serviciulAles(config, rateId);
  if (!ales.ok) return { ok: false, error: ales.error };

  const d = dateExpediere(date);
  const lipsuri = lipsuriExpediere(d, ales.serviciu);
  if (lipsuri.length) return { ok: false, error: lipsuri.join("; ") };

  try {
    await validesteExpediere(config, corpExpediere(config, d, ales.serviciu));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/*
 * ─── DE CE NU EXISTA AICI O ACTIUNE DE DEBLOCARE ─────────────────────────────
 *
 * SmartShip si Innoship au cate una (`verificaSmartshipAwbAction`), si e corect
 * la ei: pot intreba furnizorul dupa ID-UL NOSTRU de comanda, deci ridica blocajul
 * cu o DOVADA — „expedierea nu exista acolo".
 *
 * ⚠ La Shipo dovada aia nu se poate obtine: in corpul lui `POST /shipment` nu
 * exista niciun camp pentru referinta noastra, iar `order_id` din raspunsurile lor
 * e id-ul de ridicare atribuit de curier. O actiune care ar debloca „fiindca n-am
 * gasit nimic" ar debloca de fapt fiindca N-AVEM CE CAUTA — si prima reemitere ar
 * produce al doilea transport, real si platit.
 *
 * Deci blocajul se ridica de OM, din /admin/operatii, dupa ce s-a uitat in contul
 * Shipo. Acelasi raspuns ca la Woot si FAN Courier, si din acelasi motiv.
 */
