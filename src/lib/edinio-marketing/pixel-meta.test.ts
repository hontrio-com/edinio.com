import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ID_PIXEL_META } from "./pixel-meta";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  UN SINGUR IZVOR PENTRU ID-UL PIXELULUI META
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CAPCANA ERA PE DOS FATA DE TIKTOK. Acolo browserul avea o rezerva catre ALT
  pixel; aici n-avea niciuna, deci fara variabila `ID_PIXEL` iesea `undefined` si
  masuratoarea se stingea TACUT — fara eroare, fara nimic in jurnal, si aratand
  exact ca un magazin fara conversii.

  Masurat pe 02.09.2026 in pachetul viu de pe www.edinio.com: `2070597336770282`.
*/

const SINGURUL = "src/lib/edinio-marketing/pixel-meta.ts";

function fisiereSursa(rad: string): string[] {
  const iesire: string[] = [];
  for (const n of readdirSync(rad)) {
    const p = join(rad, n);
    if (statSync(p).isDirectory()) iesire.push(...fisiereSursa(p));
    else if (/\.(ts|tsx|mts)$/.test(n) && !n.endsWith(".test.ts")) iesire.push(p);
  }
  return iesire;
}

test("⚠ un singur fisier citeste NEXT_PUBLIC_META_PIXEL_ID", () => {
  const vinovate = fisiereSursa("src")
    .filter((p) => readFileSync(p, "utf8").includes("NEXT_PUBLIC_META_PIXEL_ID"))
    .map((p) => p.split("\\").join("/"));
  assert.deepEqual(vinovate, [SINGURUL],
    "variabila se citeste si in alta parte — browserul si serverul pot ajunge la pixeli deosebiti");
});

test("id-ul are o valoare chiar si fara variabila de mediu", () => {
  assert.ok(ID_PIXEL_META.length > 10, "id-ul pixelului Meta e gol sau prea scurt");
  assert.match(ID_PIXEL_META, /^[0-9]+$/, "id-ul Meta nu are forma unui numar");
});

test("⚠ tokenul CAPI nu se citeste decat in trimiterea catre Meta", () => {
  /*
    ⚠ E UN SECRET, spre deosebire de id-ul pixelului. Citit din mai multe locuri,
    are mai multe feluri de a ajunge intr-un jurnal sau intr-un raspuns.
  */
  const vinovate = fisiereSursa("src")
    .filter((p) => readFileSync(p, "utf8").includes("META_CAPI_TOKEN"))
    .map((p) => p.split("\\").join("/"))
    .sort();
  assert.deepEqual(vinovate, [
    "src/lib/edinio-marketing/server/destinatii-active.ts",
    "src/lib/edinio-marketing/server/trimite-meta.ts",
  ], "tokenul CAPI se citeste dintr-un loc nou");
});
