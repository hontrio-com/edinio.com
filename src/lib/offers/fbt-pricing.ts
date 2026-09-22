import { computeBundlePricing, type BundlePricingMode } from "@/lib/bundles";

/**
 * Pretul companionilor la „Cumpara impreuna".
 *
 * Sta singura in fisierul asta, ca `aplicaBumpPeOBucata`: e aritmetica de bani,
 * n-are nevoie de baza de date, deci poate fi testata direct.
 */

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Cat din configuratia ofertei conteaza pentru pret. */
export interface ConfigReducereSet {
  discountMode: string;
  discountPercent?: number;
  discountAmount?: number;
  fixedPrice?: number;
}

function modBundle(mode: string): BundlePricingMode | null {
  if (mode === "percent") return "discount_percent";
  if (mode === "amount") return "discount_amount";
  if (mode === "fixed_price") return "fixed";
  return null; // "none"
}

/**
 * O linie de set: un pret si cate bucati intra din el.
 *
 * ⚠⚠ ERA UN SIMPLU `number[]`, si asta tinea cat timp orice set insemna „cate o
 * bucata din fiecare". De cand comerciantul poate cere „2 becuri + 1 lustra",
 * fiecare din cele trei socoteli de aici trebuie sa stie CATE.
 *
 * ⚠ `bucati` lipsa inseamna 1, ca apelantii care n-au cantitati sa nu trebuiasca
 * sa scrie `bucati: 1` peste tot — si ca sa iasa, la bit, numerele de ieri.
 */
export interface LinieDeSet {
  pret: number;
  bucati?: number;
}

/** Bucatile unei linii, curatate. Zero si negativ n-au inteles intr-un set. */
function bucatile(l: LinieDeSet): number {
  const n = Math.floor(Number(l.bucati));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Distribuie economia setului pe preturile COMPANIONILOR — ancora ramane la
 * pretul intreg, fiindca ea e produsul comandat din caseta de cumparare.
 * Deterministic, si folosit deopotriva de previzualizarea din magazin si de
 * calculul la comanda, ca cele doua sa nu poata da preturi diferite.
 *
 * Companionii duc doar COTA LOR din economie, nu toata. Pana acum economia se
 * calcula pe TOT setul si se descarca integral pe ei, plafonata doar la valoarea
 * lor: pe o ancora scumpa, procentul din setul intreg trecea de cat fac
 * companionii cu totul, iar plafonul ii ducea la zero. Pe oferta live f2d3c415
 * de la BricoSmart, ancora „Emul solutie umectanta 20L" de 1.244,88 lei facea ca
 * cei patru companioni de 112,99 lei sa plece pe degeaba, desi comerciantul
 * scrisese 10%.
 *
 * Cu cota, „10% pe set" inseamna 10% si pe partea companionilor, oricat de
 * scumpa ar fi ancora. Plafonul la valoarea lor ramane centura de siguranta.
 */
export function fbtCompanionPrices(
  anchor: LinieDeSet,
  companioni: LinieDeSet[],
  config: ConfigReducereSet,
): number[] {
  const pricing = pretulSetului([anchor, ...companioni], config);
  return imparteEconomiaCompanionilor(anchor, companioni, pricing.savings);
}

/**
 * Pretul unui set de produse dupa reducerea ofertei — SINGURUL loc unde se face.
 *
 * Il folosesc deopotriva magazinul, cand aseaza pretul pe card (`resolveProductOffers`,
 * `resolveCartOffers`), si comanda, cand incaseaza (`aplicaOfertaPeLinii`). Un
 * singur produs in `preturi` inseamna un order bump; ancora plus companionii,
 * un set „cumparate frecvent impreuna".
 */
export function pretulSetului(
  preturi: LinieDeSet[],
  config: ConfigReducereSet,
): { price: number; compareAt: number; savings: number } {
  const mode = modBundle(config.discountMode);
  /*
    ⚠ `compareAt` se socotește pe VALOAREA liniei (preț × bucăți), nu pe preț.
    Cu toate cantitățile 1 iese numărul de dinainte, la bit — deci nicio ofertă
    care există azi nu-și schimbă prețul.
  */
  const compareAt = round2(preturi.reduce((s, l) => s + l.pret * bucatile(l), 0));
  if (!mode) return { price: compareAt, compareAt, savings: 0 };
  return computeBundlePricing(
    preturi.map((l) => ({ price: l.pret, quantity: bucatile(l) })),
    mode,
    { fixedPrice: config.fixedPrice, discountPercent: config.discountPercent, discountAmount: config.discountAmount },
  );
}

/**
 * Economia setului, impartita pe companioni — SINGURUL loc unde se face.
 *
 * Formula era scrisa de doua ori: aici, pentru ce se incaseaza, si in
 * `distributeFbtSavings`, pentru ce se afiseaza pe cardul din pagina de produs.
 * Cat timp amandoua descarcau toata economia pe companioni, cele doua copii
 * dadeau acelasi numar si nimeni nu observa ca sunt doua. Prima schimbare de
 * formula le-ar fi despartit, si pe ecran ar fi scris alt pret decat cel incasat.
 */
export function imparteEconomiaCompanionilor(
  anchor: LinieDeSet,
  companioni: LinieDeSet[],
  economiaSetului: number,
): number[] {
  /*
    ⚠⚠ COTELE SE FAC PE VALOAREA LINIEI (preț × bucăți), dar REZULTATUL RĂMÂNE UN
    PREȚ UNITAR. Amândouă contează:

    Pe valoare, fiindcă un companion luat în două bucăți trage de două ori mai
    mult din economia setului decât unul luat într-una — altfel „10% pe set” ar
    fi căzut cu totul pe produsul luat o dată.

    Unitar, fiindcă numărul ăsta se scrie pe LINIA de comandă, iar linia își are
    deja cantitatea ei. Întors ca valoare de linie, s-ar fi înmulțit a doua oară.

    ⚠ Cu toate cantitățile 1, `compTotal`, `setTotal` și `p` ies numere identice
    cu cele de ieri, deci ieșirea e aceeași la bit.
  */
  const valoarea = (l: LinieDeSet) => l.pret * bucatile(l);
  const compTotal = round2(companioni.reduce((s, l) => s + valoarea(l), 0));
  if (compTotal <= 0) return companioni.map((l) => round2(l.pret));
  const setTotal = round2(Math.max(0, valoarea(anchor)) + compTotal);
  const cotaCompanioni = setTotal > 0 ? compTotal / setTotal : 0;
  const savings = Math.min(economiaSetului * cotaCompanioni, compTotal);
  if (savings <= 0) return companioni.map((l) => round2(l.pret));
  /*
    ⚠⚠ EXPRESIA NU SE REscrie în forma algebric echivalentă
    `p * (1 - savings / compTotal)`: cele două diferă la ultimul bit în virgulă
    mobilă, iar pe un preț la limită ar cădea pe alt ban.

    `savings * (valoare / compTotal)` e partea de economie a LINIEI; împărțită
    la bucăți, dă cât scade fiecare bucată.
  */
  return companioni.map((l) => {
    const b = bucatile(l);
    const scadereaLiniei = savings * (valoarea(l) / compTotal);
    return round2(Math.max(0, l.pret - scadereaLiniei / b));
  });
}
