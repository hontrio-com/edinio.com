import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { BANNERE_INCADRATE } from "@/lib/teme/incadrare-bannere";
import { VARIANTE_MARI } from "@/lib/teme/variante-imagini";
import { DEMO_BANNERE_FARA_TEXT, DEMO_BANNERS } from "./demo-content";
import { BUTON_BANNERE_IMPLICIT, INALTIME_MAX_BANNERE_ECRAN, LATIMI_BANNERE, textulBannerelor } from "./hero-text";
import { parseStoreDesign } from "./parse";
import { SECTION_REGISTRY, variantMeta } from "./registry";
import { jsonCanonic } from "./continut-ciorna";
import type { DesignContext } from "./types";

/*
 * „Bannere cu text și buton peste” (20.11.2026): caruselul de bannere cu un titlu, un text si un buton peste el.
 *
 * Trei lucruri se tin aici:
 *   1. citirea reglajelor nu cade si nu lasa sa treaca valori din afara listelor (reglajele vin din JSON-ul designului);
 *   2. designul nou chiar e legat de o componenta, altfel magazinul care il alege ramane fara banner, fara nicio eroare;
 *   3. stratul cu text nu fura clicurile bannerului: doar butonul din el se poate apasa.
 *
 * Proiectul n-are jsdom, deci componentele se citesc ca text, ca in restul probelor de vitrina.
 */

const cod = (cale: string) => readFileSync(cale, "utf8").replace(/\r\n/g, "\n");
const MAGAZIN = { nume: "Atelierul Anei", slogan: "Lucrate de mana" };

test("lasate goale, titlul e numele magazinului, textul e sloganul, butonul duce la produse", () => {
  const t = textulBannerelor({}, MAGAZIN);
  assert.deepEqual(t, {
    titlu: "Atelierul Anei", text: "Lucrate de mana", buton: BUTON_BANNERE_IMPLICIT, link: "",
    aliniere: "stanga", culoare: "deschis", estompare: true, cursiv: false, peToate: false, latime: "pagina",
  });
  // Nici fara reglaje deloc, nici fara slogan nu cade.
  assert.equal(textulBannerelor(undefined, { nume: "X", slogan: null }).text, "");
  assert.equal(textulBannerelor({ titlu: "   " }, MAGAZIN).titlu, "Atelierul Anei", "un titlu doar din spatii e tot gol");
});

test("reglajele scrise se citesc intocmai, cu spatiile de la capete taiate", () => {
  const t = textulBannerelor(
    { titlu: "  Colectia de toamna ", text: " Piese noi. ", buton: " Vezi ", link: "/magazin", aliniere: "dreapta", culoare: "principala", estompare: false, cursiv: true, peToate: true, latime: "ecran" },
    MAGAZIN,
  );
  assert.deepEqual(t, {
    titlu: "Colectia de toamna", text: "Piese noi.", buton: "Vezi", link: "/magazin",
    aliniere: "dreapta", culoare: "principala", estompare: false, cursiv: true, peToate: true, latime: "ecran",
  });
});

test("⚠ valorile din afara listelor cad pe implicit, nu ajung in clase sau in stil", () => {
  const t = textulBannerelor({ aliniere: "sus", culoare: "red; background:url(x)", estompare: "nu", cursiv: "da", peToate: 1, titlu: 7, link: { a: 1 }, latime: "100vw" }, MAGAZIN);
  assert.equal(t.aliniere, "stanga");
  assert.equal(t.culoare, "deschis");
  // O latime necunoscuta (sau `true`, sau un numar) ramane asezarea de pana acum, in coloana paginii.
  assert.equal(t.latime, "pagina");
  for (const v of [true, 1, "Ecran", "ecran ", null, { a: 1 }]) assert.equal(textulBannerelor({ latime: v }, MAGAZIN).latime, "pagina", `latimea ${JSON.stringify(v)} nu e „ecran”`);
  // Comutatoarele: doar `false` stinge estomparea, doar `true` aprinde celelalte doua.
  assert.equal(t.estompare, true);
  assert.equal(t.cursiv, false);
  assert.equal(t.peToate, false);
  assert.equal(t.titlu, "Atelierul Anei");
  assert.equal(t.link, "");
});

