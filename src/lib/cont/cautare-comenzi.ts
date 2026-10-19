import { stareaComenzii } from "./stare-comanda";

/**
 * Cautarea din „Comenzile mele”: ce se citeste din adresa, ce pleaca spre baza si cum
 * se scrie adresa inapoi.
 *
 * ⚠ Filtrul se face in BAZA (`cont_comenzile_mele`), nu pe pagina adusa: lista e
 * paginata cate 20, iar un cont are pe productie 234 de comenzi. Filtrata pe ecran,
 * cautarea ar fi gasit numai printre cele 20 de pe pagina curenta.
 *
 * ⚠ Totul vine din ADRESA, deci poate fi orice: ce nu e pe lista de mai jos se ia
 * drept „fara filtru”, nu drept eroare. Un link vechi sau scris de mana arata lista
 * intreaga, nu o pagina cazuta.
 */

/** Cel mai lung text de cautat. Un numar de comanda sau un nume de produs incap lejer. */
export const CAUTARE_MAX = 80;

/**
 * Starile din filtru, cu cheia din adresa (cum se citeste pe card, fara diacritice) si
 * starea din baza. Eticheta vine din `stareaComenzii`, ca filtrul sa spuna exact ce
 * scrie pe cardul comenzii.
 */
const STARI = [
  ["in-asteptare", "pending"],
  ["confirmata", "confirmed"],
  ["in-pregatire", "processing"],
  ["expediata", "shipped"],
  ["livrata", "delivered"],
  ["anulata", "cancelled"],
  ["rambursata", "refunded"],
] as const;

export type CheieStare = (typeof STARI)[number][0];

export const STARI_FILTRU: { cheie: CheieStare; stare: string; eticheta: string }[] = STARI.map(([cheie, stare]) => ({
  cheie, stare, eticheta: stareaComenzii(stare).label,
}));

/**
 * Perioadele, in luni calendaristice inapoi de azi.
 *
 * ⚠ Etichetele sunt SCURTE dinadins: pe un telefon de 375px lista are ~130px de text, iar
 * „Ultimele 30 de zile” iesea taiata.
 */
const PERIOADE = [
  ["o-luna", "Ultima luna", 1],
  ["3-luni", "Ultimele 3 luni", 3],
  ["6-luni", "Ultimele 6 luni", 6],
  ["1-an", "Ultimul an", 12],
] as const;

export type CheiePerioada = (typeof PERIOADE)[number][0];

export const PERIOADE_FILTRU: { cheie: CheiePerioada; eticheta: string }[] = PERIOADE.map(([cheie, eticheta]) => ({ cheie, eticheta }));

/** Ce a cerut omul, curatat. `""` = fara filtrul acela. */
export type FiltreComenzi = {
  cautare: string;
  stare: CheieStare | "";
  perioada: CheiePerioada | "";
};

export const FARA_FILTRE: FiltreComenzi = { cautare: "", stare: "", perioada: "" };

const primul = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? "" : v ?? "");

/** Filtrele din adresa (`?q=`, `?stare=`, `?perioada=`). Ce nu se recunoaste se ignora. */
export function citesteFiltrele(sp: { q?: string | string[]; stare?: string | string[]; perioada?: string | string[] }): FiltreComenzi {
  const cautare = primul(sp.q).replace(/\s+/g, " ").trim().slice(0, CAUTARE_MAX).trim();
  const stare = primul(sp.stare);
  const perioada = primul(sp.perioada);
  return {
    cautare,
    stare: STARI.some(([c]) => c === stare) ? (stare as CheieStare) : "",
    perioada: PERIOADE.some(([c]) => c === perioada) ? (perioada as CheiePerioada) : "",
  };
}

export function areFiltre(f: FiltreComenzi): boolean {
  return f.cautare !== "" || f.stare !== "" || f.perioada !== "";
}

/**
 * Inceputul perioadei, numarat inapoi de la `acum`.
 *
 * ⚠ Luni CALENDARISTICE, cu ziua plafonata la capatul lunii: 31 mai minus 3 luni e
 * 28 (sau 29) februarie, nu 3 martie, cum ar fi dat `setMonth` lasat singur.
 */
export function inceputulPerioadei(perioada: CheiePerioada, acum: Date): Date {
  const luni = PERIOADE.find(([c]) => c === perioada)![2];
  const zi = acum.getUTCDate();
  const d = new Date(acum.getTime());
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - luni);
  const zileInLuna = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(zi, zileInLuna));
  return d;
}

/**
 * Argumentele pentru `cont_comenzile_mele`, NUMAI cele cerute.
 *
 * ⚠ Fara filtre pleaca exact apelul de dinainte, cu patru argumente: lista merge si pe
 * o baza in care migratia cautarii inca nu e aplicata. Cu filtre, cere functia noua.
 */
export function argumenteleCautarii(f: FiltreComenzi, acum: Date): { p_cautare?: string; p_stare?: string; p_de_la?: string } {
  const stare = STARI.find(([c]) => c === f.stare)?.[1];
  return {
    ...(f.cautare ? { p_cautare: f.cautare } : {}),
    ...(stare ? { p_stare: stare } : {}),
    ...(f.perioada ? { p_de_la: inceputulPerioadei(f.perioada, acum).toISOString() } : {}),
  };
}

/** Partea de adresa a filtrelor, fara `?` (de lipit langa `p=`), sau `""`. */
export function parametriiFiltrelor(f: FiltreComenzi): string {
  const sp = new URLSearchParams();
  if (f.cautare) sp.set("q", f.cautare);
  if (f.stare) sp.set("stare", f.stare);
  if (f.perioada) sp.set("perioada", f.perioada);
  return sp.toString();
}

/** Adresa listei cu filtrele date, pe prima pagina. */
export function adresaComenzilor(f: FiltreComenzi): string {
  const p = parametriiFiltrelor(f);
  return p ? `/cont/comenzi?${p}` : "/cont/comenzi";
}
