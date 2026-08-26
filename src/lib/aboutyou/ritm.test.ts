import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   NIMIC NU PAZEA PLAFOANELE LOR (26.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Sondarea comenzilor poate scoate pana la cinci statusuri × patruzeci de pagini = doua sute de
   cereri pe magazin intr-o singura rulare, peste plafonul de o suta pe minut al rutei de comenzi.

   ⚠ SI DEPASIREA SE HRANESTE SINGURA: cererile RESPINSE se numara si ele in limita lor. Cu cat
   lovesti mai tare un plafon atins, cu atat stai mai mult sub el.

   ⚠ LIMITATORUL E CEL IMPARTIT AL CASEI, nu unul pe proces. Pe mai multe instante, un contor
   local ar lasa fiecare instanta sa creada ca are tot bugetul — nota de la `spunePauza` o spune:
   „un 429 il ia fiecare pe rand".
*/

/**
 * Codul viu, fara comentarii.
 *
 * ═══ ⚠ LINIILE INTAI, BLOCURILE PE URMA — SI CONTEAZA (26.08.2026) ═══
 *
 * Antetul lui `client.ts` are, intr-un comentariu de LINIE, textul „polled via `/results/*`".
 * Curatate blocurile intai, `/*`-ul acela deschide un „bloc" care se inchide abia la primul `*​/`
 * adevarat de mai jos — si inghite 835 de caractere de cod real, inclusiv importurile.
 *
 * ⚠ CE COSTA: o proba care cauta ceva in bucata inghitita pica pe nedrept, iar una care verifica
 * o ABSENTA (`doesNotMatch`) trece degeaba. A doua e mai rea: pare ca pazeste ceva si nu pazeste
 * nimic.
 *
 * ⚠ Verificat pe tot `src/lib`: numai `aboutyou/client.ts` si `aboutyou/types.ts` sunt atinse, si
 * numai proba asta le citeste. Nicio proba existenta n-a fost pacalita.
 */
const viu = (p: string) =>
  readFileSync(p, "utf8").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const client = viu("src/lib/aboutyou/client.ts");

test("⚠ fiecare cerere asteapta un jeton, din limitatorul IMPARTIT", () => {
  /* ⚠ `includes`, nu regex: escapurile dintr-un sablon scris intr-un heredoc se pot pierde in
     transport, si atunci proba pare ca trece pe alta afirmatie decat cea scrisa. Mi s-a intamplat
     de doua ori azi. */
  assert.ok(client.includes('from "@/lib/marketplace/ritm-impartit"'), "limitatorul nu e importat");
  assert.ok(
    client.includes('await asteaptaJetonImpartit(cheie, plafon, 60_000, "aboutyou")'),
    "jetonul nu se cere",
  );

  /*
   * ═══ ⚠ SI PLAFONUL SE INVATA DIN ANTETUL LOR (27.08.2026) ═══
   *
   * Tabela noastra e cea mai buna presupunere; `X-RateLimit-Limit` e chiar raspunsul lor. Se
   * strange NUMAI IN JOS: citit gresit in sus, ar deschide robinetul peste ce ingaduie ei, iar
   * cererile respinse se numara si ele in limita — deci greseala s-ar hrani singura.
   */
  assert.ok(client.includes("const plafon = Math.min(limita, plafoaneAflate.get(cheie) ?? limita);"));
  assert.ok(client.includes("if (spusDeEi != null && spusDeEi < (plafoaneAflate.get(cheie) ?? limita)) {"));

  /* ⚠ Si asteptarea e INAINTEA lui `fetch`: dupa, n-ar mai fi o franare. */
  const iJeton = client.indexOf("asteaptaJetonImpartit");
  const iFetch = client.indexOf("await fetch(");
  assert.ok(iJeton > 0 && iFetch > iJeton, "jetonul se cere inaintea cererii");
});

test("⚠ cand nu vine jetonul, cererea NU se trimite", () => {
  /*
   * Trimisa oricum, ar fi fost inca o cerere respinsa numarata in limita — adica exact ce
   * inrautateste situatia. Se intoarce ca o cauza TRECATOARE (status 0), pe care cronul o stie
   * deja sa n-o puna in contul elementului.
   */
  const i = client.indexOf("if (!await asteaptaJetonImpartit");
  const f = client.slice(i, i + 260);
  assert.match(f, /status: 0/);
  assert.match(f, /return \{/);
});

test("⚠ ce spun EI bate socoteala noastra", () => {
  /* Un `429` inseamna sigur ca am trecut de limita, indiferent ce credea galeata. Iar
     `Retry-After` se spune TUTUROR instantelor, nu doar celei care l-a primit. */
  assert.match(client, /if \(res\.status === 429\)/);
  assert.match(client, /await spunePauza\(cheie, asteptareaCerutaDeEi\(res\.headers, 30_000\), "aboutyou"\)/);
});

test("⚠ galeata e pe CHEIE si pe MEDIU, nu pe magazin", () => {
  /*
   * Plafonul lor e pe cheia API. Iar sandbox si productia au bugete deosebite — amestecate, una
   * ar manca-o pe cealalta.
   */
  assert.match(client, /const cont = `\$\{auth\.environment \?\? "production"\}:\$\{\(auth\.apiKey \?\? ""\)\.trim\(\)\.slice\(-8\)\}`/);
  assert.match(client, /cheie: `aboutyou:\$\{cont\}:\$\{g\?\.nume \?\? "altele"\}`/);
});

test("⚠ ce nu se potriveste primeste cel mai strans plafon", () => {
  /* O ruta noua, necunoscuta, n-are voie sa mosteneasca bugetul cel mai larg: necunoscutul se
     trateaza strans, ca peste tot. */
  assert.match(client, /limita: g\?\.limita \?\? 100/);
});

test("⚠ galetile despart rutele cu plafoane diferite, si cele stramte stau primele", () => {
  /*
   * ═══ ⚠ PATRU GALETI ACOPEREAU RUTE CU PLAFOANE DIFERITE (27.08.2026) ═══
   *
   * `/orders` la 100 acoperea si `/orders/cancel`; `/products` la 100 acoperea si
   * `/products/rejected` — ruta pentru care CHIAR COMENTARIUL NOSTRU din `sync.ts` scria „limita
   * rutei e 50 de cereri pe minut". Stiam si nu pusesem numarul unde conteaza.
   */
  const iActiuni = client.indexOf('nume: "orders-actiuni"');
  const iOrders = client.indexOf('nume: "orders"');
  const iRespinse = client.indexOf('nume: "products-rejected"');
  const iProduse = client.indexOf('nume: "products"');
  assert.ok(iActiuni > 0 && iRespinse > 0, "galetile stramte lipsesc");
  /* ⚠ Se ia PRIMA potrivire, deci ordinea E regula: stramtul inaintea familiei lui. */
  assert.ok(iActiuni < iOrders, "`/orders/cancel` trebuie sa fie inaintea lui `/orders`");
  assert.ok(iRespinse < iProduse, "`/products/rejected` trebuie sa fie inaintea lui `/products`");

  /* ⚠ Si rutele de rezultate au galeata lor: cadeau pe implicitul „altele", nescris nicaieri. */
  assert.ok(client.includes('nume: "results"'));
});
