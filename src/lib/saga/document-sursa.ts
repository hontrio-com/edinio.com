/**
 * Documentele unei comenzi, la toate cele sase case de facturare: ce poate pleca in SAGA si ce nu.
 *
 * Modul PUR: nu stie de baza, de retea sau de sesiune. Il cheama pagina comenzii (panoul), lotul,
 * butonul, cronul si garda de reemitere, cu acelasi rand de comanda.
 *
 * ═══ CE E PE COMANDA ═══
 *
 * Fiecare casa isi tine pe randul comenzii factura si, daca exista, stornarea EI. Dupa o stornare
 * urmata de reemitere LA ACEEASI casa, casa scrie factura noua peste cea veche si sterge stornarea
 * (vezi `slotFacturare`); documentele desfiintate raman in contul casei si, daca au plecat, in SAGA si
 * in jurnalul nostru (vezi `facturiInlocuiteFaraStornare`).
 *
 * ⚠⚠ TOATE CASELE, NU DOAR PRIMA (17.11.2026). O factura stornata la o casa si reemisa la ALTA lasa
 * pe comanda doua perechi: cea veche (factura + stornarea, la prima casa) si cea noua (la a doua).
 * Luata doar prima casa din ordinea dispecerului, pleca perechea anulata, iar factura vie NICIODATA.
 * Contabilitatea oglindeste tot ce s-a emis, deci pleaca toate documentele, de la toate casele.
 *
 * ⚠ CHEIA, NU NUMARUL, spune ca exista factura la Facturis, Factureaza.ro si easybill (casele care
 * intorc la emitere doar id-ul). Dar in SAGA pleaca NUMARUL: o factura cu cheie si fara numar exista,
 * insa nu poate pleca inca. Se spune, nu se sare in tacere.
 *
 * ⚠ DOCUMENTELE DE TEST NU PLEACA. Un document fGO emis in modul de testare are numar, serie si link
 * ca unul adevarat; il tradeaza doar gazda linkului (`testuat.fgo.ro`). Factureaza.ro il tradeaza prin
 * cheia `test:` (sandbox-ul lor). Intrat in contabilitate, ar fi o vanzare care n-a avut loc.
 */

import { eDocumentDeTest } from "@/lib/billing/factura-comenzii";
import { eDocumentDeTestFactureaza } from "@/lib/factureaza/config";
import {
  CASE_FACTURARE, NUME_CASA, STARI_INTRATE, type CasaFacturare, type StareExport, type TipDocumentSaga,
} from "./config";

/** Coloanele de document ale comenzii, la toate cele sase case. Pentru selecturi. */
export const COLOANE_DOCUMENTE = [
  "smartbill_invoice_series", "smartbill_invoice_number", "smartbill_invoice_url",
  "smartbill_storno_series", "smartbill_storno_number",
  "oblio_invoice_series", "oblio_invoice_number", "oblio_invoice_link",
  "oblio_storno_series", "oblio_storno_number", "oblio_storno_link",
  "fgo_invoice_series", "fgo_invoice_number", "fgo_invoice_link",
  "fgo_storno_series", "fgo_storno_number",
  "facturis_invoice_key", "facturis_invoice_series", "facturis_invoice_number",
  "facturis_storno_key", "facturis_storno_series", "facturis_storno_number",
  "factureaza_invoice_key", "factureaza_invoice_series", "factureaza_invoice_number",
  "factureaza_storno_key", "factureaza_storno_series", "factureaza_storno_number",
  "easybill_invoice_key", "easybill_invoice_series", "easybill_invoice_number",
  "easybill_storno_key", "easybill_storno_series", "easybill_storno_number",
] as const;

type ColoanaDocument = (typeof COLOANE_DOCUMENTE)[number];

/** Randul comenzii, cat ii trebuie modulului. Orice rand mai larg (de pilda `select("*")`) se potriveste. */
export type RandCuDocumente = { [K in ColoanaDocument]?: string | null };

/**
 * De ce nu poate pleca un document:
 *   test        emis in modul de testare: nu e document fiscal, nu pleaca niciodata;
 *   necitit     numarul nu s-a citit inca de la casa: pleaca dupa ce se citeste;
 *   necunoscut  numarul stornarii nu e cunoscut in Edinio (rezerva SmartBill): nu poate pleca de aici.
 */
