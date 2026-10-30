import { buildClassicDesign, section } from "@/lib/storefront/design/defaults";
import { hrefCategorie } from "@/lib/storefront/category-href";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { variantMeta } from "@/lib/storefront/design/registry";
import { schemaBlocurilor } from "@/lib/storefront/design/blocuri";
import { jsonCanonic } from "@/lib/storefront/design/continut-ciorna";
import { cardurileHero } from "@/lib/storefront/design/hero-carduri";
import { placileDinSetari } from "@/lib/storefront/design/placi-promo";
import type { BlockInstance, DesignContext, SectionInstance, StoreDesign, StoreStyle } from "@/lib/storefront/design/types";
import type { IdentitateTema, OptiuniTema, SetDateDemo } from "@/lib/teme/tipuri";

/*
  ═══════════════════════════════════════════════════════════════════════════
  DESIGNUL TEMEI JUPITER (etapele 16.2-16.4 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Un design intreg, facut din variante obisnuite din registry (decizia 1 din plan): stilul (accentul, colturile,
  latimea; culoarea principala, fundalul si fonturile sunt identitatea, `IDENTITATE_JUPITER`, etapa 17.1), antetul si
  subsolul „hipermarket”, pagina Magazin cu filtre in stanga. Pornind de la designul clasic al magazinului, deci cu
  continutul LUI: aplicarea temei schimba cum arata magazinul, nu ce scrie in el.

  `date` = datele demo ale temei, cand se aplica impreuna cu ele (magazinul demo, „Importă datele demo”): atunci si
  textele de exemplu ale sectiunilor temei. Fara ele, sectiunile pornesc goale, iar magazinul isi pune textele lui.

  ⚠ Ca importul („Adaugă, marcate demo”): cardurile bannerului, placile de recomandare si mesajul barii de sus ale LUI
  raman ale lui; textele demo intra doar unde n-are nimic (gasit la 18.3: tema golea cardurile si inlocuia placile).
*/

/**
 * Identitatea modelului: albastrul, fundalul alb, Sofia Sans pentru titluri, Open Sans pentru text. Se scrie in magazin,
 * acolo unde o regleaza fila „Stil” (etapa 17.1), nu in design.
 */
export const IDENTITATE_JUPITER: IdentitateTema = {
  culoare: "#215196",
  fundal: "#FFFFFF",
  fontTitluri: "sofiasans",
  fontText: "opensans",
};

/**
 * Restul stilului modelului, ce fila „Stil” nu regleaza: portocaliul de accent, textul, chenarele, colturile, latimea.
 * ⚠ Fara culoarea principala, fundal si fonturi: in design ar fi castigat peste „Stil” (vezi `IDENTITATE_JUPITER`).
 */
export const STIL_JUPITER: StoreStyle = {
  colors: {
    accent: "#FF882D",
    surface: "#FFFFFF",
    text: "#333333",
    muted: "#6B6B6B",
    border: "#D9D9D9",
    footerBg: "#F5F5F5",
    footerText: "#333333",
  },
  fontScale: "md",
  radius: "sm",
  container: "xwide",
  buttonStyle: "solid",
  buttonRadius: "inherit",
  cardStyle: "bordered",
  cardRatio: "square",
  density: "normal",
};

/**
 * Reglajele temei pe pagina de produs: pe pagina ei lata (100rem), galeria patrata ajungea la 1086 px, mai inalta decat
 * fereastra si de 1,5 ori cat fisierul, deci neclara (etapa 21). Doar tema le pune: implicitul variantei ramane patrat.
 */
const SETARI_PAGINA_PRODUS = { galleryHeight: "compact" };

/** Radacina catalogului in magazinul demo (pagina Magazin); la aplicare, a magazinului (`OptiuniTema.radacinaCatalog`). */
const RADACINA_CATALOG = "/magazin";

/** Mesajul barii de sus din datele demo: intra doar cand omul n-are unul al lui, iar „Șterge datele demo” il scoate. */
export const MESAJ_BARA_DEMO = "Livrare in toata tara";

/** Coloanele subsolului: identitatea (sigla, sloganul, retelele), raioanele, comenzile, informatiile, suportul. */
export function coloaneSubsolJupiter(radacina: string = RADACINA_CATALOG): BlockInstance[] {
  return [
    { id: "identitate", type: "identitate", enabled: true, settings: { arataLogo: true, arataSloganul: true, arataRetelele: true } },
    { id: "raioane", type: "linkuri", enabled: true, settings: { titlu: "Raioane", sursa: "categorii", toateProdusele: false, cate: 6 } },
    {
      id: "comenzi", type: "linkuri", enabled: true,
      settings: {
        titlu: "Comenzi online", sursa: "alese",
        linkuri: [
          { eticheta: "Toate produsele", adresa: radacina },
          // Nu „Cosul meu”: designul are cosul in sertar, deci `/cos` trimite la prima pagina.
          { eticheta: "Produse la reducere", adresa: `${radacina}?sale=1` },
          { eticheta: "Retur produs", adresa: "/retur" },
        ],
      },
    },
    { id: "informatii", type: "linkuri", enabled: true, settings: { titlu: "Informatii", sursa: "pagini" } },
    { id: "suport", type: "contact", enabled: true, settings: { titlu: "Suport clienti", telefon: true, whatsapp: true, email: true, oras: true } },
  ];
}

