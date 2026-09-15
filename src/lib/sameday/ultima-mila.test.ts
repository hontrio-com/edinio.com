import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { campulUltimeiMile } from "./ultima-mila";

test("PUDO cere oohLastMile", () => {
  assert.equal(campulUltimeiMile("PP"), "oohLastMile");
  assert.equal(campulUltimeiMile("pp"), "oohLastMile");
  assert.equal(campulUltimeiMile("  PP  "), "oohLastMile");
});

test("dulapurile cer lockerLastMile", () => {
  assert.equal(campulUltimeiMile("LN"), "lockerLastMile");
  assert.equal(campulUltimeiMile("XL"), "lockerLastMile");
});

test("necunoscutul cade pe purtarea de pana acum, nu pe cea noua", () => {
  /*
   * Aici e miezul: un cod nou de-al lor, sau o citire de servicii picata, n-are voie sa mute
   * tacit coletele de pe campul pe care merg azi. Toate cele cinci comenzi la punct masurate
   * in productie sunt easybox.
   */
  for (const cod of [null, undefined, "", "24", "6H", "RS", "ceva-nou"]) {
    assert.equal(campulUltimeiMile(cod), "lockerLastMile", `codul ${String(cod)}`);
  }
});

/*
 * ═══ MUTANTUL STA PE APELANT ═══
 *
 * Probele de mai sus apara functia. Dar functia poate fi perfecta si nechemata: pana azi
 * `createSamedayAwb` scria `lockerLastMile` fix in sir. Proba asta apara CABLAREA.
 */
test("createSamedayAwb nu mai scrie campul de ultima mila fix in sir", () => {
  const sursa = readFileSync(new URL("./client.ts", import.meta.url), "utf8");
  const corp = bloculFunctiei(sursa, "export async function createSamedayAwb");

  assert.ok(
    corp.includes("campulUltimeiMile(codServiciu)"),
    "campul trebuie ales de `campulUltimeiMile`, nu scris in sir",
  );
  assert.ok(
    !corp.includes("`lockerLastMile=$"),
    "`lockerLastMile=` scris fix in sir a fost chiar defectul: punctul PUDO ar pleca pe campul dulapurilor",
  );
  /* Codul se ia din serviciul CHIAR folosit, nu din cel configurat. */
  assert.ok(
    corp.includes("servicii.find((x) => x.id === serviceId)?.code"),
    "codul trebuie cautat dupa `serviceId`, adica dupa serviciul ales, nu dupa cel implicit",
  );
  /* Iar o citire picata nu schimba nimic: ramane `null`, deci ramura de pana acum. */
  assert.ok(corp.includes("codServiciu = null;"), "citirea picata trebuie sa cada pe necunoscut");
});

test("cotatia de la checkout ramane pe easybox si nu se preface ca stie serviciul", () => {
  /*
   * `estimateSamedayCost` trimite si el `lockerLastMile`, dar acolo e corect: fereastra
   * noastra ofera numai dulapuri, iar cotatia cheama anume serviciul `LN`. Proba tine
   * legatura vizibila, ca sa nu se rupa tacut daca se adauga PUDO la checkout.
   */
  const sursa = readFileSync(new URL("./client.ts", import.meta.url), "utf8");
  const corp = bloculFunctiei(sursa, "export async function estimateSamedayCost");
  assert.ok(corp.includes("getSamedayLockerServiceId(config)"), "cotatia cheama serviciul LN");
});

/**
 * Corpul unei functii, taiat pe acolade potrivite. Un slice fix ar imprumuta de la vecin.
 *
 * ⚠ PRIMA ACOLADA NU E CORPUL. La `estimateSamedayCost` semnatura poarta un tip scris pe
 * loc (`input: { ... }`), iar la alte functii tipul intors e `Promise<{ ... }>`. Luata
 * lacom, prima acolada da lista de parametri, si atunci proba cade pe cod BUN, adica exact
 * plasa despre care vorbeste `slice-ul-de-corp-imprumuta-de-la-vecin`. De-aia se sare peste
 * acoladele dinauntrul parantezelor si dinauntrul parametrilor de tip.
 */
function bloculFunctiei(sursa: string, antet: string): string {
  const start = sursa.indexOf(antet);
  assert.notEqual(start, -1, `nu s-a gasit ${antet}`);

  let paranteze = 0, unghiuri = 0, prima = -1;
  for (let i = start + antet.length; i < sursa.length; i++) {
    const c = sursa[i];
    if (c === "(") paranteze++;
    else if (c === ")") paranteze--;
    else if (c === "<") unghiuri++;
    else if (c === ">") unghiuri--;
    else if (c === "{" && paranteze === 0 && unghiuri === 0) { prima = i; break; }
  }
  assert.notEqual(prima, -1, `nu s-a gasit corpul lui ${antet}`);
  let adancime = 0;
  for (let i = prima; i < sursa.length; i++) {
    if (sursa[i] === "{") adancime++;
    else if (sursa[i] === "}") {
      adancime--;
      if (adancime === 0) return sursa.slice(prima, i + 1);
    }
  }
  assert.fail(`acoladele nu se inchid pentru ${antet}`);
}
