/**
 * tbi bank: plata in rate (credit de consum acordat la cumparare), prin API-ul Fusion Pay al tbi.
 *
 * Fisa completa, cu tot ce s-a masurat pe fir si ce ramane ipoteza: `docs/plati/TBI.md`.
 *
 * Modul PUR: nici `node:crypto`, nici baza, nici retea. Il citesc si checkoutul, si actiunile de
 * comanda, si panoul, deci trebuie sa poata fi importat de oriunde, inclusiv din probe.
 *
 * ═══ CE PRIMESTE COMERCIANTUL DE LA TBI ═══
 *
 * Un email cu trei valori (VetDepo, 16.11.2026) si linkul catre documentatia „RO Fusion Pay":
 *
 *   reseller_code    identifica magazinul (ex. `magazin_ro`); pleaca in clar in fiecare cerere;
 *   reseller_key     il valideaza; pleaca tot in clar, langa cod, deci il tinem ca pe o parola;
 *   encryption key   cheia AES cu care se cripteaza cererile si se descifreaza vestile (`cripto.ts`).
 *
 * ⚠ Pana pe 16.11.2026 integrarea vorbea cu API-ul VECHI, „eCommerce" (store_id, utilizator, parola
 * si doua perechi de chei RSA). tbi da comerciantilor noi numai Fusion Pay, iar niciun magazin nu
 * apucase sa-l configureze pe cel vechi, deci a fost inlocuit cu totul, nu tinut alaturi.
 */

export type TbiConfig = {
  enabled: boolean;
  /** Mediul de test (UAT) al tbi, nu cel real. */
  sandbox: boolean;
  /** Codul magazinului la tbi. Nu e secret: omul trebuie sa-l poata reciti in panou. */
  reseller_code: string;
  /** SECRET. Valideaza codul; pleaca langa el in fiecare cerere. */
  reseller_key: string;
  /** SECRET. Cheia AES a magazinului: cripteaza cererile si descifreaza vestile tbi. */
  cheie_criptare: string;
  /** Cel mai mic total de comanda pentru care se ofera plata in rate, in lei. */
  suma_minima: number;
  /** Cel mai mare total de comanda pentru care se ofera plata in rate, in lei. */
  suma_maxima: number;
  /**
   * `category` din fiecare articol: „Product category ID", numar intreg. Documentatia nu publica
   * nicio lista (exemplele lor trimit 7 si 9, id-urile din magazinul lor de proba). Ramane „1" pana
   * cand tbi ii spune comerciantului altceva.
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
 * Limitele implicite: 100 - 65.000 lei, cele din documentatia Fusion Pay („Loan amounts range from
 * 100 to 65 000 LEI"). Fiecare comerciant are insa produsele lui de finantare, cu limitele lor: panoul
 * le citeste de la tbi (`GetCalculations`) si le arata langa campuri.
 */
export const TBI_SUMA_MINIMA_IMPLICITA = 100;
export const TBI_SUMA_MAXIMA_IMPLICITA = 65000;
export const TBI_CATEGORIE_IMPLICITA = "1";

export const TBI_CONFIG_IMPLICITA: TbiConfig = {
  enabled: false,
  sandbox: true,
  reseller_code: "",
  reseller_key: "",
  cheie_criptare: "",
  suma_minima: TBI_SUMA_MINIMA_IMPLICITA,
  suma_maxima: TBI_SUMA_MAXIMA_IMPLICITA,
  categorie: TBI_CATEGORIE_IMPLICITA,
  banner_produs: TBI_BANNER_IMPLICIT,
};

/**
 * Adresele Fusion Pay, din documentatie („API documentation - RO Fusion Pay", citita 16.11.2026).
 *
 * Masurat 16.11.2026: AMBELE raspund public. Testul (`ro.tbi-uat.online`) intoarce produsele de
 * finantare pentru credentialele de test publicate in documentatie, deci tot drumul se poate proba
 * de oriunde, spre deosebire de API-ul vechi, al carui server de test primea doar IP-uri aprobate.
 */
export const TBI_ADRESE = {
  live: "https://ro.tbibank.support/api",
  test: "https://ro.tbi-uat.online/api",
} as const;

export function adresaApiTbi(sandbox: boolean): string {
  return sandbox ? TBI_ADRESE.test : TBI_ADRESE.live;
}

/** `reseller_code`: litere, cifre, `_`, `-`, `.`. Asa arata codurile lor (`TBI_test`, `magazin_ro`). */
export const FORMA_COD_RESELLER = /^[A-Za-z0-9_.-]{2,64}$/;

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
 *
 * ⚠ O configurare a API-ului VECHI (store_id, username, cheile RSA) se citeste ca neconfigurata:
 * campurile ei nu mai inseamna nimic, iar `tbiGata` o vede incompleta.
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
    reseller_code: sir(o.reseller_code).trim(),
    reseller_key: sir(o.reseller_key),
    cheie_criptare: sir(o.cheie_criptare),
    suma_minima: min,
    suma_maxima: max,
    categorie: /^\d{1,9}$/.test(categorie) ? categorie : TBI_CATEGORIE_IMPLICITA,
    /* Lipsa sau necunoscuta = randul discret: numai „ascuns" ales anume il scoate. */
    banner_produs: esteFormaBannerTbi(o.banner_produs) ? o.banner_produs : TBI_BANNER_IMPLICIT,
  };
}

/**
 * Gata de incasat: pornit si cu tot ce trebuie ca o cerere sa plece SI ca vestea sa poata fi
 * descifrata. Fara cheia de criptare, banca n-ar putea citi cererea, iar noi vestile ei.
 *
 * ⚠ Pe clientul comerciantului secretele vin ca `enc.v1.…` (sir NEGOL), deci raspunsul de aici
 * ramane corect si pentru citirile din panou. Vezi `lib/integrari/secrete.ts`.
 */
export function tbiGata(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const c = citesteConfigTbi(raw);
  return !!(c.enabled && c.reseller_code && c.reseller_key.trim() && c.cheie_criptare.trim());
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

/**
 * Un produs de finantare al magazinului, cum il intoarce `GetCalculations`. Pentru panou: omul vede
 * ce i-a pus tbi in contract (perioade, dobanda, sume), fara sa intre in portalul lor.
 */
export type ProdusFinantareTbi = {
  id: number;
  nume: string;
  luni: number;
  /** Dobanda (`nir`), in procente pe an. 0 la BNPL si la campaniile fara dobanda. */
  dobanda: number;
  /** Comisionul de analiza, in lei. */
  comision: number;
  sumaMin: number;
  sumaMax: number;
};

/** Intervalul acoperit de produsele de finantare: cea mai mica suma minima, cea mai mare maxima. */
export function intervalulProduselor(produse: ProdusFinantareTbi[]): LimiteTbi | null {
  const bune = produse.filter((p) => p.sumaMax > 0 && p.sumaMin <= p.sumaMax);
  if (bune.length === 0) return null;
  return {
    min: Math.min(...bune.map((p) => p.sumaMin)),
    max: Math.max(...bune.map((p) => p.sumaMax)),
  };
}
