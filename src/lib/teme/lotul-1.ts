import type { MenuItem } from "@/lib/pages/menu";
import { hrefCategorie } from "@/lib/storefront/category-href";
import { coloaneSubsolJupiter } from "./jupiter/design";
import { designDupaReteta, faraTexteleDemoReteta, type RetetaTema } from "./constructor";
import { DATE_DEMO_MERCUR, MENIU_DEMO_MERCUR } from "./mercur/date-demo";
import { DATE_DEMO_VENUS, MENIU_DEMO_VENUS } from "./venus/date-demo";
import { DATE_DEMO_TERRA, MENIU_DEMO_TERRA, MOZAIC_DEMO_TERRA } from "./terra/date-demo";
import { DATE_DEMO_MARTE, MENIU_DEMO_MARTE } from "./marte/date-demo";
import { CHEIE_MAGAZIN_DEMO } from "./gazde-demo";
import type { IdentitateTema, SetDateDemo } from "./tipuri";
import type { Tema } from "./teme";

/*
  ═══════════════════════════════════════════════════════════════════════════
  LOTUL 1 AL TEMELOR 2-30: MERCUR, VENUS, TERRA, MARTE (etapa 24 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Dupa modele, nu 1 la 1 (decizia 1 a etapei): Woodmart Pets, Altex, XStore Electronic, XStore Furniture Dark. Fiecare
  tema e o reteta (`constructor.ts`) + identitate + set demo. Pozele sunt generate (ElevenLabs), textele scrise aici.
*/

/** Datele unei teme facute dupa reteta, fara ce se calculeaza din reteta (designul si inversul textelor demo). */
interface DescriereTema {
  cheie: string;
  nume: string;
  descriere: string;
  date: SetDateDemo;
  reteta: RetetaTema;
  identitate: IdentitateTema;
  meniuDemo: MenuItem[];
  sloganDemo: string;
  /** Inaltimea siglei pe demo (`page_content.logo_size`), dupa cat de lata e sigla generata. */
  siglaMarime: number;
  magazinDemo: NonNullable<Tema["magazinDemo"]>;
}

export function temaDupaReteta(d: DescriereTema): Tema {
  return {
    cheie: d.cheie,
    nume: d.nume,
    descriere: d.descriere,
    slugDemo: `tema-${d.cheie}`,
    date: d.date,
    design: (ctx, date, baza, optiuni) => designDupaReteta(d.reteta, ctx, date, baza, optiuni),
    faraTexteleDemo: (design, date) => faraTexteleDemoReteta(d.reteta, design, date),
    identitate: d.identitate,
    setariDemo: { show_category_badges: false, [CHEIE_MAGAZIN_DEMO]: true, menu: d.meniuDemo, favicon_url: `/teme/${d.cheie}/favicon.png`, logo_size: d.siglaMarime },
    siglaDemo: `/teme/${d.cheie}/sigla.webp`,
    sloganDemo: d.sloganDemo,
    magazinDemo: d.magazinDemo,
  };
}

/** Subsolul „Hipermarket” si cele pe coloane primesc coloanele lui Jupiter (raioane, comenzi, informatii, suport). */
const COLOANE = coloaneSubsolJupiter;

