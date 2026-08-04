import { contextulCosului, type ProdusCotat } from "./cart-weight";

/**
 * Greutatea cu care pleaca efectiv coletul la curier.
 *
 * COTATIA a fost reparata deja (c516bcf): pretul se cere pe greutatea reala,
 * calculata din cosul incarcat din baza. EMITEREA ramasese in urma —
 * `bulk-orders.actions.ts` avea `const weight = 1`, iar toate cele sase
 * formulare de AWB porneau de la `useState("1")`. Se cota deci un colet de zece
 * kilograme si se declara curierului unul singur; curierul cantareste la
 * depozit si refactureaza banda reala, asa ca diferenta o platea comerciantul,
 * fara sa apara nicaieri in panou.
 *
 * Masurat in productie pe 2026-08-03: 1408 produse ACTIVE de pe 14 magazine au
 * `weight_grams` completat, dintre care 284 peste un kilogram (maxim 13,1 kg, la
 * eSAFE, care are Sameday si Woot pornite). Din cele 96 de comenzi existente, 11
 * cantaresc peste un kilogram (maxim 7,79 kg) si 29 n-au nicio greutate
 * calculabila. Dintre cele 50 de comenzi cu AWB emis, 4 cantaresc peste un
 * kilogram — acelea au plecat sub-declarate daca s-a lasat valoarea implicita.
 *
 * Sta in modul pur pentru ca actiunile de mai sus sunt „use server" si
 * harness-ul de teste nu le poate incarca. Regula de adunare a greutatii NU se
 * rescrie aici: se cheama `contextulCosului`, exact ca la cotatie.
 */

/**
 * Ce se declara cand catalogul nu stie nimic: 29 din cele 96 de comenzi din
 * productie n-au niciun produs cantarit. Un kilogram e exact comportamentul de
 * pana acum, deci comenzile acelea nu se schimba cu nimic; zero ar fi fost
 * refuzat de API-uri, iar o cifra inventata mai mare ar fi scumpit livrari care
 * azi merg bine.
 */
export const GREUTATE_REZERVA_KG = 1;

/**
 * Sub atat nu se declara nimic. 7 comenzi din productie ies sub 100 de grame
 * (minimul masurat: 10 grame). `lib/dpd.ts` si `lib/cargus.ts` isi ridica
 * singure pragul, dar Sameday, FAN, Woot si Colete primesc numarul neatins, iar
 * un AWB pe 0,01 kg e o declaratie pe care n-o crede nimeni. 0,1 kg sta oricum
 * in prima banda de tarif (0-1 kg la toti curierii interni), deci pragul asta NU
 * schimba niciun pret.
 */
export const GREUTATE_MINIMA_KG = 0.1;

/**
 * Pragul de mai sus e ales dupa BENZILE DE TARIF. Unele API-uri au insa propriul
 * lor prag de VALIDARE, iar acela respinge cererea cu totul.
 *
 * Woot: `>= 1`. Aflat pe teren, 04.08.2026 — magazinul suporti-numar emisese 44
 * de AWB-uri Woot si s-a oprit brusc pe 3 august, exact cand c253d85 a inlocuit
 * `useState("1")` din formulare cu greutatea reala din catalog. Produsul lui
 * cantareste 400 g, deci pleca `weight: 0.4`, iar Woot raspundea:
 *
 *   {"error":{"parcels.0.weight":
 *     "The parcels.0.weight field must contain a number greater than or equal to 1."}}
 *
 * Ridicarea la 1 kg NU scumpeste nimic: 0-1 kg e prima banda de tarif la toti
 * curierii interni, deci un colet de 0,4 kg si unul de 1 kg costa la fel.
 *
 * Restul curierilor NU au aici un prag inventat: pentru ei nu avem nicio dovada
 * ca ar refuza valori subunitare, iar o cifra umflata fara motiv ar putea sari
 * intr-o banda superioara la un curier cu alta grila. Se completeaza cand apare
 * dovada, la fel ca la Woot.
 */
