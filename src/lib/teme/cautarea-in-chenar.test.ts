import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * 13.11.2026, raportat de el pe Antares si Capella: butonul „Cauta” iesea peste coltul rotunjit al barei de cautare.
 * Bara are colturi rotunjite si chenar, dar nu `overflow-hidden` (ar taia lista categoriilor si rezultatele de sub ea),
 * deci un buton PLIN lipit de marginea ei trebuie sa-si rotunjeasca singur colturile, pe raza interioara a chenarului.
 *
 * Verificat in Chrome pe toate cele 30 de teme demo, la 1920, 1280, 1024, 768 si 390 px: doar antetul „market” (Altair,
 * Antares, Capella, Mira) avea defectul; fara reparatie, proba din browser il semnala la Altair, Antares si Capella.
 * Proiectul n-are jsdom, deci aici se apara regula pe sursa, ca in restul probelor de vitrina.
 */

const cod = (cale: string) => readFileSync(cale, "utf8").replace(/\r\n/g, "\n");

test("antetul „market”: bara cu chenar de 2 px, butonul plin rotunjit pe raza ei interioara (raza minus 2 px)", () => {
  const c = cod("src/components/storefront/sections/chrome/HeaderMarket.tsx");
  assert.match(c, /className=\{`relative flex items-stretch rounded-\[var\(--st-radius-sm\)\] border-2 /);
  assert.match(c, /<button type="submit" aria-label="Cauta"\s*className=\{`[^`]*rounded-r-\[calc\(var\(--st-radius-sm\)-2px\)\][^`]*`\}\s*style=\{\{ backgroundColor: "var\(--st-primary\)"/);
});

test("antetul „hipermarket”, bara dreptunghi: butonul acopera chenarul de 1 px si ia raza exterioara a barei", () => {
  const c = cod("src/components/storefront/sections/chrome/HeaderHipermarket.tsx");
  assert.match(c, /className=\{`relative flex items-stretch rounded-\[var\(--st-radius\)\] border border-\[var\(--st-border\)\]/);
  assert.match(c, /className=\{`shrink-0 -m-px flex items-center justify-center rounded-r-\[var\(--st-radius\)\]/);
});
