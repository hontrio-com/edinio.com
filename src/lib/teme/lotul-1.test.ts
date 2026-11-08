import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { esteFontPagina } from "@/lib/pages/fonturi";
import { amestecHex, raportContrast, tokeniPeCulorileMagazinului } from "@/lib/storefront/design/css-vars";
import { cardurileVitrinei, placileMozaic, imagineaBannerului, textSetare } from "@/lib/storefront/design/hero-teme";
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
// Toate temele facute dupa reteta (2-30, loturile 1-7): Jupiter are probele lui, in `jupiter/`.
const DUPA_RETETA = TEME.map((t) => t.cheie).filter((c) => c !== "jupiter");
const poza = (cale: string) => join("public", cale);

test("cheile temelor: aceeasi ordine in gazde (proxy) si in TEME, fiecare cu magazinul ei demo", () => {
  assert.deepEqual([...CHEI_TEME], TEME.map((t) => t.cheie));
  for (const t of TEME) {
    assert.equal(MAGAZINE_DEMO.get(t.cheie), t.slugDemo);
    assert.equal(t.slugDemo, `tema-${t.cheie}`);
  }
});

test("fiecare tema dupa reteta: fonturile sunt in lista celor gazduite, toate pozele exista pe disc", () => {
  for (const cheie of DUPA_RETETA) {
    const t = temaDupaCheie(cheie)!;
    assert.ok(esteFontPagina(t.identitate.fontTitluri), `${cheie}: fontul titlurilor`);
    assert.ok(esteFontPagina(t.identitate.fontText), `${cheie}: fontul textului`);
    const poze = [
      t.siglaDemo, String(t.setariDemo.favicon_url),
      ...t.date.categorii.map((c) => c.imagine), ...t.date.produse.map((p) => p.imagine),
      ...t.date.bannere.map((b) => b.imagine), ...t.date.placi.map((p) => p.imagine), ...t.date.carduri.map((c) => c.imagine),
    ];
    // Si pozele pe care demo-ul le pune direct in banner (mozaic, vitrina, imaginea bannerului cu o singura poza).
    const hero = t.design(ctx, t.date).home.find((s) => s.kind === "hero")!.settings;
    for (const lista of [hero.placi, hero.carduri]) {
      if (Array.isArray(lista)) for (const x of lista as { imagine?: string }[]) if (x.imagine) poze.push(x.imagine);
    }
    if (typeof hero.imagine === "string" && hero.imagine) poze.push(hero.imagine);
    for (const p of poze) assert.ok(existsSync(poza(p)), `${cheie}: lipseste ${p}`);
    // Adrese relative: pozele statice nu trec prin proxy, deci se vad pe orice gazda (decizia de la Jupiter, etapa 20).
    for (const p of poze) assert.match(p, new RegExp(`^/teme/${cheie}/`), p);
  }
});

test("sigla demo nu iese mai lata de 240 px in antet (Marte iesea la 290, a observat el)", async () => {
  const { default: sharp } = await import("sharp");
  for (const cheie of DUPA_RETETA) {
    const t = temaDupaCheie(cheie)!;
    const inaltime = Number(t.setariDemo.logo_size);
    const { width, height } = await sharp(poza(t.siglaDemo)).metadata();
    // Ca `stilSigla`: inaltimea data, latimea taiata la de 5 ori inaltimea.
    const latime = Math.min(inaltime * (width! / height!), inaltime * 5);
    assert.ok(latime <= 240, `${cheie}: sigla iese la ${Math.round(latime)} px`);
  }
});

test("setul demo se tine: produsele pe categorii care exista, randurile pe produse care exista, chei unice", () => {
  for (const cheie of DUPA_RETETA) {
    const { date } = temaDupaCheie(cheie)!;
    const categorii = new Set(date.categorii.flatMap((c) => [c.nume, ...c.copii]));
    for (const p of date.produse) assert.ok(categorii.has(p.categorie), `${cheie}: ${p.cheie} -> ${p.categorie}`);
    const chei = date.produse.map((p) => p.cheie);
    assert.equal(new Set(chei).size, chei.length, `${cheie}: chei de produs dublate`);
    for (const r of date.randuri) for (const k of r.produse) assert.ok(chei.includes(k), `${cheie}: randul ${r.cheie} -> ${k}`);
    for (const p of date.produse.filter((x) => x.pretVechi !== undefined)) assert.ok(p.pretVechi! > p.pret, `${cheie}: ${p.cheie}`);
  }
});

