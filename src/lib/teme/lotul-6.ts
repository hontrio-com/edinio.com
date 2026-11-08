import { hrefCategorie } from "@/lib/storefront/category-href";
import { coloaneSubsolJupiter } from "./jupiter/design";
import { temaDupaReteta } from "./lotul-1";
import { DATE_DEMO_REGULUS, MENIU_DEMO_REGULUS } from "./regulus/date-demo";
import { DATE_DEMO_BELLATRIX, MENIU_DEMO_BELLATRIX } from "./bellatrix/date-demo";
import { DATE_DEMO_BETELGEUSE, MENIU_DEMO_BETELGEUSE } from "./betelgeuse/date-demo";
import { DATE_DEMO_ACHERNAR, MENIU_DEMO_ACHERNAR } from "./achernar/date-demo";

/*
  ═══════════════════════════════════════════════════════════════════════════
  LOTUL 6 AL TEMELOR 2-30: REGULUS, BELLATRIX, BETELGEUSE, ACHERNAR (etapa 24 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Dupa Dude Perfect, dm, Douglas si Bricostore (dupa model, nu 1 la 1). Douglas e tot parfumerie, ca Sephora (Rigel):
  Betelgeuse merge pe negru cu verde-menta, colturi drepte si fotografii mari, fara placile si cardurile lui Rigel.
  Bricostore e tot bricolaj, ca Dedeman (Jupiter): Achernar ia banner lat, proiectele pe fotografii si antetul rosu.
*/

const COLOANE = coloaneSubsolJupiter;

// ─── Regulus: articole sportive si merchandise, albastru-cer cu visiniu, dupa Dude Perfect ────────────────────────
export const REGULUS = temaDupaReteta({
  cheie: "regulus",
  nume: "Regulus",
  descriere: "Pentru magazine de articole sportive și merchandise: albastru-cer cu vișiniu, meniu pe butoane rotunjite, fotografie panoramică, categorii colorate și carduri minimaliste.",
  date: DATE_DEMO_REGULUS,
  identitate: { culoare: "#187095", fundal: "#FFFFFF", fontTitluri: "anton", fontText: "rubik" },
  reteta: {
    stil: {
      colors: { accent: "#8A1538", surface: "#FFFFFF", text: "#0E1B2C", muted: "#5D6B7A", border: "#E1E8EE", footerBg: "#0E1B2C", footerText: "#FFFFFF" },
      fontScale: "md", radius: "lg", container: "xwide", buttonStyle: "solid", buttonRadius: "full", cardStyle: "plain", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "pills", setari: {} },
    subsol: { varianta: "dark", coloane: COLOANE },
    banner: {
      varianta: "panoramic",
      setari: { aliniere: "stanga" },
      demo: (_d, rad) => ({
        titlu: "Colecția de sărbători",
        text: "Hanorace, fesuri și mingi pentru toată gașca. Livrare gratuită peste 200 lei.",
        buton: "Cumpără acum",
        link: hrefCategorie(rad, "Noutăți"),
        imagine: "/teme/regulus/poze/hero.webp",
      }),
    },
    categorii: { varianta: "colorate", setari: { titlu: "Cumpără pe categorii", fond: "principala" } },
    randuriPePanou: false,
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: false } },
    card: "minimal",
    paginaProdus: { varianta: "detailed", setari: {} },
  },
  meniuDemo: MENIU_DEMO_REGULUS,
  sloganDemo: "Pentru fanii adevărați.",
  siglaMarime: 40,
  magazinDemo: { nume: "Regulus Store", descriere: "Magazin demonstrativ al temei Regulus: tricouri, hanorace, șepci, mingi și accesorii.", email: "regulus@edinio-demo.test" },
});

// ─── Bellatrix: drogherie, bleumarin cu galben, dupa dm ───────────────────────────────────────────────────────────
export const BELLATRIX = temaDupaReteta({
  cheie: "bellatrix",
  nume: "Bellatrix",
  descriere: "Pentru drogherii și magazine de îngrijire: bleumarin cu galben, căutare mare în antet, banner deschis cu fotografie, bandă de beneficii, categorii colorate și carduri clasice.",
  date: DATE_DEMO_BELLATRIX,
  identitate: { culoare: "#23336B", fundal: "#FFFFFF", fontTitluri: "jakarta", fontText: "inter" },
  reteta: {
    stil: {
      colors: { accent: "#F7C600", surface: "#FFFFFF", text: "#1D2A55", muted: "#5F6884", border: "#E3E7F0", footerBg: "#F2F5FA", footerText: "#1D2A55" },
      fontScale: "md", radius: "lg", container: "wide", buttonStyle: "solid", buttonRadius: "full", cardStyle: "plain", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "search", setari: {} },
    subsol: { varianta: "columns", coloane: COLOANE },
    banner: {
      varianta: "impartit",
      setari: { fond: "deschis" },
      demo: (_d, rad) => ({
        titlu: "Îngrijire pentru toată familia",
        text: "Cosmetice, produse pentru bebeluși și pentru casă, la prețuri bune în fiecare zi.",
        buton: "Descoperă ofertele",
        link: hrefCategorie(rad, "Îngrijire față"),
        imagine: "/teme/bellatrix/poze/hero.webp",
      }),
    },
    beneficiiSubBanner: true,
    categorii: { varianta: "colorate", setari: { titlu: "Ce cauți azi?", fond: "deschis" } },
    randuriPePanou: false,
    placi: { varianta: "rotunde", dupaRandul: 1, titlu: "Cele mai căutate raioane" },
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: true } },
    card: "classic",
    paginaProdus: { varianta: "detailed", setari: {} },
  },
  meniuDemo: MENIU_DEMO_BELLATRIX,
  sloganDemo: "Aici sunt om, aici cumpăr.",
  siglaMarime: 40,
  magazinDemo: { nume: "Bellatrix Drogerie", descriere: "Magazin demonstrativ al temei Bellatrix: machiaj, îngrijire, sănătate, bebeluși și casă.", email: "bellatrix@edinio-demo.test" },
});

