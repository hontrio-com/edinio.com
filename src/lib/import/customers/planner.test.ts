import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCustomerPlan, customerKey, summarizeCustomerPlan } from "./planner";
import { autoMapCustomerColumns, readCustomerRows } from "./mapping";
import { parseCsv } from "@/lib/import/csv";
import type { CustomerFeedRow, ExistingCustomer } from "./types";

/**
 * Ce apara testele astea: ca un import de clienti nu poate dubla un cumparator
 * existent si nu poate suprascrie date deja bune.
 */

function rand(i: number, over: Partial<CustomerFeedRow> = {}): CustomerFeedRow {
  return {
    rowIndex: i,
    name: `Client ${i}`,
    email: `client${i}@exemplu.ro`,
    phone: `07220000${String(i).padStart(2, "0")}`,
    address: null, city: null, county: null, postcode: null, externalId: null,
    ...over,
  };
}

const gol = new Map<string, ExistingCustomer>();
const fara = new Set<string>();

// ── Cheia, oglinda coloanei generate din baza ───────────────────────────────

test("cheia e telefonul normalizat, iar emailul e doar rezerva", () => {
  assert.equal(customerKey("0722555555", "a@b.ro"), "722555555");
  assert.equal(customerKey("+40722555555", "a@b.ro"), "722555555");
  assert.equal(customerKey("0040722555555", null), "722555555");
  assert.equal(customerKey(null, "A@B.ro"), "email:a@b.ro");
  assert.equal(customerKey("", "  A@B.RO  "), "email:a@b.ro");
});

test("fara telefon si fara email nu exista cheie", () => {
  assert.equal(customerKey(null, null), null);
  assert.equal(customerKey("", "   "), null);
  /* Fara cifre in telefon se cade pe email, nu se inventeaza o cheie. */
  assert.equal(customerKey("fara numar", "a@b.ro"), "email:a@b.ro");
});

test("emailul stricat da tot o cheie: baza nu cere @, deci nici noi", () => {
  // Daca am cere „@” aici, randul ar fi respins de noi si acceptat de baza,
  // iar cele doua s-ar despartii.
  assert.equal(customerKey(null, "enegianin"), "email:enegianin");
});

// ── Randuri fara cheie ─────────────────────────────────────────────────────

test("randul fara telefon si fara email e respins, cu motiv", () => {
  const plan = buildCustomerPlan([rand(1, { phone: null, email: null })], gol, fara);
  assert.equal(plan.toInsert.length, 0);
  assert.equal(plan.issues.length, 1);
  assert.equal(plan.issues[0].problem, "no_key");
});

// ── Contopirea randurilor din acelasi fisier ────────────────────────────────

test("acelasi client pe doua randuri devine o fisa, cu datele unite", () => {
  const plan = buildCustomerPlan(
    [
      rand(1, { phone: "0722555555", address: null, city: "Cluj" }),
      rand(2, { phone: "+40722555555", address: "Str. Lunga 5", city: null, name: "" }),
    ],
    gol,
    fara,
  );

  assert.equal(plan.toInsert.length, 1, "o singura fisa");
  const c = plan.toInsert[0];
  assert.equal(c.name, "Client 1", "numele de la primul rand");
  assert.equal(c.city, "Cluj", "orasul exista doar la primul");
  assert.equal(c.address, "Str. Lunga 5", "adresa exista doar la al doilea si NU se pierde");
  assert.equal(plan.issues.length, 1);
  assert.equal(plan.issues[0].problem, "merged_duplicate");
  assert.match(plan.issues[0].detail, /randul 1/);
});

// ── Fata de ce exista deja ─────────────────────────────────────────────────

test("o fisa existenta se completeaza doar la goluri, nu se suprascrie", () => {
  const existente = new Map<string, ExistingCustomer>([
    ["722555555", {
      id: "c1", name: "Nume Corectat De Mana", email: null, phone: "0722555555",
      address: null, city: "Brasov", county: null, postcode: null, externalId: null,
    }],
  ]);

  const plan = buildCustomerPlan(
    [rand(1, {
      phone: "0722555555", name: "Nume Vechi Din Export", email: "nou@exemplu.ro",
      city: "Cluj", address: "Str. Noua 1",
    })],
    existente,
    fara,
  );

  assert.equal(plan.toInsert.length, 0, "nu se adauga inca o data");
  assert.equal(plan.toUpdate.length, 1);
  const patch = plan.toUpdate[0].patch;
  assert.equal(patch.email, "nou@exemplu.ro", "emailul lipsea, se completeaza");
  assert.equal(patch.address, "Str. Noua 1", "adresa lipsea, se completeaza");
  assert.equal(patch.name, undefined, "numele exista: NU se atinge");
  assert.equal(patch.city, undefined, "orasul exista: NU se atinge");
  assert.equal(plan.toUpdate[0].id, "c1");
});

