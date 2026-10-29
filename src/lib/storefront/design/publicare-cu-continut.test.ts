import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

/**
 * „PUBLICĂ” DUCE SI CONTINUTUL (etapa 6.2 din `docs/editor-magazin/PLAN.md`).
 *
 * Actiunile vorbesc cu baza, deci regulile se probeaza pe sursa; logica pura e in
 * `continut-ciorna.test.ts`.
 *
 * Rulare: `npm test`.
 */

const fara = (s: string) => s.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const ACTIUNI = "src/lib/actions/store-design.actions.ts";
const sursa = () => fara(readFileSync(ACTIUNI, "utf8"));
/** Corpul unei functii exportate: de la declaratia ei pana la urmatorul export. */
function functia(s: string, nume: string): string {
  const i = s.indexOf(`export async function ${nume}(`);
  assert.ok(i >= 0, `lipseste ${nume}`);
  const j = s.indexOf("\nexport ", i + 1);
  return s.slice(i, j < 0 ? undefined : j);
}

test("⚠⚠ ciorna se salveaza cu continutul ei, iar designul se parseaza CU el", () => {
  const f = functia(sursa(), "saveDesignDraft");
  assert.match(f, /const continut = continutDinCiorna\(raw\);/);
  assert.match(f, /if \(marimeContinut\(continut\) > MAX_CONTINUT_BYTES\) return \{ error:/);
  assert.match(f, /const design = parseStoreDesign\(raw, contextCuCiorna\(owned\.ctx, continut\)\);/);
  assert.match(f, /\{ storefront_design_draft: ciornaCuContinut\(design, continut\) as unknown as Json \}/);
  // Garda compara si continutul (amprenta din `draft-guard.ts`).
  assert.match(f, /ciornaAFostSchimbata\(rand\?\.storefront_design_draft, baza, owned\.ctx\)/);
});

test("⚠⚠ „Publică” scrie INTAI continutul, apoi designul si golirea ciornei", () => {
  const f = functia(sursa(), "publishDesign");
  // Cheile scrise si cele scoase de o versiune readusa (etapa 7), peste `page_content` citit acum.
  assert.match(f, /const pcNou = pcCuCiorna\(owned\.ctx\.pageContent, continut\);\s*if \(atingeCheiPc\(continut\)\) \{/);
  const pc = f.indexOf("page_content: pcNou as Json");
  const magazin = f.indexOf('.from("businesses")');
  const design = f.indexOf("storefront_design: design as unknown as Json");
  assert.ok(pc > 0 && magazin > 0 && design > 0, "lipseste o scriere");
  assert.ok(pc < design && magazin < design, "designul ar fi ajuns in magazin inaintea continutului lui");
  // Coloanele din `businesses` doar ale proprietarului, si doar cele din lista alba (parserul).
  assert.match(f, /\.update\(continut\.magazin as never\)\s*\.eq\("id", owned\.businessId\)\s*\.eq\("user_id", owned\.userId\);/);
  // O scriere cazuta opreste publicarea inainte de design: ciorna ramane intreaga.
  assert.match(f, /if \("error" in scris\) return scris;/);
  assert.match(f, /if \(error\) \{[\s\S]*?return \{ error:[^}]*\};\s*\}/);
  assert.match(f, /const design = parseStoreDesign\(sursa, contextCuCiorna\(owned\.ctx, continut\)\);/);
  assert.match(f, /storefront_design_draft: null,/);
});

test("⚠⚠ `elibereazaComutatoare` nu mai exista: ar fi rescris ciorna fara continut", () => {
  const s = sursa();
  assert.doesNotMatch(s, /export async function elibereazaComutatoare/);
  assert.ok(!existsSync("src/lib/storefront/design/comutatoare-vechi.ts"));
  // Fiecare actiune exportata verifica proprietarul inainte de orice.
  const exportate = [...s.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
  // Etapa 17 (temele): `aplicaTema`, `puneLaLocDesignulDeDinainte` si intrebarea paginii „Teme”, tot dupa proprietar.
  assert.deepEqual(exportate.sort(), [
    "aplicaTema", "areDesignDeDinainteDeTema", "discardDesignDraft", "getDesignVersion", "listDesignVersions", "publishDesign",
    "puneLaLocDesignulDeDinainte", "saveDesignDraft",
  ]);
  for (const nume of exportate) assert.match(functia(s, nume), /const owned = await loadOwnedStore\(businessId\);\s*if \("error" in owned\) return owned;/, nume);
});
