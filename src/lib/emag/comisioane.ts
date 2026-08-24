/**
 * Ce ti-a facturat eMAG (§89).
 *
 * ═══ ⚠ FAPTE, NU ESTIMARI ═══
 *
 * Cautat in tot OpenAPI-ul lor: NU exista nicio ruta care sa spuna cat e comisionul
 * pe o categorie. Cuvantul „commission" apare de doua ori in toata schema, si o data
 * e chiar aici: `/api-3/invoice/categories` intoarce tipurile de factura, iar unul
 * dintre ele se numeste `Commission`.
 *
 * Deci singura cale onesta de a spune „cat te costa eMAG" e sa citesti FACTURILE PE
 * CARE TI LE-AU EMIS EI. Nu un tabel de procente tinut de noi, care ar imbatrani
 * tacut si ar arata sume care nu se potrivesc cu extrasul de cont.
 *
 * ═══ ⚠ CE NU SE POATE SOCOTI, SI SE SPUNE ═══
 *
 * MARJA nu se poate. Marja cere pretul de ACHIZITIE, iar `products` n-are nicio
 * coloana de cost — verificat. „Incasari minus comision" nu e marja, e cifra de
 * afaceri minus un cost; aratata drept marja, comerciantul ar fi luat hotarari de
 * pret pe un numar care nu inseamna ce scrie pe el.
 *
 * Deci se arata ce s-a facturat, si atat. Cand va exista un cost in catalog, marja
 * devine o scadere, nu o ghicitoare.
 */

/** O linie de pe factura lor. Campurile sunt scrise in proza documentatiei. */
export interface LinieFacturaLor {
  product_name?: string;
  unit_of_measure?: string;
  quantity?: number;
  unit_price?: number;
  vat_rate?: number;
  value?: number;
  vat_value?: number;
}

export interface FacturaLor {
  /** Tipul, ex. `FC`. Numele lizibil vine din `/invoice/categories`. */
  category?: string;
  name?: string;
  number?: string;
  date?: string;
  is_storno?: number;
  lines?: LinieFacturaLor[];
  total_without_vat?: number;
  total_vat_value?: number;
  total_with_vat?: number;
  currency?: string;
}

export interface FacturaEcran {
  numar: string;
  data: string;
  categorie: string;
  /** Numele lizibil al categoriei, cand ei ni l-au dat. */
  categorieEticheta: string;
  /** ⚠ Adevarat cand e o STORNARE. Se arata cu semnul ei, vezi `totalulSemnat`. */
  storno: boolean;
  faraTva: number;
  cuTva: number;
  moneda: string;
  linii: { nume: string; cantitate: number; valoare: number }[];
}

/**
 * Un numar de pe factura lor, oricum ar fi scris.
 *
 * ═══ ⚠ „1.200,50" NU E O MIE DOUA SUTE DE MII ═══
 *
 * Documentatia lor nu spune in ce forma vin sumele, iar la alte rute se vad si numere
 * si siruri. Facturile romanesti scriu de obicei „1.200,50": punct la mii, virgula la
 * zecimale.
 *
 * Prima forma facea `Number(v.replace(",", "."))`, adica `Number("1.200.50")` — care
 * da `NaN`, cazut apoi pe `0`. Un comision de 1200 de lei ar fi aparut pe ecran ca
 * ZERO. Fara nicio eroare, fiindca zero e o suma perfect valida.
 *
 * Regula: cand sunt si punct si virgula, ULTIMUL dintre ele e separatorul zecimal, iar
 * celalalt e de mii. Cand e doar virgula, e zecimala. Cand e doar punct, e zecimal —
 * asa scriu API-urile.
 */
function numar(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v !== "string") return 0;

  const t = v.trim().replace(/\s/g, "");
  if (!t) return 0;

  const ultimulPunct = t.lastIndexOf(".");
  const ultimaVirgula = t.lastIndexOf(",");

  let curat: string;
  if (ultimulPunct >= 0 && ultimaVirgula >= 0) {
    /* Amandoua: ultimul e zecimalul, primul e de mii. */
    curat = ultimaVirgula > ultimulPunct
      ? t.replace(/\./g, "").replace(",", ".")
      : t.replace(/,/g, "");
  } else if (ultimaVirgula >= 0) {
    curat = t.replace(",", ".");
  } else {
    curat = t;
  }

  const n = Number(curat);
  return Number.isFinite(n) ? n : 0;
}

