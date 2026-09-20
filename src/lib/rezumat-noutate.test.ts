import { strict as assert } from "node:assert";
import { test } from "node:test";

import { rezumatScurt } from "./announcements";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  RANDUL DE SUB TITLU, IN LISTA DE NOUTATI
  ═══════════════════════════════════════════════════════════════════════════════

  Rezumatul se face din continutul anuntului, care e HTML scris de mana in panoul
  de administrare. Tot ce poate iesi prost aici iese TACUT: o eticheta rupta in
  doua, un cuvant taiat la jumatate, sau un rand gol acolo unde exista text.
*/

const anunt = (x: Partial<Parameters<typeof rezumatScurt>[0]>) =>
  ({ excerpt: null, blocks: [], ...x } as Parameters<typeof rezumatScurt>[0]);

test("cand exista un rezumat scris de om, el se foloseste", () => {
  assert.equal(
    rezumatScurt(anunt({ excerpt: "  Clientii pot plati in 3 rate.  " })),
    "Clientii pot plati in 3 rate.",
  );
});

test("⚠ fara rezumat, se ia din text, dar FARA etichete HTML", () => {
  /* Taiat de-a dreptul, „<p>Salut</p>" ar fi ajuns pe ecran ca text cu coduri,
     sau si mai rau, cu o eticheta deschisa si neinchisa. */
  const r = rezumatScurt(anunt({
    blocks: [{ type: "text", html: "<p>De azi poti activa <strong>Klarna</strong> din Setari.</p>" }],
  }));
  assert.equal(r, "De azi poti activa Klarna din Setari.");
  assert.ok(!r.includes("<"), "nu ramane nicio eticheta");
});

test("caracterele scrise ca semne HTML se intorc la litere", () => {
  const r = rezumatScurt(anunt({
    blocks: [{ type: "text", html: "<p>Comenzi &amp; facturi&nbsp;&mdash; gata&hellip;</p>" }],
  }));
  assert.equal(r, "Comenzi & facturi - gata...");
  /* ⚠ Niciun semn nu are voie sa ramana scris cu numele lui: „&mdash;" citit de
     comerciant arata exact ca o pagina stricata. */
  assert.ok(!/&[a-z#]/i.test(r), r);
});

test("si semnele scrise cu numar se traduc", () => {
  const r = rezumatScurt(anunt({ blocks: [{ type: "text", html: "<p>&#8222;Livrat&#8221; in 24h</p>" }] }));
  assert.equal(r, "„Livrat” in 24h");
});

test("⚠ taietura cade intre cuvinte, nu prin mijlocul unuia", () => {
  const lung = "Aceasta este o noutate foarte lunga despre facturare automata la plata cu SmartBill, Oblio sau FGO, scrisa anume ca sa depaseasca limita randului.";
  const r = rezumatScurt(anunt({ excerpt: lung }), 60);
  assert.ok(r.length <= 63, `prea lung: ${r.length}`);
  assert.ok(r.endsWith("..."), r);
  assert.ok(!r.replace("...", "").endsWith(" "), "nu ramane spatiu inaintea punctelor");
  assert.ok(lung.startsWith(r.replace("...", "")), "textul taiat e chiar inceputul celui lung");
});

test("un bloc de imagine sau video nu tine loc de rezumat", () => {
  /* Fara regula asta, randul ar fi ramas gol la un anunt care incepe cu o poza,
     desi textul exista chiar sub ea. */
  const r = rezumatScurt(anunt({
    blocks: [
      { type: "image", url: "https://exemplu/poza.png" },
      { type: "text", html: "<p>Curieri noi in panou.</p>" },
    ],
  }));
  assert.equal(r, "Curieri noi in panou.");
});

test("un anunt fara nimic de spus da text gol, nu „undefined”", () => {
  assert.equal(rezumatScurt(anunt({})), "");
  assert.equal(rezumatScurt(anunt({ blocks: [{ type: "divider" }] })), "");
});
