import { strict as assert } from "node:assert";
import { test } from "node:test";

import { ORDINEA_PIETELOR, PIETE, type PiataPepita } from "./types";
import { aceeasiMoneda, opreste, pretulPietei, scrieCursul, zecimale } from "./piete";
import { citesteConfig } from "./config";
import { preturilePentruFeed } from "./pret";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE APARA PROBELE ASTEA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠⚠ Feedul scrie moneda PIETEI, iar pretul vine din catalogul magazinului.
  Trimise asa cum sunt, un produs de 500 RON pleaca spre Ungaria ca
  `<Price>500</Price><Currency>HUF</Currency>` - vandut la ~1% din pret.

  XML-ul e valid, feedul raspunde 200, panoul arata verde. Nu da nicio eroare
  nicaieri: se afla din comenzi.

  Acelasi defect a existat la AboutYou (26.08.2026), unde 20 EUR se citea ca
  20 PLN in Polonia.
*/

test("⚠ FARA CURS SCRIS, PIATA CU ALTA MONEDA NU TRIMITE NIMIC", () => {
  /*
    ⚠ Nu „trimite fara conversie", nu „trimite un feed gol": NU TRIMITE. Tacerea
    e singurul raspuns cinstit cand nu stim pretul.
  */
  const r = opreste("hu", { activa: true, curs: null }, "RON");
  assert.equal(r?.cheie, "fara-curs");
  assert.match(r!.text, /HUF/);
  assert.match(r!.text, /nu pleacă/);

  /* Si pretul nu se poate socoti deloc. */
  assert.equal(pretulPietei(500, "hu", { activa: true, curs: null }, "RON"), null);
});

test("⚠ ACELASI NUMAR NU PLEACA CU ALTA MONEDA PE EL", () => {
  /*
    ⚠ Proba care apara chiar defectul: 500 de lei catre Ungaria nu au voie sa
    iasa ca 500. Cu cursul scris, ies 39.500.
  */
  const cuCurs = { activa: true, curs: 79 };
  const iesit = pretulPietei(500, "hu", cuCurs, "RON");
  assert.notEqual(iesit, 500, "pretul a plecat NECONVERTIT, cu alta moneda pe el");
  assert.equal(iesit, 39500);
});

test("piata cu aceeasi moneda nu cere niciun curs", () => {
  assert.equal(opreste("ro", { activa: true, curs: null }, "RON"), null);
  assert.equal(pretulPietei(123.45, "ro", { activa: true, curs: null }, "RON"), 123.45);

  /* ⚠ Si un magazin in EUR poate trimite catre Germania fara curs. */
  assert.equal(opreste("de", { activa: true, curs: null }, "EUR"), null);
  assert.equal(pretulPietei(20, "de", { activa: true, curs: null }, "EUR"), 20);
});

test("⚠ MONEDA MAGAZINULUI NU SE PRESUPUNE A FI RON", () => {
  /*
    ⚠ Scrisa de-a gata, un magazin in EUR ar fi fost pus sa scrie un curs
    EUR→EUR pentru Germania, iar pentru Romania n-ar fi cerut niciunul - exact
    pe dos.
  */
  assert.equal(aceeasiMoneda("de", "EUR"), true);
  assert.equal(aceeasiMoneda("de", "RON"), false);
  assert.equal(opreste("ro", { activa: true, curs: null }, "EUR")?.cheie, "fara-curs");
  assert.equal(aceeasiMoneda("ro", " ron "), true, "spatiile si literele mici nu schimba moneda");
});

test("o piata nepornita nu trimite, oricat curs ar avea", () => {
  assert.equal(opreste("hu", { activa: false, curs: 79 }, "RON")?.cheie, "neactivata");
  assert.equal(opreste("hu", undefined, "RON")?.cheie, "neactivata");
  assert.equal(pretulPietei(500, "hu", { activa: false, curs: 79 }, "RON"), null);
});

