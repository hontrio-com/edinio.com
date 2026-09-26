import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { cuTransparenta, culoareSigura, curataCulorile } from "./culori";
import { descriereDinBlocuri, titlulPrincipal } from "./titlul-principal";
import { atributeAnimatie, ANIMATII, EFECTE_BUTON } from "./animatii";
import { embedGoogle, inaltimeaHartii, linkGoogleMaps, linkWaze } from "./harta";
import { FONTURI_PAGINA, fonturiDinBlocuri, stivaFont } from "./fonturi";
import { problemaTitlului, validatePageSlug, RESERVED_PAGE_SLUGS } from "./reserved-slugs";
import { prepareBlocksForPublic } from "./prepare-blocks";
import { blocuriSablon, SABLOANE } from "./sabloane";
import { flattenBlocks } from "./block-tree";
import type { Block } from "./blocks.types";

/*
  CE APARA PROBELE ASTEA (Pagini, 25.09.2026)

  Fiecare regula de mai jos a venit dintr-un defect sau dintr-o cerere, iar
  multe se sparg TACUT: o culoare invalida nu da eroare, doar dispare; o pagina
  fara H1 arata la fel; un font necunoscut cade pe rezerva. De aia se probeaza
  regula, nu doar ca functia exista.
*/

test("culoarea cu hex scurt primeste transparenta valida (butonul facea `#fff44`)", () => {
  assert.equal(cuTransparenta("#fff", 0.27), "#ffffff45");
  assert.equal(cuTransparenta("#07c527", 0.12), "#07c5271f");
  assert.equal(cuTransparenta("rgb(1,2,3)", 0.5), "color-mix(in srgb, rgb(1,2,3) 50%, transparent)");
});

test("in `style` trec numai formele de culoare, nu si o proprietate in plus", () => {
  assert.equal(culoareSigura("#1E3A5F"), "#1E3A5F");
  assert.equal(culoareSigura("rgba(0, 0, 0, 0.5)"), "rgba(0, 0, 0, 0.5)");
  assert.equal(culoareSigura("red"), "red");
  assert.equal(culoareSigura("red;background:url(//x.ro)"), null);
  assert.equal(culoareSigura("url(javascript:1)"), null);
  const c = curataCulorile({ bg: "red;x:y", color: "#000", bgGradient: { from: "#fff", to: "evil)" } });
  assert.equal(c.bg, null);
  assert.equal(c.color, "#000");
  assert.equal(c.bgGradient, null, "un degrade cu o culoare rea cade intreg");
});

const hero = (id: string, title = "Titlu"): Block => ({ id, type: "hero", title });
const titlu = (id: string, level: 1 | 2 | 3 = 2, text = "Sectiune"): Block => ({ id, type: "heading", text, level });

test("fara H1 ales, primul titlu vizibil devine H1 (22 din 29 de pagini n-aveau)", () => {
  assert.equal(titlulPrincipal([titlu("a"), hero("b")]), "a");
  assert.equal(titlulPrincipal([hero("a", ""), titlu("b")]), "b", "un hero fara titlu nu conteaza");
  assert.equal(titlulPrincipal([{ id: "c", type: "columns", items: [{ blocks: [titlu("n")] }] }]), "n", "si in coloane");
});

test("un H1 ales de om ramane singurul, si dintre doua alese, primul", () => {
  assert.equal(titlulPrincipal([hero("a"), titlu("b", 1)]), "b");
  assert.equal(titlulPrincipal([{ id: "c", type: "columns", items: [{ blocks: [titlu("n", 1)] }] }, hero("h")]), "n");
  assert.equal(titlulPrincipal([titlu("x", 1), titlu("y", 1)]), "x", "doua titluri cu „H1”: numai primul e H1");
});

test("descrierea de rezerva vine din primul paragraf lung, fara etichete, taiata pe cuvant", () => {
  const lung = "<p>" + "Cuvant ".repeat(40) + "</p>";
  const d = descriereDinBlocuri([{ id: "t", type: "text", html: "<p>scurt</p>" }, { id: "u", type: "text", html: lung }])!;
  assert.ok(d.length <= 156 && d.endsWith("…"), d);
  assert.ok(!d.includes("<"));
  assert.equal(descriereDinBlocuri([{ id: "t", type: "text", html: "<p>scurt</p>" }]), null);
});