// ─── Betelgeuse: parfumerie de lux, negru cu verde-menta, dupa Douglas ───────────────────────────────────────────
export const BETELGEUSE = temaDupaReteta({
  cheie: "betelgeuse",
  nume: "Betelgeuse",
  descriere: "Pentru parfumerii și cosmetice de lux: negru cu verde-mentă, colțuri drepte, titluri subțiri cu majuscule, fotografie panoramică și colecțiile pe fotografii mari.",
  date: DATE_DEMO_BETELGEUSE,
  identitate: { culoare: "#0F1414", fundal: "#FFFFFF", fontTitluri: "josefin", fontText: "worksans" },
  reteta: {
    stil: {
      colors: { accent: "#A8E0D2", surface: "#FFFFFF", text: "#0F1414", muted: "#667070", border: "#E4E8E7", footerBg: "#0F1414", footerText: "#FFFFFF" },
      fontScale: "md", radius: "none", container: "xwide", buttonStyle: "outline", buttonRadius: "none", cardStyle: "plain", cardRatio: "portrait", density: "normal",
    },
    antet: { varianta: "editorial", setari: { showTopBar: true } },
    subsol: { varianta: "dark", coloane: COLOANE },
    banner: {
      varianta: "panoramic",
      setari: { aliniere: "stanga" },
      demo: (_d, rad) => ({
        titlu: "Parfumuri pentru sezonul sărbătorilor",
        text: "Arome noi, seturi cadou și ritualuri de îngrijire, ambalate elegant.",
        buton: "Descoperă acum",
        link: hrefCategorie(rad, "Parfumuri"),
        imagine: "/teme/betelgeuse/poze/hero.webp",
      }),
    },
    categorii: null,
    randuriPePanou: false,
    placi: { varianta: "imagine", dupaRandul: 0, titlu: "Descoperă", linkuriSpreCategorii: true },
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: false } },
    card: "minimal",
    paginaProdus: { varianta: "detailed", setari: { galleryHeight: "compact" } },
  },
  meniuDemo: MENIU_DEMO_BETELGEUSE,
  sloganDemo: "Parfumul care te definește.",
  siglaMarime: 36,
  magazinDemo: { nume: "Betelgeuse Parfumerie", descriere: "Magazin demonstrativ al temei Betelgeuse: parfumuri, machiaj, îngrijire, lumânări și seturi cadou.", email: "betelgeuse@edinio-demo.test" },
});

// ─── Achernar: bricolaj si amenajari, rosu, dupa Bricostore ──────────────────────────────────────────────────────
export const ACHERNAR = temaDupaReteta({
  cheie: "achernar",
  nume: "Achernar",
  descriere: "Pentru magazine de bricolaj și amenajări: roșu, bara de navigare roșie cu meniul de produse, banner lat, proiectele pe fotografii și carduri cu prețul mare.",
  date: DATE_DEMO_ACHERNAR,
  identitate: { culoare: "#D40612", fundal: "#F5F5F5", fontTitluri: "outfit", fontText: "inter" },
  reteta: {
    stil: {
      colors: { accent: "#1F1F1F", surface: "#FFFFFF", text: "#1F1F1F", muted: "#646464", border: "#E4E4E4", footerBg: "#1F1F1F", footerText: "#FFFFFF" },
      fontScale: "md", radius: "md", container: "wide", buttonStyle: "solid", buttonRadius: "inherit", cardStyle: "bordered", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "hipermarket", setari: { baraNavigare: "principala", cautareForma: "pastila", etichetaCategorii: "Produse", showTopBar: false } },
    subsol: { varianta: "hipermarket", setari: { inapoiSus: true }, coloane: COLOANE },
    banner: { varianta: "banners", setari: {} },
    categorii: null,
    randuriPePanou: false,
    placi: { varianta: "imagine", dupaRandul: 0, titlu: "Idei pentru casa ta", linkuriSpreCategorii: true },
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: true } },
    card: "jupiter",
    paginaProdus: { varianta: "detailed", setari: {} },
  },
  meniuDemo: MENIU_DEMO_ACHERNAR,
  sloganDemo: "Puși pe treabă, împreună.",
  siglaMarime: 40,
  magazinDemo: { nume: "Achernar Brico", descriere: "Magazin demonstrativ al temei Achernar: unelte, construcții, baie, grădină și iluminat.", email: "achernar@edinio-demo.test" },
});
