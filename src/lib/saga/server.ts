import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { cheieOperatie, cuRegistru } from "@/lib/operatii/registru";
import { eroareNesigura, eroareRefuz, verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import { fetchSkuMap } from "@/lib/billing/sku-map";
import type { MagazinTva } from "@/lib/billing/invoice-vat";
import {
  CASE_FACTURARE, NUME_CASA, STARI_INTRATE, STARI_OPRITE_PENTRU_CRON, configCuImplicite, mesajStornariLipsa, sagaGata,
  type CasaFacturare, type DocumentPanouSaga, type SagaConfig, type StareExport, type StarePanouSaga,
  type SursaExport,
} from "./config";
import {
  importaFisier, testeazaConexiunea, verdictPentruRegistru,
  type RezultatImport, type RezultatProba, type SesiuneSaga,
} from "./client";
import {
  COLOANE_DOCUMENTE, dataDocumentului, documenteleComenzii, emitereaDocumentului, facturiInlocuiteFaraStornare,
  type DocumentSursa, type EmitereInRegistru, type RandCuDocumente,
} from "./document-sursa";
import { compuneDinComanda, numeleFisierului, xmlFacturi, type ComandaSaga, type FirmaSaga } from "./xml";
import {
  incercariPeCheie, jurnalulCheilor, jurnalulComenzii, scrieInJurnal, ultimaPeCheie, type RandJurnal,
} from "./jurnal";
import {
  INCERCARI_AUTOMATE, alegeComenzile, candidatiDePlan, decizieReemitere, mesajPentruRegistru,
  notaTrimitereAutomata, tvaPeCasa, verdictProba, ZILE_FEREASTRA, type DecizieReemitere, type Oprire,
} from "./reguli";

/*
 * FARA "use server" AICI, INTENTIONAT: intr-un modul „use server" fiecare export devine un capat
 * HTTP public. Functiile de mai jos citesc configurarea cu cheia de SERVICIU dupa un `businessId`
 * primit ca argument; expuse, ar fi lasat pe oricine sa trimita documentele altui magazin in SAGA.
 * Garda de proprietar o fac apelantii: actiunile (`saga.actions.ts`) si cronul (`verificaCron`).
 */

type Admin = SupabaseClient<Database>;

const asteapta = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ═══════════════════════════════════════════════════════════════════════════
   LACATUL: UN SINGUR APEL SAGA ODATA, PE MAGAZIN
   ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ DE CE. Cheia se roteste: un raspuns poate aduce o cheie noua, iar „in caz contrar, cheia de
 * acces va fi blocata". Doua apeluri simultane pe acelasi magazin (cronul si un buton, doua file,
 * lotul si cronul) pleaca amandoua cu cheia K1. Primul primeste K2 si o scrie; al doilea foloseste
 * K1, deja veche, si poate bloca cheia de tot. Iar o cheie blocata se reface numai de mana, de un
 * utilizator Admin din SAGA: integrarea ar sta pana atunci, tacuta.
 *
 * ⚠ CE ALEGEM: un LACAT cu termen, in baza (`privat.saga_apel_in_curs`, functiile
 * `saga_ocupa_apelul` / `saga_elibereaza_apelul`). Se ia INAINTE de citirea cheii si se elibereaza
 * DUPA ce cheia noua s-a scris, deci fiecare apel citeste cheia lasata de cel dinainte.
 *
 *   - De ce nu un lacat consultativ Postgres: prin PostgREST fiecare apel e propria lui tranzactie,
 *     iar un lacat de sesiune nu supravietuieste intre doua cereri HTTP.
 *   - De ce nu doar o reincercare „optimista": SAGA nu spune ce face cu o cheie veche folosita
 *     dupa rotatie. Daca o blocheaza pe loc, reincercarea vine prea tarziu. Doar serializarea o
 *     impiedica.
 *   - De ce cu termen (120 s): un proces taiat de platforma n-are cum sa-si elibereze lacatul; dupa
 *     termen, urmatorul il ia. Termenul e mult peste cel mai lung apel (30 s importul, plus proba de
 *     dupa un 400 si scrierile), deci nu expira sub un apel viu.
 *
 * ⚠ SI SCRIEREA CHEII E ATOMICA SI CONDITIONATA (`saga_roteste_cheia`): pune cheia noua NUMAI
 * daca baza tine inca cheia cu care am plecat. Daca intre timp comerciantul a salvat alta cheie,
 * aceea castiga, iar a noastra, rotita dintr-o linie veche, nu o mai calca. Si nu rescrie tot
 * JSON-ul configurarii (lectia `citirea-cazuta-rescrie-tot-jsonul`): atinge doar `api_key`.
 */

/** Cat tine lacatul unui apel. */
const LACAT_SECUNDE = 120;
const PAS_ASTEPTARE_MS = 1_500;

/** Cat asteapta un om (buton, lot) lacatul luat de altcineva. Cronul nu asteapta. */
export const ASTEPTARE_MANUALA_MS = 20_000;

export const MESAJ_OCUPAT =
  "SAGA lucrează chiar acum cu alt document al magazinului (o trimitere automată sau din altă fereastră). Încearcă din nou peste un minut.";
const MESAJ_LACAT_INDISPONIBIL =
  "Nu am putut porni legătura cu SAGA în siguranță (lacătul din baza noastră nu a răspuns). Încearcă din nou peste un minut.";

async function ocupaApelul(
  admin: Admin,
  businessId: string,
  detinator: string,
  asteptareMs: number,
): Promise<"obtinut" | "ocupat" | "eroare"> {
  const termen = Date.now() + Math.max(0, asteptareMs);
  for (;;) {
    const { data, error } = await admin.rpc("saga_ocupa_apelul", {
      p_business_id: businessId,
      p_detinator: detinator,
      p_secunde: LACAT_SECUNDE,
    });
    /* ⚠ Lacatul indisponibil OPRESTE apelul, ca registrul: fara el nu putem garanta ca nu pleaca
       doua apeluri deodata, iar raul de evitat e chiar cheia blocata. */
    if (error) {
      console.error("[saga] lacatul nu a raspuns:", error.message);
      return "eroare";
    }
    if (data === true) return "obtinut";
    if (Date.now() + PAS_ASTEPTARE_MS > termen) return "ocupat";
    await asteapta(PAS_ASTEPTARE_MS);
  }
}

async function elibereazaApelul(admin: Admin, businessId: string, detinator: string): Promise<void> {
  try {
    const { error } = await admin.rpc("saga_elibereaza_apelul", {
      p_business_id: businessId,
      p_detinator: detinator,
    });
    if (error) console.error("[saga] lacatul nu s-a eliberat (expira singur):", error.message);
  } catch (e) {
    console.error("[saga] lacatul nu s-a eliberat (expira singur):", e instanceof Error ? e.message : String(e));
  }
}

