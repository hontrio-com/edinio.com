import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * ISTORICUL PUBLICARILOR, PE SERVER (etapa 7 din `docs/editor-magazin/PLAN.md`).
 *
 * Actiunile vorbesc cu baza, deci regulile se probeaza pe sursa; logica pura (ce se pastreaza, ce
 * ciorna iese dintr-o versiune) e in `src/lib/editor-magazin/versiuni.test.ts`.
 *
 * Rulare: `npm test`.
 */

const fara = (s: string) => s.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const ACTIUNI = "src/lib/actions/store-design.actions.ts";
const MIGRATIE = "migrations/2027-02-01-istoricul-publicarilor.sql";
const sursa = () => fara(readFileSync(ACTIUNI, "utf8"));
/** Corpul unei functii de pe primul nivel: de la declaratie pana la acolada ei de inchidere. */
function corp(s: string, declaratie: string): string {
  const i = s.indexOf(declaratie);
  assert.ok(i >= 0, `lipseste ${declaratie}`);
  const j = s.indexOf("\n}\n", i);
  return s.slice(i, j < 0 ? undefined : j + 2);
}
const functia = (s: string, nume: string) => corp(s, `export async function ${nume}(`);
const pastreaza = () => corp(sursa(), "async function pastreazaVersiunea(");
const taie = () => corp(sursa(), "async function taieVersiunileVechi(");

test("⚠⚠ versiunea se pastreaza DUPA ce magazinul s-a schimbat, cu chiar data publicarii", () => {
  const f = functia(sursa(), "publishDesign");
  const design = f.indexOf("storefront_design: design as unknown as Json");
  const oprire = f.indexOf('if ("error" in result) return result;', design);
  const versiune = f.indexOf("await pastreazaVersiunea(owned, {");
  assert.ok(design > 0 && oprire > design && versiune > oprire, "versiunea ar fi pornit inainte ca publicarea sa fi reusit");
  assert.match(f, /const publicatLa = new Date\(\)\.toISOString\(\);/);
  assert.match(f, /storefront_design_pub_at: publicatLa,/);
  assert.match(f, /publicat: \{\s*design,\s*continut: instantaneuContinut\(pcNou, \{ \.\.\.owned\.magazin, \.\.\.continut\.magazin \}\),\s*la: publicatLa,\s*\}/);
  // Ce era in magazin se ia din ce s-a citit INAINTE de orice scriere.
  assert.match(f, /\.select\("storefront_design_draft, storefront_design, storefront_design_pub_at"\)/);
  assert.match(f, /inainte: \{\s*design: row\?\.storefront_design \?\? \{\},\s*continut: instantaneuContinut\(owned\.ctx\.pageContent, owned\.magazin\),\s*la: row\?\.storefront_design_pub_at \?\? null,\s*\}/);
  // Randul scris poarta chiar data aceea, nu `now()` din baza: dupa ea se gaseste „În magazin acum”.
  assert.match(pastreaza(), /origine: "publicare", publicat_de: owned\.userId, created_at: v\.publicat\.la,/);
});

