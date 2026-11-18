/**
 * Configurarea theMarketer a unui magazin (`store_settings.themarketer_config`).
 *
 * ═══ CELE TREI CHEI ALE CONTULUI ═══
 *
 * theMarketer da trei valori, toate din Settings → Technical Integration:
 *   - `tracking_key`: cheia scriptului de urmarire (`https://t.themarketer.com/t/j/<cheie>`). E PUBLICA prin
 *     definitie: sta in pagina fiecarui vizitator. Singura dintre cele trei care are voie in browser;
 *   - `customer_id`: parametrul `u` al fiecarui apel REST. Singur nu deschide nimic, iar comerciantul
 *     trebuie sa-l poata reciti ca sa stie CE CONT a legat (acelasi rationament ca `easybill_config.username`).
 *     Nu e secret, dar nici nu pleaca in browser: nu e treaba vizitatorului;
 *   - `rest_key`: parametrul `k`. SECRET. Cu el oricine ar putea abona, dezabona, anonimiza contacte sau
 *     scrie comenzi in contul comerciantului.
 *
 * Plus `cheie_feed`: cheia NOASTRA din adresele de feed si din adresa generatorului de coduri (vezi
 * `chei.ts`). SECRETA si ea: cu ea se citesc catalogul, comenzile (date personale) si se pot cere coduri.
 *
 * ⚠ Numele secretelor sunt IDENTICE aici, in `CAMPURI_SECRETE` (`src/lib/integrari/secrete.ts`) si in
 * `privat.campuri_secrete` (migratia `2027-02-07-themarketer.sql`). O nepotrivire ar lasa cheia
 * necriptata in baza si nemascata in browser, in tacere; de aceea pagina le goleste oricum, si prin
 * `SECRETE_THEMARKETER`.
 *
 * ═══ MODULELE ═══
 *
 * Fiecare functie theMarketer are comutatorul ei, fiindca planurile lor difera (recenziile, fidelitatea si
 * exportul de comenzi sunt in „Ecommerce PRO”) si fiindca unele scot date personale din platforma. Cele
 * care scot date personale sau schimba ce vede cumparatorul pornesc OPRITE: exportul comenzilor, captarea
 * emailului din checkout, notificarile push, recenziile si fidelitatea.
 */
export type TheMarketerConfig = {
  enabled: boolean;
  /** Cheia scriptului de urmarire. PUBLICA. */
  tracking_key: string;
  /** Parametrul `u` al API-ului REST. Nu e secret, dar nu pleaca in browser. */
  customer_id: string;
  /** Parametrul `k` al API-ului REST. SECRET. */
  rest_key: string;
  /** Cheia din adresele de feed si de coduri. SECRETA. O scrie serverul, nu formularul. */
  cheie_feed?: string;

  /** Scriptul de urmarire si evenimentele din vitrina (produs, cos, checkout, comanda, cautare...). */
  urmarire?: boolean;
  /**
   * Emailul si telefonul scrise in checkout pleaca spre theMarketer la iesirea din camp, inainte de
   * comanda: fara ele, automatizarea de cos abandonat a theMarketer n-are cui sa scrie. PORNESTE OPRITA.
   * ⚠ Pleaca tot prin script, deci tot numai cu acordul pentru marketing.
   */
  captura_email?: boolean;
  /** Comenzile (`save_order`) si schimbarile lor de status (`update_order_status`), din coada. */
  comenzi?: boolean;
  /** De unde se aboneaza contactele: checkout (bifa de newsletter), popup, formulare. */
  abonati?: { checkout?: boolean; popup?: boolean; forms?: boolean };
  /** Generatorul de coduri de reducere unice, chemat de theMarketer. */
  coduri?: boolean;
  /** Feedul de comenzi pentru importul istoric (date personale). PORNESTE OPRIT. */
  export_comenzi?: boolean;
  /** Recenziile din modulul Feedback, aduse in magazin si aratate pe pagina produsului. PORNESTE OPRIT. */
  recenzii?: boolean;
  /** Punctele de fidelitate in contul cumparatorului. PORNESTE OPRIT. */
  fidelitate?: boolean;
  /** Notificarile push (service worker pe domeniul propriu). PORNESTE OPRIT. */
  push?: boolean;
  /** Cine se dezaboneaza in theMarketer nu mai primeste nici emailurile Edinio de cos abandonat. */
  dezabonari?: boolean;
  /** Anonimizarea unui client in Edinio il anonimizeaza si in theMarketer. */
  anonimizare?: boolean;

  /** Cand a mers ultima proba de conexiune. O scrie serverul. */
  testat_la?: string;
};

