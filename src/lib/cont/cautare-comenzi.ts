import { inceputulZilei, sfarsitulZilei, ziValida } from "@/lib/zi-romaneasca";
import { stareaComenzii } from "./stare-comanda";

/**
 * Cautarea din „Comenzile mele”: ce se citeste din adresa, ce pleaca spre baza si cum
 * se scrie adresa inapoi.
 *
 * Din 23.11.2026 (cerut de un magazin ai carui clienti cu cont comanda pentru altii): textul
 * cautat gaseste si numele destinatarului, telefonul si numarul AWB, iar perioada se poate
 * spune si pe zile, „de la / pana la”. Aceleasi filtre le primeste si raportul descarcat
 * (`raport-comenzi.ts`).
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

/**
 * Ce a cerut omul, curatat. `""` = fara filtrul acela.
 *
 * ⚠ `deLa` / `panaLa` (cerut 23.11.2026: raport „de la 15.11 la 30.11”) sunt ZILE romanesti
 * scrise „YYYY-MM-DD” si LIPSESC din obiect cand nu sunt cerute: asa, un filtru fara interval
 * arata exact ca inainte. Cand exista macar una, perioada din lista („Ultimele 3 luni”) nu se
 * mai aplica: omul a spus zilele pe nume.
 */
export type FiltreComenzi = {
  cautare: string;
  stare: CheieStare | "";
  perioada: CheiePerioada | "";
  deLa?: string;
  panaLa?: string;
};

export const FARA_FILTRE: FiltreComenzi = { cautare: "", stare: "", perioada: "" };

const primul = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? "" : v ?? "");

type AdresaFiltrelor = {
  q?: string | string[]; stare?: string | string[]; perioada?: string | string[];
  de_la?: string | string[]; pana_la?: string | string[];
};

/** Filtrele din adresa (`?q=`, `?stare=`, `?perioada=`, `?de_la=`, `?pana_la=`). Ce nu se recunoaste se ignora. */
export function citesteFiltrele(sp: AdresaFiltrelor): FiltreComenzi {
  const cautare = primul(sp.q).replace(/\s+/g, " ").trim().slice(0, CAUTARE_MAX).trim();
  const stare = primul(sp.stare);
  const perioada = primul(sp.perioada);
  let deLa = primul(sp.de_la).trim();
  let panaLa = primul(sp.pana_la).trim();
  if (!ziValida(deLa)) deLa = "";
  if (!ziValida(panaLa)) panaLa = "";
  /* Zilele scrise pe dos se intorc: „de la 30, pana la 15” e o greseala de tastare, nu o lista goala. */
  if (deLa && panaLa && deLa > panaLa) [deLa, panaLa] = [panaLa, deLa];
  const areInterval = deLa !== "" || panaLa !== "";
  return {
    cautare,
    stare: STARI.some(([c]) => c === stare) ? (stare as CheieStare) : "",
    /* Cu zilele spuse pe nume, perioada din lista nu se mai aplica. */
    perioada: !areInterval && PERIOADE.some(([c]) => c === perioada) ? (perioada as CheiePerioada) : "",
    ...(deLa ? { deLa } : {}),
    ...(panaLa ? { panaLa } : {}),
  };
}

export function areFiltre(f: FiltreComenzi): boolean {
  return f.cautare !== "" || f.stare !== "" || f.perioada !== "" || !!f.deLa || !!f.panaLa;
}

/**
 * Textul cautat, cum pleaca spre baza.
 *
 * ⚠ Un numar de telefon sau un AWB scris cu spatii („0722 123 456”, „+40 722 123 456”) ar fi
 * fost taiat de baza in cuvinte, iar „+40” singur nu se gaseste nicaieri: comanda n-ar fi iesit.
 * Cand TOT textul e facut din cifre si semne de numar, cu cel putin sapte cifre, pleaca lipit,
 * numai cifrele. In adresa si in camp ramane ce a scris omul.
 */
export function textulDeCautat(cautare: string): string {
  const t = cautare.trim();
  if (!/^[\d\s+()./-]+$/.test(t)) return t;
  const cifre = t.replace(/\D/g, "");
  return cifre.length >= 7 ? cifre : t;
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
export function argumenteleCautarii(
  f: FiltreComenzi,
  acum: Date,
): { p_cautare?: string; p_stare?: string; p_de_la?: string; p_pana_la?: string } {
  const stare = STARI.find(([c]) => c === f.stare)?.[1];
  /* Zilele spuse pe nume sunt zile ROMANESTI, cu amandoua capetele incluse (`zi-romaneasca.ts`). */
  const deLa = inceputulZilei(f.deLa);
  const panaLa = sfarsitulZilei(f.panaLa);
  const areInterval = deLa !== null || panaLa !== null;
  return {
    ...(f.cautare ? { p_cautare: textulDeCautat(f.cautare) } : {}),
    ...(stare ? { p_stare: stare } : {}),
    ...(deLa ? { p_de_la: deLa } : !areInterval && f.perioada ? { p_de_la: inceputulPerioadei(f.perioada, acum).toISOString() } : {}),
    /* ⚠ `p_pana_la` exista numai in functia de dupa migratia din 23.11.2026; nu pleaca necerut. */
    ...(panaLa ? { p_pana_la: panaLa } : {}),
  };
}

/** Partea de adresa a filtrelor, fara `?` (de lipit langa `p=`), sau `""`. */
export function parametriiFiltrelor(f: FiltreComenzi): string {
  const sp = new URLSearchParams();
  if (f.cautare) sp.set("q", f.cautare);
  if (f.stare) sp.set("stare", f.stare);
  if (f.perioada && !f.deLa && !f.panaLa) sp.set("perioada", f.perioada);
  if (f.deLa) sp.set("de_la", f.deLa);
  if (f.panaLa) sp.set("pana_la", f.panaLa);
  return sp.toString();
}

/** Adresa listei cu filtrele date, pe prima pagina. */
export function adresaComenzilor(f: FiltreComenzi): string {
  const p = parametriiFiltrelor(f);
  return p ? `/cont/comenzi?${p}` : "/cont/comenzi";
}
