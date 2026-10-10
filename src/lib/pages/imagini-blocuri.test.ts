import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * NICIUN `<img>` DIN BLOCURILE DE PAGINA NU MAI CERE ORIGINALUL (09.10.2026).
 *
 * Pana atunci, imaginea, galeria, hero-ul, coloanele, newsletterul si pachetele puneau adresa
 * salvata direct in `src`: 200-600 KB pentru o poza aratata la cateva sute de pixeli. Acum trec prin
 * `imaginePagina` (si `cdnSrcSet` unde poza se intinde cu ecranul), care lasa GIF-urile animate
 * neatinse.
 *
 * ⚠ DE CE PE SURSA: probele nu incarca `.tsx`. Ce se cere e o regula structurala, pe ELEMENT nu pe
 * fisier: FIECARE `<img` dintr-un bloc are `src={imaginePagina(`. Un bloc nou scris cu `src={x}` ar
 * reaparea tacut cu originalul; aici pica.
 *
 * ⚠ Exceptiile sunt numite, cu motivul lor. Nu se adauga una fara motiv.
 */
const RADACINA = path.resolve(import.meta.dirname, "../../..");
const BLOCURI = path.join(RADACINA, "src/components/pages/blocks");

const EXCEPTII: Record<string, string> = {
  /* Siglele integrarilor sunt fisiere statice ale site-ului (`/integrari/…`), nu din depozit. */
  "IntegrariBlocks.tsx": "sigle statice",
};

test("⚠ fiecare <img> din blocurile de pagina trece prin optimizator", () => {
  const fisiere = readdirSync(BLOCURI).filter((f) => f.endsWith(".tsx"));
  assert.ok(fisiere.length > 10, "nu s-au gasit blocurile — s-a mutat folderul?");
  const goale: string[] = [];
  let numarate = 0;
  for (const f of fisiere) {
    if (EXCEPTII[f]) continue;
    const sursa = readFileSync(path.join(BLOCURI, f), "utf8");
    /* Doar elementele JSX (`<img` urmat de atribute cu `src={`); comentariile care pomenesc `<img onerror>` nu. */
    for (const m of sursa.matchAll(/<img\s[^<>]*?\/>/g)) {
      if (!m[0].includes("src={")) continue;
      numarate++;
      if (!/\ssrc=\{imaginePagina\(/.test(m[0])) goale.push(`${f}: ${m[0].replace(/\s+/g, " ").slice(0, 120)}`);
    }
  }
  assert.ok(numarate >= 11, `s-au gasit doar ${numarate} <img> — tiparul nu mai prinde nimic?`);
  assert.deepEqual(goale, [], "imagini care cer originalul");
});

test("⚠ si fundalul unei sectiuni (BlockShell) trece prin optimizator", () => {
  const sursa = readFileSync(path.join(RADACINA, "src/components/pages/BlockShell.tsx"), "utf8");
  assert.match(sursa, /const u = imaginePagina\(style\.bgImage, \d+\)/);
});

test("exceptia siglelor ramane adevarata: blocul integrarilor nu primeste poze din depozit", () => {
  const sursa = readFileSync(path.join(BLOCURI, "IntegrariBlocks.tsx"), "utf8");
  assert.match(sursa, /m\.logo/);
});
