import { mascheazaConfig, type ConfigMascat } from "@/lib/integrari/secrete";

/**
 * Configurarea SAGA Web a unui magazin (`store_settings.saga_config`) si tipurile pe care le
 * impart serverul si ecranele.
 *
 * Modul PUR si fara nimic de server: il importa si pagina de configurare, si panoul din pagina
 * comenzii. Fisa integrarii: `docs/facturare/SAGA.md`.
 *
 * ═══ CE E SAGA AICI ═══
 *
 * SAGA NU emite facturi pentru noi. E programul de CONTABILITATE al comerciantului, iar API-ul lor
 * e de IMPORT: noi trimitem in SAGA documentele DEJA emise de casa de facturare a magazinului
 * (SmartBill, Oblio, fGO, Facturis, Factureaza.ro, easybill) si stornarile lor, ca acelasi document
 * sa nu mai fie introdus de mana de contabil.
 *
 * ⚠ NUMELE CAMPULUI SECRET (`api_key`) e IDENTIC aici, in `CAMPURI_SECRETE_SAGA`, in
 * `privat.campuri_secrete` (migratia `2027-02-06-factureaza-easybill-saga.sql`) si in
 * `CAMPURI_SECRETE` din `src/lib/integrari/secrete.ts`. O nepotrivire ar lasa cheia necriptata in
 * baza si nemascata in browser, in tacere. Probele „configurarea" din `xml.test.ts` compara codul cu
 * migratia.
 *
 * ⚠ `cod_fiscal` NU e secret: singur nu deschide nimic, iar comerciantul trebuie sa-l poata reciti
 * ca sa stie CE FIRMA din SAGA a legat (acelasi rationament ca la `facturis_config.cif`).
 */

/** Casele de facturare ale caror documente pot pleca in SAGA, in ordinea dispecerului automat. */
export const CASE_FACTURARE = ["smartbill", "oblio", "fgo", "facturis", "factureaza", "easybill"] as const;
export type CasaFacturare = (typeof CASE_FACTURARE)[number];

/** Numele casei, asa cum il vede comerciantul. */
export const NUME_CASA: Record<CasaFacturare, string> = {
  smartbill: "SmartBill",
  oblio: "Oblio",
  fgo: "fGO",
  facturis: "Facturis",
  factureaza: "Factureaza.ro",
  easybill: "easybill",
};

export type TipDocumentSaga = "factura" | "storno";

/** Cum intra clientii persoane fizice in SAGA. */
export type ClientiPersoaneFizice = "fiecare" | "generic";

export type SagaConfig = {
  enabled: boolean;
  /**
   * Codul fiscal al firmei, scris ca in SAGA. Pleaca in antetul `X-Saga-Cod-Fiscal` (identifica
   * firma) si in `<FurnizorCIF>`: cand e chiar codul firmei, SAGA pune factura la „Iesiri".
   */
  cod_fiscal: string;
  /**
   * Cheia de acces generata in SAGA Web (Utilizatori, Integrare API, doar Admin). SECRET.
   * ⚠ SE ROTESTE: orice raspuns poate aduce o cheie noua (`X-Saga-Refresh-Token`), care TREBUIE
   * salvata si folosita la apelul urmator, altfel SAGA o blocheaza. Vezi `server.ts`.
   */
  api_key: string;
  /**
   * `true`: SAGA importa singur fisierul (`importAutomat=true`) si raspunde cu raportul.
   * `false` (implicit): fisierul ramane in SAGA Web la „Diverse, Import date", iar contabilul
   * il verifica si finalizeaza importul.
   */
  import_automat: boolean;
  /** Pleaca si stornarile. Facturile pleaca mereu. */
  trimite_stornari: boolean;
  /** Trimiterea automata, din cron, a documentelor noi. */
  trimitere_automata: boolean;
  /**
   * Clipa in care s-a pornit trimiterea automata (ISO). Documentele emise INAINTE nu pleaca
   * singure: contabilul le-a introdus probabil deja, iar a doua intrare le-ar dubla.
   */
  trimitere_automata_de_la?: string | null;
  /**
   * `fiecare` (implicit): fiecare cumparator persoana fizica intra cu numele si adresa lui, ca pe
   * factura. `generic`: toate pe un singur client (de exemplu „Clienți persoane fizice"), fara
   * adresa, ca SAGA sa nu creeze cate un partener pentru fiecare cumparator.
   */
  clienti_pf: ClientiPersoaneFizice;
  /** Numele clientului generic, la `clienti_pf: "generic"`. */
  nume_client_generic?: string;
  /** Firma aplica TVA la incasare (`<FacturaTVAIncasare>Da</FacturaTVAIncasare>`). */
  tva_la_incasare: boolean;
  /** Codul gestiunii din SAGA, doar pentru evidenta cantitativ-valorica. Gol = fara. */
  gestiune?: string;
};

