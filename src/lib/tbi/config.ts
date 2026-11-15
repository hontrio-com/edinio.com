/**
 * tbi bank: plata in rate (credit de consum acordat la cumparare), prin API-ul eCommerce al tbi.
 *
 * Fisa completa, cu tot ce s-a masurat pe fir si ce ramane ipoteza: `docs/plati/TBI.md`.
 *
 * Modul PUR: nici `node:crypto`, nici baza, nici retea. Il citesc si checkoutul, si actiunile de
 * comanda, si panoul, deci trebuie sa poata fi importat de oriunde, inclusiv din probe.
 *
 * ═══ CE PRIMESTE COMERCIANTUL DE LA TBI ═══
 *
 * Echipa lor de integrare trimite, pe email, trei credentiale si doua perechi de chei RSA:
 *
 *   store_id / providerCode  codul magazinului la ei (ex. `magazin_ro`); acelasi in ambele locuri;
 *   username, password       se trimit CRIPTAT, in corpul fiecarei cereri;
 *   Chei_SFTL_<cod>          cheia LOR: cu `pub.pem` de acolo criptam cererile catre tbi;
 *   Chei_Comerciant_<cod>    cheia MAGAZINULUI: cu `priv_key.pem` de acolo descifram vestile lor.
 *
 * Masurat pe pachetul lor de test (DOCUMENTATIE-TEST-API.zip, 15.11.2026): ambele arhive contin
 * `priv_key.pem`, `pub.pem`, `pub.crt` si un `.pfx`, adica le trimit si cheia privata SFTL, de care
 * noi nu avem nevoie si pe care n-o cerem. Confuzia probabila e intre cele doua arhive, de aceea
 * formularul si salvarea le deosebesc anume (vezi `lib/tbi/cripto.ts`).
 */

export type TbiConfig = {
  enabled: boolean;
  /** Mediul de test (UAT) al tbi, nu cel real. */
  sandbox: boolean;
  /** Codul magazinului la tbi: merge si ca `store_id` in cerere, si ca `providerCode` in clar. */
  store_id: string;
  username: string;
  /** SECRET. */
  password: string;
  /** Cheia publica tbi (`pub.pem` din arhiva `Chei_SFTL_<cod>`). Nu e secreta. */
  cheie_publica_tbi: string;
  /** SECRET. Cheia privata a magazinului (`priv_key.pem` din arhiva `Chei_Comerciant_<cod>`). */
  cheie_privata: string;
  /** Cel mai mic total de comanda pentru care se ofera plata in rate, in lei. */
  suma_minima: number;
  /** Cel mai mare total de comanda pentru care se ofera plata in rate, in lei. */
  suma_maxima: number;
  /**
   * `promo: 1` in cerere: produsul de finantare e o campanie (de exemplu rate fara dobanda).
   * Se aprinde DOAR cand tbi i-a confirmat comerciantului campania; altfel cererile pleaca
   * ca produs standard, cum trimit si exemplele lor.
   */
  promo: boolean;
  /**
   * `category` din fiecare articol. Documentatia il cere „numar intreg" si nu publica nicio
   * lista; exemplele lor trimit 2 si 8, iar modulul lor de WooCommerce trimite id-ul categoriei
   * din magazin. Ramane „1" pana cand tbi ii spune comerciantului altceva.
   */
  categorie: string;
  /**
   * Ce apare pe pagina produsului, sub butoanele de comanda, la produsele cu pretul intre limite
   * (vezi `FORME_BANNER_TBI`). Alegerea comerciantului din panou; implicit randul discret. Nu schimba
   * nimic la comanda: metoda de plata apare in formular oricum, cand totalul intra in limite.
   */
  banner_produs: FormaBannerTbi;
};

/**
 * Formele mesajului „plateste in rate" de pe pagina produsului:
 *
 *   rand    „Plateste in rate cu [tbi bank]", un rand mic (implicit);
 *   banner  o caseta mai mare, cu sigla si cei trei pasi ai platii in rate;
 *   video   bannerul cu clip animat (motion design, fara sonor), `public/plati/tbi/`;
 *   ascuns  nimic.
 *
 * ⚠ In niciuna nu apare vreo cifra (rata, dobanda, DAE, numar de luni): le stabileste tbi pentru
 * fiecare client, iar o cifra intr-o reclama de credit cere toate informatiile standard. Vezi `RateTbi`.
 */
