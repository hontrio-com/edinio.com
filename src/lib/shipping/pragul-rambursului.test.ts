import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pragulRambursului } from "@/lib/shipping/optiuni-de-rezerva";

/* ══════════════════════════════════════════════════════════════════════════
   SUMA RAMBURSULUI NU COBOARA SUB CE SUSTINE CATALOGUL (14.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   `destination.cod` venea de la browser si intra DIRECT in cererea catre curier; din el iese
   comisionul de ramburs, deci el misca pretul care pleaca apoi SEMNAT.

   Cazul `cod: 0` era deja inchis de steagul semnat: cotatia se semneaza „platit”, iar la
   comanda regimul se ia din metoda de plata validata pe server, deci semnatura nu bate. Ce
   ramanea deschis era numit pe fata in `quote-token.ts`: `cod: 0.01` pastreaza steagul si
   scapa de partea PROCENTUALA a comisionului.

   Masurat pe 14.09.2026: 234 de comenzi cu ramburs, 17 magazine, 214 in ultimele 90 de zile.
   Suprafata unde suma chiar ajunge la un API de tarif: patru perechi magazin-curier.
*/

const COTARE = "src/lib/actions/shipping.actions.ts";
const fisier = (p: string) => readFileSync(p, "utf8");
const faraComentarii = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/* ── Regula ───────────────────────────────────────────────────────────────── */

test("⚠ fara ramburs se cere ZERO, oricat ar trimite browserul", () => {
  /* Altfel fiecare cotatie platita in avans ar fi cerut curierului comisionul de ramburs,
     adica un pret mai mare la toata lumea. */
  assert.equal(pragulRambursului(9999, 500, false), 0);
  assert.equal(pragulRambursului(0, 500, false), 0);
});

test("⚠ CUMPARATORUL CINSTIT NU E ATINS: se intoarce chiar numarul lui", () => {
  /*
   * ⚠ ASTA E JUMATATEA CARE FACE REPARATIA SIGURA, si de aceea e proba cea mai importanta
   * de aici: un `max` nu poate cobori niciodata suma ceruta, deci nicio comanda cinstita nu-si
   * schimba pretul. Masurat pe comenzi reale: niciuna din cele 234 de comenzi cu ramburs din
   * productie nu e atinsa.
   *
   * ⚠⚠ INDREPTAT PE 14.09.2026. Aici scria ca „formularul trimite TOTALUL comenzii (marfa plus
   * transport), iar `valoareMarfii` e doar marfa, deci pentru orice comanda reala totalul e mai
   * mare". E FALS, si neadevarata venea din comentariul lui `pragulRambursului`: amandoua
   * formularele trimit MARFA (`CheckoutForm.tsx:278` cu `total` din `useCart()`, care e
   * `CartProvider.tsx:356` = suma subtotalurilor de linie; `OrderModal.tsx:1335` cu `subtotal`).
   *
   * Deci cele doua marimi sunt ACEEASI marime, si pragul nu se vede fiindca sunt egale, nu
   * fiindca una ar fi mai mare. Afirmatiile de mai jos raman aceleasi si trec la fel; se
   * schimba numai temeiul lor, care era gresit.
   */
  assert.equal(pragulRambursului(518, 500, true), 518, "cerut peste cat sustine catalogul: al lui");
  assert.equal(pragulRambursului(500, 500, true), 500, "exact cat marfa: tot al lui");
  assert.equal(pragulRambursului(1200, 500, true), 1200, "mai mult decat sustine catalogul");
});

test("⚠ subdeclararea urca la cat sustine catalogul", () => {
  /* Chiar atacul ramas deschis: `cod: 0.01` pastra steagul si scapa de partea procentuala. */
  assert.equal(pragulRambursului(0.01, 500, true), 500);
  assert.equal(pragulRambursului(1, 500, true), 500);
});

test("⚠ pragul nu COBOARA niciodata suma ceruta", () => {
  /*
   * Regula intreaga intr-o singura propozitie. Pus IN LOCUL sumei, plafonul din catalog ar fi
   * coborat rambursul cotat sub cel real ori de cate ori transportul intra in el, si
   * diferenta de comision ar fi platit-o comerciantul.
   */
  for (const cerut of [0.01, 1, 17, 99.99, 500, 1200, 10_000]) {
    for (const marfa of [0, 50, 500, 9999]) {
      assert.ok(
        pragulRambursului(cerut, marfa, true) >= cerut,
        `pragul a coborat ${cerut} cu marfa ${marfa}`,
      );
    }
  }
});

