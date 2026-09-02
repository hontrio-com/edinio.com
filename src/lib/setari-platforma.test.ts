import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { faraSecrete, setariPentruBrowser, CAMPURI_SECRETE } from "./setari-platforma";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  UN JETON GOOGLE NU PLEACA CATRE BROWSER
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CE APARA. Din 02.09.2026, `platform_settings` poarta si legatura Google a
  platformei, cu un `refresh_token`. Jetonul ala NU EXPIRA: cine il are are contul
  pana la o revocare pe care nimeni n-o va face, fiindca nimeni nu va sti.

  Iar `/api/admin/settings` intoarce toata tabela, transformata in `{cheie:
  valoare}`. Fara taiere, jetonul ar fi plecat catre browserul oricarui
  administrator la fiecare incarcare a paginii de setari.
*/

const citeste = (p: string) => readFileSync(p, "utf8");

test("⚠ jetonul de reimprospatare nu iese din setari", () => {
  const randuri = [
    { key: "edinio_ga4_admin", value: { refresh_token: "1//0gSECRETSECRET", email_conectat: "cineva@edinio.com", property_id: "123" } },
    { key: "maintenance_mode", value: false },
  ];

  const iesire = setariPentruBrowser(randuri);
  const text = JSON.stringify(iesire);

  assert.ok(!text.includes("1//0gSECRETSECRET"), "jetonul a plecat catre browser");

  /* ⚠ Si restul ramane: altfel interfata ar crede ca nu exista nicio legatura. */
  const legatura = iesire.edinio_ga4_admin as Record<string, unknown>;
  assert.equal(legatura.email_conectat, "cineva@edinio.com");
  assert.equal(legatura.property_id, "123");
  assert.equal(legatura.refresh_token, "[ascuns]", "campul a disparut cu totul, nu s-a inlocuit");
  assert.equal(iesire.maintenance_mode, false, "setarile obisnuite s-au stricat");
});

test("⚠ regula e pe CAMP, deci prinde si o cheie de rand pe care n-o cunoastem", () => {
  /*
    ═══ ASTA E DEOSEBIREA CARE CONTEAZA ═══

    O lista de CHEI DE RAND oprite ar fi imbatranit la primul rand nou — iar cine
    il adauga peste sase luni nu se gandeste la fisierul asta. Aici cade orice
    camp care poarta un secret, sub orice nume de rand.
  */
  const iesire = setariPentruBrowser([
    { key: "un_furnizor_de_maine", value: { api_key: "sk_live_periculos", nume: "Cineva" } },
  ]);
  const text = JSON.stringify(iesire);
  assert.ok(!text.includes("sk_live_periculos"), "o cheie API dintr-un rand necunoscut a plecat");
  assert.equal((iesire.un_furnizor_de_maine as Record<string, unknown>).nume, "Cineva");
});

test("secretele cad si cand stau adanc, si in liste", () => {
  const adanc = faraSecrete({
    nivel1: { nivel2: [{ client_secret: "aaa" }, { ceva: "bbb" }] },
  });
  const text = JSON.stringify(adanc);
  assert.ok(!text.includes("aaa"), "un secret de pe al treilea nivel a scapat");
  assert.ok(text.includes("bbb"), "s-a taiat si ce nu era secret");
});

test("⚠ MATURA: fiecare nume din lista chiar e taiat, si ca sufix", () => {
  /*
    ⚠ Fara asta, cineva ar putea adauga un nume in lista fara sa se potriveasca
    vreodata (o litera mare, un spatiu) si paza ar parea mai larga decat e.
    Se cere si forma cu prefix (`google_refresh_token`), fiindca asa se numesc
    campurile in viata reala.
  */
  for (const camp of CAMPURI_SECRETE) {
    const direct = faraSecrete({ [camp]: "valoare-periculoasa" }) as Record<string, unknown>;
    assert.equal(direct[camp], "[ascuns]", `campul "${camp}" nu e taiat`);

    const cuPrefix = faraSecrete({ [`google_${camp}`]: "valoare-periculoasa" }) as Record<string, unknown>;
    assert.equal(cuPrefix[`google_${camp}`], "[ascuns]", `campul "google_${camp}" nu e taiat`);
  }

  /* Martorul: un camp nevinovat NU se taie, altfel proba de sus n-ar dovedi nimic. */
  const nevinovat = faraSecrete({ email_conectat: "a@b.ro" }) as Record<string, unknown>;
  assert.equal(nevinovat.email_conectat, "a@b.ro", "paza taie si ce n-ar trebui");
});

test("⚠ ruta de setari CHIAR trece prin taiere", () => {
  /*
    ⚠ Toata proba de mai sus e degeaba daca ruta nu cheama functia. Se cere
    ATRIBUIREA, nu doar pomenirea numelui: un `setariPentruBrowser(...)` al carui
    rezultat se arunca ar fi trecut verde la o simpla potrivire pe nume.
  */
  const cod = citeste("src/app/api/admin/settings/route.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.match(
    cod, /const settings = setariPentruBrowser\(/,
    "ruta de setari nu mai taie secretele — jetonul Google pleaca la browser",
  );
  assert.doesNotMatch(
    cod, /settings\[row\.key\] = row\.value/,
    "a revenit atribuirea directa, pe langa taiere",
  );
});

/* ═══ `(not set)` nu inseamna acelasi lucru peste tot ═══ */

test("⚠ explicatia pentru `(not set)` se da dupa FELUL dimensiunii", () => {
  /*
    ═══ TEXT DE AJUTOR MINCINOS, GASIT LA DOUA ORE DUPA CE L-AM SCRIS ═══

    Am pus explicatia „dinainte de inregistrarea dimensiunii" pe orice `(not set)`
    din raport. E adevarata pentru `page_group` si `cta_id`, care CHIAR se
    inregistreaza de mana in GA4.

    In tabelul „Surse" a iesit o propozitie falsa: sursa e o dimensiune STANDARD,
    pe care n-o inregistreaza nimeni. Acolo `(not set)` inseamna ca GA4 n-a putut
    stabili valoarea — alta cauza, alt raspuns, si nu se repara cu timpul.

    ⚠ UN TEXT DE AJUTOR GRESIT E MAI RAU DECAT NICIUNUL: al doilea te lasa sa
    intrebi, primul te opreste din intrebat — exact acolo unde te uiti dupa adevar.

    Proba cere ca numai cele DOUA tabele sprijinite pe dimensiuni personalizate sa
    fie marcate asa, si niciunul in plus.
  */
  const cod = citeste("src/components/admin/AdminAnalyticsClient.tsx");

  const marcate = [...cod.matchAll(/titlu="([^"]+)"[^\n]*dimensiune="personalizata"/g)].map(m => m[1]);
  assert.deepEqual(
    marcate.sort(), ["Butoane apasate", "Pe grupuri de pagini"],
    "s-au marcat ca personalizate alte tabele decat cele doua care chiar sunt",
  );

  /* Si ca exista amandoua explicatiile, nu doar una folosita peste tot. */
  assert.ok(cod.includes("dinainte de inregistrarea dimensiunii"), "lipseste explicatia pentru dimensiuni personalizate");
  assert.ok(cod.includes("nedeterminat de GA4"), "lipseste explicatia pentru dimensiuni standard");

  /* ⚠ Si un sir gol nu mai lasa o celula alba, care arata a defect. */
  assert.ok(cod.includes('(valoare goala)'), "un rand cu valoare vida se afiseaza ca celula alba");
});
