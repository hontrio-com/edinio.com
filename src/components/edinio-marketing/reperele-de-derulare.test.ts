import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/*
 * Reperele de derulare ale site-ului de prezentare (`RuntimeMarketing.tsx`): patru `div`-uri absolute
 * de 1px, la 25/50/75/90% din pagina.
 *
 * ⚠ Defectul raportat (07.10.2026): pe /integrari, rubrica „Curieri" taie lista de la 67 la 19 carduri,
 * pagina scade de la 6991px la ~3750px, dar reperele ramase la vechile pozitii tineau documentul lung:
 * sub footer se puteau derula ~2500px de gol. Masurat in browser inainte si dupa: dupa reparatie,
 * documentul se termina exact la marginea footerului (3752px).
 *
 * Componenta e de browser (IntersectionObserver, ResizeObserver), deci proba citeste regula din sursa.
 */
const s = readFileSync("src/components/edinio-marketing/RuntimeMarketing.tsx", "utf8");

test("⚠⚠ inaltimea se masoara din CONTINUT (marginea lui <body>), nu din `scrollHeight`, care include reperele", () => {
  assert.match(s, /const inaltimeaContinutului = \(\) => Math\.round\(document\.body\.getBoundingClientRect\(\)\.bottom \+ window\.scrollY\);/);
  assert.match(s, /let inaltime = inaltimeaContinutului\(\);/);
  assert.match(s, /const acum = inaltimeaContinutului\(\);/);
  /* Nicio masurare a reperelor nu mai trece prin `scrollHeight`. */
  const bloc = s.slice(s.indexOf("const inaltimeaContinutului"), s.indexOf("const masuraInaltimii"));
  assert.doesNotMatch(bloc.replace(/\/\*[\s\S]*?\*\//g, ""), /scrollHeight/);
});

test("⚠ reperul atins e SCOS din pagina, nu doar din observator", () => {
  assert.match(s, /obs\.unobserve\(el\);[\s\S]{0,300}el\.remove\(\);/);
});

test("pragurile de sub cel atins se trimit si ele (derularea rapida sare un reper de 1px)", () => {
  assert.match(s, /for \(const q of PRAGURI\) \{\s*if \(q > p \|\| praguriTrase\.has\(q\)\) continue;/);
});