test("animatia se pune doar cand e aleasa, iar intarzierea iese in trepte de 100 ms", () => {
  assert.deepEqual(atributeAnimatie(undefined).attrs, {});
  assert.deepEqual(atributeAnimatie({ anim: "none" }).attrs, {});
  assert.deepEqual(atributeAnimatie({ anim: "fade-up", animDelay: 260, animSpeed: "slow" }).attrs,
    { "data-anim": "fade-up", "data-anim-speed": "slow", "data-anim-delay": "300" });
  assert.deepEqual(atributeAnimatie({ anim: "x" as never }).attrs, {}, "o cheie necunoscuta nu ajunge in pagina");
});

test("fiecare animatie si fiecare efect nou are regula lui in CSS (altfel alegerea nu face nimic)", () => {
  const css = readFileSync(new URL("../../app/stil-comun.css", import.meta.url), "utf8");
  for (const a of ANIMATII) {
    if (a.cheie === "none") continue;
    assert.ok(css.includes(`[data-anim="${a.cheie}"][data-anim-in]`), `lipseste animatia ${a.cheie}`);
  }
  for (const e of EFECTE_BUTON) {
    if (e.cheie === "none") continue;
    assert.ok(new RegExp(`\\.fx-${e.cheie}[\\s:{,]`).test(css), `lipseste efectul ${e.cheie}`);
  }
  for (let d = 100; d <= 1500; d += 100) assert.ok(css.includes(`[data-anim-delay="${d}"]`), `lipseste treapta ${d}`);
});

test("harta: zoom trimis doar cand e ales, satelit, Waze si Google spre adresa sau coordonatele scrise", () => {
  assert.equal(embedGoogle({ id: "m", type: "map", query: "Str. X 1, Iasi" }), "https://www.google.com/maps?q=Str.+X+1%2C+Iasi&output=embed&hl=ro");
  assert.match(embedGoogle({ id: "m", type: "map", query: "Iasi", zoom: 25, mapType: "satellite" })!, /&z=20&t=k$/);
  assert.equal(linkWaze({ id: "m", type: "map", query: "47.1, 27.6" }), "https://waze.com/ul?ll=47.1,27.6&navigate=yes");
  assert.equal(linkWaze({ id: "m", type: "map", query: "Iasi" }), "https://waze.com/ul?q=Iasi&navigate=yes");
  assert.equal(linkGoogleMaps({ id: "m", type: "map", query: "Iasi" }), "https://www.google.com/maps/dir/?api=1&destination=Iasi");
  assert.equal(linkWaze({ id: "m", type: "map", query: " " }), null);
});

test("inaltimea hartii nu mai accepta 0 sau NaN", () => {
  assert.equal(inaltimeaHartii({ id: "m", type: "map", height: 0 }), 160);
  assert.equal(inaltimeaHartii({ id: "m", type: "map", height: Number.NaN }), 320);
  assert.equal(inaltimeaHartii({ id: "m", type: "map", height: 5000 }), 900);
});

test("fontul se alege pe bloc: pagina incarca exact fonturile blocurilor ei, fara cele necunoscute", () => {
  const chei = FONTURI_PAGINA.map((f) => f.cheie);
  assert.equal(new Set(chei).size, chei.length);
  const blocuri = flattenBlocks([
    { id: "t", type: "text", font: "lora" },
    { id: "b", type: "button", font: "lora" },
    { id: "c", type: "columns", items: [{ blocks: [{ id: "f", type: "faq", questionFont: "bebas", answerFont: "comic" as never }] }] },
    { id: "h", type: "hero", titleFont: "cinzel", subtitleFont: "jost" },
  ]);
  assert.deepEqual(fonturiDinBlocuri(blocuri).sort(), ["bebas", "cinzel", "jost", "lora"]);
  assert.match(stivaFont("inter"), /^var\(--st-font-inter\)/, "fonturile magazinului isi pastreaza variabila");
  assert.match(stivaFont("lora"), /^var\(--pf-lora\), Georgia/);
});

test("fiecare font din lista e chiar declarat in fisierul de incarcare", () => {
  const src = readFileSync(new URL("../../components/pages/fonturi-incarcate.ts", import.meta.url), "utf8");
  const magazin = new Set(["inter", "manrope", "jakarta", "dmsans", "sora", "playfair", "instrument"]);
  for (const f of FONTURI_PAGINA) {
    if (magazin.has(f.cheie)) continue;
    assert.ok(src.includes(`variable: "--pf-${f.cheie}"`), `fontul ${f.cheie} nu e declarat`);
  }
});

