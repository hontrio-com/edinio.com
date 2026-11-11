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
