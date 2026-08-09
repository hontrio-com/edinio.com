import assert from "node:assert/strict";
import { test } from "node:test";
import { interpreteazaRevendicarea } from "./verdict-stoc";

test("numai {ok:true} lasa comanda sa treaca", () => {
  assert.equal(interpreteazaRevendicarea({ ok: true }, null).fel, "revendicat");
});

test("EROARE de RPC opreste comanda — NU o lasa pe algoritmul vechi", () => {
  /*
   * Inima fixului din 19.08. Pana atunci aici se intorcea `nerevendicat`, iar
   * apelantii scadeau stocul pe calea veche, care plafoneaza in loc sa refuze —
   * adica supravanzarea se redeschidea singura ori de cate ori RPC-ul pica.
   */
  const v = interpreteazaRevendicarea(null, { message: "schema cache stale" });
  assert.equal(v.fel, "esuat");
  assert.notEqual(v.fel, "revendicat");
});

test("refuzul adevarat ramane refuz, cu mesajul marimii", () => {
  const v = interpreteazaRevendicarea(
    { ok: false, nume: "Pique Polo", varianta: "4XL", disponibil: 0 }, null);
  assert.equal(v.fel, "refuzat");
  assert.ok("error" in v && v.error.includes("4XL"), JSON.stringify(v));
});

test("raspuns de forma neasteptata OPRESTE, nu presupune", () => {
  // Nici „a mers", nici „n-a mers": nu stim. Necunoscutul nu are voie sa treaca.
  for (const d of [null, undefined, {}, { ok: "da" }, [], 42, "gata"]) {
    assert.equal(interpreteazaRevendicarea(d, null).fel, "esuat", `pentru ${JSON.stringify(d)}`);
  }
});

test("eroarea are intaietate chiar daca vine si un corp care pare bun", () => {
  // Un client care intoarce SI date SI eroare nu e de crezut pe date.
  const v = interpreteazaRevendicarea({ ok: true }, { message: "timeout" });
  assert.equal(v.fel, "esuat");
});

test("NICIUNA dintre intrarile posibile nu produce o scadere de stoc pe calea veche", () => {
  /*
   * Proba de fond: oricat de ciudat ar fi raspunsul, singurele iesiri sunt
   * „revendicat" (stocul E rezervat) si o oprire. Nu exista a treia stare prin
   * care comanda sa intre cu stocul nescazut.
   */
  const intrari: [unknown, { message?: string } | null][] = [
    [{ ok: true }, null], [{ ok: false }, null], [null, null], [undefined, null],
    [{}, null], [{ ok: 1 }, null], [null, { message: "x" }], [{ ok: true }, { message: "x" }],
  ];
  for (const [d, e] of intrari) {
    const fel = interpreteazaRevendicarea(d, e).fel;
    assert.ok(["revendicat", "refuzat", "esuat"].includes(fel));
    if (fel === "revendicat") assert.deepEqual([d, e], [{ ok: true }, null]);
  }
});