test("registrul: designul cere un banner, da H1-ul paginii si are o valoare implicita pentru fiecare camp", () => {
  const v = variantMeta("hero", "carusel_text");
  assert.ok(v, "designul `carusel_text` lipseste din registru");
  assert.equal(v.providesH1, true);
  assert.deepEqual(v.requires, { minBanners: 1 });
  const chei = v.fields.map((f) => f.key);
  assert.deepEqual(Object.keys(v.defaults ?? {}).sort(), [...chei].sort(), "fiecare camp are implicit, altfel comutatorul apare stins in editor si aprins in magazin");
  for (const f of v.fields) {
    if (f.type !== "select") continue;
    assert.ok(f.options.some((o) => o.value === v.defaults![f.key]), `implicitul lui „${f.label}” nu e printre optiunile lui`);
  }
  // Implicitele din registru si cele din citire spun acelasi lucru: altfel panoul ar arata una, iar magazinul alta.
  const citit = textulBannerelor(v.defaults, MAGAZIN);
  assert.equal(citit.aliniere, v.defaults!.aliniere);
  assert.equal(citit.culoare, v.defaults!.culoare);
  assert.equal(citit.estompare, v.defaults!.estompare);
  assert.equal(citit.cursiv, v.defaults!.cursiv);
  assert.equal(citit.peToate, v.defaults!.peToate);
  assert.equal(citit.latime, v.defaults!.latime);
  // Implicit, bannerele raman in coloana paginii: un magazin care n-a atins reglajul arata ca pana acum.
  assert.equal(v.defaults!.latime, "pagina");
  const latime = v.fields.find((f) => f.key === "latime");
  assert.ok(latime && latime.type === "select", "reglajul „Lățimea bannerelor” lipseste din registru");
  // Optiunile din editor sunt exact valorile pe care le stie citirea.
  assert.deepEqual(latime.options.map((o) => o.value), [...LATIMI_BANNERE]);
  // Procentul spus in ajutorul campului e cel aplicat de componenta.
  assert.ok(latime.help?.includes(`cel mult ${INALTIME_MAX_BANNERE_ECRAN}% din înălțimea`), "ajutorul reglajului nu mai spune procentul aplicat");
  // „Doar imagini” ramane primul: e refugiul parserului cand designul salvat nu se recunoaste.
  assert.equal(Object.keys(SECTION_REGISTRY.hero!.variants)[0], "banners");
});

test("parserul curata reglajele ostile si ramane stabil la a doua citire", () => {
  const ctx: DesignContext = {
    primaryColor: "#6C2938",
    pageContent: { hero_banners: ["https://exemplu.test/a.webp", "https://exemplu.test/b.webp"] },
    features: {},
  };
  const baza = parseStoreDesign({}, ctx);
  const erou = baza.home.find((s) => s.kind === "hero")!;
  const brut = structuredClone(baza);
  brut.home = brut.home.map((s) => (s.id === erou.id
    ? {
      ...s, variant: "carusel_text", variantOverride: "carusel_text",
      settings: { titlu: "T".repeat(200), text: "x".repeat(900), buton: "B".repeat(90), link: "javascript:alert(1)", aliniere: "sus", culoare: "principala", estompare: "da", cursiv: true, peToate: false, altceva: "x" },
    }
    : s));

  const curat = parseStoreDesign(brut, ctx);
  const s = curat.home.find((x) => x.kind === "hero")!;
  assert.equal(s.variant, "carusel_text");
  /*
   * ⚠ Lungimea PASTRATA de parser e chiar cea DECLARATA in registru. Cheile sunt comune cu alte designuri de banner,
   * iar parserul aplica limita ultimului declarat: cu 70 scris aici si 50 aplicat, campul din editor primea 70 de
   * caractere si salvarea pastra 50, fara niciun cuvant.
   */
  const camp = (cheie: string) => variantMeta("hero", "carusel_text")!.fields.find((f) => f.key === cheie) as { maxLength?: number };
  assert.equal((s.settings.titlu as string).length, camp("titlu").maxLength, "titlul: lungimea pastrata de parser nu e cea declarata in registru");
  assert.equal((s.settings.text as string).length, camp("text").maxLength, "textul: lungimea pastrata de parser nu e cea declarata in registru");
  assert.equal((s.settings.buton as string).length, camp("buton").maxLength, "butonul: lungimea pastrata de parser nu e cea declarata in registru");
  assert.equal(s.settings.culoare, "principala");
  assert.equal(s.settings.cursiv, true);
  assert.ok(!("aliniere" in s.settings) || s.settings.aliniere === "stanga", "o aliniere necunoscuta nu se pastreaza");
  assert.ok(!String(s.settings.link ?? "").toLowerCase().includes("javascript"), "un link `javascript:` nu trece");
  assert.ok(!("altceva" in s.settings), "un camp necunoscut nu se pastreaza");
  assert.notEqual(s.settings.estompare, "da", "un comutator scris ca text nu se pastreaza");

  const aDoua = parseStoreDesign(JSON.parse(JSON.stringify(curat)), ctx);
  assert.equal(jsonCanonic(aDoua), jsonCanonic(curat), "a doua parsare schimba designul: garda ciornei n-ar mai lasa nimic salvat");
});

test("parserul pastreaza „Cât ecranul” si arunca o latime necunoscuta", () => {
  const ctx: DesignContext = { primaryColor: "#6C2938", pageContent: { hero_banners: ["https://exemplu.test/a.webp"] }, features: {} };
  const baza = parseStoreDesign({}, ctx);
  const cu = (latime: unknown) => {
    const brut = structuredClone(baza);
    brut.home = brut.home.map((s) => (s.kind === "hero" ? { ...s, variant: "carusel_text", variantOverride: "carusel_text", settings: { titlu: "T", latime } } : s));
    return parseStoreDesign(brut, ctx).home.find((s) => s.kind === "hero")!.settings;
  };
  assert.equal(cu("ecran").latime, "ecran");
  assert.equal(cu("pagina").latime, "pagina");
  for (const ostila of ["100vw", "ecran; position:fixed", true, 1920, { a: 1 }]) {
    assert.notEqual(cu(ostila).latime, ostila, `parserul a pastrat latimea ${JSON.stringify(ostila)}`);
    // Ce ramane dupa curatare se citeste ca asezarea de pana acum.
    assert.equal(textulBannerelor(cu(ostila), MAGAZIN).latime, "pagina");
  }
});

