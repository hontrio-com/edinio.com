import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASEZARE_IMPLICITA, MAX_ORDINE_MANUALA, amestecaBiti, cheieAmestec, citesteAsezare,
  hartaOrdine, samantaAmestec, sortareaAsezarii, ziuaMagazinului,
} from "./asezare";

/* ── Citirea din page_content ─────────────────────────────────────────────── */

test("fara home_order ramane asezarea implicita", () => {
  assert.deepEqual(citesteAsezare({}), ASEZARE_IMPLICITA);
  assert.deepEqual(citesteAsezare(null), ASEZARE_IMPLICITA);
  assert.deepEqual(citesteAsezare(undefined), ASEZARE_IMPLICITA);
});

test("un mod necunoscut cade pe implicit, nu goleste grila", () => {
  // Vine din page_content, adica dintr-un JSON care poate purta orice ramasita.
  assert.equal(citesteAsezare({ home_order: { mod: "dupa-culoare" } }).mod, "");
  assert.equal(citesteAsezare({ home_order: { mod: 7 } }).mod, "");
});

test("„manual” nu poate fi si ordinea restului", () => {
  // Altfel comparatorul s-ar chema pe el insusi la nesfarsit.
  assert.equal(citesteAsezare({ home_order: { mod: "manual", rest: "manual" } }).rest, "newest");
});

test("id-urile care nu sunt text se arunca", () => {
  /*
   * Lista pleaca si spre SQL. Un `null` in tablou face `array_position` sa
   * intoarca null pentru TOATE randurile, deci ordinea manuala ar fi disparut
   * fara nicio eroare.
   */
  const a = citesteAsezare({ home_order: { mod: "manual", ids: ["a", null, 3, "", "b"] } });
  assert.deepEqual(a.ids, ["a", "b"]);
});

test("lista manuala se taie la plafon", () => {
  const multe = Array.from({ length: MAX_ORDINE_MANUALA + 40 }, (_, i) => `id-${i}`);
  assert.equal(citesteAsezare({ home_order: { mod: "manual", ids: multe } }).ids.length, MAX_ORDINE_MANUALA);
});

test("ids nu e tablou → lista goala, nu exceptie", () => {
  assert.deepEqual(citesteAsezare({ home_order: { mod: "manual", ids: "a,b" } }).ids, []);
});

test("un id repetat pastreaza PRIMA aparitie si dispare din rest", () => {
  /*
   * ⚠ Fara asta, cele doua parti aleg altfel: `Map` din TS pastreaza ULTIMA
   * aparitie, iar o cautare de pozitie o da pe PRIMA. Acelasi numar de produse,
   * alta ordine — si numai la magazinele care au apucat sa repete un id.
   */
  const a = citesteAsezare({ home_order: { mod: "manual", ids: ["x", "y", "x", "z"] } });
  assert.deepEqual(a.ids, ["x", "y", "z"]);
  assert.deepEqual(hartaOrdine(a.ids), { x: 0, y: 1, z: 2 });
});

test("plafonul se aplica dupa scoaterea dublurilor", () => {
  const cu = ["a", "a", "a", ...Array.from({ length: MAX_ORDINE_MANUALA }, (_, i) => `id-${i}`)];
  const ids = citesteAsezare({ home_order: { mod: "manual", ids: cu } }).ids;
  assert.equal(ids.length, MAX_ORDINE_MANUALA);
  assert.equal(new Set(ids).size, MAX_ORDINE_MANUALA);
});

test("hartaOrdine da exact pozitiile, in forma pe care o citeste SQL", () => {
  assert.deepEqual(hartaOrdine([]), {});
  assert.deepEqual(hartaOrdine(["p1", "p2", "p3"]), { p1: 0, p2: 1, p3: 2 });
});

test("harta si comparatorul din browser spun acelasi lucru", () => {
  // Perechea din SQL e `(ordine ->> product_id)::int`; aici e `Map.get`. Daca
  // cele doua ar diverge, palierul server si cel client ar aseza altfel.
  const ids = ["a", "b", "c", "d"];
  const harta = hartaOrdine(ids);
  const dinBrowser = new Map(ids.map((id, i) => [id, i]));
  for (const id of ids) assert.equal(harta[id], dinBrowser.get(id));
  assert.equal(harta["inexistent"], undefined);
});

/* ── Sortarea efectiva ────────────────────────────────────────────────────── */

