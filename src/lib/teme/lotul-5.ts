import { hrefCategorie } from "@/lib/storefront/category-href";
import { coloaneSubsolJupiter } from "./jupiter/design";
import { temaDupaReteta } from "./lotul-1";
import { DATE_DEMO_DENEB, MENIU_DEMO_DENEB } from "./deneb/date-demo";
import { DATE_DEMO_SPICA, MENIU_DEMO_SPICA, MOZAIC_DEMO_SPICA } from "./spica/date-demo";
import { DATE_DEMO_PROCYON, MENIU_DEMO_PROCYON, VITRINA_DEMO_PROCYON } from "./procyon/date-demo";
import { DATE_DEMO_CANOPUS, MENIU_DEMO_CANOPUS, VITRINA_DEMO_CANOPUS } from "./canopus/date-demo";

/*
  ═══════════════════════════════════════════════════════════════════════════
  LOTUL 5 AL TEMELOR 2-30: DENEB, SPICA, PROCYON, CANOPUS (etapa 24 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Dupa Timestore, Solartech, evomag si QwertyKey (dupa model, nu 1 la 1). evomag si QwertyKey deschid pagina cu un rand
  de carduri inalte cu fotografie; pentru ele s-a facut bannerul „vitrina” (`HeroVitrina`).
*/

const COLOANE = coloaneSubsolJupiter;

type CardDemo = { readonly eticheta: string; readonly titlu: string; readonly text: string; readonly imagine: string; readonly categorie: string };
const vitrinaDemo = (carduri: readonly CardDemo[], rad: string) => ({
  carduri: carduri.map((c) => ({ eticheta: c.eticheta, titlu: c.titlu, text: c.text, imagine: c.imagine, link: hrefCategorie(rad, c.categorie) })),
});

// ─── Deneb: ceasuri si bijuterii, alb-negru cu auriu, dupa Timestore ──────────────────────────────────────────────
export const DENEB = temaDupaReteta({
  cheie: "deneb",
  nume: "Deneb",
  descriere: "Pentru magazine de ceasuri, bijuterii și accesorii: alb-negru cu auriu, antet simplu, banner cu două carduri alăturate, categorii pe plăci și carduri clasice.",
  date: DATE_DEMO_DENEB,
  identitate: { culoare: "#111111", fundal: "#FFFFFF", fontTitluri: "lora", fontText: "dmsans" },
  reteta: {
    stil: {
      colors: { accent: "#E8B923", surface: "#FFFFFF", text: "#111111", muted: "#6B6B6B", border: "#E7E7E7", footerBg: "#111111", footerText: "#FFFFFF" },
      fontScale: "md", radius: "sm", container: "wide", buttonStyle: "solid", buttonRadius: "inherit", cardStyle: "plain", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "classic", setari: {} },
    subsol: { varianta: "dark", coloane: COLOANE },
    banner: {
      varianta: "carduri",
      demo: (date, rad) => ({
        carduri: date.carduri.map((c) => ({ titlu: c.titlu, text: c.text, imagine: c.imagine, link: hrefCategorie(rad, c.categorie) })),
      }),
    },
    categorii: { varianta: "placi", setari: { titlu: "Cumpără pe categorii" } },
    randuriPePanou: false,
    placi: { varianta: "rotunde", dupaRandul: 1, titlu: "Cadouri pentru el și pentru ea" },
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: false } },
    card: "classic",
    paginaProdus: { varianta: "detailed", setari: {} },
  },
  meniuDemo: MENIU_DEMO_DENEB,
  sloganDemo: "Ceasuri și bijuterii, alese cu grijă.",
  siglaMarime: 38,
  magazinDemo: { nume: "Deneb Time", descriere: "Magazin demonstrativ al temei Deneb: ceasuri, bijuterii, ochelari de soare, genți și parfumuri.", email: "deneb@edinio-demo.test" },
});

// ─── Spica: energie solara, negru cu galben, dupa Solartech ───────────────────────────────────────────────────────
export const SPICA = temaDupaReteta({
  cheie: "spica",
  nume: "Spica",
  descriere: "Pentru magazine de panouri fotovoltaice, invertoare și baterii: negru cu galben, bara de navigare neagră, banner în mozaic pe plăci închise, categorii colorate și carduri cu prețul mare.",
  date: DATE_DEMO_SPICA,
  identitate: { culoare: "#111111", fundal: "#F6F6F4", fontTitluri: "montserrat", fontText: "opensans" },
  reteta: {
    stil: {
      colors: { accent: "#FFC400", surface: "#FFFFFF", text: "#141414", muted: "#626262", border: "#E3E3E0", footerBg: "#111111", footerText: "#FFFFFF" },
      fontScale: "md", radius: "lg", container: "wide", buttonStyle: "solid", buttonRadius: "inherit", cardStyle: "bordered", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "hipermarket", setari: { baraNavigare: "principala", cautareForma: "dreptunghi", etichetaCategorii: "Produse", showTopBar: true }, mesajDemo: "Livrare rapida din stoc propriu" },
    subsol: { varianta: "hipermarket", setari: { inapoiSus: true }, coloane: COLOANE },
    banner: {
      varianta: "mozaic",
      demo: (_date, rad) => ({
        placi: MOZAIC_DEMO_SPICA.map((p) => ({ titlu: p.titlu, text: p.text, imagine: p.imagine, link: hrefCategorie(rad, p.categorie), fond: p.fond })),
      }),
    },
    categorii: { varianta: "colorate", setari: { titlu: "Alege echipamentul", fond: "principala" } },
    randuriPePanou: false,
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: true } },
    card: "jupiter",
    paginaProdus: { varianta: "detailed", setari: {} },
  },
  meniuDemo: MENIU_DEMO_SPICA,
  sloganDemo: "Energie curată, din stoc propriu.",
  siglaMarime: 42,
  magazinDemo: { nume: "Spica Solar", descriere: "Magazin demonstrativ al temei Spica: panouri fotovoltaice, invertoare, baterii și încărcătoare EV.", email: "spica@edinio-demo.test" },
});