/** Clasele unei liste, fara cele cu prag de ecran (`md:…`, `lg:…`): ce se aplica pe telefon. */
const peTelefon = (clase: string) => clase.split(/\s+/).filter((c) => c && !/^(?:sm|md|lg|xl|2xl):/.test(c)).sort();

test("⚠ „Cât ecranul”: pe telefon nimic nu se schimba; pe calculator fara coloana, fara colturi, cu inaltimea plafonata", () => {
  const s = cod("src/components/storefront/sections/hero/HeroCaruselText.tsx");
  const cadru = s.slice(s.indexOf("const CADRU"), s.indexOf("};", s.indexOf("const CADRU")));
  const camp = (asezare: "pagina" | "ecran", cheie: string): string => {
    const bucata = cadru.slice(cadru.indexOf(`${asezare}: {`));
    const m = bucata.match(new RegExp(`${cheie}: "([^"]*)"`));
    assert.ok(m, `nu gasesc \`${cheie}\` la asezarea „${asezare}”`);
    return m[1];
  };
  const carusel = cod("src/components/storefront/sections/hero/HeroBanners.tsx");
  const implicit = (nume: string): string => {
    const m = carusel.match(new RegExp(`${nume} = "([^"]*)"`));
    assert.ok(m, `nu gasesc implicitul \`${nume}\` al caruselului`);
    return m[1];
  };

  /*
   * „Cât pagina” e asezarea de pana acum, la litera: sectiunea si coloana lui „Doar imagini”, iar caruselul cu implicitele
   * lui (asezarea nu-i trimite nimic). Un magazin care n-a atins reglajul primeste exact marcajul de dinainte.
   */
  const doarImagini = carusel.slice(carusel.indexOf("export function BannerCarousel"), carusel.indexOf("export function BannerSlider"));
  assert.ok(doarImagini.includes(`<section className="${camp("pagina", "sectiune")}">`), "sectiunea asezarii „pagina” nu mai e cea de la „Doar imagini”");
  assert.ok(doarImagini.includes(`<div className="${camp("pagina", "coloana")}">`), "coloana asezarii „pagina” nu mai e cea de la „Doar imagini”");
  assert.match(cadru, /pagina: \{[^}]*carusel: \{\} \}/, "asezarea „pagina” nu are voie sa trimita nimic caruselului");

  // Pe telefon (clasele fara prag de ecran) cele doua asezari sunt aceleasi: acolo bannerele ocupau deja tot ecranul.
  assert.deepEqual(peTelefon(camp("ecran", "sectiune")), peTelefon(camp("pagina", "sectiune")));
  assert.deepEqual(peTelefon(camp("ecran", "coloana")), peTelefon(camp("pagina", "coloana")));
  assert.deepEqual(peTelefon(camp("ecran", "wrapperClass")), peTelefon(implicit("wrapperClass")));
  assert.deepEqual(peTelefon(camp("ecran", "slideClass")), peTelefon(implicit("slideClass")));
  assert.deepEqual(peTelefon(camp("ecran", "clasaPauza")), peTelefon(implicit("clasaPauza")));
  // Pauza: pe calculator trece in stanga (in dreapta jos stau butoanele plutitoare de contact); restul claselor, aceleasi.
  const pauzaInPlus = camp("ecran", "clasaPauza").split(/\s+/).filter((c) => !implicit("clasaPauza").split(/\s+/).includes(c));
  assert.deepEqual(pauzaInPlus, ["md:right-auto", "md:left-3"]);

  // Pe calculator: fara spatiul de deasupra, fara coloana si marginile ei, fara colturi rotunjite.
  const ecran = [camp("ecran", "sectiune"), camp("ecran", "coloana"), camp("ecran", "wrapperClass"), camp("ecran", "slideClass")].join(" ").split(/\s+/);
  for (const oprita of ["md:pt-6", "md:max-w-6xl", "md:px-4", "md:rounded-2xl"]) {
    assert.ok(!ecran.includes(oprita), `asezarea „ecran” inca poarta \`${oprita}\`: bannerul n-ar ajunge la marginile ferestrei`);
  }
  // Singura clasa in plus e plafonul de inaltime, de la `md` in sus, cu procentul din `hero-text.ts`.
  const inPlus = camp("ecran", "slideClass").split(/\s+/).filter((c) => !implicit("slideClass").split(/\s+/).includes(c));
  assert.deepEqual(inPlus, [`md:max-h-[${INALTIME_MAX_BANNERE_ECRAN}vh]`]);

  // Componenta chiar alege asezarea dupa reglaj si o da caruselului.
  const componenta = s.slice(s.indexOf("export function HeroCaruselText"), s.indexOf("const CADRU"));
  assert.match(componenta, /const cadru = CADRU\[t\.latime\];/);
  assert.match(componenta, /<section className=\{cadru\.sectiune\}>\s*<div className=\{cadru\.coloana\}>/);
  assert.match(componenta, /\{\.\.\.cadru\.carusel\}/);
});

