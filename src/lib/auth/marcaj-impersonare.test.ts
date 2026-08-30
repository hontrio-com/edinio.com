import test from "node:test";
import assert from "node:assert/strict";

import {
  citesteMarcaj,
  DURATA_IMPERSONARE_SEC,
  secundeRamase,
  valoareMarcaj,
} from "./marcaj-impersonare";

/**
 * Ce apara testele astea: constatarea 22 s-a intors o data deja, dupa ce parea
 * reparata. Prima incercare dadea cookie-ului de sesiune acelasi `maxAge` ca
 * marcajului — dar reimprospatarea de token, care pica fix la finalul ferestrei,
 * il rescria cu durata normala. Termenul trebuie sa fie o DATA din valoarea
 * marcajului, nu o proprietate a cookie-ului.
 */

test("marcajul poarta si adminul, si termenul", () => {
  const acum = 1_000_000_000_000;
  const m = citesteMarcaj(valoareMarcaj("admin-1", acum));
  assert.equal(m?.adminId, "admin-1");
  assert.equal(m?.expiraLa, acum + DURATA_IMPERSONARE_SEC * 1000);
});

test("un id de admin cu punct in el nu strica citirea", () => {
  // `lastIndexOf` si nu `split`: un id cu punct ar fi taiat gresit.
  const acum = 1_000_000_000_000;
  const m = citesteMarcaj(valoareMarcaj("a.b.c", acum));
  assert.equal(m?.adminId, "a.b.c");
  assert.equal(m?.expiraLa, acum + DURATA_IMPERSONARE_SEC * 1000);
});

test("fara marcaj nu e nicio impersonare in curs", () => {
  assert.equal(citesteMarcaj(undefined), null);
  assert.equal(citesteMarcaj(""), null);
});

test("forma VECHE (fara termen) se trateaza ca expirata, nu ca fara termen", () => {
  // Directia sigura: la desfasurare, o impersonare deja deschisa se inchide.
  // Alternativa ar fi fost sa ramana pe veci fara termen.
  const m = citesteMarcaj("doar-un-id-de-admin");
  assert.equal(m?.expiraLa, 0);
  assert.ok(Date.now() >= (m?.expiraLa ?? 0), "trebuie sa iasa expirata");
});

test("un termen ilizibil inseamna expirat, nu nelimitat", () => {
  assert.equal(citesteMarcaj("admin-1.nu-e-numar")?.expiraLa, 0);
});

test("secundele ramase nu ajung niciodata zero sau negative", () => {
  const acum = 1_000_000_000_000;
  assert.equal(secundeRamase({ adminId: "a", expiraLa: acum + 10_000 }, acum), 10);
  // Zero ar insemna, la `cookies.set`, „cookie de sesiune" — adica exact invers
  // decat vrem; negativ ar sterge cookie-ul.
  assert.equal(secundeRamase({ adminId: "a", expiraLa: acum - 50_000 }, acum), 1);
});
