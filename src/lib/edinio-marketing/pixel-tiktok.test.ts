import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ID_PIXEL_TIKTOK } from "./pixel-tiktok";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  UN SINGUR IZVOR PENTRU ID-UL PIXELULUI
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CE APARA, MASURAT. Pe 02.09.2026 erau doua citiri deosebite ale aceleiasi
  variabile: browserul cu o rezerva scrisa in cod (`D8N5ATBC77UA0GPRAUBG`), iar
  serverul fara. Pachetul viu folosea `DAC0RFJC77UC8FLJHJC0`. Deci o variabila
  uitata ar fi trimis browserul catre un pixel si serverul catre niciunul — si
  aceeasi conversie sub doua adrese nu se mai poate deduplica.

  Proba asta nu apara o valoare, ci faptul ca EXISTA UNA SINGURA.
*/

const SINGURUL = "src/lib/edinio-marketing/pixel-tiktok.ts";

function fisiereSursa(rad: string): string[] {
  const iesire: string[] = [];
  for (const n of readdirSync(rad)) {
    const p = join(rad, n);
    if (statSync(p).isDirectory()) iesire.push(...fisiereSursa(p));
    else if (/\.(ts|tsx|mts)$/.test(n) && !n.endsWith(".test.ts")) iesire.push(p);
  }
  return iesire;
}

test("⚠ un singur fisier citeste NEXT_PUBLIC_TIKTOK_PIXEL_ID", () => {
  const vinovate = fisiereSursa("src")
    .filter((p) => readFileSync(p, "utf8").includes("NEXT_PUBLIC_TIKTOK_PIXEL_ID"))
    .map((p) => p.split("\\").join("/"));

  assert.deepEqual(
    vinovate,
    [SINGURUL],
    "variabila se citeste si in alta parte — browserul si serverul pot ajunge la pixeli deosebiti",
  );
});

test("id-ul are o valoare chiar si fara variabila de mediu", () => {
  /*
    ⚠ Fara rezerva, o variabila uitata ar stinge masuratoarea in productie fara ca
    nimic sa strige. Id-ul nu e un secret: orice vizitator il vede in pagina.
  */
  assert.ok(ID_PIXEL_TIKTOK.length > 10, "id-ul pixelului e gol sau prea scurt");
  assert.match(ID_PIXEL_TIKTOK, /^[A-Z0-9]+$/, "id-ul nu are forma unui id TikTok");
});

/**
 * Codul fara comentarii.
 *
 * ⚠ DE CE E NEVOIE. Prima forma a probei de mai jos cauta pixelul strain
 * ORIUNDE in fisier — si a cazut pe chiar comentariul care explica de ce nu mai
 * trebuie folosit. Istoria scrisa in comentariu e ce face reparatia sa nu se
 * intoarca; nu ea trebuie stinsa, ci proba trebuie sa se uite la cod.
 */
function faraComentarii(cod: string): string {
  /* Blocurile de comentariu: se pastreaza doar ce urmeaza dupa inchiderea fiecaruia. */
  const faraBlocuri = cod
    .split("/*")
    .map((bucata, i) => {
      if (i === 0) return bucata;
      const inchis = bucata.indexOf("*/");
      return inchis < 0 ? "" : bucata.slice(inchis + 2);
    })
    .join("");

  /* Si comentariile de un rand. */
  const RAND = String.fromCharCode(10);
  return faraBlocuri
    .split(RAND)
    .map((rand) => {
      const i = rand.indexOf("//");
      return i < 0 ? rand : rand.slice(0, i);
    })
    .join(RAND);
}

test("⚠ pixelul strain de dinainte nu mai apare in niciun cod", () => {
  /*
    ⚠ `D8N5ATBC77UA0GPRAUBG` nu apare in pachetul viu de pe www.edinio.com
    (masurat pe 02.09.2026, in chunk-urile paginii de start). O trimitere acolo ar
    fi fost tacuta: niciun raport n-ar fi aratat-o.
  */
  assert.notEqual(ID_PIXEL_TIKTOK, "D8N5ATBC77UA0GPRAUBG");

  const vinovate = fisiereSursa("src")
    .filter((f) => faraComentarii(readFileSync(f, "utf8")).includes("D8N5ATBC77UA0GPRAUBG"))
    .map((f) => f.split("\\").join("/"));
  assert.deepEqual(vinovate, [], "pixelul strain s-a intors in cod");
});
