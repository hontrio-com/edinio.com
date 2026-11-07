import { hrefCategorie } from "@/lib/storefront/category-href";
import { coloaneSubsolJupiter } from "./jupiter/design";
import { temaDupaReteta } from "./lotul-1";
import { DATE_DEMO_SATURN, MENIU_DEMO_SATURN } from "./saturn/date-demo";
import { DATE_DEMO_URANUS, MENIU_DEMO_URANUS } from "./uranus/date-demo";
import { DATE_DEMO_NEPTUN, MENIU_DEMO_NEPTUN } from "./neptun/date-demo";
import { DATE_DEMO_SIRIUS, MENIU_DEMO_SIRIUS } from "./sirius/date-demo";

/*
  ═══════════════════════════════════════════════════════════════════════════
  LOTUL 2 AL TEMELOR 2-30: SATURN, URANUS, NEPTUN, SIRIUS (etapa 24 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Dupa ATV Rom, NAPA Auto Parts, Modivo si Fashion Days (dupa model, nu 1 la 1). Aceleasi unelte ca lotul 1.
*/

const COLOANE = coloaneSubsolJupiter;

// ─── Saturn: ATV-uri si motociclete, fond inchis, dupa ATV Rom ────────────────────────────────────────────────────
export const SATURN = temaDupaReteta({
  cheie: "saturn",
  nume: "Saturn",
  descriere: "Pentru dealeri de ATV-uri, motociclete și echipamente, pe fond închis: antet cu colțul colorat, fotografie panoramică cu titlul în stânga, categorii pe plăci portocalii și carduri minimaliste.",
  date: DATE_DEMO_SATURN,
  identitate: { culoare: "#FF6A13", fundal: "#0E0E10", fontTitluri: "oswald", fontText: "inter" },
  reteta: {
    stil: {
      colors: { accent: "#FF6A13", surface: "#17171A", text: "#F2F2F2", muted: "#9A9AA0", border: "#2A2A2E", footerBg: "#09090B", footerText: "#F2F2F2" },
      fontScale: "md", radius: "sm", container: "wide", buttonStyle: "solid", buttonRadius: "inherit", cardStyle: "plain", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "wedge", setari: {} },
    subsol: { varianta: "dark", coloane: COLOANE },
    banner: {
      varianta: "panoramic",
      setari: { aliniere: "stanga" },
      demo: (_d, rad) => ({
        titlu: "Gata de aventură",
        text: "ATV-uri, SSV-uri și motociclete, cu service și echipamente în același loc.",
        buton: "Vezi ATV-urile",
        link: hrefCategorie(rad, "ATV-uri"),
        imagine: "/teme/saturn/poze/hero.webp",
      }),
    },
    categorii: { varianta: "colorate", setari: { titlu: "Alege-ți categoria", fond: "principala" } },
    randuriPePanou: true,
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: false } },
    card: "minimal",
    paginaProdus: { varianta: "detailed", setari: {} },
  },
  meniuDemo: MENIU_DEMO_SATURN,
  sloganDemo: "Aventura începe aici.",
  siglaMarime: 40,
  magazinDemo: { nume: "Saturn Moto", descriere: "Magazin demonstrativ al temei Saturn: ATV-uri, SSV-uri, motociclete și echipamente.", email: "saturn@edinio-demo.test" },
});

// ─── Uranus: piese auto, dupa NAPA ────────────────────────────────────────────────────────────────────────────────
export const URANUS = temaDupaReteta({
  cheie: "uranus",
  nume: "Uranus",
  descriere: "Pentru magazine de piese auto și accesorii: bara de navigare galbenă, bannere cu oferte și două carduri alăturate, categorii pe plăci și carduri cu prețul mare.",
  date: DATE_DEMO_URANUS,
  identitate: { culoare: "#0A2A8A", fundal: "#FFFFFF", fontTitluri: "montserrat", fontText: "worksans" },
  reteta: {
    stil: {
      colors: { accent: "#FFC20E", surface: "#FFFFFF", text: "#14181F", muted: "#5E6673", border: "#DDE1E8", footerBg: "#F4F5F7", footerText: "#14181F" },
      fontScale: "md", radius: "sm", container: "wide", buttonStyle: "solid", buttonRadius: "inherit", cardStyle: "bordered", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "hipermarket", setari: { baraNavigare: "accent", cautareForma: "dreptunghi", etichetaCategorii: "Piese auto", showTopBar: true }, mesajDemo: "Livrare gratuita peste 200 lei" },
    subsol: { varianta: "dark", coloane: COLOANE },
    banner: {
      varianta: "carduri",
      demo: (date, rad) => ({
        carduri: date.carduri.map((c) => ({ titlu: c.titlu, text: c.text, imagine: c.imagine, link: hrefCategorie(rad, c.categorie) })),
      }),
    },
    categorii: { varianta: "placi", setari: { titlu: "Cumpără după categorie" } },
    randuriPePanou: false,
    placi: { varianta: "rotunde", dupaRandul: 1, titlu: "Promoții de sezon" },
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: true } },
    card: "jupiter",
    paginaProdus: { varianta: "detailed", setari: {} },
  },
  meniuDemo: MENIU_DEMO_URANUS,
  sloganDemo: "Piese pentru orice mașină, livrate repede.",
  siglaMarime: 44,
  magazinDemo: { nume: "Uranus Auto", descriere: "Magazin demonstrativ al temei Uranus: piese motor, uleiuri, baterii, frânare și scule.", email: "uranus@edinio-demo.test" },
});

