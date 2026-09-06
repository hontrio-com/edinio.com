import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Publicarea chiar rezolva piesele — si nu duce costul comerciantului mai departe?
 *
 * ═══ ⚠ DE CE O PROBA PE SURSA ═══
 *
 * `publicaConfigurator` incepe cu `"use server"`, citeste din baza si scrie doua tabele: nu se
 * poate rula intr-o proba. Dar intrebarile la care raspundem aici sunt mici si tin de CE SCRIE
 * in fisier — si niciuna nu e vazuta de `tsc`, fiindca toate variantele gresite compileaza
 * perfect.
 *
 * ═══ CE PAZESTE, SI CE AR FI COSTAT ═══
 *
 *   1. Piesele se citesc, si citirea PICATA opreste publicarea. Mersa mai departe cu harta
 *      goala, versiunea ar fi plecat fara `pretBucata` si fara `produsId` — adica alegerea nu
 *      costa nimic si nu scade nimic — si ar fi ramas asa PE VECI: versiunile sunt imutabile.
 *
 *   2. `valideaza` primeste lista pieselor care exista. Fara ea, o piesa fantoma trecea de
 *      publicare si abia comenzile aratau, luni mai tarziu, ca nu s-a consumat nimic.
 *
 *   3. `compileaza` primeste harta. Fara ea, publicarea ar fi validat corect si tot ar fi scris
 *      o versiune goala — cea mai urata forma a defectului, fiindca totul pare in regula.
 *
 *   4. `cost_bucata` NU se citeste NICAIERI in actiuni. Ce se citeste ajunge in versiunea
 *      compilata, iar aceea pleaca intreaga in sursa paginii de produs: cat plateste
 *      comerciantul pe piesa la furnizor n-are ce cauta acolo.
 */

const FISIER = path.resolve(process.cwd(), "src/lib/actions/configurator.actions.ts");

/** ⚠ Terminatiile se normalizeaza: pe Windows git scrie CRLF, iar potrivirile pe rand cad tacut. */
function sursa(): string {
  return readFileSync(FISIER, "utf8").replace(/\r\n/g, "\n");
}

function corpulPublicarii(): string {
  const s = sursa();
  const start = s.indexOf("export async function publicaConfigurator(");
  assert.ok(start > 0, "nu am gasit publicaConfigurator");
  const urmator = s.indexOf("\nexport ", start + 10);
  const corp = s.slice(start, urmator > 0 ? urmator : s.length);
  // ⚠ Garda de marime: un cititor rupt ar fi intors cateva randuri, si toate potrivirile de mai
  // jos ar fi cazut pe gol — un zero fals arata exact ca un zero adevarat.
  assert.ok(corp.length > 2000, `am citit doar ${corp.length} caractere din publicaConfigurator`);
  return corp;
}

test("⚠ proba stie sa citeasca fisierul", () => {
  assert.ok(sursa().length > 5000);
  corpulPublicarii();
});

test("publicarea citeste piesele configuratorului", () => {
  const corp = corpulPublicarii();
  assert.match(corp, /componenteleCerute\(continut\.definitie\)/, "nu se afla ce piese cere ciorna");
  assert.match(corp, /\.from\("configurator_componente"\)/, "nu se citeste tabelul pieselor");
  assert.match(corp, /\.eq\("business_id", a\.magazin\.id\)/, "citirea nu e ingradita la magazin");
  assert.match(corp, /\.eq\("activa", true\)/, "se iau si piesele stinse");
});

