import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { BANNERE_INCADRATE, incadrareMobil, SLOT_INCADRAT_MOBIL } from "./incadrare-bannere";

/*
 * Etapa 25 (11.11.2026), vitrina: ce s-a schimbat pentru performanta, accesibilitate si telefon, pazit pe sursa (proiectul
 * n-are jsdom, deci componentele se citesc ca text, ca in restul probelor de vitrina).
 */

const cod = (cale: string) => readFileSync(cale, "utf8").replace(/\r\n/g, "\n");

test("25.17-25.18: incadrarea pe telefon e doar a pozelor demo care exista, dupa adresa; bannerul comerciantului n-are", () => {
  assert.ok(BANNERE_INCADRATE.length >= 6);
  for (const cale of BANNERE_INCADRATE) {
    assert.ok(existsSync(`public${cale}`), `lipseste ${cale}`);
    assert.match(incadrareMobil(cale) ?? "", /^\d+% \d+%$/);
  }
  // Aceeasi poza ceruta pe o varianta de latime sau cu domeniu: aceeasi incadrare.
  assert.equal(incadrareMobil("/teme/rigel/bannere/parfumuri.w1080.webp"), incadrareMobil("/teme/rigel/bannere/parfumuri.webp"));
  assert.equal(incadrareMobil("https://edinio.com/teme/deneb/bannere/colectia.webp"), "0% 50%");
  assert.equal(incadrareMobil("https://cdn.exemplu.ro/bannerul-meu.webp"), null);
  assert.equal(incadrareMobil(null), null);
  assert.equal(SLOT_INCADRAT_MOBIL, "max-sm:aspect-[4/3]");
  const h = cod("src/components/storefront/sections/hero/HeroBanners.tsx");
  assert.match(h, /const slot = incadrari\.some\(Boolean\) \? `\$\{slideClass\} \$\{SLOT_INCADRAT_MOBIL\}` : slideClass;/);
  assert.match(h, /style=\{incadrari\[i\] \? \{ objectPosition: incadrari\[i\]! \} : undefined\}/);
  // Un singur banner: fara sageti, puncte si pauza.
  assert.match(h, /\{count > 1 && \(<>/);
  assert.match(h, /\{!miscareRedusa && count > 1 && \(/);
});

test("25.23: bannerul principal cere pe telefon 75vw (densitate ~2,5), nu 100vw", () => {
  const h = cod("src/components/storefront/sections/hero/HeroBanners.tsx");
  assert.match(h, /export const SIZES_BANNER = "\(max-width: 640px\) 75vw, 100vw";/);
  assert.equal((h.match(/sizes=\{srcSet \? SIZES_BANNER : undefined\}/g) ?? []).length, 2);
  for (const f of ["HeroOverlay", "HeroPanoramic"]) {
    assert.match(cod(`src/components/storefront/sections/hero/${f}.tsx`), /sizes="\(max-width: 640px\) 75vw, 100vw"/, f);
  }
  // Niciun banner principal nu mai cere 100vw pe telefon.
  for (const f of ["HeroBanners", "HeroOverlay", "HeroPanoramic", "HeroMozaic", "HeroImpartit"]) {
    assert.doesNotMatch(cod(`src/components/storefront/sections/hero/${f}.tsx`), /sizes="100vw"|sizes=\{srcSet \? "100vw"/, f);
  }
});

test("25.25: vitrina nu mai importa framer-motion si nici clientul Supabase la prima incarcare", () => {
  for (const f of [
    "src/components/storefront/sections/product/ProductPageClassic.tsx",
    "src/components/storefront/sections/product/_shared/pieces.tsx",
    "src/components/ministore/OrderModal.tsx",
  ]) {
    assert.doesNotMatch(cod(f), /from "framer-motion"|from "motion\//, f);
  }
  const v = cod("src/components/ministore/VariantQuickAdd.tsx");
  assert.doesNotMatch(v, /^import \{ createClient \} from "@\/lib\/supabase\/client";$/m);
  assert.match(v, /import\("@\/lib\/supabase\/client"\)/);
});

test("25.25: efectele butonului in CSS, cu cadrele de dinainte si oprite la miscare redusa", () => {
  const p = cod("src/components/storefront/sections/product/_shared/pieces.tsx");
  assert.match(p, /pulse: "cta-puls",\s*shake: "cta-scutura",\s*bounce: "cta-salt",\s*glow: "cta-stralucire",\s*heartbeat: "cta-bataie",/);
  assert.match(p, /style=\{\{ \.\.\.base, \["--fx-c" as string\]: color \}\}/);
  const css = cod("src/app/stil-comun.css");
  for (const c of ["cta-puls", "cta-scutura", "cta-salt", "cta-stralucire", "cta-bataie"]) {
    assert.match(css, new RegExp(`\\.${c} \\{ animation: edinio-${c} `), c);
  }
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.cta-puls, \.cta-scutura, \.cta-salt, \.cta-stralucire, \.cta-bataie \{ animation: none; \}/);
  // Acordeonul intrebarilor: raspunsul inchis ramane in pagina, dar `inert` (nu se citeste, nu primeste focus).
  assert.match(p, /<div inert=\{!isOpen\}/);
  assert.match(p, /\$\{isOpen \? "grid-rows-\[1fr\] opacity-100" : "grid-rows-\[0fr\] opacity-0"\}/);
});

test("25.25: aparitiile de pe pagina de produs pe `data-anim`, cu sistemul paginilor proprii pornit in pagina", () => {
  const c = cod("src/components/storefront/sections/product/ProductPageClassic.tsx");
  assert.ok((c.match(/data-anim="fade-up"/g) ?? []).length >= 9);
  assert.match(c, /<PornesteAnimatiile \/>/);
  // Galeria si zona de cumparare nu mai asteapta hidratarea ca sa se vada (imaginea principala e elementul LCP).
  assert.doesNotMatch(c, /initial=\{\{ opacity: 0/);
  assert.match(c, /motion-safe:lg:animate-in motion-safe:lg:fade-in motion-safe:lg:slide-in-from-left-8/);
});

test("WCAG 2.4.7: pretul, sortarea din Magazin si cautarea din antet au inel de focus, nu doar marginea de 1 px", () => {
  // Gasite la trecerea din tastatura pe toate cele 30 de teme (axe nu verifica focusul vizibil): 30 de pagini Magazin si
  // 13 pagini cu `HeaderSearch`. Restul vitrinei avea deja inel.
  const s = cod("src/components/storefront/sections/shop/_shared/ShopPieces.tsx");
  const input = s.match(/const input =\n\s*"([^"]+)";/);
  assert.ok(input, "clasa campurilor de pret nu mai e unde o stiam");
  assert.match(input![1], /focus-visible:ring-2 focus-visible:ring-\[var\(--st-primary\)\]\/30/);
  const sortare = s.match(/aria-label="Sorteaza produsele"[\s\S]*?className="([^"]+)"/);
  assert.ok(sortare, "selectorul de sortare nu mai e unde il stiam");
  assert.match(sortare![1], /focus-visible:ring-2 focus-visible:ring-\[var\(--st-primary\)\]\/30/);
  // Cautarea din pagina Magazin (Deneb o arata printre primele 35 de opriri ale tastaturii).
  const cautareMagazin = s.match(/aria-label="Cauta produse"\n\s*className="([^"]+)"/);
  assert.ok(cautareMagazin, "cautarea din Magazin nu mai e unde o stiam");
  assert.match(cautareMagazin![1], /focus-visible:ring-2 focus-visible:ring-\[var\(--st-primary\)\]\/30/);
  const cautare = cod("src/components/storefront/sections/chrome/HeaderSearch.tsx");
  assert.match(cautare, /focus-within:border-\[var\(--st-primary\)\] focus-within:ring-2 focus-within:ring-\[var\(--st-primary\)\]\/30/);
});

test("25.21: un singur <main> pe pagina principala si pe Magazin, si unul pe pagina de produs", () => {
  const m = cod("src/components/ministore/MiniStoreRenderer.tsx");
  // Elementul JSX, pe randul lui (comentariul de langa el pomeneste si el `<main>`, de doua ori).
  assert.equal((m.match(/^\s*<main>\s*$/gm) ?? []).length, 1);
  assert.equal((m.match(/^\s*<\/main>\s*$/gm) ?? []).length, 1);
  assert.match(m, /<SectionRenderer sections=\{sectiuniDeAcasa\} faraMain \/>/);
  assert.match(m, /<aside aria-label="Contact rapid"/);
  assert.match(cod("src/app/(public)/[slug]/_rute/pagina-produs.tsx"), /<main>\s*<FurnizorSloturiBlocuri sloturi=\{sloturiContinut\}>/);
  assert.match(cod("src/components/storefront/sections/shop/_shared/ShopPieces.tsx"), /aria-label="Sorteaza produsele"/);
});

test("WCAG 1.4.3 (19.11.2026): antetele lipicioase si bara lipicioasa din Magazin au fond plin, nu translucid", () => {
  /*
    Gasit de auditul temelor pe Polaris, dupa derulare: antetul era `bg-…/95 backdrop-blur-md`, deci 5% din ce trecea pe
    sub el (o poza inchisa) ajungea in fondul lui, iar legaturile de categorie cadeau de la 4,6:1 la 4,36:1, sub pragul
    de 4,5. Contrastul unui text nu are voie sa depinda de ce se nimereste sub bara. La 95% nici nu se vedea vreo
    transparenta; ramanea doar costul: `backdrop-filter` pe o bara lata cat ecranul se recalculeaza la fiecare cadru al
    derularii.
  */
  const antete = ["HeaderCentered", "HeaderClassic", "HeaderMarket", "HeaderNav", "HeaderPills", "HeaderSearch"];
  for (const nume of antete) {
    const s = cod(`src/components/storefront/sections/chrome/${nume}.tsx`);
    const antet = s.match(/<header className=\{`sticky [^`]+`\}>/);
    assert.ok(antet, `${nume}: antetul lipicios nu mai e unde il stiam`);
    assert.doesNotMatch(antet![0], /backdrop-blur|\]\/\d+|bg-background\/\d+/, `${nume}: antetul lipicios e iar translucid`);
    assert.match(antet![0], /bg-(?:\[var\(--st-(?:surface|bg)\)\]|background)(?:[ `]|$)/, `${nume}: antetul lipicios nu mai are fond`);
  }
  const bara = cod("src/components/storefront/sections/shop/ShopPageCompact.tsx").match(/<div className="sticky [^"]+"/);
  assert.ok(bara, "bara lipicioasa din Magazin nu mai e unde o stiam");
  assert.doesNotMatch(bara![0], /backdrop-blur|\]\/\d+/, "bara lipicioasa din Magazin e iar translucida");
});

test("WCAG 2.1.1 (19.11.2026): panourile de categorii din antet se inchid cu Escape si intorc focusul pe butonul lor", () => {
  /*
    Gasit de proba de interactiuni pe 13 teme, pe toate cele trei motoare: „Produse”, „Categorii”, „Toate (categoriile)”
    se deschideau la apasare si se inchideau doar cu mouse-ul (clic in afara) sau la pierderea focusului. Din tastatura,
    panoul ramanea deschis peste pagina. Celelalte antete (Hipermarket, Centered, Editorial, Wedge) aveau deja Escape.
  */
  for (const nume of ["HeaderNav", "HeaderPills"]) {
    const s = cod(`src/components/storefront/sections/chrome/${nume}.tsx`);
    assert.match(s, /const onEsc = \(e: KeyboardEvent\) => \{\s*if \(e\.key !== "Escape"\) return;[\s\S]{0,160}?setDeschis\(false\);\s*if \(inPanou\) zona\.current\?\.querySelector\("button"\)\?\.focus\(\);/, `${nume}: panoul de categorii nu se mai inchide cu Escape`);
    assert.match(s, /document\.addEventListener\("keydown", onEsc\);[\s\S]{0,200}?document\.removeEventListener\("keydown", onEsc\);/, `${nume}: ascultatorul de Escape nu se mai curata`);
  }
  // Listele din caseta de cautare si panoul „Toate categoriile”: clic in afara si Escape ascultate pe DOCUMENT, prin carligul
  // comun. Pe invelis (`onKeyDown`, `onBlur`) cereau focusul inauntru, iar Safari nu-l muta pe butonul apasat cu mouse-ul:
  // acolo lista ramanea deschisa (gasit pe WebKit, dupa ce Chrome si Firefox trecusera).
  const carlig = cod("src/components/storefront/sections/_shared/inchide-panoul.ts");
  assert.match(carlig, /document\.addEventListener\("mousedown", laClic\);\s*document\.addEventListener\("keydown", laTasta\);/);
  assert.match(carlig, /if \(e\.key !== "Escape"\) return;[\s\S]{0,200}?setDeschis\(false\);\s*if \(inPanou\) zona\.current\?\.querySelector\("button"\)\?\.focus\(\);/);
  const piata = cod("src/components/storefront/sections/chrome/HeaderMarket.tsx");
  assert.equal((piata.match(/useInchidePanoul\(deschis, setDeschis, zona(?:Categorii)?\);/g) ?? []).length, 2, "HeaderMarket: cele doua panouri nu mai folosesc carligul comun");
  assert.match(cod("src/components/storefront/sections/chrome/HeaderSearch.tsx"), /useInchidePanoul\(deschis, setDeschis, zonaCategorii\);/);
  for (const nume of ["HeaderMarket", "HeaderSearch"]) {
    assert.doesNotMatch(cod(`src/components/storefront/sections/chrome/${nume}.tsx`), /onKeyDown=\{\(e\) => \{\s*if \(e\.key (?:!==|===) "Escape"/, `${nume}: Escape e iar prins pe invelis (cere focusul inauntru)`);
  }
});

test("WCAG 2.4.11 (19.11.2026): barele lipite de josul ecranului lasa loc de derulare, ca focusul sa nu ajunga sub ele", () => {
  /*
    Gasit trecand cu Tab prin pagina de produs la 390 px: 7-12 din 39 de opriri pe tema ajungeau cu totul sub bara de
    cumparare. Regula sta INAUNTRUL fiecarei bare (exista cat exista si bara) si doar sub 1024 px, unde bara se vede.
  */
  const regula = cod("src/components/storefront/LocPesteBaraDeJos.tsx");
  assert.match(regula, /@media \(max-width:1023\.98px\)\{html\{scroll-padding-bottom:calc\(5\.5rem \+ env\(safe-area-inset-bottom\)\)\}\}/);
  const bare: [string, RegExp][] = [
    ["src/components/storefront/sections/product/ProductPageDetailed.tsx", /<div className="lg:hidden fixed bottom-0 left-0 right-0[^"]*"\s*style=\{\{ paddingBottom: "calc\(0\.75rem \+ env\(safe-area-inset-bottom\)\)" \}\}>\s*<LocPesteBaraDeJos \/>/],
    ["src/components/storefront/sections/product/ProductPageClassic.tsx", /<div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden[^"]*"\s*style=\{\{ paddingBottom: "calc\(0\.75rem \+ env\(safe-area-inset-bottom\)\)" \}\}>\s*<LocPesteBaraDeJos \/>/],
    ["src/components/ministore/MiniStoreRenderer.tsx", /<div className="fixed bottom-0 left-0 right-0 z-30 lg:hidden[^"]*"\s*style=\{\{ paddingBottom: "calc\(0\.75rem \+ env\(safe-area-inset-bottom\)\)" \}\}>\s*<LocPesteBaraDeJos \/>/],
  ];
  for (const [fisier, tipar] of bare) assert.match(cod(fisier), tipar, `${fisier}: bara de jos nu mai lasa loc de derulare`);
  // Nicio alta bara fixa de jos, pe telefon, fara regula: o bara noua trebuie sa o primeasca si ea.
  for (const fisier of bare.map(([f]) => f)) {
    const s = cod(fisier);
    const fixe = (s.match(/className="[^"]*\bfixed bottom-0 left-0 right-0\b[^"]*lg:hidden[^"]*"|className="[^"]*lg:hidden[^"]*\bfixed bottom-0 left-0 right-0\b[^"]*"/g) ?? []).length;
    const cuLoc = (s.match(/<LocPesteBaraDeJos \/>/g) ?? []).length;
    assert.equal(cuLoc, fixe, `${fisier}: ${fixe} bare fixe de jos, ${cuLoc} cu loc de derulare`);
  }
});
