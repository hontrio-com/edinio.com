import { hrefCategorie } from "@/lib/storefront/category-href";
import { coloaneSubsolJupiter } from "./jupiter/design";
import { temaDupaReteta } from "./lotul-1";
import { DATE_DEMO_VEGA, MENIU_DEMO_VEGA } from "./vega/date-demo";
import { DATE_DEMO_ALTAIR, MENIU_DEMO_ALTAIR } from "./altair/date-demo";
import { DATE_DEMO_RIGEL, MENIU_DEMO_RIGEL } from "./rigel/date-demo";
import { DATE_DEMO_POLARIS, MENIU_DEMO_POLARIS } from "./polaris/date-demo";

/*
  ═══════════════════════════════════════════════════════════════════════════
  LOTUL 3 AL TEMELOR 2-30: VEGA, ALTAIR, RIGEL, POLARIS (etapa 24 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Dupa Gymshark, Kramp, Sephora si epantofi (dupa model, nu 1 la 1). epantofi e pe aceeasi platforma ca Modivo (Neptun),
  deci Polaris ia alt drum (ton cald, colturi mari, categorii in cercuri), ca sa nu fie doua teme la fel.
*/

const COLOANE = coloaneSubsolJupiter;

// ─── Vega: imbracaminte sport, dupa Gymshark ──────────────────────────────────────────────────────────────────────
export const VEGA = temaDupaReteta({
  cheie: "vega",
  nume: "Vega",
  descriere: "Pentru magazine de îmbrăcăminte sport: alb-negru, titluri mari cu majuscule, fotografie panoramică, activitățile pe fotografii și carduri minimaliste, înalte.",
  date: DATE_DEMO_VEGA,
  identitate: { culoare: "#0B0B0B", fundal: "#FFFFFF", fontTitluri: "bebas", fontText: "dmsans" },
  reteta: {
    stil: {
      colors: { accent: "#3D5AFE", surface: "#FFFFFF", text: "#0B0B0B", muted: "#6B6B6B", border: "#E6E6E6", footerBg: "#0B0B0B", footerText: "#FFFFFF" },
      fontScale: "md", radius: "none", container: "xwide", buttonStyle: "solid", buttonRadius: "none", cardStyle: "plain", cardRatio: "portrait", density: "normal",
    },
    antet: { varianta: "editorial", setari: {} },
    subsol: { varianta: "dark", coloane: COLOANE },
    banner: {
      varianta: "panoramic",
      setari: { aliniere: "stanga" },
      demo: (_d, rad) => ({
        titlu: "Antrenează-te fără limite",
        text: "Colanți, bustiere și hanorace făcute să țină pasul cu tine.",
        buton: "Cumpără acum",
        link: hrefCategorie(rad, "Colanți"),
        imagine: "/teme/vega/poze/hero.webp",
      }),
    },
    categorii: null,
    randuriPePanou: false,
    placi: { varianta: "imagine", dupaRandul: 0, titlu: "Cumpără pe activitate", linkuriSpreCategorii: true },
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: false } },
    card: "minimal",
    paginaProdus: { varianta: "detailed", setari: { galleryHeight: "compact" } },
  },
  meniuDemo: MENIU_DEMO_VEGA,
  sloganDemo: "Echipament pentru fiecare antrenament.",
  siglaMarime: 34,
  magazinDemo: { nume: "Vega Sport", descriere: "Magazin demonstrativ al temei Vega: colanți, tricouri, hanorace, încălțăminte și accesorii de sport.", email: "vega@edinio-demo.test" },
});

// ─── Altair: piese agricole si de gradina, dupa Kramp ─────────────────────────────────────────────────────────────
export const ALTAIR = temaDupaReteta({
  cheie: "altair",
  nume: "Altair",
  descriere: "Pentru distribuitori de piese și accesorii tehnice: antet cu bara de categorii, categoriile lângă banner, plăci galbene și carduri cu prețul mare.",
  date: DATE_DEMO_ALTAIR,
  identitate: { culoare: "#B5121B", fundal: "#FFFFFF", fontTitluri: "poppins", fontText: "opensans" },
  reteta: {
    stil: {
      colors: { accent: "#FFC629", surface: "#FFFFFF", text: "#1E1E1E", muted: "#636363", border: "#E2E2E2", footerBg: "#F4F4F4", footerText: "#1E1E1E" },
      fontScale: "md", radius: "md", container: "wide", buttonStyle: "solid", buttonRadius: "inherit", cardStyle: "bordered", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "market", setari: {} },
    subsol: { varianta: "hipermarket", setari: { inapoiSus: true }, coloane: COLOANE },
    banner: { varianta: "categories", setari: { maxCategories: 8 } },
    categorii: { varianta: "colorate", setari: { titlu: "Găsește piesa potrivită", fond: "accent" } },
    randuriPePanou: false,
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: true } },
    card: "jupiter",
    paginaProdus: { varianta: "detailed", setari: {} },
  },
  meniuDemo: MENIU_DEMO_ALTAIR,
  sloganDemo: "Piese și accesorii pentru utilaje, livrate a doua zi.",
  siglaMarime: 44,
  magazinDemo: { nume: "Altair Piese", descriere: "Magazin demonstrativ al temei Altair: transmisie, hidraulică, iluminat, anvelope și atelier.", email: "altair@edinio-demo.test" },
});

