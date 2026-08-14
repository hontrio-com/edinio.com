import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  citesteCodAwb,
  citesteIdBorderou,
  descrieEroarea,
  listaDinRaspuns,
  pareCodAwb,
  postaGata,
  type PostaConfig,
} from "./client";

/*
 * ⚠ Sase endpointuri din sapte n-au raspunsul documentat, si nu exista cont pe
 * care sa probam. Functiile probate aici sunt tocmai cele care CITESC raspunsuri
 * necunoscute — deci ele poarta tot riscul, si ele trebuie sa fie cel mai bine
 * aparate. Regula pe care o apara probele: cand nu recunoastem nimic, se intoarce
 * `null`, iar apelantul opreste cu verdictul „nu stim". Nu se ghiceste.
 */

const CONFIG: PostaConfig = {
  enabled: true,
  username: "user",
  password: "parola",
  cod_trimitere: "3,1,10",
};

// ─── Cand e configurat ────────────────────────────────────────────────────────

test("integrarea e gata doar cu toate cele patru", () => {
  assert.ok(postaGata(CONFIG));
  assert.ok(!postaGata({ ...CONFIG, enabled: false }));
  assert.ok(!postaGata({ ...CONFIG, username: "" }));
  assert.ok(!postaGata({ ...CONFIG, password: "" }));
  assert.ok(!postaGata(null));
});

test("⚠ fara codul de trimitere integrarea NU e gata, desi nu e credentiala", () => {
  /* Altfel checkout-ul ar arata o optiune de livrare care nu poate produce
     niciun AWB: `codTrimitere` e camp obligatoriu la ei. */
  assert.ok(!postaGata({ ...CONFIG, cod_trimitere: "" }));
});

// ─── Forma unui cod AWB ───────────────────────────────────────────────────────

test("codul AWB are 13 caractere alfanumerice, ca in toate exemplele lor", () => {
  assert.ok(pareCodAwb("LN09199999999"));
  assert.ok(pareCodAwb("LN99999999989"));
  assert.ok(!pareCodAwb("LN0919999"), "prea scurt");
  assert.ok(!pareCodAwb("LN091999999999"), "prea lung");
  assert.ok(!pareCodAwb("LN-0919999999"), "cu separator");
  assert.ok(!pareCodAwb(12345));
  assert.ok(!pareCodAwb(null));
});

// ─── Codul AWB dintr-un raspuns necunoscut ────────────────────────────────────

test("codul se gaseste sub numele probabile", () => {
  assert.equal(citesteCodAwb({ codAwb: "LN09199999999" }), "LN09199999999");
  assert.equal(citesteCodAwb({ cod_awb: "LN09199999999" }), "LN09199999999");
  assert.equal(citesteCodAwb({ awb: "LN09199999999" }), "LN09199999999");
  assert.equal(citesteCodAwb({ nrAwb: "LN09199999999" }), "LN09199999999");
});

test("codul se gaseste si impachetat un nivel", () => {
  assert.equal(citesteCodAwb({ data: { codAwb: "LN09199999999" } }), "LN09199999999");
  assert.equal(citesteCodAwb({ result: { awb: "LN09199999999" } }), "LN09199999999");
});

test("raspunsul poate fi chiar codul, sau o lista", () => {
  assert.equal(citesteCodAwb("LN09199999999"), "LN09199999999");
  assert.equal(citesteCodAwb([{ codAwb: "LN09199999999" }]), "LN09199999999");
});

test("un nume necunoscut merge, daca valoarea are chiar forma unui AWB", () => {
  assert.equal(citesteCodAwb({ numarTrimitere: "LN09199999999" }), "LN09199999999");
});

