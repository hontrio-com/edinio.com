import { strict as assert } from "node:assert";
import { test } from "node:test";
import { cuprinsSiHtml, meritaCuprins } from "./cuprins";

/*
  Cuprinsul și ancorele ies din ACEEAȘI trecere, dinadins. Probele de aici apără
  în primul rând legătura dintre ele: o intrare din cuprins care trimite la un
  `id` inexistent nu crapă nimic — cititorul apasă, nu se întâmplă nimic, și
  crede că site-ul e stricat. E genul de defect pe care nu-l raportează nimeni.
*/

test("fiecare intrare din cuprins are ancora ei in HTML", () => {
  const { cuprins, html } = cuprinsSiHtml(
    "<h2>Unu</h2><p>x</p><h3>Doi</h3><h2>Trei</h2>",
  );
  assert.equal(cuprins.length, 3);
  for (const t of cuprins) {
    assert.ok(html.includes(`id="${t.id}"`), `lipseste ancora pentru „${t.text}"`);
  }
});

test("doua titluri cu acelasi nume primesc ancore deosebite", () => {
  // Fara numerotare, browserul ar sari mereu la primul, iar a doua intrare din
  // cuprins ar parea ca nu functioneaza.
  const { cuprins, html } = cuprinsSiHtml("<h2>Pe scurt</h2><h2>Pe scurt</h2>");
  assert.deepEqual(cuprins.map((t) => t.id), ["pe-scurt", "pe-scurt-2"]);
  assert.ok(html.includes('id="pe-scurt"'));
  assert.ok(html.includes('id="pe-scurt-2"'));
});

test("un id scris deja de om se pastreaza, si cuprinsul arata spre el", () => {
  // Poate fi tinta unei legaturi date cuiva. Rescris, ar rupe-o.
  const { cuprins, html } = cuprinsSiHtml('<h2 id="al-meu">Titlu</h2>');
  assert.equal(cuprins[0].id, "al-meu");
  assert.ok(html.includes('id="al-meu"'));
  assert.ok(!html.includes('id="titlu"'), "a pus un al doilea id peste al omului");
});

test("un titlu doar din semne primeste totusi o ancora", () => {
  const { cuprins, html } = cuprinsSiHtml("<h2>!!! ???</h2>");
  assert.equal(cuprins.length, 1);
  assert.ok(cuprins[0].id.length > 0, "ancora goala: intrarea ar trimite in gol");
  assert.ok(html.includes(`id="${cuprins[0].id}"`));
});

test("titlurile poarta nivelul lor, ca sa se poata indenta", () => {
  const { cuprins } = cuprinsSiHtml("<h2>Mare</h2><h3>Mic</h3>");
  assert.deepEqual(cuprins.map((t) => t.nivel), [2, 3]);
});

test("h1 si h4 nu intra in cuprins", () => {
  // h1 e titlul paginii, pus de PageHero. h4 in jos e prea adanc pentru o lista
  // laterala care trebuie sa se citeasca dintr-o privire.
  const { cuprins } = cuprinsSiHtml("<h1>Pagina</h1><h4>Adanc</h4><h2>Chiar</h2>");
  assert.deepEqual(cuprins.map((t) => t.text), ["Chiar"]);
});

test("textul titlului iese fara etichete si fara entitati", () => {
  const { cuprins } = cuprinsSiHtml("<h2>Curieri <strong>&amp;</strong> livrare</h2>");
  assert.equal(cuprins[0].text, "Curieri & livrare");
});

test("atributele titlului nu se pierd cand se adauga ancora", () => {
  const { html } = cuprinsSiHtml('<h2 style="text-align:center">Titlu</h2>');
  assert.ok(html.includes("text-align:center"), "s-a pierdut stilul titlului");
  assert.ok(html.includes('id="titlu"'));
});

test("un articol fara titluri nu da cuprins si nu strica HTML-ul", () => {
  const intrare = "<p>Doar text.</p>";
  const { cuprins, html } = cuprinsSiHtml(intrare);
  assert.equal(cuprins.length, 0);
  assert.equal(html, intrare);
});

test("sub trei titluri, cuprinsul nu merita aratat", () => {
  const doua = cuprinsSiHtml("<h2>Unu</h2><h2>Doi</h2>").cuprins;
  const trei = cuprinsSiHtml("<h2>Unu</h2><h2>Doi</h2><h2>Trei</h2>").cuprins;
  assert.equal(meritaCuprins(doua), false);
  assert.equal(meritaCuprins(trei), true);
});
