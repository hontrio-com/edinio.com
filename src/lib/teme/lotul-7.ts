import { hrefCategorie } from "@/lib/storefront/category-href";
import { coloaneSubsolJupiter } from "./jupiter/design";
import { temaDupaReteta } from "./lotul-1";
import { DATE_DEMO_MIRA, MENIU_DEMO_MIRA } from "./mira/date-demo";
import { DATE_DEMO_ALNILAM, MENIU_DEMO_ALNILAM } from "./alnilam/date-demo";
import { DATE_DEMO_MINTAKA, MENIU_DEMO_MINTAKA, VITRINA_DEMO_MINTAKA } from "./mintaka/date-demo";
import { DATE_DEMO_ELECTRA, MENIU_DEMO_ELECTRA } from "./electra/date-demo";
import { DATE_DEMO_MAIA, MENIU_DEMO_MAIA } from "./maia/date-demo";

/*
  ═══════════════════════════════════════════════════════════════════════════
  LOTUL 7 AL TEMELOR 2-30: MIRA, ALNILAM, MINTAKA, ELECTRA, MAIA (etapa 24 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Dupa XStore Furniture 3, Partdo, Unimart Fashion, Unimart Furniture si Electro (dupa model, nu 1 la 1). Ultimul lot.
  Unimart Fashion deschide cu trei carduri inalte: vitrina umple acum randul si cu doua sau trei carduri.
*/

const COLOANE = coloaneSubsolJupiter;

// ─── Mira: mobila si decoratiuni, alb-negru cald, dupa XStore Furniture 3 ────────────────────────────────────────
export const MIRA = temaDupaReteta({
  cheie: "mira",
  nume: "Mira",
  descriere: "Pentru magazine de mobilă și decorațiuni: alb cu negru, bara de navigare neagră, fotografie panoramică cu titlul la mijloc, bandă de beneficii, categoriile în cercuri și carduri minimaliste.",
  date: DATE_DEMO_MIRA,
  identitate: { culoare: "#1A1A1A", fundal: "#FFFFFF", fontTitluri: "manrope", fontText: "inter" },
  reteta: {
    stil: {
      colors: { accent: "#B88A5A", surface: "#FFFFFF", text: "#1A1A1A", muted: "#6E6E6E", border: "#E7E5E2", footerBg: "#F5F3F0", footerText: "#1A1A1A" },
      fontScale: "md", radius: "sm", container: "wide", buttonStyle: "solid", buttonRadius: "inherit", cardStyle: "plain", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "market", setari: { showTopBar: false, showHotline: false } },
    subsol: { varianta: "columns", coloane: COLOANE },
    banner: {
      varianta: "panoramic",
      demo: (_d, rad) => ({
        titlu: "mobilier",
        text: "Piese din lemn masiv, piele și lână, făcute să dureze.",
        buton: "Vezi colecția",
        link: hrefCategorie(rad, "Comode"),
        imagine: "/teme/mira/poze/hero.webp",
      }),
    },
    beneficiiSubBanner: true,
    categorii: { varianta: "classic", setari: {} },
    randuriPePanou: false,
    placi: { varianta: "rotunde", dupaRandul: 1, titlu: "Inspirație pe camere" },
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: false } },
    card: "minimal",
    paginaProdus: { varianta: "detailed", setari: { galleryHeight: "compact" } },
  },
  meniuDemo: MENIU_DEMO_MIRA,
  sloganDemo: "Mobilier simplu, făcut să dureze.",
  siglaMarime: 34,
  magazinDemo: { nume: "Mira Home", descriere: "Magazin demonstrativ al temei Mira: scaune, comode, mese, iluminat și oglinzi.", email: "mira@edinio-demo.test" },
});

