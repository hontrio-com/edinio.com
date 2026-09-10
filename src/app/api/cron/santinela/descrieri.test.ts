import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  continutMeta, decodeazaAtribut, descriereColectie, numarDinContor, numarDinDescriere, problemeDescriere,
} from "./descrieri";
import {
  descriereCatalog, descriereCategorie, numeScurtMagazin, type ContinutPagina,
} from "@/lib/storefront/catalog/descriere-generata";

/*
 * Ce judeca santinela pe paginile de catalog si de categorie (reclamatia caian-textile.ro,
 * 10.09.2026). Cele doua reguli ale santinelei, amandoua probate aici:
 *
 *   1. fiecare verificare POATE ESUA: pagina de azi din productie, cu descrierea paginii
 *      principale, trebuie sa cada; si fiecare verificare cade SINGURA, pe defectul ei;
 *   2. fiecare verificare POATE TRECE: pagina scrisa cum o scrie acum codul trebuie sa
 *      treaca, inclusiv cu textul propriu al comerciantului, cu `&` in nume si cu mii de
 *      produse. O alarma falsa din doua in doua ore e felul in care santinela isi pierde
 *      increderea (vezi capul lui `route.ts`).
 *
 * HTML-ul e in forma servita de productie (caian-textile.ro/magazin/prosoape, citita pe
 * 10.09.2026): `<meta name="description" content="…"/>`, `<meta name="robots"
 * content="index, follow"/>`, contorul `<p class="…">18 din 41 produse</p>`, subsolul
 * paginarii din bucati.
 */

const ACASA = "Textile hoteliere CAIAN: prosoape, lenjerii de pat și protecții saltea 100% bumbac, certificate OEKO-TEX. Livrare rapidă în România, prețuri speciale HoReCa.";
const NUME = "CAIAN TEXTILE";
const PROSOAPE = "PROSOAPE la CAIAN TEXTILE: 18 produse, de la 8,63 lei. Subcategorii: Prosoape Hotel, Prosoape SPA, Prosoape Salon & Beauty și Seturi.";
const SALON = "Prosoape Salon & Beauty (PROSOAPE) la CAIAN TEXTILE, de la 8,63 lei. Printre produse: Prosop CAIAN Greek Border Verde 70x130 cm - 500 GSM.";
const SUBTITLU = "Prosoape, lenjerii de pat si protectii saltea certificate OEKO-TEX, pentru hoteluri, pensiuni si uz casnic.";

/** Atributul scris ca de React: `&`, `"`, `'`, `<`, `>` devin entitati. */
const atribut = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface Pagina {
  /** `null` = eticheta lipseste. og, twitter si JSON-LD iau implicit tot `d`. */
  d?: string | null;
  og?: string | null;
  tw?: string | null;
  ld?: string | null;
  faraColectie?: boolean;
  /** Textul contorului; `null` = comerciantul l-a ascuns. */
  contor?: string | null;
  robots?: string;
}

function pagina(p: Pagina): { html: string; noduri: Record<string, unknown>[] } {
  const d = p.d === undefined ? PROSOAPE : p.d;
  const meta = (cheie: string, valoare: string, v: string | null) =>
    v === null ? "" : `<meta ${cheie}="${valoare}" content="${atribut(v)}"/>`;
  const html = [
    "<!DOCTYPE html><html lang=\"ro\"><head><meta charSet=\"utf-8\"/>",
    meta("name", "description", d),
    `<meta name="robots" content="${p.robots ?? "index, follow"}"/>`,
    meta("property", "og:description", p.og === undefined ? d : p.og),
    meta("name", "twitter:description", p.tw === undefined ? d : p.tw),
    "</head><body><main>",
    p.contor === null ? "" : `<p class="text-[13px] text-[var(--st-muted)]">${p.contor ?? "18 din 41 produse"}</p>`,
    "<p class=\"text-[13px] text-[var(--st-muted)]\" aria-live=\"polite\">20<!-- --> din <!-- -->41<!-- --> produse</p>",
    "</main></body></html>",
  ].join("");
  const noduri: Record<string, unknown>[] = [{ "@type": "BreadcrumbList" }];
  if (!p.faraColectie) noduri.push({ "@type": "CollectionPage", description: p.ld === undefined ? d : p.ld });
  return { html, noduri };
}

