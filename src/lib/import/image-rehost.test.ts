import assert from "node:assert/strict";
import { test } from "node:test";
import { rehostProductImages, rehostImageUrl, type CacheRehostare } from "./image-rehost";

/**
 * Rehostarea in PARALEL, si cele doua lucruri pe care le poate strica.
 *
 * Cache-ul e un parametru, deci se poate semana dinainte cu promisiuni gata
 * rezolvate — asa testele nu ating nici reteaua, nici R2, si totusi trec prin
 * exact acelasi cod.
 */

const R2 = "https://pub-abc.r2.dev/products/x.jpg";

function cacheCu(intrari: Record<string, { url: string; ok: boolean }>): CacheRehostare {
  const c: CacheRehostare = new Map();
  for (const [k, v] of Object.entries(intrari)) c.set(k, Promise.resolve(v));
  return c;
}

test("ORDINEA imaginilor se pastreaza, desi se cer deodata", async () => {
  /*
   * Asta e lucrul care putea sa se strice pe tacute la paralelizare: PRIMA
   * imagine e coperta produsului, cea de pe card si din rezultatele cautarii.
   * `Promise.all` intoarce in ordinea INTRARILOR, nu a terminarilor — dar daca
   * cineva ar rescrie bucla cu un `for await` peste o coada, ordinea ar depinde
   * de cine raspunde primul, adica de viteza serverului strain.
   */
  const cache = cacheCu({
    "http://x/1.jpg": { url: "https://pub-abc.r2.dev/1.jpg", ok: true },
    "http://x/2.jpg": { url: "https://pub-abc.r2.dev/2.jpg", ok: true },
    "http://x/3.jpg": { url: "https://pub-abc.r2.dev/3.jpg", ok: true },
  });
  const r = await rehostProductImages(
    ["http://x/1.jpg", "http://x/2.jpg", "http://x/3.jpg"], "biz", "imp", cache);
  assert.deepEqual(r.images, [
    "https://pub-abc.r2.dev/1.jpg",
    "https://pub-abc.r2.dev/2.jpg",
    "https://pub-abc.r2.dev/3.jpg",
  ]);
});

test("adresele deja pe R2 nu se numara nici ca reusite, nici ca esecuri", async () => {
  // Numaratoarea alimenteaza bara de progres: numarate, bara ar fi sarit peste
  // 100% la produsele importate a doua oara.
  const r = await rehostProductImages([R2, R2], "biz", "imp", new Map());
  assert.deepEqual(r.images, [R2, R2]);
  assert.equal(r.done, 0);
  assert.equal(r.failed, 0);
});

test("esecul pastreaza adresa originala si se numara ca esec", async () => {
  const cache = cacheCu({
    "http://x/bun.jpg": { url: "https://pub-abc.r2.dev/bun.jpg", ok: true },
    "http://x/mort.jpg": { url: "http://x/mort.jpg", ok: false },
  });
  const r = await rehostProductImages(["http://x/bun.jpg", "http://x/mort.jpg"], "biz", "imp", cache);
  assert.equal(r.done, 1);
  assert.equal(r.failed, 1);
  // Adresa moarta ramane cum era: un produs cu o poza care nu s-a putut aduce e
  // mai bun decat unul cu o adresa inventata.
  assert.deepEqual(r.images, ["https://pub-abc.r2.dev/bun.jpg", "http://x/mort.jpg"]);
});

test("aceeasi adresa ceruta de doua ori primeste ACEEASI promisiune", async () => {
  /*
   * Asta e proprietatea care face paralelizarea sigura. Cu un cache de siruri,
   * doi lucratori pot rata amandoi cache-ul in aceeasi clipa, ar descarca poza de
   * doua ori si ar urca DOUA obiecte in R2 — spatiu platit dublu si doua adrese
   * pentru aceeasi imagine. Cu promisiuni, al doilea o asteapta pe a primului.
   */
  const cache: CacheRehostare = new Map();
  let apeluri = 0;
  const promisiune = Promise.resolve({ url: "https://pub-abc.r2.dev/unu.jpg", ok: true });
  cache.set("http://x/unu.jpg", (async () => { apeluri++; return promisiune; })());

  const [a, b] = await Promise.all([
    rehostImageUrl("http://x/unu.jpg", "biz", "imp", cache),
    rehostImageUrl("http://x/unu.jpg", "biz", "imp", cache),
  ]);
  assert.deepEqual(a, b);
  assert.equal(apeluri, 1, "a doua cerere trebuie sa astepte promisiunea primei, nu sa porneasca alta");
  assert.equal(cache.size, 1);
});

test("o adresa deja pe R2 nu intra deloc in cache", async () => {
  // Nu e nimic de rehostat, deci nici de retinut; altfel cache-ul unui import mare
  // ar tine degeaba fiecare adresa deja buna.
  const cache: CacheRehostare = new Map();
  const r = await rehostImageUrl(R2, "biz", "imp", cache);
  assert.deepEqual(r, { url: R2, ok: true });
  assert.equal(cache.size, 0);
});
