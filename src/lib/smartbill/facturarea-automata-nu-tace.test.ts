import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * FACTURAREA AUTOMATA NU MAI TACE CAND E REFUZATA         (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `maybeAutoGenerateInvoice` e singura cale de facturare FARA niciun om in fata. Pe celelalte,
 * o eroare ajunge in interfata si comerciantul apasa din nou; aici, comanda isi vede de drum si
 * factura pur si simplu nu apare.
 *
 * ⚠⚠ MASURAT IN PRODUCTIE pe 16.09.2026, si asta a facut diferenta intre banuiala si defect:
 *
 *   * 240 de facturi emise prin SmartBill, 21 de stornouri, 7 magazine pornite;
 *   * in registrul de operatii externe, un esec pe 15.09: „Autentificare esuata";
 *   * in `error_logs`: **ZERO** randuri de la oricare dintre cele trei case de facturare,
 *     desi tabelul are 2.071 de randuri de la 45 de actiuni, pana azi.
 *
 * Deci exact asta s-a si intamplat: un magazin viu a avut o emitere refuzata si nimeni n-a aflat.
 *
 * Trei guri prin care iesea tacerea, toate astupate aici:
 *   1. refuzul VENIT DE LA EI (`emiteFacturaSubRegistru` intoarce `{error}`) — `return false` sec;
 *   2. avertismentul de email — pe calea manuala ajunge in interfata, aici era ARUNCAT;
 *   3. `catch {}` gol la capat — inghitea si defectele noastre, cu acelasi simptom: nimic.
 *
 * ⚠ `return false` RAMANE pe toate trei. Dispecerul nu are voie sa rupa actualizarea comenzii
 * fiindca n-a putut emite o factura; ce se schimba e ca tacerea devine un rand scris.
 */

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const ACTIUNI = "src/lib/actions/smartbill.actions.ts";

/** Corpul lui `maybeAutoGenerateInvoice`, ca sa nu numaram pazele celorlalte cai. */
function caleaAutomata(s: string): string {
  const i = s.indexOf("export async function maybeAutoGenerateInvoice");
  assert.ok(i > 0, "functia a disparut sau s-a redenumit");
  return s.slice(i);
}

describe("Calea fara om in fata isi spune esecurile", () => {
  const s = viu(ACTIUNI);
  const auto = caleaAutomata(s);

  test("⚠⚠ refuzul SmartBill se strigă, nu se mai intoarce `false` sec", () => {
    assert.match(auto, /if \("error" in result\) \{/, "ramura de eroare si-a pierdut corpul");
    assert.match(auto, /action: "smartbill\.facturaAutomataRefuzata"/, "refuzul nu lasa nicio urma");
    assert.match(auto, /severity: "critical"/, "un magazin care nu mai factureaza nu e un avertisment");
  });

  test("⚠⚠ dar comanda tot merge mai departe: `return false`, nu aruncare", () => {
    /*
     * Asta e jumatatea cealalta, si e la fel de importanta: o exceptie aici ar rupe actualizarea
     * starii comenzii, adica facturarea ar putea bloca livrarea.
     */
    const ramura = /if \("error" in result\) \{[\s\S]*?\n    \}/.exec(auto)?.[0] ?? "";
    assert.match(ramura, /return false;/, "ramura de refuz nu mai intoarce fals");
    assert.ok(!/throw /.test(ramura), "s-a strecurat o aruncare pe calea automata");
  });

  test("⚠ mesajul spune COMANDA si CE E DE FACUT, nu doar ca a picat", () => {
    /* O alarma care nu spune pasul urmator il invata pe om sa n-o mai citeasca. */
    assert.match(auto, /Factura automata nu s-a emis pentru comanda/);
    assert.match(auto, /Emite factura din pagina comenzii/);
  });

  test("⚠⚠ avertismentul de email nu mai e aruncat", () => {
    /* Cu `send_email` pornit (3 magazine din 7) si serverul lor de email neconfigurat, niciun
       cumparator nu primea factura, si nimic nu spunea asta. */
    assert.match(auto, /const avertismentEmail = await trySendDocEmail\(/, "rezultatul e iar ignorat");
    assert.match(auto, /action: "smartbill\.emailAutomatNetrimis"/);
  });

  test("⚠⚠ `catch` gol nu mai inghite defectele noastre", () => {
    assert.match(auto, /\} catch \(e\) \{/, "capatul a redevenit un `catch` fara argument");
    assert.match(auto, /action: "smartbill\.facturaAutomataCazuta"/);
    /* ⚠ Si scrierea alarmei nu are voie sa arunce ea insasi din `catch`. */
    assert.match(auto, /\}\)\.catch\(\(\) => \{\}\);/, "logError din catch poate arunca mai departe");
  });

  test("⚠ eroarea din reconciliere ramane strigata, ca pana acum", () => {
    /* Era singura care se auzea; reparatia n-avea voie s-o piarda. */
    assert.match(auto, /action: "smartbill\.reconcileRefuzat"/);
  });
});

describe("Scrierile pe comanda poarta magazinul", () => {
  const s = viu(ACTIUNI);

  test("⚠⚠ toate cele sase actualizari filtreaza SI pe `business_id`", () => {
    /*
     * Filtrele de aici sunt AUTORIZARE, nu cautare. Cinci din sase o faceau; a sasea, scrierea
     * stornoului, filtra doar pe `id`. Nu era o gaura (comanda fusese deja legata de magazin la
     * citire, iar clientul e cel al utilizatorului, deci RLS statea in fata), dar o singura
     * scriere care se bizuie pe altceva e chiar cea care supravietuieste unui refactor.
     */
    const actualizari = s.match(/from\("orders"\)\s*\n?\s*\.update\(\{[\s\S]*?\}\)((?:\s*\.\w+\([^)]*\))+)/g) ?? [];
    assert.ok(actualizari.length >= 6, `s-au gasit doar ${actualizari.length} actualizari de comanda`);
    const faraMagazin = actualizari.filter((a) => !a.includes('eq("business_id"'));
    assert.deepEqual(
      faraMagazin.map((a) => a.slice(0, 90)), [],
      "o actualizare de comanda nu poarta magazinul in filtru",
    );
  });
});
