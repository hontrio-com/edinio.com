import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { codulAwbCargus } from "./raspunsul-awb-cargus";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * „[object Object]" NU E UN NUMAR DE AWB                        (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `createCargusAwb` scria `String(barCode ?? "").trim()`, cu paza doar pe sirul gol si pe
 * „null". Un obiect trecea, si se scria pe comanda ca numar de expediere. De acolo mai
 * departe eticheta se cere pe el, urmarirea il intreaba, anularea il trimite la Cargus: nimic
 * nu mai da eroare, si nimeni nu afla pana nu suna clientul.
 *
 * ⚠ Nu e o temere teoretica: modulul lor OFICIAL de WooCommerce 1.6.0 trateaza raspunsul ca
 * SIR (cod) sau ca TABLOU (eroare). Deci obiectul chiar vine, pe HTTP 200.
 */

test("codul de bare din documentatia LOR trece, si ca sir si ca numar", () => {
  /* Exemplele sunt chiar din PDF-ul lor (`804523201`, `804713464`). */
  assert.deepEqual(codulAwbCargus("804523201"), { fel: "cod", cod: "804523201" });
  assert.deepEqual(codulAwbCargus(804713464), { fel: "cod", cod: "804713464" });
  assert.deepEqual(codulAwbCargus("  804737910  "), { fel: "cod", cod: "804737910" });
});

test("⚠⚠ un obiect NU mai devine „[object Object]”", () => {
  const v = codulAwbCargus({});
  assert.notEqual(v.fel, "cod");
  assert.ok(!JSON.stringify(v).includes("[object Object]"));
});

test("⚠ forma de eroare pe care o citeste chiar modulul lor iese ca EROARE, cu motivul ei", () => {
  /* `{ status: 400, command: "..." }` e prima forma pe care o cerceteaza `is_array`-ul lor. */
  assert.deepEqual(
    codulAwbCargus({ status: 400, command: "Localitatea nu a fost gasita" }),
    { fel: "eroare", mesaj: "Localitatea nu a fost gasita" },
  );
  /* `{ Error: "..." }`, pe fiecare element al listei. */
  assert.deepEqual(
    codulAwbCargus([{ Error: "Greutatea depaseste serviciul ales" }]),
    { fel: "eroare", mesaj: "Greutatea depaseste serviciul ales" },
  );
  /* Lista de siruri, forma a treia din modulul lor. */
  assert.deepEqual(
    codulAwbCargus(["Camp obligatoriu lipsa", "CodPostal invalid"]),
    { fel: "eroare", mesaj: "Camp obligatoriu lipsa CodPostal invalid" },
  );
});

test("⚠ forma documentata a succesului pe `WithgetAwb` e tot un COD, nu o eroare", () => {
  /* `Awbs/WithgetAwb` intoarce `{ BarCode, ReturnCode }`. Daca vreodata se trece pe ea, codul
     trebuie recunoscut, nu confundat cu un obiect de eroare. */
  assert.deepEqual(
    codulAwbCargus({ BarCode: "804523201", ReturnCode: "" }),
    { fel: "cod", cod: "804523201" },
  );
});

test("⚠⚠ „eroare” si „necunoscut” NU sunt acelasi lucru, si deosebirea costa bani", () => {
  /*
   * La eroare stim ca expedierea nu s-a facut, deci slotul se poate elibera. La necunoscut NU
   * stim, si atunci un colet care POATE a plecat nu are voie sa fie reincercat de la sine.
   */
  assert.equal(codulAwbCargus(null).fel, "necunoscut");
  assert.equal(codulAwbCargus(undefined).fel, "necunoscut");
  assert.equal(codulAwbCargus("").fel, "necunoscut");
  assert.equal(codulAwbCargus(true).fel, "necunoscut");
  assert.equal(codulAwbCargus({ ceva: 1 }).fel, "necunoscut");
  /* Iar un text limpede de-al lor E eroare, nu necunoscut. */
  assert.equal(codulAwbCargus("Failed to authenticate!").fel, "eroare");
});

test("gunoaiele iesite din String() nu trec drept coduri", () => {
  for (const g of ["null", "undefined", "NaN", "true", "false", "[object Object]"]) {
    assert.notEqual(codulAwbCargus(g).fel, "cod", `„${g}” nu e un cod`);
  }
  assert.equal(codulAwbCargus(Number.NaN).fel, "necunoscut");
  assert.equal(codulAwbCargus(Number.POSITIVE_INFINITY).fel, "necunoscut");
});

test("⚠ formatul codului NU se ingheata la noua cifre", () => {
  /*
   * In documentatia lor codurile sunt numerice, de noua cifre. Dar un curier isi poate schimba
   * seria, iar o regula prea stransa ar refuza AWB-uri ADEVARATE si ar opri expedieri bune.
   * Se cere doar: primitiva, fara spatii, destul de lunga cat sa nu fie un cuvant de stare.
   */
  assert.equal(codulAwbCargus("CG2026000123").fel, "cod");
  assert.equal(codulAwbCargus("80452320100").fel, "cod");
  assert.equal(codulAwbCargus("AB-12345").fel, "cod");
  /* Dar un mesaj are spatii, deci cade singur. */
  assert.equal(codulAwbCargus("AWB nu a putut fi creat").fel, "eroare");
  assert.equal(codulAwbCargus("123").fel, "eroare", "prea scurt ca sa fie cod");
});

/*
 * ═══ MUTANTUL STA PE APELANT ═══
 *
 * Probele de mai sus apara functia. Dar functia poate fi perfecta si nechemata.
 */
test("createCargusAwb chiar cerceteaza raspunsul, nu-l toarna in String()", () => {
  const sursa = readFileSync(new URL("../cargus.ts", import.meta.url), "utf8");
  const start = sursa.indexOf("export async function createCargusAwb");
  assert.notEqual(start, -1);
  const corp = sursa.slice(start, sursa.indexOf("\n}", start));

  assert.ok(corp.includes("codulAwbCargus(raspuns)"), "raspunsul trebuie cercetat");
  assert.ok(
    !/String\(barCode/.test(corp),
    "`String(barCode)` a fost chiar defectul: un obiect devenea „[object Object]”",
  );
  assert.ok(
    corp.includes('verdict.fel === "eroare"') && corp.includes("eroareRefuz("),
    "eroarea LOR trebuie sa elibereze slotul, ca omul sa poata incerca din nou",
  );
  assert.ok(
    corp.includes('verdict.fel === "necunoscut"') && corp.includes("eroareNesigura("),
    "necunoscutul trebuie sa TINA slotul: un colet care poate a plecat nu se reincearca",
  );
});