/**
 * Coloanele subsolului dupa tema: ale lui, cand si le-a ales (etapa 11), cu tot cu un „Newsletter” pus de el; altfel ale temei.
 * ⚠ „Alese” nu inseamna „scrise”: parserul scrie si coloanele implicite, deci se compara cu implicitele variantei.
 */
function coloaneDupaTema(subsol: SectionInstance, optiuni: OptiuniTema): BlockInstance[] {
  const implicite = schemaBlocurilor("footer", subsol.variant)?.implicite?.(subsol.settings) ?? [];
  const aleseDeEl = !!subsol.blocks && jsonCanonic(subsol.blocks) !== jsonCanonic(implicite);
  if (aleseDeEl && subsol.blocks) return subsol.blocks;
  return coloaneSubsolJupiter(optiuni.radacinaCatalog);
}

/**
 * O sectiune pe varianta temei, tinuta (`variantOverride`): implicitele variantei, peste ele reglajele de azi ale
 * magazinului (parserul pastreaza doar ce are sens pe varianta noua), peste ele ce cere tema.
 */
function peVarianta(s: SectionInstance, variant: string, setari: Record<string, unknown> = {}): SectionInstance {
  return {
    ...s,
    variant,
    variantOverride: variant,
    settings: { ...(variantMeta(s.kind, variant)?.defaults ?? {}), ...s.settings, ...setari },
  };
}

/**
 * Pagina principala a temei, in ordinea modelului: bannerul cu carduri, placile de categorii, primul rand de produse,
 * placile de recomandare, celelalte randuri. Restul sectiunilor magazinului raman DUPA ale temei, cu starea lor, in afara
 * de „Despre noi”, care nu face parte din pagina temei (cererea lui, etapa 21): ramane in lista, stins, cu textul lui
 * neatins, si se aprinde din ochi.
 */
function paginaPrincipala(baza: StoreDesign, date: SetDateDemo | null, radacina: string): SectionInstance[] {
  const din = (kind: SectionInstance["kind"], id: string, variant: string) =>
    baza.home.find((s) => s.kind === kind) ?? section(id, kind, variant);
  const hero = din("hero", "hero", "carduri");
  // Cardurile LUI raman (un banner pe varianta cu carduri, completat de el); altfel ale temei, cu datele demo.
  const cardurileLui = cardurileHero(hero.settings).length > 0;
  const banner: SectionInstance = {
    ...peVarianta(hero, "carduri", cardurileLui ? {} : {
      carduri: date ? date.carduri.map((c) => ({ titlu: c.titlu, text: c.text, imagine: c.imagine, link: hrefCategorie(radacina, c.categorie) })) : [],
    }),
    enabled: true,
    enabledOverride: true,
  };
  const categorii: SectionInstance = {
    ...peVarianta(din("category_nav", "categories", "placi"), "placi"),
    enabled: true,
    enabledOverride: true,
  };
  const randuri = baza.home.filter((s) => s.kind === "product_row").map((s) => ({ ...s, settings: { ...s.settings, banda: true } }));
  // Placile de recomandare ale LUI raman, cu placile lor; doar fara ele, ale temei (cu datele demo, umplute).
  const placiLui = baza.home.find((s) => s.kind === "placi_promo");
  const placiDemo = date ? date.placi.map((p) => ({ titlu: p.titlu, imagine: p.imagine, link: hrefCategorie(radacina, p.categorie), eticheta: "" })) : [];
  const recomandari = placiLui
    ? (placileDinSetari(placiLui.settings).length > 0 ? placiLui : { ...placiLui, settings: { ...placiLui.settings, placi: placiDemo } })
    : section("recomandari", "placi_promo", "rotunde", true, { ...(variantMeta("placi_promo", "rotunde")?.defaults ?? {}), placi: placiDemo });
  const temei = new Set<string>(["hero", "category_nav", "product_row"]);
  const restul = baza.home
    .filter((s) => !temei.has(s.kind) && s !== placiLui)
    .map((s) => (s.kind === "about" ? { ...s, enabled: false, enabledOverride: false } : s));
  // Placile de recomandare dupa primul rand care se vede, ca „Recomandări” de pe model (dupa „Oferte de sezon”).
  const dupa = randuri.findIndex((r) => r.enabled) + 1;
  return [banner, categorii, ...randuri.slice(0, dupa), recomandari, ...randuri.slice(dupa), ...restul];
}

/**
 * `baza` = designul de acum al magazinului (la aplicare, etapa 17), ca sectiunile, blocurile si coloanele LUI sa ramana;
 * lipsa = designul clasic derivat din continut (magazinul demo).
 */