test("„Cât ecranul”: textul se aliniaza cu coloana paginii, iar pe ferestrele inguste ramane marginea obisnuita", () => {
  const s = cod("src/components/storefront/sections/hero/HeroCaruselText.tsx");
  const coloana = s.match(/const MARGINE_COLOANA = "([^"]+)";/)?.[1];
  // Jumatate din ce ramane in afara coloanei paginii, plus cei 16 px ai ei: unde incepe continutul antetului.
  assert.equal(coloana, "calc((100cqw - var(--st-container, 72rem)) / 2 + 1rem)");
  // `max`: cand fereastra e mai ingusta decat coloana, socoteala iese negativa si ramane marginea de pana acum.
  assert.match(s, /const margini = t\.latime === "ecran" \? `max\(\$\{asezare\.margini\}, \$\{MARGINE_COLOANA\}\)` : asezare\.margini;/);
  assert.match(s, /style=\{\{ paddingInline: margini, paddingBottom: cuPuncte \? LOC_PUNCTE : undefined \}\}/);
  // Antetele isi aseaza continutul cu aceeasi variabila si cu aceeasi margine de 16 px (`px-4`).
  assert.match(cod("src/components/storefront/sections/chrome/HeaderCentered.tsx"), /className="mx-auto px-4" style=\{\{ maxWidth: "var\(--st-container\)" \}\}/);
});

test("⚠ fiecare design de banner din registru are o componenta in dispecer", () => {
  const s = cod("src/components/storefront/SectionRenderer.tsx");
  const harta = s.slice(s.indexOf("const HEROURI"), s.indexOf("};", s.indexOf("const HEROURI")));
  const variante = Object.keys(SECTION_REGISTRY.hero!.variants);
  // Martorul: lista din registru nu e goala si o are pe cea noua.
  assert.ok(variante.length >= 9 && variante.includes("carusel_text"), `variantele din registru: ${variante.join(", ")}`);
  for (const v of variante) {
    assert.match(harta, new RegExp(`(?:^|\\n)\\s*${v}: Hero[A-Za-z]+ as VariantaSectiune`), `designul de banner „${v}” n-are componenta in HEROURI: magazinul care il alege ramane fara banner`);
  }
});

