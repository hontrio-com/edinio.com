import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { punctulFataDeAdresa } from "@/lib/shipping/punctul-si-localitatea";

/* ══════════════════════════════════════════════════════════════════════════
   PUNCTUL ALES FATA DE ADRESA COTATA                            (15.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   Fisa punctului se semneaza pe `{magazin, curier, retea}`, fara localitate, iar `getLockers`
   intoarce lista intreaga cand nu i se cere un oras. Deci se poate cota pentru Bucuresti si plasa
   cu tokenul unui easybox din Cluj: la emitere Sameday si DPD inlocuiesc destinatarul, coletul
   pleaca la Cluj pe tariful Bucurestiului, si diferenta o plateste comerciantul.

   ⚠ REGULA ASTA NU REFUZA NIMIC, si e o hotarare: leacul evident („judetul punctului = judetul
   cotat") ar respinge un caz cinstit si des, iar cel corect se face pe ZONA de livrare, adica o
   regula de PRET. Expunerea masurata: sase comenzi prin selectorul nostru in toata viata
   platformei. Intai se masoara daca se intampla.

   ⚠ SI CEA MAI IMPORTANTA PARTE E CE NU APRINDE. Fara pliul capitalei, jurnalul s-ar fi aprins pe
   TOATE comenzile din Bucuresti (adresa spune „Sector 3", punctul spune „Bucuresti") si n-ar fi
   masurat nimic. Un semnal care se aprinde mereu nu e semnal, e zgomot care ascunde cazul cautat.
*/

/* ── ⚠ Ce NU se aprinde ───────────────────────────────────────────────────── */

test("⚠⚠ capitala: „Sector 3” si „Bucuresti” sunt acelasi loc, deci TACE", () => {
  /* Checkoutul nostru scrie „Sector 3" de la reparatia din 15.08.2026, iar nomenclatoarele celor
     mai multi curieri numesc punctul „Bucuresti". Aprins aici, jurnalul ar fi numarat toata
     capitala drept abuz. */
  assert.equal(
    punctulFataDeAdresa(
      { city: "Bucuresti", county: "Bucuresti" },
      { city: "Sector 3", county: "Municipiul Bucuresti" },
    ),
    null,
  );
  assert.equal(
    punctulFataDeAdresa(
      { city: "Sectorul 5", county: "Bucuresti" },
      { city: "Bucuresti", county: "București" },
    ),
    null,
  );
});

test("si nici diacriticele sau prefixul „Judetul” nu aprind nimic", () => {
  assert.equal(
    punctulFataDeAdresa(
      { city: "Cluj-Napoca", county: "Cluj" },
      { city: "Cluj-Napoca", county: "Judetul Cluj" },
    ),
    null,
  );
  assert.equal(
    punctulFataDeAdresa(
      { city: "Timisoara", county: "Timis" },
      { city: "Timișoara", county: "Timiș" },
    ),
    null,
  );
});

test("⚠ si ce nu se poate compara TACE, in loc sa para o nepotrivire", () => {
  /* Un camp lipsa nu e dovada de nimic, iar jurnalul se scrie de pe un capat public si anonim:
     fiecare rand in plus e un rand pe care il poate cere oricine. */
  assert.equal(punctulFataDeAdresa(null, { city: "Cluj-Napoca", county: "Cluj" }), null);
  assert.equal(punctulFataDeAdresa(undefined, { city: "Cluj-Napoca", county: "Cluj" }), null);
  assert.equal(punctulFataDeAdresa({ city: "Cluj-Napoca", county: "Cluj" }, null), null);
  assert.equal(punctulFataDeAdresa({ city: "", county: "" }, { city: "Cluj-Napoca", county: "Cluj" }), null);
  assert.equal(punctulFataDeAdresa({ city: "Cluj-Napoca" }, { county: "Cluj" }), null);
});

/* ── Ce se aprinde ────────────────────────────────────────────────────────── */

test("⚠⚠ CAZUL CARE COSTA: punct in alt JUDET decat adresa cotata", () => {
  /* Chiar scenariul: cotezi pentru Bucuresti, plasezi cu tokenul unui easybox din Cluj. */
  assert.equal(
    punctulFataDeAdresa(
      { city: "Cluj-Napoca", county: "Cluj" },
      { city: "Sector 3", county: "Municipiul Bucuresti" },
    ),
    "judet",
  );
  assert.equal(
    punctulFataDeAdresa({ city: "Iasi", county: "Iasi" }, { city: "Craiova", county: "Dolj" }),
    "judet",
  );
});

