"use server";

import { enqueueAboutYouShip } from "@/lib/aboutyou/queue";
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
  anuleaza, cautaDupaReferinta, cautaEtichetaDupaReferinta, creeazaExpediere, linkUrmarire,
  probaConexiune, puncte, reimprimaEticheta, tarife, upsGata,
  type OfertaUps, type ProbaUps, type PunctUps, type UpsConfig,
} from "@/lib/ups/client";
import {
  corpExpediere, corpTarife, eAceeasiLocalitate, lipsuriExpediere, referintaComenzii,
  type AdresaComanda, type DateExpediere, type PunctAles,
} from "@/lib/ups/expediere";
import { ofertePosibile } from "@/lib/ups/preturi";
import { serviciiPropuse } from "@/lib/ups/servicii";
import type { Json } from "@/types/database.types";

/**
 * Actiunile UPS.
 *
 * ⚠ UPS ARE RAMBURS, SPRE DEOSEBIRE DE FEDEX — dar cu doua conditii pe care API-ul
 * nu le poate verifica: contul trebuie sa fie de tip „Daily Pickup" sau „Drop
 * Shipping", iar rambursul se pune la NIVEL DE EXPEDIERE, nu de colet. Tipul contului
 * nu se poate citi de nicaieri, de aia proba de conexiune coteaza si cu ramburs.
 *
 * ⚠ NU ARE IDEMPOTENTA. `idempot*` are zero potriviri in `Shipping.yaml`, iar `transId`
 * e, prin propria lor descriere, doar „an identifier unique to the request". O
 * reincercare oarba creeaza al doilea AWB, taxabil. De aia emiterea trece prin
 * registrul de operatii externe.
 *
 * ⚠ IAR RECUPERAREA SE FACE INTAI PRIN REIMPRIMARE, NU PRIN URMARIRE.
 *
 * Cautarea dupa referinta (`/track/v1/reference/details/`) pare facuta pentru „am
 * trimis si n-am primit raspuns", dar parametrii ei se cheama `fromPickUpDate` si
 * `toPickUpDate` — indexul e pe data RIDICARII. Iar fereastra care ne intereseaza e de
 * cateva minute dupa creare, cand coletul e inca la comerciant. Daca o expediere
 * creata acum doua minute se gaseste sau nu acolo NU E DOCUMENTAT nicaieri, si un „nu
 * exista" gresit deblocheaza exact reincercarea care produce al doilea AWB.
 *
 * Reimprimarea nu are problema asta: eticheta exista din clipa in care expedierea a
 * fost creata, si `LabelResults.TrackingNumber` se intoarce „if … Combination of
 * Reference Number and Shipper Number present in request". Deci se incearca INTAI ea,
 * si abia apoi urmarirea. Vezi `verificaUpsAwbAction`.
 */

// ─── Proprietate si configurare ───────────────────────────────────────────────

type Proprietar =
  | { ok: false; error: string }
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> };

/**
 * ⚠ NEEXPORTAT, si nu din stil.
 *
 * `"use server"` face din FIECARE export al fisierului un endpoint HTTP inregistrat in
 * manifestul global. Exportat, ajutorul asta ar lasa pe oricine sa-si aleaga
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
 * clientul comerciantului `client_secret` ar sosi `enc.v1.…` — un sir plauzibil care ar
 * produce 401 la fiecare cerere de token, fara ca nimic sa spuna de ce, iar
 * comerciantul si-ar regenera cheile degeaba. Service role ocoleste RLS, de aceea
 * proprietatea se verifica INAINTE, la fiecare apelant.
 */
async function configDinBaza(businessId: string): Promise<UpsConfig | null> {
  /* ⚠ `error` se ia si se ARUNCA. Ignorat, o citire cazuta iesea ca „nicio configurare",
     iar apelantii scriu apoi INTREGUL obiect inapoi — deci golul inchipuit s-ar fi scris
     peste acreditari. Vezi incidentul Trendyol din 24.08.2026 si `pazeste_secretele`.
     ⚠ `maybeSingle`: un magazin fara rand e legitim; o citire cazuta nu e. */
  const { data, error } = await createAdminClient()
    .from("store_settings").select("ups_config").eq("business_id", businessId).maybeSingle();
  if (error) throw new Error(`Configurarea nu s-a putut citi: ${error.message}`);
  return (data?.ups_config ?? null) as UpsConfig | null;
}

