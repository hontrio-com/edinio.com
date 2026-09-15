import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";

import { ofertePosibile } from "./preturi";
import { CURIER_EASYBOX } from "./expediere";
import type { OfertaSmartship } from "./client";

/*
 * ⚠ UN FILTRU CARE NU POATE FI BIFAT INCHIDE CE FILTREAZA.
 *
 * `curieri_permisi` e lista de curieri pe care comerciantul ii lasa sa apara.
 * Casutele din panou se umplu dintr-o COTARE DE PROBA (Bucuresti spre
 * Cluj-Napoca, 1 kg, fara locker), fiindca SmartShip n-are endpoint de curieri.
 *
 * Iar documentatia lor spune: „Fara locker_id, easybox nu apare la estimare si nu
 * se poate emite." Deci curierul 12 nu poate ajunge NICIODATA in acea lista, si
 * deci nici in `curieri_permisi`.
 *
 * Pe cealalta parte, cotarea unei comenzi la locker trimite `locker_id`, iar
 * atunci „/cost intoarce DOAR varianta la locker". Un singur rand, cu curierul 12.
 *
 * Puse cap la cap: comerciantul care bifa fie si un singur curier isi stingea
 * tacut easybox-ul. Comanda venita din checkout cu punct de ridicare nu mai putea
 * primi AWB din panou, si mesajul dadea vina pe furnizor („SmartShip n-a intors
 * nicio oferta pentru comanda asta").
 *
 * ⚠ Nu era o nepotrivire de forma, ci una de INTELES: filtrul raspunde la „ce
 * curieri livreaza la adresa", iar lockerele au deja comutatoarele lor
 * (`foloseste_easybox`, `foloseste_fanbox`). Aceeasi clasa cu
 * [[campuri-scrise-dar-necitite]]: o setare care exista si nu poate fi atinsa.
 *
 * ═══ CE APARA PROBELE ═══
 *
 *   1. la ADRESA filtrul lucreaza mai departe, exact ca pana acum;
 *   2. la LOCKER nu se aplica, oricat de scurta ar fi lista de bifate;
 *   3. ⚠ si apelantul chiar il spune: mutantul sta pe `coteazaSmartshipAction`,
 *      care e singurul loc de unde afla `felLivrare`.
 */

function oferta(courierId: number, cost: number, peste: Partial<OfertaSmartship> = {}): OfertaSmartship {
  return { courier_id: courierId, courier_name: `Curier ${courierId}`, cost, ...peste };
}

/** Raspunsul lor la o cotare cu `locker_id`: UN singur rand, curierul 12. */
const LA_LOCKER = [oferta(CURIER_EASYBOX, 18.5, { courier_name: "SameDay EasyBox" })];

const LA_ADRESA = [oferta(1, 16.13, { courier_name: "Cargus" }), oferta(19, 23.69, { courier_name: "FedEx" })];

describe("SmartShip: filtrul de curieri nu inchide lockerul", () => {
  test("la adresa, filtrul taie ce n-a bifat comerciantul", () => {
    const r = ofertePosibile(LA_ADRESA, { curieri_permisi: [1] });
    assert.deepEqual(r.map((o) => o.courierId), [1]);
  });

  /*
   * ⚠ Randul asta e chiar defectul, scris ca proba: lista bifata n-are cum sa
   * contina 12, iar cotarea la locker n-are alt rand de intors.
   */
  test("la locker, o lista bifata fara 12 NU mai lasa comanda fara oferte", () => {
    const fara = ofertePosibile(LA_LOCKER, { curieri_permisi: [1, 19] });
    assert.equal(fara.length, 0, "asa arata vechiul defect, pastrat ca reper");

    const cu = ofertePosibile(LA_LOCKER, { curieri_permisi: [1, 19] }, { laLocker: true });
    assert.deepEqual(cu.map((o) => o.courierId), [CURIER_EASYBOX]);
  });

  test("fara nicio bifa, nimic nu se schimba pe niciuna din cai", () => {
    assert.equal(ofertePosibile(LA_LOCKER, {}).length, 1);
    assert.equal(ofertePosibile(LA_LOCKER, {}, { laLocker: true }).length, 1);
    assert.equal(ofertePosibile(LA_ADRESA, {}).length, 2);
  });

  /* ⚠ `laLocker` scuteste de FILTRU, nu de celelalte reguli: o oferta fara pret
     sau fara curier tot nu se poate duce pana la emitere. */
  test("la locker se sar doar bifele, nu si verificarile de fond", () => {
    const stricate = [
      oferta(CURIER_EASYBOX, 0),
      { courier_name: "Fara curier", cost: 12 } as OfertaSmartship,
    ];
    assert.equal(ofertePosibile(stricate, { curieri_permisi: [1] }, { laLocker: true }).length, 0);
  });

  test("steagul stins se poarta ca lipsa lui", () => {
    const a = ofertePosibile(LA_LOCKER, { curieri_permisi: [1] }, { laLocker: false });
    const b = ofertePosibile(LA_LOCKER, { curieri_permisi: [1] });
    assert.equal(a.length, b.length);
  });
});

/*
 * ⚠ MUTANTUL PE APELANT.
 *
 * `ofertePosibile` poate primi steagul si tot sa nu-l vada nimeni, daca apelantul
 * nu i-l da. `coteazaSmartshipAction` e singurul loc din platforma care coteaza cu
 * `felLivrare`, deci acolo se uita proba.
 *
 * ⚠ Proba citeste SURSA fiindca actiunea are nevoie de Supabase si de un magazin
 * adevarat ca sa se poata chema. Aceeasi unealta ca la
 * `scrierile-din-actiuni-poarta-magazinul` si `grilele-nu-se-impun-pe-telefon`:
 * cand apelantul nu se poate rula, se citeste ce scrie in el.
 */
describe("SmartShip: apelantul chiar spune cand e locker", () => {
  const SURSA = "src/lib/actions/smartship.actions.ts";

  test("cotarea din panou ii da lui ofertePosibile felul livrarii", () => {
    const text = readFileSync(SURSA, "utf8");

    const apeluri = [...text.matchAll(/ofertePosibile\([^;]*?\)/g)].map((m) => m[0]);
    assert.ok(apeluri.length > 0, `niciun apel catre ofertePosibile in ${SURSA}`);

    /* Apelul care primeste configurarea e cel al comenzii; celalalt (lista de
       curieri din panou) coteaza dinadins FARA filtru. */
    const cuConfig = apeluri.filter((a) => a.includes("config"));
    assert.equal(cuConfig.length, 1, `astept un singur apel cu configurare, am gasit ${cuConfig.length}`);
    assert.match(cuConfig[0], /laLocker:\s*date\.felLivrare === "locker"/);
  });
});