// ─── Mercur: pet shop, dupa Woodmart Pets ──────────────────────────────────────────────────────────────────────────
export const MERCUR = temaDupaReteta({
  cheie: "mercur",
  nume: "Mercur",
  descriere: "Pentru magazine de animale de companie și alte magazine prietenoase: culori vii, colțuri rotunjite, categorii pe plăci colorate și un banner jumătate culoare, jumătate fotografie.",
  date: DATE_DEMO_MERCUR,
  identitate: { culoare: "#3446E0", fundal: "#FFFFFF", fontTitluri: "nunito", fontText: "figtree" },
  reteta: {
    stil: {
      colors: { accent: "#FDB447", surface: "#FFFFFF", text: "#1B1F3B", muted: "#686D8C", border: "#E6E8F2", footerBg: "#F5F6FA", footerText: "#1B1F3B" },
      fontScale: "md", radius: "lg", container: "wide", buttonStyle: "solid", buttonRadius: "full", cardStyle: "bordered", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "hipermarket", setari: { baraNavigare: "accent", cautareForma: "pastila", etichetaCategorii: "Toate categoriile", showTopBar: true }, mesajDemo: "Livrare gratuita peste 199 lei" },
    subsol: { varianta: "hipermarket", setari: { inapoiSus: true }, coloane: COLOANE },
    banner: {
      varianta: "impartit",
      setari: { fond: "principala" },
      demo: (_date, rad) => ({
        titlu: "Hrană bună pentru prietenul tău",
        text: "Hrană completă cu miel și orez pentru câinii adulți, cu vitaminele și mineralele de care au nevoie în fiecare zi.",
        buton: "Descoperă hrana",
        link: hrefCategorie(rad, "Hrană pentru câini"),
        imagine: "/teme/mercur/poze/hero.webp",
      }),
    },
    categorii: { varianta: "colorate", setari: { titlu: "Ce cauți azi?", fond: "accent" } },
    randuriPePanou: true,
    placi: { varianta: "rotunde", dupaRandul: 1, titlu: "Idei pentru prietenul tău" },
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: true } },
    card: "jupiter",
    paginaProdus: { varianta: "detailed", setari: { galleryHeight: "compact" } },
  },
  meniuDemo: MENIU_DEMO_MERCUR,
  sloganDemo: "Tot ce le trebuie prietenilor tăi blănoși.",
  siglaMarime: 46,
  magazinDemo: { nume: "Mercur Pet Shop", descriere: "Magazin demonstrativ al temei Mercur: hrană, jucării și accesorii pentru animale de companie.", email: "mercur@edinio-demo.test" },
});

// ─── Venus: electronice si electrocasnice, dupa Altex ──────────────────────────────────────────────────────────────
export const VENUS = temaDupaReteta({
  cheie: "venus",
  nume: "Venus",
  descriere: "Pentru magazine de electronice și electrocasnice: bara de navigare în culoarea magazinului, bannere late cu ofertele, plăci-fotografie și carduri cu prețul mare.",
  date: DATE_DEMO_VENUS,
  identitate: { culoare: "#C8102E", fundal: "#FFFFFF", fontTitluri: "rubik", fontText: "inter" },
  reteta: {
    stil: {
      colors: { accent: "#FFC72C", surface: "#FFFFFF", text: "#1F2328", muted: "#6A6F78", border: "#E2E4E8", footerBg: "#F4F5F7", footerText: "#1F2328" },
      fontScale: "md", radius: "sm", container: "normal", buttonStyle: "solid", buttonRadius: "inherit", cardStyle: "bordered", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "hipermarket", setari: { baraNavigare: "principala", cautareForma: "dreptunghi", etichetaCategorii: "Produse", showTopBar: false } },
    subsol: { varianta: "columns", coloane: COLOANE },
    banner: { varianta: "carduri", setari: {} },
    categorii: { varianta: "placi", setari: { titlu: "Categorii" } },
    randuriPePanou: false,
    placi: { varianta: "imagine", dupaRandul: 0, titlu: "" },
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: true } },
    card: "jupiter",
    paginaProdus: { varianta: "detailed", setari: {} },
  },
  meniuDemo: MENIU_DEMO_VENUS,
  sloganDemo: "Electronice și electrocasnice la prețuri bune.",
  siglaMarime: 44,
  magazinDemo: { nume: "Venus Electro", descriere: "Magazin demonstrativ al temei Venus: telefoane, laptopuri, televizoare și electrocasnice.", email: "venus@edinio-demo.test" },
});

