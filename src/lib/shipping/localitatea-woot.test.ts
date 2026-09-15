import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { potrivesteJudetulWoot, potrivesteLocalitateaWoot } from "@/lib/shipping/localitatea-woot";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * BUCURESTIUL NU SE COMPLETA SINGUR                              (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ RECLAMATIE DE LA UN COMERCIANT, si e adevarata: la o comanda din Bucuresti fereastra de
 * AWB Woot nu ii completa automat nimic, deci alegea judetul si sectorul de mana de fiecare
 * data. Masurat in productie: magazinul care scrie „Municipiul Bucuresti" are 23 de AWB-uri
 * Woot pe 25 de comenzi bucurestene, deci a facut asta de 23 de ori.
 *
 * ⚠ FIXTURILE DE MAI JOS SUNT ADUSE DE LA EI, nu scrise din memorie: judetele din
 * `GET /general/counties?country_id=189` si localitatile din
 * `GET /general/cities?county_id=…&country_id=189`, cu id-urile lor adevarate. Capitala are
 * acolo EXACT sase localitati, toate „Sectorul N", si niciuna „Bucuresti".
 *
 * ⚠ MUTANTUL SE PUNE PE APELANT: ultimele probe cer ca AMANDOUA drumurile (fereastra de AWB
 * si cotarea din checkout) sa treaca prin regula asta. Reparata doar intr-un loc, celalalt ar
 * fi ramas cu defectul, si asta chiar s-a intamplat o data aici: fereastra isi avea copia ei.
 */

/** Judete Woot, cu id-urile lor reale. */
const JUDETE = [
  { id: 29, name: "Bacau" },
  { id: 42, name: "Bucuresti" },
  { id: 17, name: "Cluj" },
  { id: 39, name: "Constanta" },
  /* ⚠ Mures INAINTEA Maramuresului, dinadins: ordinea listei lor nu e o garantie, iar o
     potrivire prin incluziune de subsir ar da alt raspuns dupa cum sunt asezate. */
  { id: 27, name: "Mures" },
  { id: 20, name: "Maramures" },
  { id: 13, name: "Timis" },
];

/** Tot judetul capitalei, asa cum il dau ei: sase localitati, niciuna „Bucuresti". */
const SECTOARE = [
  { id: 1, name: "Sectorul 1" },
  { id: 2, name: "Sectorul 2" },
  { id: 3, name: "Sectorul 3" },
  { id: 4, name: "Sectorul 4" },
  { id: 5, name: "Sectorul 5" },
  { id: 6, name: "Sectorul 6" },
];

/** O felie din cele 435 de localitati ale Clujului, cu numele si id-urile lor reale. */
const CLUJ = [
  { id: 66, name: "Aghiresu" },
  { id: 67, name: "Aghiresu-Fabrici (Aghiresu)" },
  { id: 302, name: "Arghisu (Aghiresu)" },
  { id: 474, name: "Bagara (Aghiresu)" },
  { id: 2976, name: "Cluj-Napoca" },
  { id: 3842, name: "Dancu (Aghiresu)" },
  { id: 4224, name: "Doroltu (Aghiresu)" },
];

/** Singura localitate din judetul Bacau care incepe cu „Bacau", verificat la ei. */
const BACAU = [{ id: 424, name: "Bacau" }];

/* ═══════════════════════════════════════════════════════════════════════════
   1. JUDETUL
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠⚠ CAZUL RECLAMAT: „Municipiul Bucuresti” gaseste judetul capitalei", () => {
  /*
   * ⚠ Asa scrie chiar CHECKOUTUL NOSTRU, la 25 de comenzi din productie, 23 cu AWB Woot.
   * Potrivirea veche cerea egalitate sau prefix, iar „municipiul bucuresti" nu e niciuna
   * fata de „bucuresti". Judetul ramanea neales, deci lista de orase nici nu se cerea, deci
   * fereastra ramanea INTREAGA goala. Asta a vazut comerciantul.
   */
  assert.equal(potrivesteJudetulWoot(JUDETE, "Municipiul Bucuresti")?.id, 42);
});

