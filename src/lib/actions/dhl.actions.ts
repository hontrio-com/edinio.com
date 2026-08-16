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
  anuleazaRidicarea, cautaDupaReferinta, creeazaExpediere, dhlGata, dovadaLivrarii, eMediuDeTest,
  linkUrmarire, lunaRidicare, momentExpedierii, probaConexiune, reimprimaEticheta, tarife,
  type DhlConfig, type OfertaDhl, type ProbaDhl, type RaspunsExpediere,
} from "@/lib/dhl/client";
import {
  AVERTISMENT_RAMBURS, corpExpediere, corpTarife, lipsescDateleVamale, lipsesteCodulPostal,
  lipsuriExpediere, referintaComenzii,
  type AdresaComanda, type ArticolVamal, type DateExpediere,
} from "@/lib/dhl/expediere";
import { ofertePosibile } from "@/lib/dhl/preturi";
import { codProdus, numeProdus, produsePropuse } from "@/lib/dhl/servicii";
import type { Json } from "@/types/database.types";

/**
 * Actiunile DHL Express (MyDHL API), al saisprezecelea transportator.
 *
 * Fisierul e o copie a lui `ups.actions.ts` peste tot unde se poate. Se abate in SASE
 * locuri, si fiecare abatere costa bani daca e uitata:
 *
 * 1. ⚠⚠ NU EXISTA RAMBURS. DHL Express nu vinde plata la livrare cu origine Romania
 *    (verificat pe catalogul lor romanesc, pe ghidul de tarife, pe sonda de capabilitate
 *    si pe paginile a 40 de tari). Nu exista `ramburs_activ` in configurare si nu exista
 *    garda ca la UPS, fiindca nu e nimic de stins: in checkout DHL DISPARE de tot pe
 *    comenzile cu ramburs. Aici, in panou, comerciantul poate totusi emite un AWB pe o
 *    comanda cu plata la livrare — de aia cotarea ii spune limpede ca nu incaseaza nimeni.
 *
 * 2. ⚠⚠ NU EXISTA ANULARE DE EXPEDIERE. `delete:` apare O SINGURA data in toata
 *    specificatia lor, si aceea pe `/pickups/{dispatchConfirmationNumber}`. Deci nu
 *    exista `deleteDhlAwbAction`; exista `dezleagaDhlAwbAction`, care anuleaza RIDICAREA
 *    (cand a fost ceruta) si scoate numerele de pe comanda, spunand raspicat ca
 *    expedierea ramane emisa la ei. Al doilea curier fara anulare, dupa Packeta.
 *
 * 3. ⚠ NU EXISTA IDEMPOTENTA. Nici antet de deduplicare, nici eroare „shipment already
 *    exists". Registrul de operatii externe nu e prudenta, e SINGURA aparare: un
 *    `POST /shipments` reincercat orbeste produce a doua expediere care nu se mai poate
 *    anula si care, prin propriile lor conditii, poate fi FACTURATA. Recuperarea dupa un
 *    raspuns pierdut trece prin `cautaDupaReferinta` — vezi `verificaDhlAwbAction`.
 *
 * 4. ⚠ CODUL POSTAL. DHL cere sase cifre pentru Romania si le verifica, iar checkout-ul
 *    nostru nu cere cod postal la comenzile interne (memoria `cod-postal-lipsa-in-checkout`).
 *    De aia `RezultatCotare` poarta `lipsesteCodulPostal` separat: comerciantul trebuie
 *    sa afle O DATA de ce nu vede preturi DHL, in loc sa caute o gresala in configurare.
 *
 * 5. ⚠ PRODUSUL E OBLIGATORIU LA EMITERE (`productCode` e in `required`). Spre deosebire
 *    de UPS — care fara cod de serviciu factureaza tacit cel mai scump produs — DHL REFUZA
 *    cererea. Codul vine din cotare si se pastreaza pe comanda.
 *
 * 6. ⚠ NU EXISTA LIVRARE IN PUNCT la noi. `GET /servicepoints` exista, dar livrarea la
 *    punct trece prin `onDemandDelivery`, care cere un `servicePointId` obtinut doar prin
 *    „contact your local DHL Express Account Manager". Deci nu exista
 *    `getDhlPuncteAction`, DHL nu intra in `CURIERI_CU_LOCKERE` si pagina de configurare
 *    o spune, ca omul sa nu caute butonul.
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
 * clientul comerciantului `password` ar sosi `enc.v1.…` — un sir plauzibil care ar
 * produce 401 la fiecare cerere, fara ca nimic sa spuna de ce, iar comerciantul si-ar
 * cere degeaba alte credentiale de la consultantul DHL. Service role ocoleste RLS, de
 * aceea proprietatea se verifica INAINTE, la fiecare apelant.
 */
async function configDinBaza(businessId: string): Promise<DhlConfig | null> {
  const { data } = await createAdminClient()
    .from("store_settings").select("dhl_config").eq("business_id", businessId).single();
  return (data?.dhl_config ?? null) as DhlConfig | null;
}

