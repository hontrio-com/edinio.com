import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   SETARILE CARE INTRA IN INCARCATURA SE SI TRIMIT (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   `salveazaSetariEmag` se termina la `revalidatePath`. Dar valorile alea nu sunt decor:
   pleaca spre eMAG chiar in incarcaturile ofertelor. Salvate si netrimise, ecranul spunea
   „Salvat." si la ei ramanea vechiul.

   ⚠ COSTUL DIFERA PE CAMP, si nu e cel banuit de audit:

     `green_tax`, `supply_lead_time`  pleaca NUMAI pe ruta grea, nu sunt in amprenta de
                                      continut si nu sunt in deriva. Deci nu ajung
                                      NICIODATA singure la ofertele deja publicate. O taxa
                                      verde pusa dupa publicare o plateste comerciantul din
                                      marja, tacut. ASTA e paguba adevarata.
     `vat_id`, `handling_time`        raman vechi pana la urmatoarea miscare de pret.
     `stoc_rezervat`                  se repara singur prin deriva — chiar exemplul din
                                      audit e singurul care n-avea nevoie de reparatie.
*/

const act = readFileSync("src/lib/actions/emag.actions.ts", "utf8");
const viu = act.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("se compara cu configul citit la INTRARE, nu cu peticul", () => {
  /* Singura forma din care se poate afla ce s-a schimbat de fapt. */
  assert.match(viu, /const vechi = \(veche \?\? \{\}\) as unknown as Record<string, unknown>;/);
  assert.match(viu, /Object\.prototype\.hasOwnProperty\.call\(petic, cheie\)/);
});

test("⚠ fiecare camp cere ruta care il DUCE, nu cea mai grea", () => {
  /*
   * Regula casei (§1.3): o schimbare de pret n-are voie sa atinga `product_offer/save`.
   * Deci ruta grea o cer numai campurile care CHIAR pleaca pe ea.
   *
   * ⚠ ERA O LISTA INCOMPLETA, si asta a costat (indreptat 25.08.2026): GPSR
   * (`safety_information`, `manufacturer`, `eu_representative`) pleaca tot pe
   * `product_offer/save` — nu e in amprenta si nu e in deriva, deci fara randul asta nu
   * ajungea NICIODATA singur la ofertele deja publicate. Un produs respins tocmai fiindca
   * ii lipsea GPSR-ul ramanea respins dupa ce comerciantul completa datele.
   *
   * Proba a picat cand s-a adaugat, cum trebuia. Lista are voie sa creasca — dar numai cu
   * campuri care n-au o ruta mai usoara.
   */
  assert.match(viu, /const cereRutaGrea = sASchimbat\("green_tax"\) \|\| sASchimbat\("supply_lead_time"\) \|\| gpsrSAChimbat;/);
  assert.match(viu, /const cerePret = sASchimbat\("vat_id"\) \|\| sASchimbat\("handling_time"\);/);
  assert.match(viu, /const cereStoc = sASchimbat\("stoc_rezervat"\) \|\| sASchimbat\("warehouse_id"\);/);
});

test("⚠ o SINGURA operatie, cea mai grea dintre cele cerute", () => {
  /*
   * `oferta` duce si pretul, si stocul. Trei puneri in coada pe acelasi produs ar fi
   * insemnat trei treceri pentru un singur efect — si trei cereri din cele 3 pe secunda
   * ale magazinului, aceleasi prin care pleaca o miscare de stoc dupa o vanzare.
   */
  assert.match(viu, /if \(cereRutaGrea\) await enqueueEmagSyncMany\(businessId, ids\);/);
  assert.match(viu, /else if \(cerePret\) await enqueueEmagPretMany\(businessId, ids\);/);
  assert.match(viu, /else await enqueueEmagStocMany\(businessId, ids\);/);
});

test("nu se pune nimic la rand cand nu s-a schimbat nimic din ce pleaca", () => {
  /* ⚠ Salvarea altor setari din aceeasi carte n-are de ce sa puna catalogul la coada. */
  assert.match(viu, /if \(cereRutaGrea \|\| cerePret \|\| cereStoc\) \{/);
});

test("⚠ catalogul se citeste intreg, si prin `dupaRaspuns`", () => {
  assert.match(viu, /fetchAllRowsStrict<\{ product_id: string \| null \}>\(\s*"emag\.setari-propagate"/);
  assert.match(viu, /\}, "setariEmagPropagate", businessId\);/);
  /* ⚠ Si nu tine salvarea pe loc: omul primeste „Salvat." imediat. */
  const iCoada = viu.indexOf('"setariEmagPropagate"');
  const iRevalidate = viu.indexOf("revalidatePath(FEATURE_PATH);", iCoada);
  assert.ok(iRevalidate > iCoada, "raspunsul pleaca dupa ce lucrarea e programata, nu asteptata");
});

/* ── Si citirea din import ────────────────────────────────────────────────── */

test("⚠ „auto_publish stins” nu se mai confunda cu „n-am putut citi”", () => {
  /*
   * `anuntaCanalele` citea setarile fara `error`. O citire picata dadea `setari = null`,
   * deci `autoPublish = false`, deci lotul de produse NOI dintr-un import nu mai intra pe
   * calea de publicare — fara nicio urma nicaieri.
   *
   * ⚠ Nu se OPRESTE anuntul, se scrie doar: celelalte canale n-au treaba cu steagul asta si
   * trebuie anuntate oricum. Transformam o pierdere muta intr-una masurabila, fara sa luam
   * si ce merge.
   */
  const imp = readFileSync("src/lib/import/committer.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(imp, /const \{ data: setari, error: eSetari \}/);
  assert.match(imp, /if \(eSetari\) \{[\s\S]{0,500}?logError\(/);

  /* ⚠ Iar anuntul chiar merge mai departe: garda nu are `return`. */
  const i = imp.indexOf("if (eSetari)");
  const j = imp.indexOf("const autoPublish", i);
  assert.ok(j > i, "hotararea despre auto_publish vine dupa garda");
  assert.doesNotMatch(imp.slice(i, j), /return;/, "nu se opreste anuntul catre celelalte canale");
});