test("si orice alta scriere a capitalei, cu sau fara diacritice", () => {
  for (const scris of ["Bucuresti", "București", "BUCURESTI", "  bucuresti  ", "Bucureşti"]) {
    assert.equal(potrivesteJudetulWoot(JUDETE, scris)?.id, 42, `„${scris}” nu a gasit capitala`);
  }
  /* Sectorul scris in campul de JUDET: tot capitala e. */
  assert.equal(potrivesteJudetulWoot(JUDETE, "Bucuresti Sector 3")?.id, 42);
});

test("si prefixul „Judetul” cade, cu diacritice sau fara", () => {
  assert.equal(potrivesteJudetulWoot(JUDETE, "Judetul Cluj")?.id, 17);
  assert.equal(potrivesteJudetulWoot(JUDETE, "Județul Cluj")?.id, 17);
  assert.equal(potrivesteJudetulWoot(JUDETE, "Constanța")?.id, 39);
  assert.equal(potrivesteJudetulWoot(JUDETE, "Timiș")?.id, 13);
});

test("⚠⚠ si Maramuresul NU ajunge in Mures, desi unul e subsir in celalalt", () => {
  /*
   * ⚠ Singura pereche din cele 42 de judete in care un nume se cuprinde in celalalt.
   * O potrivire prin incluziune de subsir, cum avea copia din checkout, trimite coletul la
   * 300 de kilometri fara sa se planga nimic. Lectie platita intai la eColet.
   */
  assert.equal(potrivesteJudetulWoot(JUDETE, "Maramures")?.id, 20);
  assert.equal(potrivesteJudetulWoot(JUDETE, "Maramureș")?.id, 20);
  assert.equal(potrivesteJudetulWoot(JUDETE, "Mures")?.id, 27);

  /*
   * ⚠ ACESTA E RANDUL CARE CHIAR PRINDE MUTANTUL. Cele de deasupra trec si printr-o
   * potrivire lata, fiindca egalitatea e incercata prima. Ce nu trece printr-o regula lata e
   * un text care doar CUPRINDE numele unui judet: cu incluziune de subsir, „Muresului" ar
   * aduce judetul Mures si comanda ar pleca acolo.
   */
  assert.equal(potrivesteJudetulWoot(JUDETE, "Strada Muresului 12"), undefined);
  assert.equal(potrivesteJudetulWoot(JUDETE, "Clujana"), undefined);
});

test("iar ce nu e judet nu potriveste nimic", () => {
  assert.equal(potrivesteJudetulWoot(JUDETE, ""), undefined);
  assert.equal(potrivesteJudetulWoot(JUDETE, "   "), undefined);
  /* „***" chiar sta pe 8 comenzi din productie, pus de un marketplace. */
  assert.equal(potrivesteJudetulWoot(JUDETE, "***"), undefined);
  assert.equal(potrivesteJudetulWoot(JUDETE, "Vaslui"), undefined);
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. SECTORUL
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠⚠ „Sector 5” gaseste „Sectorul 5”, oricum si-ar scrie lumea sectorul", () => {
  /*
   * ⚠ Toate formele de mai jos sunt luate din comenzi ADEVARATE. Niciuna nu se potrivea
   * inainte: dupa „sector" la ei urmeaza „u", la noi spatiul, deci nici egalitate, nici
   * prefix, in niciun sens.
   */
  const forme: Array<[string, number]> = [
    ["Sector 5", 5],
    ["Sectorul 3", 3],
    ["Sec 5", 5],
    ["bucuresti sector 3", 3],
    ["SECTOR 6", 6],
    ["sector3", 3],
    ["Sec. 4", 4],
  ];
  for (const [scris, asteptat] of forme) {
    assert.equal(
      potrivesteLocalitateaWoot(SECTOARE, scris)?.id, asteptat,
      `„${scris}” nu a ajuns la Sectorul ${asteptat}`,
    );
  }
});

