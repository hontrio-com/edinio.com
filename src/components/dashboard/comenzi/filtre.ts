/*
  Filtrele din adresa ale paginii de Comenzi si asezarea in care se vede lista.

  Numele din adresa sunt cele dintotdeauna (`q`, `status`, `source`, `de_la`, `pana_la`, `page`),
  deci legaturile vechi merg mai departe. In plus: `grupa` (pentru asezarile care nu arata toate
  cele sapte stari deodata) si `pe_culoar` (cate comenzi aduce un culoar al „Fluxului").

  ⚠ ASEZAREA NU STA IN ADRESA, ci intr-un cookie. E o alegere a omului, nu un filtru: o data
  aleasa, o gaseste la fel si cand intra din meniu, dintr-o notificare sau dintr-o legatura veche.

  ⚠ Filtrarea se face in SQL, pe toate comenzile magazinului. Prima forma a prototipului filtra
  in browser ultimele 60 de comenzi, sub numere venite din toata baza, de unde „Rambursate 14"
  cu lista goala (proprietarul, 24.11.2026).

  ⚠ Modul SIMPLU, fara „use client": il citesc si pagina de pe server, si piesele din browser.
*/

import { ziuaFiltrului } from "@/lib/orders/filtrele-listei";
import { MARKETPLACE_ORIGINI } from "@/lib/orders/origin";
import { firstParam, pageParam } from "@/lib/orders/pagination";
import { ORDER_STATUS } from "@/lib/orders/status";

/* ── Asezarile ────────────────────────────────────────────────────────────── */

/**
 * In ce forma se vede lista. „registru" e cea implicita (hotarata de proprietar, 24.11.2026);
 * „clasic" e tabelul de dinainte, cu cate o coloana pentru fiecare curier si casa de facturare.
 */
export type Asezare = "registru" | "flux" | "panouri" | "zile" | "clasic";

export const ASEZARE_IMPLICITA: Asezare = "registru";

export const ASEZARI: readonly { cheie: Asezare; nume: string; peScurt: string }[] = [
  { cheie: "registru", nume: "Registru", peScurt: "Tabel curat, cu o singură coloană de livrare" },
  { cheie: "flux", nume: "Flux", peScurt: "Coloane pe etape, de la comandă nouă la livrată" },
  { cheie: "panouri", nume: "Două panouri", peScurt: "Lista în stânga, comanda deschisă în dreapta" },
  { cheie: "zile", nume: "Pe zile", peScurt: "Rânduri late, cu poze și pașii comenzii" },
  { cheie: "clasic", nume: "Tabelul de dinainte", peScurt: "Câte o coloană pentru fiecare curier și casă de facturare" },
];

/** Numele cookie-ului in care se tine asezarea aleasa. */
export const COOKIE_ASEZARE = "edinio_comenzi_asezare";

/** Asezarea scrisa in cookie; orice altceva (lipsa, text strain) e asezarea implicita. */
export function asezareDinCookie(valoare: string | null | undefined): Asezare {
  return ASEZARI.find((a) => a.cheie === valoare)?.cheie ?? ASEZARE_IMPLICITA;
}

/* ── Starile, grupele si etapele ──────────────────────────────────────────── */

/** Filele „Registrului": toate, apoi cele sapte stari, in ordinea drumului unei comenzi. */
export const STARI = [
  { cheie: "all", eticheta: "Toate" },
  { cheie: "pending", eticheta: "În așteptare" },
  { cheie: "confirmed", eticheta: "Confirmate" },
  { cheie: "processing", eticheta: "În procesare" },
  { cheie: "shipped", eticheta: "Expediate" },
  { cheie: "delivered", eticheta: "Livrate" },
  { cheie: "cancelled", eticheta: "Anulate" },
  { cheie: "refunded", eticheta: "Rambursate" },
] as const;

