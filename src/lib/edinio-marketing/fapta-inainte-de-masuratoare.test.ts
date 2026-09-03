import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { faraComentarii } from "./fara-comentarii";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  UN EVENIMENT SE TRIMITE DUPA CE FAPTA S-A INTAMPLAT, NU INAINTE
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE E O REGULA, si nu patru reparatii. In trei zile am gasit acelasi defect
  in patru locuri deosebite, si de fiecare data l-am tratat ca pe un caz:

    - `add_payment_info` pleca la PREDAREA catre Stripe, iar numele lui spune „si-a
      trimis datele de plata";
    - `begin_checkout` pleca la deschiderea paginii de planuri, inainte de orice
      alegere;
    - `begin_checkout` de campanie pleca INAINTEA cererii care naste sesiunea, deci
      si cand ruta cadea;
    - `article_share` pleaca inaintea scrierii in clipboard si inaintea foii native
      de partajare — deci se numara si refuzul, si renuntarea.

  Toate patru au aceeasi forma: masuram INTENTIA si o raportam ca FAPTA. Si toate
  gresesc in aceeasi directie — in plus, niciodata in minus. Un numar umflat nu
  cade nicaieri; se citeste ca succes.

  ⚠ CE PROBEAZA RANDURILE ASTEA. Nu regula in general — asta nu se poate scana. Ci
  locurile in care fapta e OBSERVABILA in acelasi fisier: unde exista un `await` de
  care fapta atarna, masuratoarea trebuie sa vina dupa el.
*/

/** Corpul functiei numite, taiat pe acolade. */
function corpul(cod: string, nume: string): string {
  const i = cod.indexOf(`function ${nume}(`);
  assert.ok(i > 0, `nu mai gasesc functia \`${nume}\``);
  let adanc = 0;
  for (let j = cod.indexOf("{", i); j < cod.length; j++) {
    if (cod[j] === "{") adanc++;
    else if (cod[j] === "}") {
      adanc--;
      if (adanc === 0) return cod.slice(i, j + 1);
    }
  }
  return cod.slice(i);
}

test("⚠ `article_share` se masoara DUPA ce partajarea a reusit", () => {
  /*
    ⚠ CE APARA, si nu e o margine inchipuita. Chiar fisierul are `setEsuat(true)` pe
    ramura de esec a clipboard-ului, fiindca operatia cere context sigur si, la
    unele browsere, un drept pe care omul nu l-a dat. Iar `navigator.share` respinge
    cand omul INCHIDE foaia de partajare — adica exact cand n-a partajat.

    Masurat inainte, fiecare refuz si fiecare renuntare se numarau ca partajare.
  */
  const cod = faraComentarii(readFileSync("src/components/website/blog/PartajeazaArticol.tsx", "utf8"));

  const laCopiere = corpul(cod, "copiaza");
  const iScriere = laCopiere.indexOf("clipboard.writeText");
  const iMasura = laCopiere.indexOf('masoara("link")');
  assert.ok(iScriere > 0 && iMasura > 0, "nu mai gasesc nici scrierea, nici masuratoarea");
  assert.ok(
    iMasura > iScriere,
    "`article_share` se masoara inaintea scrierii in clipboard — se numara si refuzurile",
  );

  const laNativ = corpul(cod, "partajeazaNativ");
  const iShare = laNativ.indexOf("navigator.share");
  const iMasura2 = laNativ.indexOf('masoara("nativ")');
  assert.ok(iShare > 0 && iMasura2 > 0, "nu mai gasesc nici partajarea nativa, nici masuratoarea");
  assert.ok(
    iMasura2 > iShare,
    "`article_share` se masoara inaintea foii native — se numara si cine o inchide",
  );

  /*
    ⚠ SI CA MASURATOAREA A RAMAS IN RAMURA DE IZBANDA, nu s-a mutat dupa `try`.
    Pusa dupa blocul intreg, ar pleca si pe ramura de esec — adica defectul reparat,
    intors pe alta usa.
  */
  const iCatch = laCopiere.indexOf("} catch");
  assert.ok(iCatch > 0 && iMasura < iCatch,
    "masuratoarea a iesit din ramura de izbanda — pleaca si cand copierea cade");
});

test("⚠ randul de factura nu mai AFIRMA moneda, o intreaba", () => {
  /*
    ⚠ CE APARA, si e a patra oara cand aceeasi lectie se muta dintr-un loc in altul.

    `amount` vine din `invoice.amount_paid`, adica din subunitatile monedei in care
    a incasat CHIAR Stripe. Langa el statea `currency: "RON"` scris literal. Daca
    cele doua se despart, randul din baza spune „RON" peste bani care nu sunt lei —
    si de pe randul acela se emite factura FISCALA.

    ⚠ SI DE CE TOCMAI ACUM. Pe 03.09.2026 s-a scos turnarea `session.currency ?? "ron"`
    din conversia din acelasi fisier. Aceeasi afirmatie a ramas doua sute de randuri
    mai sus, pe bani care ajung pe hartie. „Nota buna nu trece singura la urmatoarea
    integrare."

    ⚠ SE CAUTA IN COD, NU IN COMENTARII: notele de mai sus citeaza chiar forma
    interzisa, ca s-o explice.
  */
  const cod = faraComentarii(readFileSync("src/app/api/stripe/webhook/route.ts", "utf8"));

  assert.match(cod, /monedaDeIncredere\(invoice\.currency\)/,
    "moneda facturii nu se mai intreaba de la Stripe");

  const iInsert = cod.indexOf("from(\"invoices\").insert(");
  assert.ok(iInsert > 0, "nu mai gasesc scrierea randului de factura");
  const scrierea = cod.slice(iInsert, cod.indexOf("});", iInsert) + 3);
  assert.ok(!/currency:\s*"RON"/.test(scrierea),
    "randul de factura afirma iar `RON` fara sa intrebe Stripe");
  assert.match(scrierea, /currency: monedaFacturii/, "moneda scrisa nu mai vine din regula comuna");

  /* ⚠ Si ca o moneda necunoscuta OPRESTE emiterea, nu doar se plange. */
  const iPaza = cod.indexOf("if (!monedaFacturii)");
  assert.ok(iPaza > 0 && iPaza < iInsert, "paza monedei nu mai vine inaintea scrierii");
  assert.match(cod.slice(iPaza, iInsert), /return;/,
    "o moneda necunoscuta nu mai opreste emiterea facturii — se scrie oricum un rand");
});