test("⚠ si cazul ieftin: alt oras in ACELASI judet", () => {
  /* De obicei aceeasi zona de pret, deci nu costa nimic; se numara separat tocmai ca sa se vada
     daca merita vreodata o poarta. */
  assert.equal(
    punctulFataDeAdresa({ city: "Turda", county: "Cluj" }, { city: "Cluj-Napoca", county: "Cluj" }),
    "localitate",
  );
});

test("⚠ judetul e citit INAINTEA localitatii, fiindca el e cel care costa", () => {
  /* Doua orase cu acelasi nume in judete diferite: „Ocna Mures" (Alba) fata de un omonim. Daca
     localitatea s-ar citi prima, cazul scump ar fi raportat drept cel ieftin, sau deloc. */
  assert.equal(
    punctulFataDeAdresa({ city: "Albesti", county: "Mures" }, { city: "Albesti", county: "Botosani" }),
    "judet",
  );
});

test("⚠ fara judete de amandoua partile, localitatea inca poate vorbi", () => {
  assert.equal(
    punctulFataDeAdresa({ city: "Cluj-Napoca" }, { city: "Craiova" }),
    "localitate",
  );
});

/* ── ⚠ Si apelantii, fiindca regula singura nu masoara nimic ──────────────── */

const COMENZI = "src/lib/actions/order.actions.ts";
const sursa = () =>
  readFileSync(COMENZI, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

test("⚠⚠ AMANDOUA formularele masoara, si niciunul nu refuza", () => {
  /*
   * ⚠ DOUA COPII, ca peste tot pe drumul comenzii: `placeOrder` (formularul de produs) si
   * `placeCartOrder` (checkoutul cosului). Pus intr-unul singur, jurnalul ar fi masurat jumatate
   * din trafic si ar fi parut ca defectul e mai rar decat e.
   */
  const s = sursa();
  /*
   * ⚠ SE CERE FORMA INTREAGA A ATRIBUIRII, nu doar numele functiei, si asta a iesit din bancul de
   * mutanti: cu `const x = false && punctulFataDeAdresa(…)`, apelul RAMANE in fisier, numarul nu se
   * misca, si regula nu se mai executa niciodata. Aceeasi capcana ca `if (false)` de la DHL, unde
   * un mutant a scapat masurand prezenta unui sir in loc de drumul viu.
   */
  const apeluri = s.match(/const punctulEInAltaParte = punctulFataDeAdresa\(/g) ?? [];
  assert.equal(apeluri.length, 2, `regula se cheama in ${apeluri.length} locuri; trebuie in amandoua`);
  assert.doesNotMatch(
    s, /punctulEInAltaParte = (?:false|true|null|0) /,
    "semnalul punctului a primit o paza constanta: drumul poate fi mort fara ca nimic sa cada",
  );

  for (const actiune of ["placeOrder", "placeCartOrder"]) {
    assert.ok(
      s.includes(`action: "${actiune}.punctInAltaParte"`),
      `${actiune} nu mai scrie randul de jurnal pentru punctul din alta parte`,
    );
  }

  /*
   * ⚠ SI NU REFUZA. Randul de mai jos e chiar hotararea: un `return { error: … }` langa semnalul
   * asta ar transforma o masuratoare intr-o poarta care poate opri vanzari cinstite, inainte sa
   * stim daca defectul se intampla macar o data.
   */
  /*
   * ⚠ BLOCUL SE TAIE PE ACOLADE, NU PE LUNGIME. Prima scriere a probei lua o fereastra de 900 de
   * caractere dupa semnal si a cazut pe cod BUN: fereastra ajungea in blocul URMATOR, cel al
   * recotarii de ramburs, care chiar se incheie cu un `return { error: … }`. O felie de corp
   * imprumuta de la vecin, si atunci proba masoara altceva decat crede.
   */
  const blocuri = blocurile(s, "if (punctulEInAltaParte) {");
  assert.equal(blocuri.length, 2, `am gasit ${blocuri.length} blocuri de semnal, nu doua`);
  for (const bloc of blocuri) {
    assert.doesNotMatch(
      bloc, /return \{ error/,
      "semnalul punctului a devenit un refuz; aia cere intai o hotarare despre zonele de livrare",
    );
  }
});

/** Corpurile blocurilor care incep cu `inceput`, taiate pe acolade pereche. */
function blocurile(text: string, inceput: string): string[] {
  const gasite: string[] = [];
  let i = text.indexOf(inceput);
  while (i >= 0) {
    let adancime = 0;
    let j = i + inceput.length - 1;
    do {
      if (text[j] === "{") adancime++;
      else if (text[j] === "}") adancime--;
      j++;
    } while (adancime > 0 && j < text.length);
    gasite.push(text.slice(i, j));
    i = text.indexOf(inceput, j);
  }
  return gasite;
}
