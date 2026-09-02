import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clasificaSursa, taraDinAnteturi, referrerScurt } from "./sursa-vizita";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  SURSA UNEI VIZITE — PROBATA PRIN CHEMARE
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CE APARA. Panoul comerciantului arata „Surse de trafic", si arata `direct`
  pentru orice rand fara sursa. Cat timp `source` nu se scria deloc, fiecare
  comerciant vedea „Direct 100%" — o cifra pe care se taie bugete de reclama.

  Masurat pe 02.09.2026: 0 randuri completate din 15.306.
*/

const anteturi = (m: Record<string, string>) => ({ get: (n: string) => m[n.toLowerCase()] ?? null });

/* ═══ 1. Ce bate ce ═══ */

test("⚠ `utm_source` bate referrerul", () => {
  /*
    Cand comerciantul si-a etichetat linkul, el stie de unde vine mai bine decat
    browserul — iar browserul minte des: retelele trec prin redirectari care sterg
    sau inlocuiesc referrerul.
  */
  assert.equal(clasificaSursa({ utmSource: "facebook", referrer: "https://www.google.com/" }), "facebook");
  assert.equal(clasificaSursa({ utmSource: "ig", referrer: "https://l.instagram.com/" }), "instagram");
});

test("⚠ jetoanele de clic bat referrerul lipsa — altfel traficul PLATIT iese `direct`", () => {
  /*
    ═══ ASTA E CEA MAI SCUMPA GRESEALA POSIBILA AICI ═══

    Un clic pe o reclama Google sau Meta ajunge des FARA referrer: redirectari,
    politici de referrer stranse, aplicatii native. Dar cu `gclid`/`fbclid` in
    adresa.

    Fara randurile astea, exact traficul pentru care comerciantul DA BANI ar fi
    fost numarat „direct" — adica raportul i-ar fi spus ca reclamele nu aduc pe
    nimeni, in timp ce ele aduceau.
  */
  assert.equal(clasificaSursa({ gclid: "Cj0KCQ..." }), "google");
  assert.equal(clasificaSursa({ fbclid: "IwAR2..." }), "facebook");
  assert.equal(clasificaSursa({ ttclid: "E.C.P..." }), "tiktok");

  /* Si tot `utm_source` ramane deasupra lor: e alegerea omului, nu a retelei. */
  assert.equal(clasificaSursa({ utmSource: "tiktok", gclid: "Cj0KCQ..." }), "tiktok");
});

/* ═══ 2. Potrivirea pe gazda, nu pe sir ═══ */

test("⚠ un articol DESPRE Facebook nu e trafic DE PE Facebook", () => {
  /*
    Prima forma cauta „facebook" oriunde in referrer. Atunci
    `exemplu.ro/blog/despre-facebook` devenea trafic de pe Facebook — si nimic
    n-ar fi cazut, doar raportul ar fi mintit in favoarea unei retele.
  */
  assert.equal(clasificaSursa({ referrer: "https://exemplu.ro/blog/despre-facebook" }), "other");
  assert.equal(clasificaSursa({ referrer: "https://not-google.ro/cauta" }), "other");
  assert.equal(clasificaSursa({ referrer: "https://google.ro/search?q=x" }), "google");
  assert.equal(clasificaSursa({ referrer: "https://www.google.com/" }), "google");
  assert.equal(clasificaSursa({ referrer: "https://m.facebook.com/" }), "facebook");
  assert.equal(clasificaSursa({ referrer: "https://l.instagram.com/" }), "instagram");
  assert.equal(clasificaSursa({ referrer: "https://www.tiktok.com/@cineva" }), "tiktok");
});

/* ═══ 3. Navigarea prin propriul magazin ═══ */

test("⚠ pasul dintr-o pagina proprie in alta NU e o trimitere", () => {
  /*
    Fara paza asta, fiecare navigare interna ar fi aratat ca trafic „de pe"
    propriul domeniu si ar fi inecat sursele adevarate. Aceeasi greseala pe care
    am reparat-o azi in `attribution.ts`, unde referrerul intern trecea drept
    extern.
  */
  assert.equal(
    clasificaSursa({ referrer: "https://magazinulmeu.ro/produse", gazdaProprie: "magazinulmeu.ro" }),
    "direct",
  );
  /* `www.` nu deosebeste doua gazde. */
  assert.equal(
    clasificaSursa({ referrer: "https://www.magazinulmeu.ro/x", gazdaProprie: "magazinulmeu.ro" }),
    "direct",
  );
  /* Dar ALT magazin de pe platforma ramane o trimitere adevarata. */
  assert.equal(
    clasificaSursa({ referrer: "https://altmagazin.ro/", gazdaProprie: "magazinulmeu.ro" }),
    "other",
  );
});