test("meniul demo trimite doar la categorii care exista in setul demo (altfel linkul din antet cade pe o categorie goala)", () => {
  for (const cheie of DUPA_RETETA) {
    const t = temaDupaCheie(cheie)!;
    const categorii = new Set(t.date.categorii.flatMap((c) => [c.nume, ...c.copii]));
    const meniu = (t.setariDemo.menu ?? []) as { type?: string; target?: string }[];
    for (const m of meniu.filter((x) => x.type === "category")) assert.ok(categorii.has(String(m.target)), `${cheie}: meniul -> ${m.target}`);
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

test("vitrina: cardurile se citesc oricum vin; fara titlu sau fara imagine nu apar; cel mult cinci", () => {
  assert.deepEqual(cardurileVitrinei(undefined), []);
  assert.deepEqual(cardurileVitrinei({ carduri: {} }), []);
  const c = cardurileVitrinei({ carduri: [
    { titlu: " A ", imagine: "/a.webp", eticheta: " -10% " }, { titlu: "fara poza" }, { imagine: "/fara-titlu.webp" }, null,
    { titlu: "B", imagine: "/b.webp" }, { titlu: "C", imagine: "/c.webp" }, { titlu: "D", imagine: "/d.webp" }, { titlu: "E", imagine: "/e.webp" }, { titlu: "F", imagine: "/f.webp" },
  ] });
  assert.deepEqual(c.map((x) => x.titlu), ["A", "B", "C", "D", "E"]);
  assert.equal(c[0].eticheta, "-10%");
  assert.equal(c[1].eticheta, "");
});

test("vitrina si mozaicul: demo-ul intra doar cu datele demo, iar „Șterge datele demo” scoate cardurile lui", () => {
  for (const cheie of DUPA_RETETA) {
    const t = temaDupaCheie(cheie)!;
    const cuDemo = t.design(ctx, t.date);
    const hero = cuDemo.home.find((s) => s.kind === "hero")!;
    if (hero.variant !== "vitrina" && hero.variant !== "mozaic") continue;
    const lista = hero.variant === "vitrina" ? "carduri" : "placi";
    assert.ok((hero.settings[lista] as unknown[]).length > 0, `${cheie}: demo-ul umple ${lista}`);
    assert.deepEqual(t.design(ctx, null).home.find((s) => s.kind === "hero")!.settings[lista], [], `${cheie}: fara demo, gol`);
    const { design } = t.faraTexteleDemo(cuDemo, t.date);
    assert.deepEqual(design.home.find((s) => s.kind === "hero")!.settings[lista], [], `${cheie}: „Șterge datele demo”`);
  }
});

test("pe suprafata inchisa, placile cu poze iau fondul ei si fara `multiply` (pozele nu se mai sting)", () => {
  const inchis = tokeniPeCulorileMagazinului("#151515");
  assert.match(inchis["--st-fond-placa"], /var\(--st-surface\)/);
  assert.equal(inchis["--st-amestec-placa"], "normal");
  for (const f of ["src/components/storefront/product/ProductCardJupiter.tsx", "src/components/storefront/sections/catalog/CategoryNavPlaci.tsx"]) {
    const sursa = readFileSync(f, "utf8");
    assert.ok(sursa.includes("[mix-blend-mode:var(--st-amestec-placa,multiply)]"), f);
    assert.doesNotMatch(sursa, / mix-blend-multiply /, f);
  }
});

test("⚠ tokenii aplicatiei trec pe culorile magazinului doar cand designul ARE culori (niciun magazin de azi nu se schimba)", () => {
  // Magazinele fara culori in design (toate cele de azi): suprafata e `var(--color-surface)`, deci nimic.
  assert.deepEqual(tokeniPeCulorileMagazinului("var(--color-surface)"), {}, "o valoare care nu e hex nu schimba nimic");
  // Pe o tema deschisa: tokenii trec pe culorile ei (textul secundar al aplicatiei iesea la 4,43:1 pe fondul Alnilam).
  const deschis = tokeniPeCulorileMagazinului("#FFFFFF");
  assert.equal(deschis["--muted-foreground"], "var(--st-muted)");
  assert.equal(deschis["--foreground"], "var(--st-text)");
  // ...dar fara inversarea „negrului” si fara placile pentru fond inchis.
  assert.equal(deschis["--st-actiune-inchisa"], undefined);
  assert.equal(deschis["--st-fond-placa"], undefined);
  const inchis = tokeniPeCulorileMagazinului("#1A1A1A");
  assert.equal(inchis["--foreground"], "var(--st-text)");
  assert.equal(inchis["--border"], "var(--st-border)");
  assert.equal(inchis["--color-surface"], "var(--st-surface)");
  // Marte e singura tema din lot cu suprafata inchisa: doar ea inverseaza „negrul”.
  for (const cheie of LOTUL_1) {
    const s = temaDupaCheie(cheie)!.design(ctx, null).style.colors?.surface ?? "#FFFFFF";
    assert.equal("--st-actiune-inchisa" in tokeniPeCulorileMagazinului(s), cheie === "marte", cheie);
  }
});

test("⚠ fiecare tema: textul principal, cel secundar si culoarea principala se citesc pe fondurile ei (WCAG AA, 4,5:1)", () => {
  for (const cheie of DUPA_RETETA) {
    const t = temaDupaCheie(cheie)!;
    const c = t.design(ctx, null).style.colors!;
    const fond = t.identitate!.fundal;
    for (const [nume, culoare, pe] of [
      ["textul pe suprafata", c.text, c.surface], ["textul secundar pe suprafata", c.muted, c.surface],
      ["textul secundar pe fond", c.muted, fond], ["textul subsolului", c.footerText, c.footerBg],
      // Culoarea principala e si text (preturi, „In stoc”, telefonul): bejul, portocaliul si lime-ul doar pe fond inchis.
      ["principala pe fond", t.identitate!.culoare, fond],
      // ...si pe nuanta suprafetei (`--muted`, 8% text): randurile din formularul de comanda si cosul stau pe ea.
      ["principala pe nuanta", t.identitate!.culoare, amestecHex(c.text!, c.surface!, 0.08)],
    ] as const) {
      const r = raportContrast(culoare, pe);
      assert.ok(r !== null && r >= 4.5, `${cheie}: ${nume} ${culoare} pe ${pe} = ${r?.toFixed(2)}`);
    }
  }
});

test("⚠ pe suprafata inchisa: textul mostenit, tokenii cititi direct ca `var(--color-*)` si „negrul” inversat", () => {
  const inchis = tokeniPeCulorileMagazinului("#17171A");
  // „Total” din formularul de comanda nu-si pune culoare: o mosteneste de pe radacina temei.
  assert.equal(inchis.color, "var(--st-text)");
  // Fila „Descriere”, cifra cantitatii si +/- citesc `var(--color-foreground)` direct, in `style`.
  for (const v of ["--color-foreground", "--color-text-primary"]) assert.equal(inchis[v], "var(--st-text)", v);
  for (const v of ["--color-muted-foreground", "--color-text-secondary"]) assert.equal(inchis[v], "var(--st-muted)", v);
  assert.equal(inchis["--color-border"], "var(--st-border)");
  // „Comanda acum” (Detaliat) era negru pe negru pe Marte si Saturn.
  assert.equal(inchis["--st-actiune-inchisa"], "var(--st-text)");
  assert.equal(inchis["--st-actiune-inchisa-text"], "var(--st-surface)");
  const pagina = readFileSync("src/components/storefront/sections/product/ProductPageDetailed.tsx", "utf8");
  assert.ok(pagina.includes("bg-[var(--st-actiune-inchisa,#111111)]!"), "butonul negru citeste variabila, cu negrul ca rezerva");
  assert.doesNotMatch(pagina, /backgroundColor: NEGRU/, "nicio actiune nu mai poarta negrul fix");
  // Pagina de produs nu mai creste cu containerul temei (panoul de 700-800 px pe temele late).
  assert.ok(pagina.includes("max-w-[min(var(--st-container,72rem),76rem)]"));
  assert.doesNotMatch(pagina, /minmax\(0,26rem\)/);
});

test("textul de pe culoarea magazinului se alege dupa contrast, nu alb fix (bej, portocaliu, lime)", () => {
  const fisiere = [
    "src/components/ministore/OrderModal.tsx",
    "src/components/storefront/sections/cart/CartDrawerClassic.tsx",
    "src/components/storefront/sections/cart/_shared/CartPieces.tsx",
    "src/components/storefront/cart/StickyCartTab.tsx",
    "src/components/ministore/MiniStoreRenderer.tsx",
    "src/components/storefront/sections/checkout/CheckoutForm.tsx",
  ];
  for (const f of fisiere) assert.ok(readFileSync(f, "utf8").includes("text-[var(--st-primary-contrast,#fff)]"), f);
  // Butonul de trimitere al comenzii: fara alb fix pe fundalul `color`.
  const modal = readFileSync("src/components/ministore/OrderModal.tsx", "utf8");
  assert.doesNotMatch(modal, /py-4 font-bold text-base text-white/);
});

test("magazinele demo pe productie: SQL-ul le are pe toate temele dupa reteta, cu slugul si emailul temei, si nu sterge nimic", () => {
  const sql = readFileSync("scripts/teme/magazinele-demo-teme.sql", "utf8");
  for (const cheie of DUPA_RETETA) {
    const t = temaDupaCheie(cheie)!;
    assert.match(sql, new RegExp(`\\('tema-${cheie}', '${t.magazinDemo!.nume}', `), cheie);
    assert.ok(sql.includes(`'${t.magazinDemo!.email}'`), cheie);
  }
  assert.match(sql, /elsif not exists \(select 1 from public\.businesses where id = magazin and user_id = cont\) then\s*raise exception/);
  assert.doesNotMatch(sql, /\bdelete\b|\bdrop\b|\btruncate\b/i);
});
