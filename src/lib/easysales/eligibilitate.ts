import { cerePersonalizarea } from "@/lib/customization/definitie";
import { isValidGtin, normalizeGtin } from "@/lib/gtin";
import { pretVechiDeTaiat } from "@/lib/products/compare-at";
import {
  combinatiiActiveUnice, comboCompareAtPrice, comboStock, comboUnitPrice, parseVariants,
  type VariantCombo, type VariantsData,
} from "@/lib/storefront/variants";
import { identitateCombinatie } from "@/lib/storefront/variante-identitate";
import { IDENTITATE_SIMPLU } from "./identitate";
import type { EasySalesConfig } from "./tipuri";

/**
 * Ce produse pleaca in easySales si de ce nu pleaca celelalte (planul, §5.4.1).
 *
 * ═══ ⚠ O SINGURA HOTARARE, CITITA DIN DOUA LOCURI ═══
 *
 * Raportul de pregatire o CITESTE (numerele pe motive, inainte de „Trimite catalogul"), iar
 * lucratorul catalogului o APLICA (ce pleaca). Doua liste de reguli s-ar departa la prima schimbare,
 * si atunci raportul ar spune „6.700 gata de trimis" despre un catalog din care pleaca 6.500. Aceeasi
 * lectie ca la Pepita (`pepita/articole.ts`) si la catalogul Meta.
 *
 * Modulul e PUR: nicio citire din baza. Ce ii trebuie despre restul magazinului (SKU-urile duplicate,
 * SKU-urile deja inghetate) primeste de la apelant.
 *
 * ═══ CE OPRESTE TOT PRODUSUL, CE OPRESTE UN ARTICOL, CE DOAR SE SPUNE ═══
 *
 *   tot produsul   inactiv, pachet (disponibilitatea vine din componente), personalizare (cumparatorul
 *                  de pe marketplace n-are unde scrie textul de gravat), fara nume, fara descriere
 *                  (obligatorie [A]; D10), stoc neurmarit fara stoc fix (D9), variante fara nicio
 *                  combinatie activa;
 *   un articol     pret 0, SKU duplicat in magazin, SKU-ul parintelui pe combinatie, fara SKU cand
 *                  SKU-ul generat e oprit (D8), stocul comun al variantelor (s-ar vinde de N ori),
 *                  doua combinatii cu aceeasi identitate;
 *   avertisment    fara imagine, EAN invalid sau dublat (pleaca fara EAN), SKU generat, descrierea
 *                  luata din nume, stoc fix, categoria de rezerva (o pune apelantul).
 *
 * ⚠ UN SKU DEJA INGHETAT CASTIGA. Un articol care a plecat o data (in catalog, sau pe linia unei
 * comenzi, E2) are SKU-ul lui la ei; o regula noua nu-l mai poate opri pe motiv de SKU, fiindca la
 * easySales SKU-ul acela exista deja si un altul ar insemna un produs nou (M-PROD-1).
 */

/** Coloanele produsului citite de catalog. */
export const COLOANE_PRODUS_CATALOG =
  "id, name, slug, description, price, compare_at_price, sku, images, category, track_inventory, "
  + "stock_quantity, weight_grams, page_sections, is_active, is_bundle";

export interface ProdusCatalog {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  price: number | string | null;
  compare_at_price: number | string | null;
  sku: string | null;
  images: unknown;
  category: string | null;
  track_inventory: boolean;
  stock_quantity: number | null;
  weight_grams: number | null;
  page_sections: unknown;
  is_active: boolean;
  is_bundle: boolean;
}

export interface SetariCatalog {
  /** D8. */
  skuGenerat: boolean;
  /** D10. */
  descriereDinNume: boolean;
  /** D9: `null` = produsele fara evidenta de stoc nu pleaca. */
  stocFix: number | null;
  /** D21. */
  arhivareLaStergere: boolean;
  /** D30. */
  combinatieScoasa: "stoc_zero" | "arhivare";
  /** `handling_time` [A]. */
  termenZile: number | null;
}

