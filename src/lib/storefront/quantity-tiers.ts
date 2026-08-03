export interface QuantityTier {
  qty: number;
  /** Pretul TOTAL al pachetului, nu pe bucata. */
  price: number;
  badge?: string;
}

/** Configuratia bruta din `products.page_sections.quantity_tiers`. */
export interface ConfigTrepte {
  enabled?: boolean;
  mode?: string;
  tier2_price?: number;
  tier3_price?: number;
  tier2_percent?: number;
  tier3_percent?: number;
  tier2_badge?: string;
  tier3_badge?: string;
}

export interface PretLinie {
  /** Indexul treptei bifate, sau -1 cand cantitatea nu cade exact pe o treapta. */
  index: number;
  /** Cat se afiseaza si cat se incaseaza pentru linia asta. */
  subtotal: number;
  /** Pretul unitar echivalent, trimis serverului pe calea comenzii directe. */
  unitPrice: number;
  /** Cat economiseste clientul fata de pretul intreg (0 cand nu se aplica nimic). */
  savings: number;
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Lista de trepte a unui produs, din configuratia lui si pretul unitar curent.
 *
 * UN SINGUR loc o construieste. Era copiata identic in ambele modele de pagina de
 * produs, iar coborarea preturilor de treapta in cos ar fi facut a treia copie —
 * exact terenul pe care creste un pret afisat diferit de cel incasat.
 *
 * Pretul unitar conteaza: la modul procentual treptele se calculeaza din el, deci
 * o varianta cu pret propriu isi primeste propriile pachete.
 */
export function construiesteTrepte(raw: unknown, unitPrice: number): QuantityTier[] | undefined {
  const cfg = (raw ?? null) as ConfigTrepte | null;
  if (!cfg?.enabled) return undefined;

  const procent = cfg.mode === "percent";
  const pret2 = procent ? unitPrice * 2 * (1 - (cfg.tier2_percent ?? 0) / 100) : Number(cfg.tier2_price ?? 0);
  const pret3 = procent ? unitPrice * 3 * (1 - (cfg.tier3_percent ?? 0) / 100) : Number(cfg.tier3_price ?? 0);
  const are2 = procent ? (cfg.tier2_percent ?? 0) > 0 : pret2 > 0;
  const are3 = procent ? (cfg.tier3_percent ?? 0) > 0 : pret3 > 0;

  return [
    { qty: 1, price: round2(unitPrice), badge: "" },
    ...(are2 ? [{ qty: 2, price: round2(pret2), badge: cfg.tier2_badge }] : []),
    ...(are3 ? [{ qty: 3, price: round2(pret3), badge: cfg.tier3_badge }] : []),
  ];
}

export interface ProblemaTrepte {
  /** Pachetul care iese mai ieftin decat o cantitate mai mica. */
  qty: number;
  /** Cat costa pachetul, asa cum e configurat. */
  pretPachet: number;
  /** Sub suma asta pachetul nu are voie sa coboare. */
  minimAcceptat: number;
}

/**
 * Pachetul asta chiar costa mai mult decat o cantitate mai mica?
 *
 * Se verifica pe TOTALURI, nu pe procente, si de aceea merge la fel in ambele
 * moduri. Pe procente conditia ar fi parut „sub 50%", dar nu e adevarat: „Guess
 * CONNOISSEUR" are procente CRESCATOARE (30% la doua bucati, 60% la trei) si tot
 * iese rupt, fiindca pachetul de trei (84,00) cade sub cel de doua (98,00).
 *
 * Verificarea sta aici, langa motor, ca sa o poata chema si formularul din
 * panou, si actiunea de salvare, si importul. Se cheama la SCRIERE, nu la
 * citire: o clema pusa in motor ar fi ascuns configuratia gresita in loc sa o
 * arate, iar comerciantul de la bricosmart ar fi ramas convins ca vinde doua
 * aspiratoare cu 10 lei — doar ca fara sa mai vada nicaieri ca a gresit. Si
 * oricum nu l-ar fi salvat: dupa o clema, sase aspiratoare tot ar fi costat
 * 134 lei fata de 714 din catalog.
 */
export function problemaMonotonie(tiers: QuantityTier[] | undefined): ProblemaTrepte | null {
  if (!tiers || tiers.length === 0) return null;
  const unit = tiers.find((t) => t.qty === 1)?.price ?? 0;
  const pachete = new Map(tiers.filter((t) => t.qty > 1 && t.price > 0).map((t) => [t.qty, t.price]));
  if (pachete.size === 0 || unit <= 0) return null;

  // `cost[n]` = cel mai ieftin mod de a acoperi n bucati cu ce s-a validat pana
  // aici. Fiecare pachet se compara cu cantitatea imediat mai mica, nu cu
  // `n x pretul de baza`: altfel nicio reducere n-ar mai fi permisa.
  const cost: number[] = [0, unit];
  for (let n = 2; n <= Math.max(...pachete.keys()); n++) {
    const faraPachet = round2(cost[n - 1] + unit);
    const pachet = pachete.get(n);
    if (pachet != null && pachet < cost[n - 1] - 0.005) {
      return { qty: n, pretPachet: round2(pachet), minimAcceptat: round2(cost[n - 1]) };
    }
    cost[n] = pachet != null ? Math.min(faraPachet, pachet) : faraPachet;
  }
  return null;
}

/** Mesajul aratat comerciantului cand un pachet iese mai ieftin decat unul mic. */
export function mesajProblemaTrepte(p: ProblemaTrepte): string {
  return `Pachetul de ${p.qty} bucati costa ${p.pretPachet.toFixed(2)} lei, adica mai putin decat `
    + `${p.qty - 1} ${p.qty - 1 === 1 ? "bucata" : "bucati"} (${p.minimAcceptat.toFixed(2)} lei). `
    + `Scrie pretul TOTAL al pachetului, nu pretul unei bucati.`;
}

/** Peste atatea bucati nu mai calculam pachete: e cos de gros, nu de retail. */
const MAX_CANTITATE_PACHETE = 500;

/**
 * Pretul unei linii: cea mai buna combinatie de pachete configurate.
 *
 * Comerciantul declara PACHETE („2 bucati costa 170"), nu praguri pe bucata. Deci
 * pentru 5 bucati raspunsul corect nu e sa inventam un pret unitar pe care nu l-a
 * setat, ci sa i le dam din pachetele lui: un pachet de 3 plus unul de 2. E acelasi
 * model pe care il folosesc motoarele de multi-buy din retail.
 *
 * Doua proprietati care conteaza si de care ne tinem cu teste:
 *   - MONOTON: mai multe bucati nu costa niciodata mai putin decat mai putine.
 *     Potrivirea exacta pe treapta, cum era pana acum, incalca asta pe fata: 3
 *     bucati costau 250 lei si a patra sarea totalul la 359,96.
 *   - NICIODATA peste pretul intreg: pachetele pot doar sa ieftineasca. Fara
 *     clema asta, o varianta mai ieftina decat pretul fix al pachetului ar fi
 *     facut „reducerea" sa coste mai mult decat lipsa ei.
 */
export function pretPeTrepte(
  tiers: QuantityTier[] | undefined,
  quantity: number,
  basePrice: number,
): PretLinie {
  const bucati = Math.max(0, Math.floor(Number(quantity) || 0));
  const unitar = Number(basePrice) || 0;
  const intreg = round2(unitar * bucati);

  const pachete = (tiers ?? []).filter((t) => t.qty > 1 && t.price > 0);
  const index = tiers && tiers.length > 0 ? tiers.findIndex((t) => t.qty === quantity) : -1;

  if (bucati === 0 || pachete.length === 0 || bucati > MAX_CANTITATE_PACHETE) {
    return { index, subtotal: intreg, unitPrice: unitar, savings: 0 };
  }

  // Cel mai ieftin mod de a acoperi exact `bucati`, din pachete + bucata simpla.
  const cost = new Array<number>(bucati + 1).fill(Infinity);
  cost[0] = 0;
  const optiuni = [{ qty: 1, price: unitar }, ...pachete];
  for (let n = 1; n <= bucati; n++) {
    for (const o of optiuni) {
      if (o.qty <= n && cost[n - o.qty] + o.price < cost[n]) cost[n] = cost[n - o.qty] + o.price;
    }
  }

  const subtotal = Math.min(round2(cost[bucati]), intreg);
  return {
    index,
    subtotal,
    unitPrice: bucati > 0 ? subtotal / bucati : unitar,
    savings: round2(intreg - subtotal),
  };
}
