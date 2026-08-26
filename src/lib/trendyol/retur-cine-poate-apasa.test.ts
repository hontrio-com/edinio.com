import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { asteaptaHotarare, marfaAAjuns, sePoateHotari, STARI_DE_HOTARAT } from "./retur-forma";

/* ══════════════════════════════════════════════════════════════════════════
   `Created` NU INSEAMNA „AȘTEAPTĂ RĂSPUNSUL TĂU" (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Definitiile lor, cuvant cu cuvant, din ghid:

     Created         „The first status of the orders returns. This occurs when the customer
                      presses the return button."
     WaitingInAction „This statu returns when the returned orders reaches the supplier."

   ⚠ DEOSEBIREA E FIZICA, nu de eticheta: pe `Created` clientul abia a apasat butonul si coletul
   e inca la el. Comerciantul n-are ce hotari despre marfa pe care n-a primit-o — si mai ales
   n-are cum sa spuna „am primit marfa si e buna".
*/

const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("⚠ doar `WaitingInAction` asteapta o apasare de-a comerciantului", () => {
  assert.deepEqual([...STARI_DE_HOTARAT], ["WaitingInAction"]);
  assert.equal(asteaptaHotarare("WaitingInAction"), true);
  /* ⚠ Marfa nu a ajuns inca la el. */
  assert.equal(asteaptaHotarare("Created"), false);
  /* ⚠ Acolo se uita EI. */
  assert.equal(asteaptaHotarare("InAnalysis"), false);
  for (const s of ["Accepted", "Rejected", "Cancelled", "Unresolved", null]) {
    assert.equal(asteaptaHotarare(s), false, `${s}`);
  }
});

test("⚠ hotararea se cere NUMAI din `WaitingInAction`, si e regula lor scrisa", () => {
  /*
   * ═══ ⚠ PROBA ASTA A CODIFICAT CATEVA ORE REGULA GRESITA (indreptat 26.08.2026) ═══
   *
   * Aici scria ca `InAnalysis`, `Unresolved`, `WaitingFraudCheck` si necunoscutul TREC, cu
   * explicatia ca „ghidul lor nu spune ca aprobarea se poate face doar din WaitingInAction".
   *
   * ⚠ CUM AM GRESIT: am cautat regula in pagina care descrie CITIREA
   * (`2-getting-returned-orders`), n-am gasit-o, si am scris ca nu exista. Ea sta in paginile de
   * aprobare si de respingere, unde ii era locul. Citat verbatim, si din una, si din cealalta:
   *
   *     „You can only create a rejection request for returned orders with «WaitingInAction» status."
   *
   * ⚠ SI NECUNOSCUTUL SE OPRESTE ACUM. O hotarare e ireversibila si e plafonata la 5 pe minut,
   * iar rezultatul unei respingeri se vede abia mai tarziu, pe `claimItemStatus` — trimisa in
   * gol, comerciantul ar crede ca a respins.
   */
  assert.equal(sePoateHotari("WaitingInAction"), true);
  for (const s of [
    "Created", "InAnalysis", "Unresolved", "WaitingFraudCheck",
    "Accepted", "Rejected", "Cancelled", null, undefined, "",
  ]) {
    assert.equal(sePoateHotari(s), false, `${s} trebuie oprit`);
  }
});

test("⚠ si oprirea e pe SERVER, inaintea apelului ireversibil", () => {
  /*
   * ⚠ CURSA E ADEVARATA: ecranul arata `WaitingInAction` la 10:00, Trendyol accepta singur la
   * 10:01, omul apasa „Respinge" la 10:02. Ghidul lor spune ca rezultatul unei respingeri se
   * urmareste ABIA pe urma, pe `claimItemStatus` — deci nici n-am fi aflat pe loc ca n-a prins.
   */
  const mod = viu("src/lib/trendyol/retururi.ts");
  assert.match(mod, /select\("claim_item_id, claim_item_status"\)/);
  assert.match(mod, /!sePoateHotari\(stari\.get\(id\)\)/);

  const i = mod.indexOf("sePoateHotari(stari.get(id))");
  for (const apel of ["approveClaimItems(", "rejectClaimItems("]) {
    assert.ok(mod.indexOf(apel) > i, `verificarea trebuie sa fie inaintea lui ${apel}`);
  }
});