/** Setarile catalogului, cu hotararile recomandate din plan acolo unde omul n-a ales. */
export function setarileCatalogului(cfg: Pick<EasySalesConfig,
  "catalog_sku_generat" | "catalog_descriere_din_nume" | "catalog_stoc_fix" | "catalog_arhivare_la_stergere"
  | "catalog_combinatie_scoasa" | "catalog_termen_zile">): SetariCatalog {
  const stoc = Number(cfg.catalog_stoc_fix);
  const termen = Number(cfg.catalog_termen_zile);
  return {
    skuGenerat: cfg.catalog_sku_generat !== false,
    descriereDinNume: cfg.catalog_descriere_din_nume === true,
    stocFix: cfg.catalog_stoc_fix != null && Number.isInteger(stoc) && stoc >= 0 && stoc <= 100_000 ? stoc : null,
    arhivareLaStergere: cfg.catalog_arhivare_la_stergere !== false,
    combinatieScoasa: cfg.catalog_combinatie_scoasa === "arhivare" ? "arhivare" : "stoc_zero",
    termenZile: cfg.catalog_termen_zile != null && Number.isInteger(termen) && termen >= 0 && termen <= 365 ? termen : null,
  };
}

export type CodMotiv =
  | "inactiv" | "pachet" | "personalizat" | "fara-nume" | "fara-descriere" | "stoc-neurmarit" | "fara-combinatii"
  | "pret-zero" | "sku-duplicat" | "sku-parinte" | "fara-sku" | "stoc-comun" | "identitate-dubla"
  | "fara-imagine" | "ean-invalid" | "ean-dublat" | "sku-generat" | "descriere-din-nume" | "stoc-fix"
  | "categorie-de-rezerva" | "axe-nedespartite";

export type NivelMotiv = "blocheaza" | "avertisment";

export interface Motiv {
  cod: CodMotiv;
  nivel: NivelMotiv;
  /** Pentru om, cu diacritice. */
  mesaj: string;
  /** Titlul combinatiei, cand motivul priveste o singura varianta. */
  titlu?: string;
}

export interface ArticolCatalog {
  identitate: string;
  fel: "simple" | "complex";
  combo: VariantCombo | null;
  /** Titlul combinatiei; sirul gol la produsul simplu. */
  titlu: string;
  /** SKU-ul care pleaca: cel inghetat, cel propriu, sau `null` = se genereaza. */
  sku: string | null;
  /** Pretul magazinului (asa cum il tine magazinul: cu sau fara TVA). */
  pret: number;
  /** Pretul vechi de taiat, numai cand e strict peste pret. */
  pretVechi: number | null;
  /** EAN-ul valid, sau nimic. */
  ean: string | null;
  motive: Motiv[];
  eligibil: boolean;
}

export interface HotarareProdus {
  productUuid: string;
  segment: "simplu" | "variante";
  /** Motivele produsului intreg. Unul care blocheaza opreste toate articolele. */
  motive: Motiv[];
  articole: ArticolCatalog[];
  /** Nimic din produs nu pleaca. */
  exclus: boolean;
  /** Variantele produsului, cand are (pentru caracteristici si pentru adresa). */
  variante: VariantsData | null;
}

export interface ContextEligibilitate {
  setari: SetariCatalog;
  /** SKU-urile (`lower(trim)`) purtate de mai multe unitati vandabile ale magazinului. */
  skuDuplicate: ReadonlySet<string>;
  /** SKU-ul deja inghetat in `easysales_produse`, daca articolul are unul. */
  skuInghetat?: (productUuid: string, identitate: string) => string | null;
}

function blocheaza(cod: CodMotiv, mesaj: string, titlu?: string): Motiv {
  return { cod, nivel: "blocheaza", mesaj, ...(titlu !== undefined ? { titlu } : {}) };
}
function avertisment(cod: CodMotiv, mesaj: string, titlu?: string): Motiv {
  return { cod, nivel: "avertisment", mesaj, ...(titlu !== undefined ? { titlu } : {}) };
}

