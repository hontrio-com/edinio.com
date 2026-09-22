/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PORȚILE UNEI OFERTE                                           (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * „Oferta se arată DOAR dacă coșul trece de 200 de lei." Patru porți, scrise ca
 * niște propoziții, toate opționale. Niciuna pusă = oferta se arată mereu, adică
 * exact ce fac azi cele 13 oferte de pe producție (măsurat: ZERO au porți).
 *
 * ⚠⚠ REGULA STĂ AICI, ÎNTR-UN SINGUR LOC, fiindcă o întreabă DOUĂ căi:
 *   1. AFIȘAREA  — `resolveCartOffers`: se vede bump-ul în formular?
 *   2. COMANDA   — `refuzaOferta`: are voie prețul redus la plasare?
 * Scrise în două locuri, cele două se despart. Iar când se despart, ori clientul
 * vede un bump pe care serverul îl refuză (și comanda cade fără să înțeleagă de
 * ce), ori ia unul la care n-avea dreptul — și ăla e bani. Am trecut prin exact
 * capcana asta la restrângerea cupoanelor, săptămâna asta.
 *
 * ⚠⚠ CELE DOUĂ CĂI NU AU ACELAȘI COȘ, ȘI ASTA E O HOTĂRÂRE, NU O SCĂPARE.
 *
 * La AFIȘARE, coșul vine din browser: `getCheckoutBumps` primește azi doar
 * id-uri de produs, fără cantități și fără prețuri. Ce trimite browserul NU se
 * crede — dar nici nu trebuie: a ARĂTA o ofertă nu costă niciun ban. Un client
 * care minte vede bump-ul, iar la plasare poarta se pune din nou, pe liniile
 * adevărate, și comanda e refuzată. Nimic nu se pierde.
 *
 * La COMANDĂ, coșul se face din LINIILE comenzii și din prețurile chiar plătite.
 * ⚠ NU din `products.price`: acela e prețul de BAZĂ, iar o variantă aleasă îl
 * schimbă. Măsurat pe producție (vezi `order.actions.ts`): un produs cu 156,80
 * de bază se încasează cu 438,00 când clientul alege mărimea. O poartă socotită
 * pe catalog ar fi greșit cu sute de lei.
 *
 * ⚠⚠ ȘI DE CE CONTEAZĂ CĂ CELE DOUĂ POT SĂ NU SE POTRIVEASCĂ: la plasare, orice
 * refuz în afară de „lipsă din comandă” OPREȘTE TOATĂ COMANDA (vezi
 * `opresteComanda`). Deci un om cinstit, peste prag la afișare și sub prag la
 * comandă, ar rămâne cu comanda refuzată. De-aia poarta de la afișare trebuie să
 * fie LARGĂ, nu strâmtă: ea doar hotărăște ce se arată.
 */

/** Ce poate cere o ofertă de la coș. Tot ce lipsește nu se cere. */
export interface PortileOfertei {
  /** „Coșul trece de X lei.” Subtotalul mărfii, fără transport. */
  minValue?: number;
  /** „În coș sunt cel puțin N bucăți.” */
  minQty?: number;
  /** „În coș se află (măcar unul dintre) produsele astea.” */
  requiredProductIds?: string[];
  /** „În coș NU se află niciunul dintre produsele astea.” */
  excludedProductIds?: string[];
}

/**
 * Coșul, văzut de poartă: cât e din fiecare produs, și cât face.
 *
 * ⚠⚠ PE PRODUS, NU TREI NUMERE ADUNATE, și asta închide o gaură pe care era cât
 * pe ce s-o scriu. La AFIȘARE, produsul pe care îl oferă bump-ul NU e în coș —
 * `resolveCartOffers` îl exclude anume. La COMANDĂ el E deja linie, fiindcă
 * altfel oferta n-ar avea ce revendica (`lipsa_din_comanda`).
 *
 * Deci o cerere măsluită, cu un coș de 150 de lei și un bump de 60, ar fi trecut
 * la plasare o poartă de „peste 200 de lei” — cu chiar produsul pe care poarta
 * trebuia să-l păzească. Cu sumele ținute pe produs, poarta se poate întreba pe
 * coșul FĂRĂ ce aduce oferta, adică exact pe coșul pe care l-a văzut afișarea.
 */
export interface CosulDeJudecat {
  /** Cât e din fiecare produs: bucăți și lei chiar plătiți. */
  perProdus: Map<string, { bucati: number; lei: number }>;
}

/** Cele trei numere ale coșului, fără produsele pe care le aduce chiar oferta. */
export function numereleCosului(
  cos: CosulDeJudecat,
  faraProdusele: readonly string[] = [],
): { produse: Set<string>; bucati: number; lei: number } {
  const fara = new Set(faraProdusele);
  const produse = new Set<string>();
  let bucati = 0;
  let lei = 0;
  for (const [id, x] of cos.perProdus) {
    if (fara.has(id)) continue;
    produse.add(id);
    bucati += x.bucati;
    lei += x.lei;
  }
  return { produse, bucati, lei: Math.round(lei * 100) / 100 };
}

/** De ce n-a trecut poarta. `null` înseamnă că a trecut. */
export type MotivPoarta = "sub_valoare" | "sub_bucati" | "lipseste_produsul" | "are_produs_exclus";

/**
 * Trece coșul de porțile ofertei?
 *
 * ⚠ ORDINEA E CEA A LUCRULUI DE FĂCUT, ca la stări: întâi ce poate schimba
 * cumpărătorul cel mai ușor (mai pune în coș), apoi ce nu poate (scoate ceva).
 *
 * ⚠⚠ TOATE PORȚILE PUSE TREBUIE SĂ TREACĂ. Nu există „măcar una”: patru
 * propoziții legate cu „și” se citesc singure, pe când un SAU ascuns ar face ca
 * o ofertă să apară acolo unde comerciantul credea că a închis-o.
 */
export function deCeNuTrece(
  p: PortileOfertei | undefined | null,
  cosIntreg: CosulDeJudecat,
  /**
   * Produsele pe care le OFERĂ chiar oferta asta. Ies din socoteală, ca poarta
   * să vadă același coș la afișare și la comandă — vezi `CosulDeJudecat`.
   */
  produseleOfertei: readonly string[] = [],
): MotivPoarta | null {
  if (!p) return null;
  const cos = numereleCosului(cosIntreg, produseleOfertei);

  if (p.minValue !== undefined && cos.lei < p.minValue) return "sub_valoare";
  if (p.minQty !== undefined && cos.bucati < p.minQty) return "sub_bucati";

  /*
    ⚠ „MĂCAR UNUL”, nu „toate”. Comerciantul scrie o listă de produse care
    aprind oferta („dacă ia o imprimantă, oferă-i cerneală”), nu o combinație pe
    care cumpărătorul trebuie s-o nimerească toată. Cerută ca „toate”, o listă de
    trei produse n-ar fi căzut aproape niciodată pe nimic.
  */
  if (p.requiredProductIds?.length && !p.requiredProductIds.some((id) => cos.produse.has(id))) {
    return "lipseste_produsul";
  }
  /*
    ⚠ Aici e pe dos, și trebuie să fie: „NU se află niciunul”. Cu „măcar unul
    lipsește”, excluderea n-ar fi oprit nimic de îndată ce lista avea două
    produse.
  */
  if (p.excludedProductIds?.some((id) => cos.produse.has(id))) return "are_produs_exclus";

  return null;
}

/** Trece? Aceeași regulă, întrebată cu da sau nu. */
export function poartaTrece(
  p: PortileOfertei | undefined | null,
  cos: CosulDeJudecat,
  produseleOfertei: readonly string[] = [],
): boolean {
  return deCeNuTrece(p, cos, produseleOfertei) === null;
}

/** Are oferta vreo poartă pusă? Fără, nu se mai socotește niciun coș. */
export function arePorti(p: PortileOfertei | undefined | null): boolean {
  if (!p) return false;
  return (
    p.minValue !== undefined ||
    p.minQty !== undefined ||
    (p.requiredProductIds?.length ?? 0) > 0 ||
    (p.excludedProductIds?.length ?? 0) > 0
  );
}

/**
 * Coșul de judecat, făcut din linii.
 *
 * ⚠ O SINGURĂ FUNCȚIE PENTRU AMÂNDOUĂ CĂILE, ca cele trei numere să însemne
 * același lucru. Apelantul dă prețul unitar CHIAR PLĂTIT — la comandă îl știe
 * din linie, la afișare îl spune browserul și nu se crede pe cuvânt (vezi capul
 * fișierului).
 *
 * ⚠ Cantitățile se rotunjesc în jos și nu pot fi negative: un „-5” trimis de
 * mână ar fi scăzut din numărul de bucăți și ar fi deschis o poartă închisă.
 */
export function cosulDinLinii(
  linii: readonly { productId: string; quantity: number; unitPrice: number }[],
): CosulDeJudecat {
  const perProdus = new Map<string, { bucati: number; lei: number }>();
  for (const l of linii) {
    if (!l.productId) continue;
    const q = Math.max(0, Math.floor(Number(l.quantity) || 0));
    const p = Math.max(0, Number(l.unitPrice) || 0);
    /* ⚠ Se ADUNĂ: același produs poate avea două linii (variante deosebite), iar
       scris cu `set`, a doua ar fi șters-o pe prima din socoteală. */
    const x = perProdus.get(l.productId) ?? { bucati: 0, lei: 0 };
    x.bucati += q;
    x.lei += q * p;
    perProdus.set(l.productId, x);
  }
  return { perProdus };
}

/** Un coș gol. Pentru apelanții care n-au ce judeca (și ca să nu inventeze `{}`). */
export function cosGol(): CosulDeJudecat {
  return { perProdus: new Map() };
}

/**
 * Ce se scrie pe ecran, în formular, sub fiecare poartă.
 *
 * ⚠ PROPOZIȚII, nu nume de câmpuri. „Coșul trece de 200 lei” se citește; „Valoare
 * minimă coș: 200” trebuie tălmăcit.
 */
export const DESPRE_PORTI = {
  minValue: {
    eticheta: "Coșul trece de",
    unitate: "lei",
    explicatie:
      "Se socotește pe marfă, fără transport și fără taxa de ramburs. ⚠ Se pune din nou la trimiterea comenzii, pe prețurile chiar plătite — deci o variantă mai scumpă urcă suma, iar o reducere o coboară.",
  },
  minQty: {
    eticheta: "În coș sunt cel puțin",
    unitate: "bucăți",
    explicatie: "Se adună bucățile de pe toate liniile, nu numărul de produse deosebite.",
  },
  requiredProductIds: {
    eticheta: "În coș se află",
    unitate: "",
    explicatie: "Măcar unul dintre produsele alese. Nu trebuie să fie toate.",
  },
  excludedProductIds: {
    eticheta: "În coș NU se află",
    unitate: "",
    explicatie: "Niciunul dintre produsele alese. Bun ca să nu oferi ceva ce omul deja cumpără.",
  },
} as const;
