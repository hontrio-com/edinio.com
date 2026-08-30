import { normalizeazaCantitate } from "@/lib/orders/quantity";

/** O linie de cos, asa cum sta in `localStorage.cart_<slug>`. */
export interface CartItem {
  productId: string;
  slug?: string;
  name: string;
  price: number;
  imageUrl: string | null;
  quantity: number;
  /** Combinatia de varianta aleasa („S / Rosu") — lipseste la produsele simple. */
  variantTitle?: string;
  variantSku?: string;
}

/**
 * O linie de cos e identificata prin produs + combinatia aleasa, ca doua marimi
 * ale aceluiasi produs sa fie linii distincte, nu una singura. Produsele simple
 * cad pe id-ul produsului, ceea ce pastreaza compatibilitatea cu cosurile salvate
 * inainte de variante.
 *
 * Regula statea scrisa de trei ori — in provider, in `consume.ts` si in
 * `AddToCartButton` — desi de ea atarna si stergerea unei linii, si numararea
 * bucatilor.
 */
export function lineKey(item: Pick<CartItem, "productId" | "variantTitle">): string {
  return item.variantTitle ? `${item.productId}::${item.variantTitle}` : item.productId;
}

/**
 * Cosul citit din localStorage nu e datele noastre — e text pe care il poate
 * scrie oricine.
 *
 * `JSON.parse` intors direct in stare inseamna ca ce sta in `cart_<slug>` devine
 * stare de React fara sa fi trecut prin nicio verificare. `try/catch` de acolo
 * prinde doar JSON stricat SINTACTIC: `"null"`, `"5"` si `"{}"` sunt JSON perfect
 * valid, iar la randarea urmatoare `items.map(...)` arunca. Si nu o singura data
 * — cheia se reciteste la fiecare montare, deci magazinul ramane pagina de eroare
 * pana cand cineva goleste localStorage-ul de mana.
 *
 * Se normalizeaza O SINGURA DATA, la granita (hidratare, evenimentul `storage`,
 * restaurarea cosului abandonat, scrierea cantitatii), NU pe fiecare suprafata
 * care afiseaza cosul. Sase copii ale aceleiasi reguli e chiar modul de esec pe
 * care il descrie `pricing.ts`.
 *
 * Ce nu se incadreaza se ARUNCA, nu se repara pe jumatate: o linie fara produs
 * sau cu pret nenumeric n-are ce cauta intr-un cos, iar dusa mai departe cu
 * valori inventate ar ajunge intr-o comanda.
 */
export function normalizeazaCos(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const curate = new Map<string, CartItem>();
  for (const brut of raw) {
    if (!brut || typeof brut !== "object") continue;
    const l = brut as Record<string, unknown>;
    const productId = typeof l.productId === "string" ? l.productId.trim() : "";
    if (!productId) continue;
    // `typeof`, nu `Number(...)`: `Number(null)`, `Number("")`, `Number([])` si
    // `Number(false)` dau toate 0, finit si nenegativ, deci linia trecea cu un
    // pret INVENTAT. Iar pretul salvat nu e o valoare de rezerva de o clipa —
    // `CartProvider` cade pe el deliberat cand cererea de preturi esueaza, deci
    // cosul ar fi aratat 0,00 lei si ar fi socotit pragul de livrare gratuita pe
    // zero. Toti scriitorii cheii au scris dintotdeauna `price: number`.
    const price = typeof l.price === "number" ? l.price : Number.NaN;
    if (!Number.isFinite(price) || price < 0) continue;
    const curata: CartItem = {
      ...(l as unknown as CartItem),
      productId,
      name: typeof l.name === "string" ? l.name : "",
      price,
      quantity: normalizeazaCantitate(l.quantity),
      imageUrl: typeof l.imageUrl === "string" ? l.imageUrl : null,
    };
    // Campurile optionale se SCOT cand au alt tip, nu se pun pe `undefined`:
    // identitatea unei linii se face din `variantTitle` (vezi `lineKey`), iar o
    // cheie prezenta cu valoare nedefinita nu e acelasi lucru cu una absenta.
    if (typeof curata.variantTitle !== "string") delete curata.variantTitle;
    if (typeof curata.variantSku !== "string") delete curata.variantSku;
    if (typeof curata.slug !== "string") delete curata.slug;
    // Doua linii pot ajunge pe ACEEASI cheie dupa curatare — de exemplu doua
    // `variantTitle` care nu erau siruri, amandoua sterse mai sus. Lasate asa,
    // `updateQty` ar scrie in amandoua, `removeItem` le-ar sterge pe amandoua si
    // numaratoarea le-ar socoti de doua ori. Se pliaza, cu cantitatile adunate.
    const cheie = lineKey(curata);
    const deja = curate.get(cheie);
    if (deja) deja.quantity = normalizeazaCantitate(deja.quantity + curata.quantity);
    else curate.set(cheie, curata);
  }
  return [...curate.values()];
}