test("⚠ repunerea in stoc cere ca marfa sa fi AJUNS", () => {
  /*
   * Butonul spune „Am primit marfa și e bună", dar nimic nu verifica asta: functia se uita doar
   * la `repus_in_stoc_la`. Apasat pe `Created`, stocul creste pentru marfa care nu e la raft —
   * si se vinde ce nu exista.
   *
   * ⚠ MASURAT pe RPC-ul adevarat, in tranzactie anulata, pe o listare adevarata:
   *     Created         -> {stare: "marfa-n-a-ajuns", pus: 0}
   *     WaitingInAction -> {stare: "pus", pus: 1}
   *     ...a doua oara  -> {stare: "deja", pus: 0}      (idempotenta se pastreaza)
   *     Accepted        -> {stare: "pus", pus: 1}
   */
  assert.equal(marfaAAjuns("Created"), false);
  for (const s of ["WaitingInAction", "InAnalysis", "Accepted", "Rejected", "Unresolved", "WaitingFraudCheck"]) {
    assert.equal(marfaAAjuns(s), true, `${s}`);
  }

  /*
   * ═══ ⚠ SI NECUNOSCUTUL SE OPRESTE (indreptat 26.08.2026) ═══
   *
   * Aici scria ca `null` TRECE, cu explicatia ca „omul se uita la marfa in clipa in care apasa".
   * Adevarata, dar cantarita gresit: cele doua greseli nu se platesc la fel. Un „nu" gresit e
   * vizibil si se repara singur — omul vede motivul si incearca dupa urmatoarea sincronizare. Un
   * „da" gresit umfla stocul TACUT, iar pretul il plateste un client care cumpara ce nu exista.
   *
   * ⚠ Si e aceeasi necunoscuta ca la `sePoateHotari`, unde alesesem deja sa OPRIM. Doua
   * raspunsuri diferite la aceeasi intrebare, in acelasi fisier, e un defect in sine.
   */
  for (const s of [null, undefined, ""]) {
    assert.equal(marfaAAjuns(s), false, `${s} trebuie oprit`);
  }

  /* ⚠ Si paza sta in RPC, nu in ecran: butonul se poate ocoli cu un POST direct, functia nu. */
  const mig = readFileSync("migrations/2026-11-15-repunerea-fara-stare-nu-pleaca.sql", "utf8");
  assert.match(mig, /if v_linie\.claim_item_status = 'Created' then/);
  assert.match(mig, /'stare', 'marfa-n-a-ajuns'/);

  /*
   * ⚠ FARA STAREA LINIEI NU PLEACA NIMIC, si plasa pe cerere a iesit cu totul: operatia e pe
   * `claim_item_id`, deci daca starea LINIEI nu se stie n-avem nicio dovada despre bucata aia,
   * oricat ar spune starea adunata a cererii.
   *
   * ⚠ MASURAT pe RPC-ul adevarat, in tranzactie anulata, cu cererea pe `WaitingInAction`:
   *     WaitingInAction   -> {stare: "pus", pus: 1}
   *     Accepted          -> {stare: "pus", pus: 1}
   *     WaitingFraudCheck -> {stare: "pus", pus: 1}
   *     Created           -> {stare: "marfa-n-a-ajuns", pus: 0}
   *     (fara stare)      -> {stare: "status-necunoscut", pus: 0}   <- desi cererea era buna
   *     a doua apasare    -> {stare: "deja", pus: 0}
   */
  assert.match(mig, /'stare', 'status-necunoscut'/);
  assert.doesNotMatch(mig, /v_stare_cerere/, "plasa pe cerere a iesit");

  /* ⚠ Si mesajul spune ca e o ASTEPTARE, nu un refuz. */
  const sursaModulului = readFileSync("src/lib/trendyol/retururi.ts", "utf8");
  assert.match(sursaModulului, /case "status-necunoscut"/);
  assert.match(sursaModulului, /Nu am putut confirma încă starea returului la Trendyol/);

  /* ⚠ Si mesajul spune DE CE si CAND se poate, nu doar ca nu merge. */
  const mod = readFileSync("src/lib/trendyol/retururi.ts", "utf8");
  assert.match(mod, /case "marfa-n-a-ajuns"/);
  assert.match(mod, /după ce o primești/);
});

