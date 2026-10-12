import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * NICIO PROMISIUNE DE GRATUITATE IN TEXTELE VIZIBILE (12.10.2026).
 *
 * Testarea gratuita de 15 zile a fost scoasa: magazinul se creeaza numai dupa o plata confirmata.
 * La prima trecere au scapat „Creeaza cont gratuit" (login, inscriere), „Plan Gratuit" (meniul
 * panoului) si „pana la 10 produse in planul gratuit" (un email trimis si celor care platesc).
 * Proba cauta formularile in tot `src/`, pe randuri care nu sunt comentarii.
 *
 * ⚠ EXCEPTIILE SUNT NUMITE, cu motivul lor:
 *   - textele juridice (Termeni, Confidentialitate, Cookies): textul proprietarului, transcris
 *     mecanic; se schimba numai cu textul lui nou;
 *   - ce vad DOAR cele 11 testari acordate inainte (expira cel tarziu pe 27.10.2026): bannerul,
 *     emailurile de expirare, ramura `trial` din Facturare.
 * Dupa 27.10.2026 a doua grupa e cod mort si se poate scoate, impreuna cu exceptiile ei.
 */
const RAD = join(import.meta.dirname, "..", "..", "..");

const TIPAR = /(\d+ (de )?zile (gratuit|gratis)|testeaz[aă] gratuit|[îi]ncepe gratuit|cont gratuit|plan gratuit|planul gratuit|f[aă]r[aă] card de credit|trial gratuit|perioad[aă] gratuit)/i;

const EXCEPTII: Record<string, string> = {
  "src/lib/website/termeni.ts": "text juridic al proprietarului",
  "src/lib/website/confidentialitate.ts": "text juridic al proprietarului",
  "src/lib/website/cookies.ts": "text juridic al proprietarului",
  "src/components/dashboard/TrialBanner.tsx": "doar testarile acordate inainte de 12.10.2026",
  "src/lib/email-automations.ts": "emailurile de expirare ale testarilor acordate inainte de 12.10.2026",
  "src/components/dashboard/BillingSection.tsx": "ramura `trial`, doar pentru testarile vechi",
};

function fisiere(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...fisiere(p));
    else if (/\.(ts|tsx)$/.test(n) && !n.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

test("⚠ niciun text vizibil nu mai promite gratuitate (testare, cont sau plan gratuit)", () => {
  const gasite: string[] = [];
  let citite = 0;
  for (const abs of fisiere(join(RAD, "src"))) {
    const rel = abs.slice(RAD.length + 1).replace(/\\/g, "/");
    if (EXCEPTII[rel]) continue;
    citite++;
    /* Comentariile de bloc se golesc (pastrand randurile, ca numerele sa ramana bune). */
    const cod = readFileSync(abs, "utf8").replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
    cod.split(/\r?\n/).forEach((rand, i) => {
      const t = rand.trim();
      if (t.startsWith("//")) return;
      if (TIPAR.test(rand)) gasite.push(`${rel}:${i + 1}: ${t.slice(0, 120)}`);
    });
  }
  assert.ok(citite > 500, `s-au citit doar ${citite} fisiere — cautarea s-a stricat?`);
  assert.deepEqual(gasite, []);
});

test("exceptiile chiar mai contin ce scuza (altfel scuza a ramas degeaba)", () => {
  for (const [rel, motiv] of Object.entries(EXCEPTII)) {
    const sursa = readFileSync(join(RAD, rel), "utf8");
    assert.ok(/testare|trial|perioad[aă] gratuit|perioad[aă] de prob|planul gratuit/i.test(sursa), `${rel} (${motiv}) nu mai pomeneste testarea — scoate exceptia`);
  }
});

test("⚠ si in emailurile automate, gratuitatea apare NUMAI in cele de expirare a testarilor vechi", () => {
  /* Exceptia de mai sus e pe fisier; emailul pentru magazinele fara produse spunea „pana la 10
     produse in planul gratuit" si pleca si celor care platesc. Formularile astea nu au voie nicaieri. */
  const sursa = readFileSync(join(RAD, "src/lib/email-automations.ts"), "utf8");
  for (const r of [/planul gratuit/i, /gratuita 15 zile/i, /fara card/i, /cont gratuit/i]) {
    assert.ok(!r.test(sursa), `emailurile automate contin iar ${r}`);
  }
});
