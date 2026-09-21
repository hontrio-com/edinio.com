import { extindeCategoriile } from "@/lib/offers/offer-pricing";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UN COD CARE MERGE DOAR PE ANUMITE PRODUSE                     (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ POTRIVIREA E ÎMPRUMUTATĂ DE LA OFERTE, nu scrisă a doua oară.
 *
 * Sistemul de oferte răspunde deja, în ACELAȘI checkout și pe ACEEAȘI comandă,
 * la întrebarea „e produsul ăsta în categoria asta?” — prin `extindeCategoriile`
 * și `triggerMatchesProduct`. Două răspunsuri deosebite la aceeași întrebare, în
 * aceeași plasare de comandă, ar fi fost cel mai urât fel de defect: fiecare în
 * parte pare corect, iar comerciantul vede doar că „uneori nu se aplică”.
 *
 * De-aia se cheamă chiar funcția lor.
 *
 * ⚠⚠ CATEGORIILE SE POTRIVESC PE NUME, NU PE ID, și nu din lene: `products`
 * poartă `category text`, un singur NUME, și nu există nicio tabelă de legătură
 * produs–categorie. Un id ar fi trebuit oricum desfăcut în nume ca să se poată
 * potrivi. Urmările, amândouă scrise aici ca să nu pară scăpări:
 *
 *   * o categorie **redenumită** din Categorii scoate produsele din campanie,
 *     în tăcere. La fel se poartă și ofertele, de mult;
 *   * două categorii ale aceluiași magazin pot purta ACELAȘI nume sub părinți
 *     deosebiți (unicitatea e pe `business_id, parent_id, name`), deci o
 *     restrângere pe „Accesorii” le prinde pe amândouă.
 *
 * ⚠ SE COBOARĂ TOT SUBARBORELE. Comerciantul alege dintr-un arbore și alege
 * firesc un părinte („Scule”), în timp ce produsele stau în frunze („Scule >
 * Bormașini > Percutante”). La fel fac ofertele.
 */

export const FELURI_RESTRANGERE = ["tot", "produse", "categorii"] as const;
export type FelRestrangere = (typeof FELURI_RESTRANGERE)[number];

export interface Restrangere {
  fel: FelRestrangere;
  /** `fel === "produse"`: id-urile produselor pe care merge codul. */
  produse: string[];
  /** `fel === "categorii"`: NUMELE categoriilor (se potrivesc cu `products.category`). */
  categorii: string[];
}

export const FARA_RESTRANGERE: Restrangere = { fel: "tot", produse: [], categorii: [] };

function siruri(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out = v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
  return [...new Set(out)];
}

/**
 * Citește restrângerea din coloana `jsonb`, apărându-se de orice.
 *
 * ⚠ Nu aruncă niciodată: coloana e `jsonb` liber, iar o restrângere stricată nu
 * are voie să oprească un checkout. Cade pe „merge pe tot”, adică pe purtarea
 * de dinainte de etapa asta.
 *
 * ⚠⚠ DAR UN FEL ALES FĂRĂ NICIO LISTĂ **NU** CADE PE „TOT”. „Doar pe produsele
 * astea”, cu lista goală, înseamnă „pe niciun produs” — iar citit ca „pe tot”,
 * un cod restrâns greșit ar fi dat reducerea pe întreg coșul. Vezi
 * `restrangereValida`, care îl oprește în formular; aici se păstrează felul, ca
 * potrivirea să iasă goală și codul să fie refuzat.
 */
export function parseRestrangere(raw: unknown): Restrangere {
  const r = (raw ?? {}) as Record<string, unknown>;
  const fel = (FELURI_RESTRANGERE as readonly string[]).includes(r.fel as string)
    ? (r.fel as FelRestrangere)
    : "tot";
  return { fel, produse: siruri(r.produse), categorii: siruri(r.categorii) };
}

/** Are codul o restrângere, sau merge pe tot coșul? */
export function areRestrangere(r: Restrangere): boolean {
  return r.fel !== "tot";
}

/** Ce se refuză în formular, înainte să ajungă un cod care nu prinde nimic. */
export function restrangereValida(r: Restrangere): { ok: true } | { error: string } {
  if (r.fel === "produse" && r.produse.length === 0) {
    return { error: "Ai ales „doar anumite produse”, dar n-ai ales niciunul. Alege măcar unul sau lasă codul pe tot magazinul." };
  }
  if (r.fel === "categorii" && r.categorii.length === 0) {
    return { error: "Ai ales „doar anumite categorii”, dar n-ai ales niciuna. Alege măcar una sau lasă codul pe tot magazinul." };
  }
  return { ok: true };
}

/** O linie de comandă, atât cât îi trebuie regulii. */
export interface LinieDeCupon {
  productId: string;
  /** `products.category` — un singur nume, sau nimic. */
  categorie: string | null;
  /** Cât face linia: preț unitar × cantitate, DUPĂ oferte. */
  valoare: number;
  /**
   * Cota de TVA a liniei, când o poartă.
   *
   * ⚠ NU E ÎNFRUMUSEȚARE: pe factură, o reducere fără cotă proprie se împarte
   * PROPORȚIONAL peste toate cotele comenzii (`imparteProportional`). Presupunerea
   * de acolo — că reducerea micșorează baza FIECĂREI cote — nu mai e adevărată
   * când codul atinge doar o parte din linii. De-aia se ține minte pe ce cote a
   * căzut reducerea. Vezi `bazaPeCote`.
   */
  cota?: number | null;
}

/**
 * Care linii intră în campanie.
 *
 * ⚠ `categoriiExtinse` se face O SINGURĂ DATĂ de apelant (are nevoie de arborele
 * de categorii, adică de o citire din bază) și se pasează încoace. Calculată
 * aici, s-ar fi refăcut la fiecare linie.
 */
export function liniiPotrivite(
  linii: readonly LinieDeCupon[],
  r: Restrangere,
  categoriiExtinse?: Set<string>,
): LinieDeCupon[] {
  if (r.fel === "tot") return [...linii];
  if (r.fel === "produse") return linii.filter((l) => r.produse.includes(l.productId));
  const set = categoriiExtinse ?? new Set(r.categorii);
  return linii.filter((l) => l.categorie != null && set.has(l.categorie));
}

/** Numele categoriilor atinse de restrângere, cu tot subarborele lor. */
export function extindeCategoriileCodului(
  arbore: { id: string; name: string; parent_id: string | null }[],
  r: Restrangere,
): Set<string> | undefined {
  if (r.fel !== "categorii") return undefined;
  return extindeCategoriile(arbore, r.categorii);
}

/** Are restrângerea nevoie de arborele de categorii ca să se poată judeca? */
export function cereArborele(r: Restrangere): boolean {
  return r.fel === "categorii" && r.categorii.length > 0;
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Valoarea liniilor potrivite, grupată pe cote de TVA. */
export function bazaPeCote(potrivite: readonly LinieDeCupon[]): { cota: number; valoare: number }[] {
  const m = new Map<number, number>();
  for (const l of potrivite) {
    if (l.cota === null || l.cota === undefined) continue;
    const c = Number(l.cota);
    if (!Number.isFinite(c)) continue;
    m.set(c, round2((m.get(c) ?? 0) + l.valoare));
  }
  return [...m.entries()].map(([cota, valoare]) => ({ cota, valoare })).sort((a, b) => a.cota - b.cota);
}

export interface Socoteala {
  /** Câți lei se scad. Zero la transport gratuit, ca până acum. */
  suma: number;
  /** Valoarea liniilor pe care s-a socotit. Egală cu tot coșul când nu e restrângere. */
  baza: number;
  /** ⚠ `false` înseamnă REFUZ, nu „reducere zero”. Vezi mai jos. */
  potrivire: boolean;
  /** Pe ce cote de TVA a căzut reducerea, pentru factură. Gol când liniile n-au cote. */
  peCote: { cota: number; valoare: number }[];
}

/**
 * Cât se scade, când codul e mărginit la ceva anume.
 *
 * ⚠⚠ REGULA E ALTA LA FIECARE DIN CELE TREI TIPURI, și fiecare are motivul ei:
 *
 *   * **procent** → se aplică NUMAI liniilor potrivite. Altfel „10% la
 *     Îmbrăcăminte” ar reduce și televizorul din același coș.
 *   * **sumă fixă** → se scade din coș, dar **plafonată la valoarea liniilor
 *     potrivite**. „50 de lei la Accesorii” într-un coș cu accesorii de 30 de
 *     lei scade 30, nu 50 — altfel codul ar mânca din restul coșului.
 *   * **transport gratuit** → cere **măcar o linie potrivită**.
 *
 * ⚠⚠ ȘI CÂND NU SE POTRIVEȘTE NIMIC, CODUL SE REFUZĂ — nu se dă o reducere de
 * zero. Nu e o subtilitate de vocabular: ecranul pune transportul pe zero doar
 * din TIPUL cuponului, deci un `free_shipping` „valid cu reducere 0” ar fi dat
 * transportul gratuit oricum. Iar la procent, un „valid” cu 0 lei ar fi arătat
 * cuponul aplicat pe ecran și ar fi încasat prețul întreg.
 */
export function socotesteReducerea(args: {
  tip: "percent" | "fixed" | "free_shipping";
  valoare: number;
  linii: readonly LinieDeCupon[];
  restrangere: Restrangere;
  categoriiExtinse?: Set<string>;
  /**
   * Subtotalul autoritar al coșului. Se folosește când NU există restrângere, ca
   * socoteala să rămână literă cu literă cea de până acum — liniile pot să nu
   * acopere tot (extraopțiuni, rotunjiri), iar o schimbare acolo ar fi mutat
   * bani pe toate codurile existente, nu doar pe cele noi.
   */
  subtotal: number;
}): Socoteala {
  const { tip, valoare, linii, restrangere, categoriiExtinse, subtotal } = args;

  if (!areRestrangere(restrangere)) {
    /* ⚠ Drumul de pana acum, neatins. Vezi `subtotal` de mai sus. */
    const suma = tip === "percent"
      ? round2((subtotal * valoare) / 100)
      : tip === "fixed"
        ? Math.min(round2(valoare), round2(subtotal))
        : 0;
    return { suma, baza: round2(subtotal), potrivire: true, peCote: bazaPeCote(linii) };
  }

  const potrivite = liniiPotrivite(linii, restrangere, categoriiExtinse);
  const baza = round2(potrivite.reduce((s, l) => s + l.valoare, 0));

  if (potrivite.length === 0 || baza <= 0) {
    return { suma: 0, baza: 0, potrivire: false, peCote: [] };
  }

  const suma = tip === "percent"
    ? round2((baza * valoare) / 100)
    : tip === "fixed"
      ? Math.min(round2(valoare), baza)
      : 0;

  return { suma, baza, potrivire: true, peCote: bazaPeCote(potrivite) };
}

/**
 * Ce scrie pe ecran lângă câmp, ca să nu fie nevoie să deschidă nimeni
 * documentația.
 */
export function descrieRestrangerea(r: Restrangere, cateProduse: number | null): string {
  if (r.fel === "tot") return "Codul merge pe tot ce e în magazin.";
  if (r.fel === "produse") {
    const n = r.produse.length;
    return n === 0
      ? "N-ai ales niciun produs, deci codul n-ar prinde nimic."
      : `Codul merge doar pe ${n === 1 ? "produsul ales" : `cele ${n} produse alese`}. Reducerea se socotește numai pe ${n === 1 ? "el" : "ele"}, nu pe tot coșul.`;
  }
  const n = r.categorii.length;
  if (n === 0) return "N-ai ales nicio categorie, deci codul n-ar prinde nimic.";
  const cate = cateProduse === null ? "" : ` Acum se potrivesc ${cateProduse} ${cateProduse === 1 ? "produs" : "de produse"}.`;
  return `Codul merge doar pe ${n === 1 ? "categoria aleasă" : `cele ${n} categorii alese`}, cu tot ce au sub ele.${cate}`;
}

/**
 * ⚠⚠ CE TREBUIE SĂ ȘTIE COMERCIANTUL ÎNAINTE SĂ RESTRÂNGĂ PE CATEGORII.
 *
 * Amândouă sunt urmări ale felului în care sunt făcute categoriile în casă, nu
 * alegeri ale acestei etape — dar el n-are de unde ști asta.
 */
export const DESPRE_CATEGORII =
  "Categoriile se potrivesc după NUME. Dacă redenumești o categorie, produsele din ea ies din campanie, "
  + "iar dacă ai două categorii cu același nume sub părinți diferiți, codul le prinde pe amândouă.";