/**
 * ⚠ O STORNARE SE SCADE, NU SE ADUNA.
 *
 * `is_storno: 1` inseamna ca factura anuleaza alta. eMAG o trimite cu totalul POZITIV
 * — deci adunata ca oricare alta, ar fi DUBLAT cheltuiala in loc s-o anuleze.
 *
 * Un comerciant cu doua stornari intr-o luna ar fi vazut un comision cu mult peste
 * ce i-a luat eMAG de fapt, si ar fi ridicat preturile degeaba.
 */
export function totalulSemnat(f: { storno: boolean; faraTva: number }): number {
  return f.storno ? -Math.abs(f.faraTva) : f.faraTva;
}

/** Cate linii se tin per factura, pentru ecran. */
export const LINII_PE_FACTURA = 12;

/**
 * Aduce raspunsul lor la forma ecranului.
 *
 * ⚠ O forma nerecunoscuta da o lista goala, NU numere inventate. La bani, un zero
 * ghicit arata identic cu un zero adevarat.
 */
export function facturileLorPentruEcran(
  brut: unknown,
  numeCategorii: Record<string, string> = {},
): FacturaEcran[] {
  const lista = Array.isArray(brut)
    ? brut
    : (brut && typeof brut === "object" && Array.isArray((brut as { invoices?: unknown }).invoices)
      ? (brut as { invoices: unknown[] }).invoices
      : []);

  const iesire: FacturaEcran[] = [];
  for (const x of lista) {
    if (!x || typeof x !== "object") continue;
    const f = x as FacturaLor;
    const categorie = (f.category ?? "").trim();

    iesire.push({
      numar: (f.number ?? "").trim() || "—",
      data: (f.date ?? "").trim(),
      categorie,
      /* ⚠ Numele lor bate al nostru; cand nu-l stim, se arata CODUL, nu „Altele".
         Un cod necunoscut e tocmai cel despre care nu stie nimeni nimic. */
      categorieEticheta: (f.name ?? "").trim() || numeCategorii[categorie] || categorie || "—",
      storno: Number(f.is_storno) === 1,
      faraTva: numar(f.total_without_vat),
      cuTva: numar(f.total_with_vat),
      moneda: (f.currency ?? "").trim(),
      linii: (Array.isArray(f.lines) ? f.lines : [])
        .slice(0, LINII_PE_FACTURA)
        .map((l) => ({
          nume: (l?.product_name ?? "").trim() || "—",
          cantitate: numar(l?.quantity),
          valoare: numar(l?.value),
        })),
    });
  }

  /* Cele mai noi primele: intrebarea e „cat m-a costat luna asta", nu „acum un an". */
  return iesire.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
}

export interface TotalPeCategorie {
  categorie: string;
  eticheta: string;
  total: number;
  cate: number;
}

/**
 * Cat s-a facturat, pe feluri.
 *
 * ⚠ Se aduna FARA TVA. TVA-ul se deduce, deci nu e un cost; adunat, cifra ar fi
 * aratat cu o cincime mai mare decat ce l-a costat cu adevarat pe comerciant.
 *
 * ⚠ Monedele NU se amesteca. Un magazin cu conturi in RON si EUR ar fi vazut o suma
 * fara niciun inteles. Aici se aduna doar ce vine pe aceeasi moneda, iar apelantul
 * cere pe rand.
 */
export function adunaPeCategorii(facturi: FacturaEcran[]): TotalPeCategorie[] {
  const pe = new Map<string, TotalPeCategorie>();

  for (const f of facturi) {
    const cheie = f.categorie || "—";
    const existent = pe.get(cheie);
    if (existent) {
      existent.total += totalulSemnat(f);
      existent.cate++;
      continue;
    }
    pe.set(cheie, {
      categorie: cheie,
      eticheta: f.categorieEticheta,
      total: totalulSemnat(f),
      cate: 1,
    });
  }

  return [...pe.values()].sort((a, b) => b.total - a.total);
}

/**
 * Numele categoriilor de factura, din raspunsul lor.
 *
 * Forma: `[{ category: "FC", name: "Commission" }]`.
 */
export function numeleCategoriilor(brut: unknown): Record<string, string> {
  const lista = Array.isArray(brut) ? brut : [];
  const nume: Record<string, string> = {};
  for (const x of lista) {
    if (!x || typeof x !== "object") continue;
    const o = x as { category?: unknown; name?: unknown };
    const c = typeof o.category === "string" ? o.category.trim() : "";
    const n = typeof o.name === "string" ? o.name.trim() : "";
    if (c && n) nume[c] = n;
  }
  return nume;
}
