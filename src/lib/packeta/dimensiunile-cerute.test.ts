import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dimensiuniBune, lipsuriExpediere, type DateExpediere } from "./expediere";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * O GARDA PROMISA IN COMENTARIU, CARE NU EXISTA                (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Unii curieri Packeta CER dimensiunile (`requiresSize` in fluxul lor) si refuza coletul fara
 * ele. Comentariul din `packeta.actions.ts` spunea: „daca nici acelea nu exista,
 * `lipsuriExpediere` opreste aici".
 *
 * ⚠ NU OPREA. `lipsuriExpediere` nu se uita deloc la dimensiuni: `construiesteAtribute` omitea
 * pur si simplu `size`, iar coletul pleca la Packeta fara ele si era refuzat de EI, cu mesajul
 * lor, dupa ce ajunsesem la emitere.
 *
 * ⚠⚠ SI A DOUA JUMATATE A GAURII: `dimensiuni_implicite` era CITITA la emitere, dar nu putea fi
 * SCRISA de nicaieri, fiindca ecranul de configurare n-o avea deloc. Deci pentru curierii care
 * cer dimensiuni, emiterea era imposibila oricat ar fi incercat comerciantul, si nimic nu-i
 * spunea de ce.
 */

const BAZA: DateExpediere = {
  numarComanda: "CMD-1",
  addressId: "123",
  eshop: "magazin",
  valoare: 100,
  greutateKg: 1,
  laAdresa: false,
  destinatar: { nume: "Ion Popescu", telefon: "+40722222222", email: "a@b.ro" },
};

const areDimensiuni = (l: string[]) => l.some((x) => /dimensiunile coletului/i.test(x));

test("⚠⚠ cand curierul CERE dimensiuni si nu le avem, se opreste INAINTE de emitere", () => {
  const lipsuri = lipsuriExpediere({ ...BAZA, cereDimensiuni: true });
  assert.ok(areDimensiuni(lipsuri), `lipsurile nu pomenesc dimensiunile: ${lipsuri.join("; ")}`);
});

test("⚠ cand curierul NU le cere, lipsa lor nu opreste nimic", () => {
  /* Plasa care apara reparatia de exces: majoritatea curierilor nu le cer, iar o garda oarba ar
     fi blocat toate expedierile. */
  assert.equal(areDimensiuni(lipsuriExpediere(BAZA)), false);
  assert.equal(areDimensiuni(lipsuriExpediere({ ...BAZA, cereDimensiuni: false })), false);
});

test("cu dimensiuni bune, garda tace", () => {
  const cu = { ...BAZA, cereDimensiuni: true, dimensiuniMm: { lungime: 200, latime: 150, inaltime: 100 } };
  assert.equal(areDimensiuni(lipsuriExpediere(cu)), false);
});

test("⚠ doua laturi din trei NU sunt dimensiuni", () => {
  /*
   * Un colet cu inaltimea zero nu exista. Trecuta de garda, valoarea ar fi plecat la ei si tot
   * ar fi fost refuzata, doar ca mai tarziu si cu alt mesaj.
   */
  for (const rele of [
    { lungime: 200, latime: 150, inaltime: 0 },
    { lungime: 0, latime: 0, inaltime: 0 },
    { lungime: 200, latime: -5, inaltime: 100 },
    { lungime: Number.NaN, latime: 150, inaltime: 100 },
  ]) {
    assert.equal(dimensiuniBune(rele), false, JSON.stringify(rele));
    assert.equal(
      areDimensiuni(lipsuriExpediere({ ...BAZA, cereDimensiuni: true, dimensiuniMm: rele })),
      true,
      JSON.stringify(rele),
    );
  }
  assert.equal(dimensiuniBune(null), false);
  assert.equal(dimensiuniBune(undefined), false);
  assert.equal(dimensiuniBune({ lungime: 1, latime: 1, inaltime: 1 }), true);
});

/* ═══ MUTANTUL STA PE APELANT ═══ */
test("⚠ emiterea chiar duce mai departe ce a spus fluxul lor de curieri", () => {
  const sursa = readFileSync(new URL("../actions/packeta.actions.ts", import.meta.url), "utf8");
  assert.match(sursa, /cereDimensiuni,/, "steagul trebuie sa ajunga in datele expedierii");
  /* Si tot de acolo vin dimensiunile implicite ale magazinului. */
  assert.match(sursa, /config\.dimensiuni_implicite \?\? null/);
});

test("⚠⚠ setarea CHIAR se poate scrie din ecranul de configurare", () => {
  /*
   * Asta e jumatatea care lipsea. Campul era citit la emitere si tipat in config, dar ecranul
   * nu-l avea deloc, iar `construieste()` nu-l trimitea: se pierdea la fiecare salvare.
   */
  const ecran = readFileSync(
    new URL("../../components/dashboard/PacketaConfigClient.tsx", import.meta.url), "utf8",
  );
  assert.match(ecran, /dimensiuni_implicite:/, "configurarea salvata trebuie sa cuprinda campul");
  assert.match(ecran, /initialConfig\?\.dimensiuni_implicite\?\.lungime/, "si sa-l arate inapoi");
  assert.match(ecran, /Dimensiuni implicite \(milimetri\)/, "cu unitatea spusa pe ecran");
  /* ⚠ Doua laturi din trei nu se salveaza: ar trece de garda si ar fi refuzate de ei. */
  assert.match(ecran, /Number\(dimL\) > 0 && Number\(dimW\) > 0 && Number\(dimH\) > 0/);
});
