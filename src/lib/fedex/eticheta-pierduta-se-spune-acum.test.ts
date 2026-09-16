import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * O ETICHETA PIERDUTA E PIERDUTA DEFINITIV, SI OMUL AFLA ACUM  (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * FedEx **nu are reimprimare de eticheta**. Documentatia lor spune sa retrimiti bufferul
 * ORIGINAL la imprimanta, iar `URL_ONLY` da un link care expira („12 hours" la campul de
 * cerere, „24 hours" la cel de raspuns, in ACELASI fisier). E singurul curier din cei
 * saptesprezece la care o pierdere de-a NOASTRA e definitiva.
 *
 * Doua drumuri lasau comanda fara eticheta si fara o vorba:
 *
 *  1. La emitere, `if (raspuns?.eticheta) { ... }` n-avea `else`. Cand raspunsul venea fara
 *     `encodedLabel`, sau cand registrul intorcea „deja" (si atunci `raspuns` e `null` prin
 *     constructie), eticheta nu se salva si nimeni nu spunea nimic.
 *  2. La recuperarea dupa un raspuns pierdut, expedierea se gaseste prin urmarire — care NU
 *     intoarce `encodedLabel`. Mesajul spunea doar „a fost scrisa pe comanda".
 *
 * ⚠ In amandoua cazurile AWB-ul EXISTA si comanda merge mai departe. Nu sunt erori. Sunt
 * ultima clipa in care omul mai poate tipari din portalul lor — si tocmai aia se pierdea.
 */

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const ACTIUNI = "src/lib/actions/fedex.actions.ts";
const MODAL = "src/components/dashboard/FedexAwbModal.tsx";

describe("FedEx: eticheta nesalvata se spune, nu se tace", () => {
  const s = viu(ACTIUNI);

  test("⚠⚠ ramura `else` exista, si pune un avertisment", () => {
    assert.match(s, /if \(raspuns\?\.eticheta\) \{[\s\S]{0,200}?\} else \{/, "`else`-ul lipseste iar");
    assert.match(s, /avertismente\.push\(/, "nu se mai adauga niciun avertisment");
    assert.match(s, /nu are `?reimprimare/i, "nu se mai spune de ce e definitiv");
    assert.match(s, /portalul FedEx/, "nu i se mai spune de unde o mai poate lua");
  });

  test("⚠ si AWB-ul tot se intoarce: nu e o eroare, e un avertisment", () => {
    /* Intors ca eroare, comanda ar fi ramas fara numar desi coletul exista — adica exact
       situatia pe care tot codul asta o evita. */
    assert.match(s, /return avertismente\.length > 0 \? \{ awb, avertismente \} : \{ awb \};/);
    assert.match(s, /awb: string; avertismente\?: string\[\]/, "forma raspunsului nu mai poarta avertismente");
  });

  test("⚠⚠ si avertismentul chiar AJUNGE la om, nu moare in actiune", () => {
    /*
     * Lectia zilei: o unealta scrisa anume si nechemata nu apara nimic. Daca modalul n-ar citi
     * `avertismente`, tot blocul de mai sus ar fi cod mort cu un comentariu frumos.
     */
    const m = viu(MODAL);
    assert.match(m, /r\.avertismente/, "modalul nu citeste avertismentele");
    assert.match(m, /toast\.warning\(/, "avertismentul nu se arata ca avertisment");
    /* Si LUNG: un toast inghitit in doua secunde e ca si cum n-am spus nimic. */
    const dur = /toast\.warning\(a, \{ duration: (\d+) \}\)/.exec(m);
    assert.ok(dur && Number(dur[1]) >= 20000, `avertismentul dispare prea repede: ${dur?.[1]}ms`);
  });

  test("⚠ recuperarea spune ca eticheta NU vine pe drumul acela", () => {
    /* Urmarirea nu intoarce `encodedLabel`, iar emiterea nu se mai repeta. Mesajul trebuie s-o
       spuna, altfel comerciantul crede ca are tot ce-i trebuie. */
    assert.match(s, /Eticheta NU se poate aduce pe drumul asta/);
    assert.match(s, /FedEx nu are reimprimare/);
  });
});
