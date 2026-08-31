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
  ordonate,
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

test("cele care merg azi vin înaintea celor anunțate, fără să se amestece rubricile", () => {
  const lista = ordonate(INTEGRARI);

  /* Nicio „în curând" înaintea unei active. */
  const primaAnuntata = lista.findIndex((i) => i.stare === "in-curand");
  assert.ok(primaAnuntata > 0);
  assert.ok(lista.slice(primaAnuntata).every((i) => i.stare === "in-curand"));

  /*
    Iar înăuntrul fiecărei grupe, ordinea pe rubrici rămâne cea din catalog —
    asta cere ca sortarea să fie STABILĂ. O sortare instabilă ar fi amestecat
    rubricile fără ca nimic să se plângă, iar pe pagină s-ar fi văzut ca o listă
    la întâmplare.
  */
  const rubriciDinCatalog = (stare: string) =>
    INTEGRARI.filter((i) => i.stare === stare).map((i) => i.categorie);
  const rubriciDinListă = (stare: string) =>
    lista.filter((i) => i.stare === stare).map((i) => i.categorie);
  assert.deepEqual(rubriciDinListă("activa"), rubriciDinCatalog("activa"));
  assert.deepEqual(rubriciDinListă("in-curand"), rubriciDinCatalog("in-curand"));

  /* Și nu pierde și nu inventează nimic. */
  assert.equal(lista.length, INTEGRARI.length);
});

test("numărătoarea de active și de anunțate e cea din panou", () => {
  assert.equal(NUMAR_ACTIVE + NUMAR_IN_CURAND, INTEGRARI.length);
  /*
    ⚠ NUMERELE ASTEA AU FOST GRESITE DOUAZECI DE ZILE, si nota de aici spunea
    chiar ce urma sa se intample: „daca se livreaza una, numarul de aici trebuie
    sa scada odata cu ea — altfel site-ul spune «In curand» despre ceva ce merge
    deja". S-au livrat NOUA: sapte curieri, Posta Romana si eMAG. Prin eMAG
    intrau deja comenzi in timp ce pagina de prezentare il anunta.

    ⚠ DE CE N-A PRINS-O NIMIC. Numerele se derivau din CATALOG, deci se schimbau
    ODATA cu greseala — un numar care se muta singur nu pazeste nimic. Iar proba
    de mai jos verifica doar PREZENTA („e in panou si lipseste de aici?"), nu
    starea: eMAG era in amandoua listele, deci trecea. De aceea exista acum si
    proba `starile din catalog sunt cele din panou`.
  */
  assert.equal(NUMAR_IN_CURAND, 25);
  assert.equal(NUMAR_ACTIVE, 40);
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

test("stările din catalog sunt cele din panou", () => {
  /*
    ⚠ PROBA DE DEASUPRA PAZESTE PREZENTA; ASTA PAZESTE STAREA.

    Si de aceea aceea n-a prins nimic douazeci de zile: ea intreaba „e in panou
    si lipseste de aici?". eMAG era in AMANDOUA listele, deci trecea — dar panoul
    il activa, iar site-ul il anunta ca fiind „in curand". Prezenta se potrivea;
    starea, nu.

    In panou, `id:` inseamna „se poate activa azi"; lipsa lui inseamna anuntata.

    ⚠ SE PAZESTE O SINGURA DIRECTIE, ANUME CEA CARE MINTE CLIENTUL: panoul
    activeaza, catalogul inca spune „in curand". Invers — catalog „activa", panou
    fara `id` — s-ar plange pe integrarile pe care ramura asta le are inainte, si
    care nu sunt o greseala. Aceeasi alegere ca la proba de deasupra, si din
    acelasi motiv scris acolo.

    ⚠ SE CITESTE PE RANDURI, fiindca in panou fiecare integrare sta pe un rand:
        { name: "FedEx", logo: "/integrations/fedex.svg", id: "fedex" },
    Am incercat intai un regex peste toata acolada. Rulat de mana pe acelasi
    fisier dadea 65 de potriviri; rulat aici, prin incarcatorul care dezbraca
    tipurile, dadea ZERO. N-am aflat de ce si n-am ghicit: tiparul de mai jos e
    chiar cel folosit cu succes de proba de deasupra.
  */
  const sursa = readFileSync(PANOU, "utf8");

  const activabileInPanou = new Set<string>();
  for (const rand of sursa.split("\n")) {
    const sigla = /logo:\s*"\/integrations\/([^"]+)"/.exec(rand);
    if (sigla && rand.includes("id:")) activabileInPanou.add(radacina(sigla[1]));
  }

  /* ⚠ Fara randul asta, o citire picata ar arata ca „nicio nepotrivire". */
  assert.ok(
    activabileInPanou.size > 0,
    "n-am citit nicio integrare activabilă din panou — s-a mutat fișierul sau i s-a schimbat forma?",
  );

  const mint: string[] = [];
  for (const i of INTEGRARI) {
    if (i.stare !== "in-curand") continue;
    const sigla = radacina(PROVIDER_LOGOS[i.cheie].src.split("/").pop() ?? "");
    if (activabileInPanou.has(sigla)) mint.push(i.cheie);
  }

  assert.deepEqual(
    mint,
    [],
    `site-ul spune „În curând" despre integrări pe care panoul le activează: ${mint.join(", ")}`,
  );
});

/** `sameday-mic.webp` și `sameday.webp` sunt aceeași marcă. */
function radacina(numeFisier: string): string {
  return numeFisier.replace(/\.[a-z0-9]+$/i, "").replace(/-mic$/, "");
}
