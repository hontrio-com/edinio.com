import type { AutoInvoiceTrigger } from "@/lib/invoicing";
import { mascheazaConfig, type ConfigMascat } from "@/lib/integrari/secrete";

/**
 * Configurarea Factureaza.ro a unui magazin (`store_settings.factureaza_config`).
 *
 * Modul PUR: il citesc si pagina (componenta de client), si actiunile, si probele. Nimic de retea,
 * nimic de baza aici.
 *
 * ═══ CE E SECRET, si de ce numai atat ═══
 *
 * Factureaza.ro cere o SINGURA valoare: cheia API a utilizatorului, trimisa ca nume de utilizator
 * intr-un antet `Authorization: Basic` (parola e ignorata). Cheia identifica si contul, si
 * utilizatorul, deci nu mai exista nume de utilizator sau cod fiscal de tinut.
 *
 * ⚠ Numele campului secret (`api_key`) e IDENTIC aici, in `CAMPURI_SECRETE_FACTUREAZA`, in
 * `privat.campuri_secrete` (migratia `2027-02-06-factureaza-easybill-saga.sql`) si in
 * `CAMPURI_SECRETE` din `src/lib/integrari/secrete.ts`. O nepotrivire ar lasa cheia necriptata in
 * baza si nemascata in browser, in tacere. O verifica `factureaza-legat.test.ts`.
 *
 * ═══ ⚠ SERIA SE TINE DUPA PREFIX, NU DUPA ID ═══
 *
 * La Factureaza.ro o serie e a unui AN: „SRV” pe 2026 si „SRV” pe 2027 sunt doua serii, cu id-uri
 * diferite. MASURAT pe sandbox (17.11.2026): o factura din 2026 pusa pe seria SRV a lui 2027 e
 * refuzata cu „Anul seriei selectate nu coincide cu data documentului”. Un id salvat aici ar fi
 * oprit facturarea in fiecare 1 ianuarie, pana cand comerciantul isi reface configurarea. Se tine
 * deci PREFIXUL, iar id-ul seriei pentru anul documentului se afla la fiecare emitere, in aceeasi
 * cerere cu cautarea clientului (deci fara o cerere in plus).
 */

/** Unde pleaca cererile. `test` = sandbox-ul PUBLIC al Factureaza.ro, cu documente NEFISCALE. */
export type MediuFactureaza = "productie" | "test";

export type FactureazaConfig = {
  enabled: boolean;
  /** Cheia API a utilizatorului (in Factureaza.ro: Contul meu, Cheie API). SECRET. */
  api_key: string;
  /** Lipsa = productie. Vezi `mediul`. */
  mediu?: MediuFactureaza;
  /** PREFIXUL seriei facturilor, ca in Factureaza.ro (de pilda „SRV”). Vezi nota de sus. */
  serie: string;
  /** Prefixul seriei stornarilor. Gol = aceeasi serie cu facturile. */
  serie_storno?: string;
  /** Scadenta, in zile de la emitere. 0 = ziua emiterii. */
  due_days?: number;
  auto_invoice?: boolean;
  auto_invoice_trigger?: AutoInvoiceTrigger;
  /** Inregistreaza incasarea la emitere cand comanda e deja platita online cu cardul. */
  mark_paid_online?: boolean;
  /** Firma contului legat, citita de la ei la salvare. Doar ca omul sa vada CE cont a legat. */
  cont_firma?: string;
  /** Codul fiscal al firmei contului legat, citit la salvare. Tot doar pentru ecran. */
  cont_cif?: string;
};

/** O serie de facturi, asa cum o da proba de conexiune (si cum o arata formularul). */
export interface SerieFactura {
  id: string;
  prefix: string;
  an: string;
  separator: string;
  sufix: string;
  /** Numarul ultimului document emis pe serie. */
  ultimulNumar: number | null;
}

/** Campurile secrete. ⚠ Aceleasi nume ca in SQL si in `CAMPURI_SECRETE` (vezi nota de sus). */
export const CAMPURI_SECRETE_FACTUREAZA = ["api_key"] as const;

/**
 * Integrarea poate emite? O SINGURA regula, folosita peste tot: pagina Integrari, pagina comenzii,
 * lista, facturarea in lot, facturarea automata si ruta de PDF.
 *
 * ⚠ Seria intra in ea desi nu e credentiala: fara serie, Factureaza.ro nu da numar documentului
 * („Număr câmp obligatoriu”, masurat), deci un card verde fara serie ar minti.
 *
 * Merge pe configurarea decriptata (cheia de serviciu) si pe cea citita cu clientul comerciantului
 * (`enc.v1.…`): amandoua dau un sir negol acolo unde cheia exista.
 *
 * ⚠ NU merge pe configurarea MASCATA, cea trimisa formularului: acolo cheia pleaca goala.
 * Formularul intreaba `secretulEsteSalvat` (harta `_completate`), nu functia asta.
 */