/** Campurile secrete ale configurarii. Vezi nota de sus despre cele patru locuri. */
export const CAMPURI_SECRETE_SAGA = ["api_key"] as const;

/**
 * Configurarea cu valorile implicite puse pe campurile lipsa.
 *
 * ⚠ `trimite_stornari` e IMPLICIT PORNIT: o stornare care nu ajunge in contabilitate lasa factura
 * anulata drept venit, adica exact greseala pe care integrarea vine s-o scoata. Restul optiunilor
 * pornesc oprite: importul automat si trimiterea automata le alege omul, cu contabilul lui.
 */
export function configCuImplicite(c: Partial<SagaConfig> | null | undefined): SagaConfig {
  const s = c ?? {};
  return {
    enabled: s.enabled === true,
    cod_fiscal: typeof s.cod_fiscal === "string" ? s.cod_fiscal : "",
    api_key: typeof s.api_key === "string" ? s.api_key : "",
    import_automat: s.import_automat === true,
    trimite_stornari: s.trimite_stornari !== false,
    trimitere_automata: s.trimitere_automata === true,
    trimitere_automata_de_la: typeof s.trimitere_automata_de_la === "string" ? s.trimitere_automata_de_la : null,
    clienti_pf: s.clienti_pf === "generic" ? "generic" : "fiecare",
    nume_client_generic: typeof s.nume_client_generic === "string" ? s.nume_client_generic : "",
    tva_la_incasare: s.tva_la_incasare === true,
    gestiune: typeof s.gestiune === "string" ? s.gestiune : "",
  };
}

/** Numele clientului generic, cand comerciantul nu scrie altul. */
export const NUME_CLIENT_GENERIC = "Clienți persoane fizice";