test("⚠ stratul cu text nu prinde clicuri, doar butonul din el; titlul vizibil e singurul H1 al designului", () => {
  const s = cod("src/components/storefront/sections/hero/HeroCaruselText.tsx");
  const strat = s.slice(s.indexOf("function StratText"));
  const radacina = (strat.match(/return \(\s*<div className="([^"]*)">/)?.[1] ?? "").split(/\s+/);
  // Martorul: chiar radacina stratului a fost gasita (asezata peste tot bannerul).
  assert.ok(radacina.includes("absolute") && radacina.includes("inset-0"), `radacina stratului nu s-a gasit: ${radacina.join(" ")}`);
  assert.ok(radacina.includes("pointer-events-none"), "radacina stratului trebuie sa lase clicurile sa treaca spre banner");
  // Ce nu incape se taie la marginea bannerului, nu iese peste restul paginii; marimile se dau dupa banner (`cqh`, `cqw`).
  assert.ok(radacina.includes("overflow-hidden"), "stratul trebuie sa taie ce iese din banner");
  assert.ok(radacina.includes("[container-type:size]"), "stratul trebuie sa fie container: marimile textului sunt in sutimi din el");
  const buton = strat.match(/<a href=\{href\} draggable=\{false\}\s+className="([^"]*)"/)?.[1] ?? "";
  assert.match(buton, /(?:^|\s)pointer-events-auto(?:\s|$)/, "butonul din strat trebuie sa primeasca el clicul");
  // Butonul nu trece de cutia textului: eticheta lunga se scurteaza, nu iese din poza.
  assert.match(buton, /(?:^|\s)max-w-full(?:\s|$)/, "butonul trebuie plafonat la latimea cutiei");
  assert.match(strat, /<span className="truncate">\{t\.buton\}<\/span>/, "eticheta butonului trebuie sa se poata scurta");
  // Un singur H1 in strat; cel ascuns apare doar pe ramura fara bannere, unde stratul nu se randeaza.
  assert.equal((strat.match(/<h1\b/g) ?? []).length, 1);
  const componenta = s.slice(s.indexOf("export function HeroCaruselText"), s.indexOf("function StratText"));
  assert.equal((componenta.match(/<h1\b/g) ?? []).length, 1);
  assert.match(componenta, /if \(banners\.length === 0\) \{\s*return \(\s*<h1 className="sr-only">/, "H1-ul ascuns trebuie sa stea DOAR pe ramura fara bannere");
  // Textul sta fie pe primul banner, fie peste tot caruselul, niciodata in ambele locuri (ar fi doua H1-uri).
  assert.match(componenta, /pesteBanner=\{t\.peToate \? undefined : \(i\) => \(i === 0 \? strat : null\)\}/);
  assert.match(componenta, /pesteTot=\{t\.peToate \? strat : undefined\}/);
});

test("caruselul fara strat isi pastreaza marcajul: `relative` apare pe banner doar cand sta ceva peste el", () => {
  const s = cod("src/components/storefront/sections/hero/HeroBanners.tsx");
  assert.match(s, /className=\{peste \? `\$\{slot\} relative` : slot\}/);
  // Stratul fix vine dupa banda de bannere si inaintea sagetilor, deci sagetile si punctele raman deasupra lui.
  const banda = s.indexOf("{pesteTot}");
  assert.ok(banda > s.indexOf("banners.map((src, i) =>") && banda < s.indexOf('aria-label="Banner anterior"'), "`pesteTot` nu mai sta intre banda de bannere si sageti");
  // „Doar imagini” si celelalte doua designuri cu carusel nu trimit niciun strat.
  for (const fisier of ["HeroCategories.tsx", "HeroCuCarduri.tsx"]) {
    assert.doesNotMatch(cod(`src/components/storefront/sections/hero/${fisier}`), /pesteBanner|pesteTot/, `${fisier} nu trebuie sa puna text peste bannere`);
  }
  assert.doesNotMatch(s.slice(s.indexOf("export function BannerCarousel"), s.indexOf("export function BannerSlider")), /pesteBanner|pesteTot/);
});

test("⚠ legaturile din carusel nu se pot trage din pagina, altfel caruselul nu se mai trage cu mouse-ul", () => {
  /*
   * Masurat in browser pe 20.11.2026: pe un banner cu link, la primii pixeli de miscare porneste tragerea legaturii
   * (`dragstart` pe `<a>`, apoi `pointercancel`): caruselul primea 2 miscari si ramanea pe loc. Cu `draggable={false}`,
   * 21 de miscari si bannerul urmator. Era asa si la „Doar imagini”, pe orice banner cu link.
   */
  const carusel = cod("src/components/storefront/sections/hero/HeroBanners.tsx");
  const legaturi = carusel.slice(carusel.indexOf("export function BannerSlider")).match(/<a href=\{href\}[^>]*>/g) ?? [];
  assert.equal(legaturi.length, 1, "caruselul are o singura legatura pe banner; daca apare alta, trebuie si ea netrasa");
  assert.match(legaturi[0], /draggable=\{false\}/, "linkul bannerului se poate trage din pagina: caruselul nu se mai trage cu mouse-ul");
  assert.match(cod("src/components/storefront/sections/hero/HeroCaruselText.tsx"), /<a href=\{href\} draggable=\{false\}/, "butonul de peste banner se poate trage din pagina");
  // Garda de clic: tragerea terminata pe link sau pe buton nu navigheaza. Si atingerea care urmeaza unei trageri cu
  // mouse-ul (ecran tactil cu mouse) nu mosteneste „s-a tras”, altfel si-ar pierde clicul.
  assert.match(carusel, /onClick=\{\(e\) => \{ if \(drag\.current\.moved\) e\.preventDefault\(\); \}\}/);
  assert.match(carusel, /onClickCapture=\{\(e\) => \{ if \(drag\.current\.moved\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); \} \}\}/);
  assert.match(carusel, /if \(e\.pointerType !== "mouse"\) \{ drag\.current\.moved = false; return; \}/);
});

/** O marime `clamp(Apx, X, Bpx)` din componenta, socotita pentru un banner de `l` x `i` px (X: `Ncqh`, `Ncqw` sau `min` din ele). */
function marime(expresie: string, l: number, i: number): number {
  const m = expresie.match(/^clamp\(([\d.]+)px, (.+), ([\d.]+)px\)$/);
  assert.ok(m, `marime pe care proba nu o stie citi: ${expresie}`);
  const termen = (t: string) => {
    const u = t.trim().match(/^([\d.]+)(cqh|cqw)$/);
    assert.ok(u, `termen pe care proba nu-l stie citi: ${t}`);
    return (Number(u[1]) / 100) * (u[2] === "cqh" ? i : l);
  };
  const mijloc = m[2].startsWith("min(") ? Math.min(...m[2].slice(4, -1).split(",").map(termen)) : termen(m[2]);
  return Math.min(Math.max(Number(m[1]), mijloc), Number(m[3]));
}

test("⚠ textul cel mai lung incape in banner, deasupra punctelor, la orice forma de banner", () => {
  /*
   * REGULA, nu formula: oricare ar fi marimile din `MARIMI`, cazul cel mai rau (titlul pe cate randuri are voie, textul pe
   * trei, butonul) trebuie sa ramana sub inaltimea bannerului minus locul punctelor. Bannerul isi ia raportul din poza,
   * intre 4:3 si 4:1, deci inaltimea lui nu se poate ghici din latimea ecranului. Masuratoarea din browser (72 de cazuri,
   * 20.11.2026) a gasit prima forma a marimilor cu butonul sub puncte pe bannerele late; socoteala de aici o tine de acum.
   */
  const s = cod("src/components/storefront/sections/hero/HeroCaruselText.tsx");
  const marimi = s.slice(s.indexOf("const MARIMI = {"), s.indexOf("} satisfies Record<string, CSSProperties>;"));
  const una = (re: RegExp, ce: string) => { const m = marimi.match(re) ?? s.match(re); assert.ok(m, `nu gasesc ${ce} in componenta`); return m; };
  const titlu = una(/titlu: \{ fontSize: "([^"]+)" \}/, "marimea titlului")[1];
  const [, text, textSus] = una(/text: \{ fontSize: "([^"]+)", marginTop: "([^"]+)" \}/, "marimile textului");
  const butonInalt = una(/buton: \{\s*height: "([^"]+)"/, "inaltimea butonului")[1];
  const butonSus = una(/buton: \{[^}]*marginTop: "([^"]+)"/, "spatiul de deasupra butonului")[1];
  const locPuncte = Number(una(/const LOC_PUNCTE = "(\d+)px";/, "locul punctelor")[1]);

  // Pragurile de randuri si de aparitie a textului, citite din regulile `@container` de pe elemente. Titlul din STRAT:
  // componenta mai are un H1, cel ascuns de pe ramura fara bannere.
  const strat = s.slice(s.indexOf("function StratText"));
  const h1 = strat.match(/<h1 className="([^"]*)"/)?.[1] ?? "";
  const doua = h1.match(/\[@container_\(min-height:([\d.]+)px\)_and_\(max-height:([\d.]+)px\)\]:line-clamp-2/);
  const trei = h1.match(/\[@container_\(min-height:([\d.]+)px\)\]:line-clamp-3/);
  assert.ok(/(?:^|\s)line-clamp-1(?:\s|$)/.test(h1) && doua && trei, `regulile de randuri ale titlului nu mai au forma stiuta: ${h1}`);
  const [de2, pana2, de3] = [Number(doua[1]), Number(doua[2]), Number(trei[1])];
  // Pragurile nu se suprapun (ordinea regulilor in foaie n-ar mai fi totuna) si nu lasa gol intre ele.
  assert.ok(pana2 < de3 && de3 - pana2 < 0.05 && de2 < pana2, `pragurile de randuri se suprapun sau lasa gol: ${de2}, ${pana2}, ${de3}`);
  const inaltRandTitlu = Number(h1.match(/leading-\[([\d.]+)\]/)?.[1]);
  const coadaTitlu = Number(h1.match(/pb-\[([\d.]+)em\]/)?.[1]);
  const invelisText = una(/<div className="hidden \[@container_\(min-width:(\d+)px\)_and_\(min-height:(\d+)px\)\]:block">/, "regula de aparitie a textului");
  const [textDeLa, textDeLaInalt] = [Number(invelisText[1]), Number(invelisText[2])];
  const p = una(/<p className="([^"]*)"/, "clasele textului")[1];
  const inaltRandText = Number(p.match(/leading-\[([\d.]+)\]/)?.[1]);
  assert.match(p, /(?:^|\s)line-clamp-3(?:\s|$)/);
  assert.ok([inaltRandTitlu, coadaTitlu, inaltRandText].every((n) => n > 0), "inaltimile de rand nu s-au citit");

  // Locul punctelor chiar e cel al caruselului: 6 px de la margine (`bottom-1.5`) plus tinta de 24 px (`h-6`).
  const carusel = cod("src/components/storefront/sections/hero/HeroBanners.tsx");
  const josPuncte = Number(carusel.match(/"bottom-([\d.]+) gap-0"/)?.[1]) * 4;
  const inaltPunct = Number(carusel.match(/className="group\/punct flex h-(\d+) min-w-6/)?.[1]) * 4;
  assert.equal(josPuncte + inaltPunct, locPuncte, `punctele caruselului ocupa ${josPuncte + inaltPunct} px jos, iar textul le lasa ${locPuncte}`);
  // Componenta foloseste punctele (nu segmentele temei Jupiter, asezate altfel) si le lasa loc doar cand exista.
  assert.doesNotMatch(s, /paginare=/);
  assert.match(s, /paddingBottom: cuPuncte \? LOC_PUNCTE : undefined/);
  assert.match(s, /cuPuncte=\{banners\.length > 1\}/);

  let socotite = 0;
  /** Cazul cel mai rau pentru un banner de `latime` x `inaltime` px: tot ce are voie sa apara, pe cate randuri are voie. */
  const incape = (latime: number, inaltime: number, unde = "") => {
    const randuri = inaltime >= de3 ? 3 : inaltime >= de2 ? 2 : 1;
    const t = marime(titlu, latime, inaltime);
    const bucataTitlu = randuri * inaltRandTitlu * t + coadaTitlu * t;
    const cuText = latime >= textDeLa && inaltime >= textDeLaInalt;
    const bucataText = cuText ? marime(textSus, latime, inaltime) + 3 * inaltRandText * marime(text, latime, inaltime) : 0;
    const bucataButon = marime(butonSus, latime, inaltime) + marime(butonInalt, latime, inaltime);
    const total = bucataTitlu + bucataText + bucataButon;
    const loc = inaltime - locPuncte;
    assert.ok(total <= loc + 0.5, `banner ${latime}x${Math.round(inaltime)}${unde}: textul cere ${total.toFixed(1)} px si are ${loc.toFixed(1)} (titlu pe ${randuri} randuri${cuText ? ", cu text" : ""})`);
    socotite += 1;
  };
  for (const latime of [320, 360, 390, 430, 640, 736, 992, 1120]) {
    for (const raport of [4 / 3, 16 / 9, 2.4, 3.2, 4]) incape(latime, latime / raport);
  }
  assert.equal(socotite, 40);

  /*
   * „Cât ecranul” (24.11.2026): de la `md` in sus bannerul are latimea ferestrei, iar inaltimea lui e cea data de poza,
   * dar cel mult `INALTIME_MAX_BANNERE_ECRAN` la suta din inaltimea ferestrei. Deci apar bannere mult mai late decat
   * inalte (2560 x 336 intr-o fereastra scunda), pe care asezarea in coloana nu le putea da. Regula e aceeasi.
   */
  socotite = 0;
  for (const latimeFereastra of [768, 1024, 1280, 1440, 1920, 2560]) {
    for (const inaltimeFereastra of [480, 650, 800, 950, 1300]) {
      for (const raport of [4 / 3, 16 / 9, 2.4, 2.9, 4]) {
        const inaltime = Math.min(latimeFereastra / raport, (INALTIME_MAX_BANNERE_ECRAN / 100) * inaltimeFereastra);
        incape(latimeFereastra, inaltime, ` (fereastra ${latimeFereastra}x${inaltimeFereastra}, cat ecranul)`);
      }
    }
  }
  assert.equal(socotite, 150);

  // Marginile: la mijloc si in dreapta, cutia ocoleste butonul de pauza (colt dreapta jos); de la 736 px, toate ocolesc sagetile.
  const pauza = carusel.match(/clasaPauza = "absolute bottom-3 right-(\d+) z-10 w-(\d+) h-7/);
  assert.ok(pauza, "butonul de pauza al caruselului nu mai are forma stiuta");
  // Butonul chiar primeste clasele astea (implicitul nu e doar declarat).
  assert.match(carusel, /className=\{clasaPauza\}/);
  const locPauza = (Number(pauza[1]) + Number(pauza[2])) * 4;
  const sageata = carusel.match(/absolute top-1\/2 -translate-y-1\/2 z-10 w-(\d+) h-9/);
  assert.ok(sageata && /className=\{`\$\{arrow\} left-2`\}/.test(carusel) && /className=\{`\$\{arrow\} right-2`\}/.test(carusel), "sagetile caruselului nu mai au forma stiuta");
  const locSageata = 2 * 4 + Number(sageata[1]) * 4;
  const margini = Object.fromEntries([...s.matchAll(/(stanga|centru|dreapta): \{[^}]*margini: "([^"]+)" \}/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(Object.keys(margini).sort(), ["centru", "dreapta", "stanga"]);
  for (const aliniere of ["centru", "dreapta"]) {
    assert.ok(marime(margini[aliniere], 320, 180) >= locPauza, `la „${aliniere}”, marginea de pe telefon (${marime(margini[aliniere], 320, 180)} px) lasa cutia peste butonul de pauza (${locPauza} px)`);
  }
  for (const aliniere of ["stanga", "centru", "dreapta"]) {
    assert.ok(marime(margini[aliniere], 736, 414) > locSageata, `la „${aliniere}”, marginea de la 736 px (${marime(margini[aliniere], 736, 414)} px) lasa cutia peste sageata (${locSageata} px)`);
  }
  /*
   * „Cât ecranul” (24.11.2026): de la `md` in sus pauza sta in STANGA jos, la aceeasi distanta de margine, ca sa nu
   * ajunga sub butoanele plutitoare de contact din coltul din dreapta al ferestrei. Acolo, cutia aliniata la stanga
   * trebuie sa o ocoleasca de la cea mai ingusta fereastra la care se aplica (768 px), la orice inaltime de banner.
   */
  const pauzaEcran = s.match(/clasaPauza: "absolute bottom-3 right-(\d+) md:right-auto md:left-(\d+) z-10 w-(\d+) h-7/);
  assert.ok(pauzaEcran, "asezarea „ecran” nu mai muta butonul de pauza in stanga de la `md` in sus");
  assert.deepEqual([pauzaEcran[1], pauzaEcran[2], pauzaEcran[3]], [pauza[1], pauza[1], pauza[2]], "pauza mutata in stanga nu mai are distanta si marimea celei din dreapta");
  for (const inaltime of [150, 300, 432, 538]) {
    assert.ok(marime(margini.stanga, 768, inaltime) > locPauza, `cat ecranul, la 768 px, marginea din stanga (${marime(margini.stanga, 768, inaltime)} px) lasa cutia peste butonul de pauza (${locPauza} px)`);
  }
});

test("textul „închis” are o culoare fixa, nu culoarea textului din tema", () => {
  // Pe o tema cu fond inchis, `--st-text` e deschis; sub textul „închis” sta un strat alb, deci ar fi iesit alb pe alb.
  const s = cod("src/components/storefront/sections/hero/HeroCaruselText.tsx");
  const strat = s.slice(s.indexOf("function StratText"));
  assert.doesNotMatch(strat, /var\(--st-text\)/, "culoarea textului de peste banner nu se ia din tema");
  assert.match(s, /const INCHIS = "#[0-9a-f]{6}";/);
  assert.match(strat, /const culoareTitlu = alb \? "#ffffff" : t\.culoare === "principala" \? "var\(--st-primary\)" : INCHIS;/);
});

test("⚠ ghidul din centrul de ajutor numara si numeste toate designurile de banner", () => {
  /*
   * Pe 20.11.2026 ghidul spunea „șapte design-uri” si „Schimbă designul (7)”, iar galeria avea opt: designul adaugat
   * in lotul 5 al temelor nu ajunsese in el. De acum, un design nou in registru cade aici pana e scris si in ghid.
   */
  const ghiduri = cod("src/lib/website/ajutor-categorii/design-si-pagini.ts");
  const inceput = ghiduri.indexOf('slug: "cum-reglezi-sectiunea-hero"');
  assert.ok(inceput > 0, "ghidul bannerului principal nu mai are slugul stiut");
  const ghid = ghiduri.slice(inceput, ghiduri.indexOf("slug:", inceput + 10));
  const variante = Object.values(SECTION_REGISTRY.hero!.variants);
  for (const v of variante) {
    assert.ok(ghid.includes(`„${v.label}”`), `ghidul bannerului nu pomeneste designul „${v.label}”`);
  }
  assert.ok(ghid.includes(`„Schimbă designul (${variante.length})”`), `ghidul nu spune „Schimbă designul (${variante.length})”, cat arata butonul din editor`);
  const inCuvinte: Record<number, string> = { 7: "șapte", 8: "opt", 9: "nouă", 10: "zece", 11: "unsprezece", 12: "douăsprezece" };
  assert.ok(inCuvinte[variante.length], `adauga in proba numarul ${variante.length} scris in cuvinte`);
  assert.ok(ghid.includes(`are ${inCuvinte[variante.length]} design-uri`), `rezumatul ghidului nu spune „are ${inCuvinte[variante.length]} design-uri”`);
  // Lungimile spuse in ghid sunt cele din registru (cele pe care le pastreaza si parserul).
  const camp = (cheie: string) => (variantMeta("hero", "carusel_text")!.fields.find((f) => f.key === cheie) as { maxLength?: number }).maxLength;
  assert.ok(ghid.includes(`„Titlul” (maximum ${camp("titlu")} de caractere), „Textul” (maximum ${camp("text")})`), "lungimile din ghid nu mai sunt cele din registru");
  // Reglajul de latime (24.11.2026): ghidul il numeste, ii numeste cele doua valori si spune procentul aplicat.
  const latime = variantMeta("hero", "carusel_text")!.fields.find((f) => f.key === "latime") as { label: string; options: { label: string }[] };
  assert.ok(ghid.includes(`„${latime.label}”`), `ghidul nu pomeneste reglajul „${latime.label}”`);
  for (const o of latime.options) assert.ok(ghid.includes(`„${o.label}”`), `ghidul nu pomeneste valoarea „${o.label}”`);
  assert.ok(ghid.includes(`cel mult ${INALTIME_MAX_BANNERE_ECRAN}% din înălțimea`), "ghidul nu mai spune procentul aplicat bannerelor cat ecranul");
  // Designurile care cer un banner sunt cele numite la „apare stins”.
  for (const v of variante.filter((x) => x.requires?.minBanners)) {
    const stins = ghid.slice(ghid.indexOf("Dacă un design cu bannere apare stins"));
    assert.ok(stins.includes(`„${v.label}”`), `ghidul nu spune ca „${v.label}” apare stins fara bannere`);
  }
});

test("miniatura din galerie se arata pe fotografii fara text, care exista pe disc cu variantele lor", () => {
  /*
   * La prima proba, miniatura scria titlul designului peste bannerul demonstrativ, care are deja un titlu desenat in
   * poza: doua titluri unul peste altul. „Fara text” nu se poate proba din cod (s-a privit fiecare poza); se probeaza ca
   * pozele alese exista, au variantele de latime cerute de carusel si nu primesc incadrarea de telefon a bannerelor demo.
   */
  assert.ok(DEMO_BANNERE_FARA_TEXT.length >= 2, "cu un singur banner, miniatura n-ar mai arata ca designul e un carusel");
  for (const poza of DEMO_BANNERE_FARA_TEXT) {
    assert.ok(existsSync(`public${poza}`), `poza ${poza} nu exista`);
    assert.deepEqual([...(VARIANTE_MARI[poza] ?? [])], [640, 1080], `${poza} n-are variantele de latime ale pozelor de tema`);
    for (const latime of VARIANTE_MARI[poza] ?? []) {
      assert.ok(existsSync(`public${poza.replace(/\.webp$/, `.w${latime}.webp`)}`), `lipseste varianta de ${latime} px a pozei ${poza}`);
    }
    assert.ok(!BANNERE_INCADRATE.includes(poza), `${poza} are incadrare de telefon: caruselul miniaturii ar deveni 4:3`);
    assert.ok(!DEMO_BANNERS.includes(poza), `${poza} e un banner demonstrativ cu text in poza`);
  }
  const ruta = cod("src/app/(public)/preview-sectiune/[slug]/page.tsx");
  assert.match(ruta, /hero_banners: kind === "hero" && variantParam === "carusel_text" \? DEMO_BANNERE_FARA_TEXT : DEMO_BANNERS,/);
  // Inaltimea miniaturii e cea a bannerului panoramic (2,4:1 la 1120 px latime) plus marginea de sus, nu cea de 16:9.
  const inaltime = variantMeta("hero", "carusel_text")!.previewHeight!;
  assert.ok(inaltime >= 1120 / 2.4 + 24 && inaltime <= 1120 / 2.4 + 60, `miniatura are ${inaltime} px inaltime pentru un banner de ${Math.round(1120 / 2.4)} px`);
});

test("sfatul de marime a bannerelor din editor stie si de designul cu text", () => {
  const a = cod("src/components/editor-magazin/continut/ContinutAcasa.tsx");
  const sfat = a.slice(a.indexOf("function sfatMarimeBanner"), a.indexOf("export function ContinutHero"));
  assert.match(sfat, /if \(varianta === "carusel_text"\) \{\s*return "Se afișează întreg, la proporția primului banner\./, "designul cu text foloseste acelasi carusel adaptiv, deci acelasi sfat");
  assert.match(sfat, /alege poze fără text în ele/);
  // Cu bannerele cat ecranul, pozele 16:9 se taie: sfatul o spune, cu procentul aplicat.
  assert.ok(sfat.includes(`ce trece de ${INALTIME_MAX_BANNERE_ECRAN}% din înălțimea ecranului`), "sfatul de marime nu mai spune cat se pastreaza din banner la „Cât ecranul”");
});
