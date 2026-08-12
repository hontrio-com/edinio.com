import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATEGORII,
  INTEGRARI,
  NUMAR_ACTIVE,
  NUMAR_IN_CURAND,
  faraDiacritice,
  numarPeCategorie,
  numele,
  potrivire,
  textDeCautare,
} from "./integrari-catalog";
import { PROVIDER_LOGOS, logoSize } from "./logos";

const AICI = dirname(fileURLToPath(import.meta.url));
const PANOU = join(AICI, "..", "..", "app", "(dashboard)", "dashboard", "features", "page.tsx");

test("fiecare integrare are o siglă adevărată și o rubrică știută", () => {
  const rubrici = new Set(CATEGORII.map((c) => c.id));
  const vazute = new Set<string>();

  for (const integrare of INTEGRARI) {
    assert.ok(
      integrare.cheie in PROVIDER_LOGOS,
      `${integrare.cheie} nu există în biblioteca de sigle`,
    );
    assert.ok(rubrici.has(integrare.categorie), `${integrare.cheie}: rubrică necunoscută`);
    assert.equal(vazute.has(integrare.cheie), false, `${integrare.cheie} apare de două ori`);
    vazute.add(integrare.cheie);
  }
});

test("nicio rubrică nu rămâne goală", () => {
  const numar = numarPeCategorie();
  for (const c of CATEGORII) {
    assert.ok(numar[c.id] > 0, `rubrica „${c.eticheta}" n-are nicio integrare`);
  }
});

test("descrierile sunt o propoziție, nu un paragraf", () => {
  for (const integrare of INTEGRARI) {
    const d = integrare.descriere;
    assert.ok(d.length >= 30, `${integrare.cheie}: descriere prea scurtă`);
    /*
      Peste ~110 semne descrierea trece de patru rânduri pe un card de 280px si
      cardurile din acelasi rand nu mai au aceeasi inaltime. Masurat pe grila de
      trei coloane, la 13px.
    */
    assert.ok(d.length <= 110, `${integrare.cheie}: ${d.length} semne, prea lungă`);
    assert.ok(d.endsWith("."), `${integrare.cheie}: descrierea nu se termină cu punct`);
    /*
      Diacritice peste tot in textele de fatada: e o regula a site-ului, si e
      usor de scapat, fiind saizeci si cinci de texte scrise pe rand.

      ⚠ Lista de mai jos are DOAR cuvinte care nu exista in romana fara semne.
      Prima forma continea si „comanda", „facturi", „magazin" — toate trei sunt
      scrieri CORECTE („comanda e platita" e articulat), deci proba cadea pe un
      text bun. O regula care da alarme false pe text corect se scoate din drum
      dupa a doua oara si nu mai pazeste nimic.

      Nu e o dovada, e o plasa: prinde scaparile obisnuite, nu orice greseala.
    */
    assert.ok(
      !/\b(plati|platit|platesti|pana|cand|dupa|catre|inainte|tara|primesti)\b/.test(d),
      `${integrare.cheie}: pare scrisă fără diacritice — „${d}"`,
    );
  }
});

test("descrierile nu se laudă: fără superlative nesusținute", () => {
  /*
    Publicitate comparativa, reglementata: fiecare afirmatie trebuie sa fie
    verificabila. „Cel mai bun procesator" nu e. Singura exceptie ingaduita e
    eMAG, unde marimea nu e contestata de nimeni pe piata din Romania.
  */
  const exceptii = new Set(["emag"]);
  for (const integrare of INTEGRARI) {
    if (exceptii.has(integrare.cheie)) continue;
    const d = faraDiacritice(integrare.descriere);
    assert.ok(
      !/\bcel mai\b|\bcea mai\b|\bcele mai\b|\bnr\.? ?1\b|\blider\b/.test(d),
      `${integrare.cheie}: superlativ nesusținut — „${integrare.descriere}"`,
    );
  }
});

test("căutarea găsește și fără diacritice, și după rubrică", () => {
  assert.equal(faraDiacritice("Plăți online"), "plati online");
  assert.equal(faraDiacritice("Poșta Română"), "posta romana");
  /* ⚠ Se taie DOAR semnele combinatorii. Varianta lacomă (tot ce nu e ASCII) ar
     mânca și cifrele scrise altfel, si a costat deja o data la cautarea din
     magazine. */
  assert.equal(faraDiacritice("Cel.ro 2024"), "cel.ro 2024");

  const fan = INTEGRARI.find((i) => i.cheie === "fanCourier");
  assert.ok(fan);
  /* Cine scrie „curier" se așteaptă să vadă toți curierii, chiar dacă niciunul
     n-are cuvântul în nume. */
  assert.ok(textDeCautare(fan).includes("curieri"));
  assert.ok(textDeCautare(fan).includes("fan courier"));

  const posta = INTEGRARI.find((i) => i.cheie === "postaRomana");
  assert.ok(posta);
  assert.ok(textDeCautare(posta).includes("posta romana"));
});