// ─── Alnilam: piese si accesorii auto, antracit cu rosu, dupa Partdo ─────────────────────────────────────────────
export const ALNILAM = temaDupaReteta({
  cheie: "alnilam",
  nume: "Alnilam",
  descriere: "Pentru magazine de piese și accesorii auto: antracit cu roșu, antet cu meniul de categorii, categoriile lângă bannere, plăci pe categorii și carduri cu prețul mare.",
  date: DATE_DEMO_ALNILAM,
  identitate: { culoare: "#D01A26", fundal: "#F4F5F7", fontTitluri: "sora", fontText: "opensans" },
  reteta: {
    stil: {
      colors: { accent: "#1E2329", surface: "#FFFFFF", text: "#1E2329", muted: "#646B75", border: "#E2E5EA", footerBg: "#1E2329", footerText: "#FFFFFF" },
      fontScale: "md", radius: "md", container: "wide", buttonStyle: "solid", buttonRadius: "inherit", cardStyle: "bordered", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "hipermarket", setari: { baraNavigare: "alba", cautareForma: "dreptunghi", etichetaCategorii: "Toate categoriile", showTopBar: true }, mesajDemo: "Montaj gratuit la jante si anvelope" },
    subsol: { varianta: "dark", coloane: COLOANE },
    banner: { varianta: "categories", setari: { maxCategories: 8 } },
    categorii: { varianta: "placi", setari: { titlu: "Cumpără după categorie" } },
    randuriPePanou: false,
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: true } },
    card: "jupiter",
    paginaProdus: { varianta: "detailed", setari: {} },
  },
  meniuDemo: MENIU_DEMO_ALNILAM,
  sloganDemo: "Piese bune, montate corect.",
  siglaMarime: 42,
  magazinDemo: { nume: "Alnilam Auto", descriere: "Magazin demonstrativ al temei Alnilam: faruri, jante, baterii, uleiuri și scule.", email: "alnilam@edinio-demo.test" },
});

// ─── Mintaka: moda, carduri pe fonduri pastelate, dupa Unimart Fashion ──────────────────────────────────────────
export const MINTAKA = temaDupaReteta({
  cheie: "mintaka",
  nume: "Mintaka",
  descriere: "Pentru magazine de modă: sigla la mijloc, trei carduri înalte cu fotografii pe fonduri pastelate, bandă de beneficii, categoriile în cercuri și plăci pe fotografii.",
  date: DATE_DEMO_MINTAKA,
  identitate: { culoare: "#1C1C1C", fundal: "#FFFFFF", fontTitluri: "poppins", fontText: "inter" },
  reteta: {
    stil: {
      colors: { accent: "#2F55D4", surface: "#FFFFFF", text: "#1C1C1C", muted: "#6B6B6B", border: "#E8E8EC", footerBg: "#F5F6F8", footerText: "#1C1C1C" },
      fontScale: "md", radius: "lg", container: "wide", buttonStyle: "solid", buttonRadius: "full", cardStyle: "plain", cardRatio: "portrait", density: "normal",
    },
    antet: { varianta: "centered", setari: {} },
    subsol: { varianta: "centered", coloane: COLOANE },
    banner: {
      varianta: "vitrina",
      demo: (_date, rad) => ({
        carduri: VITRINA_DEMO_MINTAKA.map((c) => ({ eticheta: c.eticheta, titlu: c.titlu, text: c.text, imagine: c.imagine, link: hrefCategorie(rad, c.categorie) })),
      }),
    },
    beneficiiSubBanner: true,
    categorii: { varianta: "classic", setari: {} },
    randuriPePanou: false,
    placi: { varianta: "imagine", dupaRandul: 1, titlu: "Cumpără pe stiluri" },
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: false } },
    card: "classic",
    paginaProdus: { varianta: "detailed", setari: {} },
  },
  meniuDemo: MENIU_DEMO_MINTAKA,
  sloganDemo: "Stilul tău, în fiecare sezon.",
  siglaMarime: 34,
  magazinDemo: { nume: "Mintaka Fashion", descriere: "Magazin demonstrativ al temei Mintaka: haine pentru femei, bărbați și copii, încălțăminte și genți.", email: "mintaka@edinio-demo.test" },
});

