"use server";

import { enqueueAboutYouShip } from "@/lib/aboutyou/queue";
import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { secretDinConfig } from "@/lib/integrari/secret-server";
import { logError } from "@/lib/error-logger";
import {
  cheieOperatie, cuRegistru, deblocheazaOperatie, marcheazaAnulata, operatiiAtarnate,
} from "@/lib/operatii/registru";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import {
  anuleaza, cautaDupaReferinta, chiarNuExista, creeazaExpediere, extensiaEtichetei, fedexGata,
  linkUrmarire, probaConexiune, specificatieEticheta, tarife,
  type FedexConfig, type OfertaFedex, type ProbaFedex,
} from "@/lib/fedex/client";
import {
  corpExpediere, corpTarife, lipsuriExpediere, referintaComenzii,
  type AdresaComanda, type DateExpediere,
} from "@/lib/fedex/expediere";
import { ofertePosibile, type VerdictTva } from "@/lib/fedex/preturi";
import { serviciiPropuse } from "@/lib/fedex/servicii";
import type { Json } from "@/types/database.types";

/**
 * Actiunile FedEx.
 *
 * ⚠ FEDEX ARE CAUTARE DUPA REFERINTA NOASTRA, si asta schimba tot ce urmeaza.
 *
 * `POST /track/v1/referencenumbers` cu `type: CUSTOMER_REFERENCE` gaseste expedierea
 * dupa sirul pe care il punem noi pe colet. Deci fereastra „am trimis si n-am primit
 * raspuns" se poate inchide cu o CITIRE — ca la SmartShip si Innoship, si spre
 * deosebire de Shipo, unde singura plasa era registrul si deblocarea de mana.
 * Vezi `verificaFedexAwbAction`.
 *
 * ⚠ DAR NU ARE IDEMPOTENTA SI NU ARE REIMPRIMARE.
 *
 * `POST /ship/v1/shipments` retrimis creeaza al doilea AWB, taxabil (`x-customer-transaction-id`
 * e doar corelare, nu deduplicare). Iar eticheta nu se mai poate cere niciodata a
 * doua oara — de aia se salveaza la emitere, in `public.fedex_etichete`.
 *
 * ⚠ SI NU ARE RAMBURS. Comenzile cu plata la livrare se opresc in `lipsuriExpediere`,
 * inainte de orice apel.
 */

// ─── Proprietate si configurare ───────────────────────────────────────────────

type Proprietar =
  | { ok: false; error: string }
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> };

/**
 * ⚠ NEEXPORTAT, si nu din stil.
 *
 * `"use server"` face din FIECARE export al fisierului un endpoint HTTP inregistrat
 * in manifestul global. Exportat, ajutorul asta ar lasa pe oricine sa-si aleaga
 * `businessId`. Nici `tsc`, nici eslint nu prind asta.
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
 * clientul comerciantului `client_secret` ar sosi `enc.v1.…` — un sir plauzibil care
 * ar produce 401 la fiecare `/oauth/token`, fara ca nimic sa spuna de ce, iar
 * comerciantul si-ar regenera cheile degeaba. Service role ocoleste RLS, de aceea
 * proprietatea se verifica INAINTE, la fiecare apelant.
 */
async function configDinBaza(businessId: string): Promise<FedexConfig | null> {
  /* ⚠ `error` se ia si se ARUNCA. Ignorat, o citire cazuta iesea ca „nicio configurare",
     iar apelantii scriu apoi INTREGUL obiect inapoi — deci golul inchipuit s-ar fi scris
     peste acreditari. Vezi incidentul Trendyol din 24.08.2026 si `pazeste_secretele`.
     ⚠ `maybeSingle`: un magazin fara rand e legitim; o citire cazuta nu e. */
  const { data, error } = await createAdminClient()
    .from("store_settings").select("fedex_config").eq("business_id", businessId).maybeSingle();
  if (error) throw new Error(`Configurarea nu s-a putut citi: ${error.message}`);
  return (data?.fedex_config ?? null) as FedexConfig | null;
}

