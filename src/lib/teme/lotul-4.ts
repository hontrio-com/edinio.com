import { hrefCategorie } from "@/lib/storefront/category-href";
import { coloaneSubsolJupiter } from "./jupiter/design";
import { temaDupaReteta } from "./lotul-1";
import { DATE_DEMO_ANTARES, MENIU_DEMO_ANTARES } from "./antares/date-demo";
import { DATE_DEMO_ARCTURUS, MENIU_DEMO_ARCTURUS } from "./arcturus/date-demo";
import { DATE_DEMO_ALDEBARAN, MENIU_DEMO_ALDEBARAN, MOZAIC_DEMO_ALDEBARAN } from "./aldebaran/date-demo";
import { DATE_DEMO_CAPELLA, MENIU_DEMO_CAPELLA } from "./capella/date-demo";

/*
  ═══════════════════════════════════════════════════════════════════════════
  LOTUL 4 AL TEMELOR 2-30: ANTARES, ARCTURUS, ALDEBARAN, CAPELLA (etapa 24 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Dupa Forit, GymBeam, King si Animax (dupa model, nu 1 la 1). Animax e tot pet shop, ca Woodmart Pets (Mercur), deci
  Capella ia alt drum: antet cu bara de categorii, bannere cu doua carduri, categoriile in cercuri, carduri cu pretul mare.
*/

const COLOANE = coloaneSubsolJupiter;

// ─── Antares: IT si electronice, bleumarin cu portocaliu, dupa Forit ───────────────────────────────────────────────
export const ANTARES = temaDupaReteta({
  cheie: "antares",
  nume: "Antares",
  descriere: "Pentru magazine de IT și electronice: bleumarin cu portocaliu, antet cu bara de categorii, banner lat, bandă de beneficii, categorii pe plăci și carduri cu prețul mare.",
  date: DATE_DEMO_ANTARES,
  identitate: { culoare: "#1D4E89", fundal: "#F5F7FB", fontTitluri: "instrument", fontText: "sofiasans" },
  reteta: {
    stil: {
      colors: { accent: "#F28C28", surface: "#FFFFFF", text: "#14213D", muted: "#5B6475", border: "#E1E6EF", footerBg: "#14213D", footerText: "#FFFFFF" },
      fontScale: "md", radius: "lg", container: "wide", buttonStyle: "solid", buttonRadius: "inherit", cardStyle: "bordered", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "market", setari: { showTopBar: true, showHotline: true } },
    subsol: { varianta: "hipermarket", setari: { inapoiSus: true, beneficii: true }, coloane: COLOANE },
    banner: { varianta: "banners", setari: {} },
    beneficiiSubBanner: true,
    categorii: { varianta: "colorate", setari: { titlu: "Cumpără după categorie", fond: "deschis" } },
    randuriPePanou: false,
    placi: { varianta: "rotunde", dupaRandul: 1, titlu: "Departamente populare" },
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: true } },
    card: "jupiter",
    paginaProdus: { varianta: "detailed", setari: {} },
  },
  meniuDemo: MENIU_DEMO_ANTARES,
  sloganDemo: "Tehnologie la prețuri mici.",
  siglaMarime: 42,
  magazinDemo: { nume: "Antares IT", descriere: "Magazin demonstrativ al temei Antares: laptopuri, telefoane, monitoare, componente și gaming.", email: "antares@edinio-demo.test" },
});

// ─── Arcturus: suplimente si nutritie sportiva, portocaliu cu negru, dupa GymBeam ─────────────────────────────────
export const ARCTURUS = temaDupaReteta({
  cheie: "arcturus",
  nume: "Arcturus",
  descriere: "Pentru magazine de suplimente și nutriție sportivă: portocaliu cu negru, meniul lângă siglă, banner jumătate culoare, bandă de beneficii și obiectivele pe fotografii.",
  date: DATE_DEMO_ARCTURUS,
  identitate: { culoare: "#FF5A1F", fundal: "#FFFFFF", fontTitluri: "spacegrotesk", fontText: "manrope" },
  reteta: {
    stil: {
      colors: { accent: "#111111", surface: "#FFFFFF", text: "#111111", muted: "#666666", border: "#E8E8E8", footerBg: "#111111", footerText: "#FFFFFF" },
      fontScale: "md", radius: "sm", container: "wide", buttonStyle: "solid", buttonRadius: "inherit", cardStyle: "bordered", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "nav", setari: {} },
    subsol: { varianta: "dark", coloane: COLOANE },
    banner: {
      varianta: "impartit",
      setari: { fond: "principala" },
      demo: (_d, rad) => ({
        titlu: "Atinge-ți obiectivele",
        text: "Proteine, creatină și vitamine testate, cu livrare în 24 de ore și transport gratuit peste 199 lei.",
        buton: "Vezi proteinele",
        link: hrefCategorie(rad, "Proteine"),
        imagine: "/teme/arcturus/poze/hero.webp",
      }),
    },
    beneficiiSubBanner: true,
    categorii: null,
    randuriPePanou: false,
    placi: { varianta: "imagine", dupaRandul: 0, titlu: "Care e obiectivul tău?", linkuriSpreCategorii: true },
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: false } },
    card: "classic",
    paginaProdus: { varianta: "detailed", setari: {} },
  },
  meniuDemo: MENIU_DEMO_ARCTURUS,
  sloganDemo: "Nutriție pentru fiecare obiectiv.",
  siglaMarime: 36,
  magazinDemo: { nume: "Arcturus Nutrition", descriere: "Magazin demonstrativ al temei Arcturus: proteine, creatină, vitamine, pre-workout și gustări proteice.", email: "arcturus@edinio-demo.test" },
});

