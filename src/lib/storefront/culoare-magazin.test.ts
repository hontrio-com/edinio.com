import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { culoareAleasa, culoareMagazin, CULOARE_MAGAZIN_RE, CULOARE_PLATFORMA } from "./culoare-magazin";
import { culoareaPesteTema, culoareValida } from "@/lib/onboarding/aspect";

/*
 * Culoarea principala a magazinului are doua porti (20.11.2026):
 *   - la SCRIERE, forma `#rrggbb`: in aplicatie (`CULOARE_MAGAZIN_RE`) si in baza (constrangerea
 *     `businesses_primary_color_hex`);
 *   - la CITIRE, `culoareMagazin`, care apara `style`-ul vitrinei de orice valoare ar fi ajuns totusi in coloana.
 *
 * Proba tine cele doua reguli de scriere IMPREUNA: o constrangere mai stricta decat aplicatia ar face salvarile sa cada
 * fara mesaj, una mai larga ar lasa aplicatia singura plasa.
 */

const cod = (cale: string) => readFileSync(cale, "utf8").replace(/\r\n/g, "\n");

test("forma de scriere: `#` si sase cifre hexa, nimic altceva", () => {
  for (const buna of ["#6C2938", "#6c2938", "#07c527", "#FFFFFF", "#000000"]) assert.ok(CULOARE_MAGAZIN_RE.test(buna), buna);
  for (const rea of ["#fff", "#6C29380F", "6C2938", "red", "rgb(1,2,3)", "", " #6C2938", "#6C2938 ", "#6C2938\n", "#12345g", "#fff;position:fixed;inset:0;background:url(//altundeva)"]) {
    assert.ok(!CULOARE_MAGAZIN_RE.test(rea), `trece o valoare care nu e culoare de scris: [${rea}]`);
  }
});

test("⚠ regula din baza e chiar regula din aplicatie, in migratie si in schema din Git", () => {
  const sablon = CULOARE_MAGAZIN_RE.source;
  assert.equal(sablon, "^#[0-9A-Fa-f]{6}$");
  const constrangere = `check (primary_color ~ '${sablon}')`;
  assert.ok(cod("migrations/2027-02-09-culoarea-magazinului-e-hex.sql").includes(`add constraint businesses_primary_color_hex ${constrangere} not valid;`), "migratia nu mai are regula din aplicatie");
  // Schema din Git e un dump al productiei: forma ei e cea tiparita de Postgres.
  assert.ok(cod("migrations/000-schema-baseline.sql").includes(`alter table public.businesses add constraint businesses_primary_color_hex CHECK ((primary_color ~ '${sablon}'::text));`), "schema din Git nu are constrangerea, sau are alta regula decat aplicatia");
});

test("⚠ cine scrie coloana trece prin aceeasi regula, din aceeasi constanta", () => {
  // Actiunea de salvare a magazinului primeste cheile de la client: verifica inainte, ca omul sa afle ce e gresit.
  const actiuni = cod("src/lib/actions/business.actions.ts");
  assert.match(actiuni, /if \("primary_color" in payload && !\(typeof payload\.primary_color === "string" && CULOARE_MAGAZIN_RE\.test\(payload\.primary_color\)\)\) \{\s*return \{ error: "Culoarea principală nu este validă\./);
  const inaintea = actiuni.indexOf('if ("primary_color" in payload');
  assert.ok(inaintea > 0 && inaintea < actiuni.indexOf(".update(payload as any)"), "verificarea culorii trebuie sa stea inaintea scrierii");
  // Ciorna editorului si inscrierea nu-si mai scriu regula de mana.
  assert.match(cod("src/lib/storefront/design/continut-ciorna.ts"), /const CULOARE_RE = CULOARE_MAGAZIN_RE;/);
  const inscriere = cod("src/lib/onboarding/aspect.ts");
  assert.equal((inscriere.match(/CULOARE_MAGAZIN_RE\.test\(/g) ?? []).length, 2);
  assert.doesNotMatch(inscriere, /\/\^#\[0-9a-fA-F\]\{6\}\$\//, "inscrierea are iar regula scrisa de mana");
});

test("inscrierea: culoarea valida trece, restul cad pe rezerva lor", () => {
  assert.equal(culoareValida(" #6C2938 "), "#6C2938");
  assert.notEqual(culoareValida("red"), "red");
  assert.ok(CULOARE_MAGAZIN_RE.test(culoareValida("orice")), "rezerva inscrierii trebuie sa fie ea insasi o culoare de scris");
  assert.equal(culoareaPesteTema("#6C2938", "#111111"), "#6C2938");
  assert.equal(culoareaPesteTema("#111111", "#111111"), null);
  assert.equal(culoareaPesteTema("#fff", "#111111"), null);
});

test("poarta de la citire ramane, si ramane mai larga: apara stilul, nu coloana", () => {
  assert.equal(culoareMagazin("#6C2938"), "#6C2938");
  assert.equal(culoareMagazin("#fff;position:fixed"), CULOARE_PLATFORMA);
  assert.equal(culoareMagazin(null), CULOARE_PLATFORMA);
  assert.ok(CULOARE_MAGAZIN_RE.test(CULOARE_PLATFORMA), "rezerva de la citire trebuie sa fie o culoare pe care coloana o primeste");
  // Fundalul din „Stil” e o cheie din `page_content`, fara constrangere in baza: acolo poarta de la citire e singura.
  assert.equal(culoareAleasa("#FBF6F3"), "#FBF6F3");
  assert.equal(culoareAleasa("red;background:url(//x)"), null);
});