/** Grupele de lucru ale asezarilor care nu arata toate cele sapte stari deodata. */
export const GRUPE: readonly { cheie: string; eticheta: string; stari: readonly string[] }[] = [
  { cheie: "lucru", eticheta: "De lucru", stari: ["pending", "confirmed", "processing"] },
  { cheie: "drum", eticheta: "Pe drum", stari: ["shipped"] },
  { cheie: "incheiate", eticheta: "Încheiate", stari: ["delivered", "cancelled", "refunded"] },
  { cheie: "toate", eticheta: "Toate", stari: [] },
];

/** Cu ce grupa se deschide fiecare asezare. „Două panouri" incepe cu ce e de lucru. */
export const GRUPA_IMPLICITA: Record<Asezare, string> = { registru: "toate", flux: "toate", panouri: "lucru", zile: "toate", clasic: "toate" };

/** Asezarile care filtreaza pe o GRUPA de stari, nu pe o stare. */
const CU_GRUPE: ReadonlySet<Asezare> = new Set(["panouri", "zile"]);
/** Asezarile care filtreaza pe o singura stare. */
const CU_STARE: ReadonlySet<Asezare> = new Set(["registru", "clasic"]);

/** Etapele asezarii „Flux": ce inseamna starile pentru munca de zi cu zi. */
export const ETAPE: readonly { cheie: string; stari: readonly string[]; awb: boolean | null }[] = [
  { cheie: "noi", stari: ["pending"], awb: null },
  { cheie: "pregatit", stari: ["confirmed", "processing"], awb: false },
  { cheie: "predat", stari: ["confirmed", "processing"], awb: true },
  { cheie: "drum", stari: ["shipped"], awb: null },
  { cheie: "livrate", stari: ["delivered"], awb: null },
];

/** Cate comenzi aduce un culoar al „Fluxului": 20 la deschidere, apoi cate 20 in plus la cerere, pana la 100. */
export const PE_CULOAR = 20;
export const PE_CULOAR_MAX = 100;

/* ── Filtrele ─────────────────────────────────────────────────────────────── */

export interface FiltreComenzi {
  asezare: Asezare;
  q: string;
  /** „all" sau una dintre cele sapte stari. Il folosesc „Registrul" si tabelul de dinainte. */
  status: string;
  /** Cheia unei grupe din `GRUPE`. O folosesc „Două panouri" si „Pe zile". */
  grupa: string;
  /** „all", „store" (magazinul propriu) sau cheia unui marketplace. */
  source: string;
  /** Zile romanesti „YYYY-MM-DD"; `""` = fara capatul acela. */
  deLa: string;
  panaLa: string;
  page: number;
  /** Cate comenzi arata fiecare culoar al „Fluxului" (`?pe_culoar=`). */
  peCuloar: number;
}

export function filtreGoale(asezare: Asezare): FiltreComenzi {
  return { asezare, q: "", status: "all", grupa: GRUPA_IMPLICITA[asezare], source: "all", deLa: "", panaLa: "", page: 1, peCuloar: PE_CULOAR };
}

/**
 * Citeste filtrele din adresa, pentru asezarea data. Orice valoare necunoscuta cade pe implicit,
 * nu ajunge in interogare. Ce nu e al asezarii (starea in „Două panouri", grupa in „Registru")
 * se ignora chiar daca e in adresa: lista n-ar avea cum s-o arate.
 */