export async function saveUpsConfig(
  businessId: string,
  config: UpsConfig,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  // Configul vechi se citeste cu SERVICE ROLE: pe clientul comerciantului campurile
  // secrete sosesc ca siruri `enc.v1.…`, iar `pastreazaSecretele` le-ar „pastra" asa.
  const { data: vechi } = await createAdminClient()
    .from("store_settings").select("ups_config").eq("business_id", businessId).maybeSingle();

  const configFinal = pastreazaSecretele("ups_config", config, vechi?.ups_config);

  const { error } = await supabase.from("store_settings").update({
    ups_config: configFinal as unknown as Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectUps(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };

  const { error } = await ctx.supabase.from("store_settings").update({
    ups_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

/**
 * Proba de conexiune.
 *
 * ⚠ NU se opreste la „am luat un token". Un token se ia cu orice pereche de chei
 * valide, chiar daca aplicatia din portalul UPS n-are acces la Rating si chiar daca
 * numarul de cont e al altcuiva. Se cer DOUA cotari reale, de la adresa expeditorului
 * catre ea insasi: una simpla si una CU RAMBURS.
 *
 * A doua e cea care merita drumul: rambursul UPS cere un cont „Daily Pickup" sau „Drop
 * Shipping", tipul contului nu se poate citi de nicaieri, iar pe un cont nepotrivit
 * TOATE comenzile cu plata la livrare ar primi tacut tariful fix.
 *
 * Defectul de ocolit e cel de la fGO (2026-08-15), unde „Testeaza conexiunea" chema un
 * nomenclator PUBLIC si trecea cu credentiale inventate.
 */
export async function testUpsConnectionAction(
  businessId: string,
  config: Partial<UpsConfig>,
): Promise<{ ok: true; proba: ProbaUps } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  /* Secretul din formular bate pe cel salvat: omul tocmai l-a lipit si vrea sa-l probeze. */
  const client_secret = await secretDinConfig(businessId, "ups_config", "client_secret", config.client_secret);
  const salvata = await configDinBaza(businessId);

  const deProbat: UpsConfig = {
    ...(salvata ?? {} as UpsConfig),
    ...config,
    enabled: true,
    client_id: (config.client_id ?? salvata?.client_id ?? "").trim(),
    client_secret,
    account_number: (config.account_number ?? salvata?.account_number ?? "").trim(),
    expeditor: config.expeditor ?? salvata?.expeditor,
    mediu: config.mediu ?? salvata?.mediu,
  };

  if (!deProbat.client_id) return { ok: false, error: "Pune Client ID inainte de a testa." };
  if (!client_secret) return { ok: false, error: "Pune Client Secret inainte de a testa." };
  if (!deProbat.account_number) return { ok: false, error: "Pune numarul de cont UPS inainte de a testa." };
  if (!(deProbat.expeditor?.oras ?? "").trim() || !(deProbat.expeditor?.cod_postal ?? "").trim()) {
    return {
      ok: false,
      error: "Completeaza orasul si codul postal al expeditorului: proba chiar cere o cotare, nu doar un token.",
    };
  }

  /*
   * ⚠ Cotare catre o ALTA localitate, nu catre ea insasi.
   *
   * Ghidul lor romanesc spune ca „UPS nu presteaza servicii postale in aceeasi
   * localitate pe teritoriul Romaniei". O proba de la expeditor catre el insusi ar
   * cadea chiar pe restrictia aia si ar raporta „conexiunea nu merge" pentru niste
   * credentiale bune. Se coteaza deci catre un oras mare, diferit de al lui.
   */
  const orasProba = (deProbat.expeditor?.oras ?? "").trim().toLowerCase().includes("bucur")
    ? { oras: "Cluj-Napoca", judet: "Cluj", codPostal: "400001" }
    : { oras: "Bucuresti", judet: "Bucuresti", codPostal: "030167" };

  /*
   * ⚠ PROBA DE RAMBURS SE FACE CU RAMBURSUL PORNIT, ORICE AR SPUNE COMUTATORUL.
   *
   * `corpTarife` nu mai pune containerul COD cand `ramburs_activ === false` — corect
   * pentru comenzi reale, dar aici ar fi golit chiar proba: cele doua cotari ar fi
   * devenit identice, iar „Contul UPS accepta ramburs" s-ar fi afisat pe baza unei
   * cereri care n-a cerut niciodata ramburs. Iar interfata ii spune omului sa stinga
   * comutatorul cand proba pica — deci a doua proba i-ar fi raportat, mincinos, ca
   * acum merge.
   */
  const pentruProba: UpsConfig = { ...deProbat, ramburs_activ: true };

  const proba = await probaConexiune(pentruProba, (cuRamburs) => corpTarife(pentruProba, {
    destinatar: {
      nume: "Proba Edinio",
      strada: "Bulevardul Principal",
      numar: "1",
      oras: orasProba.oras,
      judet: orasProba.judet,
      codPostal: orasProba.codPostal,
      telefon: deProbat.expeditor?.telefon ?? null,
      tara: "RO",
    },
    greutateKg: 1,
    ...(cuRamburs ? { ramburs: 100 } : {}),
  }));

  return { ok: true, proba };
}

/** Serviciile pe care le poate bifa comerciantul in configurare. */
export async function getUpsServiciiAction(
  businessId: string,
): Promise<{ ok: true; servicii: { cod: string; nume: string; intern: boolean; extern: boolean }[] } | { ok: false; error: string }> {
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
    admin.from("store_settings").select("ups_config").eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = (settings?.ups_config ?? null) as UpsConfig | null;
  if (!upsGata(config)) {
    return {
      error:
        "UPS nu e configurat complet. Ai nevoie de Client ID, Client Secret, numarul de cont "
        + "si adresa de expeditie (oras si cod postal).",
    };
  }

  return { supabase, admin, config, order };
}

export type DateAwbUps = {
  destinatar: AdresaComanda;
  greutateKg: number;
  continut?: string | null;
  ramburs?: number;
  valoareComanda?: number;
  /** ⚠ CHEIA ofertei. La UPS e codul serviciului, si e de ajuns. */
  serviceCode?: string | null;
  /** Numele serviciului, luat din COTARE. */
  serviceName?: string | null;
  /** Pretul cotat, pastrat ca sa se poata compara cu factura UPS. */
  cost?: number | null;
  valuta?: string | null;
  /** Punctul UPS Access Point ales de cumparator, cand exista. */
  punct?: PunctAles | null;
};

function dateExpediere(date: DateAwbUps, referinta: string | null): DateExpediere {
  return {
    destinatar: date.destinatar,
    greutateKg: date.greutateKg,
    continut: date.continut,
    ramburs: date.ramburs,
    valoareComanda: date.valoareComanda,
    serviceCode: date.serviceCode,
    punct: date.punct ?? null,
    referinta,
  };
}

// ─── Cotare ───────────────────────────────────────────────────────────────────

export type RezultatCotare = {
  oferte: OfertaUps[];
  valuteRefuzate: string[];
  doarPretDeLista: boolean;
  alerte: string[];
  neVanduteInRomania: string[];
  /** Ruta cade sub restrictia „aceeasi localitate" din ghidul lor romanesc? */
  aceeasiLocalitate: boolean;
};

/**
 * Ofertele pentru o comanda, din panou.
 *
 * ⚠ Citire pura la efect: cotarea nu creeaza nimic. Dar E un apel pe contul
 * comerciantului, si contul are cota — deci nu in bucla.
 */
export async function coteazaUpsAction(
  businessId: string,
  orderId: string,
  date: DateAwbUps,
): Promise<{ ok: true } & RezultatCotare | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { config } = ctx;

  /*
   * ⚠ Se spune AICI, nu dupa ce comerciantul alege un pret si apasa „Emite".
   *
   * Cu rambursul stins din configurare, `corpTarife` nici nu mai trimite containerul,
   * deci preturile intoarse ar fi ale unei expedieri FARA plata la livrare — corecte
   * ca numere, dar pentru alt serviciu decat cel de care are nevoie comanda.
   */
  if (Number(date.ramburs) > 0 && config.ramburs_activ === false) {
    return {
      ok: false,
      error:
        "Comanda are plata la livrare, iar rambursul UPS e stins in configurare. UPS il ofera doar pe "
        + "conturi de tip „Daily Pickup” sau „Drop Shipping” — verifica tipul contului cu reprezentantul, "
        + "apoi porneste comutatorul din Integrari → UPS.",
    };
  }

  try {
    const d = dateExpediere(date, null);
    const { oferte, alerte } = await tarife(config, corpTarife(config, d));
    const r = ofertePosibile(oferte, config, {
      greutateKg: date.greutateKg,
      taraExpeditor: config.expeditor?.tara ?? "RO",
      taraDestinatar: date.destinatar.tara ?? "RO",
    }, alerte);
    return { ok: true, ...r, aceeasiLocalitate: eAceeasiLocalitate(config, date.destinatar) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Punctele UPS Access Point din jurul unei localitati. */
export async function getUpsPuncteAction(
  businessId: string,
  cautare: { oras: string; judet?: string; codPostal?: string },
): Promise<{ ok: true; puncte: PunctUps[] } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const config = await configDinBaza(businessId);
  if (!upsGata(config)) return { ok: false, error: "UPS nu e configurat complet." };

  try {
    return { ok: true, puncte: await puncte(config, cautare) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─── Emiterea AWB ─────────────────────────────────────────────────────────────

/**
 * Eticheta se pastreaza intr-un tabel al nostru.
 *
 * ⚠ UPS ARE reimprimare, si totusi se pastreaza. Motivul e ca documentatia lor se
 * contrazice pe fata: OpenAPI-ul spune „retrieve forward and return labels", iar
 * schema cererii se descrie pe sine „Request for obtaining the Label for the **return**
 * shipment", iar ghidul lor spune „ONLY Return Shipments support Label Recovery".
 * Codurile lor de eroare confirma ca poate sa nu mearga: „the label is expired",
 * „the package has been sent to the destination address".
 *
 * ⚠ Se pastreaza TREI lucruri, nu unul:
 *   - eticheta;
 *   - caseta de semnatura Varsovia, care se intoarce numai la expedierile din afara
 *     Statelor Unite si trebuie tiparita odata cu ea;
 *   - pagina de ramburs („COD Turn In Page"), pe care o ia soferul odata cu banii.
 *
 * Scrierea NU are voie sa rupa emiterea: AWB-ul exista deja la ei, iar o eroare
 * intoarsa aici l-ar impinge pe om sa apese din nou.
 */
async function pastreazaEticheta(
  admin: ReturnType<typeof createAdminClient>,
  businessId: string,
  orderId: string,
  awb: string,
  raspuns: { eticheta: string | null; formatEticheta: string | null; semnatura: string | null; documentRamburs: string | null },
  config: UpsConfig,
): Promise<void> {
  if (!raspuns.eticheta) return;

  const { error } = await admin.from("ups_etichete").upsert({
    order_id: orderId,
    business_id: businessId,
    awb_number: awb,
    /* ⚠ Formatul REAL intors, nu cel cerut. Vezi nota din `creeazaExpediere`. */
    format: raspuns.formatEticheta ?? config.format_eticheta ?? "GIF",
    continut: raspuns.eticheta,
    semnatura: raspuns.semnatura,
    document_ramburs: raspuns.documentRamburs,
  }, { onConflict: "order_id" });

  if (error) {
    await logError({
      action: "ups/eticheta-pastrare",
      message:
        `AWB UPS ${awb} creat, dar eticheta nu s-a putut pastra pentru comanda ${orderId}: ${error.message}. `
        + "Reimprimarea UPS e nesigura pentru expedierile normale, deci descarc-o din contul UPS.",
      details: { businessId, orderId, awb },
      businessId,
      severity: "critical",
    });
  }
}

export async function createUpsAwbAction(
  businessId: string,
  orderId: string,
  date: DateAwbUps,
): Promise<{ awb: string } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, admin, config, order } = ctx;

  const comanda = order as typeof order & { ups_awb_number?: string | null; order_number?: string | number | null };
  if (comanda.ups_awb_number) {
    return { error: "AWB-ul UPS a fost deja creat pentru comanda asta." };
  }

  const referinta = referintaComenzii(businessId, comanda.order_number ?? orderId.slice(0, 8));
  const d = dateExpediere(date, referinta);

  /*
   * ⚠ Tot ce se poate verifica local se verifica INAINTE de rezervarea din registru: o
   * comanda careia ii lipseste orasul n-are de ce sa ocupe un slot.
   */
  const lipsuri = lipsuriExpediere(config, d);
  const toate = [...lipsuri.configurare, ...lipsuri.comanda];
  if (toate.length) return { error: `Nu se poate emite AWB-ul: ${toate.join("; ")}.` };

  const corp = corpExpediere(config, d);

  const r = await cuRegistru(
    admin,
    { businessId, orderId, fel: "awb", furnizor: "ups", cheie: cheieOperatie("awb", "ups", orderId) },
    async () => {
      const raspuns = await creeazaExpediere(config, corp, referinta);
      return {
        referinta: raspuns.awb,
        /*
         * ⚠ Eticheta NU intra in `detalii`: e o imagine de zeci de kilooctdeti, iar
         * registrul e un jurnal citit la fiecare pagina de comanda. Sta in
         * `ups_etichete`, scrisa imediat mai jos.
         */
        detalii: {
          referintaNoastra: referinta,
          negociat: raspuns.negociat,
          formatEticheta: raspuns.formatEticheta,
          alerte: raspuns.alerte.map((a) => `${a.code}:${a.description}`),
        } as Json,
        valoare: raspuns,
      };
    },
    verdictFurnizor,
    /*
     * ⚠ NU se da `legaturaVie`, aceeasi hotarare ca la Innoship, GLS, Pall-Ex, Posta,
     * SmartShip, Shipo si FedEx: `false` pe ramura `deja` inseamna „elibereaza slotul
     * si REIA", adica o a doua expediere reala, platita. La UPS e cu atat mai apasat cu
     * cat ei n-au idempotenta — deblocarea se face de om, dupa `verificaUpsAwbAction`.
     */
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

  const raspuns = r.fel === "facut" ? r.valoare : null;
  const awb = r.fel === "facut" ? r.valoare.awb : (r.referinta ?? "");

  if (!awb) {
    return {
      error:
        "Operatia figureaza ca reusita in registru, dar fara numar de expediere. "
        + "Verifica in contul UPS si deblocheaz-o din /admin/operatii.",
    };
  }

  if (raspuns) await pastreazaEticheta(admin, businessId, orderId, awb, raspuns, config);

  const numarDin = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const sirDin = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    ups_awb_number: awb,
    ups_service_code: sirDin(date.serviceCode),
    ups_service_name: sirDin(date.serviceName),
    /*
     * ⚠ Pretul din COTARE bate pe cel din raspunsul de emitere, si nu invers: cel din
     * cotare e chiar ce a vazut si a acceptat cumparatorul. Cel de la emitere se ia
     * doar cand cotarea n-a dat nimic.
     */
    ups_cost: numarDin(date.cost) ?? numarDin(raspuns?.cost),
    ups_currency: sirDin(date.valuta) ?? raspuns?.valuta ?? null,
    ups_reference: referinta,
    ups_tracking_url: linkUrmarire(awb),
    ups_awb_at: new Date().toISOString(),
    status: order.status === "pending" || order.status === "confirmed" ? "processing" : order.status,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  if (eScriere || !randuri?.length) {
    /*
     * ⚠ AWB-ul EXISTA la ei, dar comanda nu-l poarta. Fara semnal, comerciantul ar
     * apasa din nou si registrul l-ar opri fara sa spuna de ce.
     */
    await logError({
      action: "ups/awb-scriere",
      message: `AWB UPS ${awb} creat, dar nescris pe comanda ${orderId}: ${eScriere?.message ?? "niciun rand"}`,
      details: { businessId, orderId, awb },
      businessId,
      severity: "critical",
    });
    return { error: `AWB-ul ${awb} a fost creat la UPS, dar nu s-a putut scrie pe comanda. Noteaza-l si anunta suportul.` };
  }

  /* `void`, ca la ceilalti paisprezece: coada About You e best-effort si nu are voie
     sa tina raspunsul catre comerciant sau sa rupa emiterea daca pica. */
  void enqueueAboutYouShip(businessId, orderId);
  return { awb };
}

/** Sterge AWB-ul de pe comanda, dupa ce l-a anulat la ei. */
export async function deleteUpsAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true; eraDejaAnulat: boolean } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, admin, config, order } = ctx;

  const awb = (order as { ups_awb_number?: string | null }).ups_awb_number ?? "";
  if (!awb) return { error: "Comanda n-are AWB UPS." };

  let rezultat;
  try {
    rezultat = await anuleaza(config, awb);
  } catch (e) {
    return { error: (e as Error).message };
  }

  /*
   * ⚠ SE GOLESC TOATE COLOANELE, nu doar numarul.
   *
   * `ups_status_type` lasat scris inseamna ca, la o reemitere pe aceeasi comanda,
   * cronul citeste starea VECHE: daca era finala, expedierea NOUA iese din urmarire la
   * prima trecere si comanda nu se mai misca niciodata. Iar `ups_status_checked_at`
   * ramas ar trimite coletul nou la coada rotatiei in loc de cap.
   */
  const { error: eScriere } = await supabase.from("orders").update({
    ups_awb_number: null,
    ups_service_code: null,
    ups_service_name: null,
    ups_cost: null,
    ups_currency: null,
    ups_reference: null,
    ups_tracking_url: null,
    ups_awb_at: null,
    ups_status_type: null,
    ups_status_code: null,
    ups_status_checked_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  if (eScriere) return { error: eScriere.message };

  /*
   * ⚠ Eticheta pastrata se sterge ODATA cu AWB-ul. Ramasa, o reemitere ar gasi randul
   * vechi (cheia e `order_id`) si — daca noua emitere n-ar apuca sa-l suprascrie —
   * comerciantul ar tipari eticheta unui AWB ANULAT si coletul ar fi refuzat la
   * preluare. Esecul stergerii nu opreste nimic, dar se stie.
   */
  const { error: eEticheta } = await admin.from("ups_etichete").delete().eq("order_id", orderId);
  if (eEticheta) {
    await logError({
      action: "ups/eticheta-stergere",
      message: `AWB UPS ${awb} anulat, dar eticheta veche a ramas pentru comanda ${orderId}: ${eEticheta.message}`,
      details: { businessId, orderId, awb },
      businessId,
      severity: "warning",
    });
  }

  /*
   * ⚠ ABIA DUPA scriere, si rezultatul SE CITESTE: un slot ramas `reusit` face ca
   * emiterea urmatoare sa intre pe ramura „adopta rezultatul" si sa scrie inapoi AWB-ul
   * ANULAT — transport inexistent, marfa care nu pleaca, si un blocaj invizibil.
   * Defectul a fost trait la Packeta.
   */
  const eliberat = await marcheazaAnulata(admin, businessId, cheieOperatie("awb", "ups", orderId));
  if (!eliberat) {
    await logError({
      action: "ups/eliberare-slot",
      message: `AWB UPS ${awb} anulat, dar slotul din registru n-a fost eliberat pentru comanda ${orderId}`,
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
 * ⚠ Vine din TABELUL NOSTRU, si abia daca acolo lipseste se incearca la ei. UPS are
 * reimprimare, dar documentatia lor se contrazice pe fata daca merge si pentru
 * expedierile normale (nu doar pentru retururi) — vezi `pastreazaEticheta`.
 *
 * ⚠ Si se citeste cu SERVICE ROLE, dupa ce proprietatea a fost dovedita:
 * `ups_etichete` are RLS pornit si NICIO politica, fiindca o eticheta poarta numele,
 * telefonul si adresa cumparatorului.
 */
export async function getUpsEtichetaAction(
  businessId: string,
  orderId: string,
): Promise<
  | { ok: true; base64: string; nume: string; format: string; semnatura: string | null; documentRamburs: string | null }
  | { ok: false; error: string }
> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ups_etichete")
    .select("continut, format, awb_number, semnatura, document_ramburs")
    .eq("order_id", orderId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  if (data?.continut) {
    return {
      ok: true,
      base64: data.continut as string,
      format: (data.format as string) ?? "GIF",
      nume: `AWB-UPS-${data.awb_number}.${extensia((data.format as string) ?? "GIF")}`,
      semnatura: (data.semnatura as string | null) ?? null,
      documentRamburs: (data.document_ramburs as string | null) ?? null,
    };
  }

  /*
   * Copia noastra lipseste — se incearca la ei. E singura cale, si e si singurul loc
   * din tot API-ul in care exista PDF.
   */
  const cuComanda = await configSiComanda(businessId, orderId);
  if ("error" in cuComanda) return { ok: false, error: cuComanda.error as string };
  const awb = (cuComanda.order as { ups_awb_number?: string | null }).ups_awb_number ?? "";
  if (!awb) return { ok: false, error: "Comanda n-are AWB UPS." };

  try {
    const r = await reimprimaEticheta(cuComanda.config, awb, "PDF");
    return {
      ok: true,
      base64: r.continut,
      format: r.format,
      nume: `AWB-UPS-${awb}.${extensia(r.format)}`,
      semnatura: null,
      documentRamburs: null,
    };
  } catch (e) {
    return {
      ok: false,
      error:
        `Eticheta nu e salvata la noi, iar UPS n-a putut-o da inapoi: ${(e as Error).message} `
        + "Descarc-o din contul UPS dupa numarul de urmarire.",
    };
  }
}

/** Extensia de fisier pentru un format de eticheta. `ZPL`/`EPL`/`SPL` sunt text. */
function extensia(format: string): string {
  const f = (format ?? "").toUpperCase();
  if (f === "PDF") return "pdf";
  if (f === "PNG") return "png";
  if (f === "ZPL" || f === "EPL" || f === "SPL") return "zpl";
  return "gif";
}

/**
 * „Am trimis si n-am primit raspuns — s-a creat sau nu?"
 *
 * ⚠ SE INTREABA IN DOUA FELURI, SI ORDINEA CONTEAZA.
 *
 * 1. **Reimprimarea dupa referinta.** Eticheta exista din clipa in care expedierea a
 *    fost creata, iar `LabelResults.TrackingNumber` se intoarce „if … Combination of
 *    Reference Number and Shipper Number present in request". Deci e singura intrebare
 *    despre care stim ca are raspuns in primele minute.
 * 2. **Urmarirea dupa referinta.** Parametrii ei se cheama `fromPickUpDate` /
 *    `toPickUpDate` — indexul e pe data RIDICARII, iar despre o expediere creata acum
 *    doua minute si neridicata inca documentatia lor NU SPUNE NIMIC. Ramane utila
 *    pentru comenzi mai vechi.
 *
 * ⚠ Si daca AMANDOUA raspund „nu gasesc", blocajul se ridica — dar se spune limpede ca
 * absenta nu e dovada. Asta e granita: `esuat` se da doar cu dovada, `necunoscut`
 * blocheaza. Vezi `registru-operatii-externe`.
 */
export async function verificaUpsAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ ok: true; gasit: boolean; awb?: string; mesaj: string } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { supabase, admin, config, order } = ctx;

  const comanda = order as typeof order & { ups_awb_number?: string | null; order_number?: string | number | null };
  if (comanda.ups_awb_number) {
    return { ok: true, gasit: true, awb: comanda.ups_awb_number, mesaj: "Comanda are deja AWB UPS." };
  }

  const referinta = referintaComenzii(businessId, comanda.order_number ?? orderId.slice(0, 8));

  /**
   * Ridicarea blocajului din registru.
   *
   * ⚠ NU `marcheazaAnulata`: `marcheaza_operatie_anulata` muta doar din `reusit` si
   * `necunoscut`, iar cazul pentru care exista butonul asta e chiar celalalt — emiterea
   * a murit INTRE rezervare si incheiere, deci randul a ramas `in_curs`.
   * `deblocheazaOperatie` scrie `esuat` prin `incheie_operatie_externa`, deci merge din
   * amandoua starile. Iar `operatiiAtarnate` filtreaza tot ce e `in_curs` de mai putin
   * de trei minute — chiar garda care impiedica deblocarea unei emiteri INCA IN ZBOR.
   */
  const ridicaBlocajul = async (explicatie: string) => {
    const atarnate = await operatiiAtarnate(admin, businessId, orderId);
    const aNoastra = atarnate.find((o) => o.cheie === cheieOperatie("awb", "ups", orderId));
    if (!aNoastra) return { ok: true as const, gasit: false, mesaj: `${explicatie} Poti emite AWB-ul.` };

    const r = await deblocheazaOperatie(
      admin, businessId, aNoastra.id,
      "verificat prin reimprimare dupa referinta si prin urmarire: expedierea nu apare la UPS",
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

  const adopta = async (awb: string, cum: string) => {
    /*
     * ⚠ STATUSUL NU SE SCRIE AICI, si nu din lene. `ups_status_type` scris fara
     * tranzitie e o capcana: daca expedierea e deja livrata, starea e FINALA, iar
     * cronul o scoate din urmarire la prima trecere — deci comanda ar ramane vesnic
     * „In procesare", n-ar fi facturata automat si nimeni n-ar afla de ce.
     */
    const { error } = await supabase.from("orders").update({
      ups_awb_number: awb,
      ups_reference: referinta,
      ups_tracking_url: linkUrmarire(awb),
      ups_awb_at: new Date().toISOString(),
      status: order.status === "pending" || order.status === "confirmed" ? "processing" : order.status,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("business_id", businessId);

    if (error) return { ok: false as const, error: error.message };

    /* Aceeasi coada ca la emitere: calea de recuperare pune tot un AWB pe comanda. */
    void enqueueAboutYouShip(businessId, orderId);
    return { ok: true as const, gasit: true, awb, mesaj: `${cum} (AWB ${awb}) si a fost scrisa pe comanda.` };
  };

  // ─── 1. Reimprimarea dupa referinta ────────────────────────────────────────
  let dinEticheta: Awaited<ReturnType<typeof cautaEtichetaDupaReferinta>> = null;
  try {
    dinEticheta = await cautaEtichetaDupaReferinta(config, referinta, config.format_eticheta ?? "GIF");
  } catch (e) {
    /*
     * ⚠ „Exista, dar nu-ti mai dau eticheta" NU e „nu exista". `cautaEtichetaDupaReferinta`
     * o transforma intr-un refuz cu text limpede, si acolo NU se deblocheaza nimic.
     */
    return { ok: false, error: (e as Error).message };
  }

  if (dinEticheta) {
    /* Se pastreaza si eticheta gasita: e acelasi lucru pe care l-ar fi salvat emiterea. */
    await pastreazaEticheta(admin, businessId, orderId, dinEticheta.awb, {
      eticheta: dinEticheta.eticheta,
      formatEticheta: dinEticheta.format,
      semnatura: null,
      documentRamburs: null,
    }, config);
    return adopta(dinEticheta.awb, "Expedierea exista la UPS");
  }

  // ─── 2. Urmarirea dupa referinta ───────────────────────────────────────────
  const acum = new Date();
  /* 45 de zile: `fromPickUpDate` LIPSA ar cauta doar ultimele 14. */
  const deLa = new Date(acum.getTime() - 45 * 24 * 3600 * 1000);

  let dinUrmarire;
  try {
    dinUrmarire = await cautaDupaReferinta(config, referinta, deLa, acum);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const viu = dinUrmarire.gasite.find((g) => (g.tip ?? "").toUpperCase() !== "MV");
  if (viu?.awb) return adopta(viu.awb, "Expedierea exista la UPS");

  /*
   * ⚠ O EXPEDIERE VIE FARA NUMAR NU E O EXPEDIERE ANULATA.
   *
   * Prima varianta cadea de aici direct pe ramura „e ANULATA" si DEBLOCA registrul —
   * inclusiv cand urmarirea gasise o expediere VIE (`type: "M"`, adica eticheta facuta)
   * din al carei raspuns lipsea `trackingNumber`. Comerciantul citea „exista, dar e
   * ANULATA ()" — cu paranteza goala — si emitea din nou. Doua AWB-uri, ambele taxate,
   * doua colete pe aceeasi comanda.
   */
  if (viu) {
    return {
      ok: false,
      error:
        "UPS a gasit o expediere VIE cu referinta comenzii, dar n-a intors numarul ei de urmarire. "
        + `NU emite din nou — cauta in contul UPS dupa referinta ${referinta} si scrie numarul de mana `
        + "din pagina comenzii.",
    };
  }

  if (dinUrmarire.gasite.length > 0) {
    /* Gasita, si TOATE anulate la ei. Scrisa pe comanda ar fi un transport inexistent. */
    const numar = dinUrmarire.gasite.find((g) => g.awb)?.awb;
    return ridicaBlocajul(
      `La UPS exista o expediere cu referinta comenzii${numar ? ` (${numar})` : ""}, dar e ANULATA. `
      + "N-am scris-o pe comanda.",
    );
  }

  /*
   * ⚠ ABSENTA SE DEBLOCHEAZA DOAR CAND UPS A SPUS-O EL, NU CAND N-AM GASIT NOI NIMIC.
   *
   * `negasit` inseamna 404 („Tracking number information not found") — o afirmatie a lor.
   * O lista goala pe un 200 e altceva: raspunsul poate purta doar un `warnings[]`
   * („Tracking information is not available at this time") pentru o expediere care
   * EXISTA si inca n-a fost scanata. Deblocat acolo, butonul ar produce chiar al doilea
   * AWB pe care exista ca sa-l previna.
   */
  if (!dinUrmarire.negasit) {
    return {
      ok: false,
      error:
        "UPS a raspuns, dar n-a putut spune limpede daca expedierea exista — nici reimprimarea dupa "
        + `referinta, nici urmarirea. Verifica in contul UPS dupa referinta ${referinta} inainte de a emite `
        + "din nou: o a doua emitere ar produce al doilea AWB, taxabil.",
    };
  }

  return ridicaBlocajul(
    "Nici reimprimarea dupa referinta, nici urmarirea nu gasesc vreo expediere cu referinta comenzii "
    + `${referinta}, iar UPS a raspuns explicit „nu exista". ⚠ Daca ai emis in ultimele minute, `
    + "verifica totusi intai in contul UPS: expedierile foarte proaspete pot lipsi din urmarire.",
  );
}

/*
 * ⚠ AICI NU EXISTA `urmaresteUpsAction`, SI NU E O SCAPARE.
 *
 * O actiune care ar scrie `ups_status_type` fara sa treaca comanda prin
 * `tranzitieComandaMarketplace` ar putea scrie o stare FINALA — si atunci cronul
 * (`eStareFinala`) ar scoate expedierea din urmarire, deci comanda ar ramane vesnic „In
 * procesare", nefacturata automat, si nimeni n-ar avea de unde afla de ce. La FedEx a
 * fost exact defectul asta, si actiunea a trebuit stearsa.
 *
 * Urmarirea se face in `/api/cron/ups-tracking`, care tranzitioneaza comanda si abia
 * apoi retine starea.
 */
