/**
 * Ce stoc a consumat o comanda, in forma in care se poate da INAPOI intocmai.
 *
 * Se scrie pe comanda la plasare (`orders.stoc_rezervat`), si nu se deduce mai
 * tarziu din `items`, fiindca din `items` NU se poate deduce: pachetele nu-si
 * scriu componentele acolo (se scade componenta, se retine pachetul), variantele
 * se scad pe combinatie, iar `items[].product_id` amesteca id-uri de produs cu
 * `extra_<id>`. Peste toate, compozitia unui pachet se poate schimba intre vanzare
 * si anulare — dedusa atunci, s-ar da inapoi altceva decat s-a luat.
 *
 * ═══ DE CE STA IN FISIERUL ASTA, SI NU IN `order.actions.ts` ═══
 *
 * Fiindca acolo NU POATE FI TESTATA. `order.actions.ts` incepe cu `"use server"`,
 * iar un asemenea fisier expune fiecare export ca actiune de server si le cere pe
 * toate `async` — o functie sincronă exportata de acolo da zeci de erori care
 * arata spre apelanti, nu spre cauza. Vezi [[use-server-expune-fiecare-export]].
 *
 * Iar forma asta ARE nevoie de test: e contractul dintre ce scrie aplicatia si ce
 * asteapta `elibereaza_stoc_comanda` din baza. O nepotrivire aici n-ar da nicio
 * eroare — pur si simplu nu s-ar da nimic inapoi la anulare, exact defectul pe
 * care coloana asta a fost adaugata sa-l inchida.
 */

export interface StocRezervat {
  produse: { product_id: string; quantity: number }[];
  variante: { product_id: string; variant_title: string; quantity: number }[];
}

export function stocRezervat(
  decrements: { product_id: string; quantity: number }[],
  liniiVarianta: { product_id: string; variant_title?: string | null; quantity: number }[] = [],
): StocRezervat {
  return {
    produse: decrements,
    /*
     * Numai liniile care CHIAR au varianta, si cu aceeasi normalizare a cantitatii
     * ca `scadeStoculVariantelor` — aia e scaderea al carei invers e asta. O
     * cantitate rotunjita altfel aici ar fi pus inapoi alt numar decat s-a luat.
     */
    variante: liniiVarianta
      .filter((l) => l.variant_title)
      .map((l) => ({
        product_id: l.product_id,
        variant_title: l.variant_title as string,
        quantity: Math.max(1, Math.floor(Number(l.quantity) || 1)),
      })),
  };
}

/**
 * Rezervarea chiar tine ceva de dat inapoi?
 *
 * O comanda fara niciun produs cu stoc urmarit are rezervarea scrisa, dar goala
 * (`{ produse: [], variante: [] }`): la ea nu e nimic de asteptat si nimic de eliberat. `null`
 * (comanda de dinainte de coloana) inseamna „nu se stie”, deci tot „nu” de aici: stocul ei se
 * corecteaza de mana, din produs.
 *
 * Primeste `unknown` fiindca valoarea vine din baza ca jsonb, iar o forma stricata trebuie sa
 * dea „nu”, nu o exceptie.
 */
export function rezervareaAreStoc(rezervat: unknown): boolean {
  if (!rezervat || typeof rezervat !== "object" || Array.isArray(rezervat)) return false;
  const r = rezervat as { produse?: unknown; variante?: unknown };
  return (Array.isArray(r.produse) && r.produse.length > 0)
    || (Array.isArray(r.variante) && r.variante.length > 0);
}
