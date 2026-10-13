import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * ═══ O SEMNALARE CARE NU AJUNGE LA OM NU E O SEMNALARE ═══
 *
 * Proba de acelasi nume din `src/app/api/cron/` citeste numai cronurile `*-tracking`, deci nu vede
 * `easysales-sync`. Regula e insa aceeasi: ce cere o hotarare a comerciantului (o comanda refuzata,
 * plafonul atins, un retur, o anulare care nu s-a putut face la ei) trebuie sa ajunga in clopotelul
 * din panou, nu numai in `error_logs`.
 */

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("`anunta` scrie INTAI clopotelul, apoi jurnalul", () => {
  const s = viu("src/lib/easysales/notificari.ts");
  const clopotel = s.indexOf(`from("notifications").insert(`);
  const jurnal = s.indexOf("await logError(");
  assert.ok(clopotel > 0, "anunta nu mai scrie in notifications");
  assert.ok(jurnal > clopotel, "jurnalul vine inaintea notificarii");
});

test("modulele care cer o hotarare a omului trec prin `anunta`", () => {
  for (const f of ["comenzi.ts", "oglinda.ts", "coada.ts", "inbox.ts", "sanatate.ts", "catalog.ts", "verificare.ts", "bucla.ts", "vanzari-externe.ts"]) {
    const s = viu(`src/lib/easysales/${f}`);
    assert.match(s, /\banunta(Rar)?\(/, `${f} nu mai anunta comerciantul`);
  }
});

test("catalogul si bucla de stoc anunta ce cere omul: pauza, preturile, stocul, supravanzarea, canalul pe doua drumuri", () => {
  const cat = viu("src/lib/easysales/catalog.ts");
  for (const semn of ["Catalogul easySales e în pauză", "Confirmă prețurile trimise în easySales", "n-a putut fi arhivat în easySales"]) {
    assert.ok(cat.includes(semn), `catalogul nu mai anunta: ${semn}`);
  }
  assert.ok(viu("src/lib/easysales/verificare.ts").includes("Website-ul Edinio nu mai apare în easySales"));
  const b = viu("src/lib/easysales/bucla.ts");
  for (const semn of ["Confirmă stocul trimis în easySales", "fără o comandă care să explice"]) assert.ok(b.includes(semn), `bucla nu mai anunta: ${semn}`);
  const v = viu("src/lib/easysales/vanzari-externe.ts");
  for (const semn of ["Un canal vinde pe două drumuri", "Vânzare externă neînregistrată", "Posibilă supravânzare"]) assert.ok(v.includes(semn), `vanzarile externe nu mai anunta: ${semn}`);
});

test("refuzul, plafonul si intoarcerea la Edinio anunta; cererea clientului de anulare la fel", () => {
  const c = viu("src/lib/easysales/comenzi.ts");
  for (const semn of ["n-a plecat în easySales", "plafonul de comenzi e atins", "se procesează din Edinio", "comandă de verificat"]) {
    assert.ok(c.includes(semn), `lipseste anuntul: ${semn}`);
  }
  assert.match(viu("src/lib/cont/anulare.ts"), /cerereaDeAnulareInEasySales[\s\S]*anunta\(/);
});
