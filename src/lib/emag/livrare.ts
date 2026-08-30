/**
 * A ajuns coletul la client? Citit din raspunsul lui `/awb/read`.
 *
 * ═══ ⚠ DE CE E UN CITITOR TOLERANT, SI NU O CHEIE ═══
 *
 * Raspunsul lui `/awb/read` NU e in schema lor. Aceeasi poveste ca la oferte, unde
 * `ownership` a venit `boolean` acolo unde documentatia scrie 1/2, si ca la `doc_errors`,
 * pe care l-am presupus si a fost gol la toate cele 152 de oferte respinse.
 *
 * Deci nu se scrie `r.status === "delivered"` si gata. Se cauta in formele plauzibile, si —
 * mai important — se raspunde `null` cand nu se poate sti.
 *
 * ═══ ⚠ SI DE-AIA SUNT TREI RASPUNSURI, NU DOUA ═══
 *
 *   `true`   avem dovada ca a ajuns
 *   `false`  avem dovada ca inca nu (e in drum, la depozit, refuzat)
 *   `null`   NU STIM — forma raspunsului nu ne spune nimic
 *
 * `null` NU se citeste ca „nu s-a livrat" si nici ca „s-a livrat": se pastreaza raspunsul
 * brut si se lasa comanda in pace. Un `false` implicit ar fi tinut comanda „expediata" la
 * nesfarsit fara sa se stie de ce; un `true` implicit ar fi marcat livrate colete in drum —
 * exact defectul pentru care s-a scris fisierul asta.
 */

/** Cuvintele prin care curierii lor spun „a ajuns". Comparate fara diacritice si litere mari. */
const LIVRAT = [
  "delivered", "livrat", "livrata", "predat", "predata",
  /* ⚠ Sunt si stari FINALE care nu inseamna livrare: „returned to sender", „refused",
     „canceled". Ele intra mai jos, la `NELIVRAT` — o stare finala nu e o livrare. */
];

/** Cuvintele care spun limpede „inca nu" sau „nu va mai ajunge". */
const NELIVRAT = [
  "in transit", "in tranzit", "picked up", "ridicat", "sorted", "sortat",
  "out for delivery", "in livrare", "pending", "in asteptare", "new", "nou",
  "returned", "retur", "refused", "refuzat", "canceled", "cancelled", "anulat", "lost", "pierdut",
];

/** Fara diacritice, litere mici, spatii stranse. */
function normalizeaza(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Toate sirurile din raspuns, oricat de adanc, ca sa nu depinda de numele cheilor.
 *
 * ⚠ CU O ADANCIME MAXIMA: un raspuns cu o bucla ar fi invartit la nesfarsit intr-o functie
 * chemata din cron. Sase niveluri acopera orice forma plauzibila a lor.
 */
function siruri(v: unknown, adancime = 0): string[] {
  if (adancime > 6) return [];
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap((x) => siruri(x, adancime + 1));
  if (v && typeof v === "object") {
    return Object.values(v as Record<string, unknown>).flatMap((x) => siruri(x, adancime + 1));
  }
  return [];
}

/**
 * Verdictul, din raspunsul lor brut.
 *
 * ⚠ NELIVRAT BATE LIVRAT. „Returned to sender" contine si el un cuvant de stare finala, iar
 * un raspuns care poarta amandoua semnele nu e o livrare — e o poveste pe care n-o intelegem
 * inca. Se raspunde `false`, adica „nu marca livrat", nu `null`: stim ca NU e livrare.
 */
export function eLivratLaEi(raspuns: unknown): boolean | null {
  const toate = siruri(raspuns).map(normalizeaza).filter(Boolean);
  if (toate.length === 0) return null;

  const areNelivrat = toate.some((s) => NELIVRAT.some((c) => s.includes(c)));
  const areLivrat = toate.some((s) => LIVRAT.some((c) => s.includes(c)));

  if (areNelivrat) return false;
  if (areLivrat) return true;
  return null;
}