// ─── Procyon: electronice si electrocasnice, zmeuriu, dupa evomag ─────────────────────────────────────────────────
export const PROCYON = temaDupaReteta({
  cheie: "procyon",
  nume: "Procyon",
  descriere: "Pentru magazine de electronice și electrocasnice: zmeuriu, antet alb cu meniul de categorii, rând de carduri înalte cu oferte, bandă de beneficii și plăci pe fotografii.",
  date: DATE_DEMO_PROCYON,
  identitate: { culoare: "#CF1550", fundal: "#FFFFFF", fontTitluri: "figtree", fontText: "inter" },
  reteta: {
    stil: {
      colors: { accent: "#1C1C24", surface: "#FFFFFF", text: "#1C1C24", muted: "#686874", border: "#E6E6EC", footerBg: "#F5F5F8", footerText: "#1C1C24" },
      fontScale: "md", radius: "lg", container: "wide", buttonStyle: "solid", buttonRadius: "inherit", cardStyle: "bordered", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "hipermarket", setari: { baraNavigare: "alba", cautareForma: "pastila", etichetaCategorii: "Produse", showTopBar: false } },
    subsol: { varianta: "columns", coloane: COLOANE },
    banner: { varianta: "vitrina", demo: (_date, rad) => vitrinaDemo(VITRINA_DEMO_PROCYON, rad) },
    beneficiiSubBanner: true,
    categorii: { varianta: "placi", setari: { titlu: "Categorii populare" } },
    randuriPePanou: false,
    placi: { varianta: "imagine", dupaRandul: 1, titlu: "Pentru fiecare cameră" },
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: true } },
    card: "jupiter",
    paginaProdus: { varianta: "detailed", setari: {} },
  },
  meniuDemo: MENIU_DEMO_PROCYON,
  sloganDemo: "Electronice și electrocasnice la un preț bun.",
  siglaMarime: 40,
  magazinDemo: { nume: "Procyon Electro", descriere: "Magazin demonstrativ al temei Procyon: televizoare, electrocasnice, climatizare, laptopuri și telefoane.", email: "procyon@edinio-demo.test" },
});

// ─── Canopus: tastaturi mecanice si periferice, fond inchis cu verde-lime, dupa QwertyKey ────────────────────────
export const CANOPUS = temaDupaReteta({
  cheie: "canopus",
  nume: "Canopus",
  descriere: "Pentru magazine de tastaturi mecanice și periferice de gaming, pe fond închis: verde-lime cu portocaliu, meniul lângă siglă, rând de carduri înalte, plăci pe fotografii și carduri minimaliste.",
  date: DATE_DEMO_CANOPUS,
  identitate: { culoare: "#C6F432", fundal: "#0A0A0A", fontTitluri: "unbounded", fontText: "dmsans" },
  reteta: {
    stil: {
      colors: { accent: "#FF4D1F", surface: "#151515", text: "#F2F2F2", muted: "#9B9B9B", border: "#2A2A2A", footerBg: "#050505", footerText: "#F2F2F2" },
      fontScale: "md", radius: "lg", container: "xwide", buttonStyle: "solid", buttonRadius: "full", cardStyle: "plain", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "nav", setari: {} },
    subsol: { varianta: "dark", coloane: COLOANE },
    banner: { varianta: "vitrina", demo: (_date, rad) => vitrinaDemo(VITRINA_DEMO_CANOPUS, rad) },
    categorii: { varianta: "placi", setari: { titlu: "Alege categoria" } },
    randuriPePanou: false,
    placi: { varianta: "imagine", dupaRandul: 1, titlu: "Inspirație pentru setup" },
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: false } },
    card: "minimal",
    paginaProdus: { varianta: "detailed", setari: { galleryHeight: "compact" } },
  },
  meniuDemo: MENIU_DEMO_CANOPUS,
  sloganDemo: "Tastaturi mecanice, construite pentru tine.",
  siglaMarime: 34,
  magazinDemo: { nume: "Canopus Keys", descriere: "Magazin demonstrativ al temei Canopus: tastaturi mecanice, switch-uri, keycaps, mouse și căști.", email: "canopus@edinio-demo.test" },
});