// ─── Terra: gadgeturi, dupa XStore Electronic Mega Market ─────────────────────────────────────────────────────────
export const TERRA = temaDupaReteta({
  cheie: "terra",
  nume: "Terra",
  descriere: "Pentru magazine de gadgeturi și tehnologie: banner în mozaic, bandă de beneficii, categorii pe plăci gri și carduri minimaliste cu coșul pe imagine.",
  date: DATE_DEMO_TERRA,
  identitate: { culoare: "#0D7767", fundal: "#FFFFFF", fontTitluri: "sora", fontText: "inter" },
  reteta: {
    stil: {
      colors: { accent: "#111827", surface: "#FFFFFF", text: "#111827", muted: "#6B7280", border: "#E5E7EB", footerBg: "#F7F7F8", footerText: "#111827" },
      fontScale: "md", radius: "md", container: "wide", buttonStyle: "solid", buttonRadius: "inherit", cardStyle: "plain", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "hipermarket", setari: { baraNavigare: "deschisa", cautareForma: "dreptunghi", etichetaCategorii: "Toate departamentele", showTopBar: false } },
    subsol: { varianta: "columns", coloane: COLOANE },
    banner: {
      varianta: "mozaic",
      demo: (_date, rad) => ({
        placi: MOZAIC_DEMO_TERRA.map((p) => ({ titlu: p.titlu, text: p.text, imagine: p.imagine, link: hrefCategorie(rad, p.categorie), fond: p.fond })),
      }),
    },
    beneficiiSubBanner: true,
    categorii: { varianta: "placi", setari: { titlu: "Categorii populare" } },
    randuriPePanou: false,
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: true } },
    card: "minimal",
    paginaProdus: { varianta: "detailed", setari: {} },
  },
  meniuDemo: MENIU_DEMO_TERRA,
  sloganDemo: "Tehnologie bună, la îndemână.",
  siglaMarime: 40,
  magazinDemo: { nume: "Terra Gadget", descriere: "Magazin demonstrativ al temei Terra: audio, drone, telefoane și casă inteligentă.", email: "terra@edinio-demo.test" },
});

// ─── Marte: mobila, aspect intunecat, dupa XStore Furniture Dark ──────────────────────────────────────────────────
export const MARTE = temaDupaReteta({
  cheie: "marte",
  nume: "Marte",
  descriere: "Pentru magazine de mobilă și design interior, pe fond închis: sigla la mijloc, o fotografie panoramică cu titlu mare, colecții pe fotografii și carduri minimaliste.",
  date: DATE_DEMO_MARTE,
  identitate: { culoare: "#C8A27A", fundal: "#121212", fontTitluri: "outfit", fontText: "dmsans" },
  reteta: {
    stil: {
      colors: { accent: "#C8A27A", surface: "#1A1A1A", text: "#EDEAE4", muted: "#A09A90", border: "#2D2B28", footerBg: "#0C0C0C", footerText: "#EDEAE4" },
      fontScale: "md", radius: "sm", container: "xwide", buttonStyle: "solid", buttonRadius: "inherit", cardStyle: "plain", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "centered", setari: {} },
    subsol: { varianta: "dark", coloane: COLOANE },
    banner: {
      varianta: "panoramic",
      demo: (_date, rad) => ({
        titlu: "Mobilier modern",
        text: "Piese lucrate din lemn masiv, ratan și piele, pentru case calde și liniștite.",
        buton: "Vezi colecția",
        link: hrefCategorie(rad, "Fotolii"),
        imagine: "/teme/marte/poze/hero-fotoliu.webp",
      }),
    },
    categorii: null,
    randuriPePanou: true,
    placi: { varianta: "imagine", dupaRandul: 0, titlu: "Colecții", linkuriSpreCategorii: true },
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: false } },
    card: "minimal",
    paginaProdus: { varianta: "detailed", setari: { galleryHeight: "compact" } },
  },
  meniuDemo: MENIU_DEMO_MARTE,
  sloganDemo: "Mobilier pentru case liniștite.",
  siglaMarime: 58,
  magazinDemo: { nume: "Marte Interior", descriere: "Magazin demonstrativ al temei Marte: canapele, fotolii, mese, iluminat și decorațiuni.", email: "marte@edinio-demo.test" },
});
