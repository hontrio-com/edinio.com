import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  BANDA,
  CONTINUT_MINIM,
  CURSA,
  LIBER_SUB_BARA,
  MARGINE_UMBRA,
  MARIME_LAT,
  PRAG_LAT,
  PRAG_LATURI,
  RAPORT_MAX_PLUTA,
  SIGLE_PLUTITOARE,
  SPATIU_BARA,
  UMBRA_JOS,
  cutia,
  etichetaCampului,
  locul,
  marimea,
  problemeDeAsezare,
  seIntersecteaza,
  treapta,
  umflarea,
  vizibile,
} from "./integrari-hero";
import { LOGO_GROUPS, PROVIDER_LOGOS } from "./logos";

/*
 * Siglele din hero-ul paginii „Integrări" sunt așezate ABSOLUT peste text.
 *
 * Ăsta e genul de aranjare care nu se strică zgomotos. O siglă căzută cu 20px
 * prea spre mijloc nu dă nicio eroare, nu rupe nimic și nu se vede în `tsc`, în
 * `eslint` sau în build: se așază peste titlu, și atât. Se vede doar dacă
 * cineva deschide chiar lățimea aia de ecran — iar între 320 și 2560 sunt multe
 * lățimi pe care nu le deschide nimeni la testare.
 *
 * De aceea aici nu se probează „se randează?", ci GEOMETRIA: pentru fiecare
 * lățime pe care o susținem, unde ajunge fiecare casetă și peste ce dă.
 *
 * ⚠ Proba nu poate ști cât de înalt iese titlul, fiindcă asta cere fontul
 * randat. De aceea fiecare lățime se încearcă la mai multe ÎNĂLȚIMI de secțiune,
 * de la cea mai scurtă cu putință până la una cu titlul rupt pe patru rânduri.
 * Toată așezarea e ancorată de muchii tocmai ca răspunsul să nu depindă de asta;
 * proba verifică exact că așa e.
 */

/** Lățimile susținute, pe cele trei trepte de așezare. */
const LATIMI_INGUST = [320, 360, 375, 390, 414, 430, 540, 640, 768, 820, 1000, 1023];
const LATIMI_LAT = [1024, 1100, 1152, 1279];
const LATIMI_LATURI = [1280, 1366, 1440, 1512, 1600, 1920, 2560];

/**
 * Înălțimile de secțiune încercate la fiecare lățime.
 *
 * De la cel mai scurt conținut cu care mai poate ieși hero-ul (`CONTINUT_MINIM`,
 * adică mai puțin decât are pagina azi) până la un titlu rupt pe patru rânduri cu
 * un lead pe cinci. Cazul greu e cel SCURT: acolo siglele de pe laturi, agățate
 * de mijlocul înălțimii, sunt cel mai aproape de benzi.
 */
function inaltimiIncercate(latime: number): number[] {
  const pe = treapta(latime);
  const banda = BANDA[pe];
  const minim = banda.sus + banda.jos + CONTINUT_MINIM[pe];
  return [minim, minim + 120, minim + 260, minim + 400];
}

test("nicio siglă nu cade peste text, peste bară, peste alta sau în afara ecranului", () => {
  const toate = [...LATIMI_INGUST, ...LATIMI_LAT, ...LATIMI_LATURI];

  for (const latime of toate) {
    for (const inaltime of inaltimiIncercate(latime)) {
      const probleme = problemeDeAsezare(latime, inaltime);
      assert.deepEqual(
        probleme,
        [],
        `la ${latime}x${inaltime}: ${probleme.join(" · ")}`,
      );
    }
  }
});

test("fiecare treaptă arată câte sigle trebuie", () => {
  /* Sub `lg` sunt opt: patru sus, patru jos. Mai multe nu încap — la 320px,
     patru casete de 68 lasă 48px de joc în total pe un rând. */
  assert.equal(vizibile(390).length, 8);
  assert.equal(vizibile(1023).length, 8);
  /* De la `lg` benzile se îndesesc de la patru la șase. */
  assert.equal(vizibile(PRAG_LAT).length, 12);
  assert.equal(vizibile(1279).length, 12);
  /* De la `xl` se deschid și laturile. */
  assert.equal(vizibile(PRAG_LATURI).length, 16);
  assert.equal(vizibile(1920).length, 16);

  const susIngust = vizibile(390).filter((s) => s.ingust?.zona === "sus");
  const josIngust = vizibile(390).filter((s) => s.ingust?.zona === "jos");
  assert.equal(susIngust.length, 4);
  assert.equal(josIngust.length, 4);
});

test("o siglă are poziție îngustă exact dacă se arată pe telefon", () => {
  for (const sigla of SIGLE_PLUTITOARE) {
    const areIngust = sigla.ingust !== undefined;
    assert.equal(
      areIngust,
      sigla.deLa === undefined,
      `${sigla.cheie}: „apare de la ${sigla.deLa}" și poziția îngustă nu se potrivesc`,
    );
    assert.equal(locul(sigla, "lat") !== null, true, `${sigla.cheie} n-are poziție largă`);
  }
});

test("siglele foarte late nu plutesc: într-o casetă pătrată ar fi o zgârietură", () => {
  for (const sigla of SIGLE_PLUTITOARE) {
    const raport = PROVIDER_LOGOS[sigla.cheie].ratio;
    assert.ok(
      raport <= RAPORT_MAX_PLUTA,
      `${sigla.cheie} are raportul ${raport}, peste ${RAPORT_MAX_PLUTA}`,
    );
  }
});

