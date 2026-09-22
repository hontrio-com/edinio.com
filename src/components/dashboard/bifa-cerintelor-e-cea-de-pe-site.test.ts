import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * BIFA DE LA „INAINTE DE A INCEPE" E CHIAR CEA DE PE SITE      (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cerut de el, pe litere: „in loc de bifa aia normala pune icon cu Verified
 * verde gen cum avem la website-ul de prezentare", iar la intrebare a lamurit:
 * „Bifa aia de pe website-ul de prezentare de la cardurile alea", adica de pe
 * cardurile de pret.
 *
 * Reteta de acolo (`PricingSection.tsx`) e:
 *   <Check className="mt-[3px] h-4 w-4 shrink-0" style={{ color: GREEN_TEXT }} strokeWidth={2.5} />
 *
 * Cea din panou avea `h-3.5` si grosimea implicita (2): mai mica si mai subtire.
 * Puse una langa alta, se vedea.
 *
 * ⚠ DE CE O PROBA. Markupul e COPIAT in cinci ecrane de marketplace. Cinci copii
 * ale aceluiasi desen diverg la prima retusare, si atunci pe o pagina bifa e
 * groasa, pe alta subtire, iar nimeni nu afla pana nu le deschide pe amandoua.
 *
 * ⚠ Proba NU cere acelasi SIR in amandoua locurile: site-ul isi scrie verdele
 * prin `style={{ color: GREEN_TEXT }}`, panoul prin clasa `text-primary`. Cere
 * ce conteaza: aceeasi marime, aceeasi grosime, si acelasi SIMBOL de culoare.
 */

const PANOURI = "src/components/dashboard";
const CARDURILE_DE_PRET = "src/components/website/PricingSection.tsx";
const CULORI = "src/lib/website/linii.ts";

/* ══ 1. Verdele e acelasi simbol in amandoua locurile ══════════════════════ */

test("⚠ verdele de pe site e chiar `--primary`, adica ce da `text-primary` in panou", () => {
  const sursa = readFileSync(CULORI, "utf8");
  assert.match(
    sursa,
    /VERDE_CITIBIL\s*=\s*"var\(--primary\)"/,
    "site-ul si-a luat alt verde; bifa din panou nu mai e aceeasi culoare cu a lui",
  );
});

test("⚠ cardurile de pret inca deseneaza bifa cu `h-4 w-4` si grosimea 2.5", () => {
  /*
   * Daca se schimba ACOLO, trebuie schimbata si in panou. Proba pica in locul in
   * care trebuie luata hotararea, nu tace pana cand cineva vede diferenta.
   */
  const sursa = readFileSync(CARDURILE_DE_PRET, "utf8");
  const bifa = sursa.split("\n").find((l) => l.includes("<Check") && l.includes("strokeWidth"));
  assert.ok(bifa, "n-am mai gasit bifa pe cardurile de pret");
  assert.match(bifa!, /h-4 w-4/, "bifa de pe site si-a schimbat marimea");
  assert.match(bifa!, /strokeWidth=\{2\.5\}/, "bifa de pe site si-a schimbat grosimea");
  assert.match(bifa!, /GREEN_TEXT/, "bifa de pe site nu mai ia verdele din `VERDE_CITIBIL`");
});

/* ══ 2. Toate panourile de cerinte folosesc aceeasi bifa ═══════════════════ */

test("⚠⚠ toate panourile „Înainte de a începe” deseneaza EXACT aceeasi bifa", () => {
  const ecrane = readdirSync(PANOURI)
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.ts"))
    .filter((f) => readFileSync(join(PANOURI, f), "utf8").includes("Înainte de a începe"))
    .sort();

  /* Fara asta, o redenumire a titlului ar goli multimea si proba ar trece degeaba. */
  assert.ok(ecrane.length >= 3, `am gasit doar ${ecrane.length} panouri de cerinte; s-a schimbat titlul?`);

  const gresite: string[] = [];
  for (const nume of ecrane) {
    const sursa = readFileSync(join(PANOURI, nume), "utf8");
    const bife = sursa.split("\n").filter((l) => /<Check\b/.test(l) && !/CheckCircle|Checkbox/.test(l));
    const potrivita = bife.some(
      (l) => /h-4 w-4/.test(l) && /strokeWidth=\{2\.5\}/.test(l) && /text-primary/.test(l),
    );
    if (!potrivita) gresite.push(nume);
  }

  assert.deepEqual(
    gresite,
    [],
    "Panouri de cerinte care nu mai folosesc bifa de pe cardurile de pret:\n  "
      + gresite.join("\n  ")
      + '\nReteta e: <Check className="mt-[3px] h-4 w-4 flex-shrink-0 text-primary" strokeWidth={2.5} />',
  );
});