const judeca = (p: Pagina, peste: Partial<{ descriereAcasa: string | null; numeScurt: string; dinSitemap: boolean }> = {}) =>
  problemeDescriere({ ...pagina(p), descriereAcasa: ACASA, numeScurt: NUME, dinSitemap: true, ...peste });

describe("pagina de azi din productie CADE", () => {
  test("categoria cu descrierea paginii principale, exact cum a servit-o caian-textile.ro", () => {
    /* Randurile de mai jos sunt copiate din raspunsul de productie, nu construite. */
    const html = [
      `<meta name="description" content="${ACASA}"/>`,
      "<meta name=\"robots\" content=\"index, follow\"/>",
      `<meta property="og:description" content="${ACASA}"/>`,
      `<meta name="twitter:description" content="${ACASA}"/>`,
      "<p class=\"text-[13px] text-[var(--st-muted)]\">18 din 41 produse</p>",
    ].join("\n");
    const probleme = problemeDescriere({
      html,
      noduri: [{ "@type": "CollectionPage", description: ACASA }],
      descriereAcasa: ACASA,
      numeScurt: NUME,
      dinSitemap: true,
    });
    assert.deepEqual(probleme, ["poarta descrierea paginii principale"]);
  });
});

describe("pagina scrisa acum de cod TRECE", () => {
  test("categoria, cu numarul din descriere egal cu al contorului", () => {
    assert.deepEqual(judeca({ d: PROSOAPE, contor: "18 din 41 produse" }), []);
  });

  test("`&` in nume: meta il scrie `&amp;`, JSON-LD `&`, si e acelasi text", () => {
    const { html } = pagina({ d: SALON });
    assert.ok(html.includes("Salon &amp; Beauty"), "precondita: pagina de proba chiar scapa `&`");
    assert.deepEqual(judeca({ d: SALON, contor: "9 din 41 produse" }), []);
  });

  test("catalogul cu subtitlul comerciantului (decizia 5)", () => {
    assert.deepEqual(judeca({ d: SUBTITLU, contor: "41 produse" }), []);
  });

  test("mii de produse: descrierea scrie „1.353”, contorul „1353”", () => {
    const d = descriereCategorie({
      categorie: "Hrana caini", magazin: "VetDepo", parinte: null, subcategorii: [],
      continut: { numar: 1353, pretMinim: 12.5, interval: false, produse: [] }, faraTva: false, reduceri: false,
    });
    assert.ok(d.includes("1.353 de produse"), d);
    assert.deepEqual(judeca({ d, contor: "1353 din 3351 produse" }, { numeScurt: "VetDepo" }), []);
  });

  test("cifra spusa de comerciant nu se judeca: „Peste 500 de produse”", () => {
    assert.deepEqual(judeca({ d: "Peste 500 de produse pentru hoteluri și pensiuni.", contor: "41 produse" }), []);
  });

  test("un nume de produs cu „5 produse” nu e numarul paginii", () => {
    const d = descriereCategorie({
      categorie: "Curatenie", magazin: NUME, parinte: null, subcategorii: [],
      continut: { numar: 3, pretMinim: 20, interval: false, produse: ["Pachet 5 produse de curatenie"] }, faraTva: false, reduceri: false,
    });
    assert.ok(d.includes("Pachet 5 produse"), d);
    assert.deepEqual(judeca({ d, contor: "3 din 41 produse" }), []);
  });

  test("contorul ascuns de comerciant: nimic de comparat, nimic de raportat", () => {
    assert.deepEqual(judeca({ d: PROSOAPE, contor: null }), []);
  });

  test("pagina principala necitita: comparatia cu ea nu se face (ruta raporteaza separat)", () => {
    assert.deepEqual(judeca({ d: ACASA }, { descriereAcasa: null }), []);
  });

  test("`noindex` pe o pagina care NU e in sitemap nu e o contradictie", () => {
    assert.deepEqual(judeca({ d: PROSOAPE, robots: "noindex, follow" }, { dinSitemap: false }), []);
  });
});

