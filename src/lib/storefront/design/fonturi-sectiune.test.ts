import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { FONTURI_PAGINA, stivaFont } from "@/lib/pages/fonturi";
import { FONT_KEYS, type DesignContext, type StoreDesign } from "./types";
import { fontDinPageContent } from "./fonturi-magazin";
import { resolveStyle, buildClassicDesign } from "./defaults";
import { parseStoreDesign } from "./parse";
import { updateSection } from "./edit";
import { areFonturiProprii, fontulSectiunii, stilFontSectiune } from "./fonturi-sectiune";
import { sectionMeta } from "./registry";

/*
 * Etapa 14 (mentiunea 2 din 28.10, seara): fonturile pe sectiune, din cele 33 gazduite de noi, si aceleasi in fila
 * Stil (pana atunci, 8). Raspunsul lui: „Cele 36 găzduite de noi”; lista are 33, in intrebare numarasem gresit.
 */

const ctx: DesignContext = { primaryColor: "#07c527", pageContent: {}, features: {} };

test("fontul magazinului: Geist plus cele 33, iar cele 8 de dinainte raman chei valide", () => {
  assert.equal(FONT_KEYS.length, 1 + FONTURI_PAGINA.length);
  assert.equal(FONT_KEYS[0], "geist");
  for (const vechi of ["geist", "inter", "manrope", "jakarta", "dmsans", "sora", "playfair", "instrument"]) {
    assert.ok(FONT_KEYS.includes(vechi as never), vechi);
  }
  assert.equal(fontDinPageContent("poppins"), "poppins", "un font nou se poate alege in Stil");
  assert.equal(resolveStyle({}, { ...ctx, pageContent: { font_titluri: "bebas", font_text: "lora" } }).fontHeading, "bebas");
  assert.equal(fontDinPageContent("comic-sans"), undefined);
});

test("cele 7 fonturi de dinainte (fara Geist) au EXACT stiva de dinainte, deci vitrinele de azi nu se schimba", () => {
  /* Stivele scrise de mana in vechiul `fontSetup` (`storefront/design/fonts.ts`, pana la etapa 14). */
  const vechi: Record<string, string> = {
    inter: "var(--st-font-inter), system-ui, sans-serif",
    manrope: "var(--st-font-manrope), system-ui, sans-serif",
    jakarta: "var(--st-font-jakarta), system-ui, sans-serif",
    dmsans: "var(--st-font-dmsans), system-ui, sans-serif",
    sora: "var(--st-font-sora), system-ui, sans-serif",
    playfair: "var(--st-font-playfair), Georgia, serif",
    instrument: "var(--st-font-instrument), Georgia, serif",
  };
  for (const [cheie, stiva] of Object.entries(vechi)) assert.equal(stivaFont(cheie as never), stiva, cheie);
  /* Si aceleasi instante `next/font` (deci aceleasi clase), refolosite din `fonts.ts`. */
  const incarcate = readFileSync("src/components/pages/fonturi-incarcate.ts", "utf8");
  assert.match(incarcate, /import \{ dmsans, instrument, inter, jakarta, manrope, playfair, sora \} from "@\/lib\/storefront\/design\/fonts";/);
  assert.match(incarcate, /const GEIST = \{ className: "", stack: "var\(--font-geist-sans\), system-ui, sans-serif" \};/);
});

test("fontul sectiunii: nimic ales, niciun invelis", () => {
  assert.equal(stilFontSectiune({}), null);
  assert.equal(stilFontSectiune(undefined), null);
  assert.equal(stilFontSectiune({ fontTitluri: "comic-sans", fontText: 3 }), null, "o valoare necunoscuta e „Ca în Stil”");
});

test("fontul sectiunii: titluri si text, fiecare pe variabilele lui", () => {
  const amandoua = stilFontSectiune({ fontTitluri: "bebas", fontText: "lora" })!;
  assert.deepEqual(amandoua.chei, ["bebas", "lora"]);
  assert.equal(amandoua.style["--font-app-heading"], stivaFont("bebas"));
  assert.equal(amandoua.style["--st-font-heading"], stivaFont("bebas"));
  assert.equal(amandoua.style["--font-app"], stivaFont("lora"));
  assert.equal(amandoua.style["--st-font-body"], stivaFont("lora"));
  assert.equal(amandoua.style.fontFamily, stivaFont("lora"));

  const doarTitluri = stilFontSectiune({ fontTitluri: "playfair" })!;
  assert.deepEqual(Object.keys(doarTitluri.style).sort(), ["--font-app-heading", "--st-font-heading"]);

  const acelasi = stilFontSectiune({ fontTitluri: "poppins", fontText: "poppins" })!;
  assert.deepEqual(acelasi.chei, ["poppins"], "o singura clasa cand e acelasi font");
});

