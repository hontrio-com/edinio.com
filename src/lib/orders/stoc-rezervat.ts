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
