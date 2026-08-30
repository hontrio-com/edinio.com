import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   O HOTARARE DE RETUR NU PLEACA DE DOUA ORI (29.08.2026, dupa-amiaza)
   ══════════════════════════════════════════════════════════════════════════

   `approveClaimItems` / `rejectClaimItems` sunt IREVERSIBILE, iar la prima banii se intorc
   clientului. Singura paza dinaintea lor era `claim_item_status === "WaitingInAction"` — citit
   din COPIA NOASTRA, improspatata din cron la cinci sau zece minute.

   Autorul scrie chiar el, in acelasi fisier:

       ⚠ FEREASTRA DINTRE APASARE SI CONFIRMARE. `hotarasteRetur` scrie `decizie` de indata ce ei
       raspund, dar `claim_item_status` vine abia la reconciliere — pana la cinci minute mai tarziu.

   In fereastra aia starea e INCA `WaitingInAction`, deci paza trece a doua oara. Iar `decizie` —
   singurul martor ca noi am hotarat deja — nu era citit nicaieri:

       10:00 omul apasa „Acceptă"  -> pleaca la ei, banii se intorc clientului
       10:00 apasa din nou (sau alta fila, sau „Respinge")
       paza vede tot `WaitingInAction` -> pleaca A DOUA hotarare pe aceleasi linii ❌

   ⚠ SI CITIREA LUI `decizie` N-AR FI FOST DE AJUNS. El se scrie DUPA raspunsul lor — dinadins,
   fiindca „o hotarare marcata la noi si netrimisa la ei ar fi cea mai rea forma". Deci intre doua
   apasari simultane exista o clipa in care nici starea, nici hotararea nu spun nimic. De-aia se
   REZERVA inainte, printr-un update conditionat, si se da inapoi daca ei refuza.
*/

const retururi = readFileSync("src/lib/trendyol/retururi.ts", "utf8");
const actiuni = readFileSync("src/lib/actions/trendyol-retururi.actions.ts", "utf8");
const ecran = readFileSync("src/components/dashboard/TrendyolReturns.tsx", "utf8");

/** Corpul lui `hotarasteRetur`, ca sa nu numaram cod din alta functie. */
function corpulHotararii(): string {
  const i = retururi.indexOf("export async function hotarasteRetur");
  assert.notEqual(i, -1, "n-am gasit hotarasteRetur");
  const j = retururi.indexOf("\nexport ", i + 10);
  assert.notEqual(j, -1);
  return retururi.slice(i, j);
}
const corp = corpulHotararii();

test("⚠ o linie deja hotarata nu mai primeste o a doua hotarare", () => {
  assert.match(corp, /\.select\("claim_item_id, claim_item_status, decizie, hotarare_ceruta_la"\)/,
    "citirea liniilor trebuie sa aduca si hotararea noastra, nu doar starea lor");
  assert.match(corp, /const hotarate = p\.claimItemIds\.filter\(/);
  assert.match(corp, /Ai hotărât deja pentru acest retur/);
});

test("⚠ rezervarea se face INAINTEA apelului ireversibil", () => {
  /*
   * ⚠ Ordinea e chiar apararea. Rezervata dupa, n-ar opri nimic — cele doua apasari ar fi plecat
   * amandoua si abia apoi s-ar fi certat pe rand.
   */
  const iRezervare = corp.indexOf('.update({ hotarare_ceruta_la: acum }');
  const iAcceptare = corp.indexOf("await approveClaimItems(");
  const iRespingere = corp.indexOf("await rejectClaimItems(");
  assert.ok(iRezervare > 0, "lipseste rezervarea");
  assert.ok(iAcceptare > iRezervare, "acceptarea pleaca DUPA rezervare");
  assert.ok(iRespingere > iRezervare, "respingerea pleaca DUPA rezervare");
});

test("⚠ rezervarea e un update CONDITIONAT, altfel doua apasari o iau amandoua", () => {
  assert.match(corp, /\.is\("decizie", null\)\.is\("hotarare_ceruta_la", null\)/,
    "conditia e chiar ce face rezervarea sa fie o rezervare");
  /* ⚠ Si se citeste CE s-a rezervat, nu se presupune: altfel conditia n-ar folosi la nimic. */
  assert.match(corp, /\.select\("claim_item_id"\);/);
  assert.match(corp, /const nerezervate = p\.claimItemIds\.length - \(rezervate\?\.length \?\? 0\);/);
  /* ⚠ Si daca nu s-au rezervat toate, NU pleaca nimic — nici pentru cele rezervate. */
  assert.match(corp, /if \(nerezervate > 0\) \{[\s\S]{0,600}?return \{/);
});

test("⚠ un refuz dovedit da rezervarea inapoi, ca omul sa poata reincerca", () => {
  /*
   * ⚠ Numai la REFUZ. Daca nu stim ce-a iesit (retea cazuta dupa ce cererea a plecat), rezervarea
   * RAMANE — si asta e voit: o linie rezervata fara hotarare inseamna „a plecat si nu stim", adica
   * exact cazul in care nu se reincearca singur, ci se intreaba un om.
   */
  assert.match(corp, /const daInapoiRezervarea = async \(\) => \{/);

  /*
   * ⚠ SE CER CAILE, NU NUMARUL LOR. Prima varianta cerea „cel putin cinci dari-inapoi"; scosa una
   * din sase, proba trecea verde. Un prag pe numar pedepseste tocmai adaugarea unei cai noi si
   * iarta scoaterea uneia vechi — adica exact pe dos.
   *
   * Acum se cere ce trebuie: FIECARE iesire cu eroare dintre rezervare si scrierea hotararii
   * trebuie sa dea rezervarea inapoi mai intai.
   */
  const iRez = corp.indexOf("const nerezervate =");
  const iScris = corp.indexOf('.update({\n      decizie:');
  const intre = corp.slice(iRez, iScris > 0 ? iScris : corp.length);
  assert.ok(intre.length > 0);
  const iesiri = [...intre.matchAll(/return \{ error/g)];
  assert.ok(iesiri.length >= 4, `asteptam mai multe iesiri intre rezervare si scriere, sunt ${iesiri.length}`);
  for (const m of iesiri) {
    const inainte = intre.slice(Math.max(0, m.index - 200), m.index);
    assert.match(inainte, /await daInapoiRezervarea\(\)/,
      `o iesire cu eroare de dupa rezervare nu o da inapoi: …${intre.slice(Math.max(0, m.index - 90), m.index + 40)}`);
  }
  /* ⚠ Si se da inapoi DOAR ce am rezervat noi, dupa clipa scrisa — nu tot ce e nehotarat. */
  assert.match(corp, /\.eq\("hotarare_ceruta_la", acum\)/);
});

test("⚠ si bifa din ecran se stinge, nu doar cererea se refuza", () => {
  /*
   * ⚠ Un refuz pe server e ultima plasa, nu prima. Ecranul lasa bifa vie fiindca se uita tot la
   * `claim_item_status` — deci omul apasa din nou, cu incredere, si abia atunci afla.
   */
  assert.match(actiuni, /sePoateHotari\(l\.claim_item_status\)\s*\n?\s*&& l\.decizie == null && l\.hotarare_ceruta_la == null/);
  /* ⚠ Si linia spune CE se intampla: „se trimite" nu e acelasi lucru cu „nu mai asteapta". */
  assert.match(actiuni, /seTrimite: l\.decizie == null && l\.hotarare_ceruta_la != null,/);
  assert.match(ecran, /se trimite hotărârea la Trendyol/);
  /* ⚠ Si vechiul text nu mai apare pentru o linie in zbor. */
  assert.match(ecran, /!l\.sePoateHotari && !l\.decizie && !l\.seTrimite/);
});

test("⚠ coloana chiar exista, si citirea o aduce pana in ecran", () => {
  /*
   * ⚠ Proba care scaneaza sursa arata ca SCRIE `hotarare_ceruta_la`, nu ca are ce citi. De-aia se
   * cere si coloana in temelie, si prezenta ei in select — lantul care lipsea la `aprobat_odata`.
   */
  const temelie = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  assert.match(temelie, /hotarare_ceruta_la timestamp with time zone/i);
  assert.match(actiuni, /trendyol_claim_items\([^)]*hotarare_ceruta_la[^)]*\)/,
    "citirea pentru ecran trebuie sa aduca rezervarea");
});
