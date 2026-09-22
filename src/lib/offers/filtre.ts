import { STARI_OFERTA, type StareOferta } from "./stare";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILTRELE ȘI SORTAREA LISTEI DE OFERTE                         (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ AICI STĂ DOAR VOCABULARUL: ce se poate cere din adresă și cum se numesc
 * lucrurile pe ecran. Filtrarea, sortarea și numărătoarea se fac în Postgres
 * (`offers_page`, `offer_state_counts`) — scrise și aici, ar fi fost o a doua
 * socoteală care se desparte de cea din bază la prima schimbare, fără să dea
 * vreo eroare. Aceeași hotărâre ca la Discounturi.
 *
 * ⚠⚠ FILTRELE SE DERIVĂ DIN `STARI_OFERTA`, nu se înșiră a doua oară. Scrise de
 * mână, o stare nouă ar fi apărut în tabel și n-ar fi avut filtru — sau invers,
 * filtrul ar fi rămas după ce starea a fost scoasă, și n-ar fi găsit nimic.
 */

export const FILTRE_STARE = ["toate", ...STARI_OFERTA] as const;
export type FiltruStare = (typeof FILTRE_STARE)[number];

export const NUMELE_FILTRULUI: Record<FiltruStare, string> = {
  toate: "Toate ofertele",
  activ: "Care merg acum",
  oprit: "Oprite",
  programat: "Programate",
  expirat: "Expirate",
};

/**
 * ⚠ Ce vine din adresă poate fi orice. Un filtru necunoscut cade pe „toate”, nu
 * pe o listă goală: altfel o legătură veche sau o literă în plus ar fi golit
 * pagina fără să spună nimeni de ce.
 */
export function filtruValid(v: string | null | undefined): FiltruStare {
  return (FILTRE_STARE as readonly string[]).includes(v ?? "") ? (v as FiltruStare) : "toate";
}

/** Sortările. Se trimit ca atare lui `offers_page`. */
export const SORTARI = ["noi", "vazute", "acceptate", "venit", "alfabetic"] as const;
export type Sortare = (typeof SORTARI)[number];

export const NUMELE_SORTARII: Record<Sortare, string> = {
  noi: "Cele mai noi",
  vazute: "Cele mai văzute",
  acceptate: "Cele mai acceptate",
  venit: "Care au adus cei mai mulți bani",
  alfabetic: "Alfabetic",
};

export function sortareValida(v: string | null | undefined): Sortare {
  return (SORTARI as readonly string[]).includes(v ?? "") ? (v as Sortare) : "noi";
}

/**
 * Câte oferte încap pe o pagină.
 *
 * ⚠ 25, ca la Clienți și la Discounturi. Cu 50 pe pagină, un magazin cu 60 de
 * oferte ar fi avut o singură pagină lungă și a doua aproape goală.
 */
export const OFERTE_PE_PAGINA = 25;

/** Cuvintele ofertelor, pentru rezumatul de sub listă. */
export const CUVINTELE_OFERTELOR = {
  niciunul: "Nicio ofertă",
  unul: "ofertă",
  putine: "oferte",
  multe: "de oferte",
} as const;

/**
 * Filtrele care au pe ce sta acum.
 *
 * ⚠ NICIUN FILTRU FĂRĂ DATE PE CARE SĂ CADĂ — aceeași regulă ca la Clienți și la
 * Discounturi. O opțiune „Programate” într-un magazin fără nicio ofertă
 * programată nu e o funcție în plus, e o promisiune goală care îl trimite pe om
 * să caute un defect. „Toate” rămâne mereu, și la fel filtrul ALES acum —
 * altfel meniul și-ar pierde sub deget opțiunea pe care tocmai a apăsat-o.
 *
 * ⚠ Cifrele vin din `offer_state_counts`, adică numărate PESTE CĂUTARE și în
 * bază. Numărate din pagina adusă, „Expirate (3)” ar fi însemnat „trei pe pagina
 * asta”.
 */
export function filtreCuRost(
  cate: Partial<Record<FiltruStare, number>>,
  alesAcum: FiltruStare,
): FiltruStare[] {
  return FILTRE_STARE.filter((f) => f === "toate" || f === alesAcum || (cate[f] ?? 0) > 0);
}

/** Câte oferte se potrivesc cu filtrul, pentru cifra de lângă numele lui. */
export function cateLaFiltru(cate: Partial<Record<FiltruStare, number>>, f: FiltruStare): number {
  if (f !== "toate") return cate[f] ?? 0;
  return (Object.keys(cate) as FiltruStare[])
    .filter((k) => k !== "toate")
    .reduce((s, k) => s + (cate[k] ?? 0), 0);
}

/** Starea venită din bază, curățată. Orice altceva e tratat ca „oprit”. */
export function stareDinBaza(v: unknown): StareOferta {
  return (STARI_OFERTA as readonly string[]).includes(String(v)) ? (v as StareOferta) : "oprit";
}
