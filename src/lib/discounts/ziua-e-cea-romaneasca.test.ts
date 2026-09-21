import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import {
  inceputulZilei, perioadaCodului, sfarsitulZilei, ziValida, ziuaClipei, ziuaDeAzi,
} from "./perioada";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * ZIUA SCRISA DE COMERCIANT E O ZI ROMANEASCA                    (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ DEFECTUL MASURAT, nu unul inchipuit. Pana azi, formularul trimitea
 * „2026-08-31”, Postgres il citea pe ceasul lui (`TimeZone` = UTC, verificat pe
 * proiectul de productie) si punea in coloana `2026-08-31 00:00:00+00` — adica
 * ora 03:00 dimineata, ora Romaniei, in CHIAR ziua aceea.
 *
 * Comerciantul care scria „tine pana pe 31 august” pierdea 21 de ore din ultima
 * zi. `starts_at`, adaugat azi, ar fi mostenit capcana pe dos: un cod pus sa
 * porneasca „pe 1 octombrie” ar fi pornit pe 30 septembrie, la 21:00.
 */

/* ── Capatul de jos si cel de sus ───────────────────────────────────────── */

test("⚠⚠ ziua tine de la miezul noptii pana la 23:59:59,999 — ORA ROMANIEI", () => {
  /* Vara, Romania e la +3: miezul noptii de 1 octombrie e 30 septembrie, 21:00 UTC. */
  assert.equal(inceputulZilei("2026-10-01"), "2026-09-30T21:00:00.000Z");
  assert.equal(sfarsitulZilei("2026-08-31"), "2026-08-31T20:59:59.999Z");

  /* Iarna, la +2. Decalajul NU e scris nicaieri: se citeste din fus. */
  assert.equal(inceputulZilei("2026-12-01"), "2026-11-30T22:00:00.000Z");
  assert.equal(sfarsitulZilei("2026-12-01"), "2026-12-01T21:59:59.999Z");
});

test("⚠⚠ sfarsitul zilei NU e miezul noptii — defectul de care ne aparam", () => {
  /*
   * Asa se scria pana azi in baza. Daca cineva „simplifica” inapoi la
   * `new Date(zi)`, proba asta cade.
   */
  const cumEraInainte = new Date("2026-08-31").toISOString();
  assert.equal(cumEraInainte, "2026-08-31T00:00:00.000Z");
  assert.notEqual(sfarsitulZilei("2026-08-31"), cumEraInainte);

  /* Si diferenta e de aproape o zi intreaga, nu de cateva minute. */
  const castigat = new Date(sfarsitulZilei("2026-08-31")!).getTime() - new Date(cumEraInainte).getTime();
  assert.ok(castigat > 20 * 3600_000, `codul castiga doar ${Math.round(castigat / 3600_000)} ore`);
});

/* ── Noaptea schimbarii ceasului ────────────────────────────────────────── */

test("⚠ zilele in care se schimba ora au 23 si 25 de ore, si tot zile intregi raman", () => {
  /*
   * Scris cu „+24 de ore” in loc de „23:59:59,999 al zilei”, capatul ar fi cazut
   * cu o ora inauntrul zilei urmatoare toamna, si cu o ora inaintea sfarsitului
   * primavara. Aici se cere chiar lungimea adevarata.
   */
  const ore = (zi: string) =>
    (new Date(sfarsitulZilei(zi)!).getTime() - new Date(inceputulZilei(zi)!).getTime() + 1) / 3600_000;

  assert.equal(ore("2026-10-25"), 25, "ziua in care ceasul da inapoi");
  assert.equal(ore("2026-03-29"), 23, "ziua in care ceasul da inainte");
  assert.equal(ore("2026-07-01"), 24);
});

/* ── Drumul inapoi catre formular ───────────────────────────────────────── */

test("⚠⚠ drumul inapoi NU se poate face cu `slice(0, 10)`", () => {
  /*
   * Un cod care porneste pe 1 octombrie se pastreaza ca `2026-09-30T21:00:00Z`.
   * Taiat cu `slice`, formularul ar fi aratat „30 septembrie” — cu o zi mai
   * devreme decat a scris omul, de fiecare data cand deschide editarea. Si
   * salvat asa, codul s-ar fi mutat cu o zi la fiecare deschidere.
   */
  const pastrat = inceputulZilei("2026-10-01")!;
  assert.equal(pastrat.slice(0, 10), "2026-09-30", "asa ar fi aratat taierea");
  assert.equal(ziuaClipei(pastrat), "2026-10-01", "asa arata ziua adevarata");
});

test("dus-intors pe un an intreg, fara nicio zi pierduta", () => {
  const rele: string[] = [];
  for (let i = 0; i < 400; i++) {
    const zi = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    if (ziuaClipei(inceputulZilei(zi)) !== zi) rele.push(`inceput ${zi}`);
    if (ziuaClipei(sfarsitulZilei(zi)) !== zi) rele.push(`sfarsit ${zi}`);
  }
  assert.deepEqual(rele, []);
});

/* ── Zile care nu exista ────────────────────────────────────────────────── */

test("⚠ o zi inventata se refuza, nu se rostogoleste in alta", () => {
  /*
   * `Date.UTC(2026, 1, 29)` nu se plange: da 1 martie. Fara drumul inapoi din
   * `ziValida`, o data inventata ar fi intrat in baza ca altceva decat a scris
   * omul — si nimeni n-ar fi avut de ce sa banuiasca ceva.
   */
  assert.equal(ziValida("2026-02-29"), false, "2026 nu e an bisect");
  assert.equal(ziValida("2028-02-29"), true, "2028 e");
  assert.equal(ziValida("2026-13-01"), false);
  assert.equal(ziValida("2026-00-10"), false);
  assert.equal(ziValida("31-08-2026"), false, "alta ordine");
  assert.equal(ziValida(""), false);
  assert.equal(ziValida(null), false);
  assert.equal(inceputulZilei("2026-02-29"), null);
});

/* ── Perioada intreaga ──────────────────────────────────────────────────── */

test("⚠ o perioada intoarsa se opreste in formular, nu ajunge cod mort in baza", () => {
  /*
   * „De pe 10, pana pe 3” ar fi dat un cod pe care ecranul il scrie „Programat”
   * si care nu porneste niciodata. Comerciantul l-ar fi cautat o saptamana.
   */
  const r = perioadaCodului("2026-10-10", "2026-10-03");
  assert.ok("error" in r);
  assert.match(r.error, /început/i);
});

test("aceeasi zi la amandoua capetele e o campanie de o zi, si trece", () => {
  const r = perioadaCodului("2026-10-10", "2026-10-10");
  assert.ok(!("error" in r));
  assert.equal(r.starts_at, "2026-10-09T21:00:00.000Z");
  assert.equal(r.expires_at, "2026-10-10T20:59:59.999Z");
  assert.ok(new Date(r.expires_at!) > new Date(r.starts_at!));
});

test("capetele lipsa raman lipsa, nu devin azi", () => {
  /*
   * ⚠ Un cod fara date e un cod care merge mereu. Umplut cu `now()`, un cod
   * vechi ar fi capatat brusc o data de pornire si s-ar fi oprit.
   */
  assert.deepEqual(perioadaCodului(null, null), { starts_at: null, expires_at: null });
  assert.deepEqual(perioadaCodului("", ""), { starts_at: null, expires_at: null });
  const doarSfarsit = perioadaCodului(null, "2026-10-10");
  assert.ok(!("error" in doarSfarsit) && doarSfarsit.starts_at === null && doarSfarsit.expires_at !== null);
});

test("o data scrisa aiurea se refuza pe fata, nu in tacere", () => {
  const r = perioadaCodului("nu-e-o-data", null);
  assert.ok("error" in r);
});

/* ── Ceasul masinii nu are niciun cuvant ────────────────────────────────── */

/*
 * ⚠⚠ DE CE PORNESTE PROBA UN AL DOILEA PROCES.
 *
 * Calculatorul pe care se lucreaza e pe Europe/Bucharest, deci aici totul pare
 * corect — si ar fi parut corect si cu `new Date(zi)`, care e chiar defectul.
 * Pe Vercel procesul ruleaza pe UTC, si acolo se vede. Acelasi tipar ca la
 * `src/lib/utils/fus-orar-romanesc.test.ts`.
 */
function peFusul(tz: string, cod: string): string {
  return execFileSync(
    process.execPath,
    ["--import", "./scripts/tests/register.mjs", "--input-type=module", "--eval",
      `const p = await import("./src/lib/discounts/perioada.ts"); process.stdout.write(String(${cod}));`],
    { env: { ...process.env, TZ: tz }, cwd: process.cwd(), encoding: "utf8" },
  ).trim();
}

test("⚠⚠ pe un server pe UTC, ziua ramane tot cea romaneasca", () => {
  assert.equal(peFusul("UTC", `p.sfarsitulZilei("2026-08-31")`), "2026-08-31T20:59:59.999Z");
  assert.equal(peFusul("UTC", `p.inceputulZilei("2026-10-01")`), "2026-09-30T21:00:00.000Z");
});

test("⚠ nici pe un fus de peste ocean nu se schimba ziua", () => {
  assert.equal(peFusul("America/New_York", `p.inceputulZilei("2026-10-01")`), "2026-09-30T21:00:00.000Z");
  assert.equal(peFusul("Asia/Tokyo", `p.ziuaClipei("2026-09-30T21:00:00.000Z")`), "2026-10-01");
});

test("ziua de azi se ia tot de pe ceasul romanesc", () => {
  /* La 21:00 UTC pe 30 septembrie, in Romania e deja 1 octombrie. */
  assert.equal(ziuaDeAzi(new Date("2026-09-30T21:30:00Z")), "2026-10-01");
  assert.equal(ziuaDeAzi(new Date("2026-09-30T20:30:00Z")), "2026-09-30");
});