function plin(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Integrarea poate trimite? O SINGURA regula, folosita peste tot: pagina Integrari, pagina
 * comenzii, lotul din lista comenzilor, cronul.
 *
 * ⚠ NU merge pe configurarea MASCATA (cea trimisa formularului): acolo cheia pleaca goala, iar
 * formularul intreaba `secretulEsteSalvat`. Merge pe cea citita cu cheia de serviciu (decriptata)
 * si pe cea citita cu clientul comerciantului (`enc.v1.…`, tot un sir negol).
 */
export function sagaGata(c: unknown): c is SagaConfig {
  if (!c || typeof c !== "object") return false;
  const s = c as Partial<SagaConfig>;
  return s.enabled === true && plin(s.api_key) && plin(s.cod_fiscal);
}

/**
 * Codul fiscal in forma in care pleaca: fara spatii, cu majuscule („ro 123" -> „RO123").
 * `null` cand nu arata a cod fiscal romanesc (cu sau fara „RO", 2-10 cifre).
 *
 * ⚠ Valoarea pleaca intr-un ANTET HTTP: un caracter in afara ASCII ar face `fetch` sa arunce
 * inainte de cerere, iar o linie noua ar fi o injectie de antet. De aceea forma e stricta.
 */
export function codFiscalCurat(v: unknown): string | null {
  const s = typeof v === "string" ? v.replace(/\s+/g, "").toUpperCase() : "";
  return /^(RO)?\d{2,10}$/.test(s) ? s : null;
}

/**
 * Cheia de acces poate pleca intr-un antet? Doar caractere ASCII vizibile, fara spatii: altfel
 * `fetch` arunca la construirea cererii, sau mai rau, cheia s-ar rupe in doua antete.
 */
export function cheieValida(v: unknown): v is string {
  return typeof v === "string" && /^[\x21-\x7e]{8,4096}$/.test(v);
}

/**
 * Configurarea pentru browser: cheia GOALA, plus `_completate.api_key`.
 *
 * ⚠ MASCAREA NU ATARNA DE LEGAREA COMUNA. `mascheazaConfig` mascheaza doar campurile din
 * `CAMPURI_SECRETE`, iar `saga_config` intra acolo abia cand coordonatorul leaga integrarea. Pana
 * atunci, chemata singura, ar fi trimis cheia in clar in payloadul paginii. Aici se goleste oricum.
 */
export function mascheazaConfigSaga(c: unknown): (SagaConfig & ConfigMascat) | null {
  const m = mascheazaConfig("saga_config", c);
  if (!m) return null;
  const brut = (c ?? {}) as Record<string, unknown>;
  const completate = { ...(m._completate ?? {}) };
  for (const camp of CAMPURI_SECRETE_SAGA) {
    const v = brut[camp];
    completate[camp] = typeof v === "string" ? v.length > 0 : v != null;
  }
  const iesire: Record<string, unknown> = { ...m, _completate: completate };
  for (const camp of CAMPURI_SECRETE_SAGA) iesire[camp] = "";
  return iesire as SagaConfig & ConfigMascat;
}

/* ═══════════════════════════════════════════════════════════════════════════
   JURNALUL EXPORTURILOR, asa cum il vad ecranele
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ce s-a intamplat la o trimitere. Aceleasi valori ca in `saga_exporturi_stare_check`.
 *
 *   importat      200 cu import automat: documentul e in contabilitate.
 *   incarcat      200 fara import automat: fisierul asteapta contabilul la „Diverse, Import date".
 *   avertismente  207: importat partial sau cu avertismente; raportul lor e atasat.
 *   respins       422, sau 200 cu `success: false`: SAGA a citit fisierul si l-a refuzat.
 *   refuzat       400/401/403/404/429: cererea sau accesul (cheia, codul fiscal) au fost refuzate.
 *   necunoscut    retea cazuta, termen depasit, 5xx, raspuns de forma necunoscuta: poate a intrat.
 *   nepregatit    Edinio n-a putut compune fisierul (totalul nu se potriveste, data necunoscuta).
 */
export const STARI_EXPORT = [
  "importat", "incarcat", "avertismente", "respins", "refuzat", "necunoscut", "nepregatit",
] as const;
export type StareExport = (typeof STARI_EXPORT)[number];

/** Documentul e in SAGA (sau la contabil): o a doua trimitere l-ar dubla. */
export const STARI_INTRATE: readonly StareExport[] = ["importat", "incarcat", "avertismente"];

/**
 * Starile pe care cronul NU le reia singur. `refuzat` lipseste dinadins: o cheie gresita reparata
 * de comerciant trebuie sa lase documentele sa plece, fara ca el sa le trimita pe fiecare de mana.
 */
export const STARI_OPRITE_PENTRU_CRON: readonly StareExport[] = [
  "importat", "incarcat", "avertismente", "respins", "necunoscut", "nepregatit",
];

/** De unde a pornit trimiterea. Aceleasi valori ca in `saga_exporturi_sursa_check`. */
export type SursaExport = "manual" | "lot" | "automat";

/** Un rand din jurnal, pentru ecran. Fara date personale: raportul SAGA e taiat si numai al magazinului. */
export interface ExportJurnal {
  stare: StareExport;
  creatLa: string;
  mesaj: string | null;
  raport: string | null;
  sursa: SursaExport;
  codHttp: number | null;
  /** Trimis cu import automat: un document nelamurit se cauta atunci la „Iesiri", nu la „Import date". */
  importAutomat: boolean;
}

/** Un document al comenzii, in panou. */
export interface DocumentPanouSaga {
  /** Cheia documentului (aceeasi ca in registru): tip, casa, serie si numar. */
  cheie: string;
  tip: TipDocumentSaga;
  casa: CasaFacturare;
  /** „Factura SmartBill EDN0001". */
  eticheta: string;
  /** De ce nu poate pleca acum (numar necitit, document de test, data necunoscuta). `null` = poate. */
  blocaj: string | null;
  /**
   * Ce trebuie sa stie omul desi documentul poate pleca: de pilda ca NU mai pleaca automat (e mai vechi
   * decat fereastra cronului sau decat pornirea trimiterii automate), deci il trimite el, de aici.
   */
  nota: string | null;
  /** Ultima trimitere, sau `null` daca n-a plecat niciodata. */
  ultimul: ExportJurnal | null;
}

/** Ce primeste `SagaComandaPanel`. Serializabil: se calculeaza pe server, in pagina comenzii. */
export interface StarePanouSaga {
  /** Importul automat e pornit (altfel documentele asteapta contabilul). */
  importAutomat: boolean;
  documente: DocumentPanouSaga[];
  /** De ce comanda n-are nimic de trimis (fara factura, factura de test). `null` cand are. */
  nimic: string | null;
  /** Jurnalul nu s-a putut citi: starea afisata poate fi veche. */
  jurnalNecitit: boolean;
  /**
   * Facturi plecate in SAGA (intrate sau nelamurite) si inlocuite intre timp pe comanda, a caror stornare
   * nu apare intrata in SAGA („Factura SmartBill EDN0001"). Daca lipseste acolo, venitul e dublat.
   */
  stornariLipsa: string[];
}

/**
 * Ce i se spune omului despre facturile inlocuite pe comanda fara stornare intrata in SAGA: in panou, in
 * rezultatul trimiterii si in semnalarea cronului, acelasi text.
 *
 * ⚠ „Nu apare intrata", nu „n-a ajuns": stornarea poate fi nelamurita (poate a intrat) sau introdusa de
 * mana de contabil, iar Edinio nu are de unde sti. Omul verifica in SAGA.
 */
export function mesajStornariLipsa(etichete: readonly string[]): string {
  if (etichete.length === 1) {
    return `${etichete[0]} a plecat în SAGA și a fost înlocuită pe comandă, dar stornarea ei nu apare intrată în SAGA. Dacă lipsește acolo, venitul e dublat: verifică în SAGA și introdu stornarea după documentul din casa de facturare.`;
  }
  return `${etichete.join(", ")} au plecat în SAGA și au fost înlocuite pe comandă, dar stornările lor nu apar intrate în SAGA. Dacă lipsesc acolo, venitul e dublat: verifică în SAGA și introdu stornările după documentele din casa de facturare.`;
}

/** Eticheta si tonul unei stari, pentru ecrane. Textele sunt pentru comerciant: cu diacritice. */
export const ETICHETA_STARE: Record<StareExport, { text: string; ton: "bun" | "info" | "asteptare" | "rau" }> = {
  importat: { text: "Importat în SAGA", ton: "bun" },
  incarcat: { text: "Încărcat, așteaptă contabilul", ton: "info" },
  avertismente: { text: "Importat cu avertismente", ton: "asteptare" },
  respins: { text: "Respins de SAGA", ton: "rau" },
  refuzat: { text: "Cerere refuzată", ton: "rau" },
  necunoscut: { text: "Nelămurit", ton: "asteptare" },
  nepregatit: { text: "Nu s-a putut pregăti", ton: "rau" },
};