export const FORME_BANNER_TBI = ["rand", "banner", "video", "ascuns"] as const;
export type FormaBannerTbi = (typeof FORME_BANNER_TBI)[number];
export const TBI_BANNER_IMPLICIT: FormaBannerTbi = "rand";

export function esteFormaBannerTbi(v: unknown): v is FormaBannerTbi {
  return typeof v === "string" && (FORME_BANNER_TBI as readonly string[]).includes(v);
}

/**
 * Limitele implicite: 300 - 30.000 lei, cele publicate de tbi pentru cumparaturile online
 * (tbibank.ro, „Online Purchases", citit 15.11.2026: „300 to 30,000 lei", 6 - 60 de luni).
 * Contractul fiecarui comerciant le poate schimba, deci sunt editabile.
 */
export const TBI_SUMA_MINIMA_IMPLICITA = 300;
export const TBI_SUMA_MAXIMA_IMPLICITA = 30000;
export const TBI_CATEGORIE_IMPLICITA = "1";

export const TBI_CONFIG_IMPLICITA: TbiConfig = {
  enabled: false,
  sandbox: true,
  store_id: "",
  username: "",
  password: "",
  cheie_publica_tbi: "",
  cheie_privata: "",
  suma_minima: TBI_SUMA_MINIMA_IMPLICITA,
  suma_maxima: TBI_SUMA_MAXIMA_IMPLICITA,
  promo: false,
  categorie: TBI_CATEGORIE_IMPLICITA,
  banner_produs: TBI_BANNER_IMPLICIT,
};

/**
 * Adresele, din documentatia lor (eCommerce-API-Documentation.pdf, 06.2024) si din foaia
 * „Credentials + Endpoints UAT" din pachetul de test.
 *
 * ⚠ Productia are `/Api` in cale, testul NU. Nu e o greseala de copiere: asa scrie in
 * ambele documente, de fiecare data.
 *
 * Masurat 15.11.2026: productia raspunde public (405 la GET, adica exista si vrea POST), cu
 * certificat DigiCert valid; serverul de test nu raspunde deloc din afara (conexiunea expira),
 * deci e deschis doar adreselor aprobate de tbi. Vezi `TBI_PROXY_URL` in `lib/tbi/client.ts`.
 */
export const TBI_ADRESE = {
  live: {
    finalizare: "https://ecommerce.tbibank.ro/Api/LoanApplication/Finalize",
    anulare: "https://ecommerce.tbibank.ro/Api/LoanApplication/CanceledByCustomer",
  },
  test: {
    finalizare: "https://vmrouatftos01.westeurope.cloudapp.azure.com/LoanApplication/Finalize",
    anulare: "https://vmrouatftos01.westeurope.cloudapp.azure.com/LoanApplication/CanceledByCustomer",
  },
} as const;

export function adreseleTbi(sandbox: boolean) {
  return sandbox ? TBI_ADRESE.test : TBI_ADRESE.live;
}

/** `store_id`: litere, cifre, `_`, `-`, `.`. Asa arata toate codurile lor (`tbitestapi_ro`). */
export const FORMA_COD_MAGAZIN = /^[A-Za-z0-9_.-]{2,64}$/;

/**
 * ⚠ Lipsa NU e zero. `Number("")` da 0, iar o configurare fara `suma_minima` (orice magazin salvat
 * inainte de camp) ar fi coborat limita la 0 lei in tacere. Prins de proba, nu de citit.
 */
function numar(v: unknown, implicit: number): number {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return implicit;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : implicit;
}

function sir(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Configuratia citita din baza, adusa la o forma sigura. Orice camp lipsa sau stricat ia
 * implicitul; limitele se reaseaza ca `min <= max` sa fie mereu adevarat.
 */
export function citesteConfigTbi(raw: unknown): TbiConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  let min = Math.max(0, Math.round(numar(o.suma_minima, TBI_SUMA_MINIMA_IMPLICITA) * 100) / 100);
  let max = Math.max(0, Math.round(numar(o.suma_maxima, TBI_SUMA_MAXIMA_IMPLICITA) * 100) / 100);
  if (max <= 0) max = TBI_SUMA_MAXIMA_IMPLICITA;
  if (min > max) [min, max] = [max, min];
  const categorie = sir(o.categorie).trim();
  return {
    enabled: o.enabled === true,
    sandbox: o.sandbox !== false,
    store_id: sir(o.store_id).trim(),
    username: sir(o.username).trim(),
    password: sir(o.password),
    cheie_publica_tbi: sir(o.cheie_publica_tbi),
    cheie_privata: sir(o.cheie_privata),
    suma_minima: min,
    suma_maxima: max,
    promo: o.promo === true,
    categorie: /^\d{1,9}$/.test(categorie) ? categorie : TBI_CATEGORIE_IMPLICITA,
    /* Lipsa sau necunoscuta = randul discret: numai „ascuns" ales anume il scoate. */
    banner_produs: esteFormaBannerTbi(o.banner_produs) ? o.banner_produs : TBI_BANNER_IMPLICIT,
  };
}