test("⚠ NICIO ramura nu mai avanseaza marcajul fara sa fi citit tot", () => {
  /*
   * ═══ ⚠ INTEGRITATEA NU ARE PRAG (26.08.2026) ═══
   *
   * Aici a fost un plafon de 200 de pagini, iar dincolo de el marcajul TRECEA MAI DEPARTE cu o
   * eroare `critical`. Adica pierdere de date scrisa in cod — improbabila, dar scrisa. Un pas
   * care aduce retururi n-are voie sa aiba o asemenea ramura deloc.
   *
   * ⚠ ACUM: se citeste pana la `totalPages`, oricat ar fi; singura margine e TIMPUL; iar cand
   * bugetul se termina, MARCAJUL RAMANE PE LOC si fereastra se ingusteaza mai departe, sub
   * podeaua obisnuita. Cu fiecare trecere e mai mica, deci la un moment dat incape. Se intarzie,
   * nu se pierde.
   */
  const mod = viu("src/lib/trendyol/retururi.ts");
  assert.doesNotMatch(mod, /PAGINI_MAXIME_LA_PODEA/, "plafonul de pagini a disparut");
  assert.match(mod, /if \(laStramtoare && totalPagini > paginiDeCitit\) paginiDeCitit = totalPagini;/);
  assert.match(mod, /const BUGET_MS_LA_PODEA = 20_000;/);
  assert.match(mod, /const faraBuget = laStramtoare && Date\.now\(\) - inceputulCitirii > BUGET_MS_LA_PODEA;/);

  /* ⚠ Ramura de la podea intoarce `ok: false` — adica marcajul NU se misca. */
  const i = mod.indexOf("if (laStramtoare) {");
  const ramura = mod.slice(i, i + 900);
  assert.match(ramura, /ok: false/);
  assert.doesNotMatch(ramura, /ok: true/);
  assert.match(ramura, /latimeUrmatoare: siMaiStransa/);

  /*
   * ⚠ SI CLAMPUL LASA FEREASTRA SA COBOARE. Cu `FEREASTRA_MINIMA_MS` acolo, o fereastra ceruta de
   * un minut ar fi fost ridicata inapoi la cinci — deci ingustarea de sub podea n-ar fi facut
   * nimic, si trecerea urmatoare ar fi dat de acelasi perete.
   */
  assert.match(mod, /Math\.max\(latimeCeruta \?\? FEREASTRA_MAXIMA_MS, FEREASTRA_ULTIMA_MS\)/);
  assert.match(mod, /const FEREASTRA_ULTIMA_MS = 60 \* 1000;/);
});