export type MotivBlocaj = "test" | "necitit" | "necunoscut";

/** Un document emis, gata de identificat in SAGA. */
export interface DocumentSursa {
  casa: CasaFacturare;
  tip: TipDocumentSaga;
  serie: string;
  numar: string;
  /** Id-ul documentului la casa (Facturis, Factureaza.ro, easybill), altfel `null`. */
  cheieCasa: string | null;
  /** Ce pleaca in `<FacturaNumar>`: seria lipita de numar, ca in `facturaComenzii` („EDN0001"). */
  numarComplet: string;
  /** „Factura SmartBill EDN0001", pentru mesaje. */
  eticheta: string;
  /**
   * Cheia documentului, stabila intre incercari: tip, casa, serie si numar. Din ea se face cheia
   * registrului (`export:saga:<cheie>`), deci acelasi document nu intra de doua ori in contabilitate.
   */
  cheie: string;
  /** De ce nu poate pleca acum. `null` = poate. */
  blocaj: string | null;
  motivBlocaj: MotivBlocaj | null;
}

/** Factura unei case si stornarea ei. */
export interface PerecheDeDocumente {
  casa: CasaFacturare;
  factura: DocumentSursa;
  storno: DocumentSursa | null;
}

export interface DocumenteleComenzii {
  /** Perechile de la TOATE casele cu o factura pe comanda, in ordinea dispecerului. */
  perechi: PerecheDeDocumente[];
  /** Casele cu o factura NESTORNATA. Normal: cel mult una; doua inseamna doua facturi vii. */
  nestornate: CasaFacturare[];
}

/** Casele care intorc la emitere doar id-ul documentului: acolo cheia spune ca exista factura. */
const CU_CHEIE: ReadonlySet<CasaFacturare> = new Set<CasaFacturare>(["facturis", "factureaza", "easybill"]);

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Seria si numarul, lipite pentru `<FacturaNumar>`.
 *
 * ⚠ Fara separator, ca `facturaComenzii` (urcarea la marketplace) si ca numerele din e-Factura:
 * acelasi document trebuie sa poarte acelasi numar peste tot unde il cauta contabilul. Spatiile din
 * interior cad: „EDN 0001" si „EDN0001" sunt acelasi document.
 */
export function numarComplet(serie: string, numar: string): string {
  return `${serie}${numar}`.replace(/\s+/g, "");
}

/**
 * Cheia documentului. ⚠ Seria si numarul se tin DESPARTITE (`#`): lipite, „EDN1"+"23" si
 * „EDN12"+"3" ar fi dat aceeasi cheie, iar registrul ar fi luat al doilea document drept primul.
 */
export function cheiaDocumentului(tip: TipDocumentSaga, casa: CasaFacturare, serie: string, numar: string): string {
  return `${tip}:${casa}:${serie.replace(/\s+/g, "")}#${numar.replace(/\s+/g, "")}`;
}

function eticheta(tip: TipDocumentSaga, casa: CasaFacturare, complet: string): string {
  return `${tip === "factura" ? "Factura" : "Stornarea"} ${NUME_CASA[casa]} ${complet}`.trim();
}

type Brut = { cheie: string | null; serie: string; numar: string; link: string | null };

/** Coloanele facturii si ale stornarii, la o casa. */
function coloane(o: RandCuDocumente, casa: CasaFacturare): { factura: Brut; storno: Brut } {
  const r = o as Record<string, unknown>;
  const linkFactura = casa === "smartbill" ? r.smartbill_invoice_url
    : casa === "oblio" ? r.oblio_invoice_link
    : casa === "fgo" ? r.fgo_invoice_link
    : null;
  const linkStorno = casa === "oblio" ? r.oblio_storno_link : null;
  return {
    factura: {
      cheie: CU_CHEIE.has(casa) ? text(r[`${casa}_invoice_key`]) || null : null,
      serie: text(r[`${casa}_invoice_series`]),
      numar: text(r[`${casa}_invoice_number`]),
      link: text(linkFactura) || null,
    },
    storno: {
      cheie: CU_CHEIE.has(casa) ? text(r[`${casa}_storno_key`]) || null : null,
      serie: text(r[`${casa}_storno_series`]),
      numar: text(r[`${casa}_storno_number`]),
      link: text(linkStorno) || null,
    },
  };
}

