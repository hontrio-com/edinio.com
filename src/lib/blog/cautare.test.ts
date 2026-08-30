import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { pliaza, pregatesteCautarea } from "./types";

/*
  ═══ DE CE EXISTĂ FIȘIERUL ĂSTA ═══

  Căutarea din blog are DOUĂ plieri de diacritice care trebuie să dea același
  rezultat: `pliaza` de aici, cu care se pregătește ce a scris omul, și
  `public.fara_diacritice` din baza de date, cu care e derivată coloana
  `blog_posts.cauta`.

  Dacă se despart, nu crapă nimic. Omul scrie „livrări", primește o pagină
  goală, și crede că articolul nu există. Cel mai tăcut fel de defect: nicio
  eroare, niciun jurnal, nicio alarmă.

  Perechile de mai jos au fost verificate pe 30.08.2026 rulând ACEEAȘI listă
  prin baza de producție. Toate 25 s-au potrivit.
*/

/** Ce a întors `lower(public.fara_diacritice(v))` din Postgres, cuvânt cu cuvânt. */
const DIN_BAZA: Record<string, string> = {
  "Â": "a", "Î": "i", "â": "a", "î": "i", "Ă": "a", "ă": "a",
  "Ș": "s", "ș": "s", "Ț": "t", "ț": "t",
  "în": "in", "şi": "si", "Așa": "asa", "Mär": "mar", "Măr": "mar",
  "eMAG": "emag", "Ţară": "tara", "Țară": "tara", "Șerban": "serban",
  "Livrări": "livrari", "curierat": "curierat", "produse-noi": "produse-noi",
  "împărțit": "impartit",
  "Facturare și AWB": "facturare si awb",
  "PLĂȚI CU CARDUL": "plati cu cardul",
};

test("plierea din cod da exact ce da plierea din baza", () => {
  for (const [intrare, dinSql] of Object.entries(DIN_BAZA)) {
    assert.equal(
      pliaza(intrare),
      dinSql,
      `${JSON.stringify(intrare)}: codul si baza pliaza diferit, deci cautarea rateaza tacut`,
    );
  }
});

test("ambele scrieri romanesti se pliaza la fel", () => {
  // ș/ț cu virgula dedesubt (corect) si ş/ţ cu sedila (raspandit in texte vechi)
  // trebuie sa ajunga in acelasi loc, altfel o cautare gaseste doar jumatate
  // din articole.
  assert.equal(pliaza("şi"), pliaza("și"));
  assert.equal(pliaza("Ţară"), pliaza("Țară"));
});

test("semnele cu inteles in `ilike` se escapeaza", () => {
  // Netratat, `%` ar potrivi orice, iar `_` orice o litera. Nu e o gaura de
  // securitate — valoarea e parametrizata — dar e un rezultat gresit pe care
  // nimeni nu-l poate explica.
  const cuProcent = pregatesteCautarea("100%");
  assert.ok(cuProcent.includes("\\%"), `procentul n-a fost escapat: ${cuProcent}`);
  const cuLinie = pregatesteCautarea("a_b");
  assert.ok(cuLinie.includes("\\_"), `sublinierea n-a fost escapata: ${cuLinie}`);
});

test("cautarea se curata de spatii si se taie la o lungime rezonabila", () => {
  assert.equal(pregatesteCautarea("  Curierat  "), "curierat");
  assert.ok(pregatesteCautarea("x".repeat(500)).length <= 100);
});

/*
  ⚠ CE DOVEDEȘTE PROBA URMĂTOARE ȘI CE NU.

  Nu rulează SQL. Citește fișierul de migrare și verifică dacă coloana derivată
  mai e construită cu `fara_diacritice` și `lower`. Deci NU dovedește că baza se
  poartă la fel — asta s-a dovedit rulând cele 25 de perechi prin producție.

  Ce face e să dea alarma dacă cineva schimbă felul în care se derivează coloana
  și uită de plierea din cod. Cele două stau în fișiere diferite, în limbaje
  diferite, și nimic altceva nu le ține legate.
*/
test("coloana de cautare din migrare foloseste aceeasi pliere", () => {
  const sql = readFileSync(
    new URL("../../../scripts/migrations/2026-08-30_blog_cautare.sql", import.meta.url),
    "utf8",
  );
  assert.ok(sql.includes("fara_diacritice"), "coloana nu mai pliaza diacriticele");
  assert.ok(/generated always as/i.test(sql), "coloana nu mai e derivata, deci se poate invechi");
  assert.ok(sql.includes("lower("), "coloana nu mai e scrisa cu litere mici");
  assert.ok(sql.includes("gin_trgm_ops"), "s-a pierdut indicele trigram");
});
