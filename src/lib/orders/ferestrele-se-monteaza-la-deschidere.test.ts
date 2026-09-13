import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   O FEREASTRA MONTATA PERMANENT TRIMITE ADRESA DE IERI      (13.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE SE INTAMPLA. Ferestrele de AWB sunt randate in pagina comenzii cand curierul e
   activ, nu cand sunt deschise: `open` e doar un prop, iar componenta se inchidea cu
   `return null` INAUNTRU. Deci ramanea montata, si `useState(order....)` rula O SINGURA
   DATA, la incarcarea paginii.

   Comerciantul corecta adresa gresita a unui client din „Editeaza comanda", pagina se
   reimprospata (`router.refresh()` NU demonteaza o componenta de client), panoul ii spunea
   „poti genera acum AWB-ul cu datele noi", si fereastra trimitea mai departe ADRESA VECHE.
   Un colet fizic, cu ramburs, plecat la destinatia gresita, fara ca nimic sa para stricat.

   ⚠ LEACUL NU E UN EFECT. Un `useEffect` care resincronizeaza starea din propuri e chiar
   ce interzice `react-hooks/set-state-in-effect`, si pe buna dreptate: starea derivata
   dintr-o proprietate nu se sincronizeaza, se DERIVA. Fereastra FAN incercase varianta cu
   „amprenta destinatarului", comparata la fiecare randare; functiona, dar avea gaura ei
   (amprenta se consuma neconditionat, iar rescrierea campurilor statea sub `if (!hasAwb)`,
   deci pe o comanda cu AWB emis amprenta se pierdea fara ca vreun camp sa se miste).

   Leacul e MONTAREA LA DESCHIDERE: un invelis subtire care intoarce `null` cat timp e
   inchis, si un `Formular` care tine toata starea. Asa initializatorii `useState` ruleaza
   din nou de fiecare data, si nu mai e nevoie de niciun efect.

   ⚠ MASURAT LA SCRIEREA PROBEI: 18 ferestre, 17 cu prop `open`, toate cu invelis. Cele
   sase din urma (Cargus, Colete, DPD, FAN, Sameday, Woot) au fost migrate pe 13.09.2026;
   celelalte unsprezece il aveau de dinainte. Scoaterea celor patru efecte de resincronizare
   a scazut si erorile de lint din depozit, de la 87 la 83.
*/

const DIR = "src/components/dashboard";

/**
 * Ferestrele care NU au prop `open`, si de ce. Lista e scurta dinadins.
 *
 * ⚠ Scutirea nu inseamna „e in regula oricum": inseamna ca montarea conditionata se face
 * de catre PARINTE, deci regula e implinita in alta parte. Daca vreuna primeste prop
 * `open`, iese din lista si intra sub regula generala.
 */
const FARA_PROP_OPEN: Record<string, string> = {
  "EmagAwbModal.tsx":
    "n-are prop `open`: o monteaza `EmagFulfillmentPanel` doar cat timp e deschisa, iar "
    + "starea ei de pornire (`useState(true)` pe incarcare) se bizuie chiar pe montarea "
    + "proaspata. Vezi nota din capul fisierului.",
};

function sursaCurata(nume: string): string {
  return readFileSync(`${DIR}/${nume}`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

test("⚠ fiecare fereastra de AWB se monteaza la DESCHIDERE, nu odata cu pagina", () => {
  const ferestre = readdirSync(DIR).filter((f) => /AwbModal\.tsx$/.test(f));

  /*
   * ⚠ SE NUMARA. Fara randul asta, o redenumire sau un tipar care nu mai potriveste nimic
   * ar fi facut proba sa treaca peste ZERO fisiere si sa iasa verde: „proba care nu poate
   * cadea". Masurat pe 13.09.2026: 18 ferestre.
   */
  assert.ok(ferestre.length >= 18, `gasite doar ${ferestre.length} ferestre de AWB: plasa n-are pe cine cadea`);

  const faraInvelis: string[] = [];
  const cuGardaVeche: string[] = [];

  for (const nume of ferestre) {
    const sursa = sursaCurata(nume);

    if (FARA_PROP_OPEN[nume]) {
      /* ⚠ Si scutirea se verifica PE DOS: daca a primit intre timp prop `open`, motivul
         scutirii nu mai e adevarat si trebuie scoasa din lista. */
      assert.doesNotMatch(
        sursa, /\bopen\s*:\s*boolean/,
        `${nume} e in FARA_PROP_OPEN, dar acum are prop \`open\`: scoate-l din lista`,
      );
      continue;
    }

    if (!/if \(!props\.open\) return null;/.test(sursa)) faraInvelis.push(nume);
    /* Garda VECHE, inauntrul componentei: inseamna ca fereastra ramane montata. */
    if (/\n\s*if \(!open\) return null;/.test(sursa)) cuGardaVeche.push(nume);
  }

  assert.deepEqual(
    faraInvelis, [],
    "ferestrele astea n-au invelisul care monteaza la deschidere (`if (!props.open) return null;` "
    + "plus starea mutata intr-un `Formular`), deci vor trimite datele citite la incarcarea "
    + `paginii:\n${faraInvelis.join("\n")}`,
  );

  assert.deepEqual(
    cuGardaVeche, [],
    "ferestrele astea inca se inchid cu `if (!open) return null;` INAUNTRU, adica raman "
    + `montate si isi pastreaza starea veche:\n${cuGardaVeche.join("\n")}`,
  );
});

test("⚠ si nicio fereastra nu mai da hook-ului de greutate un `open` care nu mai exista", () => {
  /*
   * O migrare pe jumatate arata exact asa: invelisul pus, dar `useGreutateaAwb({ open, ... })`
   * lasat pe loc. In `Formular` nu mai exista niciun `open`, deci ori nu compileaza, ori
   * cineva l-a readus ca prop doar ca sa taca eroarea, si atunci fereastra e montata la loc.
   *
   * Toate cele 16 care cheama hook-ul ii dau acum `open: true`.
   */
  const ferestre = readdirSync(DIR).filter((f) => /AwbModal\.tsx$/.test(f));
  const gresite: string[] = [];
  let cate = 0;

  for (const nume of ferestre) {
    const sursa = sursaCurata(nume);
    if (!sursa.includes("useGreutateaAwb(")) continue;
    cate++;
    if (/useGreutateaAwb\(\{\s*open\s*[,}]/.test(sursa)) gresite.push(nume);
  }

  assert.ok(cate >= 15, `doar ${cate} ferestre cheama \`useGreutateaAwb\`: plasa n-are pe cine cadea`);
  assert.deepEqual(
    gresite, [],
    `ferestrele astea ii dau hook-ului de greutate un \`open\` variabil, nu \`open: true\`:\n${gresite.join("\n")}`,
  );
});