/** Exista documentul la casa asta? La casele cu cheie, cheia; la celelalte, numarul. */
function exista(b: Brut, casa: CasaFacturare): boolean {
  return CU_CHEIE.has(casa) ? !!b.cheie : !!b.numar;
}

function document(
  casa: CasaFacturare,
  tip: TipDocumentSaga,
  b: Brut,
  motiv: MotivBlocaj | null,
  blocaj: string | null,
): DocumentSursa {
  const complet = numarComplet(b.serie, b.numar);
  return {
    casa,
    tip,
    serie: b.serie,
    numar: b.numar,
    cheieCasa: b.cheie,
    numarComplet: complet,
    eticheta: complet ? eticheta(tip, casa, complet) : `${tip === "factura" ? "Factura" : "Stornarea"} ${NUME_CASA[casa]}`,
    cheie: cheiaDocumentului(tip, casa, b.serie, b.numar || `id-${b.cheie ?? ""}`),
    blocaj,
    motivBlocaj: motiv,
  };
}

/** Perechea unei case, sau `null` cand casa n-are factura pe comanda. */
function perecheaCasei(o: RandCuDocumente, casa: CasaFacturare): PerecheDeDocumente | null {
  const { factura: f, storno: s } = coloane(o, casa);
  if (!exista(f, casa)) return null;

  /* ── factura ── */
  /* Documentele de proba: fGO dupa gazda linkului, Factureaza.ro dupa cheia `test:` (sandbox-ul lor). */
  const deTest = (casa === "fgo" && !!f.link && eDocumentDeTest(f.link))
    || (casa === "factureaza" && eDocumentDeTestFactureaza(f.cheie));
  const factura = deTest
    ? document(casa, "factura", f, "test", `Factura a fost emisă în modul de testare ${NUME_CASA[casa]}, deci nu e un document fiscal și nu pleacă în contabilitate.`)
    : !f.numar
      ? document(casa, "factura", f, "necitit", `Numărul facturii ${NUME_CASA[casa]} nu s-a citit încă. Citește-l din cardul Facturare, apoi trimite-o.`)
      : document(casa, "factura", f, null, null);

  /* ── stornarea ── */
  let storno: DocumentSursa | null = null;
  if (exista(s, casa)) {
    if (deTest) {
      storno = document(casa, "storno", s, "test", "Stornarea unei facturi de test nu pleacă în contabilitate.");
    } else if (casa === "oblio" && s.link && eDocumentDeTest(s.link)) {
      storno = document(casa, "storno", s, "test", "Stornarea a fost emisă în modul de testare, deci nu e un document fiscal.");
    } else if (!s.numar) {
      storno = document(casa, "storno", s, "necitit", `Numărul stornării ${NUME_CASA[casa]} nu s-a citit încă. Citește-l din cardul Facturare, apoi trimite-o.`);
    } else if (numarComplet(s.serie, s.numar) === numarComplet(f.serie, f.numar)) {
      /*
       * ⚠ REZERVA SMARTBILL. Cand SmartBill nu intoarce numarul notei de credit, pe comanda se scrie
       * numarul FACTURII STORNATE (ca stornarea sa nu se repete). Plecata asa, in SAGA ar intra doua
       * documente cu acelasi numar. Numarul adevarat se ia din contul casei.
       */
      storno = document(casa, "storno", s, "necunoscut", `Numărul stornării nu e cunoscut în Edinio (comanda poartă numărul facturii stornate). Introdu stornarea în SAGA după documentul din ${NUME_CASA[casa]}.`);
    } else {
      storno = document(casa, "storno", s, null, null);
    }
  }
  return { casa, factura, storno };
}

/**
 * Documentele comenzii: perechea factura/stornare a FIECAREI case care are o factura pe comanda.
 *
 * ⚠ Blocajele se spun pe document, nu se arunca documentul: panoul trebuie sa poata scrie DE CE nu
 * pleaca o factura care exista (numar necitit, document de test), altfel comerciantul ar crede ca
 * integrarea nu merge.
 */
export function documenteleComenzii(o: RandCuDocumente | null | undefined): DocumenteleComenzii {
  if (!o) return { perechi: [], nestornate: [] };
  const perechi = CASE_FACTURARE
    .map((c) => perecheaCasei(o, c))
    .filter((p): p is PerecheDeDocumente => p !== null);
  return { perechi, nestornate: perechi.filter((p) => !p.storno).map((p) => p.casa) };
}