export function filtreDinAdresa(sp: Record<string, string | string[] | undefined>, asezare: Asezare): FiltreComenzi {
  const statusBrut = firstParam(sp.status) ?? "all";
  const sursaBruta = firstParam(sp.source) ?? "all";
  const grupaBruta = firstParam(sp.grupa) ?? GRUPA_IMPLICITA[asezare];
  /* Doar trepte de 20, intre 20 si 100: orice altceva din adresa cade pe 20. */
  const peCuloarBrut = Number.parseInt(firstParam(sp.pe_culoar) ?? "", 10);
  const peCuloar = Number.isFinite(peCuloarBrut) && peCuloarBrut % PE_CULOAR === 0 && peCuloarBrut >= PE_CULOAR && peCuloarBrut <= PE_CULOAR_MAX
    ? peCuloarBrut
    : PE_CULOAR;
  return {
    asezare,
    q: (firstParam(sp.q) ?? "").trim().slice(0, 80),
    status: CU_STARE.has(asezare) && Object.hasOwn(ORDER_STATUS, statusBrut) ? statusBrut : "all",
    grupa: CU_GRUPE.has(asezare) && GRUPE.some((g) => g.cheie === grupaBruta) ? grupaBruta : GRUPA_IMPLICITA[asezare],
    source: sursaBruta === "all" || sursaBruta === "store" || Object.hasOwn(MARKETPLACE_ORIGINI, sursaBruta) ? sursaBruta : "all",
    deLa: ziuaFiltrului(firstParam(sp.de_la)),
    panaLa: ziuaFiltrului(firstParam(sp.pana_la)),
    /* „Fluxul" nu are pagini: fiecare culoar isi aduce primele comenzi. */
    page: asezare === "flux" ? 1 : pageParam(sp.page),
    peCuloar: asezare === "flux" ? peCuloar : PE_CULOAR,
  };
}

/** Coada adresei pentru o stare a filtrelor (fara `?`). Ce e pe implicit nu se scrie, ca adresa sa ramana scurta. */
export function coadaFiltrelor(f: FiltreComenzi): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  /* Starea e a „Registrului", grupa a celorlalte: nu se cara una in asezarea celeilalte. */
  if (CU_STARE.has(f.asezare) && f.status !== "all") p.set("status", f.status);
  if (CU_GRUPE.has(f.asezare) && f.grupa !== GRUPA_IMPLICITA[f.asezare]) p.set("grupa", f.grupa);
  if (f.source !== "all") p.set("source", f.source);
  if (f.deLa) p.set("de_la", f.deLa);
  if (f.panaLa) p.set("pana_la", f.panaLa);
  if (f.page > 1 && f.asezare !== "flux") p.set("page", String(f.page));
  if (f.asezare === "flux" && f.peCuloar > PE_CULOAR) p.set("pe_culoar", String(f.peCuloar));
  return p.toString();
}

/** Adresa unei stari a filtrelor. */
export function adresaFiltrelor(cale: string, f: FiltreComenzi): string {
  const coada = coadaFiltrelor(f);
  return coada ? `${cale}?${coada}` : cale;
}

/** Starile cerute de grupa; lista goala = toate. */
export function stariGrupei(grupa: string): readonly string[] {
  return GRUPE.find((g) => g.cheie === grupa)?.stari ?? [];
}

/**
 * Starile pe care le arata lista cu filtrele date, ca lista pentru SQL; goala = toate.
 * Aceeasi lista o primeste si exportul, ca fisierul sa aiba exact comenzile de pe ecran.
 */
export function stariFiltrului(f: FiltreComenzi): readonly string[] {
  return CU_GRUPE.has(f.asezare) ? stariGrupei(f.grupa) : [];
}

/** Cate comenzi are o grupa, din numaratoarea pe stari. */
export function cateInGrupa(grupa: string, numarari: Record<string, number>, total: number): number {
  const stari = stariGrupei(grupa);
  return stari.length === 0 ? total : stari.reduce((s, st) => s + (numarari[st] ?? 0), 0);
}

/** Adevarat cand e pus vreun filtru in afara de asezare. */
export function areFiltre(f: FiltreComenzi): boolean {
  return !!f.q || f.source !== "all" || !!f.deLa || !!f.panaLa
    || (CU_STARE.has(f.asezare) && f.status !== "all")
    || (CU_GRUPE.has(f.asezare) && f.grupa !== GRUPA_IMPLICITA[f.asezare]);
}
