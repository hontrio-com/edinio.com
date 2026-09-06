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
  /**
   * Ce a completat clientul la personalizare — valorile BRUTE, exact cum le trimite pagina.
   *
   * ⚠ VALORI, NU PRET. Ca peste tot pe drumul asta, clientul spune ce a ales si serverul
   * socoteste cat costa, din definitia lui. `price` de pe linie ramane cel de CATALOG.
   *
   * ⚠ Si intra in identitatea liniei — vezi `lineKey`. „Robert" si „Maria" sunt doua linii,
   * chiar daca sunt acelasi produs la acelasi pret.
   */
  customization?: Record<string, unknown>;
}

/** Cat de lunga poate fi partea de personalizare din cheia unei linii. */
const MAX_CHEIE_PERSONALIZARE = 2000;

/**
 * Personalizarea, scrisa la fel de fiecare data.
 *
 * ⚠ CHEILE SE SORTEAZA. `JSON.stringify` pastreaza ordinea in care au fost puse, iar ea difera
 * intre doi clienti care completeaza aceleasi campuri in alta ordine — deci aceeasi personalizare
 * ar fi dat doua chei si doua linii de cos in loc de una.
 *
 * ⚠ SI NU E UN HASH. Un hash scurt ar fi putut ciocni doua personalizari DIFERITE intr-o singura
 * linie — adica o cana gravata „Robert" si una „Maria" contopite, cu cantitatea 2. Textul canonic
 * n-are cum sa ciocneasca. Costul e o cheie mai lunga, si ea nu se vede nicaieri.
 */
function scriereCanonica(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `[${v.map(scriereCanonica).join(",")}]`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${scriereCanonica(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
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
export function lineKey(
  item: Pick<CartItem, "productId" | "variantTitle" | "customization">,
): string {
  const baza = item.variantTitle ? `${item.productId}::${item.variantTitle}` : item.productId;
  /*
   * ⚠ PERSONALIZAREA INTRA IN IDENTITATE, si asta e tot rostul ei aici.
   *
   * Fara ea, doua cani gravate diferit — „Robert" si „Maria" — cadeau pe aceeasi cheie: a doua
   * adaugare doar crestea cantitatea primeia, iar clientul primea doua cani cu acelasi nume. Si
   * n-ar fi avut cum sa afle: cosul ii arata o singura linie, cu cantitatea 2.
   *
   * ⚠ Produsele FARA personalizare pastreaza cheia de dinainte, caracter cu caracter — deci
   * cosurile deja salvate in browserele oamenilor raman valabile si nu se pliaza gresit.
   */
  const c = item.customization;
  if (!c || typeof c !== "object" || Object.keys(c).length === 0) return baza;
  return `${baza}::${scriereCanonica(c).slice(0, MAX_CHEIE_PERSONALIZARE)}`;
}

/**
 * Personalizarea unei linii, scrisa asa cum o citeste omul.
 *
 * ═══ ⚠ DE CE TREBUIE SA SE VADA IN COS ═══
 *
 * Linia poarta acum valorile, iar identitatea ei le numara: „Robert" si „Maria" sunt doua linii.
 * Dar daca ele arata IDENTIC pe ecran, clientul vede doua randuri egale si crede ca a apasat de
 * doua ori — sau, mai rau, sterge randul gresit. Iar la fototapet numarul de pe linie e mai mare
 * decat pretul de catalog, si nimic n-ar explica de ce.
 *
 * ⚠ SE SCRIE DIN VALORILE BRUTE, cu ce se stie in browser. Etichetele campurilor nu sunt aici —
 * pe suprafetele de catalog definitia e taiata de `slimPageSections`, deci un rezumat cu etichete
 * ar fi mintit exact acolo. Se arata VALORILE, care sunt tot ce a ales omul.
 *
 * ⚠ Iar in comanda ajunge instantaneul SERVERULUI, cu etichetele lui — nu textul de aici.
 */
export function rezumatPersonalizare(c: Record<string, unknown> | undefined): string {
  if (!c || typeof c !== "object") return "";
  const bucati: string[] = [];
  for (const v of Object.values(c)) {
    if (v === null || v === undefined || v === "" || v === false) continue;
    if (Array.isArray(v)) {
      const cate = v.filter((x) => typeof x === "string" && x.trim() !== "").length;
      if (cate > 0) bucati.push(`${cate} ${cate === 1 ? "fisier" : "fisiere"}`);
      continue;
    }
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      /* Dimensiunile se scriu ca „350 x 250", nu ca obiect. */
      if (o.latime !== undefined || o.inaltime !== undefined) {
        bucati.push(`${o.latime ?? "?"} x ${o.inaltime ?? "?"}`);
      }
      continue;
    }
    if (v === true) continue;
    bucati.push(String(v).slice(0, 40));
  }
  return bucati.join(" · ");
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
    /*
     * ⚠ Personalizarea trece prin ACELEASI reguli ca restul: ce n-are forma buna se SCOATE, nu
     * se duce mai departe pe jumatate. Un tablou sau un sir pus acolo ar fi ajuns in `lineKey` si
     * ar fi rupt identitatea liniei; iar pe server ea e oricum recitita din definitia produsului.
     *
     * ⚠ Marimea se margineste tot aici: `localStorage` e scris de client, iar o personalizare
     * de un megaoctet ar fi umflat fiecare cheie de linie si fiecare comparatie.
     */
    if (
      !curata.customization || typeof curata.customization !== "object"
      || Array.isArray(curata.customization)
      || scriereCanonica(curata.customization).length > MAX_CHEIE_PERSONALIZARE
    ) delete curata.customization;
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
