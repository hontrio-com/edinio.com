import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  CATEGORII, TOATE_CHEILE_ACCEPTATE, durataScurta, esteCategorieDeAles, mediana,
  numeleCategoriei, stareaTichetului, timpiDePrimRaspuns,
} from "./tichete";

/*
  CE APARA PROBELE ASTEA

  1. „Asteapta raspunsul tau" se judeca dupa CINE A SCRIS ULTIMUL, nu dupa
     `has_unread_reply`. Cu steagul, tichetul la care echipa te intreaba ceva
     disparea din cifra in clipa in care il deschideai, fara sa fi raspuns.
  2. Categoriile din cod sunt aceleasi cu cele din constrangerea bazei. O
     categorie noua scrisa doar aici ar fi trecut de ruta si ar fi cazut in baza
     cu 23514, adica „Eroare la crearea tichetului" fara alt indiciu.
*/

test("ultimul mesaj al echipei, pe un tichet deschis: asteapta raspunsul tau", () => {
  assert.equal(stareaTichetului({ status: "in_progress", ultimulMesajDe: "agent" }), "raspunsul_tau");
  assert.equal(stareaTichetului({ status: "open", ultimulMesajDe: "agent" }), "raspunsul_tau");
});

test("dupa ce raspunzi, mingea trece la echipa chiar daca starea din baza ramane in_progress", () => {
  assert.equal(stareaTichetului({ status: "in_progress", ultimulMesajDe: "user" }), "la_noi");
});

test("rezolvat si inchis bat cine a scris ultimul", () => {
  assert.equal(stareaTichetului({ status: "resolved", ultimulMesajDe: "agent" }), "rezolvat");
  assert.equal(stareaTichetului({ status: "closed", ultimulMesajDe: "agent" }), "inchis");
});

test("tichet fara niciun mesaj citit: e la echipa", () => {
  assert.equal(stareaTichetului({ status: "open", ultimulMesajDe: null }), "la_noi");
});

test("cele opt categorii cerute, in ordinea din formular", () => {
  assert.deepEqual(CATEGORII.map((c) => c.eticheta), [
    "Magazin și design", "Produse", "Comenzi", "Clienți",
    "Plăți", "Integrări", "Cont și abonament", "Probleme tehnice",
  ]);
});

test("categoriile vechi raman lizibile, dar nu se mai pot alege", () => {
  assert.equal(numeleCategoriei("billing"), "Facturare");
  assert.equal(numeleCategoriei("other"), "Altele");
  assert.equal(esteCategorieDeAles("billing"), false);
  assert.equal(esteCategorieDeAles("feature"), false);
  assert.equal(esteCategorieDeAles("orders"), true);
  assert.equal(esteCategorieDeAles(42), false);
});

test("constrangerea din baza accepta exact cheile din cod", () => {
  const sql = readFileSync(
    new URL("../../../migrations/2026-09-25-suport-categorii.sql", import.meta.url), "utf8",
  );
  const regula = sql.slice(sql.indexOf("add constraint support_tickets_category_check"));
  assert.ok(regula.length > 0, "constrangerea nu e in migratie");
  const dinBaza = [...regula.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(dinBaza, [...TOATE_CHEILE_ACCEPTATE].sort());
});

test("timpul de raspuns ia PRIMUL mesaj al echipei si sare tichetele fara raspuns", () => {
  const t = timpiDePrimRaspuns([
    {
      created_at: "2026-09-20T10:00:00Z",
      mesaje: [
        { sender_type: "user", created_at: "2026-09-20T10:00:00Z" },
        { sender_type: "agent", created_at: "2026-09-20T12:00:00Z" },
        { sender_type: "agent", created_at: "2026-09-20T10:30:00Z" },
      ],
    },
    { created_at: "2026-09-21T10:00:00Z", mesaje: [{ sender_type: "user", created_at: "2026-09-21T10:00:00Z" }] },
  ]);
  assert.deepEqual(t, [30 * 60_000]);
});

test("mediana nu se lasa trasa de un singur tichet intarziat", () => {
  assert.equal(mediana([]), null);
  assert.equal(mediana([10, 20, 1_000_000]), 20);
  assert.equal(mediana([10, 20]), 15);
});

test("durata se scrie in unitatea potrivita", () => {
  assert.deepEqual(durataScurta(20_000), { valoare: "1", unitate: "min" });
  assert.deepEqual(durataScurta(45 * 60_000), { valoare: "45", unitate: "min" });
  assert.deepEqual(durataScurta(60 * 60_000), { valoare: "1", unitate: "oră" });
  assert.deepEqual(durataScurta(5 * 3_600_000), { valoare: "5", unitate: "ore" });
  assert.deepEqual(durataScurta(49 * 3_600_000), { valoare: "2", unitate: "zile" });
});
