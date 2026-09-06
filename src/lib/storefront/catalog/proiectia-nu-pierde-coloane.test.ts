import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Cele DOUA liste de coloane ale proiectiei spun acelasi lucru?
 *
 * ═══ ⚠ DE CE SUNT DOUA, SI DE CE E PERICULOS ═══
 *
 * `RandProiectie` e forma pe care o asteapta codul; `COLOANE_PROIECTIE` e sirul cerut de la
 * PostgREST pe calea de REZERVA (pagina de magazin cand RPC-ul nu se poate folosi, si cautarea
 * cazuta pe drumul vechi). Calea normala trece prin RPC-uri care intorc `to_jsonb(c) - ...`, deci
 * acolo coloanele curg singure.
 *
 * ⚠ Sters dintr-un sir, un nume nu rupe NIMIC vizibil: `tsc` da 0, toate probele raman verzi, iar
 * `dinProiectie` citeste `undefined` si cade pe valoarea de rezerva. Acelasi produs arata atunci
 * un lucru pe pagina de magazin si altul in cautare — si nimeni n-are de unde sti de ce.
 *
 * Proiectul are clasa asta scrisa: „o coloana lipsa rupe TOATA interogarea”, si „campuri
 * completate care nu ajung public”.
 */

const FISIER = path.resolve(process.cwd(), "src/lib/storefront/catalog/din-proiectie.ts");

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF. */
function sursa(): string {
  return readFileSync(FISIER, "utf8").replace(/\r\n/g, "\n");
}

/** Numele campurilor din interfata `RandProiectie`. */
function aleInterfetei(): string[] {
  const s = sursa();
  const start = s.indexOf("export interface RandProiectie {");
  assert.ok(start > 0, "nu am gasit interfata RandProiectie");
  const stop = s.indexOf("\n}", start);
  assert.ok(stop > start, "nu am gasit capatul interfetei");
  const nume = [...s.slice(start, stop).matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
  // ⚠ Garda de numaratoare: o rescriere a formei ar fi golit lista, si proba ar fi comparat
  // doua multimi goale — verde, si complet oarba.
  assert.ok(nume.length >= 15, `am citit doar ${nume.length} campuri din interfata`);
  return nume;
}

/** Numele din sirul cerut de la PostgREST pe calea de rezerva. */
function aleSirului(): string[] {
  const s = sursa();
  const start = s.indexOf("const COLOANE_PROIECTIE");
  assert.ok(start > 0, "nu am gasit COLOANE_PROIECTIE");
  const stop = s.indexOf(";", start);
  const bucata = s.slice(start, stop);
  const nume = [...bucata.matchAll(/[\w]+/g)]
    .map((m) => m[0])
    .filter((x) => x !== "const" && x !== "COLOANE_PROIECTIE");
  assert.ok(nume.length >= 15, `am citit doar ${nume.length} nume din sir`);
  return nume;
}

test("FIECARE camp al randului de proiectie se si CERE de la baza", () => {
  const lipsa = aleInterfetei().filter((c) => !aleSirului().includes(c));
  assert.deepEqual(
    lipsa, [],
    "campurile astea sunt asteptate de cod dar nu se cer pe calea de rezerva; acolo vor fi "
    + "`undefined`, iar pagina de magazin va arata altceva decat cautarea",
  );
});

test("si invers: nu se cere nimic ce nu se citeste", () => {
  // ⚠ Un nume cerut si necitit nu strica nimic azi, dar arata ca cele doua liste au divergit —
  // si urmatoarea divergenta poate fi in cealalta directie.
  const inPlus = aleSirului().filter((c) => !aleInterfetei().includes(c));
  assert.deepEqual(inPlus, [], "se cer coloane pe care nimic nu le citeste");
});
