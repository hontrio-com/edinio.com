/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILTRELE LISTEI DE CLIENTI                                    (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pana acum pagina avea cautare si un singur meniu de sortare. Atat.
 *
 * ⚠ REGULA: niciun filtru fara date pe care sa cada. O optiune pe care nimeni
 * n-o poate bifa nu e o functie in plus, e o promisiune goala — si il trimite pe
 * comerciant sa caute un defect care nu exista.
 *
 * ═══ CE S-A MASURAT INAINTE (productie, 21.09.2026, 537 de comenzi) ═══
 *
 *     Judet scris ................ 516 comenzi, 56 de valori deosebite
 *     Email ...................... 343
 *     Telefon .................... 474
 *     Canal (magazin/eMAG/…) ..... magazin 336, eMAG 128, Trendyol 73
 *
 * ⚠⚠ CANALUL NU E `order_source`. Campul acela are 465 de valori deosebite din
 * 537 de comenzi — e un obiect care poarta si numarul comenzii de la marketplace,
 * si identificatorul coletului. Un filtru pe el ar fi avut 465 de optiuni, cate
 * una pe comanda. Canalul adevarat sta in cheia `marketplace` dinauntru.
 *
 * ⚠ CE NU SE OFERA, SI DE CE:
 *   - „accepta marketing" cere consimtamant inregistrat pe client; nu exista;
 *   - „tag" cere etichete scrise de comerciant; nu exista inca;
 *   - „manual" (client adaugat de mana) cere adaugarea manuala, care nu exista.
 *   Toate trei sunt in plan, la etapele lor. Pana atunci, nu se ofera.
 */

/** Segmentele dupa activitate. Ordinea e cea din meniu. */
export const SEGMENTE = [
  "toti", "noi", "recurenti", "vip", "fara-comenzi",
  "inactivi-30", "inactivi-90", "inactivi-180",
  "cu-retururi", "cu-anulari",
] as const;

export type Segment = (typeof SEGMENTE)[number];

export const NUMELE_SEGMENTULUI: Record<Segment, string> = {
  toti: "Toți clienții",
  noi: "Clienți noi",
  recurenti: "Clienți recurenți",
  vip: "Clienți VIP",
  "fara-comenzi": "Fără nicio comandă",
  "inactivi-30": "Inactivi de 30 de zile",
  "inactivi-90": "Inactivi de 90 de zile",
  "inactivi-180": "Inactivi de 180 de zile",
  "cu-retururi": "Cu retururi",
  "cu-anulari": "Cu anulări",
};

export function segmentValid(v: string | null | undefined): Segment {
  return (SEGMENTE as readonly string[]).includes(v ?? "") ? (v as Segment) : "toti";
}

/**
 * Treptele de valoare.
 *
 * ⚠ ULTIMA TREAPTA („peste 1.000 lei") NU SE APRINDE AZI PENTRU NIMENI: cel mai
 * mare client al platformei are 968,99 lei in tot istoricul. E lasata dinadins —
 * un interval de valoare e o scara, nu o lista de etichete, si scara trebuie sa
 * mearga mai sus decat ce s-a vazut pana acum. Diferenta fata de un badge care
 * nu se aprinde: aici omul ALEGE treapta si vede „niciun client", ceea ce e un
 * raspuns; un badge lipsa nu spune nimic.
 */
export const TREPTE_VALOARE = [
  { cheie: "0-200", eticheta: "Sub 200 lei", min: 0, max: 200 },
  { cheie: "200-500", eticheta: "200 – 500 lei", min: 200, max: 500 },
  { cheie: "500-1000", eticheta: "500 – 1.000 lei", min: 500, max: 1000 },
  { cheie: "1000+", eticheta: "Peste 1.000 lei", min: 1000, max: null },
] as const;

export type CheieValoare = (typeof TREPTE_VALOARE)[number]["cheie"];

export function treaptaValoare(v: string | null | undefined) {
  return TREPTE_VALOARE.find((t) => t.cheie === v) ?? null;
}

/** Cate filtre sunt puse acum, ca sa se poata spune „3 filtre" si sa se poata sterge. */
export function cateFiltre(f: { segment: Segment; valoare: string | null }): number {
  return (f.segment !== "toti" ? 1 : 0) + (f.valoare ? 1 : 0);
}