function skuCurat(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Numar pozitiv, altfel 0. */
function numar(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Descrierea are text? Numai pentru intrebare: ce pleaca e HTML-ul asa cum l-a curatat deja editorul
 * (planul, §5.4.4: fara un curatitor nou scris de noi). Un `<p></p>` sau un `&nbsp;` nu e o descriere.
 */
export function areDescriere(html: string | null | undefined): boolean {
  const text = (html ?? "")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&[a-z#0-9]+;/gi, "x")
    .trim();
  return text.length > 0;
}

/** Imaginile produsului: adresele nevide, fara dubluri, in ordinea lor. */
export function imaginileProdusului(images: unknown): string[] {
  const out: string[] = [];
  for (const x of Array.isArray(images) ? images : []) {
    const u = typeof x === "string" ? x.trim() : "";
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}

function gtinBun(v: unknown): string | null {
  const s = typeof v === "string" ? normalizeGtin(v) : "";
  return s && isValidGtin(s) ? s : null;
}

/**
 * Unitatile vandabile ale unui produs, cu SKU-ul propriu: produsul simplu activ, sau fiecare
 * combinatie activa a unui produs activ cu variante. Pachetele nu: ele nu pleaca.
 *
 * ⚠ SKU-ul unei combinatii egal cu al parintelui NU se numara aici: regula lui e alta (`sku-parinte`).
 */
export function skuurileVandabile(p: Pick<ProdusCatalog, "sku" | "page_sections" | "is_active" | "is_bundle">): string[] {
  if (!p.is_active || p.is_bundle) return [];
  const variante = parseVariants(p.page_sections);
  const parinte = skuCurat(p.sku).toLowerCase();
  if (!variante) {
    return parinte ? [parinte] : [];
  }
  return combinatiiActiveUnice(variante)
    .map((c) => skuCurat(c.sku).toLowerCase())
    .filter((s) => s && s !== parinte);
}

/** SKU-urile purtate de mai multe unitati vandabile ale magazinului (potrivire fara majuscule). */
export function skuDuplicateleMagazinului(
  produse: Iterable<Pick<ProdusCatalog, "sku" | "page_sections" | "is_active" | "is_bundle">>,
): Set<string> {
  const numar = new Map<string, number>();
  for (const p of produse) {
    for (const s of skuurileVandabile(p)) numar.set(s, (numar.get(s) ?? 0) + 1);
  }
  return new Set([...numar].filter(([, n]) => n > 1).map(([s]) => s));
}

/**
 * SKU-ul articolului: cel inghetat castiga; altfel cel propriu, cu regulile lui; altfel cel generat,
 * daca setarea il lasa. Intoarce SKU-ul (sau `null` = generat) si motivul, daca il opreste ceva.
 */
function hotarasteSku(
  propriu: string, inghetat: string | null, ctx: ContextEligibilitate, opt: { skuParinte?: string; titlu?: string },
): { sku: string | null; motiv: Motiv | null } {
  if (inghetat) return { sku: inghetat, motiv: null };
  if (propriu) {
    if (opt.skuParinte !== undefined && opt.skuParinte !== "" && propriu.toLowerCase() === opt.skuParinte.toLowerCase()) {
      return {
        sku: null,
        motiv: blocheaza("sku-parinte",
          `Varianta „${opt.titlu}” are același SKU ca produsul (${propriu}). Fiecare variantă are nevoie de SKU-ul ei, altfel easySales nu le poate deosebi.`,
          opt.titlu),
      };
    }
    if (ctx.skuDuplicate.has(propriu.toLowerCase())) {
      return {
        sku: null,
        motiv: blocheaza("sku-duplicat",
          `SKU-ul ${propriu} e folosit și de alt produs sau de altă variantă din magazin. În easySales SKU-ul trebuie să fie unic.`,
          opt.titlu),
      };
    }
    return { sku: propriu, motiv: null };
  }
  if (!ctx.setari.skuGenerat) {
    return {
      sku: null,
      motiv: blocheaza("fara-sku",
        opt.titlu !== undefined ? `Varianta „${opt.titlu}” n-are SKU.` : "Produsul n-are SKU.", opt.titlu),
    };
  }
  return { sku: null, motiv: null };
}

/** Hotararea pentru un produs. */
export function hotarareaProdusului(p: ProdusCatalog, ctx: ContextEligibilitate): HotarareProdus {
  const variante = parseVariants(p.page_sections);
  const segment = variante ? "variante" : "simplu";
  const motive: Motiv[] = [];

  if (!p.is_active) motive.push(blocheaza("inactiv", "Produsul e dezactivat în Edinio."));
  if (p.is_bundle) {
    motive.push(blocheaza("pachet", "Pachetele nu pleacă în easySales: disponibilitatea lor vine din produsele componente."));
  }
  if (cerePersonalizarea(p.page_sections)) {
    motive.push(blocheaza("personalizat",
      "Produsul cere personalizare (text, fișier). Pe marketplace cumpărătorul n-are unde s-o scrie, deci rămâne numai în magazin."));
  }
  if (!(p.name ?? "").trim()) motive.push(blocheaza("fara-nume", "Produsul n-are nume."));
  if (!areDescriere(p.description)) {
    motive.push(ctx.setari.descriereDinNume
      ? avertisment("descriere-din-nume", "Produsul n-are descriere: pleacă cu numele drept descriere.")
      : blocheaza("fara-descriere", "Produsul n-are descriere, iar easySales o cere. Scrie una sau pornește „Descrierea din nume”."));
  }
  if (!p.track_inventory) {
    motive.push(ctx.setari.stocFix != null
      ? avertisment("stoc-fix", `Produsul nu ține evidența stocului: pleacă cu stocul fix ${ctx.setari.stocFix}.`)
      : blocheaza("stoc-neurmarit",
        "Produsul nu ține evidența stocului. Fără un stoc fix ales în setări, s-ar putea vinde pe marketplace fără limită."));
  }
  const imagini = imaginileProdusului(p.images);

  const combinatii = combinatiiActiveUnice(variante);
  if (variante && combinatii.length === 0) {
    motive.push(blocheaza("fara-combinatii", "Produsul are variante, dar niciuna nu e activă."));
  }

  const inghetat = (identitate: string) => ctx.skuInghetat?.(p.id, identitate) ?? null;
  const articole: ArticolCatalog[] = [];
  const pretBaza = numar(p.price);
  const vechiBaza = numar(p.compare_at_price) || null;

  if (!variante) {
    const m: Motiv[] = [];
    const pret = pretBaza;
    if (pret <= 0) m.push(blocheaza("pret-zero", "Prețul produsului e 0."));
    const s = hotarasteSku(skuCurat(p.sku), inghetat(IDENTITATE_SIMPLU), ctx, {});
    if (s.motiv) m.push(s.motiv);
    else if (s.sku === null) m.push(avertisment("sku-generat", "Produsul n-are SKU: pleacă cu un SKU generat de Edinio."));
    if (imagini.length === 0) m.push(avertisment("fara-imagine", "Produsul n-are nicio imagine. Marketplace-urile îl pot refuza."));
    const brutGtin = ((p.page_sections as { google?: { gtin?: unknown } } | null)?.google?.gtin);
    const ean = gtinBun(brutGtin);
    if (!ean && typeof brutGtin === "string" && brutGtin.trim()) {
      m.push(avertisment("ean-invalid", "Codul EAN nu trece verificarea cifrei de control: produsul pleacă fără EAN."));
    }
    articole.push({
      identitate: IDENTITATE_SIMPLU, fel: "simple", combo: null, titlu: "",
      sku: s.motiv ? null : s.sku, pret, pretVechi: pretVechiDeTaiat(vechiBaza, pret), ean, motive: m,
      eligibil: !m.some((x) => x.nivel === "blocheaza"),
    });
  } else {
    const identitati = new Map<string, string>();
    const eanuri = new Map<string, number>();
    for (const c of combinatii) {
      const g = gtinBun(c.gtin);
      if (g) eanuri.set(g, (eanuri.get(g) ?? 0) + 1);
    }
    const skuParinte = skuCurat(p.sku);
    for (const combo of combinatii) {
      const titlu = combo.title;
      const identitate = identitateCombinatie(combo);
      const m: Motiv[] = [];
      const deja = identitati.get(identitate);
      if (deja !== undefined) {
        m.push(blocheaza("identitate-dubla",
          `Variantele „${deja}” și „${titlu}” ajung la același identificator. Redenumește una dintre ele și salvează produsul.`, titlu));
      } else {
        identitati.set(identitate, titlu);
      }
      const pret = comboUnitPrice(combo, pretBaza);
      if (pret <= 0) m.push(blocheaza("pret-zero", `Prețul variantei „${titlu}” e 0.`, titlu));
      if (p.track_inventory && comboStock(combo) === null) {
        m.push(blocheaza("stoc-comun",
          `Varianta „${titlu}” n-are stoc propriu: împarte stocul produsului cu celelalte variante, deci pe marketplace s-ar vinde de mai multe ori aceeași bucată.`,
          titlu));
      }
      const s = hotarasteSku(skuCurat(combo.sku), inghetat(identitate), ctx, { skuParinte, titlu });
      if (s.motiv) m.push(s.motiv);
      else if (s.sku === null) m.push(avertisment("sku-generat", `Varianta „${titlu}” n-are SKU: pleacă cu un SKU generat de Edinio.`, titlu));
      if (imagini.length === 0 && !(typeof combo.image === "string" && combo.image.trim())) {
        m.push(avertisment("fara-imagine", `Varianta „${titlu}” n-are nicio imagine. Marketplace-urile o pot refuza.`, titlu));
      }
      const brutGtin = typeof combo.gtin === "string" ? combo.gtin.trim() : "";
      let ean = gtinBun(combo.gtin);
      if (!ean && brutGtin) {
        m.push(avertisment("ean-invalid", `Codul EAN al variantei „${titlu}” e invalid: pleacă fără EAN.`, titlu));
      }
      if (ean && (eanuri.get(ean) ?? 0) > 1) {
        m.push(avertisment("ean-dublat", `Mai multe variante au codul EAN ${ean}: niciuna nu-l trimite.`, titlu));
        ean = null;
      }
      articole.push({
        identitate, fel: "complex", combo, titlu,
        sku: s.motiv ? null : s.sku, pret,
        pretVechi: pretVechiDeTaiat(comboCompareAtPrice(combo, vechiBaza), pret), ean, motive: m,
        eligibil: !m.some((x) => x.nivel === "blocheaza"),
      });
    }
  }

  const exclus = motive.some((x) => x.nivel === "blocheaza");
  if (exclus) for (const a of articole) a.eligibil = false;
  return { productUuid: p.id, segment, motive, articole, exclus, variante };
}

/* ═══════════════════════════════════════════════════════════════════════════
   RAPORTUL DE PREGATIRE
   ═══════════════════════════════════════════════════════════════════════════ */

export interface RandRaport {
  cod: CodMotiv;
  nivel: NivelMotiv;
  /** Produsele atinse. */
  produse: number;
  /** Articolele (produse simple si variante) atinse. */
  articole: number;
  /** Cateva exemple, ca omul sa stie unde sa se uite. */
  exemple: { productUuid: string; nume: string; titlu?: string; mesaj: string }[];
}

export interface RaportPregatire {
  produse: number;
  produseCuVariante: number;
  /** Unitatile vandabile (produse simple si variante active), cu cele care pleaca. */
  articole: { simple: number; variante: number; gataSimple: number; gataVariante: number };
  motive: RandRaport[];
}

const EXEMPLE_PE_MOTIV = 8;

/**
 * Raportul, adunat produs cu produs: catalogul se citeste pe pagini, iar un magazin de 37.000 de
 * produse nu are voie sa tina toate hotararile in memorie deodata.
 */
export function agregatorDePregatire() {
  const r: RaportPregatire = { produse: 0, produseCuVariante: 0, articole: { simple: 0, variante: 0, gataSimple: 0, gataVariante: 0 }, motive: [] };
  const randuri = new Map<CodMotiv, RandRaport & { _produse: Set<string> }>();
  const noteaza = (m: Motiv, productUuid: string, nume: string, articole: number) => {
    let rand = randuri.get(m.cod);
    if (!rand) {
      rand = { cod: m.cod, nivel: m.nivel, produse: 0, articole: 0, exemple: [], _produse: new Set() };
      randuri.set(m.cod, rand);
    }
    rand._produse.add(productUuid);
    rand.articole += articole;
    if (rand.exemple.length < EXEMPLE_PE_MOTIV && !rand.exemple.some((e) => e.productUuid === productUuid)) {
      rand.exemple.push({ productUuid, nume, ...(m.titlu ? { titlu: m.titlu } : {}), mesaj: m.mesaj });
    }
  };
  return {
    adauga(h: HotarareProdus, nume: string, motiveInPlus: Motiv[] = []): void {
      r.produse++;
      if (h.segment === "variante") r.produseCuVariante++;
      for (const a of h.articole) {
        if (a.fel === "simple") { r.articole.simple++; if (a.eligibil) r.articole.gataSimple++; }
        else { r.articole.variante++; if (a.eligibil) r.articole.gataVariante++; }
      }
      for (const m of [...h.motive, ...motiveInPlus]) noteaza(m, h.productUuid, nume, Math.max(1, h.articole.length));
      for (const a of h.articole) for (const m of a.motive) noteaza(m, h.productUuid, nume, 1);
    },
    rezultat(): RaportPregatire {
      return {
        ...r,
        articole: { ...r.articole },
        motive: [...randuri.values()]
          .map(({ _produse, ...rand }) => ({ ...rand, produse: _produse.size }))
          .sort((a, b) => (a.nivel === b.nivel ? b.articole - a.articole : a.nivel === "blocheaza" ? -1 : 1)),
      };
    },
  };
}

/** Raportul, pe motive si pe segmente (simple, variante). */
export function raportulDePregatire(
  hotarari: Iterable<{ h: HotarareProdus; nume: string; motiveInPlus?: Motiv[] }>,
): RaportPregatire {
  const ag = agregatorDePregatire();
  for (const { h, nume, motiveInPlus } of hotarari) ag.adauga(h, nume, motiveInPlus);
  return ag.rezultat();
}
