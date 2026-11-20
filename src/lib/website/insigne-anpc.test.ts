import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";

/*
 * Insignele ANPC (SAL si SOL) sunt cerute de lege in subsolul oricarui magazin si in cel al site-ului. Fisierele sunt
 * AVIF, iar AVIF lipseste din Edge pana la versiunea 121 si din WebKit-ul fara codec: acolo insigna aparea rupta.
 *
 * Subsolul magazinelor a primit rezerva WebP pe 19.11.2026 (auditul temelor). Subsolul site-ului de prezentare a ramas
 * atunci doar cu AVIF, fiindca era alt fisier: a doua copie a aceluiasi lucru. Proba tine REGULA pe toate copiile, cele
 * de azi si cele viitoare: oriunde se cere o insigna ANPC in AVIF, langa ea sta rezerva.
 */

function surse(dosar: string, iesire: string[] = []): string[] {
  for (const e of readdirSync(dosar, { withFileTypes: true })) {
    const cale = `${dosar}/${e.name}`;
    if (e.isDirectory()) surse(cale, iesire);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.ts$/.test(e.name)) iesire.push(cale);
  }
  return iesire;
}

test("⚠ orice loc care arata insignele ANPC ofera AVIF cu rezerva WebP, nu doar AVIF", () => {
  const locuri = surse("src").filter((f) => /anpc-s(?:al|ol)/.test(readFileSync(f, "utf8")));
  // Martorul: cele doua subsoluri stiute. Un al treilea loc intra singur sub regula de mai jos.
  for (const stiut of ["src/components/storefront/sections/_shared/FooterLegal.tsx", "src/components/website/Footer.tsx"]) {
    assert.ok(locuri.includes(stiut), `${stiut} nu mai arata insignele ANPC?`);
  }
  for (const f of locuri) {
    const s = readFileSync(f, "utf8").replace(/\r\n/g, "\n");
    // Insigna nu se cere direct ca AVIF dintr-un `src`: browserul fara AVIF n-ar avea ce arata.
    assert.doesNotMatch(s, /src=(?:"|\{`)\/?[^"`]*anpc-s(?:al|ol)\.avif/, `${f}: insigna ANPC e ceruta doar in AVIF`);
    assert.doesNotMatch(s, /src=\{`\/\$\{fisier\}\.avif`\}/, `${f}: insigna ANPC e ceruta doar in AVIF`);
    // Forma cu rezerva: `<source>` AVIF, apoi `<img>` WebP, in acelasi `<picture>`.
    assert.match(s, /<picture>\s*<source srcSet=\{`\/\$\{fisier\}\.avif`\} type="image\/avif" \/>\s*<img src=\{`\/\$\{fisier\}\.webp`\}/, `${f}: insigna ANPC n-are forma <picture> cu rezerva WebP`);
    assert.match(s, /fisier: "anpc-sal" \| "anpc-sol"/, `${f}: insigna trebuie sa fie una din cele doua stiute`);
  }
  // Ambele formate chiar exista pe disc, pentru amandoua insignele.
  for (const nume of ["anpc-sal", "anpc-sol"]) for (const ext of ["avif", "webp"]) assert.ok(existsSync(`public/${nume}.${ext}`), `lipseste public/${nume}.${ext}`);
});