test("⚠ si sectorul se citeste si din linia de adresa, cand orasul nu-l spune", () => {
  /* „Constantin Ghercu nr 1 sector 6" e adresa unei comenzi reale cu AWB Woot. */
  assert.equal(
    potrivesteLocalitateaWoot(SECTOARE, "Bucuresti", "Constantin Ghercu nr 1 sector 6")?.id, 6,
  );
  assert.equal(
    potrivesteLocalitateaWoot(SECTOARE, "București", "Str. Dristorului 91, bl. 3, sc. 2, sector 3")?.id, 3,
  );
});

test("⚠⚠ dar „Bucuresti” simplu NU primeste un sector ghicit", () => {
  /*
   * ⚠ CEA MAI IMPORTANTA DIN FISIER. Sectorul nu se poate deduce dintr-un nume de oras, iar
   * un sector inventat ar trimite coletul in alt capat al orasului, cu selectul aratand
   * completat, deci nimeni nu l-ar mai verifica. Mai bine gol si ales de om.
   */
  for (const scris of ["Bucuresti", "București", "BUCURESTI", "Bucharest"]) {
    assert.equal(
      potrivesteLocalitateaWoot(SECTOARE, scris), undefined,
      `„${scris}” a primit un sector pe care nu l-a scris nimeni`,
    );
  }
  /* Nici din adresa, cand nici ea nu-l spune. */
  assert.equal(potrivesteLocalitateaWoot(SECTOARE, "Bucuresti", "Str. Moinesti 63"), undefined);
  /* Si nici un sector care nu exista. */
  assert.equal(potrivesteLocalitateaWoot(SECTOARE, "Sector 7"), undefined);
  assert.equal(potrivesteLocalitateaWoot(SECTOARE, "Sector 0"), undefined);
});

test("⚠ iar regula sectorului nu se poate aplica in alt judet", () => {
  /* Lista Clujului n-are niciun sector, deci cautarea trece mai departe si nu gaseste nimic
     in loc sa apuce prima localitate din lista. */
  assert.equal(potrivesteLocalitateaWoot(CLUJ, "Sectorul 3"), undefined);
  assert.equal(potrivesteLocalitateaWoot(CLUJ, "Cluj-Napoca", "adresa cu sector 3 in ea")?.id, 2976);
});

test("⚠ si un oras adevarat care incepe cu „Sec” nu e citit drept sector", () => {
  /* „Cristuru Secuiesc" chiar sta pe comenzi din productie. Citit ca sector, ar fi plecat
     in Bucuresti. */
  const HARGHITA = [{ id: 5555, name: "Cristuru Secuiesc" }];
  assert.equal(potrivesteLocalitateaWoot(HARGHITA, "Cristuru Secuiesc")?.id, 5555);
  assert.equal(potrivesteLocalitateaWoot(SECTOARE, "Cristuru Secuiesc"), undefined);
});

/* ═══════════════════════════════════════════════════════════════════════════
   3. RESTUL TARII
   ═══════════════════════════════════════════════════════════════════════════ */

test("potrivirea exacta trece inaintea oricarei alteia", () => {
  assert.equal(potrivesteLocalitateaWoot(BACAU, "Bacau")?.id, 424);
  assert.equal(potrivesteLocalitateaWoot(CLUJ, "Cluj-Napoca")?.id, 2976);
  /* Cratima si spatiul duc la aceeasi cheie. */
  assert.equal(potrivesteLocalitateaWoot(CLUJ, "Cluj Napoca")?.id, 2976);
  /* „Aghiresu" exista ca atare, desi unsprezece sate il poarta in paranteza. */
  assert.equal(potrivesteLocalitateaWoot(CLUJ, "Aghiresu")?.id, 66);
});