// ─── Rigel: frumusete si cosmetice, dupa Sephora ──────────────────────────────────────────────────────────────────
export const RIGEL = temaDupaReteta({
  cheie: "rigel",
  nume: "Rigel",
  descriere: "Pentru magazine de cosmetice și parfumuri: alb-negru elegant cu accent roz, titluri serif, bannere late, plăci de recomandare și carduri clasice.",
  date: DATE_DEMO_RIGEL,
  identitate: { culoare: "#111111", fundal: "#FFFFFF", fontTitluri: "playfair", fontText: "jakarta" },
  reteta: {
    stil: {
      colors: { accent: "#E8336D", surface: "#FFFFFF", text: "#111111", muted: "#6E6E6E", border: "#ECECEC", footerBg: "#F7F4F2", footerText: "#111111" },
      fontScale: "md", radius: "md", container: "wide", buttonStyle: "solid", buttonRadius: "full", cardStyle: "plain", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "search", setari: {} },
    subsol: { varianta: "columns", coloane: COLOANE },
    banner: { varianta: "carduri", setari: {} },
    categorii: { varianta: "placi", setari: { titlu: "Cumpără pe categorii" } },
    randuriPePanou: false,
    placi: { varianta: "rotunde", dupaRandul: 1, titlu: "Descoperă" },
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: false } },
    card: "classic",
    paginaProdus: { varianta: "detailed", setari: {} },
  },
  meniuDemo: MENIU_DEMO_RIGEL,
  sloganDemo: "Frumusețe, în fiecare zi.",
  siglaMarime: 30,
  magazinDemo: { nume: "Rigel Beauty", descriere: "Magazin demonstrativ al temei Rigel: parfumuri, machiaj, îngrijirea tenului și accesorii.", email: "rigel@edinio-demo.test" },
});

// ─── Polaris: incaltaminte, ton cald, dupa epantofi ───────────────────────────────────────────────────────────────
export const POLARIS = temaDupaReteta({
  cheie: "polaris",
  nume: "Polaris",
  descriere: "Pentru magazine de încălțăminte și genți: ton cald coniac, colțuri mari, antet rotunjit, fotografie panoramică, categoriile în cercuri și rânduri pe panou.",
  date: DATE_DEMO_POLARIS,
  identitate: { culoare: "#7A3E2B", fundal: "#FBF7F3", fontTitluri: "fraunces", fontText: "figtree" },
  reteta: {
    stil: {
      colors: { accent: "#D9A27E", surface: "#FFFFFF", text: "#2B1D17", muted: "#7D6A60", border: "#EADFD6", footerBg: "#F3ECE6", footerText: "#2B1D17" },
      fontScale: "md", radius: "lg", container: "wide", buttonStyle: "solid", buttonRadius: "full", cardStyle: "plain", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "pills", setari: {} },
    subsol: { varianta: "hipermarket", setari: { inapoiSus: true }, coloane: COLOANE },
    banner: {
      varianta: "panoramic",
      demo: (_d, rad) => ({
        titlu: "Pași siguri în sezonul rece",
        text: "Ghete, botine și bocanci din piele, cu livrare gratuită și retur în 30 de zile.",
        buton: "Vezi colecția",
        link: hrefCategorie(rad, "Ghete"),
        imagine: "/teme/polaris/poze/hero.webp",
      }),
    },
    categorii: { varianta: "classic", setari: {} },
    randuriPePanou: true,
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: false } },
    card: "minimal",
    paginaProdus: { varianta: "detailed", setari: {} },
  },
  meniuDemo: MENIU_DEMO_POLARIS,
  sloganDemo: "Încălțăminte din piele, pentru fiecare pas.",
  siglaMarime: 40,
  magazinDemo: { nume: "Polaris Shoes", descriere: "Magazin demonstrativ al temei Polaris: ghete, sneakers, mocasini, botine și genți.", email: "polaris@edinio-demo.test" },
});
