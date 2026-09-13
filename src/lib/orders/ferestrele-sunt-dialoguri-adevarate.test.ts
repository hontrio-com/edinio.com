import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   O CUTIE CARE ARATA A DIALOG NU E UN DIALOG               (13.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE S-A INCHIS. Toate ferestrele de AWB erau `<div>`-uri scrise de mana: un
   `fixed inset-0` cu un fundal si o cutie. Pentru ochi, un dialog. Pentru tastatura
   si pentru cititorul de ecran, nimic: fara `role="dialog"` nu se anunta nimic si se
   citea mai departe pagina de dedesubt, Escape nu inchidea, iar Tab plimba focusul
   prin butoanele ascunse sub fundal in loc sa ramana in formular. Cine genereaza un
   AWB fara mouse nu putea completa fereastra deloc.

   Leacul e `useDialogAccesibil`, un hook singur care le da pe toate patru. Hook, si nu
   o reparatie scrisa de fiecare data, pentru acelasi motiv pentru care `poarta-awb.ts`
   e o poarta singura: aceeasi regula scrisa de optsprezece ori se dezbina la a
   nouasprezecea, iar cine scrie fereastra noua copiaza fisierul de langa.

   ⚠ MASURAT LA SCRIEREA PROBEI: 18 ferestre de AWB, toate legate. Inainte erau DOUA
   (FAN si fereastra de ridicare), asa cum scrie si in capul hook-ului.

   ⚠ MUTANTUL SE PUNE PE APELANT. Mutand `ref={cutiaDialogului}` pe fundal, scotand
   `role="dialog"` dintr-o fereastra, taind chemarea hook-ului, sau readucand un
   ascultator propriu de Escape, probele de mai jos cad. Nu se probeaza hook-ul, ci
   faptul ca fiecare fereastra chiar il foloseste, si il foloseste pe elementul BUN.
*/

const DIR = "src/components/dashboard";

/**
 * ⚠ Comentariile se taie. Fara asta, o fereastra care doar POMENESTE `role="dialog"`
 * intr-o nota ar trece drept reparata, si chiar comentariul pe care l-am pus deasupra
 * fiecarei chemari vorbeste despre hook fara sa-l cheme.
 */
function sursa(nume: string): string {
  return readFileSync(`${DIR}/${nume}`, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

function ferestreleDeAwb(): string[] {
  return readdirSync(DIR).filter((f) => /AwbModal\.tsx$/.test(f));
}

/**
 * Eticheta de deschidere a fiecarui `<div>`, cu tot cu atributele lui.
 *
 * ⚠ `[^>]` inghite si randurile noi, deci eticheta scrisa pe sase randuri se aduna la
 * loc intr-un singur sir. Se bizuie pe faptul ca niciun atribut din ferestrele astea
 * nu contine `>`; daca vreodata va contine, potrivirea se opreste devreme si proba va
 * cadea spunand ca lipseste un atribut, nu va trece tacut.
 */
function eticheteDiv(s: string): string[] {
  return s.match(/<div[^>]*>/g) ?? [];
}

test("⚠⚠ fiecare fereastra de AWB e un dialog adevarat, nu doar o cutie care seamana", () => {
  const ferestre = ferestreleDeAwb();

  /*
   * ⚠ SE NUMARA. Fara randul asta, o redenumire a fisierelor ar face proba sa treaca
   * peste ZERO ferestre si sa iasa verde. Vezi memoria `o-plasa-care-cere-macar-una-nu-cade`.
   */
  assert.ok(ferestre.length >= 18,
    `gasite doar ${ferestre.length} ferestre de AWB: plasa n-are pe cine cadea`);

  const lipsuri: string[] = [];

  for (const nume of ferestre) {
    const s = sursa(nume);
    const are: string[] = [];

    if (!/const cutiaDialogului = useDialogAccesibil\(true, onClose\);/.test(s)) {
      /*
       * ⚠ `true`, nu un prop. Toate ferestrele astea se monteaza la deschidere (vezi
       * `ferestrele-se-monteaza-la-deschidere`), deci cat exista, sunt deschise. Un
       * `open` variabil aici ar insemna ca invelisul s-a pierdut pe drum.
       */
      are.push("nu cheama `useDialogAccesibil(true, onClose)`");
    }
    if (!/role="dialog"/.test(s)) are.push('fara `role="dialog"`');
    if (!/aria-modal="true"/.test(s)) are.push('fara `aria-modal="true"`');
    if (!/tabIndex=\{-1\}/.test(s)) are.push("fara `tabIndex={-1}` pe cutie");
    if (!/ref=\{cutiaDialogului\}/.test(s)) are.push("hook-ul e chemat, dar ref-ul nu e pus nicaieri");

    if (are.length > 0) lipsuri.push(`${nume}: ${are.join(", ")}`);
  }

  assert.deepEqual(lipsuri, [],
    "ferestrele astea arata a dialog dar nu sunt unul, deci nu se pot folosi de la "
    + `tastatura si cititorul de ecran nu le anunta:\n${lipsuri.join("\n")}`);
});

test("⚠⚠ ref-ul, rolul si numele stau pe ACEEASI cutie, si cutia are un nume adevarat", () => {
  /*
   * ⚠ AFIRMATIA CARE APARA CEL MAI MULT, SI SINGURA CARE NU SE VEDE CITIND FISIERUL.
   *
   * Fiecare fereastra are cel putin doua `<div>`-uri care se suprapun: fundalul si cutia.
   * Daca `ref={cutiaDialogului}` ajunge pe fundal (usor de facut, sunt vecine), totul
   * compileaza, totul arata la fel, `role="dialog"` e in fisier deci proba de mai sus
   * trece, si capcana de focus se inchide peste un element GOL: `querySelectorAll` pe
   * fundal nu gaseste niciun focusabil, hook-ul iese devreme, si Tab pleaca inapoi in
   * pagina de dedesubt. Exact defectul pe care il repara, doar ca tacut.
   *
   * Deci se verifica PE ETICHETA, nu pe fisier: eticheta care poarta ref-ul trebuie sa
   * poarte si rolul, si `aria-modal`, si `tabIndex`, si numele.
   */
  const ferestre = ferestreleDeAwb();
  const gresite: string[] = [];

  for (const nume of ferestre) {
    const s = sursa(nume);
    const cuRef = eticheteDiv(s).filter((t) => t.includes("ref={cutiaDialogului}"));

    if (cuRef.length !== 1) {
      gresite.push(`${nume}: ref-ul dialogului e pus pe ${cuRef.length} etichete, nu pe exact una`);
      continue;
    }

    const cutia = cuRef[0];
    const lipsa: string[] = [];
    if (!cutia.includes('role="dialog"')) lipsa.push('`role="dialog"` e pe ALT element');
    if (!cutia.includes('aria-modal="true"')) lipsa.push("`aria-modal` e pe ALT element");
    if (!cutia.includes("tabIndex={-1}")) lipsa.push("`tabIndex={-1}` e pe ALT element");

    /*
     * ⚠ NUMELE, IN AMANDOUA FORMELE LEGITIME. Saptesprezece ferestre poarta `aria-label`
     * scris pe loc; FAN poarta `aria-labelledby`, fiindca a fost legata inaintea celorlalte
     * si isi are titlul intr-un element cu `id`. Amandoua dau un nume; ce nu da un nume e
     * o cutie fara niciuna, si atunci cititorul de ecran anunta doar „dialog".
     */
    const label = /aria-label="([^"]+)"/.exec(cutia);
    const labelledby = /aria-labelledby="([^"]+)"/.exec(cutia);

    if (!label && !labelledby) {
      lipsa.push("cutia n-are nume: cititorul de ecran anunta un dialog fara sa spuna care");
    }
    if (labelledby) {
      /*
       * ⚠ Si tinta chiar exista. Un `aria-labelledby` care arata spre un `id` inexistent
       * e mai rau decat lipsa lui: numele calculat iese GOL, si nimic nu pare stricat.
       */
      const tinta = labelledby[1];
      if (!new RegExp(`id="${tinta}"`).test(s)) {
        lipsa.push(`\`aria-labelledby\` arata spre \`${tinta}\`, care nu exista in fisier`);
      }
    }

    if (lipsa.length > 0) gresite.push(`${nume}: ${lipsa.join("; ")}`);
  }

  assert.deepEqual(gresite, [],
    "la ferestrele astea dialogul e declarat pe un element si focusul e prins pe altul, "
    + `deci Tab iese din fereastra fara ca nimic sa para stricat:\n${gresite.join("\n")}`);
});

test("⚠ si nicio fereastra nu-si mai tine propriul Escape, peste cel al hook-ului", () => {
  /*
   * ⚠ Woot avea unul scris de mana. Lasat pe loc langa hook, o singura apasare ar fi
   * chemat `onClose()` de DOUA ori. La el nu se vedea, fiindca inchiderea e idempotenta,
   * dar urmatoarea fereastra care face si altceva la inchidere (o confirmare, o
   * reimprospatare, un AWB anulat) ar fi facut-o de doua ori.
   *
   * ⚠ Ce a RAMAS la Woot e blocarea derularii paginii de dedesubt, pe care hook-ul n-o
   * face. Stearsa odata cu Escape, pagina ar fi inceput sa se deruleze sub fereastra.
   */
  const ferestre = ferestreleDeAwb();
  const cuEscapePropriu = ferestre.filter((nume) => /e\.key === "Escape"/.test(sursa(nume)));

  assert.deepEqual(cuEscapePropriu, [],
    "ferestrele astea si-au adus inapoi ascultatorul lor de Escape, peste cel al "
    + `hook-ului: o apasare ar chema inchiderea de doua ori:\n${cuEscapePropriu.join("\n")}`);
});