test("asezarea bate default_sort, iar lipsa ei il pastreaza", () => {
  assert.equal(sortareaAsezarii({ mod: "random", ids: [], rest: "newest" }, "price_asc"), "random");
  // Magazinele care aveau default_sort scris raman EXACT pe el.
  assert.equal(sortareaAsezarii(ASEZARE_IMPLICITA, "price_asc"), "price_asc");
  assert.equal(sortareaAsezarii(ASEZARE_IMPLICITA, undefined), "newest");
});

/* ── Amestecul ────────────────────────────────────────────────────────────── */

test("amestecaBiti ramane pe 32 de biti si e determinist", () => {
  for (const x of [0, 1, 20260903, 0xffffffff]) {
    const h = amestecaBiti(x);
    assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff, `${x} → ${h}`);
    assert.equal(h, amestecaBiti(x));
  }
});

test("amestecaBiti chiar amesteca: intrari vecine dau iesiri fara legatura", () => {
  /*
   * Proba care conteaza. Fara amestec, doua zile consecutive ar fi dat samante
   * vecine, iar XOR-ul cu o samanta vecina lasa ordinea aproape neatinsa — adica
   * „amestecat" care nu se schimba de la o zi la alta.
   */
  const a = amestecaBiti(20260903);
  const b = amestecaBiti(20260904);
  let bitiDiferiti = 0;
  for (let i = 0; i < 32; i++) if (((a >>> i) & 1) !== ((b >>> i) & 1)) bitiDiferiti++;
  assert.ok(bitiDiferiti >= 8, `doar ${bitiDiferiti} biti difera intre doua zile vecine`);
});

test("ziua magazinului e in fusul romanesc, nu in cel al serverului", () => {
  /*
   * Pe Vercel serverul e pe UTC. La 21:30 UTC in august e deja ziua urmatoare la
   * Bucuresti (UTC+3), si asta trebuie sa se vada — altfel ordinea s-ar fi
   * schimbat la ora 3 dimineata in loc de miezul noptii.
   */
  assert.equal(ziuaMagazinului(new Date("2026-08-14T21:30:00Z")), 20260815);
  assert.equal(ziuaMagazinului(new Date("2026-08-14T20:30:00Z")), 20260814);
  // Iarna e UTC+2, deci pragul se muta cu o ora.
  assert.equal(ziuaMagazinului(new Date("2026-01-14T22:30:00Z")), 20260115);
});

test("samanta e aceeasi toata ziua si alta a doua zi", () => {
  const dimineata = samantaAmestec(new Date("2026-08-14T05:00:00Z"));
  const seara = samantaAmestec(new Date("2026-08-14T19:00:00Z"));
  assert.equal(dimineata, seara, "paginarea se rupe daca samanta se schimba in cursul zilei");
  assert.notEqual(dimineata, samantaAmestec(new Date("2026-08-15T10:00:00Z")));
});

test("cheieAmestec e pe 32 de biti si nu iese negativa", () => {
  // `^` in JS lucreaza pe int32 cu semn: fara `>>> 0` iesea -1 pentru capat.
  const k = cheieAmestec("ffffffff-0000-0000-0000-000000000000", 0);
  assert.equal(k, 4294967295);
  assert.ok(cheieAmestec("ffffffff-0000-0000-0000-000000000000", 0xffffffff) >= 0);
});

test("un id fara hex valid nu produce NaN", () => {
  // Un NaN intors dintr-un comparator nu strica un rand, strica sortarea TOATA.
  assert.equal(cheieAmestec("zzzzzzzz-0000-0000-0000-000000000000", 123), 123);
});

test("amestecul chiar reaseaza lista, si ramane stabil in aceeasi zi", () => {
  const ids = Array.from({ length: 200 }, (_, i) =>
    `${(i * 2654435761 >>> 0).toString(16).padStart(8, "0")}-0000-0000-0000-000000000000`);
  const dupaId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const ordoneaza = (s: number) =>
    [...ids].sort((a, b) => (cheieAmestec(a, s) - cheieAmestec(b, s)) || dupaId(a, b));

  const azi = ordoneaza(samantaAmestec(new Date("2026-08-14T10:00:00Z")));
  // 20:00 UTC = 23:00 la Bucuresti, adica tot 14. La 23:00 UTC ar fi fost deja 15.
  const totAzi = ordoneaza(samantaAmestec(new Date("2026-08-14T20:00:00Z")));
  const maine = ordoneaza(samantaAmestec(new Date("2026-08-15T10:00:00Z")));

  assert.deepEqual(azi, totAzi, "aceeasi zi trebuie sa dea aceeasi ordine");
  const mutate = maine.filter((x, i) => x !== azi[i]).length;
  assert.ok(mutate > ids.length * 0.8, `doar ${mutate} din ${ids.length} produse s-au mutat`);
});