test("⚠⚠ o cadere a istoricului nu strica publicarea, dar ajunge in jurnal", () => {
  const p = pastreaza();
  assert.match(p, /^async function pastreazaVersiunea\([\s\S]*?\): Promise<void> \{\s*try \{/);
  assert.match(p, /\} catch \(e\) \{\s*logError\(\{ action: "publishDesign\.versiune", businessId: owned\.businessId,/);
  for (const e of ["eNumar", "eScris"]) {
    assert.match(p, new RegExp(`if \\(${e}\\) throw new Error\\(${e}\\.message\\);`), `${e} ar fi fost inghitita`);
  }
  // Taierea celor vechi (etapa 17: comuna cu versiunile de dinainte de tema) arunca si ea, deci tot in jurnal.
  for (const e of ["eVechi", "eSters"]) {
    assert.match(taie(), new RegExp(`if \\(${e}\\) throw new Error\\(${e}\\.message\\);`), `${e} ar fi fost inghitita`);
  }
});

test("⚠⚠ ce era inainte se pastreaza o singura data: cand magazinul n-are nicio versiune", () => {
  const p = pastreaza();
  const garda = p.indexOf("if (count === 0) {");
  const inainte = p.indexOf('origine: "inainte"');
  assert.ok(garda > 0 && inainte > garda && inainte < p.indexOf('origine: "publicare"'));
  assert.equal(p.split('origine: "inainte"').length - 1, 1);
  // Data ei: publicarea de dinainte, cand e mai veche decat cea de acum; altfel o clipa inainte.
  assert.match(p, /v\.inainte\.la && Date\.parse\(v\.inainte\.la\) < Date\.parse\(v\.publicat\.la\)/);
});

test("⚠⚠ tabelul versiunilor se atinge NUMAI cu magazinul proprietarului", () => {
  const s = sursa();
  // Fiecare lant, pana la `;` sau pana la capatul elementului din `Promise.all`, fara sa treaca in alt `.from(`.
  const cereri = [...s.matchAll(/\.from\("storefront_design_versions"\)((?:(?!\.from\()[\s\S])*?)(?:;|,\n)/g)].map((m) => m[1]);
  // Etapa 17: si versiunile de dinainte de tema, „Pune la loc” si intrebarea paginii „Teme” (9). Etapa 25.6: prima
  // versiune `tema`, pastrata la taiere si aratata in lista (11). 14.11.2026: „Pune la loc” si intrebarea paginii au
  // acum o alegere comuna (`designulDeDinainteDeTema`), cu doua cereri (lista, apoi versiunile de pe drum): tot 11.
  assert.equal(cereri.length, 11, "o cerere noua pe tabel trebuie trecuta si aici");
  for (const c of cereri) {
    // Insertul poarta magazinul in fiecare rand (mai jos).
    if (c.trimStart().startsWith(".insert(")) continue;
    assert.match(c, /\.eq\("business_id", (owned\.)?businessId\)/, c);
  }
  // Taierea (etapa 17) primeste magazinul ca argument: doar ea il ia asa, iar fiecare apel ii da magazinul verificat.
  assert.equal([...taie().matchAll(/\.eq\("business_id", businessId\)/g)].length, 2);
  assert.deepEqual([...s.matchAll(/taieVersiunileVechi\(admin, ([^)]+)\)/g)].map((m) => m[1]), ["owned.businessId", "owned.businessId"]);
  assert.equal(pastreaza().split("business_id: owned.businessId,").length - 1, 2, "ambele randuri scrise poarta magazinul lui");
  assert.equal(functia(s, "aplicaTema").split("business_id: owned.businessId").length - 1, 2, "si cele de dinainte de tema");
});

test("⚠ clientul de serviciu abia dupa verificarea proprietarului", () => {
  const s = sursa();
  for (const nume of ["listDesignVersions", "getDesignVersion"]) {
    const f = functia(s, nume);
    const owned = f.indexOf("const owned = await loadOwnedStore(businessId);\n  if (\"error\" in owned) return owned;");
    assert.ok(owned > 0 && owned < f.indexOf("createAdminClient()"), nume);
  }
  // Nu e exportata (nu e un capat public) si o cheama numai `publishDesign`, dupa `loadOwnedStore`.
  assert.doesNotMatch(s, /export async function pastreazaVersiunea/);
  assert.equal(s.split("pastreazaVersiunea(").length - 1, 2, "declaratia si un singur apel");
});

test("⚠ o versiune ceruta: id-ul validat, citirea cazuta deosebita de lipsa", () => {
  const f = functia(sursa(), "getDesignVersion");
  assert.match(f, /if \(!esteUuid\(idVersiune\)\) return \{ error:/);
  assert.match(f, /\.eq\("id", idVersiune\)\s*\.eq\("business_id", owned\.businessId\)\s*\.maybeSingle\(\);/);
  assert.match(f, /if \(error\) \{[\s\S]*?return \{ error: "Nu am putut citi versiunea acum\. Încearcă din nou\." \};\s*\}\s*if \(!data\) return \{ error: "Versiunea nu mai există\." \};/);
  const l = functia(sursa(), "listDesignVersions");
  // Etapa 25.6: si citirea primei versiuni `tema`; oricare cazuta e o eroare, nu o lista mai scurta.
  assert.match(l, /if \(error \|\| ePrima\) \{[\s\S]*?return \{ error: "Nu am putut citi istoricul\. Încearcă din nou\." \};/);
  assert.match(l, /\.order\("created_at", \{ ascending: false \}\)\s*\.limit\(VERSIUNI_PASTRATE\)/);
});

test("plafonul: ce trece de `VERSIUNI_PASTRATE` se sterge la scriere, cele mai vechi", () => {
  assert.match(pastreaza(), /if \(\(count \?\? 0\) \+ randuri\.length > VERSIUNI_PASTRATE\) await taieVersiunileVechi\(admin, owned\.businessId\);/);
  const t = taie();
  assert.match(t, /\.order\("created_at", \{ ascending: false \}\)\s*\.range\(VERSIUNI_PASTRATE, VERSIUNI_PASTRATE \+ 99\),/);
  // Etapa 25.6: prima versiune `tema` (designul de dinainte de prima tema) nu se taie, oricate teme s-ar incerca.
  assert.match(t, /const deSters = \(vechi \?\? \[\]\)\.map\(\(r\) => r\.id\)\.filter\(\(id\) => id !== prima\);/);
  assert.match(t, /\.delete\(\)\s*\.eq\("business_id", businessId\)\s*\.in\("id", deSters\);/);
  const prima = corp(sursa(), "async function primaVersiuneDeTema(");
  assert.match(prima, /\.eq\("business_id", businessId\)\s*\.eq\("origine", "tema"\)\s*\.order\("created_at", \{ ascending: true \}\)\s*\.limit\(1\)/);
});

test("⚠⚠ migratia: RLS fara politici, niciun drept pentru `anon` si `authenticated`, verificate chiar in ea", () => {
  const m = readFileSync(MIGRATIE, "utf8").replace(/--.*$/gm, "");
  assert.match(m, /create table if not exists public\.storefront_design_versions \(/);
  assert.match(m, /business_id uuid not null references public\.businesses\(id\) on delete cascade,/);
  assert.match(m, /alter table public\.storefront_design_versions enable row level security;/);
  assert.match(m, /revoke all on table public\.storefront_design_versions from public, anon, authenticated;/);
  assert.doesNotMatch(m, /create policy/i);
  assert.doesNotMatch(m, /grant [^;]* to [^;]*(anon|authenticated)/i);
  assert.match(m, /foreach rol in array array\['anon', 'authenticated'\] loop/);
  assert.match(m, /if has_table_privilege\(rol, 'public\.storefront_design_versions', drept\) then\s*raise exception/);
  assert.match(m, /create index if not exists storefront_design_versions_business_idx\s+on public\.storefront_design_versions \(business_id, created_at desc\);/);
  assert.match(m, /notify pgrst, 'reload schema';/);
});

test("⚠ numai actiunile editorului ating tabelul, iar `verifica:coloane` il cere", () => {
  const atinse: string[] = [];
  for (const rel of readdirSync("src", { recursive: true }) as string[]) {
    if (!/\.tsx?$/.test(rel) || /\.test\.tsx?$/.test(rel) || rel.endsWith("database.types.ts")) continue;
    if (readFileSync(join("src", rel), "utf8").includes("storefront_design_versions")) atinse.push(rel.replace(/\\/g, "/"));
  }
  assert.deepEqual(atinse, ["lib/actions/store-design.actions.ts"]);
  assert.match(readFileSync("scripts/tests/coloane-cerute-exista.mjs", "utf8"), /^\s*"storefront_design_versions",$/m);
});

test("17.2: migratia are originile temelor (`tema`, `ciorna`) si in tabelul nou, si in constrangerea refacuta pe demo", () => {
  const m = readFileSync(MIGRATIE, "utf8").replace(/--.*$/gm, "");
  assert.equal((m.match(/check \(origine in \('publicare', 'inainte', 'tema', 'ciorna'\)\)/g) ?? []).length, 2);
  assert.match(m, /alter table public\.storefront_design_versions drop constraint if exists storefront_design_versions_origine_check;/);
  assert.match(m, /pg_get_constraintdef\(oid\) from pg_constraint where conname = 'storefront_design_versions_origine_check'\) !~ 'tema'/);
  // Lista le citeste pe toate, iar istoricul le scrie eticheta.
  assert.match(sursa(), /origine: origineDinBaza\(r\.origine\)/);
  assert.match(fara(readFileSync("src/components/editor-magazin/IstoricVersiuni.tsx", "utf8")), /\{ETICHETA_ORIGINE\[v\.origine\]\}/);
});
