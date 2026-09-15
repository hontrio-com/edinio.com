import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COTA CARGUS DESCRIE EXPEDIEREA CARE CHIAR PLEACA          (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ CE S-A INCHIS. Ramura Cargus din `getShippingOptions` cerea UN singur pret si il punea
 * pe amandoua optiunile: livrare la adresa si Ship & Go. Dar livrarea in punct pleaca pe
 * serviciul 38 (PUDO Delivery), care are tariful LUI, iar cota se facea pe serviciul ales
 * dupa greutate (34/35/50).
 *
 * Deci aceeasi comanda cota serviciul 34 si emitea serviciul 38: cumparatorul platea un
 * transport, iar comerciantului i se factura altul. Diferenta o ducea el, si n-avea de unde
 * s-o vada: nimic nu da eroare cand doua preturi diferite sunt amandoua valide.
 *
 * ⚠ DE CE PROBA CITESTE SURSA. Regula e o CABLARE: „fiecare optiune isi cere pretul ei".
 * Ramura nu se poate rula fara sesiune, baza si furnizor. Mutantul se pune pe COD: punand la
 * loc un singur apel pentru amandoua optiunile, probele de mai jos cad.
 */

const RAD = process.cwd();
const SURSA = readFileSync(path.join(RAD, "src/lib/actions/shipping.actions.ts"), "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

/** Ramura Cargus din `getShippingOptions`, taiata pe acolade potrivite. */
function ramuraCargus(): string {
  const start = SURSA.indexOf('courierId === "cargus"');
  assert.notEqual(start, -1, "nu s-a gasit ramura Cargus din getShippingOptions");
  const prima = SURSA.indexOf("{", start);
  let adancime = 0;
  for (let i = prima; i < SURSA.length; i++) {
    if (SURSA[i] === "{") adancime++;
    else if (SURSA[i] === "}") {
      adancime--;
      if (adancime === 0) return SURSA.slice(prima, i + 1);
    }
  }
  assert.fail("acoladele ramurii Cargus nu se inchid");
}

test("⚠ ramura chiar se gaseste si chiar are continut", () => {
  const r = ramuraCargus();
  assert.ok(r.length > 600, `ramura Cargus are doar ${r.length} caractere`);
  assert.ok(r.includes("calculateCargusPrice"), "ramura trebuie sa coteze prin Cargus");
});

test("⚠⚠ Ship & Go isi cere PRETUL LUI, pe serviciul lui", () => {
  const r = ramuraCargus();
  assert.match(r, /pudo: true,/, "cotarea pentru punct trebuie sa ceara serviciul de punct");
  assert.equal(
    (r.match(/calculateCargusPrice\(/g) ?? []).length, 2,
    "trebuie DOUA cotari: una la adresa, una in punct",
  );
});

test("⚠⚠ un singur pret nu mai ajunge pe amandoua optiunile", () => {
  /* `pushBoth` era chiar defectul: o functie care punea acelasi numar pe doua servicii. */
  const r = ramuraCargus();
  assert.ok(!r.includes("pushBoth"), "`pushBoth` a fost chiar defectul");
  assert.ok(r.includes("laAdresa(") && r.includes("laPunct("), "cele doua optiuni se pun separat");
});

test("⚠ o cotare picata NU sterge optiunea, cade pe tariful fix al zonei", () => {
  /*
   * Plasa care apara reparatia de exces: daca a doua cerere pica si optiunea ar disparea, un
   * magazin cu Cargus ca singura zona ar ramane fara livrare in punct fara niciun mesaj.
   * Exact fundatura platita la FAN.
   */
  const r = ramuraCargus();
  assert.equal((r.match(/\.catch\(/g) ?? []).length, 2, "fiecare cotare are caderea ei");
  assert.equal((r.match(/zone\.price/g) ?? []).length >= 4, true, "amandoua cad pe tariful zonei");
});

test("⚠ fara API nu se ofera punct: nu se pot alege puncte fara nomenclatorul lor", () => {
  const r = ramuraCargus();
  assert.match(r, /if \(hasApi\) laPunct\(zone\.price\);/,
    "pe ramura fara cotare vie, punctul se ofera doar cu API");
});

test("⚠ si emiterea foloseste ACELASI serviciu ca si cota", () => {
  /*
   * Jumatatea care inchide bucla. Daca emiterea si-ar alege alt serviciu, paritatea reparata
   * aici s-ar rupe tacut la celalalt capat.
   */
  const client = readFileSync(path.join(RAD, "src/lib/cargus.ts"), "utf8");
  assert.match(client, /const service = input\.pudoPointId \? \{ id: 38, name: "Ship & Go" \} : getCargusServiceId\(totalWeight\);/,
    "emiterea alege 38 pentru punct");
  assert.match(client, /const service = input\.pudo\s*\n?\s*\? \{ id: 38, name: "Ship & Go" \}/,
    "si cotarea alege tot 38 pentru punct");
});