test("⚠ UN CURS NEVALID E DEOSEBIT DE UNUL NESCRIS", () => {
  /*
    ⚠ „N-am scris inca" si „am scris o prostie" cer doua raspunsuri: primul e o
    treaba neterminata, al doilea o greseala. Acelasi mesaj l-ar fi pus pe om sa
    caute un camp gol care nu e gol.
  */
  for (const rau of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const r = opreste("pl", { activa: true, curs: rau }, "RON");
    assert.equal(r?.cheie, "curs-nevalid", `cursul ${rau} ar fi trebuit respins`);
  }
  assert.equal(opreste("pl", { activa: true, curs: null }, "RON")?.cheie, "fara-curs");
});

test("⚠ UN PRET CARE IESE ZERO DUPA CONVERSIE NU PLEACA", () => {
  /*
    ⚠ Se intampla la monede „mari": un produs de 0,30 lei catre euro da 0,06,
    iar cu un curs scris gresit da zero curat. Pepita respinge zero fara sa
    spuna de ce, deci se opreste aici, unde se poate arata langa produs.
  */
  assert.equal(pretulPietei(0.3, "de", { activa: true, curs: 0.0001 }, "RON"), null);
  assert.equal(pretulPietei(0.3, "de", { activa: true, curs: 0.2 }, "RON"), 0.06);
});

test("⚠ CELE SAPTE PIETE AU ADRESE CARE CHIAR SUNT ALE LOR", () => {
  /*
    ⚠ Verificat pe 21.09.2026 cerand fiecare adresa: `pepita.pl` e un magazin
    POLONEZ DE GENTI DE PIELE (alta firma), iar `pepita.sk` e un domeniu PARCAT
    la un hosting. Amandoua raspund 200 si au „Pepita" in titlu. `pepita.ro` nu
    raspunde deloc - defectul din 09.09.2026.

    Marketplace-ul sta pe `pepita.hu` si pe `pepita.com/{tara}`, si atat.
  */
  for (const [cheie, p] of Object.entries(PIETE)) {
    const potrivita = p.adresa === "pepita.hu" || p.adresa === `pepita.com/${cheie}`;
    assert.ok(potrivita, `${cheie}: adresa „${p.adresa}" nu e a marketplace-ului`);
    assert.doesNotMatch(p.adresa, /^pepita\.(ro|pl|sk|de|bg|hr)$/, `${cheie}: domeniu de tara care nu e al lor`);
    assert.match(p.moneda, /^[A-Z]{3}$/, `${cheie}: moneda nu e cod ISO 4217`);
  }
});

test("monedele sunt cele declarate de ei, nu cele din memoria mea", () => {
  /*
    ⚠ Bulgaria da EUR, nu BGN, si Croatia la fel: amandoua au trecut la euro.
    O lista scrisa din cap ar fi ramas in urma, iar preturile ar fi plecat cu
    moneda gresita - adica exact defectul pe care il pazim.
  */
  assert.equal(PIETE.hu.moneda, "HUF");
  assert.equal(PIETE.ro.moneda, "RON");
  assert.equal(PIETE.pl.moneda, "PLN");
  for (const t of ["sk", "de", "bg", "hr"] as const) {
    assert.equal(PIETE[t].moneda, "EUR", `${t} ar trebui sa fie pe euro`);
  }
});

test("toate pietele sunt in ordinea de pe ecran, si niciuna de doua ori", () => {
  const toate = Object.keys(PIETE) as PiataPepita[];
  assert.equal(ORDINEA_PIETELOR.length, toate.length, "ordinea de pe ecran a ramas in urma");
  assert.deepEqual([...ORDINEA_PIETELOR].sort(), [...toate].sort());
  assert.equal(new Set(ORDINEA_PIETELOR).size, ORDINEA_PIETELOR.length);
  assert.equal(ORDINEA_PIETELOR[0], "ro", "Romania sta prima: de acolo am pornit");
});

test("forintul se scrie fara zecimale", () => {
  /* ⚠ Forintul nu se imparte in subunitati folosite: „39.500,00 Ft" arata strain. */
  assert.equal(zecimale("hu"), 0);
  assert.equal(zecimale("ro"), 2);
  assert.equal(zecimale("de"), 2);
});