export function designJupiter(
  ctx: DesignContext, date: SetDateDemo | null, bazaMagazinului?: StoreDesign, optiuni: OptiuniTema = {},
): StoreDesign {
  const baza = bazaMagazinului ?? buildClassicDesign(ctx);
  const radacina = optiuni.radacinaCatalog ?? RADACINA_CATALOG;
  // Mesajul barii de sus: al lui, cand are unul; cel demo doar in locul gol.
  const mesajulLui = typeof baza.chrome.header.settings.topText === "string" && baza.chrome.header.settings.topText.trim() !== "";
  const antet = peVarianta(baza.chrome.header, "hipermarket", date && !mesajulLui ? { topText: MESAJ_BARA_DEMO } : {});
  const subsol = { ...peVarianta(baza.chrome.footer, "hipermarket", { inapoiSus: true }), blocks: coloaneDupaTema(baza.chrome.footer, optiuni) };
  // Catalogul pe pagina lui, ca pe model: pe prima pagina raman doar randurile alese.
  const magazin = { ...peVarianta(baza.shop.page, "sidebar", { pastreazaGrilaAcasa: false, placiSubcategorii: true }), enabled: true };
  const card = { ...baza.commerce.productCard, variant: "jupiter", variantOverride: "jupiter" };
  /*
   * Pagina de produs „Detaliat”, cu miniaturile in stanga, ca pe model (etapa 16.4). Blocurile si reglajele comune ale
   * magazinului raman: parserul le potriveste pe schema noua, iar „Conținutul liber” de sub produs exista in amandoua.
   */
  const paginaProdus = baza.product.page.variant === "detailed"
    ? { ...baza.product.page, settings: { ...baza.product.page.settings, ...SETARI_PAGINA_PRODUS } }
    : {
      ...baza.product.page,
      variant: "detailed",
      variantOverride: "detailed",
      settings: { ...(variantMeta("product_page", "detailed")?.defaults ?? {}), ...baza.product.page.settings, ...SETARI_PAGINA_PRODUS },
    };
  // Sabloanele lui (etapa 4b) raman ale lui, dar pe pagina lata au aceeasi galerie.
  const sabloane = baza.product.sabloane?.map((s) => (s.page.variant === "detailed"
    ? { ...s, page: { ...s.page, settings: { ...s.page.settings, ...SETARI_PAGINA_PRODUS } } }
    : s));
  return parseStoreDesign({
    ...baza,
    style: STIL_JUPITER,
    ordineAtinsa: true,
    chrome: { ...baza.chrome, header: antet, footer: subsol },
    home: paginaPrincipala(baza, date, radacina),
    shop: { ...baza.shop, page: magazin },
    product: { ...baza.product, page: paginaProdus, ...(sabloane ? { sabloane } : {}) },
    commerce: { ...baza.commerce, productCard: card },
  }, ctx);
}

/** Acelasi card sau aceeasi placa ca in datele demo: titlul si poza neschimbate (linkul tine de radacina magazinului). */
function eDinDemo(x: unknown, demo: readonly { titlu: string; imagine: string }[]): boolean {
  if (!x || typeof x !== "object") return false;
  const { titlu, imagine } = x as Record<string, unknown>;
  return demo.some((d) => d.titlu === titlu && d.imagine === imagine);
}

/**
 * Designul fara textele demo ale temei („Șterge datele demo”, etapa 18.4): cardurile bannerului si placile de
 * recomandare ramase cum le-a pus importul (acelasi titlu si aceeasi poza) si mesajul demo al barii de sus. Ce a
 * schimbat sau a adaugat omul ramane al lui. `schimbat` = s-a scos ceva (altfel nu e nimic de publicat).
 */
export function faraTexteleDemo(design: StoreDesign, date: SetDateDemo): { design: StoreDesign; schimbat: boolean } {
  let schimbat = false;
  const fara = (lista: unknown, demo: readonly { titlu: string; imagine: string }[]) => {
    if (!Array.isArray(lista)) return lista;
    const ramase = lista.filter((x) => !eDinDemo(x, demo));
    if (ramase.length !== lista.length) schimbat = true;
    return ramase;
  };
  const home = design.home.map((s) => {
    if (s.kind === "hero" && Array.isArray(s.settings.carduri)) return { ...s, settings: { ...s.settings, carduri: fara(s.settings.carduri, date.carduri) } };
    if (s.kind === "placi_promo" && Array.isArray(s.settings.placi)) return { ...s, settings: { ...s.settings, placi: fara(s.settings.placi, date.placi) } };
    return s;
  });
  let header = design.chrome.header;
  if (header.settings.topText === MESAJ_BARA_DEMO) {
    header = { ...header, settings: { ...header.settings, topText: "" } };
    schimbat = true;
  }
  return schimbat ? { design: { ...design, home, chrome: { ...design.chrome, header } }, schimbat } : { design, schimbat };
}
