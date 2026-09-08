import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { INTEGRARI, CATEGORII } from "./integrari-catalog";

/* ══════════════════════════════════════════════════════════════════════════
   CE MERGE AZI STA INAINTEA LUI „IN CURAND" (08.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE S-A INTAMPLAT. Pepita a fost livrata si a ramas in rubrica „Marketplace" sub Altex,
   Cel.ro si Okazii.ro — trei integrari care nu exista inca. Panoul isi randa lista in ordinea
   scrisa, deci comerciantul vedea trei „In curand" si abia dupa ele singura noutate care chiar
   se putea folosi.

   Nu e o chestiune de gust: un om care se uita peste o rubrica se opreste la primul „In curand"
   si presupune ca de acolo incolo urmeaza numai promisiuni. Munca livrata devine invizibila.

   ⚠ SI E A DOUA OARA. Aceeasi lectie e scrisa in memoria proiectului de la o integrare
   anterioara. Ce lipsea era o plasa, nu inca o notita.

   ⚠ DOUA LISTE, AMANDOUA VERIFICATE. Panoul comerciantului
   (`(dashboard)/dashboard/features/page.tsx`) si catalogul de pe site
   (`lib/website/integrari-catalog.ts`) sunt doua transcrieri ale aceluiasi lucru, si tocmai de
   aceea se desincronizeaza tacut. Site-ul isi sorteaza lista la randare (`ordonate`), panoul o
   sorteaza acum si el — dar SURSA trebuie sa spuna acelasi lucru ca ecranul, altfel urmatorul om
   care citeste fisierul crede ca ordinea de acolo e cea care se vede.
*/

const PANOU = "src/app/(dashboard)/dashboard/features/page.tsx";
const RAND_NOU = String.fromCharCode(10);

/** Rubricile panoului, in ordinea scrisa, cu ce e „In curand" si ce nu. */
function rubricilePanoului(): { rubrica: string; intrari: { nume: string; inCurand: boolean }[] }[] {
  const sursa = readFileSync(PANOU, "utf8");
  const i = sursa.indexOf("const SECTIONS");
  assert.notEqual(i, -1, "n-am gasit lista de rubrici din panou");

  const out: { rubrica: string; intrari: { nume: string; inCurand: boolean }[] }[] = [];
  for (const linie of sursa.slice(i).split(RAND_NOU)) {
    const eticheta = linie.match(/^\s*label: "([^"]+)"/);
    if (eticheta) { out.push({ rubrica: eticheta[1], intrari: [] }); continue; }
    const intrare = linie.match(/^\s*\{ name: "([^"]+)"/);
    if (intrare && out.length > 0) {
      out[out.length - 1].intrari.push({ nume: intrare[1], inCurand: linie.includes("soon: true") });
    }
  }
  return out;
}

/**
 * Prima intrare disponibila asezata DUPA una anuntata, sau `null`.
 *
 * ⚠ Se cauta prima abatere, nu se numara: mesajul trebuie sa spuna CINE a ramas in urma si sub
 * cine, altfel omul care vede proba rosie tot trebuie sa caute cu ochiul.
 */
function ramasaInUrma(intrari: { nume: string; inCurand: boolean }[]): string | null {
  let anuntata: string | null = null;
  for (const i of intrari) {
    if (i.inCurand) { anuntata ??= i.nume; continue; }
    if (anuntata) return `„${i.nume}" merge azi, dar e scrisa sub „${anuntata}", care e „În curând"`;
  }
  return null;
}

test("⚠ in panou, nicio integrare livrata nu sta sub una „In curand”", () => {
  const rubrici = rubricilePanoului();

  /* ⚠ Garda probei: un regex care nu mai potriveste nimic ar fi iesit verde peste orice ordine. */
  assert.ok(rubrici.length >= 5, `citite doar ${rubrici.length} rubrici din panou`);
  const total = rubrici.reduce((n, r) => n + r.intrari.length, 0);
  assert.ok(total >= 50, `citite doar ${total} integrari din panou: proba n-are pe cine cadea`);
  assert.ok(
    rubrici.some((r) => r.intrari.some((i) => i.inCurand)),
    "n-am recunoscut niciun „In curand”: `soon: true` s-a scris altfel?",
  );

  for (const r of rubrici) {
    const abatere = ramasaInUrma(r.intrari);
    assert.equal(abatere, null, `rubrica „${r.rubrica}”: ${abatere}`);
  }
});

test("⚠ si panoul CHIAR sorteaza la randare, nu se bizuie pe ordinea scrisa", () => {
  /*
   * Lista scrisa cum trebuie tine pana la prima integrare adaugata la coada. Sortarea la randare
   * e cea care nu se poate uita — proba de deasupra pazeste doar ca fisierul sa se citeasca la
   * fel cum arata ecranul.
   */
  const sursa = readFileSync(PANOU, "utf8");
  assert.match(sursa, /\.sort\(\(a, b\) => \(a\.soon \? 1 : 0\) - \(b\.soon \? 1 : 0\)\)/,
    "panoul si-a pierdut sortarea: ordinea depinde iar de cum e scrisa lista");
});

test("⚠ si in catalogul de pe site, pe fiecare rubrica", () => {
  for (const c of CATEGORII) {
    const ale = INTEGRARI.filter((i) => i.categorie === c.id)
      .map((i) => ({ nume: i.cheie, inCurand: i.stare === "in-curand" }));
    if (ale.length === 0) continue;
    const abatere = ramasaInUrma(ale);
    assert.equal(abatere, null, `rubrica „${c.id}”: ${abatere}`);
  }
  assert.ok(INTEGRARI.length >= 50, `catalogul are doar ${INTEGRARI.length} intrari`);
});

test("⚠ Pepita sta chiar dupa eMAG, cum s-a cerut", () => {
  /*
   * Proba de deasupra ar fi trecut si daca Pepita ajungea prima in rubrica. Aici se pastreaza
   * hotararea anume: marketplace-urile mari intai, iar Pepita imediat dupa eMAG.
   */
  const marketplace = INTEGRARI.filter((i) => i.categorie === "marketplace").map((i) => i.cheie);
  const iEmag = marketplace.indexOf("emag");
  const iPepita = marketplace.indexOf("pepita");
  assert.notEqual(iEmag, -1);
  assert.equal(iPepita, iEmag + 1, `Pepita a plecat de langa eMAG: ${marketplace.join(", ")}`);

  const panou = rubricilePanoului().find((r) => r.rubrica === "Marketplace");
  assert.ok(panou, "rubrica Marketplace n-a mai fost gasita in panou");
  const nume = panou.intrari.map((i) => i.nume);
  assert.equal(nume.indexOf("Pepita.com"), nume.indexOf("eMAG") + 1, nume.join(", "));
});