/**
 * Gata de incasat: pornit si cu tot ce trebuie ca o cerere sa plece SI ca vestea sa poata fi
 * descifrata. Fara cheia privata, banca ar aproba, iar noi n-am afla niciodata.
 *
 * ⚠ Pe clientul comerciantului secretele vin ca `enc.v1.…` (sir NEGOL), deci raspunsul de aici
 * ramane corect si pentru citirile din panou. Vezi `lib/integrari/secrete.ts`.
 */
export function tbiGata(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const c = citesteConfigTbi(raw);
  return !!(
    c.enabled && c.store_id && c.username && c.password
    && c.cheie_publica_tbi.trim() && c.cheie_privata.trim()
  );
}

/** Limitele, pentru vitrina. Nimic secret: doua numere. */
export type LimiteTbi = { min: number; max: number };

export function limiteleTbi(raw: unknown): LimiteTbi | null {
  if (!tbiGata(raw)) return null;
  const c = citesteConfigTbi(raw);
  return { min: c.suma_minima, max: c.suma_maxima };
}

/** Ce primeste pagina produsului: limitele si forma aleasa. Nimic secret. */
export type BannerTbiProdus = LimiteTbi & { forma: Exclude<FormaBannerTbi, "ascuns"> };

/**
 * Mesajul de pe pagina produsului: tbi gata SI o forma vizibila aleasa (nu „ascuns").
 *
 * ⚠ DOAR pentru pagina produsului. Formularul de comanda si plasarea citesc `limiteleTbi`: alegerea
 * ascunde sau schimba reclama, nu metoda de plata. Cine ar folosi functia asta la checkout ar scoate
 * plata in rate din comanda tuturor magazinelor care au ales „ascuns".
 */
export function bannerTbiPePaginaProdusului(raw: unknown): BannerTbiProdus | null {
  const limite = limiteleTbi(raw);
  if (!limite) return null;
  const forma = citesteConfigTbi(raw).banner_produs;
  return forma === "ascuns" ? null : { ...limite, forma };
}

/** Totalul intra in limitele magazinului? Comparat in bani, ca 299,995 sa nu treaca drept 300. */
export function sumaInLimite(limite: LimiteTbi, total: number): boolean {
  const t = Math.round(Number(total) * 100);
  if (!Number.isFinite(t) || t <= 0) return false;
  return t >= Math.round(limite.min * 100) && t <= Math.round(limite.max * 100);
}

const lei = (n: number) =>
  new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n) + " lei";

/**
 * Textul care spune clientului intre ce sume se poate plati in rate. Fara diacritice: se
 * citeste in VITRINA (formularul de comanda si raspunsul serverului la el).
 */
export function mesajLimiteTbi(limite: LimiteTbi): string {
  return `Plata in rate prin tbi bank este disponibila pentru comenzi intre ${lei(limite.min)} si ${lei(limite.max)}.`;
}

/**
 * Refuzul comenzii pe suma, la plasare. `null` = nu e treaba TBI sau suma e buna.
 *
 * ⚠ SE ROSTESTE INAINTEA ORICAREI SCRIERI. Fara el, browserul putea plasa o comanda „tbi" in
 * afara limitelor: comanda se scria, cuponul si stocul se revendicau, iar abia `/api/tbi/start`
 * refuza, lasand in urma o comanda neplatibila. Formularul ascunde deja metoda in afara
 * limitelor; asta e paza de pe server, pentru cererile care nu trec prin formular.
 */
export function refuzulSumeiTbi(metoda: string | null | undefined, raw: unknown, total: number): string | null {
  if (metoda !== "tbi") return null;
  const limite = limiteleTbi(raw);
  if (!limite) return "Plata in rate prin tbi bank nu mai este disponibila la acest magazin. Reincarca pagina si alege alta metoda.";
  if (!sumaInLimite(limite, total)) return `${mesajLimiteTbi(limite)} Alege alta metoda de plata.`;
  return null;
}
