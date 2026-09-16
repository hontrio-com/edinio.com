import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  cheieEveniment,
  evenimenteDeSemnalat,
  istoricDeLaNouLaVechi,
  spuseleDeTinutMinte,
  trebuieSemnalat,
} from "./statusuri";
import type { StarePosta } from "./client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * REFUZUL NU SE PIERDE SUB UN EVENIMENT ADMINISTRATIV       (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cronul Postei tinea minte UN SINGUR cod si striga numai daca ULTIMA stare cerea atentie
 * si era alta decat cea retinuta:
 *
 *     const schimbat = codNou !== null && codNou !== (o.posta_status_code ?? null);
 *     if (schimbat && trebuieSemnalat(codNou)) { … }
 *
 * Comentariul de deasupra spunea, linistit, ca se pierde „al doilea din doua evenimente care
 * cer atentie", si ca la ritmul postei cazul e rar.
 *
 * ⚠⚠ Masurat, pierderea era ALTA si mai mare: daca dupa „Refuz destinatar" (21) intra un
 * eveniment administrativ — „Redirectionat" (35), „Reexpediat" (36), o scanare de tranzit —
 * atunci ultima stare NU cere atentie, iar refuzul nu se striga NICIODATA. Nu „al doilea":
 * NIMIC.
 *
 * ⚠ Si nu e rar. Refuzul la usa si redirectarea catre oficiu se inregistreaza in aceeasi tura
 * a factorului, deci ajung impreuna in acelasi raspuns al API-ului.
 *
 * Leacul e cel de la GLS, din 31.08: se tine minte CE am spus, nu CE am vazut ultima data.
 */

const ORAR = "01.09.2026 09:00";

function stare(cod: number, data: string): StarePosta {
  return { idStatus: cod, data, status: `stare ${cod}` };
}

/* Codurile pe care se sprijina probele, verificate la sursa ca inca cer/nu cer atentie. */
test("codurile din scenariu sunt chiar cele presupuse", () => {
  assert.ok(trebuieSemnalat(21), "21 (refuz destinatar) nu mai cere atentie");
  assert.ok(!trebuieSemnalat(35), "35 (redirectionat) a devenit un eveniment care cere atentie");
});

test("⚠⚠ refuzul urmat de un eveniment administrativ SE SEMNALEAZA", () => {
  const stari = [stare(21, "01.09.2026 11:20"), stare(35, "01.09.2026 11:24")];
  const de = evenimenteDeSemnalat(stari, new Set(), false);
  assert.deepEqual(de.map((s) => s.idStatus), [21], "refuzul s-a pierdut sub redirectionare");
});

test("⚠ si DOUA evenimente care cer atentie se striga amandoua", () => {
  /* Pierderea pe care vechiul comentariu o recunostea si o accepta. */
  const stari = [stare(21, "01.09.2026 11:20"), stare(22, "01.09.2026 15:02")];
  const de = evenimenteDeSemnalat(stari, new Set(), false);
  assert.equal(de.length, 2, `s-a strigat doar ${de.length}`);
});

test("⚠ dar nu de doua ori: ce a fost spus o data nu se mai repeta la fiecare doua ore", () => {
  const stari = [stare(21, "01.09.2026 11:20"), stare(35, "01.09.2026 11:24")];
  const spuse = new Set(spuseleDeTinutMinte(new Set(), stari));
  assert.deepEqual(evenimenteDeSemnalat(stari, spuse, false), []);
});

test("⚠ acelasi cod la alta ora e ALT eveniment", () => {
  /* Doua incercari de livrare refuzate in zile diferite sunt doua vesti, nu una. */
  const luni = stare(21, "01.09.2026 11:20");
  const marti = stare(21, "02.09.2026 10:05");
  const spuse = new Set(spuseleDeTinutMinte(new Set(), [luni]));
  assert.deepEqual(evenimenteDeSemnalat([luni, marti], spuse, false).map((s) => s.data), [marti.data]);
});

test("⚠⚠ la PRIMA vedere nu se striga tot istoricul, ci doar starea curenta", () => {
  /*
   * Migratia adauga coloana goala pe comenzi urmarite de saptamani. Fara garda asta, prima
   * rulare de dupa deploy ar fi trimis cate o notificare pentru fiecare eveniment vechi —
   * toate despre lucruri de mult incheiate.
   */
  const stari = [stare(21, "01.09.2026 08:00"), stare(22, "01.09.2026 09:00"), stare(23, "01.09.2026 10:00")];
  const de = evenimenteDeSemnalat(stari, new Set(), true);
  assert.equal(de.length <= 1, true, `s-au strigat ${de.length} evenimente la prima vedere`);
});

test("⚠ si „starea curenta” inseamna cea mai NOUA dupa data lor, nu ultima din tablou", () => {
  /* Ordinea in care le da API-ul nu e documentata nicaieri. */
  const noua = stare(21, "02.09.2026 10:00");
  const veche = stare(22, "01.09.2026 10:00");
  const de = evenimenteDeSemnalat([noua, veche], new Set(), true);
  assert.deepEqual(de.map((s) => s.data), [noua.data], "s-a luat ultima din tablou, nu cea mai noua");
});

test("⚠ o stare fara cod nu produce o cheie care se ciocneste cu una cu cod", () => {
  /* `codNumeric` refuza 0 si negativele: Anexa 2 incepe de la 1. Deci „fara cod" nu are cum
     sa arate ca un cod adevarat. */
  assert.notEqual(cheieEveniment({ idStatus: null, data: ORAR }), cheieEveniment(stare(1, ORAR)));
  assert.equal(cheieEveniment(null), "|");
  assert.equal(cheieEveniment({ idStatus: "21", data: ORAR }), cheieEveniment(stare(21, ORAR)),
    "codul dat ca sir si acelasi cod dat ca numar trebuie sa fie ACELASI eveniment");
});

