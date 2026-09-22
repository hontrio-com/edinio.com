import { imparteEconomiaCompanionilor, type LinieDeSet } from "./fbt-pricing";
import type { PortileOfertei } from "./porti";
import { parseAmplasare, type AmplasareSet } from "./amplasare";
// Shared (non-"use server") types + parsing for the Offers hub.
//
// An "offer" is one row in the `offers` table with four layers:
//   TYPE     — what kind of offer it is (see OfferType)
//   TRIGGER  — which products/categories activate it (where it shows up)
//   CONFIG   — type-specific settings (offered products, discount, copy)
//   DISPLAY  — surfaces it renders on + style
//
// Bundles are NOT modelled here — they stay as products (products.is_bundle); the
// hub only surfaces them. Everything is parsed defensively from jsonb (like
// store-sections.ts) so a malformed row can never crash the storefront.

/* ─── Type union ──────────────────────────────────────────────────────────── */

export type OfferType =
  | "frequently_bought" // FBT: anchor product + companions, combined discount (PDP)
  | "cross_sell"        // "Merge bine cu": recommended products (PDP + cart)
  | "order_bump"        // single discounted product added at checkout
  | "upgrade"           // „treci la varianta mai buna": alt produs, la pret de schimb
  | "post_purchase"     // 1-click add on the confirmation page — Faza 2
  | "volume"            // buy X units, get %/amount off — Faza 3
  | "bogo"              // „cumperi X, primesti Y"
  | "gift"              // cadou la comanda, cand trec portile
  | "spend_reward";     // spend & save ladder — Faza 3

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OFERTELE CARE SE ACCEPTĂ ÎN FORMULARUL DE COMANDĂ             (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Patru tipuri, o singură mecanică: cumpărătorul bifează, browserul trimite
 * produsul ca LINIE (`additional_items`) plus id-ul ofertei, iar serverul
 * re-judecă totul și rescrie prețul liniei. Nimic din ce spune browserul despre
 * bani nu se crede.
 *
 * ⚠⚠ DE CE TOATE PATRU AICI, ȘI NU PE PAGINA DE PRODUS. O ofertă nu poate
 * ieftini decât o LINIE de comandă. Produsul din formularul de comandă directă
 * („Cumpără acum") NU e linie: prețul lui se socotește separat, înainte, iar
 * `offer_discount_amount` doar consemnează. Deci o ofertă care ar vrea să
 * schimbe prețul produsului de pe pagină n-are unde să scrie. Măsurat citind
 * `placeOrder`: subtotalul liniei principale se face la rândul 1519, iar
 * ofertele ating numai `cartItems`.
 *
 * ⚠ Coșul, în schimb, e numai linii — de-aia toate patru lucrează acolo.
 */
export const TIPURI_DIN_FORMULAR: OfferType[] = ["order_bump", "upgrade", "bogo", "gift"];

/** Se acceptă bifând în formularul de comandă? */
export function seAcceptaInFormular(type: OfferType): boolean {
  return TIPURI_DIN_FORMULAR.includes(type);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CE ȘTIE PROGRAMUL DESPRE FIECARE TIP DE OFERTĂ                (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ ERAU PATRU LISTE, ȘI UNA DINTRE ELE NU ERA CITITĂ DE NIMENI.
 *
 * `OFFER_TYPES` (8), `PHASE1_OFFER_TYPES` (3), `OFFER_TYPES_IMPLEMENTATE` (4, cu
 * ZERO cititori, verificat cu grep) și `PHASE1` scrisă a patra oară înăuntrul
 * lui `OfferForm.tsx`, cu etichete și descrieri. Plus `TYPE_LABEL` din ecranul
 * de listă, a cincea. Un tip nou trebuia adăugat în toate cinci, și nimic n-ar
 * fi spus care a rămas în urmă.
 *
 * Acum e un singur tabel, iar listele se DERIVĂ din el.
 *
 * ⚠ Iconițele NU stau aici, dinadins: ar fi adus `lucide-react` într-un fișier
 * pe care îl încarcă și serverul, la fiecare rezolvare de ofertă din vitrină.
 * Ele sunt în panou, și o probă cere ca tabelul lor de iconițe să aibă exact
 * aceleași chei ca ăsta.
 */
export interface DespreTipulOfertei {
  /** Cum îi spune comerciantului. */
  eticheta: string;
  /** Ce face, într-un rând, în fereastra de alegere a tipului. */
  explicatie: string;
  /** Cum se cheamă produsele pe care le OFERĂ. Gol la tipurile care nu oferă. */
  numeleProduselorOferite: string;
  /** Se poate face azi din formular? */
  sePoateFace: boolean;
  /** Se rezolvă în vitrină (`loadActiveOffers` îl aduce)? */
  seVedeInVitrina: boolean;
  /** Are reducere proprie, sau e doar o recomandare? */
  areReducere: boolean;
  reducereImplicita: OfferDiscountMode;
  /** Oferă UN singur produs (bump). */
  unProdus?: boolean;
  /** Poate alege singur produse din aceeași categorie. */
  automatDinCategorie?: boolean;
  /** Nu oferă produse, ci ieftinește ce e deja în coș, pe trepte de cantitate. */
  cuPraguri?: boolean;
  /** Setul lui se poate aseza si in coloana de cumparare, langa pret. */
  sePoateAsezaLangaPret?: boolean;
  /** Se poate cere o CANTITATE pentru fiecare produs din set. */
  cuCantitatiPeProdus?: boolean;
  /** Oferta SCHIMBA produsul din cos cu cel oferit (upgrade). */
  cuSchimb?: boolean;
  /** „Cumperi X bucati, primesti Y bucati" — cele doua numere ale lui BOGO. */
  cuBucatiXY?: boolean;
  /** Cumparatorul poate ALEGE cadoul dintre mai multe produse. */
  cuCadouLaAlegere?: boolean;
  /**
   * Beneficiul poate fi „Gratuit".
   *
   * ⚠ NU e un mod de reducere nou: „gratuit" se scrie ca `fixed_price` cu zero.
   * Un al cincilea mod ar fi cerut un rand nou in `VALID_DISCOUNT_MODES`, in
   * `modBundle` si in fiecare loc care ramifica pe mod — pentru o valoare pe
   * care cele patru de acum o exprima deja exact.
   */
  cuGratuit?: boolean;
}

export const DESPRE_TIPUL_OFERTEI: Record<OfferType, DespreTipulOfertei> = {
  frequently_bought: {
    eticheta: "Cumpărate împreună",
    explicatie: "Produsul de pe pagină + altele care merg cu el, la un preț combinat (stil Amazon).",
    numeleProduselorOferite: "Produse în set (pe lângă cel de pe pagină)",
    sePoateFace: true, seVedeInVitrina: true,
    areReducere: true, reducereImplicita: "percent", sePoateAsezaLangaPret: true,
    cuCantitatiPeProdus: true,
  },
  cross_sell: {
    eticheta: "Recomandări",
    explicatie: "Sugerează produse pe pagina produsului și în coș. Recomandare, fără reducere.",
    numeleProduselorOferite: "Produse recomandate",
    sePoateFace: true, seVedeInVitrina: true,
    areReducere: false, reducereImplicita: "none", automatDinCategorie: true,
  },
  order_bump: {
    eticheta: "Ofertă la checkout",
    explicatie: "Un produs la preț special, adăugat cu o bifă în formularul de comandă.",
    numeleProduselorOferite: "Produsul oferit",
    sePoateFace: true, seVedeInVitrina: true,
    areReducere: true, reducereImplicita: "percent", unProdus: true,
  },
  upgrade: {
    eticheta: "Upgrade produs",
    explicatie: "„Treci la varianta de 100 ml pentru +30 lei.” Produsul mare intră în locul celui din coș.",
    numeleProduselorOferite: "Produsul în schimb",
    sePoateFace: true, seVedeInVitrina: true,
    areReducere: true, reducereImplicita: "fixed_price", unProdus: true, cuSchimb: true,
  },
  volume: {
    eticheta: "Reducere cantitate",
    explicatie: "De la o cantitate în sus, prețul scade cu un procent. Se vede ca tabel pe pagina produsului.",
    numeleProduselorOferite: "",
    /*
      ⚠ SE POATE FACE, DAR NU SE „VEDE ÎN VITRINĂ" în înțelesul de aici: nu se
      randează nimic la afișare, ci se scriu praguri pe produse
      (`duPraguriLaProduse`). De-aia cele două steaguri sunt deosebite — erau
      două liste tocmai din pricina asta.
    */
    sePoateFace: true, seVedeInVitrina: false,
    areReducere: false, reducereImplicita: "none", cuPraguri: true,
  },
  post_purchase: {
    eticheta: "După cumpărare",
    explicatie: "Un produs oferit pe pagina de confirmare, adăugat cu o apăsare. Încă nefăcut.",
    numeleProduselorOferite: "Produsul oferit",
    sePoateFace: false, seVedeInVitrina: false,
    areReducere: true, reducereImplicita: "percent", unProdus: true,
  },
  bogo: {
    eticheta: "Cumperi X, primești Y",
    explicatie: "„Cumperi 2, primești 1 gratis.” Se numără bucățile din coș, iar produsul primit intră cu o bifă.",
    numeleProduselorOferite: "Produsul primit",
    sePoateFace: true, seVedeInVitrina: true,
    areReducere: true, reducereImplicita: "fixed_price", unProdus: true,
    cuBucatiXY: true, cuGratuit: true,
  },
  gift: {
    eticheta: "Cadou la comandă",
    explicatie: "Peste o valoare a coșului, sau dintr-o categorie, un produs intră drept cadou.",
    numeleProduselorOferite: "Cadoul (sau cadourile dintre care alege)",
    sePoateFace: true, seVedeInVitrina: true,
    areReducere: true, reducereImplicita: "fixed_price",
    cuCadouLaAlegere: true, cuGratuit: true,
  },
  spend_reward: {
    eticheta: "Cheltuie și economisește",
    explicatie: "Trepte de reducere după cât e coșul. Încă nefăcut.",
    numeleProduselorOferite: "",
    sePoateFace: false, seVedeInVitrina: false,
    areReducere: false, reducereImplicita: "none",
  },
};

/** Toate tipurile din schemă, în ordinea din tabel. */
export const OFFER_TYPES = Object.keys(DESPRE_TIPUL_OFERTEI) as OfferType[];

/**
 * Tipurile pe care `loadActiveOffers` le aduce din bază pentru vitrină.
 *
 * ⚠ NU cuprinde `volume`: acela nu se rezolvă la afișare, ci scrie praguri pe
 * produse. Adus aici, ar fi fost cerut pe fiecare pagină de produs degeaba.
 */
export const PHASE1_OFFER_TYPES: OfferType[] = OFFER_TYPES.filter((t) => DESPRE_TIPUL_OFERTEI[t].seVedeInVitrina);

/** Tipurile pe care comerciantul chiar le poate face azi din formular. */
export const TIPURI_CARE_SE_POT_FACE: OfferType[] = OFFER_TYPES.filter((t) => DESPRE_TIPUL_OFERTEI[t].sePoateFace);

export function isOfferType(v: unknown): v is OfferType {
  return typeof v === "string" && (OFFER_TYPES as string[]).includes(v);
}

/* ─── Trigger (where the offer activates) ─────────────────────────────────── */

export type OfferScope = "products" | "categories" | "all";

/**
 * De unde se aleg produsele unei recomandari.
 *
 * ⚠ `categorie_noi` e purtarea care exista de mult sub numele `autoByCategory`:
 * `fetchCategoryProducts` sorteaza `created_at desc`. Numele ii spune acum pe
 * fata ce face, ca sa se poata pune langa el o a doua metoda.
 */
export const METODE_RECOMANDARE = ["manual", "categorie_noi", "categorie_vandute"] as const;
export type MetodaRecomandare = (typeof METODE_RECOMANDARE)[number];

export const DESPRE_METODA: Record<MetodaRecomandare, { eticheta: string; explicatie: string }> = {
  manual: {
    eticheta: "Produsele alese de mine",
    explicatie: "Alegi tu lista, in ordinea in care vrei sa se vada.",
  },
  categorie_noi: {
    eticheta: "Cele mai noi din categorie",
    explicatie: "Se aleg singure, cele mai recent adaugate din categoria pe care ai ales-o. Bun cand adaugi des produse.",
  },
  categorie_vandute: {
    eticheta: "Cele mai vandute din categorie",
    explicatie: "Se aleg singure, dupa cate bucati s-au vandut in ultimele 90 de zile. ⚠ Intr-un magazin fara vanzari inca, cade inapoi pe cele mai noi, ca raftul sa nu ramana gol.",
  },
};

/**
 * Porțile ofertei: „se arată DOAR dacă…”. Regula care le judecă stă în
 * `lib/offers/porti.ts`, într-un singur loc, fiindcă o întreabă și afișarea, și
 * plasarea comenzii.
 *
 * ⚠⚠ CELE TREI NUME VECHI SE PĂSTREAZĂ, deși sunt englezești și restul
 * vocabularului nou e românesc. Erau deja în schemă și deja parsate aici (scrise
 * pentru „Faza 3”, cu ZERO cititori), iar redenumite, un rând care le-ar fi avut
 * pus de mână ar fi rămas cu porți pe care nimeni nu le mai citește. Măsurat pe
 * producție la 22.09.2026: zero din 13 oferte au `conditions`, deci nimeni nu
 * pățește nimic — dar regula „nu orfaniza o formă care e deja în bază” rămâne.
 *
 * ⚠ `excludedProductIds` e singurul nume nou, scris la fel ca perechea lui.
 */
export type OfferConditions = PortileOfertei;

export interface OfferTrigger {
  scope: OfferScope;
  /** scope === "products": the anchor product ids that show this offer. */
  productIds: string[];
  /** scope === "categories": category names (match products.category). */
  categories: string[];
  conditions?: OfferConditions;
}

/* ─── Config (type-specific) ──────────────────────────────────────────────── */

export type OfferDiscountMode = "none" | "percent" | "amount" | "fixed_price";

export interface OfferConfig {
  /** Products offered/recommended (cross_sell / FBT companions / bump / post-purchase). */
  productIds: string[];
  /** cross_sell: auto-pick from the anchor's category instead of a manual list. */
  autoByCategory: boolean;
  /** Max products shown (clamped 1..OFFER_MAX_PRODUCTS). */
  maxProducts: number;
  /** How the discount is expressed. "none" = pure recommendation (cross_sell default). */
  discountMode: OfferDiscountMode;
  discountPercent?: number;   // discountMode === "percent"
  discountAmount?: number;    // discountMode === "amount"
  fixedPrice?: number;        // discountMode === "fixed_price" (FBT: total for the set)
  /** Optional copy overrides — fall back to per-type Romanian defaults. */
  title?: string;
  buttonLabel?: string;
  /**
   * `volume`: pragurile de cantitate. „De la 5 bucati, -3%."
   *
   * ⚠ NU SE CITESC LA AFISARE, ci se SCRIU pe produsele care se potrivesc, in
   * `products.page_sections.quantity_tiers`. Configuratia bruta a treptelor e
   * citita din 8 locuri de pe calea pretului (intre care poarta comenzii);
   * regula „oferta bate produsul?" scrisa in 8 copii s-ar fi departat de ea
   * insasi la prima retusare. Asa, fiecare loc citeste tot un singur camp, iar
   * oferta e doar cine l-a scris. Vezi `aplicaPraguriCantitate`.
   */
  praguri?: { min_qty: number; percent: number }[];
  /**
   * `frequently_bought`: cate bucati din fiecare produs intra in set.
   *
   * ⚠⚠ LIPSA CAMPULUI, SAU LIPSA UNEI CHEI, INSEAMNA O BUCATA. Asa cele 13
   * oferte de pe productie — intre care singurul set, cu un companion — dau
   * exact aceleasi preturi ca pana azi, la banut.
   *
   * ⚠ Se citeste NUMAI prin `cantitateaCeruta`, care intreaba intai TIPUL:
   * `parseOfferConfig` nu primeste tipul, deci o cheie ratacita pe un
   * `cross_sell` ar fi altfel citita si ar schimba un pret care n-are set.
   */
  cantitati?: Record<string, number>;
  /**
   * `cross_sell`: DE UNDE se aleg produsele recomandate.
   *
   * ⚠⚠ LIPSA CAMPULUI SE DERIVA DIN `autoByCategory`, care exista de mult:
   * fals inseamna `manual`, adevarat inseamna `categorie_noi`. Asa cele cinci
   * recomandari de pe productie (toate cu `autoByCategory: false`) se poarta
   * litera cu litera la fel. Vezi `metodaRecomandarii`.
   *
   * ⚠ Si la SCRIERE se tin amandoua in pas (`autoByCategory` se pune din
   * metoda): orice cod care inca il citeste pe cel vechi primeste acelasi
   * raspuns. Scris numai unul, o cale ramasa in urma ar fi ales alt bazin.
   */
  metodaRecomandare?: MetodaRecomandare;
  /**
   * Nu arata produsele fara stoc.
   *
   * ⚠⚠ LIPSA LUI INSEAMNA PURTAREA DE AZI, care e DEOSEBITA pe cele doua
   * suprafete: pe pagina de produs recomandarea epuizata SE ARATA, cu eticheta
   * „Epuizat" si butonul stins; in cos se ARUNCA. Uniformizata in tacere, una
   * din cele doua s-ar fi schimbat pentru toate cele cinci recomandari care
   * ruleaza. Bifa il lasa pe comerciant sa aleaga, si scrie pe ecran ce face.
   */
  excludeFaraStoc?: boolean;
  /**
   * `upgrade`: produsul de pe care se face schimbul IESE din comandă.
   *
   * ⚠⚠ SE SCRIE MEREU, și `true`, și `false`, spre deosebire de celelalte
   * steaguri de aici. Regula „scrie doar ce nu e implicit” apără rândurile care
   * EXISTĂ DEJA în bază, ca ele să nu capete un câmp la prima salvare. `upgrade`
   * e un tip nou: n-are niciun rând vechi de apărat, iar o ofertă de schimb în
   * care nu se vede din jsonb dacă schimbă sau adaugă e o ofertă pe care nu o
   * poți citi din bază fără să știi implicita pe de rost.
   */
  inlocuieste?: boolean;
  /**
   * `bogo`: câte bucăți trebuie să fie în coș din produsele declanșatoare.
   *
   * ⚠ Se numără DOAR produsele pe care se aprinde oferta, și fără produsul
   * primit — vezi `bucatileDeclansatorului`. Numărat pe tot coșul, un „cumperi
   * 2” s-ar fi împlinit din chiar bucata dăruită, la un declanșator „toate
   * produsele”.
   */
  cumperiBucati?: number;
  /** `bogo`: câte bucăți din produsul oferit intră la beneficiu. */
  primestiBucati?: number;
  /**
   * `gift`: cumpărătorul ALEGE cadoul dintre produsele din listă.
   *
   * ⚠ Nebifat, cadoul e primul produs care se poate lua — exact ca la bump.
   * Bifat, se arată toate, iar serverul acceptă oricare UNUL dintre ele. De-aia
   * reconstituirea are o ramură proprie: regula bump-ului („primul care se poate
   * lua”) ar fi refuzat în tăcere orice cadou în afară de primul.
   */
  cadouLaAlegere?: boolean;
}

/* ─── Display (surfaces + style) ──────────────────────────────────────────── */

export type OfferSurface = "product_page" | "cart" | "checkout" | "confirmation";

export interface OfferDisplay {
  surfaces: OfferSurface[];
  style: "card" | "list" | "inline";
  /** Unde se vede setul in pagina de produs. Vezi `lib/offers/amplasare.ts`. */
  amplasare: AmplasareSet;
}

/* ─── Limits + per-type defaults ──────────────────────────────────────────── */

export const OFFER_MAX_PRODUCTS = 12;
export const OFFER_DEFAULT_MAX_PRODUCTS = 4;
/**
 * Cate bucati poate cere un set dintr-un singur produs.
 *
 * ⚠ Plafon impotriva unei greseli de tastare, nu o regula de vanzare: „200"
 * scris in loc de „2" ar fi cerut doua sute de bucati din stoc si ar fi facut
 * setul necumparabil, fara ca nimic sa spuna de ce.
 */
export const OFFER_MAX_CANTITATE = 20;

// Default surfaces per type — where each offer naturally belongs. The merchant can
// override in `display.surfaces`, but these keep zero-config offers sensible.
export function defaultSurfacesFor(type: OfferType): OfferSurface[] {
  switch (type) {
    case "frequently_bought": return ["product_page"];
    case "cross_sell":        return ["product_page", "cart"];
    case "order_bump":        return ["checkout"];
    /*
      ⚠ Toate trei se bifează în formularul de comandă, deci suprafața lor e
      „checkout" — nu „cart". Vezi `TIPURI_DIN_FORMULAR`: o ofertă nu poate
      ieftini decât o linie, iar liniile se văd abia în formular.
    */
    case "upgrade":           return ["checkout"];
    case "bogo":              return ["checkout"];
    case "gift":              return ["checkout"];
    case "post_purchase":     return ["confirmation"];
    default:                  return ["cart"]; // rules apply at cart level
  }
}

// Default Romanian title per type (used when config.title is empty).
export function defaultTitleFor(type: OfferType): string {
  switch (type) {
    case "frequently_bought": return "Cumparate frecvent impreuna";
    case "cross_sell":        return "Merge bine cu";
    case "order_bump":        return "Adauga la comanda";
    case "upgrade":           return "Treci la varianta mai buna";
    case "bogo":              return "Cumperi si primesti";
    case "post_purchase":     return "Completeaza comanda";
    case "gift":              return "Cadou pentru tine";
    default:                  return "Oferta speciala";
  }
}

/* ─── Parsing / sanitizing (jsonb -> safe typed values) ───────────────────── */

const VALID_SCOPES: OfferScope[] = ["products", "categories", "all"];
const VALID_DISCOUNT_MODES: OfferDiscountMode[] = ["none", "percent", "amount", "fixed_price"];
const VALID_SURFACES: OfferSurface[] = ["product_page", "cart", "checkout", "confirmation"];
const VALID_STYLES: OfferDisplay["style"][] = ["card", "list", "inline"];

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

export function parseOfferTrigger(raw: unknown): OfferTrigger {
  const r = (raw ?? {}) as Record<string, unknown>;
  const scope = VALID_SCOPES.includes(r.scope as OfferScope) ? (r.scope as OfferScope) : "products";
  const trigger: OfferTrigger = {
    scope,
    productIds: toStringArray(r.productIds),
    categories: toStringArray(r.categories),
  };
  const c = r.conditions as Record<string, unknown> | undefined;
  if (c && typeof c === "object") {
    const conditions: OfferConditions = {};
    if (Number.isFinite(Number(c.minQty))) conditions.minQty = Math.max(1, Math.floor(Number(c.minQty)));
    if (Number.isFinite(Number(c.minValue))) conditions.minValue = Math.max(0, Number(c.minValue));
    const req = toStringArray(c.requiredProductIds);
    if (req.length) conditions.requiredProductIds = req;
    const excl = toStringArray(c.excludedProductIds);
    if (excl.length) conditions.excludedProductIds = excl;
    if (Object.keys(conditions).length) trigger.conditions = conditions;
  }
  return trigger;
}

export function parseOfferConfig(raw: unknown): OfferConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const discountMode = VALID_DISCOUNT_MODES.includes(r.discountMode as OfferDiscountMode)
    ? (r.discountMode as OfferDiscountMode)
    : "none";
  const cfg: OfferConfig = {
    productIds: toStringArray(r.productIds),
    autoByCategory: r.autoByCategory === true,
    maxProducts: clampNumber(r.maxProducts, 1, OFFER_MAX_PRODUCTS, OFFER_DEFAULT_MAX_PRODUCTS),
    discountMode,
  };
  if (discountMode === "percent") cfg.discountPercent = clampNumber(r.discountPercent, 0, 100, 0);
  if (discountMode === "amount") cfg.discountAmount = Math.max(0, Number(r.discountAmount) || 0);
  if (discountMode === "fixed_price") cfg.fixedPrice = Math.max(0, Number(r.fixedPrice) || 0);
  if (typeof r.title === "string" && r.title.trim()) cfg.title = r.title.trim();
  if (typeof r.buttonLabel === "string" && r.buttonLabel.trim()) cfg.buttonLabel = r.buttonLabel.trim();

  /*
    ⚠ Pragurile se curata aici, la SCRIERE, si se aseaza crescator. Ce n-are
    inteles (sub 2 bucati, procent in afara lui 0-100) se arunca; doua praguri
    cu aceeasi cantitate se reduc la unul, altfel ar fi hotarat ordinea din
    tablou cat reducere primeste clientul.
  */
  if (Array.isArray(r.praguri)) {
    const vazute = new Set<number>();
    const praguri = (r.praguri as unknown[])
      .map((x) => {
        const o = (x ?? {}) as Record<string, unknown>;
        return { min_qty: Math.floor(Number(o.min_qty) || 0), percent: Number(o.percent) || 0 };
      })
      .filter((x) => x.min_qty >= 2 && x.percent > 0 && x.percent < 100)
      .filter((x) => (vazute.has(x.min_qty) ? false : (vazute.add(x.min_qty), true)))
      .sort((a, b) => a.min_qty - b.min_qty);
    if (praguri.length > 0) cfg.praguri = praguri;
  }

  /*
    ⚠⚠ SE SCRIE DOAR CE E MAI MARE DECAT UNU. Un set in care toate produsele
    intra cu o bucata produce un jsonb IDENTIC cu cel de azi — nicio oferta
    existenta nu capata un camp la prima salvare, si nicio comparatie de randuri
    nu se schimba.

    ⚠ Si numai pentru produsele care chiar sunt in `productIds`: o cheie ramasa
    de la un produs scos din set ar fi carat mai departe o cantitate pe care
    n-o mai cere nimeni.
  */
  if (typeof r.metodaRecomandare === "string"
      && (METODE_RECOMANDARE as readonly string[]).includes(r.metodaRecomandare)) {
    cfg.metodaRecomandare = r.metodaRecomandare as MetodaRecomandare;
  }
  /* ⚠ Se scrie doar cand e ADEVARAT: `false` ar fi un camp in plus pe fiecare
     rand, care nu spune nimic peste lipsa lui. */
  if (r.excludeFaraStoc === true) cfg.excludeFaraStoc = true;
  if (r.cadouLaAlegere === true) cfg.cadouLaAlegere = true;

  /*
    ⚠⚠ SE SCRIE DOAR REFUZUL, si lipsa campului inseamna DA.

    Era cat pe ce sa-l scriu mereu, „ca sa se vada din jsonb". Ar fi pus un camp
    nou pe TOATE ofertele magazinelor la prima lor salvare — inclusiv pe cele 13
    de pe productie, care n-au nimic de-a face cu schimbul. Aceeasi regula ca la
    cantitati: un rand care nu cere nimic deosebit produce jsonb-ul de ieri.

    ⚠ Se parseaza pentru ORICE tip, fiindca `parseOfferConfig` nu primeste tipul.
    Cititorul intreaba intai tipul — vezi `inlocuiesteProdusul`.
  */
  if (r.inlocuieste === false) cfg.inlocuieste = false;

  /*
    ⚠ Cele doua numere ale lui BOGO. Se scriu doar cand sunt CERUTE si trec de
    unu-si-unu: un „cumperi 1, primesti 1" e un bump cu alt nume, iar campurile
    scrise degeaba ar fi aparut pe randurile tuturor celorlalte tipuri.
  */
  const cumperi = Math.floor(Number(r.cumperiBucati));
  if (Number.isFinite(cumperi) && cumperi > 0) cfg.cumperiBucati = Math.min(cumperi, OFFER_MAX_CANTITATE);
  const primesti = Math.floor(Number(r.primestiBucati));
  if (Number.isFinite(primesti) && primesti > 0) cfg.primestiBucati = Math.min(primesti, OFFER_MAX_CANTITATE);

  if (r.cantitati && typeof r.cantitati === "object" && !Array.isArray(r.cantitati)) {
    const brute = r.cantitati as Record<string, unknown>;
    const cantitati: Record<string, number> = {};
    for (const id of cfg.productIds) {
      const n = Math.floor(Number(brute[id]));
      if (Number.isFinite(n) && n > 1) cantitati[id] = Math.min(n, OFFER_MAX_CANTITATE);
    }
    if (Object.keys(cantitati).length > 0) cfg.cantitati = cantitati;
  }
  return cfg;
}

/**
 * Cate bucati cere setul din produsul asta.
 *
 * ⚠⚠ SINGURUL DRUM catre `config.cantitati`, si intreaba INTAI tipul.
 * `parseOfferConfig` nu primeste tipul, deci o cheie ratacita pe un
 * `cross_sell` sau pe un `order_bump` ar fi fost altfel citita — iar acolo
 * „doua bucati" n-are niciun inteles si ar fi schimbat un pret.
 *
 * ⚠ Intoarce MEREU cel putin 1: o cantitate zero ar fi scos produsul din set
 * fara sa-l scoata din lista, deci pretul si continutul s-ar fi despartit.
 */
/**
 * Metoda unei recomandari, derivata cand campul lipseste.
 *
 * ⚠⚠ SINGURUL DRUM catre `config.metodaRecomandare`, ca derivarea sa fie scrisa
 * o singura data. Un rand vechi n-are campul, dar are `autoByCategory` — si
 * exact acelasi bazin trebuie sa iasa si maine.
 */
export function metodaRecomandarii(config: OfferConfig): MetodaRecomandare {
  const m = config.metodaRecomandare;
  if (m && (METODE_RECOMANDARE as readonly string[]).includes(m)) return m;
  return config.autoByCategory ? "categorie_noi" : "manual";
}

export function cantitateaCeruta(type: OfferType, config: OfferConfig, productId: string): number {
  if (!DESPRE_TIPUL_OFERTEI[type]?.cuCantitatiPeProdus) return 1;
  const n = config.cantitati?.[productId];
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(1, Math.floor(n as number)), OFFER_MAX_CANTITATE);
}

/**
 * Oferta SCOATE din comandă produsul de pe care se face schimbul?
 *
 * ⚠⚠ SINGURUL DRUM către `config.inlocuieste`, și întreabă ÎNTÂI tipul, exact
 * ca `cantitateaCeruta`. Fără poarta pe tip, un `inlocuieste: false` rătăcit pe
 * un `order_bump` ar fi fost citit, iar acolo n-are niciun înțeles.
 *
 * ⚠ Lipsa câmpului înseamnă DA: un „upgrade" care adaugă în loc să schimbe e
 * chiar un bump, și nimeni nu alege tipul ăsta pentru asta.
 */
export function inlocuiesteProdusul(type: OfferType, config: OfferConfig): boolean {
  if (!DESPRE_TIPUL_OFERTEI[type]?.cuSchimb) return false;
  return config.inlocuieste !== false;
}

/**
 * Câte bucăți din produsul oferit intră în comandă.
 *
 * ⚠ Unu peste tot, în afară de BOGO: bump-ul, upgrade-ul și cadoul dau o
 * singură bucată. Vezi `aplicaOfertaPeLinii`, unde numărul ăsta ajunge în
 * `aplicaPretPeBucati`.
 */
export function bucatiDeOferit(type: OfferType, config: OfferConfig): number {
  if (!DESPRE_TIPUL_OFERTEI[type]?.cuBucatiXY) return 1;
  const n = Math.floor(Number(config.primestiBucati));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, OFFER_MAX_CANTITATE);
}

/**
 * Câte bucăți din produsele declanșatoare cere oferta. Zero = nu cere nimic.
 *
 * ⚠ Zero, nu unu, la tipurile fără X: „cel puțin o bucată" ar fi o verificare în
 * plus pe un drum pe care declanșatorul a răspuns deja la aceeași întrebare.
 */
export function bucatiDeCumparat(type: OfferType, config: OfferConfig): number {
  if (!DESPRE_TIPUL_OFERTEI[type]?.cuBucatiXY) return 0;
  const n = Math.floor(Number(config.cumperiBucati));
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.min(n, OFFER_MAX_CANTITATE);
}

/** Cumpărătorul alege cadoul dintre mai multe produse? */
export function cadoulSeAlege(type: OfferType, config: OfferConfig): boolean {
  if (!DESPRE_TIPUL_OFERTEI[type]?.cuCadouLaAlegere) return false;
  return config.cadouLaAlegere === true;
}

export function parseOfferDisplay(raw: unknown, type: OfferType): OfferDisplay {
  const r = (raw ?? {}) as Record<string, unknown>;
  const surfaces = Array.isArray(r.surfaces)
    ? (r.surfaces as unknown[]).filter((s): s is OfferSurface => VALID_SURFACES.includes(s as OfferSurface))
    : [];
  const style = VALID_STYLES.includes(r.style as OfferDisplay["style"]) ? (r.style as OfferDisplay["style"]) : "card";
  return {
    surfaces: surfaces.length ? surfaces : defaultSurfacesFor(type),
    style,
    /*
      Puterea se da ca boolean, nu se cauta in tabel inauntrul lui
      `parseAmplasare`: o scriere de forma `TABEL[type].ceva` ar fi ARUNCAT pe
      un tip nerecunoscut, iar functia asta e chemata pe drumul fiecarei
      incarcari de pagina de produs. `?.` si `?? false` inchid si cazul in
      care tipul nu e in tabel.
    */
    amplasare: parseAmplasare(r.amplasare, DESPRE_TIPUL_OFERTEI[type]?.sePoateAsezaLangaPret ?? false),
  };
}

/* ─── Resolved shapes (what the storefront consumes) ──────────────────────── */

// A product resolved for display inside an offer (authoritative data from the DB).
export interface OfferProduct {
  id: string;
  name: string;
  slug: string | null;
  price: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
  outOfStock: boolean;
  /**
   * Cere o alegere inainte de a putea fi cumparat: are variante SAU cere
   * personalizare. In ambele cazuri cumparatorul e trimis pe pagina produsului,
   * fiindca adaugarea rapida n-are unde sa tina marimea sau textul de gravat.
   *
   * Se numea `hasVariants`, si numele mintea de cand personalizarea a intrat in
   * aceeasi categorie: un produs fara nicio varianta putea avea steagul ridicat.
   */
  needsChoice?: boolean;
  /**
   * Cate bucati intra in set. Se pune DOAR pe produsele unui set
   * `frequently_bought`; la recomandari si la bump ramane absent, deci
   * cardurile si bump-ul nu se schimba deloc. Absent = 1.
   */
  cantitate?: number;
  /**
   * Cate bucati mai sunt. `null` = nelimitat (stocul nu se urmareste).
   *
   * ⚠ Nu e un camp din baza: se socoteste din `track_inventory` si
   * `stock_quantity`, care se citeau deja. Trebuie doar la seturile cu
   * cantitati, ca sa nu se arate un set pe care stocul nu-l poate da.
   */
  stocDisponibil?: number | null;
  /**
   * Prețul pe care îl are produsul ăsta PRIN OFERTĂ, pe bucată.
   *
   * ⚠⚠ EXISTĂ FIINDCĂ UN CADOU LA ALEGERE ARE PREȚURI DEOSEBITE. `pricing` e un
   * singur obiect pe ofertă: bun cât timp oferta arată un produs (bump, upgrade,
   * BOGO), dar la „alege unul dintre trei" cele trei au fiecare prețul lui
   * redus. Ținut tot în `pricing`, ecranul ar fi scris același preț pe toate
   * trei, iar două din trei ar fi mințit.
   *
   * ⚠ E DOAR PENTRU ECRAN. Prețul chiar încasat se socotește din nou pe server,
   * din `config`, la plasarea comenzii (`aplicaOfertaPeLinii`). Absent la
   * tipurile care nu ieftinesc nimic.
   */
  pretOferta?: number;
}

// One offer, resolved with real product data + computed pricing, ready to render.
export interface ResolvedOffer {
  id: string;
  type: OfferType;
  title: string;
  buttonLabel?: string;
  style: OfferDisplay["style"];
  /** Unde se deseneaza setul. Browserul nu vede `display`, vede doar asta. */
  amplasare: AmplasareSet;
  products: OfferProduct[];
  /** Combined pricing for FBT / order_bump (absent for pure cross_sell). */
  pricing?: { price: number; compareAt: number; savings: number };
  /**
   * Regulile pe care le are de desenat formularul de comandă.
   *
   * ⚠ UN SINGUR CÂMP, nu trei: browserul primește `ResolvedOffer` pe o acțiune
   * publică, iar trei câmpuri opționale scrise alături ar fi cerut trei
   * verificări de existență în fiecare din cele două formulare. Absent la toate
   * tipurile de azi, deci nimic nu se schimbă pentru ele.
   */
  reguli?: {
    /** `upgrade`: produsul de schimb îl SCOATE pe cel din coș. */
    inlocuieste?: boolean;
    /** `bogo`: câte bucăți trebuie cumpărate. */
    cumperi?: number;
    /** `bogo`: câte bucăți se primesc. */
    primesti?: number;
    /** `gift`: cumpărătorul alege unul dintre produsele din listă. */
    laAlegere?: boolean;
    /**
     * `upgrade`: produsele din coș pe care oferta le poate schimba.
     *
     * ⚠ Le socotește SERVERUL, din declanșator, fiindcă el știe categoriile
     * liniilor din coș. Browserul are doar id-uri și nume, deci ar fi putut
     * numi drept „produsul schimbat" o linie pe care oferta n-o atinge.
     */
    deSchimbat?: string[];
  };
}

/**
 * Distribute an FBT set's savings across the companion prices — client-side mirror of
 * the server's `fbtCompanionPrices`. Shared by the FBT card preview and the buy-together
 * handler, so the card, the checkout modal and the charged total always agree to the ban.
 * The anchor stays at full price; companions never go below 0.
 */
export function distributeFbtSavings(
  companioni: LinieDeSet[],
  savings: number,
  /** Ancora: economia se imparte pe cota companionilor din set, pe VALOARE. */
  anchor: LinieDeSet,
): number[] {
  return imparteEconomiaCompanionilor(anchor, companioni, savings);
}