/** Campurile secrete ale configurarii. ⚠ Aceeasi lista ca in `CAMPURI_SECRETE.themarketer_config`. */
export const SECRETE_THEMARKETER = ["rest_key", "cheie_feed"] as const;

/** Campurile pe care le scrie NUMAI serverul: ce trimite formularul in ele se ignora. */
export const SCRISE_DE_SERVER = ["cheie_feed", "testat_la"] as const;

/**
 * Valorile implicite ale modulelor, la prima conectare. Functiile de baza pornesc; cele care scot date
 * personale sau schimba vitrina asteapta sa le porneasca omul.
 */
export const MODULE_IMPLICITE = {
  urmarire: true,
  captura_email: false,
  comenzi: true,
  abonati: { checkout: true, popup: true, forms: true },
  coduri: true,
  export_comenzi: false,
  recenzii: false,
  fidelitate: false,
  push: false,
  dezabonari: true,
  anonimizare: true,
} as const satisfies Partial<TheMarketerConfig>;

export type ModulTheMarketer =
  | "urmarire" | "captura_email" | "comenzi" | "coduri" | "export_comenzi"
  | "recenzii" | "fidelitate" | "push" | "dezabonari" | "anonimizare";

function plin(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Contul e legat de tot: cele trei chei sunt scrise si integrarea e pornita. O SINGURA regula, folosita
 * peste tot (pagina Integrari, coada, feedurile, generatorul de coduri, vitrina).
 *
 * Merge pe configurarea citita cu cheia de serviciu (decriptata) si pe cea citita cu clientul
 * comerciantului (`enc.v1.…`): amandoua dau un sir negol acolo unde cheia exista.
 *
 * ⚠ NU merge pe configurarea MASCATA, cea trimisa formularului: acolo cheia pleaca goala. Formularul
 * intreaba `_completate`, nu functia asta.
 */
export function theMarketerGata(c: unknown): c is TheMarketerConfig {
  if (!c || typeof c !== "object") return false;
  const t = c as Partial<TheMarketerConfig>;
  return t.enabled === true && plin(t.tracking_key) && plin(t.customer_id) && plin(t.rest_key);
}

/**
 * Modulul e pornit? Lipsa campului inseamna valoarea implicita, nu „oprit”: o configurare scrisa inainte
 * sa existe un modul nou trebuie sa se poarte ca la prima conectare.
 */
export function modulPornit(c: TheMarketerConfig | null | undefined, modul: ModulTheMarketer): boolean {
  if (!theMarketerGata(c)) return false;
  const v = c[modul];
  return typeof v === "boolean" ? v : MODULE_IMPLICITE[modul];
}

/** Sursa de abonare e pornita? Aceeasi regula: lipsa = implicitul (pornit). */
export function sursaPornita(c: TheMarketerConfig | null | undefined, sursa: "checkout" | "popup" | "forms"): boolean {
  if (!theMarketerGata(c)) return false;
  const v = c.abonati?.[sursa];
  return typeof v === "boolean" ? v : true;
}

/**
 * Cheia de urmarire e buna de pus in pagina? Ajunge intr-o adresa de script, deci se primesc doar
 * litere, cifre, `-` si `_`. Orice altceva (spatii, `/`, `?`, `"`, `<`) ar putea schimba adresa sau
 * iesi din atribut. Forma exacta a cheilor lor nu e documentata; proba de conexiune o verifica oricum
 * la ei (scriptul raspunde 404 la o cheie necunoscuta).
 */
export function cheieUrmarireValida(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(v);
}

/** Customer ID si cheia REST: fara spatii, de o lungime rezonabila. Restul il judeca theMarketer. */
export function idClientValid(v: unknown): v is string {
  return typeof v === "string" && /^\S{1,100}$/.test(v);
}

export function cheieRestValida(v: unknown): v is string {
  return typeof v === "string" && /^\S{8,200}$/.test(v);
}

/** Valorile scrise de om se curata o singura data, aici: spatiile de la copiere nu fac parte din cheie. */
export function curataCheie(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