test("⚠ o intrare care nu e numar nu produce NaN", () => {
  /*
   * `Number(undefined)` e `NaN`, iar `Math.max` cu un `NaN` intoarce `NaN`, care ar fi plecat
   * ca atare in cererea catre curier. Formularul chiar poate sa nu trimita campul.
   */
  assert.equal(pragulRambursului(undefined, 500, true), 500);
  assert.equal(pragulRambursului(null, 500, true), 500);
  assert.equal(pragulRambursului("abc", 500, true), 500);
  assert.equal(pragulRambursului({}, 500, true), 500);
  assert.equal(pragulRambursului(100, Number.NaN, true), 100, "si marfa nesocotita");
});

test("nu iese niciodata un numar negativ", () => {
  assert.equal(pragulRambursului(-50, -10, true), 0);
  assert.equal(pragulRambursului(-50, 500, true), 500);
});

/* ── Cusatura: cotarea chiar il foloseste, si nimeni nu-l ocoleste ────────── */

test("⚠ cotarea cheama pragul, cu marfa socotita de server", () => {
  const cod = faraComentarii(fisier(COTARE));
  assert.match(
    cod,
    /const rambursDeCotat = pragulRambursului\(destination\.cod, valoareMarfii, esteRamburs\);/,
    "pragul nu mai e chemat, sau nu cu marfa socotita de server",
  );
});

test("⚠⚠ NICIO RAMURA DE CURIER NU MAI CITESTE SUMA DIN BROWSER", () => {
  /*
   * ⚠ PROBA ASTA E CHIAR DEFECTUL, si se numara in loc sa se caute.
   *
   * Suma ajungea la OPT locuri: Sameday (de doua ori), Cargus, DPD, Innoship, SmartShip,
   * Shipo, FAN, plus brokerii Woot, Colete si eColet, care si-o luau singuri din obiectul
   * `destination` primit intreg. O proba care ar fi cerut doar „exista un apel la prag" ar fi
   * trecut verde cu sapte din ele inca deschise.
   *
   * Dupa reparatie `destination.cod` mai are voie sa apara EXACT de doua ori: o data ca sa se
   * afle regimul (`esteRamburs`), si o data ca argument al pragului. Orice a treia aparitie e
   * o ramura care ocoleste pragul.
   */
  const cod = faraComentarii(fisier(COTARE));
  const aparitii = cod.match(/destination\.cod\b/g) ?? [];
  assert.equal(
    aparitii.length, 2,
    `suma din browser se citeste in ${aparitii.length} locuri; are voie in exact doua`,
  );
  assert.match(cod, /const esteRamburs = \(Number\(destination\.cod\) \|\| 0\) > 0;/);
});

test("⚠ brokerii nu mai pot ajunge la suma: e scoasa din TIPUL lor", () => {
  /*
   * Woot, Colete si eColet primeau obiectul `destination` intreg si isi luau singuri `cod` din
   * el, deci un prag pus doar la apelant i-ar fi ocolit. Scoasa din tip, nu doar din apel,
   * `tsc` enumera apelantii si nimeni nu mai poate ajunge la ea pe furis. Acelasi tipar ca la
   * `weightKg`, scos din `getShippingOptions` din exact acelasi motiv.
   */
  const cod = fisier(COTARE);
  for (const fn of ["buildWootOptions", "buildColeteOptions", "buildEcoletOptions"]) {
    const i = cod.indexOf(`async function ${fn}(`);
    assert.ok(i > 0, `${fn} nu mai exista`);
    const semnatura = cod.slice(i, i + 700);
    const pana = semnatura.slice(0, semnatura.indexOf("): Promise<"));
    assert.doesNotMatch(pana, /cod\?: number/, `${fn} inca primeste suma in tip`);
    assert.match(pana, /rambursCotat: number/, `${fn} nu primeste pragul`);
  }
});

test("⚠ si fiecare apelant al brokerilor chiar ii da pragul", () => {
  const cod = faraComentarii(fisier(COTARE));
  for (const fn of ["buildWootOptions", "buildColeteOptions", "buildEcoletOptions"]) {
    assert.match(
      cod,
      new RegExp(`${fn}\\([^)]*, weight, rambursDeCotat,`),
      `${fn} e chemat fara prag`,
    );
  }
});

test("⚠ FAN isi ia si el suma din prag, nu din browser", () => {
  /*
   * FAN o tine sub numele `codAmount`, folosit in sase locuri si fixat de doua probe. Schimbata
   * doar SURSA, niciunul din ele nu se misca. Acolo pretul comuta pe un boolean, deci pragul nu
   * atinge pretul; ce devine mai adevarat e `fanRambursPestePlafon`, adica ce i se spune omului
   * despre plafonul de 10.000 de lei.
   */
  const cod = faraComentarii(fisier(COTARE));
  assert.match(cod, /const codAmount = rambursDeCotat;/);
});
