import { orSafeTerm } from "@/lib/orders/pagination";
import { inceputulZilei, sfarsitulZilei, ziValida } from "@/lib/zi-romaneasca";

/**
 * Filtrele listei de comenzi (stare, sursa, cautare, perioada), intr-un singur loc.
 *
 * ⚠ Le folosesc DOUA cai: pagina (`dashboard/orders/page.tsx`) si exportul „toate comenzile
 * filtrului" (`export-comenzi.actions.ts`). Scrise de doua ori, exportul ar fi putut da alte
 * comenzi decat cele de pe ecran, si nimeni n-ar fi vazut diferenta pana la contabilitate.
 *
 * ═══ PERIOADA (cerut de un magazin, 23.11.2026: „raport de comenzi de la 15.11 la 30.11") ═══
 *
 * `deLa` si `panaLa` sunt ZILE scrise „YYYY-MM-DD", zile ROMANESTI: comanda de la 00:30 ora
 * Romaniei e a zilei aceleia, desi in baza sta cu data UTC a zilei dinainte. Capetele le da
 * `zi-romaneasca.ts`, acelasi loc din care isi iau perioada codurile de reducere si ofertele.
 * Amandoua capetele sunt INCLUSE: „pana la 30.11" tine toata ziua de 30.
 */
export type FiltreleListei = {
  status: string;
  source: string;
  q: string;
  deLa?: string;
  panaLa?: string;
  /**
   * Mai multe stari deodata (grupa „De lucru” = in asteptare, confirmate, in procesare); lista
   * goala sau lipsa = fara filtrul acesta. Asezarile care arata o grupa o trimit si la export.
   */
  stari?: readonly string[];
};

/** Ziua din adresa sau din cererea de export: valida, sau `""` (fara filtrul acela). */
export function ziuaFiltrului(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  return ziValida(s) ? s : "";
}

/** Ce trebuie sa stie un constructor de interogare ca sa primeasca filtrele. */
type Filtrabil<T> = {
  eq(coloana: string, valoare: string): T;
  in(coloana: string, valori: readonly string[]): T;
  is(coloana: string, valoare: null): T;
  or(filtre: string): T;
  gte(coloana: string, valoare: string): T;
  lte(coloana: string, valoare: string): T;
};

export function aplicaFiltreleListei<T extends Filtrabil<T>>(interogare: T, f: FiltreleListei): T {
  let q = interogare;
  if (f.status !== "all") q = q.eq("status", f.status);
  if (f.stari && f.stari.length > 0) q = q.in("status", f.stari);
  /*
   * Filtrarea dupa sursa se face in SQL, pe `order_source->>marketplace`, nu in
   * pagina: altfel „doar Trendyol" ar filtra numai comenzile paginii curente si
   * ar arata gol chiar cand exista comenzi Trendyol mai jos.
   *
   * „Magazin" inseamna „fara marker de marketplace", inclusiv comenzile vechi,
   * de dinainte de atribuire, care n-au deloc `order_source`.
   */
  if (f.source === "store") q = q.is("order_source->>marketplace", null);
  else if (f.source !== "all") q = q.eq("order_source->>marketplace", f.source);
  /* O zi care nu e zi nu filtreaza nimic: `inceputulZilei` intoarce `null` la orice altceva. */
  const deLa = inceputulZilei(f.deLa);
  const panaLa = sfarsitulZilei(f.panaLa);
  if (deLa) q = q.gte("created_at", deLa);
  if (panaLa) q = q.lte("created_at", panaLa);
  const term = orSafeTerm(f.q);
  if (term) {
    // Denumirea firmei si CUI-ul intra si ele in cautare: lista le AFISEAZA pe
    // comenzile pe persoana juridica, iar un camp care se vede pe ecran dar nu se
    // poate cauta arata ca o comanda disparuta.
    //
    // In baza, CUI-ul e numai cifre; panoul, emailul si factura il scriu insa cu
    // „RO" in fata la platitorii de TVA. Comerciantul copiaza fix ce vede, deci
    // prefixul se taie pentru ramura de CUI, si NUMAI pentru ea: o firma se poate
    // numi „Rodbun", iar cautarea dupa nume n-are de ce sa piarda primele doua
    // litere.
    const termCui = term.replace(/^ro(?=\d)/i, "");
    q = q.or(
      /* Si emailul: un client cu cont comanda pentru mai multe persoane, iar comerciantul il
         cauta dupa adresa pe care o vede in coloana „Email". */
      `order_number.ilike.%${term}%,customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%,customer_email.ilike.%${term}%,` +
      `billing_company->>company_name.ilike.%${term}%,billing_company->>cui.ilike.%${termCui}%`,
    );
  }
  return q;
}
