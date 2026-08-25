import test from "node:test";
import assert from "node:assert/strict";


/* ── Fereastra facturilor se roteste (24.08.2026) ──────────────────────────── */

test("urcarea facturilor NU citeste mereu aceleasi randuri", async () => {
  /*
   * ═══ ZECE COMENZI NEFACTURATE BLOCAU URCAREA PENTRU TOATE CELE MAI NOI ═══
   *
   * Interogarea era `.order("created_at").limit(10)` — deterministica. Iar o comanda
   * fara factura emisa in Edinio intoarce `fara_factura`, care dinadins NU se marcheaza
   * (marcata, comanda ar iesi definitiv din filtru si n-ar mai primi factura niciodata).
   *
   * Deci aceleasi zece randuri se intorceau la fiecare trecere, si nicio comanda mai
   * noua nu era vazuta VREODATA. Se inchidea la a zecea si nu se mai deschidea singur.
   *
   * ⚠ Se probeaza pe sursa fiindca functia cere client Supabase si context eMAG, iar
   * regresia e chiar felul de schimbare pe care o face cineva „simplificand" inapoi la
   * `.limit()`.
   */
  const { readFileSync } = await import("node:fs");
  const sursa = readFileSync("src/app/api/cron/emag-sync/route.ts", "utf8");

  const i = sursa.indexOf("async function urcaFacturile(");
  assert.notEqual(i, -1, "n-am gasit urcarea facturilor");
  /* ⚠ `String.fromCharCode(10)`, nu un `
` scris in sursa: la generarea fisierului,
     secventa a devenit o linie noua adevarata si a rupt sirul. */
  const corp = sursa.slice(i, sursa.indexOf(String.fromCharCode(10) + "}", i));

  assert.ok(corp.includes(".range("), "fereastra trebuie sa se roteasca, nu sa fie taiata cu `limit`");
  assert.ok(
    !/\.limit\(FACTURI_PE_TRECERE\)/.test(corp),
    "`limit` pe o interogare ordonata da mereu aceleasi randuri",
  );
  assert.ok(corp.includes("count: \"exact\""), "fara marimea bazinului nu se poate roti");
});

test("lipsa facturii se vede pe ecran, nu doar in filtrul cronului", async () => {
  /* ⚠ `invoice_uploaded_at` era scris si citit EXCLUSIV de cron. eMAG cere factura dupa
     livrare; comerciantul ar fi aflat cand i-o cereau ei. */
  const { readFileSync } = await import("node:fs");
  const ecran = readFileSync("src/components/dashboard/EmagClient.tsx", "utf8");
  assert.ok(
    /\(status\.comenziFaraFactura \?\? 0\) > 0/.test(ecran),
    "ecranul nu spune niciodata cate comenzi expediate n-au factura la eMAG",
  );

  /* ⚠ Si `?? 0` e AICI, nu la numarare. La numarare era o minciuna: `faraFactura.count ?? 0`
     scria „0 comenzi fara factura" peste o citire PICATA, pentru un magazin care are. Acum
     numararea raspunde `null` la cadere, iar ecranul lasa cartonasul sa dispara — mai bine
     lipseste decat sa spuna un zero fals. */
  const actiuni = readFileSync("src/lib/actions/emag.actions.ts", "utf8");
  assert.match(
    actiuni, /comenziFaraFactura: faraFactura\.error \? null : \(faraFactura\.count \?\? 0\)/,
    "numararea trebuie sa deosebeasca „zero\" de „n-am putut citi\"",
  );
});
