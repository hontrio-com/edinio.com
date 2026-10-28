import { buildClassicDesign } from "@/lib/storefront/design/defaults";
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

export function designJupiter(ctx: DesignContext, date: SetDateDemo | null): StoreDesign {
  const baza = buildClassicDesign(ctx);
  const antet = peVarianta(baza.chrome.header, "hipermarket", date ? { topText: "Livrare în toată țara" } : {});
  const subsol = { ...peVarianta(baza.chrome.footer, "hipermarket", { inapoiSus: true }), blocks: coloaneSubsolJupiter() };
  const magazin = { ...peVarianta(baza.shop.page, "sidebar"), enabled: true };
  return parseStoreDesign({
    ...baza,
    style: STIL_JUPITER,
    chrome: { ...baza.chrome, header: antet, footer: subsol },
    shop: { ...baza.shop, page: magazin },
  }, ctx);
}
