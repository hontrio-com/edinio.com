/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILTRELE SI SORTAREA LISTEI DE CODURI                          (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ FILTRAREA S-A MUTAT IN POSTGRES, si fisierul asta s-a subtiat.
 *
 * Pana ieri se filtra in memoria browserului, si era o alegere scrisa pe fata:
 * lista nu era paginata, iar masurat pe productie cel mai mare magazin avea
 * cinci coduri. Dus in baza, filtrul ar fi insemnat un drum la server pentru a
 * alege intre cinci randuri pe care omul le are sub ochi.
 *
 * Marginea de sus nu era insa numarul acela, ci plafonul PostgREST: o mie de
 * randuri. Un magazin cu peste o mie de coduri ar fi vazut lista TAIATA IN
 * TACERE. Cerut de el sa se rezolve de pe acum — deci pagina se aduce filtrata,
 * sortata si numarata din `discounts_page`.
 *
 * ⚠⚠ CE A RAMAS AICI E DOAR VOCABULARUL: ce se poate cere din adresa, si cum se
 * numesc lucrurile pe ecran. `asezate()` si `catePeStare()` au fost STERSE —
 * lasate, ar fi fost o a doua socoteala pe langa cea din baza, care s-ar fi
 * despartit de ea la prima schimbare si n-ar fi dat nicio eroare.
 */

/** Filtrele dupa stare. Ordinea e cea din meniu. */
export const FILTRE_STARE = ["toate", "activ", "oprit", "programat", "expirat", "epuizat"] as const;
export type FiltruStare = (typeof FILTRE_STARE)[number];

export const NUMELE_FILTRULUI: Record<FiltruStare, string> = {
  toate: "Toate codurile",
  activ: "Care merg acum",
  oprit: "Oprite",
  programat: "Programate",
  expirat: "Expirate",
  epuizat: "Epuizate",
};

/**
 * ⚠ Ce vine din adresa poate fi orice. Un filtru necunoscut cade pe „toate", nu
 * pe o lista goala: altfel o legatura veche sau o litera in plus ar fi golit
 * pagina fara sa spuna nimeni de ce.
 */
export function filtruValid(v: string | null | undefined): FiltruStare {
  return (FILTRE_STARE as readonly string[]).includes(v ?? "") ? (v as FiltruStare) : "toate";
}

/** Sortarile. Se trimit ca atare lui `discounts_page`. */
export const SORTARI = ["noi", "folosite", "costisitoare", "alfabetic"] as const;
export type Sortare = (typeof SORTARI)[number];

export const NUMELE_SORTARII: Record<Sortare, string> = {
  noi: "Cele mai noi",
  folosite: "Cele mai folosite",
  costisitoare: "Care au costat cel mai mult",
  alfabetic: "Alfabetic",
};

export function sortareValida(v: string | null | undefined): Sortare {
  return (SORTARI as readonly string[]).includes(v ?? "") ? (v as Sortare) : "noi";
}

/**
 * Cate coduri incap pe o pagina.
 *
 * ⚠ 25, ca la Clienti pe prima treapta. Cu 50 pe pagina, un magazin cu 60 de
 * coduri ar fi avut o singura pagina lunga si a doua aproape goala; cu 25,
 * rasfoirea are un rost.
 */
export const CODURI_PE_PAGINA = 25;

/**
 * Filtrele care au pe ce sta acum.
 *
 * ⚠ NICIUN FILTRU FARA DATE PE CARE SA CADA — aceeasi regula ca la Clienti. O
 * optiune „Programate" intr-un magazin fara niciun cod programat nu e o functie
 * in plus, e o promisiune goala care il trimite pe om sa caute un defect.
 * „Toate" ramane mereu, si la fel filtrul ALES acum — altfel meniul si-ar pierde
 * sub deget optiunea pe care tocmai a apasat-o.
 *
 * ⚠ Cifrele vin din `discount_state_counts`, adica numarate PESTE CAUTARE si in
 * baza. Numarate din pagina adusa, „Expirate (3)" ar fi insemnat „trei pe
 * pagina asta".
 */
export function filtreCuRost(
  cate: Partial<Record<FiltruStare, number>>,
  alesAcum: FiltruStare,
): FiltruStare[] {
  return FILTRE_STARE.filter((f) => f === "toate" || f === alesAcum || (cate[f] ?? 0) > 0);
}

/** Cate coduri se potrivesc cu filtrul, pentru cifra de langa numele lui. */
export function cateLaFiltru(cate: Partial<Record<FiltruStare, number>>, f: FiltruStare): number {
  if (f !== "toate") return cate[f] ?? 0;
  return (Object.keys(cate) as FiltruStare[])
    .filter((k) => k !== "toate")
    .reduce((s, k) => s + (cate[k] ?? 0), 0);
}