test("⚠ un sir care NU are forma unui AWB nu e cules drept AWB", () => {
  /*
   * Fara sita, primul sir din raspuns — un mesaj, o data, un nume de unitate — ar
   * fi devenit „AWB" si ar fi ajuns pe comanda si in cozile de marketplace.
   */
  assert.equal(citesteCodAwb({ message: "AWB salvat cu succes" }), null);
  assert.equal(citesteCodAwb({ data: "26.02.2015 10:33" }), null);
  assert.equal(citesteCodAwb({ status: "ok" }), null);
});

test("numele probabil bate un alt sir de 13 caractere din acelasi raspuns", () => {
  const r = { referintaInterna: "ABCDEFGHIJKLM", codAwb: "LN09199999999" };
  assert.equal(citesteCodAwb(r), "LN09199999999");
});

test("cand nu recunoastem nimic, se intoarce null — nu se ghiceste", () => {
  assert.equal(citesteCodAwb({}), null);
  assert.equal(citesteCodAwb(null), null);
  assert.equal(citesteCodAwb(""), null);
  assert.equal(citesteCodAwb({ id: 1234 }), null);
});

// ─── Id-ul de borderou ────────────────────────────────────────────────────────

test("id-ul de borderou se gaseste ca numar, ca sir sau impachetat", () => {
  assert.equal(citesteIdBorderou(555), 555);
  assert.equal(citesteIdBorderou("555"), 555);
  assert.equal(citesteIdBorderou({ idBorderou: 555 }), 555);
  assert.equal(citesteIdBorderou({ id: "555" }), 555);
  assert.equal(citesteIdBorderou({ data: { borderouId: 555 } }), 555);
});

test("zero si valorile necitibile nu sunt id de borderou", () => {
  assert.equal(citesteIdBorderou(0), null);
  assert.equal(citesteIdBorderou("abc"), null);
  assert.equal(citesteIdBorderou({}), null);
  assert.equal(citesteIdBorderou(null), null);
});

// ─── Mesajul de eroare ────────────────────────────────────────────────────────

test("motivele pe camp sunt cele care spun omului ce sa corecteze", () => {
  const m = descrieEroarea({ errors: { adresaDestinatar: ["prea lunga"] } }, "");
  assert.ok(m.includes("adresaDestinatar"), m);
  assert.ok(m.includes("prea lunga"), m);
});

test("se acopera si formele romanesti, si `meta` cu nume de campuri", () => {
  assert.ok(descrieEroarea({ erori: { codTrimitere: "lipseste" } }, "").includes("codTrimitere"));
  assert.ok(descrieEroarea({ mesaj: "Cont invalid" }, "") === "Cont invalid");
  assert.ok(descrieEroarea({ meta: ["greutateTrimitere"] }, "").includes("greutateTrimitere"));
});

test("o lista de texte se aduna", () => {
  assert.equal(descrieEroarea(["prima", "a doua"], ""), "prima; a doua");
});

test("cand nu recunoastem forma, se intoarce inceputul raspunsului brut", () => {
  /* Mai bine un text urat pe care comerciantul il poate trimite mai departe
     decat „a esuat" fara nimic. */
  assert.equal(descrieEroarea(null, "<html>Eroare 500</html>"), "<html>Eroare 500</html>");
  assert.equal(descrieEroarea(null, ""), "raspuns gol");
});

// ─── Lista dintr-un raspuns ───────────────────────────────────────────────────

test("nomenclatorul se citeste si direct, si impachetat", () => {
  assert.deepEqual(listaDinRaspuns([1, 2]), [1, 2]);
  assert.deepEqual(listaDinRaspuns({ data: [1, 2] }), [1, 2]);
  assert.deepEqual(listaDinRaspuns({ items: [1] }), [1]);
  assert.deepEqual(listaDinRaspuns({ unitati: [1] }), [1]);
});

test("ce nu contine nicio lista da lista goala, nu o exceptie", () => {
  assert.deepEqual(listaDinRaspuns({}), []);
  assert.deepEqual(listaDinRaspuns(null), []);
  assert.deepEqual(listaDinRaspuns("text"), []);
});
