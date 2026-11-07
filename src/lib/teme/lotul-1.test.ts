import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { esteFontPagina } from "@/lib/pages/fonturi";
import { tokeniPeSuprafataInchisa } from "@/lib/storefront/design/css-vars";
import { placileMozaic, imagineaBannerului, textSetare } from "@/lib/storefront/design/hero-teme";
import { variantMeta } from "@/lib/storefront/design/registry";
import type { DesignContext } from "@/lib/storefront/design/types";
import { CHEI_TEME, MAGAZINE_DEMO } from "./gazde-demo";
import { TEME, temaDupaCheie } from "./teme";

/*
 * Etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 1 al temelor 2-30: Mercur, Venus, Terra, Marte. Cererea lui (08.11):
 * „restul temelor fa dupa modelele astea”, „Toate 29, separat”, datele demo generate cu ElevenLabs.
 */

const ctx: DesignContext = { primaryColor: "#07c527", pageContent: {}, features: {} };
const LOTUL_1 = ["mercur", "venus", "terra", "marte"] as const;
const poza = (cale: string) => join("public", cale);

test("cheile temelor: aceeasi ordine in gazde (proxy) si in TEME, fiecare cu magazinul ei demo", () => {
  assert.deepEqual([...CHEI_TEME], TEME.map((t) => t.cheie));
  for (const t of TEME) {
    assert.equal(MAGAZINE_DEMO.get(t.cheie), t.slugDemo);
    assert.equal(t.slugDemo, `tema-${t.cheie}`);
  }
});

test("fiecare tema din lot: fonturile sunt in lista celor gazduite, toate pozele exista pe disc", () => {
  for (const cheie of LOTUL_1) {
    const t = temaDupaCheie(cheie)!;
    assert.ok(esteFontPagina(t.identitate.fontTitluri), `${cheie}: fontul titlurilor`);
    assert.ok(esteFontPagina(t.identitate.fontText), `${cheie}: fontul textului`);
    const poze = [
      t.siglaDemo, String(t.setariDemo.favicon_url),
      ...t.date.categorii.map((c) => c.imagine), ...t.date.produse.map((p) => p.imagine),
      ...t.date.bannere.map((b) => b.imagine), ...t.date.placi.map((p) => p.imagine), ...t.date.carduri.map((c) => c.imagine),
    ];
    for (const p of poze) assert.ok(existsSync(poza(p)), `${cheie}: lipseste ${p}`);
    // Adrese relative: pozele statice nu trec prin proxy, deci se vad pe orice gazda (decizia de la Jupiter, etapa 20).
    for (const p of poze) assert.match(p, new RegExp(`^/teme/${cheie}/`), p);
  }
});

test("setul demo se tine: produsele pe categorii care exista, randurile pe produse care exista, chei unice", () => {
  for (const cheie of LOTUL_1) {
    const { date } = temaDupaCheie(cheie)!;
    const categorii = new Set(date.categorii.flatMap((c) => [c.nume, ...c.copii]));
    for (const p of date.produse) assert.ok(categorii.has(p.categorie), `${cheie}: ${p.cheie} -> ${p.categorie}`);
    const chei = date.produse.map((p) => p.cheie);
    assert.equal(new Set(chei).size, chei.length, `${cheie}: chei de produs dublate`);
    for (const r of date.randuri) for (const k of r.produse) assert.ok(chei.includes(k), `${cheie}: randul ${r.cheie} -> ${k}`);
    for (const p of date.produse.filter((x) => x.pretVechi !== undefined)) assert.ok(p.pretVechi! > p.pret, `${cheie}: ${p.cheie}`);
  }
});

test("designul fiecarei teme: variantele alese exista in registry, iar magazinul primeste ce a cerut reteta", () => {
  const asteptat: Record<string, { antet: string; banner: string; card: string; subsol: string }> = {
    mercur: { antet: "hipermarket", banner: "impartit", card: "jupiter", subsol: "hipermarket" },
    venus: { antet: "hipermarket", banner: "carduri", card: "jupiter", subsol: "columns" },
    terra: { antet: "hipermarket", banner: "mozaic", card: "minimal", subsol: "columns" },
    marte: { antet: "centered", banner: "panoramic", card: "minimal", subsol: "dark" },
  };
  for (const cheie of LOTUL_1) {
    const t = temaDupaCheie(cheie)!;
    const d = t.design(ctx, t.date);
    const a = asteptat[cheie];
    assert.equal(d.chrome.header.variant, a.antet, cheie);
    assert.equal(d.chrome.footer.variant, a.subsol, cheie);
    assert.equal(d.commerce.productCard.variant, a.card, cheie);
    const hero = d.home.find((s) => s.kind === "hero")!;
    assert.equal(hero.variant, a.banner, cheie);
    assert.ok(variantMeta("hero", hero.variant), cheie);
    // ⚠ Identitatea temei NU sta in design (ar fi castigat peste „Stil”, etapa 17.1).
    assert.equal(d.style.colors?.primary, undefined, cheie);
    assert.equal(d.style.fontHeading, undefined, cheie);
    assert.equal(d.home.find((s) => s.kind === "about")?.enabled ?? false, false, `${cheie}: „Despre noi” stins`);
  }
});