test("cursul se scrie pe intelesul omului", () => {
  assert.equal(scrieCursul("hu", 79, "RON"), "1 RON = 79 HUF");
  assert.equal(scrieCursul("hu", null, "RON"), "1 RON = ? HUF");
  assert.match(scrieCursul("ro", null, "RON"), /Aceeași monedă/);
});

/* ═══════════════════════════════════════════════════════════════════════════
   CITIREA CONFIGURARII: ce pateste un magazin care merge AZI
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠⚠ UN MAGAZIN DE AZI NU RAMANE FARA NICIO PIATA", () => {
  /*
    ⚠ Configurarile scrise inainte de 21.09.2026 n-au `piete` deloc. Citite ca
    „niciuna pornita", feedul lor ar tacea din clipa desfasurarii - si ar tacea
    la fel de frumos ca in septembrie: 200, XML valid, panou verde, catalog gol.
    Trei magazine au patit-o deja o data, si n-a aflat nimeni pana n-a scris
    Pepita.
  */
  const vechi = citesteConfig({ activ: true, piata: "ro", mod_includere: "toate" });
  assert.deepEqual(vechi.piete, { ro: { activa: true, curs: null } });
  assert.equal(opreste("ro", vechi.piete.ro, "RON"), null, "piata de baza trebuie sa trimita");
});

test("mostenirea ia piata DE BAZA, nu Romania de-a gata", () => {
  /* Un magazin configurat pe Ungaria isi pastreaza Ungaria, nu primeste Romania. */
  const hu = citesteConfig({ activ: true, piata: "hu" });
  assert.deepEqual(hu.piete, { hu: { activa: true, curs: null } });
});

test("⚠ UN OBIECT GOL SCRIS ANUME RAMANE GOL", () => {
  /*
    ⚠ Deosebirea dintre „n-a existat campul" si „omul a stins tot". Prima cere
    mostenire, a doua trebuie respectata: altfel cine tocmai a oprit toate
    pietele le-ar vedea aprinse la reincarcare.
  */
  assert.deepEqual(citesteConfig({ activ: true, piata: "ro", piete: {} }).piete, {});
});

test("⚠ UN CURS PROST DIN CONFIGURARE SE CURATA LA CITIRE", () => {
  /*
    ⚠ Un `0`, un `-3` sau un `"abc"` ajuns in configurare ar fi trecut drept
    „curs scris", iar oprirea l-ar fi respins abia la feed: omul ar fi vazut
    campul plin si feedul mut. Adus la `null`, ecranul arata limpede ca nu e scris.
  */
  const c = citesteConfig({
    activ: true, piata: "ro",
    piete: {
      hu: { activa: true, curs: 0 },
      pl: { activa: true, curs: -3 },
      de: { activa: true, curs: "abc" },
      sk: { activa: true, curs: "1.5" },
      bg: { activa: true, curs: 1.96 },
    },
  });
  assert.equal(c.piete.hu?.curs, null);
  assert.equal(c.piete.pl?.curs, null);
  assert.equal(c.piete.de?.curs, null);
  assert.equal(c.piete.sk?.curs, 1.5, "un numar scris ca text se citeste");
  assert.equal(c.piete.bg?.curs, 1.96);
});

test("o piata inventata in configurare nu intra in cod", () => {
  /* ⚠ Altfel `PIETE[piata]` ar fi `undefined` si feedul ar cadea la mijloc. */
  const c = citesteConfig({ activ: true, piata: "ro", piete: { xx: { activa: true, curs: 2 } } });
  assert.deepEqual(Object.keys(c.piete), []);
});

test("citirea nu arunca niciodata, oricat de stricata ar fi configurarea", () => {
  /* ⚠ O exceptie aici cade in mijlocul unui feed, nu intr-un formular. */
  for (const rau of [null, undefined, 0, "", [], "text", { piete: 7 }, { piete: [1, 2] }]) {
    assert.doesNotThrow(() => citesteConfig(rau));
  }
  assert.deepEqual(citesteConfig({ piete: 7 }).piete, {});
});