describe("fiecare verificare cade SINGURA, pe defectul ei", () => {
  test("og diferit sau lipsa", () => {
    assert.deepEqual(judeca({ og: ACASA }), [`og:description difera („${ACASA}”)`]);
    assert.deepEqual(judeca({ og: null }), ["og:description difera (lipseste)"]);
  });

  test("twitter diferit sau lipsa", () => {
    assert.deepEqual(judeca({ tw: "alt text" }), ["twitter:description difera („alt text”)"]);
    assert.deepEqual(judeca({ tw: null }), ["twitter:description difera (lipseste)"]);
  });

  test("CollectionPage cu alt text (spatiile duble de la atelierullarisei.ro) sau fara nod", () => {
    const meta = "Brichetă personalizată / Scrumieră personalizată la Atelierul Larisei.";
    const ld = "Brichetă personalizată  /  Scrumieră personalizată la Atelierul Larisei.";
    assert.deepEqual(judeca({ d: meta, ld }), [`CollectionPage.description difera („${ld}”)`]);
    assert.deepEqual(judeca({ faraColectie: true }), ["n-are nod CollectionPage"]);
    assert.deepEqual(judeca({ ld: null }), ["CollectionPage.description difera (lipseste)"]);
  });

  test("fara meta description", () => {
    assert.deepEqual(judeca({ d: null, og: PROSOAPE, tw: PROSOAPE, ld: PROSOAPE }), ["n-are meta description"]);
  });

  test("numarul din descriere nu e al paginii", () => {
    assert.deepEqual(judeca({ d: PROSOAPE, contor: "17 din 41 produse" }), ["descrierea spune 18 produse, iar pagina arata 17"]);
  });

  test("anuntata in sitemap, dar `noindex` (decizia 6 despartita intre pagina si sitemap)", () => {
    assert.deepEqual(judeca({ d: PROSOAPE, robots: "noindex, follow" }), [
      "e anuntata in sitemap, dar poarta noindex (pagina si sitemapul nu mai aplica aceeasi regula)",
    ]);
  });
});

describe("numarDinDescriere, pe textele CHIAR ale generatorului", () => {
  const cont = (numar: number): ContinutPagina => ({ numar, pretMinim: 8.63, interval: false, produse: ["Prosop A", "Prosop B"] });
  const categorie = (numar: number, peste: Partial<{ parinte: string | null; reduceri: boolean; magazin: string }> = {}) =>
    descriereCategorie({
      categorie: "PROSOAPE", magazin: peste.magazin ?? NUME, parinte: peste.parinte ?? null, subcategorii: [],
      continut: cont(numar), faraTva: false, reduceri: peste.reduceri ?? false,
    });
  const catalog = (numar: number, reduceri = false) =>
    descriereCatalog({ magazin: NUME, radacini: ["PROSOAPE", "LENJERII DE PAT"], continut: cont(numar), reduceri });

  test("de la 10 produse in sus, cifra se citeste pe toate formele", () => {
    for (const n of [10, 19, 20, 100, 101, 1353, 20000]) {
      for (const t of [categorie(n), categorie(n, { parinte: "TEXTILE" }), categorie(n, { reduceri: true }), catalog(n), catalog(n, true)]) {
        assert.equal(numarDinDescriere(t, NUME), String(n), t);
      }
    }
  });

  test("sub 10, categoria nu spune numarul; catalogul il spune la orice marime, si la singular", () => {
    for (const n of [1, 2, 9]) {
      assert.equal(numarDinDescriere(categorie(n), NUME), null, categorie(n));
      assert.equal(numarDinDescriere(catalog(n), NUME), String(n), catalog(n));
    }
  });

  test("ancora e numele SCURT, cu punctul luat drept punct", () => {
    const magazin = "eSAFE.ro - Echipamente protectia muncii";
    const scurt = numeScurtMagazin(magazin);
    assert.equal(numarDinDescriere(categorie(214, { magazin }), scurt), "214");
    assert.equal(numarDinDescriere("Bocanci la eSAFExro: 214 produse.", scurt), null);
    assert.equal(numarDinDescriere(categorie(38, { magazin: "ULTIMUL MAGAZIN S.R.L." }), "ULTIMUL MAGAZIN"), "38");
  });
});

