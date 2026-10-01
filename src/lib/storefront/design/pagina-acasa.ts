import type { AcasaBlock, Block, SectiuneAcasa } from "@/lib/pages/blocks.types";
import { citestePaginaAcasa, VARIANTE_HERO } from "@/lib/pages/pagina-acasa";
import { variantMeta } from "./registry";
import type { SectionInstance, SectionKind, StoreDesign } from "./types";

/*
  Pagina din „Pagini" aleasa ca pagina principala, transformata in sectiuni.
  Motivul intreg e in `lib/pages/pagina-acasa.ts`.
*/

/** Tipul si varianta implicita a fiecarei sectiuni, ca in designul classic (`defaults.ts`). */
const IMPLICIT: Record<Exclude<SectiuneAcasa, "catalog">, { kind: SectionKind; variant: string; id: string }> = {
  hero: { kind: "hero", variant: "banners", id: "hero" },
  usp_strip: { kind: "usp_strip", variant: "icons", id: "usp" },
  category_nav: { kind: "category_nav", variant: "classic", id: "categories" },
  shipping_progress: { kind: "shipping_progress", variant: "banner", id: "shipping" },
  product_row: { kind: "product_row", variant: "grid", id: "featured" },
  benefits: { kind: "benefits", variant: "list", id: "benefits" },
  reviews: { kind: "reviews", variant: "grid", id: "reviews" },
  gallery: { kind: "gallery", variant: "grid", id: "gallery" },
  about: { kind: "about", variant: "classic", id: "about" },
  contact: { kind: "contact", variant: "classic", id: "contact" },
};

/** Sectiunea din designul magazinului, aprinsa; sau una noua, cu setarile implicite. */
function dinDesign(home: SectionInstance[], kind: SectionKind, variant: string, id: string): SectionInstance {
  const gasita = home.find((s) => s.kind === kind && (kind !== "product_row" || s.id === id));
  if (gasita) return { ...gasita, enabled: true };
  const settings: Record<string, unknown> = kind === "product_row"
    ? (id === "featured" ? { mode: "featured", title: "Recomandate" } : { mode: "custom", sectionRef: id })
    : {};
  return { id, kind, variant, enabled: true, settings };
}

function sectiuniPentruBloc(b: AcasaBlock, home: SectionInstance[]): SectionInstance[] {
  if (b.sectiune === "catalog") {
    const grila = dinDesign(home, "product_grid", "classic", "catalog");
    return b.cuBara === false ? [grila] : [dinDesign(home, "catalog_toolbar", "classic", "toolbar"), grila];
  }
  const imp = IMPLICIT[b.sectiune];
  if (!imp) return [];
  if (b.sectiune === "product_row") return [dinDesign(home, "product_row", "grid", b.rand || "featured")];
  const s = dinDesign(home, imp.kind, imp.variant, imp.id);
  if (b.sectiune === "hero" && b.varianta && VARIANTE_HERO.some((v) => v.valoare === b.varianta)) {
    return [{ ...s, variant: b.varianta }];
  }
  return [s];
}

export interface PaginaCaSectiuni {
  /** Lista care inlocuieste `design.home`. */
  home: SectionInstance[];
  /** Blocurile obisnuite, pe grupuri, dupa cheia din `settings.slot` a sectiunii `rich_blocks`. */
  grupuri: Record<string, Block[]>;
  /** Pagina are catalogul: atunci adresele grilei (`?cat=`, `?page=`) raman aici. */
  areCatalog: boolean;
}

/**
 * Pagina, ca lista de sectiuni a paginii principale.
 *
 * Blocurile „Din pagina principala" devin sectiunile magazinului (cu setarile
 * si designul lor din editorul de design, daca exista acolo). Blocurile
 * obisnuite, cate sunt la rand intre ele, devin o singura sectiune `rich_blocks`.
 *
 * ⚠ O sectiune apare O SINGURA DATA. Randurile de produse, bannerele si
 * catalogul au id-uri fixe (datele se cer dupa ele), deci al doilea bloc cu
 * aceeasi sectiune s-ar fi randat cu aceeasi cheie si aceleasi date.
 */
export function sectiuniDinBlocuri(blocks: Block[], design: StoreDesign): PaginaCaSectiuni {
  const home: SectionInstance[] = [];
  const grupuri: Record<string, Block[]> = {};
  const vazute = new Set<string>();
  let serie: Block[] = [];

  const inchide = () => {
    if (serie.length === 0) return;
    const cheie = `blocuri-${Object.keys(grupuri).length}`;
    grupuri[cheie] = serie;
    home.push({ id: cheie, kind: "rich_blocks", variant: "blocuri", enabled: true, settings: { slot: cheie } });
    serie = [];
  };

  for (const b of blocks) {
    if (b.type !== "acasa") {
      serie.push(b);
      continue;
    }
    inchide();
    for (const s of sectiuniPentruBloc(b, design.home)) {
      if (vazute.has(s.id)) continue;
      vazute.add(s.id);
      home.push(s);
    }
  }
  inchide();

  return { home, grupuri, areCatalog: home.some((s) => s.kind === "product_grid") };
}

/**
 * Designul magazinului cand are o pagina proprie ca pagina principala: catalogul
 * pe pagina lui. Fara pagina aleasa, designul ramane neatins.
 *
 * Se aplica la CITIRE (`resolveDesign`), nu se salveaza: cine renunta la pagina
 * proprie isi regaseste magazinul exact cum il lasase.
 */
export function aplicaPaginaAcasa(design: StoreDesign, pageContent: unknown): StoreDesign {
  if (!citestePaginaAcasa(pageContent)) return design;
  const pagina = design.shop.page;
  if (pagina.enabled && pagina.variant !== "none") return design;
  return {
    ...design,
    shop: { ...design.shop, page: { ...pagina, variant: "sidebar", enabled: true, settings: { ...(variantMeta("shop_page", "sidebar")?.defaults ?? {}), ...pagina.settings } } },
  };
}
