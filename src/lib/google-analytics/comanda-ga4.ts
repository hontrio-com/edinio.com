/**
 * Regulile unei comenzi raportate in GA4, fara nicio retea si fara baza: cat, cui, si in ce sesiune.
 *
 * Le folosesc trei locuri, si trebuie sa spuna acelasi lucru in toate: trimiterea de pe server
 * (`orders/ga4-comanda.ts`), evenimentul din browser de pe pagina de confirmare, si probele. GA4
 * pastreaza UN singur `purchase` pe `transaction_id`, deci daca browserul si serverul ar calcula
 * diferit, venitul ar depinde de care ajunge primul.
 */

// ── Cat: `value`, `shipping`, `tax` ────────────────────────────────────────────

export interface BaniComanda {
  total: number | string | null | undefined;
  shipping_cost?: number | string | null;
  cod_fee_amount?: number | string | null;
  vat_amount?: number | string | null;
  prices_include_vat?: boolean | null;
}

export interface ValoriGa4 {
  value: number;
  shipping: number;
  tax: number;
}

const bani = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const rotunjit = (n: number): number => Math.round(n * 100) / 100;

/**
 * Valorile unei achizitii, DUPA DOCUMENTATIA GA4 (evenimentele `purchase` si `refund`):
 *
 *   „Set value to the sum of (price * quantity) for all items in items. Don't include shipping or tax.”
 *
 * ═══ ⚠⚠ PANA PE 17.09.2026 SE TRIMITEA `total` ═══
 *
 * Adica valoarea produselor PLUS transportul si taxa de ramburs. La magazinele conectate, transportul
 * era intre 8% si 21% din total. Hotararea proprietarului, pe 17.09: conform documentatiei.
 *
 * ⚠ DE CE DIN `total`, NU DIN ARTICOLE. Masurat pe 304 comenzi de vitrina: 275 respecta exact
 * `total = subtotal - reduceri + transport + taxa de ramburs`, iar recalcularea din `items` ar fi pierdut
 * reducerile (cupon, card, oferta), care nu stau pe linii. Scazand din `total` ce nu e produs, raman
 * produsele DUPA reduceri, adica exact ce a platit omul pe marfa.
 *
 * ⚠ TVA-UL. La preturi cu TVA inclus (303 din 304), pretul unui articol contine deja TVA-ul, deci
 * „suma (pret x cantitate)” il contine si ea: asa scrie documentatia, nu e o abatere. La preturi FARA TVA,
 * `total` are TVA-ul adaugat peste, si acela se scoate. `tax` poarta TVA-ul oricum, separat.
 *
 * ⚠ Taxa de ramburs intra la `shipping`: e o taxa a livrarii, nu marfa.
 */
export function valoriGa4(c: BaniComanda): ValoriGa4 {
  const transport = bani(c.shipping_cost);
  const taxaRamburs = bani(c.cod_fee_amount);
  const tva = bani(c.vat_amount);
  const tvaAdaugatPeste = c.prices_include_vat === false ? tva : 0;
  return {
    value: Math.max(0, rotunjit(bani(c.total) - transport - taxaRamburs - tvaAdaugatPeste)),
    shipping: rotunjit(transport + taxaRamburs),
    tax: rotunjit(tva),
  };
}

// ── Cui: consimtamantul, pe MAGAZIN ─────────────────────────────────────────────

/** Semnalele pe care checkout-ul le scrie in `order_source`. Siruri, fiindca asa trec prin lista alba. */
export interface SemnaleComanda {
  ga_client_id?: string;
  ga_sesiuni?: string;
  consimtamant_citit?: string;
  consimtamant_analiza?: string;
  consimtamant_marketing?: string;
}

export type StareConsimtamant = "GRANTED" | "DENIED";

export type VerdictTrimitere =
  | { trimite: true; consent?: { ad_user_data: StareConsimtamant; ad_personalization: StareConsimtamant } }
  | { trimite: false; motiv: string };