export function factureazaGata(c: unknown): c is FactureazaConfig {
  if (!c || typeof c !== "object") return false;
  const f = c as Partial<FactureazaConfig>;
  return f.enabled === true && plin(f.api_key) && plin(f.serie);
}

function plin(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

/** Mediul configurat. ⚠ Orice altceva decat „test” e productie: nu se ghiceste un al treilea. */
export function mediul(c: Pick<FactureazaConfig, "mediu"> | null | undefined): MediuFactureaza {
  return c?.mediu === "test" ? "test" : "productie";
}

/*
 * Capetele. ⚠ Productia NU e scrisa in documentatia GraphQL (acolo apare doar sandbox-ul);
 * documentatia REST spune „set BASE_URL to https://factureaza.ro/api/v1/ for production”, iar
 * `https://factureaza.ro/graphql` raspunde 401 unei chei inventate, exact ca sandbox-ul (masurat
 * pe 17.11.2026). Constante, nu configurabile: o adresa venita din formular ar fi trimis cheia
 * comerciantului oriunde.
 */
export const ADRESA_PRODUCTIE = "https://factureaza.ro/graphql";
export const ADRESA_TEST = "https://sandbox.factureaza.ro/graphql";

export function adresaApi(mediu: MediuFactureaza): string {
  return mediu === "test" ? ADRESA_TEST : ADRESA_PRODUCTIE;
}

/** Prefixul seriei cu care pleaca stornarea: cel anume, sau al facturilor. */
export function seriaStornarii(c: Pick<FactureazaConfig, "serie" | "serie_storno">): string {
  return (c.serie_storno ?? "").trim() || c.serie.trim();
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHEIA DOCUMENTULUI PE COMANDA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠⚠ DOCUMENTUL DE TEST SE RECUNOASTE DUPA CHEIA LUI, NU DUPA CONFIGURARE.
 *
 * Sandbox-ul Factureaza.ro intoarce documente cu numar, serie si PDF valid: pe randul comenzii nu
 * s-ar deosebi cu nimic de o factura adevarata. Iar configurarea spune ce e ACUM, nu ce era cand
 * s-a emis documentul (lectia fGO din 16.09.2026, `documentul-de-test-arata-ca-unul-fiscal`).
 *
 * De aceea id-ul unui document emis in sandbox se scrie pe comanda cu `test:` in fata. Asa:
 *   - PDF-ul si stornarea lui merg la gazda pe care chiar exista (id-urile celor doua gazde sunt
 *     baze diferite: acelasi numar poate fi, in productie, documentul altcuiva);
 *   - urcarea la marketplace si contul cumparatorului il pot refuza dupa cheie, oricand.
 */
export const PREFIX_TEST = "test:";

export function cheiePeComanda(id: string, mediu: MediuFactureaza): string {
  return mediu === "test" ? `${PREFIX_TEST}${id}` : id;
}

/** Id-ul de la ei si mediul in care exista, din cheia de pe comanda. `null` = cheie stricata. */
export function citesteCheia(cheie: string | null | undefined): { id: string; mediu: MediuFactureaza } | null {
  const s = (cheie ?? "").trim();
  const test = s.startsWith(PREFIX_TEST);
  const id = test ? s.slice(PREFIX_TEST.length) : s;
  /* Doar cifre: id-urile lor sunt numerice (masurat), iar orice altceva ar ajunge intr-o cerere. */
  if (!/^\d{1,20}$/.test(id)) return null;
  return { id, mediu: test ? "test" : "productie" };
}

/** Documentul a fost emis in sandbox, deci NU e fiscal. Pentru urcarea la marketplace si contul cumparatorului. */
export function eDocumentDeTestFactureaza(cheie: string | null | undefined): boolean {
  return (cheie ?? "").trim().startsWith(PREFIX_TEST);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECRETUL, IN FORMULAR SI LA SALVARE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Configurarea pentru browser: cheia pleaca GOALA, cu `_completate.api_key`.
 *
 * ⚠ PLASA, nu dublura: `mascheazaConfig` mascheaza doar campurile din `CAMPURI_SECRETE`, iar
 * intrarea `factureaza_config` de acolo e a legarii comune. Pana atunci (sau daca s-ar pierde la o
 * rescriere), `mascheazaConfig` ar fi intors configurarea NEATINSA si cheia ar fi plecat in
 * payload-ul paginii. Aici se mascheaza oricum, dupa lista proprie.
 */
export function mascheazaFactureaza(config: unknown): (FactureazaConfig & ConfigMascat) | null {
  const m = mascheazaConfig("factureaza_config", config);
  if (!m) return null;
  const sursa = config as Record<string, unknown>;
  const iesire: Record<string, unknown> = { ...m };
  const completate: Record<string, boolean> = { ...(m._completate ?? {}) };
  for (const camp of CAMPURI_SECRETE_FACTUREAZA) {
    if (completate[camp] === undefined) {
      const v = sursa[camp];
      completate[camp] = typeof v === "string" ? v.length > 0 : v != null;
    }
    if (camp in iesire) iesire[camp] = "";
  }
  return { ...iesire, _completate: completate } as FactureazaConfig & ConfigMascat;
}

/**
 * Ce cheie pleaca la Factureaza.ro, la salvare si la „Testează conexiunea”: cea tastata, sau (cand
 * formularul o trimite GOALA, fiindca o primeste mascata) cea salvata.
 *
 * ⚠⚠ CEA SALVATA DOAR IN ACELASI MEDIU. Cheia reala, refolosita dupa trecerea pe Test, ar fi plecat
 * in SANDBOX-UL PUBLIC; cea de test, dupa trecerea pe Real, ar fi primit 401 de la contul real. La o
 * schimbare de mediu fara cheie noua, se cere cheia noului mediu.
 *
 * ⚠ De aceea regula sta aici si nu in `pastreazaSecretele`: aceea pune la loc orice secret venit gol,
 * fara sa stie de mediu. Apelantul suprascrie cheia cu ce intoarce functia asta.
 *
 * ⚠ `vechi` trebuie citita cu cheia de SERVICIU: pe clientul comerciantului ar fi sosit `enc.v1.…`.
 */
export function cheiaDeFolosit(
  tastata: string | null | undefined,
  mediuNou: MediuFactureaza,
  vechi: unknown,
): { cheie: string } | { error: string } {
  const t = (tastata ?? "").trim();
  if (t) return { cheie: t };
  const v = (vechi && typeof vechi === "object" ? vechi : {}) as Partial<FactureazaConfig>;
  const salvata = typeof v.api_key === "string" ? v.api_key.trim() : "";
  if (!salvata) return { error: "Completează cheia API Factureaza.ro." };
  if (mediul(v) !== mediuNou) {
    return {
      error: mediuNou === "test"
        ? "Ai ales modul de test: lipește cheia de test, cea publică din documentația Factureaza.ro. Cheia salvată e a contului real și nu pleacă în sandbox."
        : "Ai ales „Real”: lipește cheia API a contului tău Factureaza.ro. Cheia salvată e cea de test.",
    };
  }
  return { cheie: salvata };
}

/* ═══════════════════════════════════════════════════════════════════════════
   MEDIUL, PE ECRAN
   ═══════════════════════════════════════════════════════════════════════════ */

export type StareMediu = {
  /** Mediul SALVAT: dupa el pleaca facturile ACUM. */
  salvat: MediuFactureaza;
  /** Mediul ales in formular si inca nesalvat; `null` cand e acelasi cu cel salvat. */
  deSalvat: MediuFactureaza | null;
  /** Randul „Mediu” din „Contul legat”. */
  rand: string;
  /** Panoul de avertizare de deasupra formularului, sau `null`. */
  avertizare: { titlu: string; text: string } | null;
};

const NUME_MEDIU: Record<MediuFactureaza, string> = { test: "Test (sandbox)", productie: "Real" };

/**
 * Ce spune ecranul despre mediu, ca antetul, randul „Mediu” si avertizarea sa nu se contrazica.
 *
 * ⚠ CE E SALVAT SI CE URMEAZA SA SALVEZI SE SPUN SEPARAT. Antetul arata ce e salvat (dupa el se
 * emite acum); o alegere nesalvata e numita „după salvare”, nu prezentata drept starea de acum.
 * Altfel cine a ales „Real” fara sa salveze ar fi crezut ca facturile sunt deja fiscale.
 */
export function stareaMediului(salvat: MediuFactureaza, ales: MediuFactureaza): StareMediu {
  const deSalvat = ales === salvat ? null : ales;
  const rand = deSalvat ? `${NUME_MEDIU[salvat]} · după salvare: ${NUME_MEDIU[deSalvat]}` : NUME_MEDIU[salvat];
  if (salvat === "test" && !deSalvat) {
    return {
      salvat, deSalvat, rand,
      avertizare: {
        titlu: "Ești în modul de testare",
        text: "Facturile emise acum pleacă în sandbox-ul PUBLIC al Factureaza.ro și NU sunt documente fiscale, deși au număr, serie și PDF. Ca datele cumpărătorilor să nu ajungă într-un cont public, documentele de test poartă un client inventat. Nu se trimit la eMAG sau Trendyol. Alege „Real” la Mediul de lucru înainte de a factura comenzi adevărate.",
      },
    };
  }
  if (salvat === "test") {
    return {
      salvat, deSalvat, rand,
      avertizare: {
        titlu: "Ești încă în modul de testare",
        text: "Până salvezi, facturile pleacă tot în sandbox-ul public și NU sunt fiscale. După salvare, cu cheia contului tău real, se emit facturi fiscale.",
      },
    };
  }
  if (deSalvat === "test") {
    return {
      salvat, deSalvat, rand,
      avertizare: {
        titlu: "După salvare treci în modul de testare",
        text: "Acum facturile sunt fiscale. După salvare ar pleca în sandbox-ul public al Factureaza.ro, cu un client inventat, și NU ar mai fi documente fiscale.",
      },
    };
  }
  return { salvat, deSalvat, rand, avertizare: null };
}