test("cele opt sigle de pe telefon acoperă singure toate familiile mari", () => {
  const pePhone = new Set(vizibile(390).map((s) => s.cheie));
  /*
    Pe telefon se văd opt din șaisprezece, deci ele duc singure mesajul „se
    integrează cu tot ce-ți trebuie". Dacă toate opt ar fi curieri, pagina ar
    spune altceva decât spune titlul. Familiile astea patru sunt cele pe care le
    caută un magazin: cum trimit, cum încasez, cum facturez, cum vând mai mult.
  */
  const obligatorii = ["Curieri", "Plăți online", "Facturare", "Marketing și statistici"];

  for (const eticheta of obligatorii) {
    const grup = LOGO_GROUPS.find((g) => g.label === eticheta);
    assert.ok(grup, `grupul „${eticheta}" nu mai există în logos.ts`);
    assert.ok(
      grup.keys.some((k) => pePhone.has(k)),
      `pe telefon nu se vede nicio siglă din „${eticheta}"`,
    );
  }
});

test("spațierea hero-ului e chiar banda siglelor, nu un al doilea set de numere", () => {
  /*
    `HeroCadru` primește spațierea din `BANDA` prin `stiluriBanda()`. Proba de
    aici păzește socoteala din mijloc: de sus se scade bara, fiindcă secțiunea
    intră sub ea cu `-mt-18` și își pune cei 72px la loc cu `pt-18`.

    Dacă cineva mărește banda fără să lase spațierea să crească odată cu ea,
    textul urcă în bandă și siglele ajung peste el.
  */
  assert.ok(BANDA.ingust.sus > SPATIU_BARA);
  assert.ok(BANDA.lat.sus > SPATIU_BARA);
  /* Sub bară trebuie să rămână loc pentru o casetă întreagă, dusă la capătul
     plutirii. */
  const ingust = marimea(390);
  assert.ok(
    BANDA.ingust.sus - LIBER_SUB_BARA >= ingust + 2 * umflarea(ingust, CURSA.ingust),
  );
  assert.ok(
    BANDA.lat.sus - LIBER_SUB_BARA >= MARIME_LAT + 2 * umflarea(MARIME_LAT, CURSA.lat),
  );
  /* Iar banda de jos trebuie să încapă o casetă plus umbra ei. */
  assert.ok(BANDA.ingust.jos >= ingust + UMBRA_JOS);
  assert.ok(BANDA.lat.jos >= MARIME_LAT + UMBRA_JOS);
});

test("caseta se micșorează pe ecran îngust, nu se înghesuie", () => {
  /*
    Cu latura fixă, patru casete de 68px pe un ecran de 320 lasă 16px între
    vecine — mai puțin decât cursa plutirii, deci la un moment din tură chiar se
    ating. Măsurat, nu presupus: numerele de mai jos sunt exact ce dă `17vw`.
  */
  assert.ok(marimea(320) < 56);
  assert.ok(marimea(390) < 68);
  assert.equal(marimea(430), 68);
  assert.equal(marimea(1024), MARIME_LAT);
  /* Iar cursa e tăiată acolo unde casetele sunt mai apropiate. */
  assert.ok(CURSA.ingust < CURSA.lat);
});

test("controlul negativ: probele de așezare chiar pot să cadă", () => {
  /*
    Fără rândurile astea, toate probele de mai sus ar fi trecut și dacă
    `problemeDeAsezare` ar fi întors mereu lista goală. O probă de așezare care
    nu poate EȘUA nu păzește nimic.
  */
  const latime = 1440;
  const inaltime = 800;
  const mijloc = cutia({ x: 50, y: 0, zona: "mijloc" }, MARIME_LAT, latime, inaltime);

  const coridor = {
    stanga: (latime - 900) / 2,
    dreapta: (latime + 900) / 2,
    sus: BANDA.lat.sus,
    jos: inaltime - BANDA.lat.jos,
  };
  assert.equal(seIntersecteaza(mijloc, coridor), true);

  /* Și una lipită de marginea din dreapta iese din ecran. */
  const laMargine = cutia({ x: 100, y: 140, zona: "sus" }, MARIME_LAT, latime, inaltime);
  assert.ok(laMargine.dreapta > latime - MARGINE_UMBRA);

  /* Iar umflarea chiar mărește cutia: fără ea, plutirea n-ar fi verificată. */
  const repaus = cutia({ x: 50, y: 140, zona: "sus" }, MARIME_LAT, latime, inaltime);
  const plutita = cutia(
    { x: 50, y: 140, zona: "sus" },
    MARIME_LAT,
    latime,
    inaltime,
    umflarea(MARIME_LAT, CURSA.lat),
  );
  assert.ok(plutita.jos - repaus.jos >= CURSA.lat * 9);
});

test("eticheta pentru cititoarele de ecran numește chiar siglele desenate", () => {
  const eticheta = etichetaCampului();
  for (const sigla of SIGLE_PLUTITOARE) {
    assert.ok(
      eticheta.includes(PROVIDER_LOGOS[sigla.cheie].name),
      `${sigla.cheie} lipsește din eticheta câmpului`,
    );
  }
});