test("bannerul: textele demo intra doar cu datele demo si doar unde el n-are nimic; „Șterge datele demo” le scoate", () => {
  for (const cheie of ["mercur", "terra", "marte"] as const) {
    const t = temaDupaCheie(cheie)!;
    const cuDemo = t.design(ctx, t.date);
    const faraDemo = t.design(ctx, null);
    const heroDemo = cuDemo.home.find((s) => s.kind === "hero")!;
    const heroGol = faraDemo.home.find((s) => s.kind === "hero")!;
    const continut = (s: Record<string, unknown>) => textSetare(s.titlu) || (Array.isArray(s.placi) && s.placi.length > 0);
    assert.ok(continut(heroDemo.settings), `${cheie}: cu datele demo, bannerul are continut`);
    assert.ok(!continut(heroGol.settings), `${cheie}: fara ele, bannerul porneste gol (comerciantul isi pune textele)`);
    const { design, schimbat } = t.faraTexteleDemo(cuDemo, t.date);
    assert.ok(schimbat, cheie);
    assert.ok(!continut(design.home.find((s) => s.kind === "hero")!.settings), `${cheie}: textele demo ies`);
  }
  // Al LUI ramane: un titlu scris de el nu se inlocuieste cu cel demo.
  const mercur = temaDupaCheie("mercur")!;
  const baza = mercur.design(ctx, null);
  const aLui = { ...baza, home: baza.home.map((s) => (s.kind === "hero" ? { ...s, settings: { ...s.settings, titlu: "Al meu" } } : s)) };
  assert.equal(mercur.design(ctx, mercur.date, aLui).home.find((s) => s.kind === "hero")!.settings.titlu, "Al meu");
});

test("mozaicul: placile se citesc oricum vin; fara titlu nu apar; fondul implicit dupa loc; cel mult patru", () => {
  assert.deepEqual(placileMozaic(undefined), []);
  assert.deepEqual(placileMozaic({ placi: "nu" }), []);
  const p = placileMozaic({ placi: [{ titlu: " A " }, { titlu: "" }, null, { titlu: "B", fond: "principala" }, { titlu: "C", fond: "violet" }, { titlu: "D" }, { titlu: "E" }] });
  assert.deepEqual(p.map((x) => x.titlu), ["A", "B", "C", "D"]);
  assert.deepEqual(p.map((x) => x.fond), ["inchis", "principala", "deschis", "deschis"]);
  assert.equal(imagineaBannerului({ imagine: " /x.webp " }, ["/b.webp"]), "/x.webp");
  assert.equal(imagineaBannerului({}, ["/b.webp"]), "/b.webp");
  assert.equal(imagineaBannerului({}, []), null);
});

test("⚠ tokenii aplicatiei trec pe culorile magazinului DOAR pe o suprafata inchisa (niciun magazin de azi nu se schimba)", () => {
  assert.deepEqual(tokeniPeSuprafataInchisa("#FFFFFF"), {});
  assert.deepEqual(tokeniPeSuprafataInchisa("#F5F6F8"), {});
  assert.deepEqual(tokeniPeSuprafataInchisa("var(--x)"), {}, "o valoare care nu e hex nu schimba nimic");
  const inchis = tokeniPeSuprafataInchisa("#1A1A1A");
  assert.equal(inchis["--foreground"], "var(--st-text)");
  assert.equal(inchis["--border"], "var(--st-border)");
  assert.equal(inchis["--color-surface"], "var(--st-surface)");
  // Marte e singura tema din lot cu suprafata inchisa.
  for (const cheie of LOTUL_1) {
    const s = temaDupaCheie(cheie)!.design(ctx, null).style.colors?.surface ?? "#FFFFFF";
    assert.equal(Object.keys(tokeniPeSuprafataInchisa(s)).length > 0, cheie === "marte", cheie);
  }
});

test("magazinele demo pe productie: SQL-ul le are pe toate din lot, cu slugul si emailul temei, si nu sterge nimic", () => {
  const sql = readFileSync("scripts/teme/magazinele-demo-teme.sql", "utf8");
  for (const cheie of LOTUL_1) {
    const t = temaDupaCheie(cheie)!;
    assert.match(sql, new RegExp(`\\('tema-${cheie}', '${t.magazinDemo!.nume}', `), cheie);
    assert.ok(sql.includes(`'${t.magazinDemo!.email}'`), cheie);
  }
  assert.match(sql, /elsif not exists \(select 1 from public\.businesses where id = magazin and user_id = cont\) then\s*raise exception/);
  assert.doesNotMatch(sql, /\bdelete\b|\bdrop\b|\btruncate\b/i);
});