// ─── Neptun: moda, alb-negru, colturi drepte, dupa Modivo ─────────────────────────────────────────────────────────
export const NEPTUN = temaDupaReteta({
  cheie: "neptun",
  nume: "Neptun",
  descriere: "Pentru magazine de modă: alb-negru, colțuri drepte, căutare mare în antet, banner cu panou negru și fotografie, categorii pe plăci și carduri minimaliste.",
  date: DATE_DEMO_NEPTUN,
  identitate: { culoare: "#111111", fundal: "#FFFFFF", fontTitluri: "jost", fontText: "inter" },
  reteta: {
    stil: {
      colors: { accent: "#E4002B", surface: "#FFFFFF", text: "#111111", muted: "#6B6B6B", border: "#E5E5E5", footerBg: "#F5F5F5", footerText: "#111111" },
      fontScale: "md", radius: "none", container: "wide", buttonStyle: "solid", buttonRadius: "none", cardStyle: "plain", cardRatio: "portrait", density: "normal",
    },
    antet: { varianta: "search", setari: {} },
    subsol: { varianta: "columns", coloane: COLOANE },
    banner: {
      varianta: "impartit",
      setari: { fond: "inchis" },
      demo: (_d, rad) => ({
        titlu: "Colecția de toamnă",
        text: "Paltoane, pulovere și botine pentru zilele reci. Livrare gratuită și retur în 30 de zile.",
        buton: "Descoperă",
        link: hrefCategorie(rad, "Geci"),
        imagine: "/teme/neptun/poze/hero.webp",
      }),
    },
    categorii: { varianta: "placi", setari: { titlu: "Cumpără pe categorii" } },
    randuriPePanou: false,
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: false } },
    card: "minimal",
    paginaProdus: { varianta: "detailed", setari: {} },
  },
  meniuDemo: MENIU_DEMO_NEPTUN,
  sloganDemo: "Modă pentru fiecare zi.",
  siglaMarime: 34,
  magazinDemo: { nume: "Neptun Fashion", descriere: "Magazin demonstrativ al temei Neptun: geci, genți, încălțăminte, pulovere și rochii.", email: "neptun@edinio-demo.test" },
});

// ─── Sirius: moda pentru femei, sigla la mijloc, titluri serif, dupa Fashion Days ────────────────────────────────
export const SIRIUS = temaDupaReteta({
  cheie: "sirius",
  nume: "Sirius",
  descriere: "Pentru magazine de modă și accesorii pentru femei: sigla la mijloc, titluri serif, banner deschis cu fotografie, categorii pe plăci galbene și rânduri pe panou.",
  date: DATE_DEMO_SIRIUS,
  identitate: { culoare: "#1A1A1A", fundal: "#FFFFFF", fontTitluri: "dmserif", fontText: "worksans" },
  reteta: {
    stil: {
      colors: { accent: "#E3F04A", surface: "#FFFFFF", text: "#1A1A1A", muted: "#707070", border: "#E8E8E8", footerBg: "#F6F6F4", footerText: "#1A1A1A" },
      fontScale: "md", radius: "none", container: "wide", buttonStyle: "solid", buttonRadius: "none", cardStyle: "plain", cardRatio: "portrait", density: "normal",
    },
    antet: { varianta: "centered", setari: {} },
    subsol: { varianta: "centered", coloane: COLOANE },
    banner: {
      varianta: "impartit",
      setari: { fond: "deschis" },
      demo: (_d, rad) => ({
        titlu: "Profită de reduceri",
        text: "Rochii, genți și accesorii de sezon, cu până la 30% mai puțin.",
        buton: "Vezi rochiile",
        link: hrefCategorie(rad, "Rochii"),
        imagine: "/teme/sirius/poze/hero.webp",
      }),
    },
    categorii: { varianta: "colorate", setari: { titlu: "Alege categoria", fond: "accent" } },
    randuriPePanou: true,
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: false } },
    card: "classic",
    paginaProdus: { varianta: "detailed", setari: {} },
  },
  meniuDemo: MENIU_DEMO_SIRIUS,
  sloganDemo: "Eleganță pentru fiecare ocazie.",
  siglaMarime: 38,
  magazinDemo: { nume: "Sirius Boutique", descriere: "Magazin demonstrativ al temei Sirius: rochii, pantofi, genți, bijuterii și parfumuri.", email: "sirius@edinio-demo.test" },
});