test("cand nu e nimic de completat, fisa nu se atinge deloc", () => {
  const existente = new Map<string, ExistingCustomer>([
    ["722555555", {
      id: "c1", name: "Client 1", email: "client1@exemplu.ro", phone: "0722555555",
      address: "Str. A", city: "Cluj", county: "Cluj", postcode: "400000", externalId: "9",
    }],
  ]);
  const plan = buildCustomerPlan([rand(1, { phone: "0722555555" })], existente, fara);
  assert.equal(plan.toUpdate.length, 0);
  assert.equal(plan.toInsert.length, 0);
});

test("un client care are deja comenzi se numara ca urmand sa se contopeasca", () => {
  const plan = buildCustomerPlan(
    [rand(1, { phone: "0722555501" }), rand(2, { phone: "0722555502" })],
    gol,
    new Set(["722555501"]),
  );
  assert.equal(plan.toInsert.length, 2, "amandoi intra in tabel");
  assert.equal(plan.willMergeWithOrders, 1, "unul se lipeste de fisa lui din comenzi");
});

// ── Semnalari, fara pierdere de date ───────────────────────────────────────

test("telefonul ciudat si emailul fara @ sunt semnalate, dar clientul intra", () => {
  const plan = buildCustomerPlan(
    [
      rand(1, { phone: "0762619122 sau 0749113604" }),
      rand(2, { phone: null, email: "enegianin" }),
    ],
    gol,
    fara,
  );
  assert.equal(plan.toInsert.length, 2, "nu se pierde niciun contact");
  assert.equal(plan.oddPhones, 1);
  assert.equal(plan.oddEmails, 1);
});

// ── Drumul intreg, pe antetul real de OpenCart ─────────────────────────────

test("un export OpenCart se citeste cap-coada", () => {
  const csv = [
    "Customer id;Firstname;Lastname;Email;Telephone;Address_1;Address_2;City;Postcode;is_registered",
    "1;Alina;Stancu;alina@exemplu.ro;0722555555;Bucuresti 2;;Bucuresti;021823;1",
    "2;Nitu;Pompiliu;pompiliu@exemplu.ro;0769662729;Str. Gheorghe 5;;Tecuci;6200;1",
  ].join("\n");

  const parsed = parseCsv(csv);
  const mapping = autoMapCustomerColumns(parsed.headers);

  assert.equal(mapping.firstName, "Firstname");
  assert.equal(mapping.lastName, "Lastname");
  assert.equal(mapping.name, undefined, "nu exista coloana de nume intreg");
  assert.equal(mapping.email, "Email");
  assert.equal(mapping.phone, "Telephone");
  assert.equal(mapping.address, "Address_1", "prima coloana de adresa, nu a doua");
  assert.equal(mapping.city, "City");
  assert.equal(mapping.postcode, "Postcode");
  assert.equal(mapping.externalId, "Customer id");

  const rows = readCustomerRows(parsed, mapping);
  assert.equal(rows[0].name, "Alina Stancu", "prenumele si numele se lipesc");
  assert.equal(rows[0].postcode, "021823");
  assert.equal(rows[0].externalId, "1");

  const plan = buildCustomerPlan(rows, gol, fara);
  const s = summarizeCustomerPlan(plan);
  assert.equal(s.newCustomers, 2);
  assert.equal(s.no_key, 0);
  assert.equal(plan.toInsert[0].key, "722555555");
});

test("o coloana de nume intreg bate prenumele si numele", () => {
  const parsed = parseCsv("Nume complet;Firstname;Email\nIon Popescu;Ion;ion@exemplu.ro");
  const mapping = autoMapCustomerColumns(parsed.headers);
  assert.equal(mapping.name, "Nume complet");
  assert.equal(mapping.firstName, undefined);
  assert.equal(readCustomerRows(parsed, mapping)[0].name, "Ion Popescu");
});