/* ═══ 4. `direct` de acum e MASURAT ═══ */

test("fara nimic in spate se intoarce `direct`, si asta e un raspuns, nu o lipsa", () => {
  /*
    ⚠ DEOSEBIREA FATA DE INAINTE. Un rand vechi are `source` NULL fiindca nimeni
    n-a intrebat niciodata. Un rand nou are `direct` fiindca s-a intrebat si nu
    era nimeni in spate. In panou arata la fel — dar unul se poate crede.
  */
  assert.equal(clasificaSursa({}), "direct");
  assert.equal(clasificaSursa({ referrer: "" }), "direct");
  assert.equal(clasificaSursa({ referrer: "   " }), "direct");
  assert.equal(clasificaSursa({ referrer: "nu-e-o-adresa" }), "direct");
  assert.equal(clasificaSursa({ utmSource: "  " }), "direct");
});

test("o sursa etichetata pe care n-o cunoastem devine `other`, nu `direct`", () => {
  /*
    ⚠ SI ASTA CONTEAZA. Trecuta la `direct`, o campanie de newsletter ar fi parut
    trafic spontan — iar comerciantul ar fi crezut ca newsletterul nu aduce pe
    nimeni. `other` spune adevarul: a venit de undeva, doar ca nu dintr-un loc pe
    care il numim noi.
  */
  assert.equal(clasificaSursa({ utmSource: "newsletter" }), "other");
  assert.equal(clasificaSursa({ referrer: "https://olx.ro/anunt" }), "other");
});

/* ═══ 5. Tara: necunoscuta ramane necunoscuta ═══ */

test("⚠ tara vine din antet, iar lipsa ei NU se completeaza cu `RO`", () => {
  /*
    Randul de dinainte scria `country: "RO"` pentru orice vizitator din lume — o
    presupunere care arata exact ca o masuratoare. N-are rost sa reparam o
    inventie inlocuind-o cu alta.
  */
  assert.equal(taraDinAnteturi(anteturi({ "x-vercel-ip-country": "DE" })), "DE");
  assert.equal(taraDinAnteturi(anteturi({ "x-vercel-ip-country": "ro" })), "RO");
  assert.equal(taraDinAnteturi(anteturi({})), null, "lipsa antetului a devenit o tara inventata");
  assert.equal(taraDinAnteturi(anteturi({ "x-vercel-ip-country": "" })), null);
  assert.equal(taraDinAnteturi(anteturi({ "x-vercel-ip-country": "XYZ" })), null, "o valoare stricata a trecut");
});

test("referrerul se taie, ca sa nu creasca o coloana de diagnostic la nesfarsit", () => {
  assert.equal(referrerScurt(null), null);
  assert.equal(referrerScurt("  "), null);
  assert.equal(referrerScurt("https://x.ro/a"), "https://x.ro/a");
  assert.equal(referrerScurt("https://x.ro/" + "a".repeat(900))?.length, 500);
});

/* ═══ 6. Ca reparatia chiar e legata in AMANDOI scriitorii ═══ */

test("⚠ niciun scriitor nu mai scrie `country: \"RO\"` in cod", () => {
  /*
    Sunt DOUA locuri care insereaza in `site_analytics`, scrise identic. Reparat
    unul singur, jumatate din magazine ar fi ramas cu date inventate — si nimic
    n-ar fi aratat care jumatate.
  */
  for (const cale of [
    "src/lib/storefront/catalog/pagina-magazin.tsx",
    "src/app/(public)/[slug]/page.tsx",
  ]) {
    const cod = readFileSync(join(process.cwd(), cale), "utf8");
    assert.ok(
      !cod.includes('country: "RO"'),
      `${cale}: tara e inca scrisa in cod`,
    );
    assert.ok(
      cod.includes("clasificaSursa("),
      `${cale}: sursa vizitei nu se mai masoara`,
    );
    assert.ok(
      cod.includes("taraDinAnteturi("),
      `${cale}: tara nu se mai citeste din antet`,
    );
    /*
      ⚠ SE SCRIE DIRECT, nu sub o conditie. Cat timp coloana era
      `NOT NULL DEFAULT 'RO'`, cheia trebuia sarita cand tara lipsea — altfel
      randul n-ar fi existat deloc. Migrarea din 02.09.2026 a scos si implicitul,
      si `NOT NULL`, deci acum `null` are voie sa insemne „nu stiu".

      Daca cineva pune la loc scrierea conditionata, baza n-ar mai capata `null`
      si necunoscuta ar disparea din nou — tacut, si fara sa cada nimic.
    */
    assert.ok(
      cod.includes("country: taraVizitatorului,"),
      `${cale}: tara nu se mai scrie direct — necunoscuta se pierde iar`,
    );
  }
});