test("numele paginilor de sistem nu se pot lua, nici ca titlu, nici ca link", () => {
  for (const t of ["Acasă", "COȘ", "Finalizare comandă", "Contul meu", "Magazin", "Checkout"]) {
    assert.ok(problemaTitlului(t), `„${t}” a trecut`);
  }
  for (const t of ["Contact", "Despre noi", "Produse", "Magazinul nostru"]) {
    assert.equal(problemaTitlului(t), null, `„${t}” e un nume bun de pagina`);
  }
  assert.equal(validatePageSlug("acasa").ok, false);
  assert.equal(validatePageSlug("finalizare-comanda").ok, false);
});

test("curatarea de pe server: fundal numai https, fonturi numai cunoscute, culori pe lista alba, si in coloane", () => {
  const brut: Block[] = [
    { id: "h", type: "heading", text: "x", font: "comic" as never, color: "red;x:y", style: { bgImage: "javascript:alert(1)", bg: "#fff" } },
    { id: "c", type: "columns", items: [{ blocks: [{ id: "i", type: "hero", title: "t", titleFont: "lora", bgImage: "data:text/html,1", style: { bg: "url(x)" } }] }] },
    { id: "m", type: "faq", accent: "blue", cardBg: "expression(1)" },
  ];
  const [h, c, m] = prepareBlocksForPublic(brut);
  assert.equal(h.type === "heading" && h.font, null);
  assert.equal(h.type === "heading" && h.color, null);
  assert.equal(h.style?.bgImage, null);
  assert.equal(h.style?.bg, "#fff");
  const imbricat = c.type === "columns" ? c.items![0].blocks![0] : null;
  assert.equal(imbricat?.type === "hero" && imbricat.titleFont, "lora");
  assert.equal(imbricat?.type === "hero" && imbricat.bgImage, null);
  assert.equal(imbricat?.style?.bg, null);
  assert.equal(m.type === "faq" && m.accent, "blue");
  assert.equal(m.type === "faq" && m.cardBg, null);
});

test("sabloanele: id-uri unice pe toata pagina, niciun link catre o pagina care poate lipsi", () => {
  for (const s of SABLOANE) {
    const toate = flattenBlocks(blocuriSablon(s, "Titlu"));
    const ids = toate.map((b) => b.id);
    assert.equal(new Set(ids).size, ids.length, `id-uri repetate in sablonul ${s}`);
    for (const b of toate) {
      const href = b.type === "button" ? b.href : b.type === "hero" ? b.buttonHref : undefined;
      if (href) assert.ok(href === "/" || href.startsWith("http"), `sablonul ${s} trimite la ${href}`);
    }
  }
  assert.equal(blocuriSablon("goala", "x").length, 0);
});

test("ascunderea pe dispozitiv NU foloseste clase Tailwind de ecran (in editor ar fi ascuns blocul de tot)", () => {
  const shell = readFileSync(new URL("../../components/pages/BlockShell.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(shell, /mobile: "hidden md:block"/);
  const css = readFileSync(new URL("../../app/stil-comun.css", import.meta.url), "utf8");
  assert.match(css, /\[data-editor-device\] \.pg-ascuns-mobil,\s*\[data-editor-device\] \.pg-ascuns-desktop \{ display: block !important; \}/);
  assert.match(css, /@media \(max-width: 767\.98px\) \{ \.pg-ascuns-mobil \{ display: none !important; \} \}/);
});

test("fontul de pe orice bloc trece prin lista alba la randare", () => {
  const [t, f] = prepareBlocksForPublic([
    { id: "t", type: "text", font: "comic" as never },
    { id: "f", type: "faq", questionFont: "lora", answerFont: "x" as never },
  ]);
  assert.equal(t.type === "text" && t.font, null);
  assert.equal(f.type === "faq" && f.questionFont, "lora");
  assert.equal(f.type === "faq" && f.answerFont, null);
});

test("nicio rezervare noua nu se termina in -copie (duplicarea ar cadea pe ea)", () => {
  for (const s of RESERVED_PAGE_SLUGS) assert.ok(!s.endsWith("-copie"));
});