test("⚠ si ecranul nu ofera butoane care vor fi refuzate", () => {
  /*
   * ⚠ Serverul opreste deja, si acolo e paza adevarata — un buton se poate ocoli cu un POST
   * direct. Dar aratat activ, butonul PROMITE ceva ce nu se poate face, iar omul afla abia dupa
   * apasare. E chiar tiparul pe care l-am gresit de doua ori in doua zile: mesajul trebuie sa
   * numeasca butonul adevarat, iar butonul trebuie sa poata face ce spune.
   */
  const act = viu("src/lib/actions/trendyol-retururi.actions.ts");
  assert.match(act, /claim_item_id, claim_item_status,/, "starea liniei se citeste");
  assert.match(act, /sePoateHotari: sePoateHotari\(l\.claim_item_status\)/);
  assert.match(act, /marfaAAjuns: marfaAAjuns\(l\.claim_item_status\)/);

  const ui = readFileSync("src/components/dashboard/TrendyolReturns.tsx", "utf8");
  /* ⚠ Butonul de repunere se ascunde, si in locul lui se spune DE CE. */
  assert.match(ui, /: !l\.marfaAAjuns \? \(/);
  assert.match(ui, /coletul n-a ajuns încă la tine/);

  /*
   * ⚠ Si bifa se stinge. Bifata, o linie deja hotarata ar fi blocat apasarea pentru TOATE
   * celelalte — verificarea de pe server e pe toata lista, nu pe fiecare linie — iar omul ar fi
   * primit „reincarca pagina" fara sa inteleaga care linie l-a oprit.
   */
  assert.match(ui, /disabled=\{!l\.sePoateHotari\}/);
  assert.match(ui, /nu mai așteaptă un răspuns de la tine/);
});

test("⚠ „nu stim” nu se mai spune ca „s-a hotarat deja”", () => {
  /*
   * ═══ ⚠ O CONTRAZICERE PE CARE AM FACUT-O CHIAR EU (26.08.2026) ═══
   *
   * De cand hotararea se cere numai din `WaitingInAction`, o linie a carei stare n-am putut-o
   * citi iese si ea nebifabila — corect, fiindca n-avem voie sa pariem pe un apel ireversibil,
   * plafonat la 5 pe minut, al carui rezultat se vede abia mai tarziu.
   *
   * ⚠ DAR CEREREA EI APARE IN LISTA „așteaptă răspunsul tău", anume, ca sa nu dispara — vezi
   * paza `claim_status.is.null` din panou. Iar ecranul ii spunea „nu mai așteaptă un răspuns de
   * la tine": taman contrariul listei in care statea, si neadevarat pe deasupra.
   *
   * ⚠ Un ecran care se contrazice singur il invata pe om sa nu-l creada. Se spune care din doua e.
   */
  const act = viu("src/lib/actions/trendyol-retururi.actions.ts");
  assert.match(act, /stareNecunoscuta: !l\.claim_item_status/);

  const ui = readFileSync("src/components/dashboard/TrendyolReturns.tsx", "utf8");
  assert.match(ui, /l\.stareNecunoscuta/);
  assert.match(ui, /nu i-am putut citi starea de la Trendyol/);
  assert.match(ui, /nu mai așteaptă un răspuns de la tine/);

  /* ⚠ Si textul spune si CE URMEAZA, nu doar ce nu merge: se reia singur. Altfel omul ramane cu
     un mesaj care nu-i cere nimic si nu-i promite nimic. */
  assert.match(ui, /se reîncearcă la următoarea sincronizare/);
});

test("⚠ si pastila numara doar ce cere chiar o apasare", () => {
  /*
   * ═══ ⚠ AM SPUS DE DOUA ORI CA FUNCTIA ASTA NU EXISTA (26.08.2026) ═══
   *
   * `cateRetururiAsteapta` sta in `retururi.ts`, si cerea lista veche:
   * `["Created", "WaitingInAction", "InAnalysis"]`. Am cautat-o de doua ori si am raportat de
   * doua ori ca nu exista — fiindca in amandoua cautarile pusesem `grep -v retururi.ts` ca sa
   * reduc zgomotul. Am exclus taman fisierul in care statea, si apoi am afirmat un negativ.
   *
   * ⚠ NU E CHEMATA DE NICAIERI ACUM, si tocmai de-aia trebuia reparata: un cod mort care ramane
   * gresit se leaga intr-o zi la un ecran, iar cine il leaga presupune ca e bun. Pastila lui ar
   * fi aratat „3 retururi de rezolvat" cand unul singur cere o apasare.
   *
   * ⚠ SI FOLOSESTE `STARI_DE_HOTARAT`, nu o lista scrisa a doua oara. Doua liste care spun
   * acelasi lucru se despart la prima schimbare — s-au despartit deja o data, chiar aici.
   */
  const mod = viu("src/lib/trendyol/retururi.ts");
  assert.match(mod, /\.in\("claim_status", STARI_DE_HOTARAT\)/);
  assert.doesNotMatch(mod, /"Created", "WaitingInAction", "InAnalysis"/);
});

test("⚠ si niciun comentariu nu mai spune ca necunoscutul trece", () => {
  /* Codul era corect, comentariul nu — iar peste cateva luni cineva citeste comentariul. */
  const brut = readFileSync("src/lib/trendyol/retururi.ts", "utf8");
  assert.doesNotMatch(brut, /ghidul lor NU spune ca/);
  assert.doesNotMatch(brut, /LINII_FARA_HOTARARE/);
  assert.match(brut, /TRECE NUMAI `WaitingInAction`, si e regula LOR, scrisa/);
});
