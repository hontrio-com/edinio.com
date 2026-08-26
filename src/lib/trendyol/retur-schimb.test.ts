import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   UN RETUR DE TIP SCHIMB: IL VEDEM, DAR NU STIM CE SA-I SPUNEM OMULUI
   ══════════════════════════════════════════════════════════════════════════

   `replacementOutboundpackageinfo` apare in raspunsul-exemplu al lui `getClaims`, cu numar de
   AWB, `packageid` si lista de `claimItem.Id`.

   ⚠ CAUTAT IN GHIDUL LOR: nicio propozitie despre schimburi („değişim"), nici despre ce are
   comerciantul de facut, nici vreun camp care sa deosebeasca un schimb de o restituire. Campul
   exista in exemplu si nu e explicat nicaieri.

   ⚠ DECI NU SE GHICESTE O INSTRUCTIUNE. Aratat ca „trimite un produs de schimb" cand de fapt
   inseamna altceva, l-am pune pe comerciant sa expedieze marfa degeaba — chiar tiparul pe care
   il aparam la `coletDeTrimisInapoi`, doar ca in cealalta directie. Tacut cu totul insa, n-am
   afla niciodata ca exista.

   ⚠ SE PASTREAZA SI SE APRINDE O DATA. Atat.
*/

const brut = readFileSync("src/lib/trendyol/retururi.ts", "utf8");
const viu = brut.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("⚠ se citesc amandoua scrierile, ca la coletul respins", () => {
  /* Schema lor si exemplul lor nu se potrivesc pe majuscule, si n-avem cum sa masuram care vine
     in trafic: niciun cont al nostru n-are inca vreun retur. */
  assert.match(viu, /c\.replacementOutboundpackageinfo \?\? c\.replacementOutboundPackageInfo/);
  const t = readFileSync("src/lib/trendyol/types.ts", "utf8");
  assert.match(t, /replacementOutboundpackageinfo\?:/);
  assert.match(t, /replacementOutboundPackageInfo\?:/);
});

test("⚠ se pastreaza INTREG, nu se interpreteaza", () => {
  /* Nicio incercare de a scoate din el un AWB, un „trebuie sa trimiti", o eticheta. Nu stim ce
     inseamna campurile lui, deci nu ne prefacem ca stim. */
  assert.match(viu, /colet_inlocuire: inlocuire as never/);
  assert.doesNotMatch(viu, /inlocuire\.\w/, "nu se citeste niciun camp din el");
});

test("⚠ aprinderea e pe TRANZITIE, gol -> plin", () => {
  /*
   * ⚠ Scris la fiecare trecere, acelasi rand ar fi umplut jurnalul la cinci minute si l-ar fi
   * facut necitibil taman cand e nevoie de el. E aceeasi regula ca la renuntarea derivei eMAG,
   * unde conditia se uita la MEMORIA VECHE.
   *
   * ⚠ Si NU „numai la prima scriere a cererii": coletul poate aparea si DUPA ce stim cererea —
   * adica exact cazul obisnuit — iar asa l-am fi ratat.
   */
  assert.match(viu, /stiutInainte\?\.colet_inlocuire == null/);
  assert.match(viu, /\.select\("colet_inlocuire"\)/);

  const i = viu.indexOf("stiutInainte?.colet_inlocuire == null");
  const j = viu.indexOf('from("trendyol_claims").upsert(');
  assert.ok(i > 0 && j > i, "citirea trebuie sa fie INAINTEA scrierii, altfel tranzitia se pierde");
});

test("⚠ si mesajul spune pe fata ca nu stim", () => {
  /* Un jurnal care pretinde ca intelege ce s-a intamplat e mai rau decat unul care recunoaste ca
     nu. Cine il citeste peste o luna trebuie sa stie exact cat stiam. */
  assert.match(brut, /inca nu stim ce sa-i aratam comerciantului/);
});

test("⚠ faptele coletului de inlocuire ajung in ecran, fara instructiune", () => {
  /*
   * ⚠ Deosebirea fata de coletul RESPINS e toata aici. Acolo stim ce are omul de facut — ghidul
   * lor o spune — deci caseta e chihlimbarie si incepe cu „Mai ai de trimis coletul înapoi".
   * Aici NU stim: ghidul nu pomeneste schimburile deloc. Deci se arata ce vedem, cu ton neutru,
   * si nu se cere nimic.
   *
   * ⚠ Un „trimite un produs de schimb" ghicit gresit l-ar pune sa dea marfa degeaba — chiar
   * paguba de care ne aparam in cealalta directie la `coletDeTrimisInapoi`.
   */
  const act = readFileSync("src/lib/actions/trendyol-retururi.actions.ts", "utf8");
  assert.match(act, /coletInlocuire: r\.colet_inlocuire/);
  /* ⚠ AWB-ul vine NUMERIC in exemplul lor, nu ca sir. */
  assert.match(act, /r\.colet_inlocuire\.cargoTrackingNumber != null \? String\(/);

  const ui = readFileSync("src/components/dashboard/TrendyolReturns.tsx", "utf8");
  assert.match(ui, /Trendyol a creat un colet de înlocuire pentru returul ăsta\./);
  assert.match(ui, /r\.coletInlocuire\.awb/);

  /* ⚠ Si NU i se cere nimic: nicio propozitie care sa-l trimita sa expedieze. */
  const i = ui.indexOf("Trendyol a creat un colet de înlocuire");
  const caseta = ui.slice(i - 400, i + 1200);
  assert.doesNotMatch(caseta, /Mai ai de trimis|trebuie să trimiți|expediază/i,
    "nu se inventeaza nicio sarcina pentru comerciant");
});