/* ═══════════════════════════════════════════════════════════════════════════
   PRETUL DIN FEED, CU CURS
   ═══════════════════════════════════════════════════════════════════════════ */

const FARA_TVA = { vat_enabled: false, vat_rate: 0, prices_include_vat: true };
const IDENTIC = { fel: "identic" as const, valoare: 0 };

test("⚠⚠ FARA CURS, PRETUL RAMANE NECONVERTIT — de-aia feedul nu pleaca deloc", () => {
  /*
    ⚠ Socoteala nu stie de tara: cheamata fara curs, ea intoarce cinstit numarul
    din catalog. Aia NU e o scapare, ci impartirea muncii — oprirea se face mai
    sus, in `pregateste`, unde piata fara curs da 404.

    Proba sta aici ca sa se vada limpede CE s-ar fi trimis daca oprirea ar lipsi:
    500, cu `HUF` scris langa el.
  */
  assert.equal(preturilePentruFeed(500, null, IDENTIC, FARA_TVA).pret, 500);
  assert.equal(preturilePentruFeed(500, null, IDENTIC, FARA_TVA, null).pret, 500);
  /* Si ca oprirea chiar exista, pentru aceeasi piata. */
  assert.ok(opreste("hu", { activa: true, curs: null }, "RON"));
});

test("cu curs, pretul pleaca in moneda pietei", () => {
  assert.equal(preturilePentruFeed(500, null, IDENTIC, FARA_TVA, 79).pret, 39500);
  assert.equal(preturilePentruFeed(100, null, IDENTIC, FARA_TVA, 0.2).pret, 20);
});

test("⚠ CURSUL SE APLICA ULTIMUL, dupa strategie si dupa TVA", () => {
  /*
    ⚠ Strategia si TVA-ul sunt PROCENTE, iar un procent da acelasi rezultat
    inainte sau dupa o inmultire. Rotunjirea nu: convertit mai devreme, fiecare
    pas ar rotunji in moneda tinta si s-ar aduna banuti straini la fiecare
    produs. Asa se rotunjeste o singura data, la capat.
  */
  const cuAdaos = { fel: "procent" as const, valoare: 10 };
  const cuTva = { vat_enabled: true, vat_rate: 21, prices_include_vat: true };

  const inLei = preturilePentruFeed(100, null, cuAdaos, cuTva).pret;
  const inForinti = preturilePentruFeed(100, null, cuAdaos, cuTva, 79).pret;
  assert.equal(inForinti, Math.round(inLei * 79 * 100) / 100,
    "cursul nu s-a aplicat peste rezultatul intreg");
});

test("⚠ PRETUL TAIAT SE CONVERTESTE SI EL, si ramane mai mare decat cel de vanzare", () => {
  /*
    ⚠ Convertit doar unul dintre ele, reducerea ar fi iesit uriasa sau inversa:
    „de la 500 HUF la 39.500 HUF" - o „reducere" care ridica pretul.
  */
  const p = preturilePentruFeed(100, 150, IDENTIC, FARA_TVA, 79);
  assert.equal(p.pret, 11850, "pretul taiat nu s-a convertit");
  assert.equal(p.pretRedus, 7900, "pretul de vanzare nu s-a convertit");
  assert.ok(p.pret > (p.pretRedus ?? 0), "taiatul trebuie sa ramana mai mare");
});

test("un curs nevalid nu se aplica, in loc sa strice pretul", () => {
  /* ⚠ `NaN` inmultit ar fi dat `NaN`, iar `<Price>NaN</Price>` e XML valid si otravit. */
  for (const rau of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined, null]) {
    const p = preturilePentruFeed(500, null, IDENTIC, FARA_TVA, rau as never);
    assert.equal(p.pret, 500, `cursul ${rau} n-ar fi trebuit aplicat`);
    assert.ok(Number.isFinite(p.pret));
  }
});
