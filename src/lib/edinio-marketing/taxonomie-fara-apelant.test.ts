import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NUME_TAXONOMIE } from "./evenimente";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  NUMELE DECLARATE SI FARA NICIUN APELANT
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE E O PROBA SI NU UN COMENTARIU. In `evenimente.ts` a stat o lista scrisa
  de mana cu „ce se trage azi". Cand am numarat-o, spunea paisprezece si erau
  douazeci si noua. O lista de nume intr-un comentariu imbatraneste sigur; singura
  intrebare e cat de repede.

  ⚠ SI DE CE NU CERE ZERO. Un nume declarat si netras nu insala pe nimeni: tipul
  nu spune „asta se intampla", ci „daca vei masura asta, asa se cheama". Rostul lui
  e sa nu apara peste o luna trei nume deosebite pentru acelasi lucru.

  Ce e periculos e sa NU SE STIE care sunt. De aceea lista rezervata se scrie aici,
  explicit: cine adauga un nume fara apelant trebuie sa treaca pe aici si sa spuna
  de ce, iar cine instrumenteaza unul trebuie sa-l scoata de aici.
*/

/**
 * Declarate dinadins, fara apelant azi.
 *
 * ⚠ NU E O LISTA DE „DE FACUT". Fiecare are un motiv:
 *   - `plan_select`, `onboarding_complete`, `integration_view` — se petrec in
 *     aplicatia autentificata, unde masurarea e o hotarare de produs, nu una
 *     tehnica. Numele exista ca sa fie acelasi daca se hotaraste candva.
 *   - `registration_view`, `registration_start` — pasii dintre `page_view` pe
 *     `/register` si `sign_up`. Numele sunt pregatite; instrumentarea lor e o
 *     hotarare separata, fiindca adauga masuratori, nu repara ceva.
 */
const REZERVATE = [
  "plan_select",
  "integration_view",
  "registration_view",
  "registration_start",
  "onboarding_complete",
] as const;

function numeTrase(): Set<string> {
  const gasite = new Set<string>();
  const mers = (dir: string) => {
    for (const it of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, it.name);
      if (it.isDirectory()) { mers(p); continue; }
      if (!/\.tsx?$/.test(it.name) || /\.test\.tsx?$/.test(it.name)) continue;
      const s = readFileSync(p, "utf8");
      for (const m of s.matchAll(/urmareste\(\{\s*name:\s*"([a-z_]+)"/g)) gasite.add(m[1]);
      for (const m of s.matchAll(/puneLaCoada\(\s*\{\s*name:\s*"([a-z_]+)"/g)) gasite.add(m[1]);
    }
  };
  mers(join(process.cwd(), "src"));
  return gasite;
}

test("⚠ lista de nume rezervate e CHIAR cea fara apelant", () => {
  const trase = numeTrase();
  assert.ok(trase.size >= 25, `s-au gasit doar ${trase.size} nume trase — cautarea s-a stricat?`);

  const faraApelant = NUME_TAXONOMIE.filter((n) => !trase.has(n)).sort();
  assert.deepEqual(
    faraApelant, [...REZERVATE].sort(),
    "lista rezervata nu se mai potriveste cu realitatea: ori s-a instrumentat unul si n-a fost scos de aici, " +
    "ori s-a adaugat un nume nou fara apelant si fara motiv scris",
  );
});

test("⚠ nu se trage niciun nume din afara taxonomiei", () => {
  /*
    ⚠ CE APARA. Un nume tras si nedeclarat ocoleste tipul, deci si paza anti-PII
    care se sprijina pe el — si nu apare in documentul dupa care se configureaza
    GA4. Ar aduna date pe care nu le vede nimeni.
  */
  const declarate = new Set<string>(NUME_TAXONOMIE);
  const straine = [...numeTrase()].filter((n) => !declarate.has(n)).sort();
  assert.deepEqual(straine, [], "se trag nume care nu sunt in taxonomie: " + straine.join(", "));
});
