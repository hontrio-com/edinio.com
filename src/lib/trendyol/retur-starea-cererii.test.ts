import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { asteaptaHotarare, stareaCererii, STARI_DE_HOTARAT } from "./retur-forma";
import type { TrendyolClaim } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   EI NU TRIMIT NICIUN STATUS LA NIVEL DE CERERE (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Se scria `claim_status: c.status ?? null`, iar `status` era un camp pe care nu-l verificase
   nimeni. VERIFICAT in raspunsul-exemplu din `reference/getclaims`: campurile de nivel intai ale
   unei cereri sunt

       id · claimId · orderNumber · orderDate · customerFirstName · customerLastName · claimDate
       cargoTrackingNumber · cargoTrackingLink · cargoSenderNumber · cargoProviderName
       orderShipmentPackageId · replacementOutboundpackageinfo · rejectedpackageinfo · items
       lastModifiedDate · orderOutboundPackageId

   `status` NU e printre ele. Starea sta la `items[].claimItems[].claimItemStatus.name` — de-aia
   si parametrul lor de cautare se numeste `claimItemStatus`.

   ⚠ CE COSTA: `claim_status` iesea NULL la FIECARE cerere, iar panoul cerea
   `in("claim_status", [...])`, care nu potriveste niciodata un NULL. Lista „Așteaptă răspunsul
   tău" ar fi fost GOALA oricat de multe retururi ar fi avut comerciantul — fara eroare, fara
   jurnal, doar un ecran linistit. Retururile lui expirau netratate.

   ⚠ PROBA ASTA CHEAMA FUNCTIA, nu scaneaza sursa. Tocmai o proba care scana sursa a lasat
   defectul sa treaca: confirma ca scrie `c.status`, nu ca `c.status` are ce citi.
*/

/** Tiparul lor, cu invelisul `items[] -> claimItems[]` din referinta. */
const cerere = (...stari: string[]): TrendyolClaim => ({
  id: "f9da2317-876b-4b86-b8f7-0535c3b65731",
  orderNumber: "1234567890",
  items: [{
    orderLine: { id: 1, productName: "Ceva", barcode: "BC1" },
    claimItems: stari.map((s, i) => ({
      id: `linie-${i}`,
      claimItemStatus: { name: s },
    })),
  }] as never,
});

test("⚠ starea vine din LINII, fiindca acolo o trimit ei", () => {
  assert.equal(stareaCererii(cerere("Created")), "Created");
  assert.equal(stareaCererii(cerere("WaitingInAction")), "WaitingInAction");
  assert.equal(stareaCererii(cerere("Accepted")), "Accepted");
});

test("⚠ un `status` de nivel intai NU se citeste, fiindca ei nu-l trimit", () => {
  /*
   * Daca vreodata ar aparea, tot liniile sunt adevarul: parametrul lor de cautare e
   * `claimItemStatus`, iar ghidul spune ca rezultatul unei respingeri se urmareste pe el.
   */
  const c = { ...cerere("Created"), status: "Accepted" } as TrendyolClaim;
  assert.equal(stareaCererii(c), "Created", "linia bate un camp inventat de nivel intai");
});

test("⚠ un retur PARTIAL trage toata cererea in „de hotarat”", () => {
  /*
   * Ordinea e o hotarare, nu o socoteala: ce conteaza pentru comerciant e daca MAI ARE CEVA DE
   * FACUT. O singura linie care asteapta trage toata cererea.
   */
  assert.equal(stareaCererii(cerere("Accepted", "WaitingInAction")), "WaitingInAction");
  assert.equal(stareaCererii(cerere("Rejected", "Created")), "Created");
  assert.equal(stareaCererii(cerere("Cancelled", "Accepted", "Created")), "Created");
});

test("⚠ fara nicio linie de hotarat, se ia o stare inca vie", () => {
  /* `Rejected` nu e incheiata: dupa o respingere ei pot crea un colet catre client, iar
     `rejectedPackageInfo` apare abia atunci. */
  assert.equal(stareaCererii(cerere("Accepted", "Rejected")), "Rejected");
  assert.equal(stareaCererii(cerere("Accepted", "InAnalysis")), "InAnalysis");
  /* ⚠ Si un status pe care documentatia lor internationala nu-l explica deloc. */
  assert.equal(stareaCererii(cerere("Accepted", "WaitingFraudCheck")), "WaitingFraudCheck");
});

test("⚠ toate incheiate inseamna incheiata", () => {
  assert.equal(stareaCererii(cerere("Accepted", "Accepted")), "Accepted");
  assert.equal(stareaCererii(cerere("Cancelled")), "Cancelled");
});

test("⚠ fara linii citibile NU se ghiceste", () => {
  /* `null` inseamna „nu stim", iar reconcilierea il trateaza anume ca pe o cerere de
     reintrebat — vezi `STARI_INCHEIATE` si paza `claim_status.is.null`. */
  assert.equal(stareaCererii({ id: "x" } as TrendyolClaim), null);
  assert.equal(stareaCererii(cerere()), null);
});

test("⚠ `InAnalysis` NU e „așteaptă răspunsul tău”: acolo se uita EI", () => {
  /* Aratata asa, comerciantul ar fi trimis sa caute un buton care nu exista. */
  assert.equal(asteaptaHotarare("InAnalysis"), false);
  assert.equal(asteaptaHotarare("Created"), true);
  assert.equal(asteaptaHotarare("WaitingInAction"), true);
  assert.equal(asteaptaHotarare(null), false);
  assert.deepEqual([...STARI_DE_HOTARAT].sort(), ["Created", "WaitingInAction"]);
});

test("⚠ si nimeni nu mai scrie `c.status` in baza", () => {
  const mod = readFileSync("src/lib/trendyol/retururi.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(mod, /claim_status: stareaCererii\(c\)/);
  assert.doesNotMatch(mod, /claim_status: c\.status/);

  /* ⚠ Si panoul filtreaza pe lista adevarata, nu pe una scrisa de mana. */
  const act = readFileSync("src/lib/actions/trendyol-retururi.actions.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(act, /"Created", "WaitingInAction", "InAnalysis"/);
});

test("⚠ si un status pe care NU-L STIM se arata, nu se ascunde", () => {
  /*
   * ═══ ⚠ ACEEASI CAPCANA, IN ALTA HAINA ═══
   *
   * `in(...)` nu potriveste un NULL. `claim_status` se aduna acum din liniile lor — iar daca
   * vreodata n-am putea citi starea unei linii (o forma noua a lui `claimItemStatus`, un raspuns
   * pe care nu l-am mai vazut), cererea ar iesi cu `null` si ar DISPAREA din lista. Adica exact
   * defectul de azi, reintors pe alt drum.
   *
   * ⚠ DIRECTIA SIGURA E INVERSA: mai bine aratat un retur la care omul n-are ce face, decat
   * ascuns unul care cere o apasare si expira netratat.
   *
   * ⚠ MASURAT pe sase cazuri, in tranzactie anulata pe schema adevarata:
   *     forma veche  ->  InAnalysis, WaitingInAction, Created      (GOLUL LIPSESTE)
   *     forma noua   ->  WaitingInAction, Created, GOL             (si fara InAnalysis)
   */
  const act = readFileSync("src/lib/actions/trendyol-retururi.actions.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(act, /claim_status\.is\.null,claim_status\.in\.\(\$\{STARI_DE_HOTARAT\.join\(","\)\}\)/);
  assert.doesNotMatch(act, /q\.in\("claim_status"/, "un `in` simplu ar pierde golul");
});
