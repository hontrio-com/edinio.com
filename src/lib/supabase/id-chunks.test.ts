import { strict as assert } from "node:assert";
import { test } from "node:test";
import { bucatiDeIduri, ID_PER_CERERE } from "./id-chunks";

/*
 * De ce probe, cand functia are patru randuri:
 *
 * Fiindca greseala pe care o repara NU se vede la citit. Plafonul vechi din
 * `bulkProductAction` era 1000, iar pragul masurat al platformei e intre 600 si
 * 700 — un numar arata la fel de rezonabil ca celalalt pe ecran. Proba de mai
 * jos leaga marimea bucatii de o limita SCRISA, ca urmatorul care o mareste „ca
 * sa mearga mai repede" sa afle imediat, nu din reclamatia unui magazin cu 3000
 * de produse.
 */

test("bucatile nu depasesc niciodata marimea ceruta", () => {
  const ids = Array.from({ length: 3351 }, (_, i) => `id-${i}`);
  for (const b of bucatiDeIduri(ids)) assert.ok(b.length <= ID_PER_CERERE);
});

test("nu se pierde si nu se dubleaza niciun id", () => {
  const ids = Array.from({ length: 3351 }, (_, i) => `id-${i}`);
  const iesite = bucatiDeIduri(ids).flat();
  assert.equal(iesite.length, ids.length);
  assert.deepEqual(iesite, ids, "ordinea si continutul trebuie sa ramana identice");
  assert.equal(new Set(iesite).size, ids.length);
});

test("lista goala da ZERO bucati, nu una goala", () => {
  /* Altfel apelantul ar trimite o cerere cu `in.()`, care e si inutila si
     eroare de sintaxa la PostgREST. */
  assert.deepEqual(bucatiDeIduri([]), []);
});

test("o lista mai scurta decat bucata ramane o singura bucata", () => {
  assert.deepEqual(bucatiDeIduri(["a", "b"]), [["a", "b"]]);
});

test("cand lungimea se imparte exact, nu apare o bucata goala la coada", () => {
  const ids = Array.from({ length: 400 }, (_, i) => i);
  const b = bucatiDeIduri(ids);
  assert.equal(b.length, 2);
  assert.equal(b[1].length, ID_PER_CERERE);
});

test("marimea bucatii sta SUB pragul masurat al platformei", () => {
  /* Masurat 2026-08-11 pe proiectul real: 600 de id-uri trec, 700 dau 400.
     Daca cineva urca `ID_PER_CERERE` peste prag, proba asta cade INAINTE de
     productie. Vezi socoteala din `id-chunks.ts`. */
  const PRAG_MASURAT = 600;
  assert.ok(
    ID_PER_CERERE <= PRAG_MASURAT / 2,
    `ID_PER_CERERE=${ID_PER_CERERE} e prea aproape de pragul masurat (${PRAG_MASURAT}); adresa mai contine si celelalte filtre`,
  );
});

test("o marime invalida se opreste pe loc, nu produce o bucla fara sfarsit", () => {
  assert.throws(() => bucatiDeIduri(["a"], 0));
});