test("se potrivesc CUVINTELE, nu fraza", () => {
  /*
    ⚠ Defectul a ieșit din chiar exemplul scris în bara de căutare: „plăți în
    rate" întorcea ZERO. Cuvintele există toate — „plăți" e rubrica, „rate" e în
    descrierea lui Netopia și a lui TBI — dar nu una lângă alta, în ordinea aia,
    în același text. Un om nu scrie un citat, scrie cuvintele care îi vin.
  */
  const gaseste = (q: string) => INTEGRARI.filter((i) => potrivire(i, q)).map((i) => i.cheie);

  assert.ok(gaseste("plăți în rate").includes("netopia"));
  assert.ok(gaseste("plati in rate").includes("tbi"));
  /* Ordinea cuvintelor nu contează. */
  assert.deepEqual(gaseste("rate plati").sort(), gaseste("plati rate").sort());

  /* Un cuvânt care chiar nu există nu găsește nimic, oricâte altele ar fi bune. */
  assert.deepEqual(gaseste("plati qwerty"), []);

  /* Rubrica trage după ea toată familia. */
  assert.equal(gaseste("curieri").length, 17);
  /* Căutarea goală nu filtrează nimic. */
  assert.equal(gaseste("   ").length, INTEGRARI.length);
  /* Iar exemplele din placeholder trebuie să funcționeze toate trei. */
  for (const exemplu of ["Sameday", "facturare", "plăți în rate"]) {
    assert.ok(gaseste(exemplu).length > 0, `„${exemplu}" din bara de căutare nu găsește nimic`);
  }
});

test("numărătoarea de active și de anunțate e cea din panou", () => {
  assert.equal(NUMAR_ACTIVE + NUMAR_IN_CURAND, INTEGRARI.length);
  /* La 2026-08-11 panoul avea 34 anuntate (comit `a4a015c` pe `main`). Daca se
     livreaza una, numarul de aici trebuie sa scada odata cu ea — altfel site-ul
     spune „In curand" despre ceva ce merge deja. */
  assert.equal(NUMAR_IN_CURAND, 34);
  assert.equal(NUMAR_ACTIVE, 31);
});

test("siglele intră în locașul cardului fără să iasă mâzgălituri", () => {
  /*
    Egalizarea e pe SUPRAFATA, deci o sigla foarte lata iese scunda. Pana la un
    punct e in regula — asa arata un wordmark. Sub 11px insa nu se mai citeste
    nimic, iar reparatia nu e alt numar, e alt FISIER: semnul patrat al marcii in
    loc de wordmark. Proba spune care sunt.
  */
  const ARIE = 1200;
  const LATIME = 120;
  const mici: string[] = [];
  for (const integrare of INTEGRARI) {
    const marime = logoSize(PROVIDER_LOGOS[integrare.cheie], ARIE, LATIME);
    const inaltimeReala = Math.min(
      marime.height,
      marime.maxWidth / PROVIDER_LOGOS[integrare.cheie].ratio,
    );
    if (inaltimeReala < 11) mici.push(`${numele(integrare)} ${inaltimeReala.toFixed(1)}px`);
  }
  assert.deepEqual(mici, [], `sigle prea scunde pe card: ${mici.join(", ")}`);
});

test("catalogul nu rămâne în urma panoului", () => {
  /*
    Panoul e sursa: acolo `id` inseamna „se poate activa azi" si `soon` inseamna
    „anuntata". Aici e o A DOUA lista a aceluiasi lucru, iar a doua integrare
    livrata le desparte fara sa se planga nimic.

    Proba intreaba chiar fisierul panoului. Potrivirea se face pe NUMELE
    FISIERULUI de sigla, nu pe numele afisat: acolo scrie „Fan Courier", aici
    „FAN Courier", iar sufixul `-mic` deosebeste doar copia taiata a aceleiasi
    marci.

    ⚠ Pazeste o singura directie — ce e in panou si lipseste de aici. Invers nu
    se poate: ramura asta are un `page.tsx` mai vechi decat `main`, deci aici
    sunt dinadins mai multe.
  */
  const sursa = readFileSync(PANOU, "utf8");
  const alePanoului = new Set(
    [...sursa.matchAll(/logo:\s*"\/integrations\/([^"]+)"/g)].map((m) => radacina(m[1])),
  );
  const aleNoastre = new Set(
    INTEGRARI.map((i) => radacina(PROVIDER_LOGOS[i.cheie].src.split("/").pop() ?? "")),
  );

  const lipsa = [...alePanoului].filter((r) => !aleNoastre.has(r));
  assert.deepEqual(
    lipsa,
    [],
    `panoul are integrări care lipsesc din catalogul site-ului: ${lipsa.join(", ")}`,
  );
});

/** `sameday-mic.webp` și `sameday.webp` sunt aceeași marcă. */
function radacina(numeFisier: string): string {
  return numeFisier.replace(/\.[a-z0-9]+$/i, "").replace(/-mic$/, "");
}