/**
 * Are voie achizitia sa plece in GA4 de pe SERVER?
 *
 * ═══ ⚠⚠ DE CE EXISTA (17.09.2026) ═══
 *
 * Tag-ul din browser e in Consent Mode de BAZA: nu se incarca deloc pana cand omul nu accepta analiza.
 * Serverul, in schimb, trimitea achizitia ORICUM, iar cand `_ga` lipsea inventa un `client_id`. Dar
 * `_ga` lipseste tocmai la cine a REFUZAT. Deci exact oamenii care au spus „nu” intrau in GA pe usa din
 * spate.
 *
 * ⚠ SI UN `_ga` PREZENT NU DOVEDEA ACORDUL. Pe adresa comuna `edinio.com/<magazin>`, cookie-ul `_ga`
 * sta pe domeniul `edinio.com`, pe care il scrie si tag-ul PLATFORMEI Edinio. Acordul dat la noi pe
 * site nu e acord dat magazinului. De aceea checkout-ul fotografiaza acum acordul pentru MAGAZINUL
 * acela (`edinio_cc_<slug>`), iar regula se uita la el, nu la cookie.
 *
 * ⚠ `consent` din corp: fara el, documentatia spune ca GA ia setarile vizitei legate de `client_id`.
 * Cand stim ce a ales omul, il trimitem noi: `ad_user_data` si `ad_personalization` urmeaza alegerea
 * pentru MARKETING, ca in tag-ul din browser.
 */
export function verdictTrimitere(sursa: SemnaleComanda | null | undefined, bannerPornit: boolean): VerdictTrimitere {
  /* Comerciantul a oprit bannerul: tag-ul din browser porneste cu totul acordat, deci si serverul. */
  if (!bannerPornit) {
    return { trimite: true, consent: { ad_user_data: "GRANTED", ad_personalization: "GRANTED" } };
  }
  if (sursa?.consimtamant_citit === "da") {
    if (sursa.consimtamant_analiza !== "da") return { trimite: false, motiv: "cumparatorul nu a acceptat analiza" };
    const m: StareConsimtamant = sursa.consimtamant_marketing === "da" ? "GRANTED" : "DENIED";
    return { trimite: true, consent: { ad_user_data: m, ad_personalization: m } };
  }
  /*
   * ⚠ Comanda dinainte de fotografia acordului. Singurul semn ramas e `_ga`, cu slabiciunea scrisa mai
   * sus. Fara el nu se trimite: inainte se trimitea cu un id inventat, adica tocmai pentru cine refuzase.
   */
  if (sursa?.ga_client_id) return { trimite: true };
  return { trimite: false, motiv: "comanda fara semnal de acord si fara cookie de analiza" };
}

// ── In ce sesiune ──────────────────────────────────────────────────────────────

/**
 * `session_id` pentru fluxul acesta, din cookie-urile `_ga_<ID>` fotografiate la checkout.
 *
 * ═══ ⚠⚠ DE CE CONTEAZA ═══
 *
 * Documentatia Measurement Protocol: fara `session_id`, evenimentul nu se leaga de sesiunea in care s-a
 * intamplat, deci n-are sursa si canal. La plata cu cardul, omul adesea nu se mai intoarce pe pagina de
 * confirmare: achizitia de pe server e SINGURA, iar fara sesiune venitul cadea la „Unassigned”.
 *
 * ⚠ Documentatia accepta ca `session_id` „valoarea INTREAGA a cookie-ului de sesiune”, deci nu se
 * desface formatul (`GS1.1.…` sau `GS2.1.s…$o…`), care s-a schimbat deja o data.
 *
 * Forma stocata: `ABC123=GS2.1.s…;XYZ789=GS1.1.…` (numele fara `_ga_`).
 */
export function sesiuneaPentru(gaSesiuni: string | null | undefined, measurementId: string | null | undefined): string | undefined {
  const cheie = String(measurementId ?? "").trim().toUpperCase().replace(/^G-/, "");
  if (!cheie || !gaSesiuni) return undefined;
  for (const pereche of gaSesiuni.split(";")) {
    const i = pereche.indexOf("=");
    if (i <= 0) continue;
    if (pereche.slice(0, i).trim().toUpperCase() !== cheie) continue;
    const valoare = pereche.slice(i + 1).trim();
    return /^GS\d\.\d\./.test(valoare) ? valoare : undefined;
  }
  return undefined;
}
