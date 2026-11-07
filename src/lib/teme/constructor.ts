import { buildClassicDesign, section } from "@/lib/storefront/design/defaults";
import { hrefCategorie } from "@/lib/storefront/category-href";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { variantMeta } from "@/lib/storefront/design/registry";
import { schemaBlocurilor } from "@/lib/storefront/design/blocuri";
import { jsonCanonic } from "@/lib/storefront/design/continut-ciorna";
import type { BlockInstance, DesignContext, SectionInstance, StoreDesign, StoreStyle } from "@/lib/storefront/design/types";
import type { OptiuniTema, SetDateDemo } from "@/lib/teme/tipuri";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CONSTRUCTORUL TEMELOR 2-30 (etapa 24 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Jupiter si-a scris designul de mana (`jupiter/design.ts`). Celelalte teme difera prin ce variante aleg si cu ce reglaje,
  nu prin felul in care se aplica: de aceea o tema noua e o RETETA (ce antet, ce banner, ce categorii...), iar regulile
  aplicarii stau aici o singura data, aceleasi ca la Jupiter (decizia 4 si etapa 18.3):

  - pornind de la designul de acum al magazinului, deci sectiunile, blocurile si coloanele LUI raman;
  - fiecare sectiune a temei trece pe varianta ei (`variantOverride`), cu implicitele variantei, peste ele reglajele de azi
    ale magazinului, peste ele ce cere tema;
  - textele demo (bannerul, placile, mesajul barii) intra doar cu datele demo si doar unde el n-are nimic al lui;
  - „Despre noi” ramane in lista, stins, cu textul lui (cererea lui de la Jupiter, etapa 21).
*/

/** O sectiune a temei: varianta si reglajele ei. */
export interface SectiuneReteta {
  varianta: string;
  setari?: Record<string, unknown>;
}

/** Bannerul principal: varianta, reglajele temei si (cu datele demo) textele si pozele de exemplu. */
export interface BannerReteta extends SectiuneReteta {
  /** Reglajele din datele demo (titlu, text, imagine, placile mozaicului...), puse doar cand bannerul lui n-are nimic. */
  demo?: (date: SetDateDemo, radacina: string) => Record<string, unknown>;
}

export interface RetetaTema {
  /** Stilul temei, fara culoarea principala, fundal si fonturi (acelea sunt identitatea, scrisa in „Stil”, etapa 17.1). */
  stil: StoreStyle;
  antet: SectiuneReteta & { mesajDemo?: string };
  subsol: SectiuneReteta & { coloane?: (radacina: string) => BlockInstance[] };
  banner: BannerReteta;
  /** Beneficiile pe scurt (insignele magazinului) imediat sub banner. */
  beneficiiSubBanner?: boolean;
  /** Categoriile de pe prima pagina; `null` = stinse (tema le arata altfel, de exemplu pe placi de recomandare). */
  categorii: SectiuneReteta | null;
  /** Randurile de produse pe panoul gri (`banda`). */
  randuriPePanou: boolean;
  /** Placile de recomandare: varianta, titlul, sub al catelea rand vizibil (0 = imediat dupa categorii). */
  placi?: SectiuneReteta & { dupaRandul: number; titlu: string; linkuriSpreCategorii?: boolean };
  /** Pagina Magazin (catalogul): varianta si reglajele. */
  magazin: SectiuneReteta;
  /** Varianta cardului de produs (`classic`, `jupiter`, `minimal`). */
  card: string;
  /** Pagina de produs: varianta si reglajele temei (de ex. galeria compacta pe paginile late). */
  paginaProdus: SectiuneReteta;
}

/** O sectiune pe varianta temei, tinuta (`variantOverride`), cu implicitele variantei sub reglajele lui si ale temei. */
export function peVarianta(s: SectionInstance, variant: string, setari: Record<string, unknown> = {}): SectionInstance {
  return {
    ...s,
    variant,
    variantOverride: variant,
    settings: { ...(variantMeta(s.kind, variant)?.defaults ?? {}), ...s.settings, ...setari },
  };
}

/** Coloanele subsolului: ale lui, cand si le-a ales (etapa 11), altfel ale temei (sau implicitele variantei). */
function coloane(subsol: SectionInstance, aleTemei: BlockInstance[] | null): BlockInstance[] | undefined {
  const implicite = schemaBlocurilor("footer", subsol.variant)?.implicite?.(subsol.settings) ?? [];
  const aleseDeEl = !!subsol.blocks && jsonCanonic(subsol.blocks) !== jsonCanonic(implicite);
  if (aleseDeEl && subsol.blocks) return subsol.blocks;
  return aleTemei ?? subsol.blocks;
}

/** Bannerul „are ceva al lui”: orice reglaj de continut completat (titlu, placi, carduri). */
function bannerulAreContinut(setari: Record<string, unknown>): boolean {
  if (typeof setari.titlu === "string" && setari.titlu.trim()) return true;
  for (const k of ["placi", "carduri"]) if (Array.isArray(setari[k]) && (setari[k] as unknown[]).length > 0) return true;
  return false;
}

/**
 * Designul unei teme dupa reteta ei, peste designul magazinului (`baza`; lipsa = cel clasic, magazinul demo). Aceleasi
 * reguli ca `designJupiter`; vezi capul fisierului.
 */
export function designDupaReteta(
  reteta: RetetaTema, ctx: DesignContext, date: SetDateDemo | null, bazaMagazinului?: StoreDesign, optiuni: OptiuniTema = {},
): StoreDesign {
  const baza = bazaMagazinului ?? buildClassicDesign(ctx);
  const radacina = optiuni.radacinaCatalog ?? "/magazin";

  const mesajulLui = typeof baza.chrome.header.settings.topText === "string" && baza.chrome.header.settings.topText.trim() !== "";
  const antet = peVarianta(baza.chrome.header, reteta.antet.varianta, {
    ...reteta.antet.setari,
    ...(date && reteta.antet.mesajDemo && !mesajulLui ? { topText: reteta.antet.mesajDemo } : {}),
  });
  const subsolPeVarianta = peVarianta(baza.chrome.footer, reteta.subsol.varianta, reteta.subsol.setari);
  const subsol = { ...subsolPeVarianta, blocks: coloane(baza.chrome.footer, reteta.subsol.coloane ? reteta.subsol.coloane(radacina) : null) };

  // Prima pagina, in ordinea temei: bannerul, beneficiile, categoriile, randurile cu placile intre ele, restul.
  const din = (kind: SectionInstance["kind"], id: string, variant: string) => baza.home.find((s) => s.kind === kind) ?? section(id, kind, variant);
  const hero = din("hero", "hero", reteta.banner.varianta);
  const heroPeTema = peVarianta(hero, reteta.banner.varianta, reteta.banner.setari);
  const banner: SectionInstance = {
    ...heroPeTema,
    settings: {
      ...heroPeTema.settings,
      ...(date && reteta.banner.demo && !bannerulAreContinut(hero.settings) ? reteta.banner.demo(date, radacina) : {}),
    },
    enabled: true,
    enabledOverride: true,
  };
  const beneficii = reteta.beneficiiSubBanner
    ? { ...din("usp_strip", "usp", "icons"), enabled: true, enabledOverride: true }
    : null;
  const categoriiBaza = din("category_nav", "categories", reteta.categorii?.varianta ?? "classic");
  const categorii: SectionInstance = reteta.categorii
    ? { ...peVarianta(categoriiBaza, reteta.categorii.varianta, reteta.categorii.setari), enabled: true, enabledOverride: true }
    : { ...categoriiBaza, enabled: false, enabledOverride: false };
  const randuri = baza.home.filter((s) => s.kind === "product_row").map((s) => ({ ...s, settings: { ...s.settings, banda: reteta.randuriPePanou } }));

  const p = reteta.placi;
  const placiLui = baza.home.find((s) => s.kind === "placi_promo");
  let placi: SectionInstance | null = null;
  if (p) {
    const placiDemo = date ? (p.linkuriSpreCategorii
      ? date.categorii.map((c) => ({ titlu: c.nume, imagine: c.imagine, link: hrefCategorie(radacina, c.nume), eticheta: "" }))
      : date.placi.map((x) => ({ titlu: x.titlu, imagine: x.imagine, link: hrefCategorie(radacina, x.categorie), eticheta: "" }))) : [];
    const areLui = !!placiLui && Array.isArray(placiLui.settings.placi) && (placiLui.settings.placi as unknown[]).length > 0;
    const bazaPlaci = placiLui ?? section("recomandari", "placi_promo", p.varianta, true, {});
    placi = {
      ...peVarianta(bazaPlaci, p.varianta, { titlu: p.titlu, ...p.setari, ...(areLui ? {} : { placi: placiDemo }) }),
      enabled: true,
    };
  }

  const ale = new Set<string>(["hero", "usp_strip", "category_nav", "product_row", "placi_promo"]);
  const restul = baza.home
    .filter((s) => !ale.has(s.kind) || (s.kind === "usp_strip" && !beneficii))
    .map((s) => (s.kind === "about" ? { ...s, enabled: false, enabledOverride: false } : s));
  const vizibile = randuri.map((r, i) => (r.enabled ? i : -1)).filter((i) => i >= 0);
  const taietura = p ? (p.dupaRandul <= 0 ? 0 : (vizibile[p.dupaRandul - 1] ?? randuri.length - 1) + 1) : randuri.length;
  const home = [
    banner,
    ...(beneficii ? [beneficii] : []),
    ...(p && p.dupaRandul <= 0 && placi ? [placi] : []),
    categorii,
    ...randuri.slice(0, taietura),
    ...(p && p.dupaRandul > 0 && placi ? [placi] : []),
    ...randuri.slice(taietura),
    ...restul,
  ];

  const magazin = { ...peVarianta(baza.shop.page, reteta.magazin.varianta, reteta.magazin.setari), enabled: true };
  const card = { ...baza.commerce.productCard, variant: reteta.card, variantOverride: reteta.card };
  const pp = reteta.paginaProdus;
  const paginaProdus = baza.product.page.variant === pp.varianta
    ? { ...baza.product.page, settings: { ...baza.product.page.settings, ...pp.setari } }
    : peVarianta(baza.product.page, pp.varianta, pp.setari);
  const sabloane = baza.product.sabloane?.map((s) => (s.page.variant === pp.varianta
    ? { ...s, page: { ...s.page, settings: { ...s.page.settings, ...pp.setari } } }
    : s));

  return parseStoreDesign({
    ...baza,
    style: reteta.stil,
    ordineAtinsa: true,
    chrome: { ...baza.chrome, header: antet, footer: subsol },
    home,
    shop: { ...baza.shop, page: magazin },
    product: { ...baza.product, page: paginaProdus, ...(sabloane ? { sabloane } : {}) },
    commerce: { ...baza.commerce, productCard: card },
  }, ctx);
}

/** Acelasi element ca in datele demo: titlul si poza neschimbate (linkul tine de radacina magazinului). */
function eDinDemo(x: unknown, demo: readonly { titlu: string; imagine: string }[]): boolean {
  if (!x || typeof x !== "object") return false;
  const { titlu, imagine } = x as Record<string, unknown>;
  return demo.some((d) => d.titlu === titlu && d.imagine === imagine);
}

/**
 * Inversul textelor demo („Șterge datele demo”, etapa 18.4), pentru orice tema facuta dupa reteta: placile, cardurile si
 * placile mozaicului ramase cum le-a pus importul, bannerul cu titlul si poza demo neschimbate, mesajul demo al barii.
 * Ce a schimbat omul ramane al lui.
 */
export function faraTexteleDemoReteta(reteta: RetetaTema, design: StoreDesign, date: SetDateDemo): { design: StoreDesign; schimbat: boolean } {
  let schimbat = false;
  const demoBanner = reteta.banner.demo?.(date, "/magazin") ?? {};
  const placiDemo = [...date.placi.map((p) => ({ titlu: p.titlu, imagine: p.imagine })), ...date.categorii.map((c) => ({ titlu: c.nume, imagine: c.imagine }))];
  const mozaicDemo = Array.isArray(demoBanner.placi)
    ? (demoBanner.placi as { titlu: string; imagine: string }[]).map((x) => ({ titlu: x.titlu, imagine: x.imagine }))
    : [];
  const fara = (lista: unknown, demo: readonly { titlu: string; imagine: string }[]) => {
    if (!Array.isArray(lista)) return lista;
    const ramase = lista.filter((x) => !eDinDemo(x, demo));
    if (ramase.length !== lista.length) schimbat = true;
    return ramase;
  };
  const home = design.home.map((s) => {
    if (s.kind === "hero") {
      const st = { ...s.settings };
      if (Array.isArray(st.carduri)) st.carduri = fara(st.carduri, date.carduri);
      if (Array.isArray(st.placi)) st.placi = fara(st.placi, mozaicDemo);
      if (typeof demoBanner.titlu === "string" && st.titlu === demoBanner.titlu && st.imagine === demoBanner.imagine) {
        for (const k of ["titlu", "text", "buton", "link", "imagine"]) st[k] = "";
        schimbat = true;
      }
      return { ...s, settings: st };
    }
    if (s.kind === "placi_promo" && Array.isArray(s.settings.placi)) return { ...s, settings: { ...s.settings, placi: fara(s.settings.placi, placiDemo) } };
    return s;
  });
  let header = design.chrome.header;
  if (reteta.antet.mesajDemo && header.settings.topText === reteta.antet.mesajDemo) {
    header = { ...header, settings: { ...header.settings, topText: "" } };
    schimbat = true;
  }
  return schimbat ? { design: { ...design, home, chrome: { ...design.chrome, header } }, schimbat } : { design, schimbat };
}