export const PRAG_API_CURIER = {
  woot: 1,
} as const;

/**
 * Greutatea gata de trimis catre un anumit curier: valoarea reala, ridicata la
 * pragul de validare al API-ului lui, daca acesta exista.
 */
export function greutatePentruCurier(kg: number, curier: keyof typeof PRAG_API_CURIER): number {
  const valoare = Number(kg);
  const minim = PRAG_API_CURIER[curier];
  if (!Number.isFinite(valoare) || valoare <= 0) return minim;
  return Math.max(valoare, minim);
}

/**
 * `orders.items` tine si linii care nu sunt produse: optiunile de comanda au
 * `product_id` de forma `extra_ext_1781723399523` (3 linii in productie). Trimis
 * intr-un `in("id", ...)` pe o coloana `uuid`, Postgres raspunde 22P02, iar
 * supabase-js lasa `data` null — adica interogarea NU s-ar intoarce fara acea
 * linie, ci fara NICIUN produs, si toate coletele ar cadea pe rezerva.
 */
const ESTE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O linie asa cum sta in `orders.items` (jsonb, deci nimic nu e garantat). */
interface LinieStocata {
  product_id?: unknown;
  quantity?: unknown;
}

/** Liniile comenzii in forma pe care o intelege `contextulCosului`. */
export function liniileComenzii(items: unknown): { productId: string; quantity: number }[] {
  if (!Array.isArray(items)) return [];
  const linii: { productId: string; quantity: number }[] = [];
  for (const brut of items) {
    const pid = (brut as LinieStocata | null)?.product_id;
    if (typeof pid !== "string" || pid === "") continue;
    linii.push({ productId: pid, quantity: Number((brut as LinieStocata).quantity) });
  }
  return linii;
}

/** Doar id-urile care pot fi cerute bazei fara sa arunce comanda intreaga. */
export function idurileDeCantarit(items: unknown): string[] {
  return [...new Set(liniileComenzii(items).map((l) => l.productId).filter((id) => ESTE_UUID.test(id)))];
}

/**
 * Greutatea coletului, si daca a iesit din catalog sau din rezerva.
 *
 * `dinCatalog` nu e cosmetica: formularul il foloseste ca sa spuna
 * comerciantului CA valoarea e o rezerva, nu o masuratoare — altfel „1" arata
 * exact ca un numar corect.
 */
export function greutateaColetului(
  items: unknown,
  produse: ProdusCotat[],
): { kg: number; dinCatalog: boolean; liniiFaraGreutate: number } {
  /*
   * Comenzile PARTIALE — unele produse cantarite, altele nu — erau cazul care
   * iesea mai rau decat rezerva.
   *
   * Sase comenzi din productie arata asa. Pe #0033, magazinul care emite 48 din
   * cele 50 de AWB-uri, suma produselor cu greutate da 0,4 kg pentru un colet
   * care contine si o umbrela parasolara de 130x70 fara greutate in catalog:
   * declarat 0,4 kg in loc de rezerva de 1 kg, adica MAI departe de adevar. Iar
   * campul ar fi scris dedesubt „calculata din produsele comenzii", exact
   * reasigurarea pe care auditul o vaneaza — un numar incomplet care arata ca un
   * numar corect.
   *
   * Se numara doar liniile de PRODUS: extraoptiunile (`extra_...`) sunt servicii
   * si n-au greutate pe bune.
   */
  const cerute = idurileDeCantarit(items);
  const gasite = new Set(produse.filter((p) => Number(p.weight_grams) > 0).map((p) => p.id));
  const liniiFaraGreutate = cerute.filter((id) => !gasite.has(id)).length;

  const kg = contextulCosului(liniileComenzii(items), produse).weightKg;
  if (kg <= 0) return { kg: GREUTATE_REZERVA_KG, dinCatalog: false, liniiFaraGreutate };
  return { kg: Math.max(kg, GREUTATE_MINIMA_KG), dinCatalog: liniiFaraGreutate === 0, liniiFaraGreutate };
}