export type RezultatLacat<T> = { fel: "facut"; valoare: T } | { fel: "ocupat" } | { fel: "eroare"; mesaj: string };

/**
 * Ruleaza `fn` cu lacatul magazinului. Daca `fn` arunca, lacatul se elibereaza si eroarea urca.
 */
export async function cuLacat<T>(
  admin: Admin,
  businessId: string,
  asteptareMs: number,
  fn: () => Promise<T>,
): Promise<RezultatLacat<T>> {
  const detinator = randomUUID();
  const l = await ocupaApelul(admin, businessId, detinator, asteptareMs);
  if (l === "eroare") return { fel: "eroare", mesaj: MESAJ_LACAT_INDISPONIBIL };
  if (l === "ocupat") return { fel: "ocupat" };
  try {
    return { fel: "facut", valoare: await fn() };
  } finally {
    await elibereazaApelul(admin, businessId, detinator);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIGURAREA SI CHEIA
   ═══════════════════════════════════════════════════════════════════════════ */

export type CitireConfig = { ok: true; config: SagaConfig | null; brut: unknown } | { ok: false };

/**
 * Configurarea SAGA a magazinului, DECRIPTATA.
 *
 * ⚠ CU CHEIA DE SERVICIU, si numai dupa ce apelantul a dovedit dreptul asupra magazinului. Pe
 * clientul comerciantului vederea `store_settings` nu decripteaza: cheia ar fi sosit `enc.v1.…`,
 * iar SAGA ar fi refuzat-o (si, mai rau, „rotita" ar fi fost o cheie care nu era a nimanui).
 *
 * ⚠ `{ ok: false }` NU E „neconectat": o citire cazuta nu are voie sa para o configurare lipsa.
 */
export async function configurareaSaga(admin: Admin, businessId: string): Promise<CitireConfig> {
  const { data, error } = await admin
    .from("store_settings").select("saga_config").eq("business_id", businessId).maybeSingle();
  if (error) return { ok: false };
  const brut = (data as { saga_config?: unknown } | null)?.saga_config ?? null;
  return { ok: true, config: sagaGata(brut) ? configCuImplicite(brut) : null, brut };
}

/**
 * Scrie cheia rotita, atomic si conditionat: numai daca baza tine inca `veche`.
 *
 * `scrisa`: gata. `inlocuita`: baza tine alta cheie (comerciantul a salvat una noua, sau s-a
 * deconectat), deci a noastra nu se mai scrie. `eroare`: baza n-a raspuns nici a treia oara.
 *
 * ⚠ Cheia NU apare in jurnal, in niciun mesaj si in nicio adresa: pleaca in corpul unui RPC.
 */
export async function scrieCheiaRotita(
  admin: Admin,
  businessId: string,
  veche: string,
  noua: string,
): Promise<"scrisa" | "inlocuita" | "eroare"> {
  let ultimaEroare = "";
  for (const pauza of [0, 400, 1_200]) {
    if (pauza) await asteapta(pauza);
    try {
      const { data, error } = await admin.rpc("saga_roteste_cheia", {
        p_business_id: businessId,
        p_cheie_veche: veche,
        p_cheie_noua: noua,
      });
      if (!error) return data === true ? "scrisa" : "inlocuita";
      ultimaEroare = error.message;
    } catch (e) {
      ultimaEroare = e instanceof Error ? e.message : String(e);
    }
  }
  await logError({
    action: "saga.cheieRotitaNesalvata",
    message: "SAGA a trimis o cheie de acces noua, iar ea NU s-a putut salva. Urmatorul apel pleaca "
      + `cu cheia veche, pe care SAGA o poate bloca; daca exportul se opreste, comerciantul genereaza o cheie noua. (${ultimaEroare})`,
    businessId,
    severity: "critical",
  });
  return "eroare";
}

/** Sesiunea unui apel cu cheia salvata a magazinului. */
export interface SesiuneMagazin extends SesiuneSaga {
  /** Cheia pe care o tine baza, dupa stiinta noastra: „cheia veche" a rotatiei conditionate. */
  cheieInBaza: string;
  /** Baza tine alta cheie decat linia noastra: seria se opreste, cheia comerciantului castiga. */
  inlocuita: boolean;
  /** O cheie primita de la SAGA n-a putut fi scrisa: seria se opreste. */
  pierduta: boolean;
}

export function sesiuneaMagazinului(admin: Admin, businessId: string, config: Pick<SagaConfig, "cod_fiscal" | "api_key">): SesiuneMagazin {
  const s: SesiuneMagazin = {
    codFiscal: config.cod_fiscal,
    cheie: config.api_key,
    cheieInBaza: config.api_key,
    inlocuita: false,
    pierduta: false,
    async laCheieNoua(noua: string) {
      const r = await scrieCheiaRotita(admin, businessId, s.cheieInBaza, noua);
      if (r === "scrisa") {
        s.cheieInBaza = noua;
        return;
      }
      if (r === "inlocuita") {
        s.inlocuita = true;
        return;
      }
      s.pierduta = true;
      throw new Error("cheia rotita nu s-a putut scrie");
    },
  };
  return s;
}

/**
 * Proba de conexiune cu cheia SALVATA, sub lacat (proba poate roti cheia, iar cheia rotita se scrie).
 * `codFiscal` dat = proba codului din formular, cu cheia din baza.
 *
 * ⚠ O proba reusita care a pierdut cheia rotita NU e reusita (`verdictProba`).
 */
export async function probaCuCheiaSalvata(
  admin: Admin,
  businessId: string,
  codFiscal: string | null,
  /** Cat se asteapta lacatul: un om asteapta, cronul nu. */
  asteptareMs: number = ASTEPTARE_MANUALA_MS,
): Promise<{ ok: true } | { ok: false; refuz: boolean; error: string }> {
  const r = await cuLacat(admin, businessId, asteptareMs, async (): Promise<RezultatProba> => {
    const gol = { cheieRotita: false, cheieNesalvata: false };
    const citire = await configurareaSaga(admin, businessId);
    if (!citire.ok) return { ok: false, refuz: false, error: "Configurarea SAGA nu s-a putut citi. Încearcă din nou.", ...gol };
    const brut = configCuImplicite(citire.brut as Partial<SagaConfig> | null);
    if (!brut.api_key) return { ok: false, refuz: false, error: "Completează cheia de acces SAGA.", ...gol };
    const cod = codFiscal ?? brut.cod_fiscal;
    if (!cod) return { ok: false, refuz: false, error: "Completează codul fiscal al firmei, exact ca în SAGA.", ...gol };
    const sesiune = sesiuneaMagazinului(admin, businessId, { cod_fiscal: cod, api_key: brut.api_key });
    const v = await testeazaConexiunea(sesiune);
    return sesiune.pierduta ? { ...v, cheieNesalvata: true } : v;
  });
  if (r.fel === "ocupat") return { ok: false, refuz: false, error: MESAJ_OCUPAT };
  if (r.fel === "eroare") return { ok: false, refuz: false, error: r.mesaj };
  return verdictProba(r.valoare);
}

/* ═══════════════════════════════════════════════════════════════════════════
   CE SE TRIMITE: comanda, firma, TVA-ul magazinului si al caselor
   ═══════════════════════════════════════════════════════════════════════════ */

/** Coloanele comenzii de care are nevoie exportul. Numite, nu `*`. */
const COLOANE_COMANDA_SAGA = [
  "id", "business_id", "order_number", "customer_name", "billing_company", "shipping_address", "items",
  "shipping_cost", "discount_amount", "discount_code", "card_discount_amount", "cod_discount_amount",
  "cod_fee_amount", "total", "vat_rate", "vat_amount", "prices_include_vat", "payment_status", "order_source",
  ...COLOANE_DOCUMENTE,
].join(", ");

type RandComanda = ComandaSaga & RandCuDocumente & { id: string; items: unknown };

/** Ce ramane la fel pentru toate comenzile unui magazin. Cronul il citeste o data pe magazin. */
export interface ContextMagazin {
  config: SagaConfig;
  firma: FirmaSaga;
  magazin: MagazinTva;
  /** Casa a emis CU TVA? (SmartBill si Oblio emit fara TVA cand numele cotei e gol la ele.) */
  tvaPeCasa: Record<CasaFacturare, boolean>;
}

export async function contextulMagazinului(admin: Admin, businessId: string): Promise<ContextMagazin | { error: string }> {
  const [citire, { data: biz, error: eBiz }, { data: setari, error: eSetari }] = await Promise.all([
    configurareaSaga(admin, businessId),
    admin.from("businesses").select("business_name, reg_com, address, city, county").eq("id", businessId).maybeSingle(),
    /* ⚠ Din configurarile SmartBill si Oblio, doar numele cotei (si `enabled`, ca semn ca exista): fara
       tokenurile lor, care n-au ce cauta in memoria exportului SAGA. */
    admin.from("store_settings")
      .select("vat_enabled, vat_rate, prices_include_vat, sb_cota:smartbill_config->>tax_name, sb_exista:smartbill_config->>enabled, ob_cota:oblio_config->>vat_name, ob_exista:oblio_config->>enabled")
      .eq("business_id", businessId).maybeSingle(),
  ]);
  if (!citire.ok || eBiz || eSetari) return { error: "Datele magazinului nu s-au putut citi. Încearcă din nou." };
  if (!citire.config) return { error: "SAGA nu este conectat la acest magazin." };
  if (!biz) return { error: "Magazin negăsit." };
  const b = biz as { business_name?: string | null; reg_com?: string | null; address?: string | null; city?: string | null; county?: string | null };
  const s = setari as unknown as {
    vat_enabled?: boolean; vat_rate?: number; prices_include_vat?: boolean;
    sb_cota?: string | null; sb_exista?: string | null; ob_cota?: string | null; ob_exista?: string | null;
  } | null;
  /* Configurarea lipsa ramane lipsa (`tvaPeCasa` o trateaza ca „cu TVA"), cea prezenta poarta numele cotei. */
  const configCasa = (exista: string | null | undefined, cota: string | null | undefined, camp: string) =>
    exista == null && cota == null ? null : { [camp]: cota ?? "" };
  return {
    config: citire.config,
    firma: {
      nume: (b.business_name ?? "").trim(),
      codFiscal: citire.config.cod_fiscal,
      regCom: (b.reg_com ?? "").trim(),
      localitate: (b.city ?? "").trim(),
      judet: (b.county ?? "").trim(),
      adresa: (b.address ?? "").trim(),
    },
    magazin: {
      vat_enabled: s?.vat_enabled ?? false,
      vat_rate: Number(s?.vat_rate ?? 21) || 0,
      prices_include_vat: s?.prices_include_vat ?? true,
    },
    tvaPeCasa: tvaPeCasa({
      smartbill_config: configCasa(s?.sb_exista, s?.sb_cota, "tax_name"),
      oblio_config: configCasa(s?.ob_exista, s?.ob_cota, "vat_name"),
    }),
  };
}

function dinRandDeRegistru(r: { fel: unknown; furnizor: unknown; referinta_externa: unknown; creat_la: unknown; detalii?: unknown }): EmitereInRegistru {
  return {
    fel: String(r.fel),
    furnizor: String(r.furnizor),
    referinta: (r.referinta_externa as string | null) ?? null,
    creatLa: String(r.creat_la),
    detalii: r.detalii ?? null,
  };
}

/**
 * Emiterile reusite ale comenzii (facturi si stornari), din registru: de acolo vine data documentului
 * (`detalii.data`, contractul C1, sau clipa randului).
 */
async function emiterileComenzii(
  admin: Admin,
  businessId: string,
  orderId: string,
): Promise<{ ok: true; emiteri: EmitereInRegistru[] } | { ok: false }> {
  const { data, error } = await admin
    .from("operatii_externe")
    .select("fel, furnizor, referinta_externa, creat_la, detalii")
    .eq("business_id", businessId)
    .eq("order_id", orderId)
    .in("fel", ["factura", "storno"])
    .in("furnizor", [...CASE_FACTURARE])
    .eq("stare", "reusit")
    .order("creat_la", { ascending: false })
    .limit(50);
  if (error) return { ok: false };
  return { ok: true, emiteri: (data ?? []).map(dinRandDeRegistru) };
}

/* ═══════════════════════════════════════════════════════════════════════════
   TRIMITEREA UNUI DOCUMENT
   ═══════════════════════════════════════════════════════════════════════════ */

type RezultatDocument =
  | { fel: "intrat"; stare: StareExport; mesaj: string | null }
  | { fel: "deja" }
  | { fel: "blocat"; mesaj: string }
  | { fel: "ocupat" }
  | { fel: "esuat"; stare: StareExport | null; mesaj: string };

interface DeTrimis {
  doc: DocumentSursa;
  orderId: string;
  dataDocument: string;
  total: number;
  fisier: string;
  xml: string;
}

/**
 * Un document, de la lacat la jurnal: lacatul, cheia proaspata, registrul, importul, jurnalul.
 *
 * ⚠ CHEIA SE CITESTE SUB LACAT, nu inainte: cea citita inainte poate fi deja rotita de apelul care
 * tocmai a eliberat lacatul.
 */
async function trimiteDocument(
  admin: Admin,
  businessId: string,
  codFiscalCompus: string,
  d: DeTrimis,
  sursa: SursaExport,
  asteptareMs: number,
): Promise<{ r: RezultatDocument; oprire: Oprire }> {
  const urma: { import: RezultatImport | null; importAutomat: boolean; sesiune: SesiuneMagazin | null } = {
    import: null, importAutomat: false, sesiune: null,
  };

  const lacat = await cuLacat(admin, businessId, asteptareMs, async () => {
    const citire = await configurareaSaga(admin, businessId);
    if (!citire.ok) return { fel: "esuat", stare: null, mesaj: "Configurarea SAGA nu s-a putut citi. Încearcă din nou." } as RezultatDocument;
    if (!citire.config) return { fel: "esuat", stare: null, mesaj: "SAGA nu mai este conectat la acest magazin." } as RezultatDocument;
    /* Fisierul poarta codul fiscal in nume si in `<FurnizorCIF>`: compus cu altul, ar intra la alta firma. */
    if (citire.config.cod_fiscal !== codFiscalCompus) {
      return { fel: "esuat", stare: null, mesaj: "Codul fiscal din configurarea SAGA s-a schimbat chiar acum. Încearcă din nou." } as RezultatDocument;
    }
    const config = citire.config;
    urma.importAutomat = config.import_automat;
    const sesiune = sesiuneaMagazinului(admin, businessId, config);
    urma.sesiune = sesiune;

    const reg = await cuRegistru(
      admin,
      {
        businessId,
        orderId: d.orderId,
        fel: "export",
        furnizor: "saga",
        /* O cheie pe DOCUMENT (tip, casa, serie, numar): acelasi document nu intra de doua ori. */
        cheie: cheieOperatie("export", "saga", d.doc.cheie),
      },
      async () => {
        const rez = await importaFisier(sesiune, { nume: d.fisier, xml: d.xml }, config.import_automat);
        urma.import = rez;
        const verdict = verdictPentruRegistru(rez.fel);
        if (verdict === "reusit") {
          return {
            referinta: d.fisier,
            detalii: { stare: rez.fel, status: rez.status, import_automat: config.import_automat },
            valoare: rez,
          };
        }
        /*
         * ⚠ In registru (`ultima_eroare`) intra doar starea si codul, NU textul SAGA: raportul lor
         * poate numi clientul, iar registrul il citesc si paginile platformei. Omul primeste mesajul
         * intreg din `urma.import`, iar raportul sta in jurnalul magazinului.
         */
        const mesaj = mesajPentruRegistru(rez.fel, rez.status);
        throw verdict === "necunoscut" ? eroareNesigura(mesaj) : eroareRefuz(mesaj);
      },
      verdictFurnizor,
    );

    if (reg.fel === "facut") {
      return { fel: "intrat", stare: reg.valoare.fel as StareExport, mesaj: reg.valoare.mesaj } as RezultatDocument;
    }
    if (reg.fel === "deja") return { fel: "deja" } as RezultatDocument;
    if (reg.fel === "blocat") return { fel: "blocat", mesaj: reg.mesaj } as RezultatDocument;
    /* `eroare`: fie SAGA a raspuns (atunci `urma.import` spune ce), fie nu s-a ajuns la SAGA. */
    const imp = urma.import as RezultatImport | null;
    if (imp && (imp.fel === "respins" || imp.fel === "refuzat" || imp.fel === "necunoscut")) {
      return { fel: "esuat", stare: imp.fel, mesaj: imp.mesaj } as RezultatDocument;
    }
    return { fel: "esuat", stare: reg.verdict === "necunoscut" ? "necunoscut" : null, mesaj: reg.mesaj } as RezultatDocument;
  });

  if (lacat.fel === "ocupat") return { r: { fel: "ocupat" }, oprire: "ocupat" };
  if (lacat.fel === "eroare") return { r: { fel: "esuat", stare: null, mesaj: lacat.mesaj }, oprire: "indisponibil" };
  const r = lacat.valoare;

  /* ── jurnalul ── */
  const imp = urma.import as RezultatImport | null;
  const deScris: { stare: StareExport; mesaj: string | null } | null =
    r.fel === "intrat" ? { stare: r.stare, mesaj: r.mesaj }
    : r.fel === "esuat" && r.stare ? { stare: r.stare, mesaj: r.mesaj }
    : null;
  if (deScris) {
    const raport = imp && (imp.fel === "avertismente" || imp.fel === "respins") ? imp.raport : null;
    const scris = await scrieInJurnal(admin, {
      businessId, orderId: d.orderId, cheie: d.doc.cheie, casa: d.doc.casa, tip: d.doc.tip,
      serie: d.doc.serie, numar: d.doc.numar, dataDocument: d.dataDocument, total: d.total,
      stare: deScris.stare, codHttp: imp?.status ?? null, importAutomat: urma.importAutomat, sursa,
      fisier: d.fisier, mesaj: deScris.mesaj, raport,
    });
    if (!scris) {
      await logError({
        action: "saga.jurnal",
        message: `${d.doc.eticheta}: trimiterea s-a incheiat cu „${deScris.stare}”, dar jurnalul exporturilor nu s-a scris.`,
        details: { orderId: d.orderId, cheie: d.doc.cheie },
        businessId,
        severity: "warning",
      });
    }
  } else if (r.fel === "deja") {
    /* Registrul stie ca a intrat, iar jurnalul poate sa nu stie (scrierea lui s-a pierdut atunci).
       Un rand de recuperare opreste cronul din a-l mai cauta la fiecare trecere. */
    await scrieInJurnal(admin, {
      businessId, orderId: d.orderId, cheie: d.doc.cheie, casa: d.doc.casa, tip: d.doc.tip,
      serie: d.doc.serie, numar: d.doc.numar, dataDocument: d.dataDocument, total: d.total,
      stare: urma.importAutomat ? "importat" : "incarcat", codHttp: null, importAutomat: urma.importAutomat, sursa,
      fisier: d.fisier, mesaj: "Documentul era deja trimis în SAGA (din registrul de operații).", raport: null,
    });
  }

  /* ── cand se opreste seria ── */
  const s = urma.sesiune as SesiuneMagazin | null;
  let oprire: Oprire = null;
  if (s?.pierduta || imp?.cheieNesalvata) oprire = "cheie";
  else if (s?.inlocuita) oprire = "schimbata";
  else if (r.fel === "esuat" && r.stare === "refuzat") oprire = "acces";
  else if (r.fel === "esuat" && r.stare === "necunoscut") oprire = "indisponibil";
  else if (r.fel === "esuat" && r.stare === null) oprire = "indisponibil";
  return { r, oprire };
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXPORTUL UNEI COMENZI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ Fara randul emiterii in registru, data documentului nu se poate afla de aici: documentul s-a emis
 * in afara Edinio (sau inainte de registru, 20.08.2026). O data ghicita ar muta vanzarea in alta
 * perioada fiscala.
 */
const MESAJ_FARA_DATA = "Data documentului nu se cunoaște în Edinio (nu găsim în registru emiterea lui).";

export interface OptiuniExport {
  sursa: SursaExport;
  /** Cat asteapta lacatul. 0 la cron: un magazin ocupat se lasa pe trecerea urmatoare. */
  asteptareMs: number;
  /** Doar documentele emise dupa clipa asta (cronul: pornirea trimiterii automate). */
  emiseDupa?: string | null;
  /**
   * Regulile cronului: nu reia documentele oprite (respinse, nelamurite, nepregatite) si nici pe cele
   * incercate de `INCERCARI_AUTOMATE` ori. Omul, din panou sau din lot, le poate trimite oricand.
   */
  regulaCron?: boolean;
  /** Datele magazinului, cand apelantul le are deja (cronul, lotul). */
  context?: ContextMagazin;
  /**
   * Clipa (ms) dupa care nu se mai PORNESTE niciun document. ⚠ Verificata pe DOCUMENT, nu pe comanda:
   * o comanda poate avea patru documente (doua case, fiecare cu factura si stornarea ei).
   */
  termen?: number;
}

export interface RezultatExportComanda {
  /** Documente intrate acum in SAGA (importate, incarcate pentru contabil sau cu avertismente). */
  trimise: number;
  /** Documente gasite deja in SAGA. */
  deja: number;
  avertismente: string[];
  erori: string[];
  /**
   * Documentele care n-au intrat, cu starea scrisa in jurnal. Fara textul SAGA: cronul le spune
   * comerciantului si le scrie in jurnalul platformei, iar raportul lor poate pomeni clientul.
   */
  probleme: { eticheta: string; stare: StareExport }[];
  /**
   * Facturi intrate in SAGA si inlocuite pe comanda, fara stornarea lor in SAGA. Pe calea automata, numai
   * la PRIMA incercare a unui document nou al comenzii (factura care le-a inlocuit), ca omul sa afle o data.
   */
  stornariLipsa: string[];
  /** Comanda n-are nimic de trimis: motivul. */
  nimic: string | null;
  /** Seria trebuie oprita: cheia refuzata sau pierduta, SAGA ocupat sau cazut, timpul terminat. */
  oprire: Oprire;
}

/**
 * Trimite in SAGA documentele comenzii care n-au intrat inca, de la TOATE casele: fiecare factura, apoi
 * stornarea ei.
 *
 * ⚠ APELANTUL A DOVEDIT DREPTUL asupra magazinului (actiunea, cu garda de proprietar; cronul, cu
 * `verificaCron`). Aici `businessId` e si filtru de AUTORIZARE la citirea comenzii.
 */
export async function exportaComanda(
  admin: Admin,
  businessId: string,
  orderId: string,
  o: OptiuniExport,
): Promise<RezultatExportComanda | { error: string }> {
  const rez: RezultatExportComanda = {
    trimise: 0, deja: 0, avertismente: [], erori: [], probleme: [], stornariLipsa: [], nimic: null, oprire: null,
  };

  const ctx = o.context ?? await contextulMagazinului(admin, businessId);
  if ("error" in ctx) return ctx;

  const { data: rand, error: eComanda } = await admin
    .from("orders").select(COLOANE_COMANDA_SAGA).eq("id", orderId).eq("business_id", businessId).maybeSingle();
  if (eComanda) return { error: "Comanda nu s-a putut citi. Încearcă din nou." };
  if (!rand) return { error: "Comanda negăsită." };
  const comanda = rand as unknown as RandComanda;
  const nr = comanda.order_number ?? "";

  const docs = documenteleComenzii(comanda);
  if (docs.perechi.length === 0) {
    rez.nimic = `Comanda #${nr} n-are încă factură emisă, deci n-are ce pleca în SAGA.`;
    return rez;
  }
  if (docs.nestornate.length > 1) {
    rez.avertismente.push(`Comanda #${nr} are facturi nestornate la mai multe case (${docs.nestornate.map((c) => NUME_CASA[c]).join(", ")}); toate pleacă în SAGA, fiindcă toate sunt emise.`);
  }

  const [jurnal, em] = await Promise.all([
    jurnalulComenzii(admin, businessId, orderId),
    emiterileComenzii(admin, businessId, orderId),
  ]);
  /* ⚠ O citire cazuta NU e „nimic trimis": documentele se lasa, nu se trimit pe ghicite. */
  if (!jurnal.ok) return { error: "Jurnalul exporturilor SAGA nu s-a putut citi. Încearcă din nou." };
  if (!em.ok) return { error: "Registrul documentelor nu s-a putut citi. Încearcă din nou." };
  const ultima = ultimaPeCheie(jurnal.randuri);
  const incercari = incercariPeCheie(jurnal.randuri);
  const lipsa = facturiInlocuiteFaraStornare(docs.perechi, jurnal.randuri, em.emiteri);

  const items = (Array.isArray(comanda.items) ? comanda.items : []) as { product_id?: string | null }[];
  const skus = await fetchSkuMap(admin, businessId, items, (m) => {
    void logError({ action: "saga.skuMap", message: m.message, details: m.details, businessId, severity: "warning" });
  });

  /** Un document nou al comenzii (fara nicio incercare) a fost incercat acum. */
  let documentNouIncercat = false;

  perechi: for (const pereche of docs.perechi) {
    /*
     * ⚠ O STORNARE FARA FACTURA E UN VENIT NEGATIV FARA PERECHE. Daca factura casei tocmai n-a intrat
     * (refuzata, nelamurita, nepregatita), stornarea ei asteapta: pleaca dupa factura, nu in locul ei.
     */
    const uf = ultima.get(pereche.factura.cheie);
    let facturaIntrata = !!uf && STARI_INTRATE.includes(uf.stare);
    /*
     * ⚠ Factura NELAMURITA (de la o trecere trecuta) nu tine stornarea pe calea omului. Omul a fost trimis sa
     * verifice in SAGA; daca a gasit-o acolo, stornarea TREBUIE sa poata pleca, iar factura n-o mai poate
     * marca nimeni drept intrata (registrul o blocheaza, iar deblocarea ar retrimite-o, adica ar dubla-o).
     * Fara asta, garda de reemitere (`decizieReemitere`) ar fi fost o fundatura. Cronul tot asteapta.
     */
    const facturaNelamurita = !o.regulaCron && !!uf && uf.stare === "necunoscut";
    let facturaCazutaAcum = false;

    const lista = pereche.storno && ctx.config.trimite_stornari ? [pereche.factura, pereche.storno] : [pereche.factura];
    for (const d of lista) {
      if (rez.oprire) break perechi;
      if (o.termen !== undefined && Date.now() >= o.termen) {
        rez.oprire = "timp";
        break perechi;
      }
      if (d.blocaj) {
        if (!o.regulaCron) rez.erori.push(`${d.eticheta}: ${d.blocaj}`);
        if (d.tip === "factura") facturaCazutaAcum = true;
        continue;
      }
      const u = ultima.get(d.cheie);
      if (u && STARI_INTRATE.includes(u.stare)) {
        rez.deja++;
        continue;
      }
      if (o.regulaCron) {
        if (u && STARI_OPRITE_PENTRU_CRON.includes(u.stare)) continue;
        if ((incercari.get(d.cheie) ?? 0) >= INCERCARI_AUTOMATE) continue;
      }

      if (d.tip === "storno") {
        if (facturaCazutaAcum) {
          rez.erori.push(`${d.eticheta}: pleacă după ce intră factura în SAGA.`);
          continue;
        }
        if (o.regulaCron && !facturaIntrata) {
          /* Pe calea automata, stornarea pleaca singura numai daca factura e deja in SAGA, sau daca a fost
             emisa INAINTE de pornirea trimiterii automate (atunci a introdus-o contabilul). */
          const ef = emitereaDocumentului(pereche.factura, em.emiteri);
          const dinainte = !!o.emiseDupa && !!ef && Date.parse(ef.creatLa) < Date.parse(o.emiseDupa);
          if (!dinainte) continue;
        }
      }

      const emitere = emitereaDocumentului(d, em.emiteri);
      if (o.emiseDupa && (!emitere || Date.parse(emitere.creatLa) < Date.parse(o.emiseDupa))) continue;
      const data = dataDocumentului(d, em.emiteri);
      if (!u) documentNouIncercat = true;

      const nepregatit = async (mesaj: string) => {
        if (d.tip === "factura") facturaCazutaAcum = true;
        rez.erori.push(`${d.eticheta}: ${mesaj}`);
        rez.probleme.push({ eticheta: d.eticheta, stare: "nepregatit" });
        /* Se scrie, ca cronul sa nu-l reia la fiecare trecere si ca omul sa-l vada in panou. */
        await scrieInJurnal(admin, {
          businessId, orderId, cheie: d.cheie, casa: d.casa, tip: d.tip, serie: d.serie, numar: d.numar,
          dataDocument: data, total: null, stare: "nepregatit", codHttp: null,
          importAutomat: ctx.config.import_automat, sursa: o.sursa, fisier: null, mesaj, raport: null,
        });
      };

      if (!data) {
        await nepregatit(`${MESAJ_FARA_DATA} Introdu-l în SAGA după documentul din ${NUME_CASA[d.casa]}.`);
        continue;
      }

      const facturaStornata = d.tip === "storno"
        ? { numarComplet: pereche.factura.numarComplet, data: dataDocumentului(pereche.factura, em.emiteri) }
        : null;
      const compusa = compuneDinComanda({
        comanda,
        magazin: ctx.magazin,
        skus,
        config: ctx.config,
        firma: ctx.firma,
        document: { tip: d.tip, casa: d.casa, numarComplet: d.numarComplet, data },
        facturaStornata,
        tvaFurnizor: ctx.tvaPeCasa[d.casa],
      });
      if ("error" in compusa) {
        await nepregatit(compusa.error);
        continue;
      }

      /*
       * ⚠ STORNAREA TREBUIE SA ANULEZE EXACT FACTURA DIN SAGA. Daca factura a plecat cu un total, iar
       * stornarea recompusa azi iese cu altul (comanda s-a schimbat intre timp), in contabilitate ar
       * ramane o diferenta pe care n-o vede nimeni. Se opreste si se spune.
       */
      if (d.tip === "storno") {
        const f = ultima.get(pereche.factura.cheie) ?? (await ultimaIntrare(admin, businessId, pereche.factura.cheie));
        const plecata = !!f && (STARI_INTRATE.includes(f.stare) || f.stare === "necunoscut");
        if (f && plecata && f.total !== null && Math.abs(f.total + compusa.factura.total) >= 0.01) {
          await nepregatit(`Factura a plecat în SAGA cu ${f.total.toFixed(2)} lei, iar stornarea ar pleca cu ${compusa.factura.total.toFixed(2)} lei. Introdu stornarea în SAGA după documentul emis.`);
          continue;
        }
      }
      for (const a of compusa.avertismente) rez.avertismente.push(`${d.eticheta}: ${a}`);
      /* Stornarea pleaca peste o factura nelamurita (calea omului): se spune, ca sa verifice factura. */
      const dupaNelamurita = d.tip === "storno" && !facturaIntrata && facturaNelamurita;

      const { r, oprire } = await trimiteDocument(admin, businessId, ctx.config.cod_fiscal, {
        doc: d,
        orderId,
        dataDocument: data,
        total: compusa.factura.total,
        fisier: numeleFisierului(ctx.config.cod_fiscal, d.numarComplet, data),
        xml: xmlFacturi([compusa.factura]),
      }, o.sursa, o.asteptareMs);

      if (d.tip === "factura") {
        if (r.fel === "intrat" || r.fel === "deja") facturaIntrata = true;
        /* Blocata de registru fiindca e nelamurita de dinainte: stornarea pleaca (vezi `facturaNelamurita`). */
        else if (!(r.fel === "blocat" && facturaNelamurita)) facturaCazutaAcum = true;
      }

      switch (r.fel) {
        case "intrat":
          rez.trimise++;
          if (r.stare === "avertismente") rez.avertismente.push(`${d.eticheta}: ${r.mesaj ?? "importat cu avertismente"}`);
          if (dupaNelamurita) {
            rez.avertismente.push(`${d.eticheta} a plecat deși factura ${pereche.factura.numarComplet} e nelămurită în SAGA. Dacă factura n-a intrat, deblochează-i operația din pagina comenzii și trimite-o din nou.`);
          }
          break;
        case "deja":
          rez.deja++;
          break;
        case "blocat":
          rez.erori.push(`${d.eticheta}: ${r.mesaj}`);
          break;
        case "ocupat":
          rez.erori.push(MESAJ_OCUPAT);
          break;
        case "esuat":
          rez.erori.push(`${d.eticheta}: ${r.mesaj}`);
          if (r.stare) rez.probleme.push({ eticheta: d.eticheta, stare: r.stare });
          break;
      }
      if (oprire) {
        rez.oprire = oprire;
        if (oprire === "cheie") {
          rez.erori.push("SAGA a schimbat cheia de acces, iar cheia nouă nu s-a putut păstra. Dacă următoarea trimitere e refuzată, generează o cheie nouă în SAGA Web și salveaz-o în Integrări, SAGA.");
        }
      }
    }
  }

  /* Facturile inlocuite fara stornare: omul le afla din panou mereu; prin cron, o singura data. */
  if (lipsa.length && (!o.regulaCron || documentNouIncercat)) {
    rez.stornariLipsa = lipsa.map((x) => x.eticheta);
    if (!o.regulaCron) rez.avertismente.push(mesajStornariLipsa(rez.stornariLipsa));
  }
  return rez;
}

/** Ultima intrare a unui document in jurnal (factura stornata nu e mereu printre cheile citite). */
async function ultimaIntrare(admin: Admin, businessId: string, cheie: string): Promise<RandJurnal | null> {
  const j = await jurnalulCheilor(admin, businessId, [cheie]);
  if (!j.ok) return null;
  return j.randuri.find((r) => STARI_INTRATE.includes(r.stare)) ?? null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   GARDA DE REEMITERE (contractul C2)
   ═══════════════════════════════════════════════════════════════════════════ */

const MESAJ_REEMITERE_NECITITA =
  "Nu am putut verifica în Edinio dacă stornarea facturii a plecat în SAGA, deci factura nouă nu s-a emis. Încearcă din nou peste un minut.";

/**
 * Se poate emite o factura NOUA pe comanda, fara sa se piarda o stornare care trebuie sa ajunga in SAGA?
 * Fiecare casa o cheama in emiterea manuala cand REFACTUREAZA dupa storno, inaintea registrului.
 *
 * `ok` cand SAGA nu e conectat, cand factura comenzii n-a intrat in SAGA, sau cand stornarea ei a intrat
 * deja. NU e ok cand factura e in SAGA (intrata sau `necunoscut`) si stornarea ei nu; regula si
 * exceptiile sunt in `decizieReemitere`.
 *
 * ⚠ CITIREA PICATA = NU E OK: o garda care lasa sa treaca pe o pana de baza n-ar mai fi o garda.
 * NU ARUNCA NICIODATA, si face cel mult trei citiri: configurarea, comanda, jurnalul comenzii.
 */
export async function sagaPermiteReemiterea(
  admin: SupabaseClient<Database>,
  businessId: string,
  orderId: string,
): Promise<{ ok: true } | { ok: false; mesaj: string }> {
  try {
    const citire = await configurareaSaga(admin, businessId);
    if (!citire.ok) return { ok: false, mesaj: MESAJ_REEMITERE_NECITITA };
    if (!citire.config) return { ok: true };

    const { data, error } = await admin
      .from("orders").select(["id", ...COLOANE_DOCUMENTE].join(", "))
      .eq("id", orderId).eq("business_id", businessId).maybeSingle();
    if (error) return { ok: false, mesaj: MESAJ_REEMITERE_NECITITA };
    if (!data) return { ok: true };
    const docs = documenteleComenzii(data as unknown as RandCuDocumente);
    if (docs.perechi.length === 0) return { ok: true };

    const jurnal = await jurnalulComenzii(admin, businessId, orderId);
    if (!jurnal.ok) return { ok: false, mesaj: MESAJ_REEMITERE_NECITITA };
    const decizie: DecizieReemitere = decizieReemitere({
      perechi: docs.perechi,
      ultima: ultimaPeCheie(jurnal.randuri),
      trimiteStornari: citire.config.trimite_stornari,
    });
    return decizie;
  } catch {
    return { ok: false, mesaj: MESAJ_REEMITERE_NECITITA };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   PANOUL DIN PAGINA COMENZII
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ce arata `SagaComandaPanel`. `null` = SAGA nu e conectat (panoul nu se monteaza).
 *
 * ⚠ Apelantul (pagina comenzii) a dovedit deja ca omul detine magazinul si ca comanda e a lui.
 * Doua citiri usoare: registrul (pentru data documentelor) si jurnalul comenzii.
 */
export async function stareaPanouluiSaga(
  admin: Admin,
  businessId: string,
  order: RandCuDocumente & { id: string },
): Promise<StarePanouSaga | null> {
  const citire = await configurareaSaga(admin, businessId);
  if (!citire.ok || !citire.config) return null;
  const config = citire.config;

  const docs = documenteleComenzii(order);
  const [em, jurnal] = await Promise.all([
    emiterileComenzii(admin, businessId, order.id),
    jurnalulComenzii(admin, businessId, order.id),
  ]);
  const ultima = jurnal.ok ? ultimaPeCheie(jurnal.randuri) : new Map<string, RandJurnal>();
  const stornariLipsa = jurnal.ok && em.ok
    ? facturiInlocuiteFaraStornare(docs.perechi, jurnal.randuri, em.emiteri).map((x) => x.eticheta)
    : [];

  if (docs.perechi.length === 0) {
    return {
      importAutomat: config.import_automat,
      documente: [],
      nimic: "Comanda n-are încă factură emisă. După emitere, factura poate pleca în SAGA.",
      jurnalNecitit: !jurnal.ok,
      stornariLipsa,
    };
  }

  const acum = Date.now();
  const documente: DocumentPanouSaga[] = docs.perechi.flatMap((p) => (p.storno ? [p.factura, p.storno] : [p.factura])).map((d) => {
    let blocaj = d.blocaj;
    if (!blocaj && d.tip === "storno" && !config.trimite_stornari) {
      blocaj = "Trimiterea stornărilor e oprită din setările SAGA.";
    }
    const emitere = em.ok ? emitereaDocumentului(d, em.emiteri) : null;
    if (!blocaj && em.ok && !emitere) {
      blocaj = `${MESAJ_FARA_DATA} Introdu-l în SAGA după documentul din ${NUME_CASA[d.casa]}.`;
    }
    const u = ultima.get(d.cheie);
    const pleacaSingurPoate = !blocaj && (!u || !STARI_INTRATE.includes(u.stare));
    return {
      cheie: d.cheie,
      tip: d.tip,
      casa: d.casa,
      eticheta: d.eticheta,
      blocaj,
      nota: pleacaSingurPoate
        ? notaTrimitereAutomata({
          trimitereAutomata: config.trimitere_automata,
          deLa: config.trimitere_automata_de_la,
          emisLa: emitere?.creatLa ?? null,
          acum,
        })
        : null,
      ultimul: u
        ? {
          stare: u.stare, creatLa: u.creatLa, mesaj: u.mesaj, raport: u.raport, sursa: u.sursa,
          codHttp: u.codHttp, importAutomat: u.importAutomat,
        }
        : null,
    };
  });

  return { importAutomat: config.import_automat, documente, nimic: null, jurnalNecitit: !jurnal.ok, stornariLipsa };
}

/* ═══════════════════════════════════════════════════════════════════════════
   PENTRU CRON
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cate randuri se cer odata. PostgREST taie SILENTIOS peste 1000. */
const PAGINA = 1000;

/** Magazinele cu trimiterea automata pornita, toate, paginat. */
export async function magazineCuTrimitereAutomata(admin: Admin): Promise<{ ids: string[]; error: string | null }> {
  const ids: string[] = [];
  for (let pagina = 0; pagina < 20; pagina++) {
    const de = pagina * PAGINA;
    const { data, error } = await admin
      .from("store_settings")
      .select("business_id")
      /* `->>` da text, deci comparatia e cu sirul "true". */
      .filter("saga_config->>enabled", "eq", "true")
      .filter("saga_config->>trimitere_automata", "eq", "true")
      .order("business_id", { ascending: true })
      .range(de, de + PAGINA - 1);
    if (error) return { ids, error: error.message };
    const randuri = (data ?? []) as { business_id: string }[];
    for (const r of randuri) if (r.business_id) ids.push(r.business_id);
    if (randuri.length < PAGINA) break;
  }
  return { ids: [...new Set(ids)], error: null };
}

/**
 * Comenzile cu documente emise de curand, in ordinea emiterii (cele mai vechi intai), care AU ceva de
 * trimis dupa regulile cronului. Pur citire; hotararea e in `candidatiDePlan` si `alegeComenzile`.
 *
 * ⚠ Se porneste din REGISTRU, nu din comenzi: el stie ce s-a emis si cand. Fereastra e cea mai
 * scurta dintre „de la pornirea trimiterii automate" si ultimele zece zile, ordonata de la NOU la
 * vechi si plafonata, ca un magazin mare sa-si vada mereu documentele proaspete. Ce ramane in afara
 * ei se spune in panoul comenzii (`notaTrimitereAutomata`) si se trimite de mana.
 *
 * ⚠ Facturile stornarilor candidate se citesc FARA fereastra: altfel regula „factura de dinainte de
 * pornire" nu s-ar fi aplicat niciodata.
 */
export async function comenziDeExportat(
  admin: Admin,
  businessId: string,
  ctx: ContextMagazin,
  limita: number,
): Promise<{ ok: true; orderIds: string[] } | { ok: false }> {
  const deLa = ctx.config.trimitere_automata_de_la;
  if (!deLa || Number.isNaN(Date.parse(deLa))) return { ok: true, orderIds: [] };
  const prag = new Date(Math.max(Date.parse(deLa), Date.now() - ZILE_FEREASTRA * 86_400_000)).toISOString();

  const { data, error } = await admin
    .from("operatii_externe")
    .select("order_id, fel, furnizor, referinta_externa, creat_la, detalii")
    .eq("business_id", businessId)
    .in("fel", ["factura", "storno"])
    .in("furnizor", [...CASE_FACTURARE])
    .eq("stare", "reusit")
    .not("order_id", "is", null)
    .gte("creat_la", prag)
    .order("creat_la", { ascending: false })
    .limit(PAGINA);
  if (error) return { ok: false };

  const emiteriFereastra = new Map<string, EmitereInRegistru[]>();
  for (const r of data ?? []) {
    const id = String(r.order_id);
    const lista = emiteriFereastra.get(id) ?? [];
    lista.push(dinRandDeRegistru(r));
    emiteriFereastra.set(id, lista);
  }
  const ids = [...emiteriFereastra.keys()];
  if (ids.length === 0) return { ok: true, orderIds: [] };

  /* Comenzile, pe bucati: `.in()` sta in adresa cererii. */
  const comenzi: (RandCuDocumente & { id: string })[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data: randuri, error: e } = await admin
      .from("orders").select(["id", ...COLOANE_DOCUMENTE].join(", "))
      .eq("business_id", businessId).in("id", ids.slice(i, i + 100));
    if (e) return { ok: false };
    comenzi.push(...((randuri ?? []) as unknown as (RandCuDocumente & { id: string })[]));
  }

  /* Emiterile FACTURILOR, fara fereastra, pentru comenzile cu o stornare pe care ar putea-o trimite. */
  const cuStornare = ctx.config.trimite_stornari
    ? comenzi.filter((c) => documenteleComenzii(c).perechi.some((p) => p.storno)).map((c) => c.id)
    : [];
  const emiteriFacturi = new Map<string, EmitereInRegistru[]>();
  for (let i = 0; i < cuStornare.length; i += 100) {
    const { data: randuri, error: e } = await admin
      .from("operatii_externe")
      .select("order_id, fel, furnizor, referinta_externa, creat_la, detalii")
      .eq("business_id", businessId)
      .eq("fel", "factura")
      .in("furnizor", [...CASE_FACTURARE])
      .eq("stare", "reusit")
      .in("order_id", cuStornare.slice(i, i + 100))
      .limit(PAGINA);
    if (e) return { ok: false };
    for (const r of randuri ?? []) {
      const id = String(r.order_id);
      const lista = emiteriFacturi.get(id) ?? [];
      lista.push(dinRandDeRegistru(r));
      emiteriFacturi.set(id, lista);
    }
  }

  const candidati = candidatiDePlan({
    comenzi, emiteriFereastra, emiteriFacturi, deLa, trimiteStornari: ctx.config.trimite_stornari,
  });
  if (candidati.length === 0) return { ok: true, orderIds: [] };

  const chei = [...candidati.map((c) => c.cheie), ...candidati.map((c) => c.facturaCheie ?? "")];
  const jurnal = await jurnalulCheilor(admin, businessId, chei);
  if (!jurnal.ok) return { ok: false };
  return {
    ok: true,
    orderIds: alegeComenzile(candidati, ultimaPeCheie(jurnal.randuri), incercariPeCheie(jurnal.randuri), limita),
  };
}
