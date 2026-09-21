import test from "node:test";
import assert from "node:assert/strict";

import type { WootCity, WootCounty } from "@/lib/woot";
import { destinatarulComenzii } from "./destinatar";

const JUDETE = [
  { id: 1, name: "Bucuresti" },
  { id: 2, name: "Cluj" },
  { id: 3, name: "Maramures" },
] as WootCounty[];

const ORASE: Record<number, WootCity[]> = {
  1: [
    { id: 11, name: "Sectorul 1" }, { id: 15, name: "Sectorul 5" }, { id: 16, name: "Sectorul 6" },
  ] as WootCity[],
  2: [{ id: 21, name: "Cluj-Napoca" }, { id: 22, name: "Turda" }] as WootCity[],
  3: [{ id: 31, name: "Baia Mare" }] as WootCity[],
};

const orase = async (id: number) => ORASE[id] ?? [];

function comanda(shipping_address: unknown, rest: Partial<{ customer_name: string; customer_phone: string; customer_email: string }> = {}) {
  return {
    customer_name: "Ion Popescu", customer_phone: "0712345678", customer_email: "ion@mail.ro",
    ...rest, shipping_address,
  };
}

test("o comanda obisnuita da destinatarul intreg", async () => {
  const d = await destinatarulComenzii(
    comanda({ county: "Cluj", city: "Cluj-Napoca", street: "Str. Memorandumului", street_no: "12" }),
    JUDETE, orase,
  );
  assert.equal(d?.city_id, 21);
  assert.equal(d?.country_id, 189);
  assert.equal(d?.contact, "Ion Popescu");
  assert.match(d!.address, /Memorandumului/);
  assert.match(d!.address, /12/);
});

test("⚠ „Municipiul Bucuresti” se potriveste, fiindca asa scrie chiar checkoutul nostru", async () => {
  /*
   * 25 de comenzi adevarate au judetul scris asa, din care 23 cu AWB Woot. O potrivire
   * pe egalitate simpla le-ar fi sarit pe toate.
   */
  const d = await destinatarulComenzii(
    comanda({ county: "Municipiul Bucuresti", city: "Sectorul 5", address: "Str. Test nr. 1" }),
    JUDETE, orase,
  );
  assert.equal(d?.city_id, 15);
});

test("⚠⚠ „Sector 5” gaseste „Sectorul 5”, desi nu-i e prefix", async () => {
  /*
   * Asa isi numeste Woot sectoarele, si asa le scriu cumparatorii. Potrivirea pe
   * egalitate sau prefix cadea exact aici.
   */
  const d = await destinatarulComenzii(
    comanda({ county: "Bucuresti", city: "Sector 5", address: "Str. Test nr. 1" }),
    JUDETE, orase,
  );
  assert.equal(d?.city_id, 15);
});

test("⚠ sectorul scris doar in ADRESA, nu in oras", async () => {
  /* „Constantin Ghercu nr 1 sector 6" e o comanda adevarata. */
  const d = await destinatarulComenzii(
    comanda({ county: "Bucuresti", city: "Bucuresti", address: "Constantin Ghercu nr 1 sector 6" }),
    JUDETE, orase,
  );
  assert.equal(d?.city_id, 16);
});

test("⚠ judetul necunoscut NU se acopera cu o rezerva", async () => {
  /*
   * O localitate ghicita ar trimite coletul in alt oras, iar la un lot nimeni nu se uita
   * la fiecare rand. Comanda trebuie sa iasa `null`, ca sa fie sarita si spusa pe nume.
   */
  const d = await destinatarulComenzii(
    comanda({ county: "Judetul Inexistent", city: "Ceva", address: "Str. X nr. 1" }),
    JUDETE, orase,
  );
  assert.equal(d, null);
});

test("⚠ localitatea necunoscuta in judetul gasit iese tot `null`", async () => {
  const d = await destinatarulComenzii(
    comanda({ county: "Cluj", city: "Sat Inexistent", address: "Str. X nr. 1" }),
    JUDETE, orase,
  );
  assert.equal(d, null);
});

test("⚠ fara nicio adresa scrisa, comanda nu pleaca", async () => {
  /* N-ar avea ce scrie pe AWB, si curierul ar refuza-o oricum — dar dupa ce a costat. */
  const d = await destinatarulComenzii(
    comanda({ county: "Cluj", city: "Turda", address: "", street: "", street_no: "" }),
    JUDETE, orase,
  );
  assert.equal(d, null);
});

test("emailul gol nu se trimite ca sir gol", async () => {
  const d = await destinatarulComenzii(
    comanda({ county: "Cluj", city: "Turda", address: "Str. X nr. 1" }, { customer_email: "" }),
    JUDETE, orase,
  );
  assert.equal(d?.email, undefined);
});

test("⚠ orasele se cer DOAR pentru judetul gasit", async () => {
  /*
   * Cincizeci de comenzi inseamna cincizeci de cautari; cerand toata tara la fiecare,
   * lotul ar fi trecut de bugetul de timp inainte sa emita ceva.
   */
  const cerute: number[] = [];
  await destinatarulComenzii(
    comanda({ county: "Maramures", city: "Baia Mare", address: "Str. X nr. 1" }),
    JUDETE,
    async (id) => { cerute.push(id); return ORASE[id] ?? []; },
  );
  assert.deepEqual(cerute, [3]);
});

test("⚠ judetul negasit nu mai cere NICIO lista de orase", async () => {
  let cereri = 0;
  const d = await destinatarulComenzii(
    comanda({ county: "Nimic", city: "Nimic", address: "Str. X" }),
    JUDETE,
    async (id) => { cereri++; return ORASE[id] ?? []; },
  );
  assert.equal(d, null);
  assert.equal(cereri, 0);
});