/** Toate documentele, in ordinea in care pleaca: pe case, factura inaintea stornarii ei. */
export function toateDocumentele(d: DocumenteleComenzii): DocumentSursa[] {
  return d.perechi.flatMap((p) => (p.storno ? [p.factura, p.storno] : [p.factura]));
}

/* ═══════════════════════════════════════════════════════════════════════════
   DATA DOCUMENTULUI, din registrul de operatii externe
   ═══════════════════════════════════════════════════════════════════════════ */

/** Un rand `reusit` din `operatii_externe`, cat trebuie pentru data documentului. */
export interface EmitereInRegistru {
  fel: string;
  furnizor: string;
  referinta: string | null;
  creatLa: string;
  /** `detalii` randului. Casele scriu acolo `data` („YYYY-MM-DD"), ziua de pe document (contractul C1). */
  detalii?: unknown;
}

/**
 * Ziua calendaristica a unei clipe, in ora Romaniei: „YYYY-MM-DD".
 *
 * ⚠ Un document emis la 01:30 ora Romaniei e, in UTC, inca in ziua de dinainte; in contabilitate ar
 * fi cazut in alta zi, si la cumpana lunii, in alta perioada de TVA.
 */
export function ziuaInRomania(clipa: string | Date): string | null {
  const d = clipa instanceof Date ? clipa : new Date(clipa);
  if (Number.isNaN(d.getTime())) return null;
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const v = (t: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")}`;
}

/** Ziua UTC a unei clipe: „YYYY-MM-DD". */
export function ziuaUtc(clipa: string | Date): string | null {
  const d = clipa instanceof Date ? clipa : new Date(clipa);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Casele care pun pe document ZIUA UTC a emiterii (`new Date().toISOString().split("T")[0]`, in
 * `smartbill.actions.ts` si `oblio.actions.ts`), nu ziua Romaniei. Intre 00:00 si 02:00/03:00 ora
 * noastra, cele doua difera; in SAGA trebuie sa intre ziua scrisa PE document.
 */
const ZI_UTC: ReadonlySet<CasaFacturare> = new Set<CasaFacturare>(["smartbill", "oblio"]);

/** O zi valida „YYYY-MM-DD" (si 30 februarie cade), sau `null`. */
export function ziValida(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [an, luna, zi] = v.split("-").map(Number);
  const d = new Date(Date.UTC(an, luna - 1, zi));
  return d.getUTCFullYear() === an && d.getUTCMonth() === luna - 1 && d.getUTCDate() === zi ? v : null;
}

/**
 * Randul de registru al emiterii acestui document: cel a carui referinta e CHIAR documentul (numarul,
 * seria lipita de numar, sau id-ul la casele cu cheie). Dintre mai multe potrivite, cel mai nou.
 *
 * ⚠⚠ FARA POTRIVIRE, `null`, NU „cel mai nou rand al casei". Pe o comanda refacturata, randul cel mai
 * nou poate fi al ALTUI document (factura noua, alta stornare), iar data lui ar fi intrat in SAGA pe
 * documentul gresit: alta zi, poate alta perioada de TVA. Lipsa datei e un blocaj spus, nu o ghicire.
 */
export function emitereaDocumentului(
  doc: DocumentSursa,
  emiteri: readonly EmitereInRegistru[],
): EmitereInRegistru | null {
  const referinte = new Set(
    [doc.numar, doc.numarComplet, doc.cheieCasa ?? ""].map((x) => x.replace(/\s+/g, "")).filter(Boolean),
  );
  const potrivit = emiteri.filter((e) => e.fel === doc.tip
    && e.furnizor === doc.casa
    && !Number.isNaN(Date.parse(e.creatLa))
    && referinte.has((e.referinta ?? "").replace(/\s+/g, "")));
  if (potrivit.length === 0) return null;
  return potrivit.reduce((a, e) => (Date.parse(e.creatLa) > Date.parse(a.creatLa) ? e : a));
}

/**
 * Ziua documentului („YYYY-MM-DD"), sau `null` cand nu se poate afla. In ordine:
 *   1. `detalii.data` din randul emiterii, cand e o zi valida: e ziua scrisa PE document (C1);
 *   2. la SmartBill si Oblio, ziua UTC a randului (asa isi dateaza ele documentele);
 *   3. la celelalte, ziua Romaniei a randului.
 *
 * ⚠ `null` cand nu exista randul documentului: s-a emis in afara Edinio (sau inainte de registru,
 * 20.08.2026). Nu se ghiceste: o data gresita muta vanzarea in alta perioada fiscala.
 */
export function dataDocumentului(doc: DocumentSursa, emiteri: readonly EmitereInRegistru[]): string | null {
  const e = emitereaDocumentului(doc, emiteri);
  if (!e) return null;
  const dinDetalii = e.detalii && typeof e.detalii === "object" ? ziValida((e.detalii as { data?: unknown }).data) : null;
  if (dinDetalii) return dinDetalii;
  return ZI_UTC.has(doc.casa) ? ziuaUtc(e.creatLa) : ziuaInRomania(e.creatLa);
}

/* ═══════════════════════════════════════════════════════════════════════════
   FACTURILE INLOCUITE: au intrat in SAGA, iar stornarea lor nu
   ═══════════════════════════════════════════════════════════════════════════ */

/** Un rand din jurnalul trimiterilor, cat trebuie aici. */
export interface IncercareInJurnal {
  cheie: string;
  casa: CasaFacturare;
  tip: TipDocumentSaga;
  serie: string;
  numar: string;
  stare: StareExport;
}

/** In SAGA, sau poate in SAGA (`necunoscut`): pentru o factura, amandoua cer stornarea ei acolo. */
const POATE_IN_SAGA = (s: StareExport) => STARI_INTRATE.includes(s) || s === "necunoscut";

/**
 * Facturile intrate in SAGA care NU mai sunt pe comanda (casa le-a inlocuit dupa o stornare) si
 * pentru care n-a intrat in SAGA nicio stornare.
 *
 * ⚠⚠ DE CE. La reemiterea LA ACEEASI casa, casa scrie factura noua peste cea veche si STERGE stornarea
 * de pe comanda. Daca stornarea n-apucase sa plece, ea nu mai e nicaieri de unde s-o vedem: in SAGA
 * raman factura veche si cea noua, adica venitul dublat, fara nicio urma pe comanda. Garda de reemitere
 * (`sagaPermiteReemiterea`) o opreste pe drumul manual; asta e plasa pentru tot restul.
 *
 * Se socoteste PE CASA: fiecare factura inlocuita are nevoie de o stornare veche (nu cea vie: aceea e a
 * facturii vii) intrata in SAGA. Se semnaleaza numai cand registrul chiar are o stornare reusita la acea
 * casa: altfel factura n-a fost stornata prin Edinio si nu stim ce s-a intamplat cu ea.
 *
 * `jurnal`: incercarile comenzii, de la cea mai noua la cea mai veche.
 */
export function facturiInlocuiteFaraStornare(
  perechi: readonly PerecheDeDocumente[],
  jurnal: readonly IncercareInJurnal[],
  emiteri: readonly EmitereInRegistru[],
): { casa: CasaFacturare; numarComplet: string; eticheta: string }[] {
  const vii = new Set(perechi.flatMap((p) => (p.storno ? [p.factura.cheie, p.storno.cheie] : [p.factura.cheie])));
  const ultime = new Map<string, IncercareInJurnal>();
  for (const r of jurnal) if (!ultime.has(r.cheie)) ultime.set(r.cheie, r);

  const iesire: { casa: CasaFacturare; numarComplet: string; eticheta: string }[] = [];
  for (const casa of CASE_FACTURARE) {
    const aleCasei = [...ultime.values()].filter((r) => r.casa === casa && !vii.has(r.cheie));
    const inlocuite = aleCasei.filter((r) => r.tip === "factura" && POATE_IN_SAGA(r.stare));
    if (inlocuite.length === 0) continue;
    const stornariIntrate = aleCasei.filter((r) => r.tip === "storno" && STARI_INTRATE.includes(r.stare)).length;
    if (!emiteri.some((e) => e.fel === "storno" && e.furnizor === casa)) continue;
    if (inlocuite.length <= stornariIntrate) continue;
    for (const f of inlocuite) {
      const complet = numarComplet(f.serie, f.numar);
      iesire.push({ casa, numarComplet: complet, eticheta: eticheta("factura", casa, complet) });
    }
  }
  return iesire;
}