describe("contorul paginii", () => {
  test("pe categorie, pe catalog, cu mii", () => {
    assert.equal(numarDinContor(pagina({ contor: "18 din 41 produse" }).html), "18");
    assert.equal(numarDinContor(pagina({ contor: "41 produse" }).html), "41");
    assert.equal(numarDinContor(pagina({ contor: "1353 din 3351 produse" }).html), "1353");
    assert.equal(numarDinContor(pagina({ contor: "1 produs" }).html), "1");
  });

  test("⚠ subsolul paginarii (din bucati) nu e contorul", () => {
    assert.equal(numarDinContor(pagina({ contor: null }).html), null);
  });
});

describe("citirea etichetelor", () => {
  test("entitatile se intorc intr-o singura trecere", () => {
    assert.equal(decodeazaAtribut("Salon &amp; Beauty"), "Salon & Beauty");
    assert.equal(decodeazaAtribut("&quot;A&quot; &#x27;B&#x27; &#39;C&#39; &lt;60L&gt;"), "\"A\" 'B' 'C' <60L>");
    assert.equal(decodeazaAtribut("&amp;lt;"), "&lt;", "decodat de doua ori ar fi dat „<”");
  });

  test("name si property, iar lipsa e `null`", () => {
    const { html } = pagina({ d: "Saci <60L> & „alte” lucruri" });
    assert.equal(continutMeta(html, "name", "description"), "Saci <60L> & „alte” lucruri");
    assert.equal(continutMeta(html, "property", "og:description"), "Saci <60L> & „alte” lucruri");
    assert.equal(continutMeta(html, "name", "og:description"), null);
    assert.equal(continutMeta(html, "name", "keywords"), null);
  });

  test("CollectionPage: gasit, descriere, lipsa", () => {
    assert.deepEqual(descriereColectie([{ "@type": "BreadcrumbList" }]), { gasit: false, descriere: null });
    assert.deepEqual(descriereColectie([{ "@type": "CollectionPage", description: "x" }]), { gasit: true, descriere: "x" });
    assert.deepEqual(descriereColectie([{ "@type": "CollectionPage" }]), { gasit: true, descriere: null });
  });
});

test("santinela chiar are proba si o cheama cu ce trebuie", () => {
  /* `route.ts` cere pagini din productie, deci nu se poate rula aici. Se verifica pe sursa
     ca proba exista, ca judeca prin `problemeDescriere` si ca nu s-a atins alegerea pe
     care o folosesc probele de robots.txt si de sitemap. */
  const sursa = readFileSync(path.resolve(process.cwd(), "src/app/api/cron/santinela/route.ts"), "utf8").replace(/\r\n/g, "\n");
  const start = sursa.indexOf("nume: \"catalogul si categoriile au descrierea lor, nu pe a paginii principale\"");
  assert.ok(start > 0, "proba lipseste din santinela");
  const sfarsit = sursa.indexOf("\n  ];\n", start);
  assert.ok(sfarsit > start);
  // Fara comentarii: proba il POMENESTE pe `magazinCuSitemap` ca sa explice de ce nu-l
  // foloseste, iar un nume dintr-un comentariu nu e o folosire.
  const proba = sursa.slice(start, sfarsit)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.match(proba, /problemeDescriere\(\{[\s\S]*descriereAcasa,[\s\S]*dinSitemap: locuri\.includes\(v\.url\)/);
  assert.match(proba, /parseStoreSeo\(/, "alegerea cere descrierea din Setari > SEO completata");
  // Regulile alegerii (plan §2.6.7). `route.ts` nu se poate rula aici, deci o regula scoasa
  // de acolo n-ar cadea in nicio alta proba.
  assert.match(proba, /if \(!seo\.description\?\.trim\(\) \|\| seo\.noindex\) return \[\];/, "numai magazine cu descrierea completata si fara noindex de magazin");
  assert.match(proba, /if \(acelasiLoc\(r\.url, m\.baza\)\) continue;/, "pagina de catalog se afla cerand-o: dusa inapoi la radacina nu e catalog");
  assert.match(proba, /if \(eRezumate\) return /, "fara rezumate clasamentul e gol: proba spune de ce, nu tace");
  assert.doesNotMatch(proba, /magazinCuSitemap/, "`magazinCuSitemap` e al probelor de robots.txt si de sitemap");
  assert.equal([...sursa.matchAll(/const magazinCuSitemap\b/g)].length, 1);
});