test("⚠⚠ „Aghiresu-Fabrici” nu mai cade pe satul vecin, mai scurt", () => {
  /*
   * ⚠ GASIT IN NOMENCLATORUL LOR ADEVARAT, nu inchipuit: „Aghiresu" (66) si
   * „Aghiresu-Fabrici (Aghiresu)" (67) stau amandoua in Cluj. Cautand cu o singura trecere
   * de prefix, numele mai SCURT se potriveste si el, fiindca el e inceputul cautarii; forma
   * veche lua prima gasita din lista, adica satul GRESIT, si il scria in select fara sa
   * spuna nimanui.
   */
  assert.equal(potrivesteLocalitateaWoot(CLUJ, "Aghiresu-Fabrici")?.id, 67);
  assert.equal(potrivesteLocalitateaWoot(CLUJ, "Aghiresu Fabrici")?.id, 67);
});

test("⚠ iar cand cautarea e inceputul mai multora, nu se alege NICIUNA", () => {
  /* „Aghires" e inceputul a doua localitati: 66 si 67. Un calculator care alege una din
     ele o alege din intamplare, deci alege omul. */
  assert.equal(potrivesteLocalitateaWoot(CLUJ, "Aghires"), undefined);
  assert.equal(potrivesteLocalitateaWoot(CLUJ, ""), undefined);
  assert.equal(potrivesteLocalitateaWoot(CLUJ, "Timisoara"), undefined);
});

/* ═══════════════════════════════════════════════════════════════════════════
   4. ⚠ AMANDOUA DRUMURILE TREC PE AICI
   ═══════════════════════════════════════════════════════════════════════════

   Regula de mai sus nu apara nimic daca un apelant si-o tine pe a lui. Exact asa a stat
   defectul asta in picioare: fereastra de AWB avea propria copie, iar cotarea din checkout
   inca una. Probele de aici cad daca oricare dintre ele se intoarce la copia lui.

   ⚠ Comentariile se taie inainte de cautare: fisierele isi explica pe larg propria regula,
   iar textul explicatiei ar face plasa sa treaca degeaba. */

const RAD = process.cwd();

function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const MODAL = "src/components/dashboard/WootAwbModal.tsx";
const COTARE = "src/lib/actions/shipping.actions.ts";

test("⚠⚠ fereastra de AWB nu mai are potrivirea ei", () => {
  const s = sursa(MODAL);

  assert.match(
    s, /from "@\/lib\/shipping\/localitatea-woot"/,
    "fereastra nu mai ia regula din locul comun",
  );
  assert.doesNotMatch(
    s, /function potrivesteLocalitate\b/,
    "fereastra si-a facut la loc propria potrivire: capitala ar cadea iar numai aici",
  );
  assert.match(
    s, /potrivesteJudetulWoot\(data, addr\.county/,
    "judetul comenzii nu mai trece prin regula comuna",
  );

  /*
   * ⚠ SI AL TREILEA ARGUMENT E CERUT ANUME. Fara linia de adresa, sectorul scris doar acolo
   * („Constantin Ghercu nr 1 sector 6") n-ar mai fi citit de nimeni, iar proba de mai sus ar
   * ramane verde degeaba: ea probeaza regula, nu cablarea ferestrei.
   */
  assert.match(
    s, /potrivesteLocalitateaWoot\(data, addr\.city \?\? "", receiverAddress\)/,
    "fereastra nu mai da linia de adresa, deci sectorul scris doar in ea se pierde",
  );
});

test("⚠⚠ si cotarea din checkout trece prin aceeasi regula", () => {
  const s = sursa(COTARE);

  assert.doesNotMatch(
    s, /matchByName\s*\(/,
    "cotarea si-a luat inapoi potrivirea veche, care nu gasea niciun sector",
  );
  assert.match(
    s, /potrivesteJudetulWoot\(counties, destination\.county\)/,
    "judetul destinatarului nu mai trece prin regula comuna",
  );
  assert.match(
    s, /potrivesteLocalitateaWoot\(cities, destination\.city\)/,
    "localitatea destinatarului nu mai trece prin regula comuna",
  );
});
