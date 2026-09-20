import { strict as assert } from "node:assert";
import { test } from "node:test";
import { execFileSync } from "node:child_process";

import { formatDate, formatDateShort, formatDateTime } from "./format";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  DATELE SE SCRIU PE ORA ROMANIEI, ORICE CEAS AR AVEA MASINA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE PROBA PORNESTE UN AL DOILEA PROCES.

  Calculatorul pe care se lucreaza e pe Europe/Bucharest, deci aici TOTUL pare
  corect, si parea corect si inainte de reparatie. Defectul se vede numai pe un
  ceas diferit - adica exact pe Vercel, unde procesul ruleaza pe UTC si unde nu
  exista nicio variabila `TZ` (verificat in proiect, 20.09.2026).

  O proba care ruleaza doar in procesul de aici n-ar fi aparat nimic: ar fi trecut
  si peste codul stricat. De aceea se cheama un al doilea Node, cu `TZ` pus
  anume, si se citeste ce scrie el.
*/

/** Miezul noptii si jumatate, ora Romaniei: la UTC e inca ziua dinainte, 22:30. */
const NOAPTEA = "2026-09-19T22:30:00Z";

function scrisPeFusul(tz: string, cod: string): string {
  const iesire = execFileSync(
    process.execPath,
    ["--import", "./scripts/tests/register.mjs", "--input-type=module", "--eval",
      `const f = await import("./src/lib/utils/format.ts"); process.stdout.write(String(${cod}));`],
    { env: { ...process.env, TZ: tz }, cwd: process.cwd(), encoding: "utf8" },
  );
  return iesire.trim();
}

test("⚠ pe un server pe UTC, data ramane tot cea romaneasca", () => {
  const peUtc = scrisPeFusul("UTC", `f.formatDateTime("${NOAPTEA}")`);
  assert.equal(peUtc, "20 septembrie 2026, 01:30");
  /* Fara reparatie, aici scria „19 septembrie 2026, 22:30": alta zi si alta ora
     decat cea in care clientul chiar a plasat comanda. */
});

test("⚠ nici pe un fus de peste ocean nu se schimba ziua", () => {
  const peNewYork = scrisPeFusul("America/New_York", `f.formatDate("${NOAPTEA}")`);
  assert.equal(peNewYork, "20 septembrie 2026");
});

test("acelasi text ca pana acum, cand masina e chiar pe ora Romaniei", () => {
  /* Reparatia nu are voie sa schimbe si CUM arata datele, doar CARE sunt. */
  assert.equal(formatDate("2026-09-20T12:32:00Z"), "20 septembrie 2026");
  assert.equal(formatDateShort("2026-09-20T12:32:00Z"), "20 sep 2026");
  assert.equal(formatDateTime("2026-09-20T12:32:00Z"), "20 septembrie 2026, 15:32");
});

test("ora de vara si cea de iarna se socotesc singure", () => {
  /* 25.10.2026, ora 04:00, e chiar noaptea schimbarii: vara +3, iarna +2. */
  assert.equal(formatDateTime("2026-07-01T12:00:00Z"), "1 iulie 2026, 15:00");
  assert.equal(formatDateTime("2026-12-01T12:00:00Z"), "1 decembrie 2026, 14:00");
});

test("o data stricata da text gol, nu „Invalid Date”", () => {
  assert.equal(formatDate("nu-i o data"), "");
  assert.equal(formatDateTime("nu-i o data"), "");
});
