import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
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

/*
  ⚠ CINE ARE VOIE SA CITEASCA TABELA FARA SA TAIE.

  Numai cod care nu preda NIMIC browserului. `conexiune.ts` chiar are nevoie de
  `refresh_token`-ul intreg — el il schimba pe un token de acces, pe server.
  Celelalte doua citesc o singura cheie de configurare, intr-un cron si intr-un
  webhook, unde nu exista browser.

  Portita asta e pazita de proba de mai jos: o pagina sau o componenta pusa aici
  cade, oricat de convins ar fi cine o pune.
*/
const SERVER_ONLY = [
  "src/app/api/cron/emag-sync/route.ts",
  "src/app/api/emag/webhook/route.ts",
  "src/lib/admin-analytics/conexiune.ts",
];

function faraComentarii(cod: string): string {
  const RAND = String.fromCharCode(10);
  const faraBlocuri = cod.split("/*").map((b, i) => {
    if (i === 0) return b;
    const k = b.indexOf("*/");
    return k < 0 ? "" : b.slice(k + 2);
  }).join("");
  return faraBlocuri.split(RAND).map((r) => {
    const k = r.indexOf("//");
    return k < 0 ? r : r.slice(0, k);
  }).join(RAND);
}

/** Fisierele care CHIAR interogheaza tabela (nu doar o pomenesc intr-un comentariu). */
function fisiereCare(tabela: string): string[] {
  const gasite: string[] = [];
  const mers = (rad: string) => {
    for (const n of readdirSync(rad)) {
      const p = join(rad, n);
      if (statSync(p).isDirectory()) { mers(p); continue; }
      if (!/\.(ts|tsx)$/.test(n) || n.endsWith(".test.ts") || n === "database.types.ts") continue;
      if (faraComentarii(readFileSync(p, "utf8")).includes(`from("${tabela}")`)) {
        gasite.push(p.split("\\").join("/"));
      }
    }
  };
  mers("src");
  return gasite.sort();
}

const taie = (cod: string) => faraComentarii(cod).includes("setariPentruBrowser(");

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

test("⚠ ORICE citire a `platform_settings` ori taie, ori e server-only declarata", () => {
  /*
    ═══ ⚠ CUM A SCAPAT UN `refresh_token` PE LANGA PROPRIA LUI PAZA ═══

    Prima forma a probei astea citea UN fisier: `/api/admin/settings/route.ts`.
    Ruta chema taierea, proba era verde, si totul parea aparat.

    Dar `src/app/(admin)/admin/setari/page.tsx` facea acelasi lucru pe alt drum:
    citea toata tabela si o dadea, netaiata, unei componente `"use client"` —
    adica direct in raspunsul paginii. Printre randuri, `edinio_ga4_admin` cu
    `refresh_token`-ul Google, care nu expira.

    O paza pusa pe UN FISIER apara acel fisier. Regula se apara cautand TOATE
    locurile care ating tabela — inclusiv pe cel scris maine de altcineva.
  */
  const usi = fisiereCare("platform_settings");
  assert.ok(usi.length >= 2, "cautarea nu mai gaseste nimic — probabil s-a stricat ea, nu codul");

  const vinovate = usi.filter((f) => !SERVER_ONLY.includes(f) && !taie(citeste(f)));
  assert.deepEqual(
    vinovate, [],
    "citesc `platform_settings` fara sa taie secretele, si nu sunt declarate server-only: " + vinovate.join(", "),
  );
});

test("⚠ taierea e ATRIBUITA, nu doar pomenita", () => {
  /*
    ⚠ Un `setariPentruBrowser(...)` al carui rezultat se arunca ar trece de orice
    potrivire pe nume. Se cere ca valoarea taiata sa fie chiar cea folosita.
  */
  for (const f of fisiereCare("platform_settings").filter((x) => !SERVER_ONLY.includes(x))) {
    const cod = faraComentarii(citeste(f));
    assert.match(cod, /(const|let) settings = setariPentruBrowser\(/, `${f}: taierea nu e atribuita`);
    assert.doesNotMatch(cod, /settings\[row\.key\] = row\.value/, `${f}: a revenit atribuirea directa`);
  }
});

test("lista server-only nu ascunde o usa catre browser", () => {
  /*
    ⚠ CE APARA. `SERVER_ONLY` e o portita: ce e trecut acolo scapa de taiere.
    Daca cineva pune acolo o PAGINA sau o COMPONENTA, portita devine gaura.
    Server-only inseamna cod care nu preda nimic browserului.
  */
  for (const f of SERVER_ONLY) {
    assert.ok(fisiereCare("platform_settings").includes(f), `${f}: trecut server-only dar nu mai citeste tabela`);
    assert.ok(!f.includes("/components/"), `${f}: o componenta nu poate fi server-only`);
    assert.ok(!f.endsWith("page.tsx"), `${f}: o pagina preda proprietati browserului`);
    assert.ok(!faraComentarii(citeste(f)).includes('"use client"'), `${f}: e cod de client`);
  }
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