export async function saveFedexConfig(
  businessId: string,
  config: FedexConfig,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  // Configul vechi se citeste cu SERVICE ROLE: pe clientul comerciantului campurile
  // secrete sosesc ca siruri `enc.v1.…`, iar `pastreazaSecretele` le-ar „pastra" asa.
  const { data: vechi } = await createAdminClient()
    .from("store_settings").select("fedex_config").eq("business_id", businessId).maybeSingle();

  const configFinal = pastreazaSecretele("fedex_config", config, vechi?.fedex_config);

  const { error } = await supabase.from("store_settings").update({
    fedex_config: configFinal as unknown as Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectFedex(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };

  const { error } = await ctx.supabase.from("store_settings").update({
    fedex_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

/**
 * Proba de conexiune.
 *
 * ⚠ NU se opreste la „am luat un token". Un token se ia cu orice pereche de chei
 * valide, chiar daca proiectul din portalul FedEx n-are activat niciun API si chiar
 * daca numarul de cont e al altcuiva. Se cere o COTARE reala, de la adresa
 * expeditorului catre ea insasi — foloseste tokenul, foloseste contul, si cere
 * API-ul de Rate sa fie pornit. Nu creeaza nimic si nu costa nimic.
 *
 * Defectul de ocolit e cel de la fGO (2026-08-15), unde „Testeaza conexiunea" chema
 * un nomenclator PUBLIC si trecea cu credentiale inventate.
 */
export async function testFedexConnectionAction(
  businessId: string,
  config: Partial<FedexConfig>,
): Promise<{ ok: true; proba: ProbaFedex } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  /* Secretul din formular bate pe cel salvat: omul tocmai l-a lipit si vrea sa-l probeze. */
  const client_secret = await secretDinConfig(businessId, "fedex_config", "client_secret", config.client_secret);
  const salvata = await configDinBaza(businessId);

  const deProbat: FedexConfig = {
    ...(salvata ?? {} as FedexConfig),
    ...config,
    enabled: true,
    client_id: (config.client_id ?? salvata?.client_id ?? "").trim(),
    client_secret,
    account_number: (config.account_number ?? salvata?.account_number ?? "").trim(),
    expeditor: config.expeditor ?? salvata?.expeditor,
    mediu: config.mediu ?? salvata?.mediu,
  };

  if (!deProbat.client_id) return { ok: false, error: "Pune API Key inainte de a testa." };
  if (!client_secret) return { ok: false, error: "Pune Secret Key inainte de a testa." };
  if (!deProbat.account_number) return { ok: false, error: "Pune numarul de cont FedEx inainte de a testa." };
  if (!(deProbat.expeditor?.oras ?? "").trim() || !(deProbat.expeditor?.cod_postal ?? "").trim()) {
    return {
      ok: false,
      error: "Completeaza orasul si codul postal al expeditorului: fara ele FedEx nu poate cota nimic.",
    };
  }

  /*
   * Cotare de la expeditor CATRE EL INSUSI: nu are nevoie de nicio comanda si nu
   * cere nicio adresa de client. Un colet de un kilogram, dimensiuni implicite.
   */
  const proba = await probaConexiune(deProbat, () => corpTarife(deProbat, {
    destinatar: {
      nume: deProbat.expeditor?.nume ?? "Proba",
      strada: deProbat.expeditor?.strada ?? "",
      oras: deProbat.expeditor?.oras ?? "",
      judet: deProbat.expeditor?.judet ?? null,
      codPostal: deProbat.expeditor?.cod_postal ?? null,
      telefon: deProbat.expeditor?.telefon ?? null,
      tara: deProbat.expeditor?.tara ?? "RO",
    },
    greutateKg: 1,
  }));

  return { ok: true, proba };
}

/** Serviciile pe care le poate bifa comerciantul in configurare. */
export async function getFedexServiciiAction(
  businessId: string,
): Promise<{ ok: true; servicii: { cod: string; nume: string; marfaGrea: boolean }[] } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const config = await configDinBaza(businessId);
  return { ok: true, servicii: serviciiPropuse(config?.expeditor?.tara ?? "RO") };
}

// ─── Context pentru AWB ───────────────────────────────────────────────────────

async function configSiComanda(businessId: string, orderId: string) {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  const admin = createAdminClient();
  const [{ data: settings }, { data: order }] = await Promise.all([
    admin.from("store_settings").select("fedex_config").eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = (settings?.fedex_config ?? null) as FedexConfig | null;
  if (!fedexGata(config)) {
    return {
      error:
        "FedEx nu e configurat complet. Ai nevoie de API Key, Secret Key, numarul de cont "
        + "si adresa de expeditie (oras si cod postal).",
    };
  }

  return { supabase, admin, config, order };
}

export type DateAwbFedex = {
  destinatar: AdresaComanda;
  greutateKg: number;
  continut?: string | null;
  ramburs?: number;
  valoareComanda?: number;
  /** ⚠ CHEIA ofertei. Vezi `preturi.ts` — la FedEx e `serviceType`. */
  serviceType?: string | null;
  /** Numele serviciului, luat din COTARE: raspunsul de emitere il da, dar nu mereu. */
  serviceName?: string | null;
  /** Pretul cotat, pastrat ca sa se poata compara cu factura FedEx. */
  cost?: number | null;
  valuta?: string | null;
};

function dateExpediere(date: DateAwbFedex, referinta: string | null): DateExpediere {
  return {
    destinatar: date.destinatar,
    greutateKg: date.greutateKg,
    continut: date.continut,
    ramburs: date.ramburs,
    valoareComanda: date.valoareComanda,
    serviceType: date.serviceType,
    referinta,
  };
}

// ─── Cotare ───────────────────────────────────────────────────────────────────

export type RezultatCotare = {
  oferte: OfertaFedex[];
  /** Valutele in care a cotat FedEx si pe care le-am refuzat. Vezi `preturi.ts`. */
  valuteRefuzate: string[];
  doarPretDeLista: boolean;
  /**
   * Preturile includ TVA? DEDUS din numerele raspunsului, nu presupus.
   *
   * ⚠ Documentatia FedEx nu raspunde la intrebarea asta pentru Romania — dar
   * raspunsul lor aduce si `totalNetCharge`, si `totalNetFedExCharge` (explicit
   * fara taxe), si `totalVatCharge`. Relatia dintre ele o inchide. Vezi `verdictTva`.
   */
  tva: VerdictTva;
};

/**
 * Ofertele pentru o comanda, din panou.
 *
 * ⚠ Citire pura la efect: `POST /rate/v1/rates/quotes` nu creeaza nimic. Dar E un
 * apel pe contul comerciantului, si contul are cota zilnica — deci nu in bucla.
 */
export async function coteazaFedexAction(
  businessId: string,
  orderId: string,
  date: DateAwbFedex,
): Promise<{ ok: true } & RezultatCotare | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { config } = ctx;

  if (Number(date.ramburs) > 0) {
    return {
      ok: false,
      error:
        "Comanda are plata la livrare, iar FedEx nu ofera ramburs (serviciul a fost retras de ei in "
        + "iulie 2023). Alege alt curier pentru comanda asta.",
    };
  }

  try {
    const { detalii } = await tarife(config, corpTarife(config, dateExpediere(date, null)));
    const r = ofertePosibile(detalii, config, { greutateKg: date.greutateKg });
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─── Emiterea AWB ─────────────────────────────────────────────────────────────

/**
 * Eticheta se pastreaza intr-un tabel al nostru.
 *
 * ⚠ FedEx NU are endpoint de reimprimare, iar linkul din raspuns expira in cel mult
 * 12 ore. Bufferul pierdut e pierdut definitiv, si comerciantul ramane cu un AWB
 * platit si fara eticheta de lipit pe colet.
 *
 * Scrierea NU are voie sa rupa emiterea: AWB-ul exista deja la ei, iar o eroare
 * intoarsa aici l-ar impinge pe om sa apese din nou.
 */
async function pastreazaEticheta(
  admin: ReturnType<typeof createAdminClient>,
  businessId: string,
  orderId: string,
  awb: string,
  continut: string,
  config: FedexConfig,
): Promise<void> {
  const spec = specificatieEticheta(config);
  const { error } = await admin.from("fedex_etichete").upsert({
    order_id: orderId,
    business_id: businessId,
    awb_number: awb,
    format: spec.imageType,
    stoc: spec.labelStockType,
    continut,
  }, { onConflict: "order_id" });

  if (error) {
    await logError({
      action: "fedex/eticheta-pastrare",
      message:
        `AWB FedEx ${awb} creat, dar eticheta nu s-a putut pastra pentru comanda ${orderId}: ${error.message}. `
        + "FedEx nu are reimprimare, deci eticheta trebuie descarcata din contul FedEx.",
      details: { businessId, orderId, awb },
      businessId,
      severity: "critical",
    });
  }
}

export async function createFedexAwbAction(
  businessId: string,
  orderId: string,
  date: DateAwbFedex,
): Promise<{ awb: string } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, admin, config, order } = ctx;

  const comanda = order as typeof order & { fedex_awb_number?: string | null; order_number?: string | number | null };
  if (comanda.fedex_awb_number) {
    return { error: "AWB-ul FedEx a fost deja creat pentru comanda asta." };
  }

  const referinta = referintaComenzii(businessId, comanda.order_number ?? orderId.slice(0, 8));
  const d = dateExpediere(date, referinta);

  /*
   * ⚠ Tot ce se poate verifica local se verifica INAINTE de rezervarea din registru:
   * o comanda careia ii lipseste telefonul n-are de ce sa ocupe un slot.
   */
  const lipsuri = lipsuriExpediere(config, d);
  const toate = [...lipsuri.configurare, ...lipsuri.comanda];
  if (toate.length) return { error: `Nu se poate emite AWB-ul: ${toate.join("; ")}.` };

  const corp = corpExpediere(config, d);

  const r = await cuRegistru(
    admin,
    { businessId, orderId, fel: "awb", furnizor: "fedex", cheie: cheieOperatie("awb", "fedex", orderId) },
    async () => {
      const raspuns = await creeazaExpediere(config, corp, referinta);
      return {
        referinta: raspuns.awb,
        /*
         * ⚠ Eticheta NU intra in `detalii`: e un PDF de zeci de kilooctdeti, iar
         * registrul e un jurnal citit la fiecare pagina de comanda. Sta in
         * `fedex_etichete`, scrisa imediat mai jos.
         */
        detalii: {
          serviceType: raspuns.serviceType,
          serviceName: raspuns.serviceName,
          referintaNoastra: referinta,
          alerte: raspuns.alerte.map((a) => `${a.alertType}:${a.code}`),
        } as Json,
        valoare: raspuns,
      };
    },
    verdictFurnizor,
    /*
     * ⚠ NU se da `legaturaVie`, aceeasi hotarare ca la Innoship, GLS, Pall-Ex, Posta,
     * SmartShip si Shipo: `false` pe ramura `deja` inseamna „elibereaza slotul si
     * REIA", adica o a doua expediere reala, platita. La FedEx e cu atat mai apasat
     * cu cat ei n-au idempotenta — deblocarea se face de om, dupa `verificaFedexAwbAction`.
     */
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

  const raspuns = r.fel === "facut" ? r.valoare : null;
  const dinRegistru = (r.fel === "deja" ? r.detalii : null) as Record<string, unknown> | null;
  const awb = r.fel === "facut" ? r.valoare.awb : (r.referinta ?? "");

  if (!awb) {
    return {
      error:
        "Operatia figureaza ca reusita in registru, dar fara numar AWB. "
        + "Verifica expedierea in contul FedEx si deblocheaz-o din /admin/operatii.",
    };
  }

  if (raspuns?.eticheta) {
    await pastreazaEticheta(admin, businessId, orderId, awb, raspuns.eticheta, config);
  }

  const numarDin = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const sirDin = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    fedex_awb_number: awb,
    fedex_service_type: raspuns?.serviceType ?? sirDin(dinRegistru?.serviceType) ?? sirDin(date.serviceType),
    fedex_service_name: sirDin(date.serviceName) ?? raspuns?.serviceName ?? sirDin(dinRegistru?.serviceName),
    /*
     * ⚠ Pretul din COTARE bate pe cel din raspunsul de emitere, si nu invers: cel
     * din cotare e chiar ce a vazut si a acceptat cumparatorul. Cel de la emitere
     * (`netChargeAmount`) se ia doar cand cotarea n-a dat nimic.
     */
    fedex_cost: numarDin(date.cost) ?? numarDin(raspuns?.cost),
    fedex_currency: sirDin(date.valuta) ?? raspuns?.valuta ?? null,
    fedex_reference: referinta,
    fedex_tracking_url: linkUrmarire(awb),
    fedex_awb_at: new Date().toISOString(),
    status: order.status === "pending" || order.status === "confirmed" ? "processing" : order.status,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  if (eScriere || !randuri?.length) {
    /*
     * ⚠ AWB-ul EXISTA la ei, dar comanda nu-l poarta. Fara semnal, comerciantul ar
     * apasa din nou si registrul l-ar opri fara sa spuna de ce.
     */
    await logError({
      action: "fedex/awb-scriere",
      message: `AWB FedEx ${awb} creat, dar nescris pe comanda ${orderId}: ${eScriere?.message ?? "niciun rand"}`,
      details: { businessId, orderId, awb },
      businessId,
      severity: "critical",
    });
    return { error: `AWB-ul ${awb} a fost creat la FedEx, dar nu s-a putut scrie pe comanda. Noteaza-l si anunta suportul.` };
  }

  /* `void`, ca la ceilalti treisprezece: coada About You e best-effort si nu are
     voie sa tina raspunsul catre comerciant sau sa rupa emiterea daca pica. */
  dupaRaspuns(() => enqueueAboutYouShip(businessId, orderId), "enqueueAboutYouShip", businessId);
  return { awb };
}

/** Sterge AWB-ul de pe comanda, dupa ce l-a anulat la ei. */
export async function deleteFedexAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true; eraDejaAnulat: boolean } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, admin, config, order } = ctx;

  const awb = (order as { fedex_awb_number?: string | null }).fedex_awb_number ?? "";
  if (!awb) return { error: "Comanda n-are AWB FedEx." };

  let rezultat;
  try {
    rezultat = await anuleaza(config, awb);
  } catch (e) {
    return { error: (e as Error).message };
  }

  /*
   * ⚠ SE GOLESC TOATE COLOANELE, nu doar numarul.
   *
   * `fedex_status_code` lasat scris inseamna ca, la o reemitere pe aceeasi comanda,
   * cronul citeste codul VECHI: daca era final, expedierea NOUA iese din urmarire la
   * prima trecere si comanda nu se mai misca niciodata. Iar `fedex_status_checked_at`
   * ramas ar trimite coletul nou la coada rotatiei in loc de cap.
   */
  const { error: eScriere } = await supabase.from("orders").update({
    fedex_awb_number: null,
    fedex_service_type: null,
    fedex_service_name: null,
    fedex_cost: null,
    fedex_currency: null,
    fedex_reference: null,
    fedex_tracking_url: null,
    fedex_awb_at: null,
    fedex_status_code: null,
    fedex_status_checked_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  if (eScriere) return { error: eScriere.message };

  /*
   * ⚠ Eticheta pastrata se sterge ODATA cu AWB-ul. Ramasa, o reemitere ar gasi randul
   * vechi (cheia e `order_id`) si — daca noua emitere n-ar apuca sa-l suprascrie —
   * comerciantul ar tipari eticheta unui AWB ANULAT si coletul ar fi refuzat la
   * preluare. Esecul stergerii nu opreste nimic, dar se stie.
   */
  const { error: eEticheta } = await admin.from("fedex_etichete").delete().eq("order_id", orderId);
  if (eEticheta) {
    await logError({
      action: "fedex/eticheta-stergere",
      message: `AWB FedEx ${awb} anulat, dar eticheta veche a ramas pentru comanda ${orderId}: ${eEticheta.message}`,
      details: { businessId, orderId, awb },
      businessId,
      severity: "warning",
    });
  }

  /*
   * ⚠ ABIA DUPA scriere, si rezultatul SE CITESTE: un slot ramas `reusit` face ca
   * emiterea urmatoare sa intre pe ramura „adopta rezultatul" si sa scrie inapoi
   * AWB-ul ANULAT — transport inexistent, marfa care nu pleaca, si un blocaj
   * invizibil. Defectul a fost trait la Packeta.
   */
  const eliberat = await marcheazaAnulata(admin, businessId, cheieOperatie("awb", "fedex", orderId));
  if (!eliberat) {
    await logError({
      action: "fedex/eliberare-slot",
      message: `AWB FedEx ${awb} anulat, dar slotul din registru n-a fost eliberat pentru comanda ${orderId}`,
      details: { businessId, orderId, awb },
      businessId,
      severity: "critical",
    });
  }

  return { success: true, eraDejaAnulat: rezultat.eraDejaAnulat };
}

/**
 * Eticheta AWB, ca base64.
 *
 * ⚠ Vine din TABELUL NOSTRU, nu de la FedEx: ei nu au endpoint de reimprimare, iar
 * linkul din raspunsul de emitere expira in cel mult 12 ore. E singurul curier din
 * cei paisprezece la care o pierdere de-a noastra e definitiva.
 *
 * ⚠ Si se citeste cu SERVICE ROLE, dupa ce proprietatea a fost dovedita:
 * `fedex_etichete` are RLS pornit si NICIO politica, fiindca o eticheta poarta
 * numele, telefonul si adresa cumparatorului.
 */
export async function getFedexEtichetaAction(
  businessId: string,
  orderId: string,
): Promise<{ ok: true; base64: string; nume: string } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const { data, error } = await createAdminClient()
    .from("fedex_etichete")
    .select("continut, format, awb_number")
    .eq("order_id", orderId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data?.continut) {
    return {
      ok: false,
      error:
        "Eticheta nu e salvata pentru comanda asta. FedEx nu permite reimprimarea prin API, "
        + "deci descarca-o din contul FedEx dupa numarul AWB.",
    };
  }

  return {
    ok: true,
    base64: data.continut,
    nume: `AWB-FedEx-${data.awb_number}.${extensiaEtichetei(data.format)}`,
  };
}

/**
 * „Am trimis si n-am primit raspuns — s-a creat sau nu?"
 *
 * ⚠ ASTA E CE N-AVEA SHIPO. Se cauta la FedEx dupa referinta NOASTRA
 * (`POST /track/v1/referencenumbers`), fara riscul de a emite al doilea AWB.
 *
 * ⚠ Fereastra de date e obligatorie la ei si nu poate depasi 30 de zile
 * (`TRACKING.SHIPDATERANGE.ERROR`). Se cauta pe ultimele 14 zile, ceea ce acopera
 * orice blocaj real fara sa se apropie de plafon.
 *
 * ⚠ Si NU se adopta orice: daca AWB-ul gasit e deja anulat la ei (`CA`), se ridica
 * doar blocajul — scris pe comanda, ar fi un transport care nu exista. Aceeasi
 * hotarare ca la SmartShip cu statusul 10.
 */
export async function verificaFedexAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ ok: true; gasit: boolean; awb?: string; mesaj: string } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { supabase, admin, config, order } = ctx;

  const comanda = order as typeof order & { fedex_awb_number?: string | null; order_number?: string | number | null };
  if (comanda.fedex_awb_number) {
    return { ok: true, gasit: true, awb: comanda.fedex_awb_number, mesaj: "Comanda are deja AWB FedEx." };
  }

  const referinta = referintaComenzii(businessId, comanda.order_number ?? orderId.slice(0, 8));
  const acum = new Date();
  const deLa = new Date(acum.getTime() - 14 * 24 * 3600 * 1000);

  let rezultat;
  try {
    rezultat = await cautaDupaReferinta(config, referinta, deLa, acum);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  /**
   * Ridicarea blocajului din registru.
   *
   * ⚠ NU `marcheazaAnulata`, si asta a fost o regresie proprie.
   *
   * `marcheaza_operatie_anulata` muta doar din `reusit` si `necunoscut`. Dar cazul
   * pentru care exista butonul asta e chiar celalalt: emiterea a murit INTRE
   * rezervare si incheiere, deci randul a ramas `in_curs` — si de acolo functia
   * aceea nu-l scoate. Rezultatul ei era si aruncat, asa ca actiunea raspundea
   * „poti emite din nou" fara sa fi deblocat nimic, iar urmatoarea apasare pe
   * „Emite" era refuzata de registru. Bucla inchisa, fara nicio urma.
   *
   * `deblocheazaOperatie` scrie `esuat` prin `incheie_operatie_externa`, deci merge
   * din amandoua starile. Iar `operatiiAtarnate` filtreaza tot ce e `in_curs` de mai
   * putin de trei minute — chiar garda care impiedica deblocarea unei emiteri INCA
   * IN ZBOR, care la FedEx (fara idempotenta) ar insemna al doilea AWB, taxabil.
   */
  const ridicaBlocajul = async (explicatie: string) => {
    const atarnate = await operatiiAtarnate(admin, businessId, orderId);
    const aNoastra = atarnate.find((o) => o.cheie === cheieOperatie("awb", "fedex", orderId));
    if (!aNoastra) return { ok: true as const, gasit: false, mesaj: `${explicatie} Poti emite AWB-ul.` };

    const r = await deblocheazaOperatie(
      admin, businessId, aNoastra.id,
      "verificat prin /track/v1/referencenumbers: expedierea nu exista la FedEx",
    );
    if (!r.ok) return { ok: false as const, error: r.mesaj };
    return {
      ok: true as const,
      gasit: false,
      mesaj: r.stabilizata
        ? `${explicatie} Operatia se incheiase intre timp pe alt drum — reincarca pagina inainte de a emite.`
        : `${explicatie} Blocajul a fost ridicat, poti emite din nou.`,
    };
  };

  if (rezultat.gasite.length === 0) {
    /*
     * ⚠ „Lista goala" NU inseamna automat „nu exista".
     *
     * Al cincilea nivel de citire a raspunsului lor — `trackResults[].error` intr-un
     * 200 — acopera si `TRACKING.DATA.NOTUNIQUE`, adica „sunt MAI MULTE expedieri cu
     * referinta asta". Deblocat pe un asemenea raspuns, comerciantul ar fi emis al
     * doilea AWB peste unul care exista deja. Se deblocheaza DOAR cand toate erorile
     * intalnite chiar spun „nu exista".
     */
    if (!chiarNuExista(rezultat.coduriEroare)) {
      return {
        ok: false,
        error:
          "FedEx a raspuns, dar nu a putut spune limpede daca expedierea exista "
          + `(${rezultat.coduriEroare.join(", ")}). Verifica in contul FedEx dupa referinta ${referinta} `
          + "inainte de a emite din nou: o a doua emitere ar produce al doilea AWB, taxabil.",
      };
    }
    return ridicaBlocajul("FedEx nu are nicio expediere cu referinta comenzii.");
  }

  const viu = rezultat.gasite.find((g) => (g.cod ?? "").toUpperCase() !== "CA");
  if (!viu) {
    return ridicaBlocajul(
      `La FedEx exista o expediere cu referinta comenzii (${rezultat.gasite[0].awb}), dar e ANULATA. `
      + "N-am scris-o pe comanda.",
    );
  }

  /*
   * ⚠ STATUSUL NU SE SCRIE AICI, si nu din lene.
   *
   * `fedex_status_code` scris fara tranzitie e o capcana: daca AWB-ul gasit e deja
   * `DL`, codul e FINAL, iar cronul (`eStareFinala`) scoate expedierea din urmarire
   * la prima trecere — deci comanda ar ramane vesnic „In procesare", n-ar fi
   * facturata automat si nimeni n-ar afla de ce. Lasat NULL, cronul isi face treaba
   * intreaga: vede starea, muta comanda, declanseaza facturarea.
   *
   * Se scrie insa `status`, ca la emitere: comanda CHIAR are acum un AWB.
   */
  const { error: eScriere } = await supabase.from("orders").update({
    fedex_awb_number: viu.awb,
    fedex_reference: referinta,
    fedex_tracking_url: linkUrmarire(viu.awb),
    fedex_awb_at: new Date().toISOString(),
    status: order.status === "pending" || order.status === "confirmed" ? "processing" : order.status,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId);

  if (eScriere) return { ok: false, error: eScriere.message };

  /* Aceeasi coada ca la emitere: calea de recuperare pune tot un AWB pe comanda. */
  dupaRaspuns(() => enqueueAboutYouShip(businessId, orderId), "enqueueAboutYouShip", businessId);

  return {
    ok: true,
    gasit: true,
    awb: viu.awb,
    mesaj: `Expedierea exista la FedEx (AWB ${viu.awb}) si a fost scrisa pe comanda.`,
  };
}

/*
 * ⚠ AICI A FOST `urmaresteFedexAction`, SI A FOST STEARSA. Nu o readauga asa.
 *
 * Scria `fedex_status_code` fara sa treaca comanda prin `tranzitieComandaMarketplace`.
 * Un cod FINAL scris pe drumul acela (`DL`) scotea expedierea din urmarire —
 * `eStareFinala` face cronul s-o sara — deci comanda ramanea vesnic „In procesare",
 * nefacturata automat, si nimeni n-avea de unde afla de ce.
 *
 * Era si cod mort: niciun component nu o chema. Dar intr-un fisier `"use server"`
 * fiecare export e un endpoint HTTP inregistrat in manifestul global, deci „mort" nu
 * inseamna „inofensiv".
 *
 * Urmarirea se face in `/api/cron/fedex-tracking`, care tranzitioneaza comanda si
 * abia apoi retine codul. Daca vreodata e nevoie de un buton „verifica acum", el
 * trebuie sa repete acelasi tipar, nu doar sa scrie coloana.
 */
