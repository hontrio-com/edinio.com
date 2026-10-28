import { buildClassicDesign, section } from "@/lib/storefront/design/defaults";
import { hrefCategorie } from "@/lib/storefront/category-href";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { variantMeta } from "@/lib/storefront/design/registry";
import type { BlockInstance, DesignContext, SectionInstance, StoreDesign, StoreStyle } from "@/lib/storefront/design/types";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  ═══════════════════════════════════════════════════════════════════════════
  DESIGNUL TEMEI JUPITER (etapele 16.2-16.4 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Un design intreg, facut din variante obisnuite din registry (decizia 1 din plan): stilul (culorile si fonturile
  modelului), antetul si subsolul „hipermarket”, pagina Magazin cu filtre in stanga. Pornind de la designul clasic al
  magazinului, deci cu continutul LUI: aplicarea temei schimba cum arata magazinul, nu ce scrie in el.

  `date` = datele demo ale temei, cand se aplica impreuna cu ele (magazinul demo, „Importă datele demo”): atunci si
  textele de exemplu ale sectiunilor temei. Fara ele, sectiunile pornesc goale, iar magazinul isi pune textele lui.
*/

/** Culorile si fonturile modelului: albastrul si portocaliul, Open Sans pentru text, Sofia Sans pentru titluri. */
export const STIL_JUPITER: StoreStyle = {
  colors: {
    primary: "#215196",
    accent: "#FF882D",
    background: "#FFFFFF",
    surface: "#FFFFFF",
    text: "#333333",
    muted: "#6B6B6B",
    border: "#D9D9D9",
    footerBg: "#F5F5F5",
    footerText: "#333333",
  },
  fontHeading: "sofiasans",
  fontBody: "opensans",
  fontScale: "md",
  radius: "sm",
  container: "xwide",
  buttonStyle: "solid",
  buttonRadius: "inherit",
  cardStyle: "bordered",
  cardRatio: "square",
  density: "normal",
};

/** Coloanele subsolului: newsletterul (urca in banda lui), raioanele, comenzile, informatiile, suportul. */
export function coloaneSubsolJupiter(): BlockInstance[] {
  return [
    { id: "newsletter", type: "newsletter", enabled: true, settings: { titlu: "Abonează-te la newsletter pentru promoții săptămânale.", buton: "Abonează-te" } },
    { id: "raioane", type: "linkuri", enabled: true, settings: { titlu: "Raioane", sursa: "categorii", toateProdusele: false, cate: 6 } },
    {
      id: "comenzi", type: "linkuri", enabled: true,
      settings: {
        titlu: "Comenzi online", sursa: "alese",
        linkuri: [
          { eticheta: "Toate produsele", adresa: "/magazin" },
          { eticheta: "Coșul meu", adresa: "/cos" },
          { eticheta: "Retur produs", adresa: "/retur" },
        ],
      },
    },
    { id: "informatii", type: "linkuri", enabled: true, settings: { titlu: "Informații", sursa: "pagini" } },
    { id: "suport", type: "contact", enabled: true, settings: { titlu: "Suport clienți", telefon: true, whatsapp: true, email: true, oras: true } },
  ];
}

/** O sectiune pe varianta temei, cu reglajele ei implicite peste cele de azi si varianta tinuta (`variantOverride`). */
function peVarianta(s: SectionInstance, variant: string, setari: Record<string, unknown> = {}): SectionInstance {
  return {
    ...s,
    variant,
    variantOverride: variant,
    settings: { ...(variantMeta(s.kind, variant)?.defaults ?? {}), ...setari },
  };
}

/** Radacina catalogului in tema (pagina Magazin): de aici linkurile cardurilor si ale placilor demo. */
const RADACINA_CATALOG = "/magazin";

/**
 * Pagina principala a temei, in ordinea modelului: bannerul cu carduri, placile de categorii, primul rand de produse,
 * placile de recomandare, celelalte randuri. Restul sectiunilor magazinului raman DUPA ale temei, cu starea lor: un
 * „Despre noi” aprins nu dispare din vedere doar pentru ca s-a aplicat o tema.
 */
function paginaPrincipala(baza: StoreDesign, date: SetDateDemo | null): SectionInstance[] {
  const din = (kind: SectionInstance["kind"], id: string, variant: string) =>
    baza.home.find((s) => s.kind === kind) ?? section(id, kind, variant);
  const banner: SectionInstance = {
    ...peVarianta(din("hero", "hero", "carduri"), "carduri", {
      carduri: date ? date.carduri.map((c) => ({ titlu: c.titlu, text: c.text, imagine: c.imagine, link: hrefCategorie(RADACINA_CATALOG, c.categorie) })) : [],
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
  const recomandari = section("recomandari", "placi_promo", "rotunde", true, {
    ...(variantMeta("placi_promo", "rotunde")?.defaults ?? {}),
    placi: date ? date.placi.map((p) => ({ titlu: p.titlu, imagine: p.imagine, link: hrefCategorie(RADACINA_CATALOG, p.categorie), eticheta: "" })) : [],
  });
  const temei = new Set<string>(["hero", "category_nav", "product_row", "placi_promo"]);
  const restul = baza.home.filter((s) => !temei.has(s.kind));
  // Placile de recomandare dupa primul rand care se vede, ca „Recomandări” de pe model (dupa „Oferte de sezon”).
  const dupa = randuri.findIndex((r) => r.enabled) + 1;
  return [banner, categorii, ...randuri.slice(0, dupa), recomandari, ...randuri.slice(dupa), ...restul];
}

export function designJupiter(ctx: DesignContext, date: SetDateDemo | null): StoreDesign {
  const baza = buildClassicDesign(ctx);
  const antet = peVarianta(baza.chrome.header, "hipermarket", date ? { topText: "Livrare în toată țara" } : {});
  const subsol = { ...peVarianta(baza.chrome.footer, "hipermarket", { inapoiSus: true }), blocks: coloaneSubsolJupiter() };
  // Catalogul pe pagina lui, ca pe model: pe prima pagina raman doar randurile alese.
  const magazin = { ...peVarianta(baza.shop.page, "sidebar", { pastreazaGrilaAcasa: false }), enabled: true };
  const card = { ...baza.commerce.productCard, variant: "jupiter", variantOverride: "jupiter" };
  return parseStoreDesign({
    ...baza,
    style: STIL_JUPITER,
    ordineAtinsa: true,
    chrome: { ...baza.chrome, header: antet, footer: subsol },
    home: paginaPrincipala(baza, date),
    shop: { ...baza.shop, page: magazin },
    commerce: { ...baza.commerce, productCard: card },
  }, ctx);
}