test("⚠ o citire picata OPRESTE publicarea", () => {
  /*
   * ⚠ Mutant: `if (ePiese) { … }` sters, sau inlocuit cu un `logError` fara `return`. Publicarea
   * ar fi mers mai departe cu harta goala si ar fi inghetat o versiune IMUTABILA in care nicio
   * piesa nu costa si nicio piesa nu scade.
   */
  const corp = corpulPublicarii();
  const i = corp.indexOf("if (ePiese)");
  assert.ok(i > 0, "nu se verifica eroarea citirii pieselor");
  const ramura = corp.slice(i, i + 400);
  assert.match(ramura, /return \{ error:/, "eroarea de citire nu opreste publicarea");
});

test("⚠ piesele se citesc IN LOTURI, nu taiate la un prag", () => {
  /*
   * ⚠ `.in()` pleaca in ADRESA cererii: peste vreo sapte sute de id-uri PostgREST refuza cererea
   * intreaga. Un `.slice(0, 200)` ar fi fost si mai rau decat un refuz: piesele de peste prag
   * n-ar fi fost gasite, deci ar fi fost raportate ca FANTOME, iar comerciantul ar fi citit pe
   * ecran ca piese care exista in fata lui nu exista.
   */
  const corp = corpulPublicarii();
  assert.match(corp, /for \(let i = 0; i < cerute\.length; i \+= MAXIM_COMPONENTE_PE_LOT\)/,
    "citirea pieselor nu e in loturi");
  assert.equal(/\.in\("id", cerute\b/.test(corp), false, "se trimite lista intreaga intr-un `.in()`");
});

test("⚠ validarea primeste lista pieselor care CHIAR exista", () => {
  const corp = corpulPublicarii();
  const i = corp.indexOf("valideaza({");
  assert.ok(i > 0, "nu se cheama valideaza");
  const apel = corp.slice(i, corp.indexOf("});", i));
  assert.match(apel, /componenteCunoscute:/, "validarea nu poate refuza o piesa fantoma");
});

test("⚠ compilarea primeste harta pieselor", () => {
  /*
   * ⚠ Mutant: se lasa `compileaza(definitie, reguli, pretuire)`, cu trei argumente. Totul
   * compileaza, validarea trece, versiunea se scrie — si e goala. Cea mai urata forma a
   * defectului, fiindca nimic nu pare in neregula.
   */
  const corp = corpulPublicarii();
  assert.match(corp, /compileaza\(continut\.definitie, continut\.reguli, continut\.pretuire, componente\)/,
    "compilarea nu inghiata pretul si produsul piesei");
});

test("⚠ `cost_bucata` nu se citeste NICAIERI in actiunile configuratorului", () => {
  /*
   * ⚠ Ce ar fi costat: ce se citeste aici ajunge in `configurator_versiuni.compilat`, iar aceea
   * pleaca INTREAGA la pagina de produs, care e „use client" — deci in sursa HTML, vizibila
   * oricui. Cat plateste comerciantul pe piesa la furnizor ar fi fost public pe magazinul lui.
   *
   * Se cere pe TOT fisierul, nu doar pe publicare: o actiune viitoare care listeaza piesele in
   * panou are voie sa citeasca costul, dar atunci randul asta trebuie schimbat dinadins, cu
   * cineva care se uita la unde ajunge.
   */
  assert.equal(sursa().includes("cost_bucata"), false,
    "costul comerciantului nu are ce cauta in actiunile care compun versiunea servita");
});

test("⚠ INGHETAREA ia CHIAR randul piesei, nu valori scrise de mana", () => {
  /*
   * ⚠ Cea mai scumpa mutatie a fazei, si trecea verde: `pretBucata: 0` sau `produsId: null` scrise
   * aici fac fiecare piesa gratuita, sau opresc scaderea din stoc — si o fac IMUTABIL, in fiecare
   * versiune publicata de acum incolo. `tsc` nu clipeste (amandoua sunt tipuri bune), iar probele
   * de mai sus verifica de unde se CITESTE, nu ce se SCRIE.
   *
   * Se cere aici ca fiecare camp inghetat sa vina din randul citit, pe numele lui din baza.
   */
  const corp = corpulPublicarii();
  assert.match(
    corp,
    /produsId:\s*p\.product_id\s*\?\?\s*null/,
    "produsul piesei nu mai vine din rand: piesele n-ar mai scadea nimic din stoc",
  );
  assert.match(
    corp,
    /pretBucata:\s*Number\(p\.pret_bucata\)/,
    "pretul piesei nu mai vine din rand: fiecare piesa ar deveni gratuita, inghetat in versiune",
  );
  assert.match(
    corp,
    /nume:\s*p\.nume/,
    "numele piesei nu mai vine din rand: comanda n-ar mai spune ce s-a consumat",
  );
  // ⚠ Si niciun camp inghetat nu are voie sa fie un literal.
  /*
   * ⚠ GARDA PE MARCAJ. Fara ea, `indexOf` intoarce -1, `slice(-1, 399)` da SIR GOL, iar
   * verificarea negativa de mai jos trece pe gol — un zero fals care arata ca unul adevarat.
   * Celelalte cinci probe ale fisierului au garda; asta o pierduse.
   */
  const iMarcaj = corp.indexOf("componente.set(");
  assert.ok(iMarcaj > 0, "nu gasesc unde se compune harta pieselor; proba s-a rupt");
  const bloc = corp.slice(iMarcaj, iMarcaj + 400);
  assert.ok(
    !/:\s*(0|null|""|'')\s*,/.test(bloc.replace(/\?\?\s*null/g, "")),
    `un camp inghetat e scris de mana: ${bloc.slice(0, 200)}`,
  );
});