// ─── Aldebaran: vinuri si bauturi premium, fond inchis cu auriu, dupa King ────────────────────────────────────────
export const ALDEBARAN = temaDupaReteta({
  cheie: "aldebaran",
  nume: "Aldebaran",
  descriere: "Pentru magazine de vinuri și băuturi premium, pe fond închis: auriu, titluri serif, banner în mozaic, categorii pe plăci și rânduri pe panou.",
  date: DATE_DEMO_ALDEBARAN,
  identitate: { culoare: "#C8A15A", fundal: "#0E0C0A", fontTitluri: "cormorant", fontText: "raleway" },
  reteta: {
    stil: {
      colors: { accent: "#C8A15A", surface: "#17140F", text: "#F1EBDD", muted: "#A39A88", border: "#2E2920", footerBg: "#080706", footerText: "#F1EBDD" },
      fontScale: "md", radius: "sm", container: "wide", buttonStyle: "outline", buttonRadius: "inherit", cardStyle: "plain", cardRatio: "portrait", density: "normal",
    },
    antet: { varianta: "search", setari: {} },
    subsol: { varianta: "dark", coloane: COLOANE },
    banner: {
      varianta: "mozaic",
      demo: (_date, rad) => ({
        placi: MOZAIC_DEMO_ALDEBARAN.map((p) => ({ titlu: p.titlu, text: p.text, imagine: p.imagine, link: hrefCategorie(rad, p.categorie), fond: p.fond })),
      }),
    },
    categorii: { varianta: "placi", setari: { titlu: "Explorează colecția" } },
    randuriPePanou: true,
    placi: { varianta: "rotunde", dupaRandul: 1, titlu: "Cadouri pentru fiecare ocazie" },
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: false } },
    card: "classic",
    paginaProdus: { varianta: "detailed", setari: { galleryHeight: "compact" } },
  },
  meniuDemo: MENIU_DEMO_ALDEBARAN,
  sloganDemo: "Băuturi alese, pentru seri bune.",
  siglaMarime: 40,
  magazinDemo: { nume: "Aldebaran Cellar", descriere: "Magazin demonstrativ al temei Aldebaran: vinuri, spumante, whisky, gin și coniac.", email: "aldebaran@edinio-demo.test" },
});

// ─── Capella: pet shop, verde cu galben, dupa Animax ──────────────────────────────────────────────────────────────
export const CAPELLA = temaDupaReteta({
  cheie: "capella",
  nume: "Capella",
  descriere: "Pentru pet shop-uri: verde cu galben, antet cu bara de categorii, bannere cu două carduri alăturate, animalele în cercuri și carduri cu prețul mare.",
  date: DATE_DEMO_CAPELLA,
  identitate: { culoare: "#2F9E41", fundal: "#FFFFFF", fontTitluri: "quicksand", fontText: "inter" },
  reteta: {
    stil: {
      colors: { accent: "#FFD23F", surface: "#FFFFFF", text: "#1E2B22", muted: "#66736A", border: "#E3EAE4", footerBg: "#F3F8F3", footerText: "#1E2B22" },
      fontScale: "md", radius: "lg", container: "wide", buttonStyle: "solid", buttonRadius: "full", cardStyle: "bordered", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "market", setari: { showTopBar: true, showHotline: false } },
    subsol: { varianta: "columns", coloane: COLOANE },
    banner: {
      varianta: "carduri",
      demo: (date, rad) => ({
        carduri: date.carduri.map((c) => ({ titlu: c.titlu, text: c.text, imagine: c.imagine, link: hrefCategorie(rad, c.categorie) })),
      }),
    },
    categorii: { varianta: "classic", setari: {} },
    randuriPePanou: true,
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: true } },
    card: "jupiter",
    paginaProdus: { varianta: "detailed", setari: {} },
  },
  meniuDemo: MENIU_DEMO_CAPELLA,
  sloganDemo: "Tot ce le trebuie prietenilor tăi.",
  siglaMarime: 42,
  magazinDemo: { nume: "Capella Pet", descriere: "Magazin demonstrativ al temei Capella: hrană, jucării, acvarii, cuști și accesorii pentru animale.", email: "capella@edinio-demo.test" },
});
