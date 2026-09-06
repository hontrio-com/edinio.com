import { normalizeazaCantitate } from "@/lib/orders/quantity";
import { amprentaConfiguratiei, cheieLinie } from "@/lib/configurators/amprenta";
import { normalizeazaValori, type Valori } from "@/lib/configurators/valori";
import type { RandRezumat } from "@/lib/configurators/rezumat";

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
   * Ce a ales cumparatorul in configurator, deja normalizat.
   *
   * ⚠ NU e o promisiune de pret. Serverul primeste chiar valorile astea, le normalizeaza el
   * insusi si recalculeaza pretul din ele la plasarea comenzii. Aici stau ca sa se poata arata
   * cosul, si ca sa se stie ce se trimite mai departe.
   */
  configuratie?: Valori;
  /**
   * Amprenta configuratiei — ce face din doua cani cu gravuri diferite doua linii, nu una.
   *
   * ⚠ Se RECALCULEAZA la normalizare, nu se crede pe cuvant. Ce sta in localStorage e text pe
   * care il poate scrie oricine, iar o amprenta scrisa de mana ar fi contopit doua configuratii
   * diferite intr-o singura linie — si a doua ar fi disparut inainte ca cineva s-o vada.
   */
  amprenta?: string;
  /**
   * Configuratia scrisa in cuvinte, ca sa se poata citi linia din cos.
   *
   * ⚠ Fara ea, doua cani cu gravuri diferite arata IDENTIC in cos: acelasi nume, aceeasi
   * poza, acelasi pret uneori. Cumparatorul n-ar avea cum sa stie pe care o sterge.
   *
   * ⚠ Se scrie la adaugare, cand definitia e la indemana. In cos nu exista definitia
   * configuratorului, deci etichetele n-ar putea fi aflate acolo. Si nu intra in amprenta:
   * identitatea liniei se face din VALORI, nu din felul in care le scriem.
   */
  rezumat?: RandRezumat[];
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
export function lineKey(item: Pick<CartItem, "productId" | "variantTitle" | "amprenta">): string {
  /*
   * ⚠ Cand nu exista configuratie, cheia ramane LITERA CU LITERA cea de pana acum.
   *
   * Altfel toate cosurile aflate acum in localStorage-ul cumparatorilor s-ar fi desfacut in linii
   * noi la prima incarcare a paginii. `cheieLinie` chiar asta garanteaza, si are proba.
   */
  return cheieLinie(item.productId, item.variantTitle, item.amprenta);
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
     * ⚠ CONFIGURATIA SE RENORMALIZEAZA, si amprenta se RECALCULEAZA din ea.
     *
     * Ce sta in `cart_<slug>` e text pe care il poate scrie oricine. O amprenta primita pe cuvant
     * ar fi hotarat identitatea liniei: doua configuratii diferite cu aceeasi amprenta scrisa de
     * mana s-ar fi contopit, iar a doua ar fi disparut inainte ca cineva s-o vada.
     *
     * ⚠ Si se SCOT amandoua cand nu ramane nimic dupa normalizare. Configuratia GOALA are si ea
     * o amprenta, iar pusa pe o linie fara configurator i-ar fi schimbat cheia — adica exact
     * desfacerea cosurilor vechi de care ne ferim mai sus.
     */
    const valori = normalizeazaValori(curata.configuratie);
    if (Object.keys(valori).length > 0) {
      curata.configuratie = valori;
      curata.amprenta = amprentaConfiguratiei(valori);
      curata.rezumat = curataRezumatul(curata.rezumat);
      if (!curata.rezumat) delete curata.rezumat;
    } else {
      delete curata.configuratie;
      delete curata.amprenta;
      delete curata.rezumat;
    }
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

/** Cate randuri de rezumat se pastreaza, si cat de lungi. */
const MAX_RANDURI_REZUMAT = 50;
const MAX_TEXT_REZUMAT = 200;

/**
 * Rezumatul din localStorage, adus la o forma care se poate desena.
 *
 * ⚠ E text pe care il poate scrie oricine. React scapa oricum continutul, deci nu e o
 * poarta de injectie — dar un sir de zece mii de caractere pus de mana ar fi rupt asezarea
 * cosului, si o mie de randuri l-ar fi facut nefolosibil. Se taie, si ce nu se intelege se lasa.
 */
function curataRezumatul(brut: unknown): RandRezumat[] | undefined {
  if (!Array.isArray(brut)) return undefined;
  const out: RandRezumat[] = [];
  for (const x of brut.slice(0, MAX_RANDURI_REZUMAT)) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    if (typeof r.eticheta !== "string" || typeof r.valoare !== "string") continue;
    if (!r.eticheta.trim() || !r.valoare.trim()) continue;
    out.push({
      id: typeof r.id === "string" ? r.id.slice(0, MAX_TEXT_REZUMAT) : "",
      eticheta: r.eticheta.slice(0, MAX_TEXT_REZUMAT),
      valoare: r.valoare.slice(0, MAX_TEXT_REZUMAT),
      scurt: r.scurt === true,
    });
  }
  return out.length > 0 ? out : undefined;
}
