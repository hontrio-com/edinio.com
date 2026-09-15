import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * ⚠ SECRETUL SE PUNE INAINTE DE ORICE AFIRMATIE, si nu e o formalitate: `amprentaPlanului` cheama
 * `secret()`, care de la `c6564bb4` ARUNCA daca lipseste. Incarcatorul probelor nu aduce niciun
 * `.env`, deci fara randul asta fiecare afirmatie de mai jos ar cadea pe lipsa cheii, nu pe
 * regula pe care o apara. Aceeasi masura o ia si `quote-token.test.ts`.
 *
 * ⚠ Merge dupa `import` fiindca `secret()` se cheama la APEL, nu la incarcarea modulului.
 */
import { amprentaPlanului, type PlanExpedierii } from "./quote-token";

process.env.SHIPPING_QUOTE_SECRET = "cheie-de-proba-amprenta-plan";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UN CAMP NOU IN PLAN NU ARE VOIE SA SCHIMBE AMPRENTELE VECHI    (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `amprentaPlanului` leaga serviciul ales de cotatia semnata. Lista de campuri e scrisa de mana,
 * in ordine fixa, si se imbina cu `~`.
 *
 * ⚠ DE-AICI VINE CAPCANA. Un camp nou pus in lista, chiar gol, adauga inca un `~` la FIECARE
 * plan, deci schimba amprenta TUTUROR cotatiilor deja semnate. Ele traiesc 24 de ore. Adica, timp
 * de o zi de la desfasurare, fiecare comanda cinstita cu plan (brokeri, transportatori, puncte
 * FAN) ar fi fost REFUZATA cu motivul „plan schimbat". Nu o comanda, TOATE.
 *
 * Campul `samedayPointNet` s-a adaugat deci CONDITIONAT: intra in sir doar cand are valoare.
 * Probele de mai jos apara amandoua jumatatile regulii.
 */

/** Un plan ca cele semnate pana pe 15.09.2026: cu serviciu, fara reteaua Sameday. */
const PLAN_VECHI: PlanExpedierii = {
  wootServiceId: 7,
  smartshipCourierId: 3,
  smartshipOwnContract: true,
  fanPointType: "paypoint",
  shipoRateId: 1234,
};

/*
 * ⚠ VALOAREA E FIXATA DE MANA, si asta e jumatate din proba.
 *
 * Comparata doar cu ea insasi (`amprentaPlanului(PLAN)` fata de `amprentaPlanului({...PLAN, camp})`),
 * afirmatia ar fi trecut SI dupa ce cineva ar fi pus campul necontitionat in lista: toate valorile
 * s-ar fi schimbat impreuna, deci egalitatea s-ar fi pastrat, si tocmai asta nu trebuie.
 *
 * Numarul de mai jos e socotit cu cheia de proba de deasupra, cu `parti.join("~")` peste cele 15
 * campuri vechi. Daca vreodata cade: nu se URCA aici numarul nou. Intai se raspunde la intrebarea
 * „de ce s-a schimbat amprenta planurilor deja semnate", fiindca raspunsul e ca fiecare comanda
 * cinstita cu plan cade 24 de ore.
 */
const AMPRENTA_VECHE = "FmkxyI3AoN8oLtDq";

test("⚠⚠ amprenta unui plan FARA reteaua Sameday e neschimbata", () => {
  assert.equal(amprentaPlanului(PLAN_VECHI), AMPRENTA_VECHE,
    "amprenta planurilor vechi s-a schimbat: cotatiile deja semnate cad 24 de ore");
  assert.equal(amprentaPlanului({ ...PLAN_VECHI, samedayPointNet: null }), AMPRENTA_VECHE,
    "`null` nu are voie sa schimbe amprenta");
  assert.equal(amprentaPlanului({ ...PLAN_VECHI, samedayPointNet: undefined }), AMPRENTA_VECHE,
    "lipsa nu are voie sa schimbe amprenta");
  assert.equal(amprentaPlanului({ ...PLAN_VECHI, samedayPointNet: "" }), AMPRENTA_VECHE,
    "sirul gol nu are voie sa schimbe amprenta");
});

test("⚠⚠ dar reteaua PUDO CHIAR se leaga, altfel n-ar apara nimic", () => {
  /*
   * Fara asta, cineva putea lua tokenul optiunii de easybox (mai ieftina) si plasa comanda cu un
   * punct PUDO semnat cinstit. Reteaua fisei nu s-ar fi confruntat cu nimic, iar diferenta de
   * tarif ar fi platit-o comerciantul la emitere.
   */
  const cu = amprentaPlanului({ ...PLAN_VECHI, samedayPointNet: "pudo" });
  assert.notEqual(cu, AMPRENTA_VECHE, "reteaua PUDO trebuie sa intre in amprenta");
  assert.ok(cu.length > 0);
});

test("un plan care poarta DOAR reteaua PUDO nu se socoteste gol", () => {
  /* „Toate goale" inseamna „fara plan de serviciu" si intoarce sirul vid. O retea aleasa NU e
     absenta unui plan, iar tratata asa n-ar fi legata de nimic. */
  assert.notEqual(amprentaPlanului({ samedayPointNet: "pudo" }), "");
  assert.equal(amprentaPlanului({}), "");
  assert.equal(amprentaPlanului(null), "");
});

test("aceeasi valoare da mereu aceeasi amprenta, oricum ar fi scrisa", () => {
  /* Invarianta care conteaza: ordinea cheilor obiectului nu se vede in sir, iar spatiile si
     literele mari se normalizeaza. Altfel doua obiecte cu aceleasi valori ar da amprente
     diferite, si fiecare comanda cinstita ar cadea pe „plan schimbat". */
  const a = amprentaPlanului({ samedayPointNet: "pudo", wootServiceId: 7 });
  const b = amprentaPlanului({ wootServiceId: 7, samedayPointNet: "  PUDO  " });
  assert.equal(a, b);
});

test("⚠ campul se adauga la COADA, dupa lista fixa, nu intercalat in ea", () => {
  /*
   * Pus la mijloc, ar fi mutat toate campurile de dupa el, deci ar fi schimbat amprentele vechi
   * la fel de rau ca daca ar fi fost necontitionat. Regula e o CABLARE, deci se citeste din sursa.
   */
  const sursa = readFileSync(new URL("./quote-token.ts", import.meta.url), "utf8");
  const iLista = sursa.indexOf("p(plan.dhlProductCode), p(plan.dhlLocalProductCode), p(plan.fanPointType),");
  const iAdaos = sursa.indexOf("parti.push(retSameday)");
  assert.notEqual(iLista, -1, "lista fixa de campuri nu se mai gaseste");
  assert.notEqual(iAdaos, -1, "adaugarea conditionata nu se mai gaseste");
  assert.ok(iAdaos > iLista, "campul nou trebuie adaugat DUPA lista fixa");
  assert.ok(
    /if \(retSameday !== ""\) parti\.push\(retSameday\);/.test(sursa),
    "adaugarea trebuie sa ramana CONDITIONATA de o valoare nevida",
  );
});