test("lista tinuta minte se taie la 200, cu cele mai RECENTE pastrate", () => {
  const multe = Array.from({ length: 250 }, (_, i) => stare(1, `01.09.2026 ${String(i).padStart(2, "0")}:00`));
  const pastrate = spuseleDeTinutMinte(new Set(), multe);
  assert.equal(pastrate.length, 200);
  assert.equal(pastrate[pastrate.length - 1], cheieEveniment(multe[multe.length - 1]));
});

// ─── Si regula chiar e cea folosita de cron ───────────────────────────────────

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("⚠⚠ cronul chiar CHEAMA regula, si nu mai are una a lui", () => {
  /* O unealta scrisa anume si nechemata nu apara nimic. */
  const s = viu("src/app/api/cron/posta-tracking/route.ts");
  assert.match(s, /evenimenteDeSemnalat\(stari, dejaSpuse, primaVedere\)/, "cronul nu cheama regula");
  assert.match(s, /spuseleDeTinutMinte\(dejaSpuse, stari\)/, "cronul nu mai tine minte ce a spus");
  assert.ok(
    !/schimbat && trebuieSemnalat/.test(s),
    "vechea regula pe ultima stare a ramas in cron",
  );
});

test("⚠ `primaVedere` se citeste din COLOANA, nu din marcajul de rotatie", () => {
  const s = viu("src/app/api/cron/posta-tracking/route.ts");
  assert.match(s, /const primaVedere = o\.posta_evenimente_semnalate == null;/);
});

test("⚠ si lista intra in STARE, ca sa fie filtrata pe expedierea citita", () => {
  /* Scrisa peste un AWB nou, semnalarile lui ar fi socotite spuse si nimeni n-ar mai afla. */
  const s = viu("src/app/api/cron/posta-tracking/route.ts");
  assert.match(s, /stare: \{ posta_status_code: codNou, posta_evenimente_semnalate: pastrate \}/);
});

test("⚠⚠ iar la dezlegarea AWB-ului memoria se goleste — la Posta SI la GLS", () => {
  /*
   * Lasata pe comanda, coletul urmator porneste cu lista celui vechi: un eveniment al lui cu
   * acelasi cod si aceeasi data e socotit „deja spus" si nu mai ajunge la om.
   */
  assert.match(viu("src/lib/actions/posta.actions.ts"), /posta_evenimente_semnalate: null,/);
  assert.match(viu("src/lib/actions/gls.actions.ts"), /gls_evenimente_semnalate: null,/);
});

test("⚠ si coloana chiar exista in schema din Git si in tipuri", () => {
  /* Cronul fara migratie scrie intr-o coloana inexistenta si CADE la fiecare colet. */
  assert.match(readFileSync("migrations/000-schema-baseline.sql", "utf8"), /posta_evenimente_semnalate jsonb/);
  assert.match(readFileSync("src/types/database.types.ts", "utf8"), /posta_evenimente_semnalate/);
});

// ─── Si istoricul din panou se aseaza dupa DATE, nu dupa ordinea lor ─────────

test("⚠⚠ istoricul se aseaza de la NOU la vechi dupa datele lor, nu prin `.reverse()`", () => {
  /*
   * Panoul facea `stari.map(…).reverse()`, adica presupunea ca API-ul da evenimentele de la
   * vechi la nou. Nimic din documentatie nu spune asta. Daca raspunsul vine deja de la nou la
   * vechi, intors pe dos, comerciantul citeste ultima stare a coletului ca pe prima — si la un
   * refuz sau un retur trage concluzia opusa.
   */
  const deLaNouLaVechi = [stare(21, "03.09.2026 10:00"), stare(14, "02.09.2026 10:00"), stare(1, "01.09.2026 10:00")];
  assert.deepEqual(
    istoricDeLaNouLaVechi(deLaNouLaVechi).map((s) => s.data),
    deLaNouLaVechi.map((s) => s.data),
    "un raspuns care vine deja de la nou la vechi a fost intors pe dos",
  );

  const deLaVechiLaNou = [...deLaNouLaVechi].reverse();
  assert.deepEqual(
    istoricDeLaNouLaVechi(deLaVechiLaNou).map((s) => s.data),
    deLaNouLaVechi.map((s) => s.data),
    "un raspuns cronologic nu s-a asezat cu cel mai nou sus",
  );
});

test("⚠ si o data necitita cade pe `.reverse()`, aceeasi presupunere ca `ultimaStare`", () => {
  /* Doua presupuneri opuse in acelasi modul ar fi mai rele decat una singura, scrisa pe fata. */
  const amestec = [stare(1, "01.09.2026 10:00"), { idStatus: 14, data: "candva" }, stare(21, "03.09.2026 10:00")];
  assert.deepEqual(
    istoricDeLaNouLaVechi(amestec).map((s) => s.idStatus),
    [21, 14, 1],
  );
});

test("⚠ si actiunea din panou chiar o cheama, fara `.reverse()` al ei", () => {
  const s = viu("src/lib/actions/posta.actions.ts");
  assert.match(s, /istoricDeLaNouLaVechi\(stari\)\.map\(laStareAfisata\)/, "panoul nu foloseste asezarea");
  assert.ok(!/laStareAfisata\)\.reverse\(\)/.test(s), "`.reverse()` mecanic a ramas in panou");
});
