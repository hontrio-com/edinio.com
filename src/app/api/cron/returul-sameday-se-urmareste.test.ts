import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * COLETUL CARE SE INTOARCE E SI EL URMARIT                      (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Platforma stia de mult sa EMITA retururi Sameday, pe amandoua serviciile lor. Dar cronul se
 * uita numai la `sameday_awb_number`: un retur emis nu era intrebat NICIODATA, deci comerciantul
 * nu afla din Edinio ca marfa s-a intors la el.
 *
 * ⚠ Regulile aparate aici nu sunt „merge", ci „nu se strica pe dos". Fiecare a fost o capcana
 * adevarata la scriere, iar mutantul se pune pe COD, nu pe proba.
 */

const CALE = "src/app/api/cron/sameday-tracking/route.ts";
const SURSA = readFileSync(CALE, "utf8").replace(/\r\n/g, "\n");
const VIU = SURSA.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("⚠ fisierul chiar are o a doua coada, altfel afirmatiile de mai jos apara aer", () => {
  assert.ok(VIU.includes("sameday_return_awb_number"), "cronul trebuie sa citeasca retururile");
  assert.ok(VIU.includes("for (const r of retururi)"), "trebuie sa existe bucla retururilor");
});

test("⚠ coada returului NU se filtreaza pe statusul comenzii", () => {
  /*
   * Capcana cea mai usoara: copiezi filtrul fratelui de deasupra. Dar returul traieste taman pe
   * comenzile INCHEIATE (`delivered`, uneori `refunded`), iar cu acel filtru n-ar vedea NIMIC.
   * Proba cere ca intre citirea retururilor si `.limit` sa nu apara niciun `.in("status"`.
   */
  const start = VIU.indexOf('.not("sameday_return_awb_number", "is", null)');
  assert.notEqual(start, -1, "nu s-a gasit citirea retururilor");
  const capat = VIU.indexOf(".limit(MAX_RETURURI)", start);
  assert.notEqual(capat, -1, "citirea retururilor trebuie sa se incheie cu plafonul ei");
  const felie = VIU.slice(start, capat);
  assert.ok(
    !felie.includes('.in("status"'),
    "coada returului nu are voie sa fie ingustata la statusurile drumului dus",
  );
  assert.ok(
    felie.includes('.is("sameday_return_incheiat_la", null)'),
    "iesirea din coada se face pe marcajul de incheiere, nu pe statusul comenzii",
  );
});

test("⚠ returul NU muta comanda si NU emite factura", () => {
  /*
   * Pe drumul dus „livrat" inseamna incheiat cu bine. Pe drumul de intors inseamna EXACT PE DOS:
   * marfa a ajuns inapoi. Ce urmeaza e o hotarare de BANI, si aia nu se ia de la un transportator.
   */
  const start = VIU.indexOf("for (const r of retururi)");
  const felie = VIU.slice(start);
  assert.ok(
    !felie.includes("tranzitieComandaMarketplace"),
    "bucla returului nu are voie sa mute comanda",
  );
  assert.ok(
    !felie.includes("maybeAutoInvoice"),
    "bucla returului nu are voie sa emita factura",
  );
});

test("⚠ marcajul de incheiere pleaca ODATA cu starea, pe aceeasi conditie de identitate", () => {
  /*
   * Scris ca un `update` separat de dupa, ar fi putut ateriza pe returul NOU daca intre timp
   * comerciantul l-a detasat si a emis altul, scotandu-l din urmarire pentru totdeauna.
   */
  const start = VIU.indexOf('identitate: { coloana: "sameday_return_awb_number"');
  assert.notEqual(start, -1, "starea returului trebuie scrisa prin `scrieUrmarirea`, pe identitate");
  const capat = VIU.indexOf('actiune: "sameday-tracking-retur"', start);
  assert.notEqual(capat, -1);
  assert.ok(
    VIU.slice(start, capat).includes("sameday_return_incheiat_la: acumIso"),
    "marcajul de incheiere trebuie sa faca parte din `stare`, nu dintr-o scriere separata",
  );
});

test("⚠ semnalul catre om pleaca O SINGURA DATA", () => {
  /*
   * Fara marcaj de incheiere, randul de jurnal s-ar repeta la fiecare doua ore, la nesfarsit,
   * pentru fiecare retur ajuns: adica exact zgomotul care ineaca jurnalul.
   */
  const start = VIU.indexOf("for (const r of retururi)");
  const felie = VIU.slice(start);
  const iSemnal = felie.indexOf('action: "sameday-tracking-retur"');
  assert.notEqual(iSemnal, -1, "incheierea returului trebuie semnalata");
  const iPaza = felie.lastIndexOf("if (eStareFinala(stare)) {", iSemnal);
  assert.notEqual(iPaza, -1, "semnalul trebuie sa stea sub paza de stare finala");
});

test("⚠ configurarile si status-sync se impart intre cele doua cozi", () => {
  /* O a doua incarcare de configurari ar fi dublat cererile catre baza si catre ei degeaba. */
  assert.equal(
    (VIU.match(/from\("store_settings"\)/g) ?? []).length, 1,
    "configurarile se citesc o singura data, pentru amandoua cozile",
  );
  assert.ok(
    VIU.includes("...retururi.map((r) => r.business_id)"),
    "magazinele retururilor trebuie sa intre in aceeasi lista de configurari",
  );
});

test("⚠ o citire picata de retururi NU raporteaza zero de verificat", () => {
  /* Fara `error` destructurat, `retururiBrute` ar fi `null`, bucla n-ar rula, si cronul ar
     raspunde vesel `ok: true`. Aceeasi plasa ca la fratele de deasupra. */
  assert.ok(VIU.includes("if (eRetur) {"), "eroarea de citire a retururilor trebuie tratata");
  const start = VIU.indexOf("if (eRetur) {");
  const felie = VIU.slice(start, start + 400);
  assert.ok(felie.includes("status: 503"), "o citire picata iese cu 503, nu cu ok");
  assert.ok(felie.includes('severity: "critical"'), "si se striga in jurnal");
});
