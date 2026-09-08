/* ⚠ Fara chei de mediu, ca `createAdminClient()` sa arunce pe loc si nimic sa nu atinga
   reteaua. Vezi nota din `ingest.test.ts`. */
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { primesteComanda, metodaGresita } from "./ruta-comenzi";

/* ══════════════════════════════════════════════════════════════════════════
   CE VEDE PEPITA CAND NE INTREABA
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Contractul lor e scurt si strict: `isError`, `responseCode`, si un mesaj. Ce trimitem
   acolo hotaraste daca retrimit sau nu, deci hotaraste daca o comanda se pierde.

   Probele de aici cheama CHIAR functia rutei, nu o socoteala apropiata. Ce nu poate ajunge
   la baza (cheile lipsesc din mediu) se opreste inainte, si tocmai caile alea se probeaza:
   corpul stricat, metoda gresita, cheia lipsa.
*/

async function raspuns(r: Response) {
  return { cod: r.status, corp: JSON.parse(await r.text()) as Record<string, unknown> };
}

const cerere = (corp: unknown, cale = "/api/pepita/comenzi") =>
  new Request(`https://www.edinio.com${cale}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof corp === "string" ? corp : JSON.stringify(corp),
  });

test("⚠ raspunsul are FORMA lor, nu a noastra", async () => {
  /*
   * Documentatia lor cere `isError`, `responseCode` si mesaj. Trimitem si `messages`, si
   * `message`: ei folosesc una la reusita si alta la esec, iar noi nu stim care e citita.
   */
  const { cod, corp } = await raspuns(await primesteComanda(cerere({ id: 1 }), null));
  assert.equal(cod, 401);
  assert.equal(corp.isError, true);
  assert.equal(corp.responseCode, 401);
  assert.ok(Array.isArray(corp.messages));
  assert.equal(typeof corp.message, "string");
});

test("cheia lipsa si cea prea scurta se opresc INAINTE de baza", async () => {
  /* Daca ar ajunge la baza, `createAdminClient()` ar arunca si am primi 503. Faptul ca
     primim 401 e chiar dovada ca s-au oprit mai devreme. */
  for (const cale of ["/api/pepita/comenzi", "/api/pepita/comenzi?apikey=", "/api/pepita/comenzi?apikey=scurt"]) {
    const { cod } = await raspuns(await primesteComanda(cerere({ id: 1 }, cale), null));
    assert.equal(cod, 401, cale);
  }
});

test("metodele nepotrivite primesc 405, nu o pagina si nu un redirect", async () => {
  /* Un 302 catre `/login` ar fi aratat, in jurnalul lor, ca o integrare care merge. */
  const { cod, corp } = await raspuns(metodaGresita());
  assert.equal(cod, 405);
  assert.equal(corp.isError, true);
});

test("⚠ mesajele care pleaca in afara nu poarta nimic dinauntru", async () => {
  const { corp } = await raspuns(await primesteComanda(cerere({ id: 1 }), null));
  const text = JSON.stringify(corp);
  for (const scurgere of ["supabase", "postgres", "pepita_comenzi", "business_id", "select", "stack", "at ", "/src/"]) {
    assert.ok(!text.toLowerCase().includes(scurgere.toLowerCase()), `mesajul contine „${scurgere}”`);
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ CE RASPUNDEM CAND STOCUL N-A SCAZUT
   ══════════════════════════════════════════════════════════════════════════

   Proba SCANEAZA SURSA, si stie de ce: ca sa ajunga acolo o cerere adevarata, ar trebui o
   baza intreaga. Ce se apara aici e o singura hotarare, care se poate schimba dintr-un cuvant
   si care nu se vede din afara: „comanda e scrisa, dar procesarea n-a mers" trebuie sa iasa
   ca ESEC, nu ca reusita.

   ⚠ Purtarea insasi e probata pe stari in `ingest.test.ts`, unde consumul chiar pica.
*/

const RUTA = readFileSync("src/lib/pepita/ruta-comenzi.ts", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ");

test("⚠ starea „stoc-nefacut” raspunde cu ESEC, nu cu reusita", () => {
  const i = RUTA.indexOf('r.stare === "stoc-nefacut"');
  assert.ok(i > 0, "ruta trebuie sa trateze anume starea asta");
  /* ⚠ Numai blocul lui, nu si ce urmeaza dupa: fereastra prea larga inghitea raspunsul de
     reusita de mai jos, iar proba cadea pe cod perfect corect. */
  const bucata = RUTA.slice(i, RUTA.indexOf("}", i) + 1);
  assert.match(bucata, /esec\(503/, "se raspunde 503, ca ei sa retrimita");
  assert.ok(!/isError:\s*false/.test(bucata), "si NU ca reusita");
});

test("⚠ ruta CERE moneda magazinului in `select`", () => {
  /*
   * ⚠ A CINCEA OARA cand tiparul „ce nu se cere vine undefined" era gata sa treaca. Fara
   * `currency` in citire, moneda magazinului ar fi `undefined`, comparatia din ingest ar tace
   * exact pe magazinele pentru care exista, si o comanda in HUF ar trece drept „importata".
   *
   * Plasa scaneaza sursa fiindca aici nu se poate altfel: calea aia atinge baza, iar probele
   * de mai sus se opresc dinadins inainte de ea.
   */
  const s = readFileSync("src/lib/pepita/ruta-comenzi.ts", "utf8");
  assert.match(s, /\.select\("[^"]*currency[^"]*"\)/, "citirea setarilor nu cere moneda magazinului");
  assert.match(s, /monedaMagazin/, "moneda magazinului nu ajunge in ingest");
});
