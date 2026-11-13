import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildClassicDesign, resolveStyle } from "./defaults";
import { cuCuloareaSecundara } from "./edit";
import { parseStoreDesign } from "./parse";
import { jsonCanonic } from "./continut-ciorna";
import { styleToCssVars } from "./css-vars";
import { STIL_JUPITER } from "@/lib/teme/jupiter/design";
import type { DesignContext } from "./types";

/*
 * „Culoarea secundară” din fila „Stil” (13.11.2026, cerut de el). E accentul designului (`style.colors.accent`), acelasi
 * pe care il pun temele (Jupiter: portocaliul siglei); nealeasa, e culoarea principala (`defaultColors`).
 */

const cod = (cale: string) => readFileSync(cale, "utf8").replace(/\r\n/g, "\n");
const ctx: DesignContext = { primaryColor: "#0B3D7A", pageContent: {}, features: {} };

test("aleasa: ajunge in variabila `--st-accent` a magazinului; nealeasa, accentul e culoarea principala", () => {
  const baza = buildClassicDesign(ctx);
  assert.equal(resolveStyle(baza.style, ctx).colors.accent, "#0B3D7A");
  const cu = cuCuloareaSecundara(baza, "#F47B20");
  assert.equal(cu.style.colors?.accent, "#F47B20");
  const vars = styleToCssVars(resolveStyle(cu.style, ctx)) as Record<string, string>;
  assert.equal(vars["--st-accent"], "#F47B20");
  // Culoarea principala nu se atinge.
  assert.equal(resolveStyle(cu.style, ctx).colors.primary, "#0B3D7A");
});

test("„La fel ca cea principală” scoate cheia, fara `colors` gol: designul revine identic (nu ramane „modificat”)", () => {
  const baza = buildClassicDesign(ctx);
  const inapoi = cuCuloareaSecundara(cuCuloareaSecundara(baza, "#F47B20"), null);
  assert.equal("colors" in inapoi.style, false);
  assert.equal(jsonCanonic(inapoi), jsonCanonic(baza));
});

test("peste o tema (Jupiter): schimba doar accentul, restul culorilor temei raman; scoasa, raman tot ele", () => {
  const baza = { ...buildClassicDesign(ctx), style: STIL_JUPITER };
  const alt = cuCuloareaSecundara(baza, "#2563EB");
  assert.deepEqual({ ...alt.style.colors, accent: undefined }, { ...STIL_JUPITER.colors, accent: undefined });
  assert.equal(alt.style.colors?.accent, "#2563EB");
  const fara = cuCuloareaSecundara(baza, null);
  assert.equal(fara.style.colors?.accent, undefined);
  assert.equal(fara.style.colors?.footerBg, STIL_JUPITER.colors?.footerBg);
  // Obiectul primit nu se modifica (ciorna are istoric).
  assert.equal(baza.style.colors?.accent, "#F47B20");
});

test("trece prin parser (designul publicat se citeste prin el la fiecare cerere)", () => {
  const d = cuCuloareaSecundara(buildClassicDesign(ctx), "#E8336D");
  assert.equal(parseStoreDesign(d, ctx).style.colors?.accent, "#E8336D");
});

test("cablajul: fila „Stil” o arata langa cea principala si o scrie prin ciorna designului", () => {
  const s = cod("src/components/editor-magazin/continut/PanouStil.tsx");
  assert.match(s, /<Grup titlu="Culoarea secundară">/);
  assert.match(s, /\{secundara && <CuloareaSecundara valoare=\{secundara\.valoare\} principala=\{culoare\} onAlege=\{secundara\.onAlege\} \/>\}/);
  // Dupa „Culoarea principală”, inaintea fundalului.
  assert.ok(s.indexOf('titlu="Culoarea principală"') < s.indexOf("<CuloareaSecundara valoare"));
  assert.ok(s.indexOf("<CuloareaSecundara valoare") < s.indexOf('titlu="Fundalul magazinului"'));
  const e = cod("src/components/editor-magazin/EditorMagazin.tsx");
  assert.match(e, /valoare: design\.style\.colors\?\.accent \?\? null,/);
  assert.match(e, /onAlege: \(c\) => ciorna\.aplica\(\(d: StoreDesign\) => cuCuloareaSecundara\(d, c\), "stil:secundara"\),/);
});
