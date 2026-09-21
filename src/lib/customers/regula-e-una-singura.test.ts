import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * REGULA „AU INTRAT BANII” E SCRISA DE DOUA ORI          (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O data in TypeScript (`bani.ts`, pentru orice se socoteste in cod) si o data in
 * SQL (`comanda_incasata`, fiindca agregarea se face in Postgres — altfel PostgREST
 * taie la 1.000 de randuri si cifrele ar scadea in tacere).
 *
 * ⚠ DOUA COPII ALE ACELEIASI REGULI SE DESPART. Nu „pot”, ci se despart: se repara
 * una, iar cealalta ramane. Iar aici despartirea n-ar da nicio eroare — ar da doua
 * cifre deosebite despre aceiasi bani, in doua ecrane vecine.
 *
 * ⚠ Proba NU ruleaza SQL. Citeste cele doua fisiere si cere ca fiecare treapta a
 * regulii sa apara in amandoua. E mai putin decat o executie adevarata, dar prinde
 * exact ce se intampla in practica: cineva schimba o conditie intr-un loc.
 */

const TS = readFileSync("src/lib/customers/bani.ts", "utf8");
const SQL = readFileSync("migrations/2026-09-21-clienti-adevarul-cifrelor.sql", "utf8");

/** Bucata cu functia SQL, ca sa nu se potriveasca pe comentariile din jur. */
const FUNCTIA_SQL = SQL.slice(
  SQL.indexOf("create or replace function public.comanda_incasata"),
  SQL.indexOf("revoke all on function public.comanda_incasata"),
);

test("⚠ bucata de SQL chiar a fost gasita, altfel proba n-are ce citi", () => {
  /* ⚠ O ancora negasita da un sir gol, iar `includes` pe gol e mereu fals — adica o
     proba care pare sa apere si nu apara nimic. De-aia se verifica intai ca exista. */
  assert.ok(FUNCTIA_SQL.length > 200, `bucata gasita are ${FUNCTIA_SQL.length} semne`);
  assert.match(FUNCTIA_SQL, /returns boolean/);
});

test("⚠⚠ cele patru trepte ale regulii sunt in AMANDOUA scrierile", () => {
  const trepte: { ce: string; inTs: RegExp; inSql: RegExp }[] = [
    {
      ce: "anulata sau rambursata iese prima",
      inTs: /CAZUTE\.has\(String\(o\.status/,
      inSql: /p_status in \('cancelled', 'refunded'\) then false/,
    },
    {
      ce: "plata rambursata nu e incasare",
      inTs: /o\.payment_status === "refunded"\) return false/,
      inSql: /p_payment_status = 'refunded' then false/,
    },
    {
      ce: "platita online inseamna incasat",
      inTs: /o\.payment_status === "paid"\) return true/,
      inSql: /p_payment_status = 'paid' then true/,
    },
    {
      ce: "rambursul e incasat numai dupa livrare",
      inTs: /LA_USA\.has\([^;]*return o\.status === "delivered"/,
      inSql: /p_status = 'delivered'/,
    },
  ];

  for (const t of trepte) {
    assert.match(TS, t.inTs, `TypeScript nu mai are treapta: ${t.ce}`);
    assert.match(FUNCTIA_SQL, t.inSql, `SQL nu mai are treapta: ${t.ce}`);
  }
});

test("⚠ aceleasi metode „la usa” in amandoua", () => {
  /*
   * O metoda adaugata intr-un singur loc ar face ca aceeasi comanda sa fie incasata
   * pe un ecran si neincasata pe altul.
   */
  for (const m of ["cash_on_delivery", "cod", "ramburs"]) {
    assert.ok(TS.includes(`"${m}"`), `TypeScript nu mai cunoaste metoda ${m}`);
    assert.ok(FUNCTIA_SQL.includes(`'${m}'`), `SQL nu mai cunoaste metoda ${m}`);
  }
});

test("⚠ amandoua cad pe drumul PRUDENT la o metoda necunoscuta", () => {
  /*
   * Ultima ramura trebuie sa fie „nu stim, deci nu spunem ca am luat banii”. Intoarsa
   * in „da”, o metoda noua ar fi declarata incasata din prima zi — iar o cifra prea
   * mare se crede, pe cand una prea mica se observa si se intreaba.
   */
  assert.match(TS, /return false;\s*\n\}/, "TypeScript nu mai iese pe `false` la necunoscut");
  assert.match(FUNCTIA_SQL, /else false\s*\n\s*end/, "SQL nu mai iese pe `false` la necunoscut");
});
