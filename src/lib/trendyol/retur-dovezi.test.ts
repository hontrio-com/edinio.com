import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dovadaCeruta, MOTIVE_FARA_DOVADA, MOTIV_BLOCAT_24H } from "./retur-forma";

/* ══════════════════════════════════════════════════════════════════════════
   GHIDUL LOR CERE FISIER, SCHEMA LOR SPUNE CA E OPTIONAL (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Ghid, turceste: „Bu iki iade sebebi dışında bütün sebepler için file yüklemek zorunludur."
   Ghid, engleza:  „It is mandatory to upload a file for all reasons except these two return reasons."
   OpenAPI:        required = [claimIssueReasonId, claimItemIdList, description] — `files` lipseste.

   ⚠ SE CREDE GHIDUL. Partea care greseste in favoarea noastra costa un fisier in plus; cealalta
   costa returul. Si nu se stie nici macar daca refuzul vine sincron: ghidul spune ca rezultatul
   respingerii se urmareste ABIA pe urma, pe `claimItemStatus` — deci un `200` la apel n-ar
   dovedi ca respingerea a fost primita. Ar putea muri tacut, zile mai tarziu, cu marfa la
   comerciant si banii deja intorsi clientului.
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("⚠ dovada se cere pentru orice motiv in afara de 1651 si 451", () => {
  assert.equal(dovadaCeruta(1651), false);
  assert.equal(dovadaCeruta(451), false);
  for (const alt of [2101, 452, 1652, 999, 1, 5000]) {
    assert.equal(dovadaCeruta(alt), true, `motivul ${alt} trebuie sa ceara dovada`);
  }
});

test("⚠ 2101 NU e scutit, desi apare in lista lor", () => {
  /*
   * Ghidul turcesc si UNA din cele doua variante engleze il enumera; a doua nu. Peste asta,
   * fraza care insoteste lista de TREI motive zice tot „aceste doua motive" — lista a fost
   * extinsa fara ca textul sa fie potrivit, si nu se stie care jumatate e cea buna. In plus,
   * 2101 lipseste din toate raspunsurile-exemplu ale `getClaimIssueReasons`.
   *
   * ⚠ Pe o cale ireversibila nu se pariaza pe jumatatea favorabila.
   */
  assert.equal(MOTIVE_FARA_DOVADA.has(2101), false);
  assert.equal(MOTIVE_FARA_DOVADA.size, 2);
});

test("⚠ niciun motiv ales nu inseamna „cere dovada”", () => {
  /* Butonul din ecran trece prin `Number(motivAles) || null`, iar `Number("")` e 0. Daca zero ar
     fi cerut dovada, campul de fisiere ar arata rosu inainte ca omul sa fi ales ceva. */
  assert.equal(dovadaCeruta(null), false);
  assert.equal(dovadaCeruta(undefined), false);
  assert.equal(dovadaCeruta(0), false);
});

test("⚠ oprirea sta pe SERVER, nu doar in ecran", () => {
  /* O actiune de server se poate chema cu orice argumente, printr-un POST direct. Si sta in
     `hotarasteRetur`, adica pe drumul COMUN — nu doar pe calea cu `FormData`. */
  const mod = viu("src/lib/trendyol/retururi.ts");
  assert.match(mod, /if \(dovadaCeruta\(p\.motivId\) && \(p\.dovezi\?\.length \?\? 0\) === 0\)/);

  /* ⚠ Si INAINTE de apel, nu dupa: respingerea e ireversibila si e plafonata la 5 pe minut. */
  const i = mod.indexOf("dovadaCeruta(p.motivId)");
  const j = mod.indexOf("rejectClaimItems(");
  assert.ok(i > 0 && j > i, "verificarea trebuie sa fie inaintea apelului");
});

test("⚠ ecranul spune regula de 24h de la motivul 1651", () => {
  /*
   * „For the claim issue reason 1651, this reason cannot be selected within the first 24 hours
   * after the return on the Waiting Action status." E chiar unul dintre cele doua motive scutite
   * de dovada — adica exact cel spre care omul e impins. Refuzul lor n-ar explica nimic.
   */
  assert.equal(MOTIV_BLOCAT_24H, 1651);
  const ui = readFileSync("src/components/dashboard/TrendyolReturns.tsx", "utf8");
  assert.match(ui, /Number\(motivAles\[r\.claimId\]\) === MOTIV_BLOCAT_24H/);
  assert.match(ui, /primele 24 de ore/);
});

test("⚠ si butonul nu se poate apasa fara dovada", () => {
  const ui = readFileSync("src/components/dashboard/TrendyolReturns.tsx", "utf8");
  assert.match(ui, /ceruta\(r\.claimId\) && \(dovezi\[r\.claimId\]\?\.length \?\? 0\) === 0/);
});

test("⚠ si niciun comentariu nu mai sustine ca dovezile sunt optionale", () => {
  /* Textul se schimba odata cu codul: trei fisiere spuneau „OPTIONALE IN SCHEMA LOR", iar cine
     citea comentariul in loc de cod ar fi crezut ca respingerea goala pleaca. */
  for (const f of [
    "src/lib/trendyol/retururi.ts",
    "src/lib/actions/trendyol-retururi.actions.ts",
    "src/components/dashboard/TrendyolReturns.tsx",
  ]) {
    const t = readFileSync(f, "utf8");
    assert.doesNotMatch(t, /DOVEZILE SUNT OPTIONALE/, f);
  }
});