// ─── Electra: mobila moderna, roz pudrat, dupa Unimart Furniture ────────────────────────────────────────────────
export const ELECTRA = temaDupaReteta({
  cheie: "electra",
  nume: "Electra",
  descriere: "Pentru magazine de mobilă modernă: alb cu roz pudrat, meniul lângă siglă, fotografie panoramică cu titlul în stânga, categorii pe plăci și carduri minimaliste.",
  date: DATE_DEMO_ELECTRA,
  identitate: { culoare: "#2B2B2B", fundal: "#FFFFFF", fontTitluri: "raleway", fontText: "dmsans" },
  reteta: {
    stil: {
      colors: { accent: "#E8A598", surface: "#FFFFFF", text: "#2B2B2B", muted: "#76706E", border: "#EDE6E4", footerBg: "#FAF5F3", footerText: "#2B2B2B" },
      fontScale: "md", radius: "lg", container: "xwide", buttonStyle: "solid", buttonRadius: "full", cardStyle: "plain", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "nav", setari: {} },
    subsol: { varianta: "columns", coloane: COLOANE },
    banner: {
      varianta: "panoramic",
      setari: { aliniere: "stanga" },
      demo: (_d, rad) => ({
        titlu: "Mobilier care definește stilul",
        text: "Catifea, marmură și alamă pentru o casă luminoasă și caldă.",
        buton: "Descoperă colecția",
        link: hrefCategorie(rad, "Living"),
        imagine: "/teme/electra/poze/hero.webp",
      }),
    },
    categorii: { varianta: "placi", setari: { titlu: "Alege camera" } },
    randuriPePanou: false,
    placi: { varianta: "rotunde", dupaRandul: 1, titlu: "Cele mai iubite camere" },
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: false } },
    card: "minimal",
    paginaProdus: { varianta: "detailed", setari: { galleryHeight: "compact" } },
  },
  meniuDemo: MENIU_DEMO_ELECTRA,
  sloganDemo: "Mobilier care definește stilul.",
  siglaMarime: 34,
  magazinDemo: { nume: "Electra Living", descriere: "Magazin demonstrativ al temei Electra: canapele, fotolii, paturi, mese și iluminat.", email: "electra@edinio-demo.test" },
});

// ─── Maia: electronice, galben cu ardezie, dupa Electro ──────────────────────────────────────────────────────────
export const MAIA = temaDupaReteta({
  cheie: "maia",
  nume: "Maia",
  descriere: "Pentru magazine de electronice: galben cu gri-ardezie, bara de navigare galbenă, banner cu două carduri alăturate, categorii colorate și carduri clasice.",
  date: DATE_DEMO_MAIA,
  identitate: { culoare: "#333E48", fundal: "#FFFFFF", fontTitluri: "rubik", fontText: "opensans" },
  reteta: {
    stil: {
      colors: { accent: "#FED700", surface: "#FFFFFF", text: "#333E48", muted: "#6B747D", border: "#E6E8EB", footerBg: "#F5F6F7", footerText: "#333E48" },
      fontScale: "md", radius: "md", container: "wide", buttonStyle: "solid", buttonRadius: "full", cardStyle: "bordered", cardRatio: "square", density: "normal",
    },
    antet: { varianta: "hipermarket", setari: { baraNavigare: "accent", cautareForma: "pastila", etichetaCategorii: "Toate departamentele", showTopBar: false } },
    subsol: { varianta: "columns", coloane: COLOANE },
    banner: {
      varianta: "carduri",
      demo: (date, rad) => ({
        carduri: date.carduri.map((c) => ({ titlu: c.titlu, text: c.text, imagine: c.imagine, link: hrefCategorie(rad, c.categorie) })),
      }),
    },
    categorii: { varianta: "colorate", setari: { titlu: "Cumpără pe departamente", fond: "deschis" } },
    randuriPePanou: false,
    magazin: { varianta: "sidebar", setari: { pastreazaGrilaAcasa: false, placiSubcategorii: true } },
    card: "classic",
    paginaProdus: { varianta: "detailed", setari: {} },
  },
  meniuDemo: MENIU_DEMO_MAIA,
  sloganDemo: "Electronice bune, la prețuri corecte.",
  siglaMarime: 38,
  magazinDemo: { nume: "Maia Electronics", descriere: "Magazin demonstrativ al temei Maia: laptopuri, telefoane, foto, audio și console.", email: "maia@edinio-demo.test" },
});