test("⚠ doar textul ales: titlurile raman pe fontul magazinului, nu urmeaza textul", () => {
  /* Pe Geist, radacina nu pune `--font-app-heading`, iar `--font-heading` ar fi cazut pe `--font-app`. */
  const doarText = stilFontSectiune({ fontText: "caveat" })!;
  assert.equal(doarText.style["--font-app-heading"], "var(--st-font-heading)");
  assert.equal(doarText.style["--st-font-heading"], undefined);
});

test("fontul se poate alege pe sectiunile paginii principale si pe antet, subsol, bara de anunt; nu pe paginile intregi", () => {
  for (const k of ["hero", "product_row", "benefits", "continut_liber", "header", "footer", "announcement"]) {
    assert.equal(areFonturiProprii(k as never), true, k);
  }
  for (const k of ["product_page", "shop_page", "cart_drawer", "checkout", "product_card"]) {
    assert.equal(areFonturiProprii(k as never), false, k);
  }
});

test("la citire: fontul ales ramane, cel necunoscut cade, iar pe pagina de produs nu se primeste", () => {
  const brut = buildClassicDesign(ctx) as StoreDesign;
  const hero = brut.home.find((s) => s.kind === "hero")!;
  hero.settings = { ...hero.settings, fontTitluri: "bebas", fontText: "nu-exista" };
  brut.chrome.header.settings = { ...brut.chrome.header.settings, fontText: "lora" };
  brut.product.page.settings = { ...brut.product.page.settings, fontTitluri: "bebas" };
  const citit = parseStoreDesign(JSON.parse(JSON.stringify(brut)), ctx);
  const heroCitit = citit.home.find((s) => s.kind === "hero")!;
  assert.equal(fontulSectiunii(heroCitit.settings, "fontTitluri"), "bebas");
  assert.equal(heroCitit.settings.fontText, undefined);
  assert.equal(citit.chrome.header.settings.fontText, "lora");
  assert.equal(citit.product.page.settings.fontTitluri, undefined);
});

test("la schimbarea designului sectiunii, fontul ei ramane", () => {
  const d = parseStoreDesign(buildClassicDesign(ctx), ctx);
  const hero = d.home.find((s) => s.kind === "hero")!;
  const cuFont = updateSection(d, hero.id, { settings: { ...hero.settings, fontTitluri: "cinzel", fontText: "lora" } });
  const alta = Object.keys(sectionMeta("hero")!.variants).find((v) => v !== hero.variant)!;
  const altaVarianta = updateSection(cuFont, hero.id, { variant: alta });
  const dupa = altaVarianta.home.find((s) => s.id === hero.id)!;
  assert.equal(dupa.variant, alta, "designul chiar s-a schimbat");
  assert.equal(dupa.settings.fontTitluri, "cinzel");
  assert.equal(dupa.settings.fontText, "lora");
});

/** Codul fara comentarii. */
function cod(cale: string): string {
  return readFileSync(cale, "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("vitrina: invelisul de font doar cand e ales, si IN AFARA marcajului de editor", () => {
  const r = cod("src/components/storefront/SectionRenderer.tsx");
  assert.match(r, /const font = stilFontSectiune\(section\.settings\);\s*if \(!font\) return marcata;/);
  assert.match(r, /<div className=\{\["contents", claseFonturi\(font\.chei\)\]\.join\(" "\)\} style=\{font\.style as CSSProperties\}>\s*\{marcata\}\s*<\/div>/);
  assert.match(cod("src/components/storefront/StorefrontThemeScope.tsx"), /import \{ fontSetup \} from "@\/components\/pages\/fonturi-incarcate";/);
});

test("editorul: grupul „Fonturi” in panoul sectiunii, iar Stil alege din aceeasi lista", () => {
  const p = cod("src/components/editor-magazin/PanouNod.tsx");
  assert.match(p, /\{areFonturiProprii\(sectiune\.kind\) && \(/);
  assert.match(p, /<AlegeFont label="Fontul titlurilor" gol="Ca în Stil"/);
  assert.match(p, /<AlegeFont label="Fontul textului" gol="Ca în Stil"/);
  const s = cod("src/components/editor-magazin/continut/PanouStil.tsx");
  assert.match(s, /<AlegeFont label="Font titluri" gol="Geist \(implicit\)"/);
  assert.match(s, /font_titluri: v \?\? "geist"/, "Geist se scrie anume, ca sa bata un font publicat inainte");
  assert.doesNotMatch(s, /AlegeFonturi/);
});