export async function saveDhlConfig(
  businessId: string,
  config: DhlConfig,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  // Configul vechi se citeste cu SERVICE ROLE: pe clientul comerciantului campurile
  // secrete sosesc ca siruri `enc.v1.…`, iar `pastreazaSecretele` le-ar „pastra" asa —
  // adica parola MyDHL API ar fi inlocuita cu textul ei criptat, si toate cotarile ar
  // incepe sa dea 401 fara ca nimeni sa fi schimbat nimic.
  const { data: vechi } = await createAdminClient()
    .from("store_settings").select("dhl_config").eq("business_id", businessId).maybeSingle();

  const configFinal = pastreazaSecretele("dhl_config", config, vechi?.dhl_config);

  const { error } = await supabase.from("store_settings").update({
    dhl_config: configFinal as unknown as Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectDhl(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };

  const { error } = await ctx.supabase.from("store_settings").update({
    dhl_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

/**
 * Proba de conexiune.
 *
 * ⚠ CERE O COTARE REALA PE CONTUL LOR, si trebuie sa poata ESUA.
 *
 * `GET /reference-data` ar fi fost mai ieftin si mai rapid, dar el accepta si `X-API-KEY`
 * si nu atinge deloc contul comerciantului — o proba pe el ar fi raspuns „conexiune
 * reusita" unui magazin al carui cont nu poate cota nimic. Exact defectul fGO din
 * 15.08.2026, unde „Testeaza conexiunea" chema un nomenclator PUBLIC si trecea cu
 * credentiale inventate.
 *
 * Cotarea nu creeaza nimic si nu costa nimic, dar cade cu 401 pe credentiale gresite si
 * cu `998`/`8003` pe un cont care nu e al lor.
 *
 * ⚠ A doua parte a probei (rambursul) NU e un al doilea apel, ca la UPS: se citesc
 * serviciile din devizul ACELEIASI cotari si se cauta `KB`. Vezi `probaConexiune`.
 */
export async function testDhlConnectionAction(
  businessId: string,
  config: Partial<DhlConfig>,
): Promise<{ ok: true; proba: ProbaDhl } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  /* Secretul din formular bate pe cel salvat: omul tocmai l-a lipit si vrea sa-l probeze. */
  const password = await secretDinConfig(businessId, "dhl_config", "password", config.password);
  const salvata = await configDinBaza(businessId);

  const deProbat: DhlConfig = {
    ...(salvata ?? {} as DhlConfig),
    ...config,
    enabled: true,
    username: (config.username ?? salvata?.username ?? "").trim(),
    password,
    account_number: (config.account_number ?? salvata?.account_number ?? "").trim(),
    expeditor: config.expeditor ?? salvata?.expeditor,
    mediu: config.mediu ?? salvata?.mediu,
  };

  if (!deProbat.username) {
    return {
      ok: false,
      error:
        "Pune utilizatorul MyDHL API inainte de a testa. ⚠ E credentiala data de consultantul DHL Express, "
        + "nu „API Key” din aplicatia de pe developer.dhl.com.",
    };
  }
  if (!password) return { ok: false, error: "Pune parola MyDHL API inainte de a testa." };
  if (!deProbat.account_number) {
    return {
      ok: false,
      error:
        "Pune numarul de cont DHL Express inainte de a testa: fara el cotarea intoarce tarifele PUBLICATE, "
        + "nu pe ale contractului tau — adica un pret gresit, nu o eroare.",
    };
  }
  if (!(deProbat.expeditor?.oras ?? "").trim() || !(deProbat.expeditor?.cod_postal ?? "").trim()) {
    return {
      ok: false,
      error: "Completeaza orasul si codul postal al expeditorului: proba chiar cere o cotare, nu doar un raspuns.",
    };
  }

  /*
   * ⚠ Cotare catre o ALTA localitate, si cu cod postal REAL de sase cifre.
   *
   * DHL Express nu presteaza in aceeasi localitate in Romania (nu exista curse de tip
   * „local"), iar `postalCode` e verificat pe formatul tarii: `countryPostalcodeFormat`
   * din datele lor de referinta da pentru RO exact sase cifre. O proba catre expeditorul
   * insusi, sau cu un cod postal inventat, ar raporta „conexiunea nu merge" pentru niste
   * credentiale bune — si comerciantul ar cere altele de la DHL degeaba.
   */
  const orasProba = (deProbat.expeditor?.oras ?? "").trim().toLowerCase().includes("bucur")
    ? { oras: "Cluj-Napoca", judet: "Cluj", codPostal: "400001" }
    : { oras: "Bucuresti", judet: "Bucuresti", codPostal: "030167" };

  const destinatie: AdresaComanda = {
    nume: "Proba Edinio",
    strada: "Bulevardul Principal",
    numar: "1",
    oras: orasProba.oras,
    judet: orasProba.judet,
    codPostal: orasProba.codPostal,
    telefon: deProbat.expeditor?.telefon ?? null,
    tara: "RO",
  };

  try {
    /*
     * ⚠ `POST /rates` e o CITIRE: nu lasa nimic in urma, deci nu trece prin registru si
     * poate fi reincercata oricat. Singurul lucru care se creeaza la DHL e
     * `POST /shipments`, si acela sta in `createDhlAwbAction`.
     */
    const proba = await probaConexiune(deProbat, corpTarife(deProbat, {
      destinatar: destinatie,
      greutateKg: 1,
    }));
    return { ok: true, proba };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Produsele pe care le poate bifa comerciantul in configurare. */
export async function getDhlProduseAction(
  businessId: string,
): Promise<
  | { ok: true; produse: { cod: string; nume: string; intern: boolean; extern: boolean; document: boolean }[] }
  | { ok: false; error: string }
> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const config = await configDinBaza(businessId);
  return { ok: true, produse: produsePropuse(config?.expeditor?.tara ?? "RO") };
}

// ─── Context pentru AWB ───────────────────────────────────────────────────────

async function configSiComanda(businessId: string, orderId: string) {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  const admin = createAdminClient();
  const [{ data: settings }, { data: order }] = await Promise.all([
    admin.from("store_settings").select("dhl_config").eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = (settings?.dhl_config ?? null) as DhlConfig | null;
  if (!dhlGata(config)) {
    return {
      error:
        "DHL nu e configurat complet. Ai nevoie de utilizatorul si parola MyDHL API, numarul de cont "
        + "DHL Express si adresa de expeditie (oras si cod postal).",
    };
  }

  return { supabase, admin, config, order };
}

export type DateAwbDhl = {
  destinatar: AdresaComanda;
  greutateKg: number;
  continut?: string;
  valoareComanda?: number;
  /** ⚠ CHEIA ofertei, si e OBLIGATORIE la ei. Vine din cotare, nu se compune. */
  productCode?: string | null;
  /** Numele produsului, luat din COTARE („EXPRESS WORLDWIDE NONDOC"). */
  productName?: string | null;
  /** ⚠ Codul de produs LOCAL. Se copiaza literal din cotare sau lipseste. */
  localProductCode?: string | null;
  /** Pretul cotat, pastrat ca sa se poata compara cu factura DHL. */
  cost?: number | null;
  valuta?: string | null;
  /** Suma asigurata, cand comerciantul a pornit asigurarea (serviciul lor `II`). */
  asigurare?: number | null;
  /** Articolele comenzii, pentru declaratia vamala. Obligatorii in afara Uniunii. */
  articole?: ArticolVamal[];
};

function dateExpediere(date: DateAwbDhl, referinta: string | null): DateExpediere {
  return {
    destinatar: date.destinatar,
    greutateKg: date.greutateKg,
    continut: date.continut,
    valoareComanda: date.valoareComanda,
    productCode: date.productCode,
    localProductCode: date.localProductCode,
    asigurare: date.asigurare,
    articole: date.articole,
    referinta: referinta ?? undefined,
  };
}

function numarDin(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sirDin(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Sirurile dintr-un camp de `detalii`.
 *
 * ⚠ `detalii` e `Json`, adica orice: un tablou care a trecut prin baza se poate intoarce
 * cu numere sau cu `null` inauntru. Avertismentele ajung direct sub ochii comerciantului,
 * deci ce nu e text se arunca, nu se afiseaza „null".
 */
function siruriDin(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

// ─── Cotare ───────────────────────────────────────────────────────────────────

export type RezultatCotare = {
  oferte: OfertaDhl[];
  valuteRefuzate: string[];
  alerte: string[];
  neVanduteInRomania: string[];
  cerContract: string[];
  /** ⚠ Comanda n-are cod postal de sase cifre — cauza numarul unu a unei cotari goale. */
  lipsesteCodulPostal: boolean;
  /** ⚠ Destinatie din afara Uniunii, fara coduri HS si tari de origine pe articole. */
  lipsescDateleVamale: boolean;
};

/**
 * Ofertele pentru o comanda, din panou.
 *
 * ⚠ Citire pura la efect: cotarea nu creeaza nimic si nu trece prin registru. Dar E un
 * apel pe contul comerciantului, deci nu in bucla.
 *
 * ⚠ CELE DOUA STEAGURI SE CALCULEAZA CHIAR SI CAND COTAREA REUSESTE, si nu degeaba:
 * `/rates` pleaca FARA `strictValidation`, iar DHL are reguli proprii de „fallback" pe
 * localitate prin care alege singur o locatie si raspunde 200. Deci se poate primi un
 * pret pentru o comanda care la EMITERE — unde validarea e stricta — va cadea.
 */
export async function coteazaDhlAction(
  businessId: string,
  orderId: string,
  date: DateAwbDhl,
): Promise<({ ok: true } & RezultatCotare) | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { config, order } = ctx;

  const d = dateExpediere(date, null);
  const lipsuri = lipsuriExpediere(config, d);
  const faraCodPostal = lipsesteCodulPostal(lipsuri);
  const faraDateVamale = lipsescDateleVamale(lipsuri);

  try {
    const { oferte, avertismente } = await tarife(config, corpTarife(config, d));
    const r = ofertePosibile(oferte, config, {
      greutateKg: date.greutateKg,
      taraExpeditor: config.expeditor?.tara ?? "RO",
      taraDestinatar: date.destinatar.tara ?? "RO",
    }, avertismente);

    const alerte = [...r.alerte];

    /*
     * ⚠ PLATA LA LIVRARE, SPUSA AICI SI NU DUPA EMITERE.
     *
     * In checkout DHL nici nu apare pe comenzile cu ramburs. Dar in panou comerciantul
     * poate emite un AWB DHL pe orice comanda, inclusiv pe una cu plata la livrare — si
     * atunci curierul livreaza si NU incaseaza nimic. Banii se pierd tacut, iar comanda
     * arata expediata. Trimis totusi codul lor de ramburs (`KB`), esecul n-ar veni la
     * cotare, ci la EMITERE, cu `7008`.
     */
    const cuRamburs = order.payment_method === "cash_on_delivery" && order.payment_status !== "paid";
    if (cuRamburs) {
      alerte.push(
        `${AVERTISMENT_RAMBURS} ⚠ Comanda asta are plata la livrare si NU e marcata ca platita: `
        + "daca emiti AWB DHL, curierul livreaza fara sa incaseze. Incaseaza banii altfel inainte de a expedia.",
      );
    }

    if (faraCodPostal) {
      alerte.push(
        "Comanda n-are cod postal (DHL cere sase cifre pentru Romania si il verifica). Preturile de mai sus, "
        + "daca exista, vin dintr-o locatie aleasa de DHL, iar emiterea — care valideaza strict — poate cadea.",
      );
    }
    if (faraDateVamale) {
      alerte.push(
        "Destinatia e in afara Uniunii, iar articolelor comenzii le lipsesc codurile vamale (HS) sau tarile "
        + "de origine. Emiterea e oprita pana le completezi: fara ele coletul se opreste in vama, si DHL nu "
        + "are anulare de expediere ca sa se poata repara.",
      );
    }

    return {
      ok: true,
      ...r,
      alerte,
      lipsesteCodulPostal: faraCodPostal,
      lipsescDateleVamale: faraDateVamale,
    };
  } catch (e) {
    /*
     * ⚠ Cand cotarea cade SI stim ca lipseste codul postal, cauza se numeste. Altfel
     * comerciantul citeste un cod de eroare DHL si cauta luni de zile in configurare o
     * gresala care e de fapt in comanda.
     */
    const mesaj = (e as Error).message;
    return {
      ok: false,
      error: faraCodPostal
        ? `${mesaj} ⚠ Comanda n-are cod postal, iar DHL cere sase cifre pentru Romania — cel mai probabil de aici cade.`
        : mesaj,
    };
  }
}

// ─── Emiterea AWB ─────────────────────────────────────────────────────────────

/**
 * Eticheta se pastreaza intr-un tabel al nostru.
 *
 * ⚠⚠ SI AICI NU E O MASURA DE PRUDENTA, CA LA UPS — E SINGURA COPIE CARE VA EXISTA.
 *
 * `GET /shipments/{awb}/get-image` are enumerarea `waybill, commercial-invoice,
 * customs-entry, transport-accompanying-document, generic-entry-summary,
 * dhl-issued-proforma-invoice`. `label` NU E IN LISTA, iar descrierea endpointului o
 * confirma: „Commercial Invoice, Waybill Document or other supporting documents". Deci
 * eticheta lipita pe colet NU se poate recupera niciodata de la ei. Base64-ul din
 * raspunsul de la `POST /shipments` e singura ocazie de a o avea — si, fiindca DHL nu
 * are anulare de expediere, o eticheta pierduta nu se mai poate reface fara sa se emita
 * (si sa se plateasca) o a doua expediere.
 *
 * ⚠ Se pastreaza PATRU lucruri, nu unul:
 *   - eticheta;
 *   - luna ridicarii, fara de care `get-image` nici nu se poate chema
 *     (`pickupYearAndMonth` e parametru OBLIGATORIU);
 *   - factura comerciala randata de ei, la expedierile vamale — netiparita, coletul se
 *     opreste in vama;
 *   - documentul de transport (`waybillDoc`), arhiva expeditorului.
 *
 * Scrierea NU are voie sa rupa emiterea: AWB-ul exista deja la ei, iar o eroare intoarsa
 * aici l-ar impinge pe om sa apese din nou — adica exact al doilea AWB neanulabil.
 */
async function pastreazaEticheta(
  admin: ReturnType<typeof createAdminClient>,
  businessId: string,
  orderId: string,
  awb: string,
  raspuns: Pick<RaspunsExpediere, "eticheta" | "formatEticheta" | "factura" | "documentTransport">,
  config: DhlConfig,
  luna: string,
): Promise<void> {
  /*
   * ⚠ LIPSA ETICHETEI E O URGENTA, NU O RAMURA TACUTA (la UPS era doar un `return`).
   *
   * Acolo eticheta se putea cere inapoi prin reimprimare. Aici nu: `label` nu exista in
   * `get-image`. O expediere emisa fara eticheta salvata nu se mai poate tipari decat
   * descarcand-o de mana din MyDHL, iar daca nici acolo nu e, coletul nu pleaca.
   */
  if (!raspuns.eticheta) {
    await logError({
      action: "dhl/eticheta-lipsa",
      message:
        `AWB DHL ${awb} creat pentru comanda ${orderId}, dar raspunsul lor n-a purtat nicio eticheta. `
        + "DHL nu are reimprimare de ETICHETA (doar de documente insotitoare) — descarc-o de mana din MyDHL.",
      details: { businessId, orderId, awb, luna },
      businessId,
      severity: "critical",
    });
    return;
  }

  const { error } = await admin.from("dhl_etichete").upsert({
    order_id: orderId,
    business_id: businessId,
    awb_number: awb,
    /* ⚠ Formatul REAL intors (`documents[].imageFormat`), nu cel cerut: enumerarea cererii
       lor scrie `epl`, iar cea a raspunsului `EPL2`. */
    format: raspuns.formatEticheta ?? config.format_eticheta ?? "PDF",
    continut: raspuns.eticheta,
    /* ⚠ Luna ridicarii, `YYYY-MM`, exact din momentul trimis la creare. Fara ea nu se
       poate cere INAPOI nici macar documentul de transport. Vezi `lunaRidicare`. */
    luna_ridicare: luna || null,
    factura: raspuns.factura,
    document_transport: raspuns.documentTransport,
  }, { onConflict: "order_id" });

  if (error) {
    await logError({
      action: "dhl/eticheta-pastrare",
      message:
        `AWB DHL ${awb} creat, dar eticheta nu s-a putut pastra pentru comanda ${orderId}: ${error.message}. `
        + "DHL NU poate da inapoi eticheta de transport — descarc-o din MyDHL dupa numarul de expediere.",
      details: { businessId, orderId, awb, luna },
      businessId,
      severity: "critical",
    });
  }
}

/**
 * Emiterea AWB-ului.
 *
 * ⚠ INTOARCE SI AVERTISMENTELE, nu doar numarul — ca la SmartShip, Innoship si Posta.
 *
 * Pana la reparatia asta returnul era `{ awb }`, iar `raspuns.avertismente` se scria DOAR
 * in `detalii`-le registrului, adica intr-un jurnal pe care nu-l citeste nimeni. Acolo
 * mureau chiar propozitiile scrise pentru om: „AWB-ul s-a emis, dar DHL nu a confirmat
 * ridicarea" (cazul lor `410928`/`PU003`, unde expedierea EXISTA si soferul NU vine) si
 * perechea `7991`/`7995` „No charges returned", pentru care cererea de emitere duce anume
 * `getRateEstimates: true` ca sa iasa la iveala expedierea creata FARA pret. Comerciantul
 * tiparea eticheta, vedea un `toast.success` curat si astepta un curier care nu venea.
 */
export async function createDhlAwbAction(
  businessId: string,
  orderId: string,
  date: DateAwbDhl,
): Promise<{ awb: string; avertismente: string[] } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, admin, config, order } = ctx;

  const comanda = order as typeof order & { dhl_awb_number?: string | null; order_number?: string | number | null };
  if (comanda.dhl_awb_number) {
    return { error: "AWB-ul DHL a fost deja creat pentru comanda asta." };
  }

  const referinta = referintaComenzii(businessId, comanda.order_number ?? orderId.slice(0, 8));
  const d = dateExpediere(date, referinta);

  /*
   * ⚠ Tot ce se poate verifica local se verifica INAINTE de rezervarea din registru: o
   * comanda careia ii lipseste orasul n-are de ce sa ocupe un slot.
   *
   * ⚠ Si aici lista chiar OPRESTE, spre deosebire de cotare: `lipsuriExpediere` include
   * datele vamale, iar o expediere fara cod HS trece de schema lor si se opreste in vama,
   * de unde nu se mai poate repara — DHL nu are anulare de expediere.
   */
  const lipsuri = lipsuriExpediere(config, d);
  const toate = [...lipsuri.configurare, ...lipsuri.comanda];
  if (toate.length) return { error: `Nu se poate emite AWB-ul: ${toate.join("; ")}.` };

  const corp = corpExpediere(config, d);

  /*
   * ⚠ LUNA SE IA DIN CHIAR SIRUL TRIMIS, nu dintr-un al doilea `momentExpedierii()`.
   *
   * Doua apeluri ale lui dau doua momente diferite, iar la granita dintre luni (o emitere
   * la 31 ianuarie 23:5x, impinsa cu marja de 10 minute in februarie) cele doua ar cadea
   * in luni DIFERITE. Luna gresita inseamna `1504 No document images found` la fiecare
   * cerere de document — un raspuns care arata exact ca „DHL a pierdut hartia".
   * `momentExpedierii()` de mai jos e doar plasa, pentru cazul in care corpul si-ar
   * schimba vreodata forma.
   */
  const luna = lunaRidicare(
    typeof corp.plannedShippingDateAndTime === "string"
      ? corp.plannedShippingDateAndTime
      : momentExpedierii(),
  );

  /*
   * ⚠ PRODUSUL CARE SE SCRIE PE COMANDA E CEL TRIMIS, NU CEL CERUT.
   *
   * `corpExpediere` cade pe `produsImplicit()` cand cotarea n-a dat cod, fiindca
   * `productCode` e obligatoriu la ei. Scris pe comanda `date.productCode` (adica gol),
   * randul ar spune ca nu s-a ales niciun produs in timp ce DHL factureaza unul — si
   * nimeni n-ar putea impaca factura cu comanda. `localProductCode` se ia tot de acolo:
   * `corpExpediere` il pastreaza DOAR daca produsul e chiar cel cotat.
   */
  const produsTrimis = typeof corp.productCode === "string" ? corp.productCode : null;
  const localTrimis = typeof corp.localProductCode === "string" ? corp.localProductCode : null;
  /* ⚠ Numele din cotare se foloseste NUMAI daca produsul trimis e chiar cel cotat.
     Altfel randul ar purta numele frumos al unui produs pe care nu l-am cerut. */
  const numeTrimis = numeProdus(
    produsTrimis,
    produsTrimis && produsTrimis === codProdus(date.productCode) ? date.productName : null,
  );

  const r = await cuRegistru(
    admin,
    { businessId, orderId, fel: "awb", furnizor: "dhl", cheie: cheieOperatie("awb", "dhl", orderId) },
    async () => {
      const raspuns = await creeazaExpediere(config, corp, referinta);
      return {
        referinta: raspuns.awb,
        /*
         * ⚠ Eticheta NU intra in `detalii`: e un PDF de zeci de kiloocteti, iar registrul
         * e un jurnal citit la fiecare pagina de comanda. Sta in `dhl_etichete`.
         *
         * ⚠ DAR `lunaRidicare` INTRA, si nu ca ornament: daca scrierea in `dhl_etichete`
         * pica, ea e singurul loc din care se mai poate afla ce luna sa ceara `get-image`.
         * Ghicita gresit, cererea intoarce `1504` la nesfarsit.
         */
        detalii: {
          referintaNoastra: referinta,
          productCode: produsTrimis,
          localProductCode: localTrimis,
          lunaRidicare: luna,
          formatEticheta: raspuns.formatEticheta,
          numarRidicare: raspuns.numarRidicare,
          avertismente: raspuns.avertismente,
        } as Json,
        valoare: raspuns,
      };
    },
    verdictFurnizor,
    /*
     * ⚠ NU se da `legaturaVie`, aceeasi hotarare ca la Innoship, GLS, Pall-Ex, Posta,
     * SmartShip, Shipo, FedEx si UPS: `false` pe ramura `deja` inseamna „elibereaza slotul
     * si REIA", adica o a doua expediere reala, platita. La DHL e cel mai apasat dintre
     * toate: acolo unde la UPS al doilea AWB se putea anula, aici NU se poate, si prin
     * conditiile lor legale poate fi si facturat. Deblocarea se face de om, dupa
     * `verificaDhlAwbAction`.
     */
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

  const raspuns = r.fel === "facut" ? r.valoare : null;
  const awb = r.fel === "facut" ? r.valoare.awb : (r.referinta ?? "");

  if (!awb) {
    return {
      error:
        "Operatia figureaza ca reusita in registru, dar fara numar de expediere. "
        + "Cauta comanda in MyDHL dupa referinta ei si deblocheaz-o din /admin/operatii. "
        + "⚠ Nu emite din nou pana n-ai verificat: DHL nu are anulare de expediere.",
    };
  }

  if (raspuns) await pastreazaEticheta(admin, businessId, orderId, awb, raspuns, config, luna);

  /*
   * ⚠ NUMARUL DE RIDICARE SE CITESTE SI DE PE RAMURA `deja`, DIN REGISTRU.
   *
   * Pe ramura aceea `valoare` nu exista — emiterea reusise la o apasare anterioara, iar
   * scrierea pe comanda cazuse. Luat doar din `raspuns`, campul ar ramane gol, si atunci
   * `dezleagaDhlAwbAction` n-ar mai avea ce anula: ridicarea ramane programata pentru
   * totdeauna, soferul vine dupa un colet care nu pleaca, iar conditiile lor legale spun
   * ca DHL „may request that You compensate it". De aia `cuRegistru` primeste numarul in
   * `detalii` — ca sa se poata lua inapoi de aici.
   */
  const dinRegistru = r.fel === "deja" && r.detalii && typeof r.detalii === "object"
    ? (r.detalii as Record<string, unknown>)
    : null;
  const numarRidicare = raspuns?.numarRidicare ?? sirDin(dinRegistru?.numarRidicare);

  /*
   * ⚠ PE RAMURA `deja`, PRODUSUL SE IA TOT DIN REGISTRU — CA NUMARUL DE RIDICARE.
   *
   * `produsTrimis`/`localTrimis`/`numeTrimis` de mai sus descriu corpul compus ACUM. Pe
   * ramura `deja` insa nu s-a trimis nimic acum: expedierea plecase la o apasare
   * anterioara (doar scrierea pe comanda cazuse), iar intre timp comerciantul a recotat si
   * poate a ales alt produs — lista e sortata dupa pret, si sub 2 kg Express Worldwide
   * trece inaintea lui Economy Select. Scrise asa, coloanele ar spune ca s-a expediat `P`
   * in timp ce DHL a expediat si va factura `W`, adica exact nepotrivirea pe care o previne
   * comentariul „PRODUSUL CARE SE SCRIE PE COMANDA E CEL TRIMIS" de mai sus.
   *
   * Caderea pe valorile curente ramane pentru sloturile vechi, scrise inainte ca `detalii`
   * sa poarte produsul: mai bine codul de acum decat o coloana goala.
   */
  const produsScris = raspuns ? produsTrimis : (sirDin(dinRegistru?.productCode) ?? produsTrimis);
  const localScris = raspuns ? localTrimis : (sirDin(dinRegistru?.localProductCode) ?? localTrimis);
  /* Numele se RECALCULEAZA din codul rezultat, cu aceeasi regula: numele frumos din cotare
     se foloseste numai daca produsul scris e chiar cel cotat acum. */
  const numeScris = produsScris === produsTrimis
    ? numeTrimis
    : numeProdus(produsScris, produsScris && produsScris === codProdus(date.productCode) ? date.productName : null);

  /* ⚠ Luna ridicarii, la fel: pe `deja` cea buna e cea cu care s-a emis. Ghicita gresit,
     `get-image` intoarce `1504 No document images found` la nesfarsit. */
  const lunaScrisa = raspuns ? luna : (sirDin(dinRegistru?.lunaRidicare) ?? luna);

  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    dhl_awb_number: awb,
    dhl_product_code: produsScris,
    dhl_local_product_code: localScris,
    dhl_product_name: numeScris,
    /*
     * ⚠ Pretul din COTARE, si nu din raspunsul de emitere: cel din cotare e chiar ce a
     * vazut si a acceptat cumparatorul. Devizul de la emitere il cerem (`getRateEstimates`)
     * doar ca sa iasa la iveala avertismentele lor `7991`/`7995` („No charges returned"),
     * adica exact cazul in care expedierea se creeaza CU SUCCES si FARA pret.
     *
     * ⚠ DAR NUMAI PE RAMURA `facut`. Pe `deja` cotarea de acum nu descrie expedierea reala
     * — ea a plecat la o apasare anterioara, poate pe alt produs si la alt pret — deci
     * campurile nici nu se ating: mai bine goale decat purtand o suma pe care DHL n-a
     * facturat-o niciodata si cu care nimeni n-ar mai putea impaca factura lor.
     */
    ...(raspuns
      ? {
        dhl_cost: numarDin(date.cost),
        /* ⚠ Fara valuta, un pret in euro s-ar citi ca lei: `totalPrice[]` vine ca TABLOU, cu
           acelasi transport in mai multe valute deodata. Vezi comentariul coloanei. */
        dhl_currency: sirDin(date.valuta),
      }
      : {}),
    dhl_reference: referinta,
    dhl_tracking_url: linkUrmarire(awb),
    /* ⚠ Singurul lucru care se mai poate anula la DHL. Nul cand n-am cerut ridicare —
       si tot nul cand am cerut-o si ea n-a mers, caz in care raspunsul poarta un
       avertisment scris de `creeazaExpediere`. */
    dhl_dispatch_confirmation: numarRidicare,
    dhl_awb_at: new Date().toISOString(),
    status: order.status === "pending" || order.status === "confirmed" ? "processing" : order.status,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  if (eScriere || !randuri?.length) {
    /*
     * ⚠ AWB-ul EXISTA la ei, dar comanda nu-l poarta. Fara semnal, comerciantul ar apasa
     * din nou si registrul l-ar opri fara sa spuna de ce — iar daca l-ar debloca cineva,
     * ar iesi al doilea colet neanulabil.
     */
    await logError({
      action: "dhl/awb-scriere",
      message: `AWB DHL ${awb} creat, dar nescris pe comanda ${orderId}: ${eScriere?.message ?? "niciun rand"}`,
      /* ⚠ Luna e cea a expedierii EMISE (pe `deja`, cea din registru): dupa ea se cer
         documentele din MyDHL, si ghicita gresit raspunsul lor e `1504`. */
      details: { businessId, orderId, awb, luna: lunaScrisa },
      businessId,
      severity: "critical",
    });
    return {
      error:
        `AWB-ul ${awb} a fost creat la DHL, dar nu s-a putut scrie pe comanda. Noteaza-l si anunta suportul. `
        + "⚠ Nu emite altul: DHL nu are anulare de expediere.",
    };
  }

  /* `void`, ca la ceilalti cincisprezece: coada About You e best-effort si nu are voie
     sa tina raspunsul catre comerciant sau sa rupa emiterea daca pica. */
  void enqueueAboutYouShip(businessId, orderId);

  /*
   * ⚠ AVERTISMENTELE PLEACA MAI DEPARTE, SI PE AMANDOUA RAMURILE.
   *
   * Pe `facut` din raspunsul lor; pe `deja` din registru — acolo raspunsul nu mai exista,
   * dar avertismentele lui au fost scrise in `detalii` chiar la emitere, exact ca numarul
   * de ridicare. Fara ramura a doua, comerciantul caruia i-a picat prima scriere ar pierde
   * tocmai semnalul „ridicarea nu s-a confirmat" — cel mai scump dintre toate, fiindca DHL
   * nu are anulare de expediere.
   */
  const avertismente = raspuns ? raspuns.avertismente : siruriDin(dinRegistru?.avertismente);
  return { awb, avertismente };
}

/**
 * Scoate expedierea de pe comanda — SINGURA „anulare" care exista la DHL.
 *
 * ⚠⚠ NU ANULEAZA EXPEDIEREA, SI MESAJUL O SPUNE RASPICAT.
 *
 * `delete:` apare O SINGURA data in toata specificatia lor, si aceea pe
 * `/pickups/{dispatchConfirmationNumber}`. DHL isi enumera singur serviciul
 * `DeleteShipment` in mesajele de status ale lui `/reference-data`, dar nu expune niciun
 * endpoint pentru el — a ramas pe SOAP si nu a fost portat. Deci se poate anula
 * RIDICAREA, nu AWB-ul.
 *
 * Ce ramane in urma: manifestul e la ei. Ghidul lor SOAP spune ca expedierea „will not
 * become an active shipment **if the shipment label does not enter the DHL Network**" —
 * adica raspunsul depinde de o hartie tiparita, nu de un apel. De aia mesajul cere
 * explicit distrugerea etichetei: lipita pe alt colet sau ridicata din greseala, ea
 * intra in reteaua lor si comanda pleaca de doua ori.
 *
 * Aceeasi fundatura ca la Packeta si Posta, cu aceeasi iesire cinstita. In
 * `OrderEditModal` butonul e `manualOnly`.
 */
export async function dezleagaDhlAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true; mesaj: string } | { error: string }> {
  /*
   * ⚠⚠ NU TRECE PRIN `configSiComanda`, SI ASTA E O HOTARARE — aceeasi ca la Posta
   * (`dezleagaPostaAwbAction`) si la Packeta (`dezleagaPacketaAction`).
   *
   * Pana la reparatia asta pleca de acolo, iar `configSiComanda` cere integrarea
   * CONFIGURATA COMPLET (`dhlGata`: activata, utilizator, parola, numar de cont, oras si
   * cod postal de expeditie). Deci un comerciant care debifa „Activeaza", apasa
   * „Deconecteaza" (`dhl_config: null`) sau caruia DHL ii rotea parola primea aici „DHL
   * nu e configurat complet" si NU mai putea scoate niciodata AWB-ul de pe comanda. Iar
   * `updateOrderDetails` refuza orice modificare de linii cat timp comanda poarta un AWB,
   * si `DhlAwbModal` nici nu se monteaza cand integrarea e stinsa: comanda ramanea blocata
   * pentru totdeauna, iar mesajul il trimitea pe om sa repare o configurare pe care tocmai
   * o inchisese intentionat. Fundatura, produsa chiar de actiunea gandita sa scoata din
   * fundaturi — exact lectia scrisa in `posta.actions.ts`.
   *
   * Configurarea nici nu e necesara aici: se foloseste O SINGURA data, in ramura optionala
   * a ridicarii. Deci proprietatea se verifica (obligatoriu, ca la orice actiune), comanda
   * se citeste direct, iar configurarea se cere si se foloseste doar cand chiar avem ce
   * anula la ei.
   */
  const p = await proprietar(businessId);
  if (!p.ok) return { error: p.error };
  const { supabase } = p;
  const admin = createAdminClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, dhl_awb_number, dhl_dispatch_confirmation")
    .eq("id", orderId)
    .eq("business_id", businessId)
    .single();
  if (!order) return { error: "Comanda negasita" };

  const config = await configDinBaza(businessId);

  const comanda = order as typeof order & {
    dhl_awb_number?: string | null;
    dhl_dispatch_confirmation?: string | null;
  };
  const awb = (comanda.dhl_awb_number ?? "").trim();
  const numarRidicare = (comanda.dhl_dispatch_confirmation ?? "").trim();
  if (!awb && !numarRidicare) return { error: "Comanda n-are expediere DHL." };

  // ─── (a) Ridicarea, cat timp mai avem numarul ei ───────────────────────────
  /*
   * ⚠ SE INCEARCA INAINTEA GOLIRII COLOANELOR: dupa ce `dhl_dispatch_confirmation` se
   * sterge, numarul nu mai exista nicaieri si ridicarea ramane programata pentru
   * totdeauna. Un sofer care vine dupa un colet inexistent e chiar cazul pentru care
   * conditiile lor legale spun ca „DHL Express may request that You compensate it".
   *
   * ⚠ Si esecul ei NU opreste dezlegarea. Comanda trebuie sa poata primi alt curier chiar
   * daca DHL nu raspunde; ce n-a mers se spune in `mesaj`, nu se inghite.
   */
  let despreRidicare = "";
  if (numarRidicare && !dhlGata(config)) {
    /*
     * ⚠ FARA CONFIGURARE NU SE POATE CERE ANULAREA, DAR DEZLEGAREA MERGE MAI DEPARTE.
     *
     * Asta e chiar cazul pentru care actiunea nu mai pleaca din `configSiComanda`: omul a
     * stins integrarea si acum isi descurca o comanda veche. A-l opri aici ar readuce
     * exact fundatura de sus. Ce nu s-a putut face se SPUNE, cu numarul in mesaj, ca sa
     * aiba ce cauta in MyDHL — nu se inghite.
     */
    despreRidicare =
      ` ⚠ Ridicarea programata (${numarRidicare}) NU s-a putut anula: integrarea DHL nu mai e configurata `
      + "la noi (oprita sau deconectata), deci n-avem cu ce cere anularea. Anuleaz-o din MyDHL dupa numarul "
      + "asta, altfel soferul vine dupa un colet care nu pleaca.";
  } else if (numarRidicare && dhlGata(config)) {
    /* Cine cere anularea: text liber, folosit doar in jurnalul lor de audit. DHL cade cu
       400 („Missing mandatory parameters: requestorName") daca pleaca gol. */
    const { data: { user } } = await supabase.auth.getUser();
    const cerutDe = (user?.email ?? "").trim() || "Edinio";
    /* ⚠ Motivul e scris de NOI si trebuie sa ramana fara cuvintele „already" si „complet":
       `anuleazaRidicarea` deosebeste „deja anulata" de „parametri gresiti" citind textul
       lor de dupa adresa, iar un motiv nefericit a produs deja o data confuzia asta. */
    const motiv = "Expediere dezlegata din panoul comerciantului";

    try {
      const rez = await anuleazaRidicarea(config, numarRidicare, motiv, cerutDe);
      despreRidicare = rez.anulat
        ? " Ridicarea programata a fost anulata la DHL."
        : ` ⚠ Ridicarea NU s-a putut anula: ${rez.mesaj}`;
    } catch (e) {
      despreRidicare =
        ` ⚠ Ridicarea NU s-a putut anula (${(e as Error).message}). Anuleaz-o din MyDHL, `
        + "altfel soferul vine dupa un colet care nu pleaca.";
    }
  }

  // ─── (b) Toate cele douasprezece coloane ──────────────────────────────────
  /*
   * ⚠ SE GOLESC TOATE, nu doar numarul.
   *
   * `dhl_status_code` lasat scris inseamna ca, la o reemitere pe aceeasi comanda, cronul
   * citeste starea VECHE: daca era finala (`OK`), expedierea NOUA iese din urmarire la
   * prima trecere si comanda nu se mai misca niciodata. Iar `dhl_status_checked_at` ramas
   * ar trimite coletul nou la coada rotatiei in loc de cap.
   */
  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    dhl_awb_number: null,
    dhl_product_code: null,
    dhl_local_product_code: null,
    dhl_product_name: null,
    dhl_cost: null,
    dhl_currency: null,
    dhl_reference: null,
    dhl_tracking_url: null,
    dhl_dispatch_confirmation: null,
    dhl_awb_at: null,
    dhl_status_code: null,
    dhl_status_checked_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  /*
   * ⚠ SE VERIFICA SI CA A PRINS UN RAND, nu doar ca n-a fost eroare.
   *
   * Zero randuri modificate fara eroare (RLS, o comanda mutata intre timp) ar trece de un
   * `if (eScriere)` gol — si atunci am merge mai departe: am sterge eticheta si am elibera
   * slotul din registru, in timp ce comanda pastreaza AWB-ul vechi. Urmatoarea emitere ar
   * gasi drumul liber si ar face A DOUA expediere, cu prima inca scrisa pe comanda. La DHL
   * asta nu se mai repara: nu exista anulare.
   */
  if (eScriere || !randuri?.length) {
    return {
      error: eScriere?.message
        ?? "Comanda n-a putut fi actualizata (niciun rand modificat). N-am sters nimic — incearca din nou.",
    };
  }

  // ─── (c) Eticheta pastrata ────────────────────────────────────────────────
  /*
   * ⚠ Ramasa, o reemitere ar gasi randul vechi (cheia e `order_id`) si — daca noua emitere
   * n-ar apuca sa-l suprascrie — comerciantul ar tipari eticheta expedierii DEZLEGATE.
   * Lipita pe colet, ea intra in reteaua DHL si transportul se factureaza pe AWB-ul vechi.
   * Esecul stergerii nu opreste nimic, dar se stie.
   */
  const { error: eEticheta } = await admin.from("dhl_etichete").delete().eq("order_id", orderId);
  if (eEticheta) {
    await logError({
      action: "dhl/eticheta-stergere",
      message: `Expedierea DHL ${awb} dezlegata, dar eticheta veche a ramas pentru comanda ${orderId}: ${eEticheta.message}`,
      details: { businessId, orderId, awb },
      businessId,
      severity: "warning",
    });
  }

  // ─── (d) Slotul din registru, ABIA LA URMA ────────────────────────────────
  /*
   * ⚠ Rezultatul SE CITESTE: un slot ramas `reusit` face ca emiterea urmatoare sa intre pe
   * ramura „adopta rezultatul" si sa scrie inapoi pe comanda AWB-ul DEZLEGAT — transport
   * care nu se mai poate anula, marfa care nu pleaca, si un blocaj invizibil. Defectul a
   * fost trait la Packeta.
   */
  const eliberat = await marcheazaAnulata(admin, businessId, cheieOperatie("awb", "dhl", orderId));
  if (!eliberat) {
    await logError({
      action: "dhl/eliberare-slot",
      message: `Expedierea DHL ${awb} dezlegata, dar slotul din registru n-a fost eliberat pentru comanda ${orderId}`,
      details: { businessId, orderId, awb },
      businessId,
      severity: "critical",
    });
  }

  const mesaj =
    (awb
      ? `Expedierea ${awb} a fost scoasa de pe comanda, dar la DHL RAMANE EMISA: MyDHL API nu are anulare `
        + "de expediere. ⚠ DISTRUGE eticheta tiparita — daca ea intra in reteaua DHL, coletul pleaca a doua "
        + "oara si se factureaza. Verifica in MyDHL si, daca e nevoie, vorbeste cu reprezentantul tau DHL."
      : "Comanda n-avea numar de expediere DHL.")
    + despreRidicare
    + (eliberat
      ? ""
      : " ⚠ Slotul din registru nu s-a eliberat: daca emiterea urmatoare aduce inapoi acelasi numar, anunta suportul.");

  return { success: true, mesaj };
}

// ─── Documentele ──────────────────────────────────────────────────────────────

/** Extensia de fisier pentru un format de eticheta. `ZPL`/`EPL2`/`LP2` sunt text. */
function extensia(format: string): string {
  const f = (format ?? "").toUpperCase();
  if (f === "PDF") return "pdf";
  if (f === "PNG") return "png";
  if (f === "TIFF" || f === "TIF") return "tif";
  if (f === "ZIP") return "zip";
  if (f === "ZPL" || f === "EPL2" || f === "EPL" || f === "LP2") return "zpl";
  return "pdf";
}

/**
 * Eticheta AWB, ca base64.
 *
 * ⚠ VINE DIN TABELUL NOSTRU, si asta nu e o optimizare: `label` nu exista in enumerarea
 * lui `GET /shipments/{awb}/get-image`. Eticheta de transport a unui AWB deja emis NU SE
 * POATE RECUPERA de la DHL.
 *
 * Ramura de rezerva cere totusi ceva de la ei — dar `waybill`, adica DOCUMENTUL DE
 * TRANSPORT, nu eticheta lipita pe colet. E tot ce se mai poate da omului, si de aia
 * numele fisierului o spune, ca sa nu creada ca a primit eticheta.
 *
 * ⚠ Si se citeste cu SERVICE ROLE, dupa ce proprietatea a fost dovedita: `dhl_etichete`
 * are RLS pornit si NICIO politica, fiindca o eticheta poarta numele, telefonul si adresa
 * cumparatorului.
 */
export async function getDhlEtichetaAction(
  businessId: string,
  orderId: string,
): Promise<
  | { ok: true; base64: string; nume: string; format: string; factura: string | null; documentTransport: string | null }
  | { ok: false; error: string }
> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("dhl_etichete")
    .select("continut, format, awb_number, luna_ridicare, factura, document_transport")
    .eq("order_id", orderId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  if (data?.continut) {
    return {
      ok: true,
      base64: data.continut as string,
      format: (data.format as string) ?? "PDF",
      nume: `AWB-DHL-${data.awb_number}.${extensia((data.format as string) ?? "PDF")}`,
      factura: (data.factura as string | null) ?? null,
      documentTransport: (data.document_transport as string | null) ?? null,
    };
  }

  /*
   * Copia noastra lipseste. Se incearca la ei, stiind din capul locului ca eticheta nu se
   * mai poate obtine — cel mult documentul de transport.
   */
  const cuComanda = await configSiComanda(businessId, orderId);
  if ("error" in cuComanda) return { ok: false, error: cuComanda.error as string };
  const comanda = cuComanda.order as { dhl_awb_number?: string | null; dhl_awb_at?: string | null };
  const awb = (comanda.dhl_awb_number ?? "").trim();
  if (!awb) return { ok: false, error: "Comanda n-are expediere DHL." };

  /*
   * ⚠ `pickupYearAndMonth` e OBLIGATORIU si nu se poate ghici. Cand randul nostru lipseste
   * cu totul, singura ancora ramasa e momentul emiterii — care e la cateva minute de
   * `plannedShippingDateAndTime`, deci aceeasi luna in afara de o emitere chiar la granita
   * dintre luni. Acolo DHL raspunde `1504` si mesajul lui spune deja ce sa faca omul.
   */
  const luna = (data?.luna_ridicare as string | null) ?? lunaRidicare(comanda.dhl_awb_at ?? "");

  try {
    const r = await reimprimaEticheta(cuComanda.config, awb, luna);
    return {
      ok: true,
      base64: r.continut,
      format: r.format,
      /* ⚠ Numele spune ADEVARUL: nu e eticheta de pe colet, e documentul de transport. */
      nume: `DHL-document-transport-${awb}.${extensia(r.format)}`,
      factura: null,
      documentTransport: null,
    };
  } catch (e) {
    return {
      ok: false,
      error:
        `Eticheta nu e salvata la noi, iar DHL nu poate da inapoi eticheta de transport (API-ul lor `
        + `intoarce doar documente insotitoare): ${(e as Error).message} `
        + `Descarc-o din MyDHL dupa numarul de expediere ${awb}.`,
    };
  }
}

/**
 * Dovada electronica a livrarii (ePOD), PDF in base64.
 *
 * ⚠ `null` NU E O EROARE. DHL scrie verbatim: „The digital signature is available **the
 * next day after delivery**." Deci in primele 24 de ore un 404 e starea NORMALA, iar
 * `dovadaLivrarii` il transforma in `null` tocmai ca sa nu para defect. Omul primeste o
 * propozitie omeneasca, nu un cod.
 *
 * ⚠ Si o dovada intoarsa NU garanteaza semnatura: „All the output types above will return
 * ePOD with eSIG (**if the eSIG is available**), else ePOD without eSIG will be returned."
 * Nu se poate deduce din codul HTTP daca semnatura e acolo.
 */
export async function getDhlDovadaAction(
  businessId: string,
  orderId: string,
): Promise<{ ok: true; base64: string; nume: string } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { config, order } = ctx;

  const awb = ((order as { dhl_awb_number?: string | null }).dhl_awb_number ?? "").trim();
  if (!awb) return { ok: false, error: "Comanda n-are expediere DHL." };

  try {
    const r = await dovadaLivrarii(config, awb);
    if (!r) {
      return {
        ok: false,
        error:
          "DHL n-are inca dovada livrarii pentru expedierea asta. Ei o pregatesc abia a doua zi dupa livrare "
          + "(ei scriu „The digital signature is available the next day after delivery”), deci incearca maine.",
      };
    }
    return { ok: true, base64: r.continut, nume: `Dovada-livrare-DHL-${awb}.${extensia(r.format)}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─── Recuperarea dupa un raspuns pierdut ──────────────────────────────────────

/**
 * „Am trimis si n-am primit raspuns — s-a creat sau nu?"
 *
 * ⚠⚠ E SINGURA CALE INAPOI, si de aceea are cel mai mult de pierdut din tot fisierul.
 *
 * DHL n-are idempotenta, n-are anulare si n-are niciun cod de „duplicate shipment"
 * (cautat exhaustiv in specificatia lor: toate potrivirile lui `duplicate` se refera la
 * campuri repetate INAUNTRUL cererii). Deci un raspuns pierdut lasa comanda blocata pana
 * cand cineva intreaba `GET /tracking?shipmentReference=…`.
 *
 * ⚠ SI DEBLOCAREA SE FACE NUMAI CAND DHL A SPUS-O EL. `negasit` inseamna 404 dovedit
 * („No Shipments Found for ReferenceID"). O lista goala pe un 200 e altceva: poate fi o
 * expediere REALA care inca n-a fost scanata de nimeni. Deblocat acolo, butonul ar
 * produce chiar al doilea AWB pe care exista ca sa-l previna — iar acela nu se mai poate
 * anula.
 *
 * ⚠ Nu se cauta eticheta, ca la UPS: DHL nu poate da inapoi eticheta unui AWB emis.
 * Expedierea adoptata ramane fara eticheta la noi, si mesajul spune de unde se ia.
 */
export async function verificaDhlAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ ok: true; gasit: boolean; awb?: string; mesaj: string } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { supabase, admin, config, order } = ctx;

  const comanda = order as typeof order & {
    dhl_awb_number?: string | null;
    dhl_awb_at?: string | null;
    order_number?: string | number | null;
  };
  if (comanda.dhl_awb_number) {
    return { ok: true, gasit: true, awb: comanda.dhl_awb_number, mesaj: "Comanda are deja expediere DHL." };
  }

  const referinta = referintaComenzii(businessId, comanda.order_number ?? orderId.slice(0, 8));

  /**
   * Ridicarea blocajului din registru.
   *
   * ⚠ NU `marcheazaAnulata`: `marcheaza_operatie_anulata` muta doar din `reusit` si
   * `necunoscut`, iar cazul pentru care exista butonul asta e chiar celalalt — emiterea a
   * murit INTRE rezervare si incheiere, deci randul a ramas `in_curs`.
   * `deblocheazaOperatie` scrie `esuat` prin `incheie_operatie_externa`, deci merge din
   * amandoua starile. Iar `operatiiAtarnate` filtreaza tot ce e `in_curs` de mai putin de
   * trei minute — chiar garda care impiedica deblocarea unei emiteri INCA IN ZBOR.
   */
  const ridicaBlocajul = async (explicatie: string) => {
    const atarnate = await operatiiAtarnate(admin, businessId, orderId);
    const aNoastra = atarnate.find((o) => o.cheie === cheieOperatie("awb", "dhl", orderId));
    if (!aNoastra) return { ok: true as const, gasit: false, mesaj: `${explicatie} Poti emite AWB-ul.` };

    const r = await deblocheazaOperatie(
      admin, businessId, aNoastra.id,
      "verificat prin cautare dupa referinta: DHL raspunde ca expedierea nu exista",
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

  const adopta = async (awb: string) => {
    /*
     * ⚠ STATUSUL DHL NU SE SCRIE AICI, si nu din lene. `dhl_status_code` scris fara
     * tranzitie e o capcana: daca expedierea e deja livrata, codul e `OK`, adica o stare
     * FINALA, iar cronul o scoate din urmarire la prima trecere — deci comanda ar ramane
     * vesnic „In procesare", n-ar fi facturata automat si nimeni n-ar afla de ce.
     *
     * ⚠ Nu se scriu nici produsul, nici pretul: nu le stim. Cotarea de atunci s-a pierdut
     * odata cu raspunsul, iar `GET /tracking` nu intoarce nici `productCode`, nici bani.
     * Un pret ghicit ar fi mai rau decat o coloana goala.
     */
    const { error } = await supabase.from("orders").update({
      dhl_awb_number: awb,
      dhl_reference: referinta,
      dhl_tracking_url: linkUrmarire(awb),
      dhl_awb_at: new Date().toISOString(),
      status: order.status === "pending" || order.status === "confirmed" ? "processing" : order.status,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("business_id", businessId).select("id");

    if (error) return { ok: false as const, error: error.message };

    /* Aceeasi coada ca la emitere: calea de recuperare pune tot un AWB pe comanda. */
    void enqueueAboutYouShip(businessId, orderId);
    return {
      ok: true as const,
      gasit: true,
      awb,
      mesaj:
        `Expedierea exista la DHL (${awb}) si a fost scrisa pe comanda. ⚠ Eticheta NU se poate lua de la ei `
        + "— API-ul lor nu da inapoi eticheta de transport. Descarc-o din MyDHL inainte de a preda coletul.",
    };
  };

  /*
   * ⚠ FEREASTRA E OBLIGATORIE („When tracking by Shipment reference you need to restrict
   * the search by timeframe"), SI LATIMEA EI E O CHESTIUNE DE BANI.
   *
   * Prea larga nu strica nimic: referinta poarta si magazinul, si numarul comenzii, deci
   * nu se poate ciocni cu alta. Prea ingusta e periculoasa: o expediere reala cazuta in
   * afara intervalului intoarce chiar 404-ul pe care il citim ca „nu exista", si atunci
   * blocajul se ridica si urmatoarea apasare emite al doilea AWB neanulabil. De aia 30 de
   * zile, ancorate pe emitere cand o stim (dupa o dezlegare) si pe azi cand nu.
   */
  const acum = new Date();
  const ancora = comanda.dhl_awb_at ? new Date(comanda.dhl_awb_at) : acum;
  const capat = Number.isNaN(ancora.getTime()) ? acum : ancora;
  const deLa = new Date(Math.min(capat.getTime(), acum.getTime()) - 30 * 24 * 3600 * 1000);
  const panaLa = new Date(Math.max(capat.getTime(), acum.getTime()));

  let gasit;
  try {
    gasit = await cautaDupaReferinta(config, referinta, deLa, panaLa);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  /*
   * ⚠ Orice expediere gasita SE ADOPTA — nu exista cazul „gasita, dar anulata", ca la UPS,
   * fiindca la DHL nimic nu se poate anula. Prima cu numar e a noastra: referinta e unica
   * pe magazin si pe comanda.
   */
  const viu = gasit.gasite.find((g) => (g.awb ?? "").trim());
  if (viu?.awb) return adopta(viu.awb.trim());

  if (gasit.gasite.length > 0) {
    /*
     * ⚠ O EXPEDIERE FARA NUMAR NU E O EXPEDIERE INEXISTENTA. Deblocat aici, butonul ar
     * produce al doilea AWB pentru o comanda care are deja unul.
     */
    return {
      ok: false,
      error:
        "DHL a gasit o expediere cu referinta comenzii, dar n-a intors numarul ei de urmarire. "
        + `NU emite din nou — cauta in MyDHL dupa referinta ${referinta} si scrie numarul de mana din pagina comenzii.`,
    };
  }

  /*
   * ⚠⚠ IN MEDIUL LOR DE TEST ABSENTA NU DOVEDESTE NIMIC, SI NU SE DEBLOCHEAZA.
   *
   * Verbatim: „when testing the Tracking service, **only the waybill numbers below are
   * loaded** and any production waybill numbers **or ones created via shipment will not be
   * trackable**." Adica in test un AWB creat de noi da 404 GARANTAT, iar `negasit` ar fi
   * mereu adevarat. Fara garda asta, butonul ar debloca de fiecare data in test si ar
   * invata comerciantul ca „merge" — pana in ziua in care aceeasi apasare, in productie,
   * produce al doilea AWB.
   */
  if (eMediuDeTest(config)) {
    return {
      ok: false,
      error:
        "Esti pe mediul de test DHL, unde expedierile create de noi NU sunt urmaribile deloc — deci „nu exista” "
        + "nu inseamna nimic acolo si n-am ridicat blocajul. Treci pe productie sau deblocheaza operatia de mana "
        + "din /admin/operatii, dupa ce te uiti in MyDHL.",
    };
  }

  if (!gasit.negasit) {
    return {
      ok: false,
      error:
        "DHL a raspuns, dar n-a spus limpede ca expedierea nu exista — a intors o lista goala, ceea ce se "
        + `intampla si pentru colete reale nescanate inca. Verifica in MyDHL dupa referinta ${referinta} inainte `
        + "de a emite din nou: al doilea AWB DHL nu se mai poate anula si poate fi facturat.",
    };
  }

  return ridicaBlocajul(
    `DHL a raspuns explicit „nu exista” pentru referinta ${referinta}, cautand pe contul tau in ultimele 30 de zile. `
    + "⚠ Daca ai emis in ultimele minute, uita-te totusi intai in MyDHL: expedierile foarte proaspete pot lipsi "
    + "din urmarire, iar al doilea AWB nu se mai poate anula.",
  );
}

/*
 * ⚠ AICI NU EXISTA `urmaresteDhlAction`, SI NU E O SCAPARE.
 *
 * O actiune care ar scrie `dhl_status_code` fara sa treaca comanda prin
 * `tranzitieComandaMarketplace` ar putea scrie o stare FINALA (`OK` = livrat, `RT` =
 * returnat) — si atunci cronul (`eStareFinala`) ar scoate expedierea din urmarire, deci
 * comanda ar ramane vesnic „In procesare", nefacturata automat, si nimeni n-ar avea de
 * unde afla de ce. La FedEx a fost exact defectul asta, si actiunea a trebuit stearsa.
 *
 * Urmarirea se face in `/api/cron/dhl-tracking`, care tranzitioneaza comanda si abia apoi
 * retine starea. Iar acolo ritmul e de 3 ore, nu de 2: DHL scrie „we allow up to 10
 * fetches per shipment per day", si un cron la 2 ore ar fi 12 pe zi.
 */
