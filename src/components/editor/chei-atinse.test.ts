import test from "node:test";
import assert from "node:assert/strict";
import { cheiSchimbate, doarCheile, scoateCheileConfirmate } from "./chei-atinse";

/**
 * Salvarea pe panouri in „Editeaza magazinul".
 *
 * Rulare: npm test
 */

test("cheile neatinse nu apar ca schimbate", () => {
  const a = { x: 1, y: { z: 2 } };
  assert.deepEqual(cheiSchimbate(a, { ...a }), []);
});

test("⚠ comparatie pe CONTINUT: un obiect imbricat recreat identic nu conteaza ca schimbare", () => {
  // Fiecare editare produce obiecte noi pentru campurile imbricate. Cu `!==`,
  // fiecare tastare ar fi marcat TOATE cheile ca atinse, si salvarea pe panouri
  // ar fi ramas exact partajarea de dinainte.
  const inainte = { benefits_section: { enabled: true, items: [{ title: "a" }] } };
  const dupa = { benefits_section: { enabled: true, items: [{ title: "a" }] } };
  assert.deepEqual(cheiSchimbate(inainte, dupa), []);
});

test("o cheie chiar schimbata se vede", () => {
  const inainte = { a: 1, b: { c: 1 } };
  assert.deepEqual(cheiSchimbate(inainte, { a: 1, b: { c: 2 } }), ["b"]);
});

test("cheile aparute sau disparute conteaza", () => {
  assert.deepEqual(cheiSchimbate({ a: 1 }, { a: 1, b: 2 }), ["b"]);
  assert.deepEqual(cheiSchimbate({ a: 1, b: 2 }, { a: 1 }), ["b"]);
});

test("⚠⚠ se trimit DOAR cheile panoului, nu tot obiectul", () => {
  // Miezul reparatiei: un comutator pornit si nesalvat in alt panou nu are voie
  // sa plece in magazin cand comerciantul salveaza ce a lucrat aici.
  const tot = { faq_section: { enabled: true }, checkout_config: { extras: [] }, altceva: 7 };
  assert.deepEqual(doarCheile(tot, ["faq_section"]), { faq_section: { enabled: true } });
});

test("⚠ o cheie ceruta dar absenta NU se trimite", () => {
  // Trimisa ca `undefined`, ar fi ajuns `null` in jsonb si ar fi sters din baza o
  // setare pe care nimeni n-a atins-o.
  assert.deepEqual(doarCheile({ a: 1 }, ["a", "lipsa"]), { a: 1 });
  assert.deepEqual(doarCheile({ a: undefined }, ["a"]), {});
});

test("fara nicio cheie atinsa, patch-ul e gol", () => {
  assert.deepEqual(doarCheile({ a: 1, b: 2 }, []), {});
});

test("⚠⚠ ce s-a editat in timpul salvarii ramane notat", () => {
  // Golit tot setul dupa salvare, ce apuca comerciantul sa schimbe cat timp se
  // urcau imaginile se pierdea definitiv: in baza pleca valoarea veche, nota
  // disparea, si nicio salvare ulterioara n-o mai trimitea vreodata.
  const set = new Set(["logo_size", "favicon_url"]);
  const trimis = { logo_size: 36, favicon_url: "/a.png" };
  // Intre timp comerciantul a mai tras de marimea logo-ului.
  const acum = { logo_size: 48, favicon_url: "/a.png" };

  scoateCheileConfirmate(set, trimis, acum);
  assert.deepEqual([...set], ["logo_size"], "cheia re-editata ramane de trimis");
});

test("ce a ajuns in baza nemodificat iese din set", () => {
  const set = new Set(["a", "b"]);
  scoateCheileConfirmate(set, { a: 1, b: 2 }, { a: 1, b: 2 });
  assert.deepEqual([...set], []);
});

test("o cheie notata dar netrimisa nu se pierde", () => {
  // Alt panou a salvat intre timp; nota asta n-are treaba cu el.
  const set = new Set(["a", "b"]);
  scoateCheileConfirmate(set, { a: 1 }, { a: 1, b: 9 });
  assert.deepEqual([...set], ["b"]);
});
