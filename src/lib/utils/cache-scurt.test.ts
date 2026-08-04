import { test } from "node:test";
import assert from "node:assert/strict";
import { CacheScurt } from "./cache-scurt";

/**
 * Controleaza timpul, ca testele sa nu depinda de asteptari reale.
 *
 * `await` pe apel: prima varianta era sincrona si restaura `Date.now` inainte
 * ca functia asincronă din interior sa apuce sa ruleze, deci ceasul fals nu
 * avea niciun efect si testele treceau/cadeau din alt motiv decat cel testat.
 */
async function cuCeasFals(f: (avanseaza: (ms: number) => void) => Promise<void>): Promise<void> {
  const original = Date.now;
  let acum = 1_000_000;
  Date.now = () => acum;
  try {
    await f((ms) => { acum += ms; });
  } finally {
    Date.now = original;
  }
}

test("a doua cerere identica nu mai calculeaza", async () => {
  const c = new CacheScurt<string>(60_000);
  let apeluri = 0;
  const calc = async () => { apeluri++; return "magazin-x"; };

  assert.equal(await c.iaSau("client.ro", calc), "magazin-x");
  assert.equal(await c.iaSau("client.ro", calc), "magazin-x");
  assert.equal(await c.iaSau("client.ro", calc), "magazin-x");
  assert.equal(apeluri, 1, "trei cereri, un singur drum la baza");
});

test("dupa expirare se calculeaza din nou", async () => {
  await cuCeasFals(async (avanseaza) => {
    const c = new CacheScurt<string>(60_000);
    let apeluri = 0;
    const calc = async () => { apeluri++; return "v" + apeluri; };

    assert.equal(await c.iaSau("k", calc), "v1");
    avanseaza(59_000);
    assert.equal(await c.iaSau("k", calc), "v1", "inca valabil");
    avanseaza(2_000);
    assert.equal(await c.iaSau("k", calc), "v2", "a expirat");
  });
});

test("un raspuns NEGATIV se tine mai putin decat unul pozitiv", async () => {
  await cuCeasFals(async (avanseaza) => {
    const c = new CacheScurt<string | null>(60_000);
    let apeluri = 0;
    const calc = async () => { apeluri++; return null; };
    const eGol = (v: string | null) => v === null;

    await c.iaSau("domeniu-nou.ro", calc, eGol, 15_000);
    avanseaza(16_000);
    await c.iaSau("domeniu-nou.ro", calc, eGol, 15_000);
    assert.equal(apeluri, 2,
      "un domeniu tocmai conectat nu trebuie sa ramana 404 un minut intreg");
  });
});

test("plafonul tine harta marginita", () => {
  const c = new CacheScurt<number>(60_000, 3);
  for (let i = 0; i < 50; i++) c.set("gazda-" + i, i);
  assert.equal(c.marime, 3, "gazde inventate nu pot umfla memoria instantei");
});

test("evacuarea arunca ce nu s-a mai cerut, nu ce se cere des", () => {
  const c = new CacheScurt<number>(60_000, 3);
  c.set("a", 1); c.set("b", 2); c.set("c", 3);
  c.get("a");             // „a" redevine cel mai recent folosit
  c.set("d", 4);          // depaseste plafonul -> cade cel mai vechi ATINS („b")
  assert.equal(c.get("a"), 1, "gazda ceruta des a supravietuit");
  assert.equal(c.get("b"), undefined, "cea neatinsa a fost aruncata");
  assert.equal(c.get("c"), 3);
  assert.equal(c.get("d"), 4);
});

test("valoarea false/0 se cacheaza, nu se confunda cu „lipseste”", async () => {
  const c = new CacheScurt<boolean>(60_000);
  let apeluri = 0;
  const calc = async () => { apeluri++; return false; };
  await c.iaSau("k", calc);
  await c.iaSau("k", calc);
  assert.equal(apeluri, 1, "`false` e un raspuns valid, nu absenta lui");
});

test("`null` e o valoare cachuita, nu o cheie lipsa", async () => {
  // Proxy-ul se bazeaza pe distinctia asta: „domeniul nu exista" (null, cachuit)
  // trebuie sa fie altceva decat „nu am intrebat inca" (undefined, nu e in harta).
  const c = new CacheScurt<string | null>(60_000);
  let apeluri = 0;
  const calc = async () => { apeluri++; return null; };
  await c.iaSau("gazda-necunoscuta", calc, undefined, undefined);
  await c.iaSau("gazda-necunoscuta", calc, undefined, undefined);
  assert.equal(apeluri, 1, "un raspuns negativ nu trebuie reinterogat la fiecare cerere");
  assert.equal(c.get("gazda-necunoscuta"), null, "cache HIT cu valoarea null");
  assert.equal(c.get("alta-gazda"), undefined, "cache MISS e undefined, nu null");
});

test("stergerea tintita forteaza recalcularea doar pentru cheia ei", async () => {
  const c = new CacheScurt<string>(60_000);
  await c.iaSau("a", async () => "1");
  await c.iaSau("b", async () => "2");
  c.sterge("a");
  assert.equal(await c.iaSau("a", async () => "3"), "3");
  assert.equal(await c.iaSau("b", async () => "9"), "2", "„b” a ramas neatins");
});
