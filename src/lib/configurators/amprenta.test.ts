import test from "node:test";
import assert from "node:assert/strict";
import { amprentaConfiguratiei, amprentaDinBrut, serializeazaCanonic, cheieLinie } from "./amprenta";
import { normalizeazaValori, type Valori } from "./valori";
import { lineKey } from "@/lib/storefront/cart/normalize";

const a = (brut: unknown): string => amprentaDinBrut(brut).amprenta;

/* ── Ce trebuie sa fie ACELASI ───────────────────────────────────────────── */

test("ordinea cheilor din JSON nu schimba amprenta", () => {
  assert.equal(
    a({ material: { f: "alegere", v: "premium" }, latime: { f: "numar", v: 3500 } }),
    a({ latime: { f: "numar", v: 3500 }, material: { f: "alegere", v: "premium" } }),
  );
});

test("ordinea bifarii nu e o alegere", () => {
  assert.equal(
    a({ extra: { f: "alegeri", v: ["b", "a", "c"] } }),
    a({ extra: { f: "alegeri", v: ["c", "b", "a"] } }),
  );
});

test("aceeasi bifa pusa de doua ori nu conteaza de doua ori", () => {
  assert.equal(
    a({ extra: { f: "alegeri", v: ["a", "a", "b"] } }),
    a({ extra: { f: "alegeri", v: ["a", "b"] } }),
  );
});

test("minus zero e zero", () => {
  assert.equal(a({ x: { f: "numar", v: -0 } }), a({ x: { f: "numar", v: 0 } }));
});

test("spatiile din text nu fac o gravura noua", () => {
  const drept = a({ text: { f: "text", v: "Ana Maria" } });
  assert.equal(a({ text: { f: "text", v: "  Ana Maria  " } }), drept);
  assert.equal(a({ text: { f: "text", v: "Ana   Maria" } }), drept);
  assert.equal(a({ text: { f: "text", v: "Ana\tMaria" } }), drept);
});

test("un camp necompletat e la fel cu unul lipsa", () => {
  const fara = a({ material: { f: "alegere", v: "std" } });
  assert.equal(a({ material: { f: "alegere", v: "std" }, text: { f: "text", v: "" } }), fara);
  assert.equal(a({ material: { f: "alegere", v: "std" }, text: { f: "text", v: "   " } }), fara);
  // Un comutator STINS e tot „neatins": altfel bifarea si debifarea ar lasa urma.
  assert.equal(a({ material: { f: "alegere", v: "std" }, cadou: { f: "comutator", v: false } }), fara);
});

test("un camp pe care nu-l intelegem nu se strecoara in amprenta", () => {
  const curat = a({ x: { f: "numar", v: 1 } });
  assert.equal(a({ x: { f: "numar", v: 1 }, y: { f: "necunoscut", v: 9 } }), curat);
  assert.equal(a({ x: { f: "numar", v: 1 }, y: "text pur" }), curat);
  assert.equal(a({ x: { f: "numar", v: 1 }, y: { f: "numar", v: Number.NaN } }), curat);
});

/* ── Ce trebuie sa fie DIFERIT ───────────────────────────────────────────── */

test("CERINTA DIN PLAN: Robert si Maria sunt doua linii, desi costa la fel", () => {
  /*
   * Chiar exemplul din cerinta. Pretul NU intra in amprenta, tocmai ca doua gravuri diferite
   * la acelasi pret sa ramana doua produse diferite.
   */
  assert.notEqual(
    a({ gravura: { f: "text", v: "Robert" } }),
    a({ gravura: { f: "text", v: "Maria" } }),
  );
});

test("literele mari chiar sunt alta gravura", () => {
  assert.notEqual(a({ t: { f: "text", v: "ANA" } }), a({ t: { f: "text", v: "Ana" } }));
});

test("o dimensiune schimbata schimba amprenta", () => {
  assert.notEqual(a({ l: { f: "numar", v: 3500 } }), a({ l: { f: "numar", v: 3501 } }));
});

test("aceeasi poza, decupata altfel, e alt produs", () => {
  const p = (t: unknown) => a({ poza: { f: "fisiere", v: [{ id: "f1", t }] } });
  assert.notEqual(p({ x: 0, y: 0, s: 1, r: 0 }), p({ x: 0.1, y: 0, s: 1, r: 0 }));
  assert.notEqual(p({ x: 0, y: 0, s: 1, r: 0 }), p({ x: 0, y: 0, s: 1.5, r: 0 }));
  assert.notEqual(p({ x: 0, y: 0, s: 1, r: 0 }), p(undefined));
});

test("ordinea pozelor CONTEAZA: care e pe fata nu e totuna", () => {
  const doua = (ids: string[]) => a({ p: { f: "fisiere", v: ids.map((id) => ({ id })) } });
  assert.notEqual(doua(["a", "b"]), doua(["b", "a"]));
});

test("un camp in plus schimba amprenta", () => {
  assert.notEqual(
    a({ x: { f: "numar", v: 1 } }),
    a({ x: { f: "numar", v: 1 }, y: { f: "numar", v: 1 } }),
  );
});

test("acelasi text mutat pe alt camp NU e aceeasi configuratie", () => {
  assert.notEqual(
    a({ fata: { f: "text", v: "Ana" } }),
    a({ spate: { f: "text", v: "Ana" } }),
  );
});

/* ── Serializarea nu se poate desface in doua feluri ─────────────────────── */

test("lungimea scrisa in fata inchide ciocnirea prin despartitor", () => {
  /*
   * Fara lungime, `{a: "b|c"}` si `{"a|b": "c"}` s-ar fi putut scrie identic. Proba compara
   * chiar sirurile, nu amprentele, ca sa arate unde se rupe ambiguitatea.
   */
  const unu = serializeazaCanonic(normalizeazaValori({ a: { f: "text", v: "b:c" } }));
  const doi = serializeazaCanonic(normalizeazaValori({ "a:b": { f: "text", v: "c" } }));
  assert.notEqual(unu, doi);
  assert.notEqual(a({ a: { f: "text", v: "b:c" } }), a({ "a:b": { f: "text", v: "c" } }));
});

test("amprenta are forma asteptata si e stabila intre rulari", () => {
  const v: Valori = normalizeazaValori({ l: { f: "numar", v: 3500 }, m: { f: "alegere", v: "premium" } });
  const x = amprentaConfiguratiei(v);
  assert.match(x, /^[0-9a-z]{28}$/, "patru benzi a cate 7 caractere in baza 36");
  for (let i = 0; i < 50; i++) assert.equal(amprentaConfiguratiei(v), x);
});

test("configuratia GOALA are amprenta ei, si e mereu aceeasi", () => {
  assert.equal(a({}), a(null));
  assert.equal(a({}), a("gunoi"));
  assert.notEqual(a({}), a({ x: { f: "numar", v: 0 } }));
});

test("benzile chiar se departeaza: nu sunt patru copii ale aceleiasi dispersii", () => {
  const x = a({ t: { f: "text", v: "Robert" } });
  const benzi = [x.slice(0, 7), x.slice(7, 14), x.slice(14, 21), x.slice(21, 28)];
  assert.equal(new Set(benzi).size, 4, "cele patru benzi trebuie sa difere intre ele");
});

/* ── Compatibilitatea cheii de linie ─────────────────────────────────────── */

test("FARA configuratie, cheia e LITERA CU LITERA cea de azi", () => {
  /*
   * Cerinta cea mai grea: cosurile aflate acum in localStorage-ul cumparatorilor nu au voie sa
   * se desfaca in linii noi la prima incarcare a paginii. Se compara cu chiar `lineKey` din cos.
   */
  assert.equal(cheieLinie("p1"), lineKey({ productId: "p1" }));
  assert.equal(
    cheieLinie("p1", "S / Rosu"),
    lineKey({ productId: "p1", variantTitle: "S / Rosu" }),
  );
  assert.equal(cheieLinie("p1", undefined), "p1");
  assert.equal(cheieLinie("p1", "S / Rosu"), "p1::S / Rosu");
});

test("CU configuratie, doua configuratii diferite dau chei diferite", () => {
  const unu = cheieLinie("p1", undefined, a({ t: { f: "text", v: "Robert" } }));
  const doi = cheieLinie("p1", undefined, a({ t: { f: "text", v: "Maria" } }));
  assert.notEqual(unu, doi);
  // Si niciuna nu se poate confunda cu linia neconfigurata a aceluiasi produs.
  assert.notEqual(unu, cheieLinie("p1"));
});

test("aceeasi configuratie da aceeasi cheie, deci cantitatea creste", () => {
  const amp = a({ t: { f: "text", v: "Robert" }, m: { f: "alegere", v: "premium" } });
  const alta = a({ m: { f: "alegere", v: "premium" }, t: { f: "text", v: " Robert " } });
  assert.equal(cheieLinie("p1", "S", amp), cheieLinie("p1", "S", alta));
});

test("titlul de varianta cu `::` nu poate produce o ciocnire", () => {
  /*
   * Cheia veche lipeste cu `::` fara nicio escapare. Cu o a treia parte adaugata dupa, un titlu
   * care contine el insusi `::` ar fi devenit o ciocnire adevarata; lungimea scrisa in fata o
   * inchide.
   */
  const amp = a({ x: { f: "numar", v: 1 } });
  assert.notEqual(
    cheieLinie("p1", "A::B", amp),
    cheieLinie("p1", "A", `B::${amp}`),
  );
});

/* ── Probe care apara CHIAR paza, nu efectul altei paze ───────────────────── */

test("sortarea din SERIALIZARE apara si un obiect construit de mana", () => {
  /*
   * ⚠ Proba de mai sus („ordinea cheilor din JSON") trece si FARA sortarea din
   * `serializeazaCanonic`, fiindca `normalizeazaValori` sorteaza el insusi cheile cand
   * construieste obiectul. Deci ea apara normalizarea, nu serializarea.
   *
   * Aici se ocoleste normalizarea si se dau doua obiecte `Valori` gata facute, cu aceleasi
   * campuri inserate in ordine diferita — cazul oricui cheama motorul direct.
   */
  const unu: Valori = { b: { f: "numar", v: 2 }, a: { f: "numar", v: 1 } };
  const doi: Valori = { a: { f: "numar", v: 1 }, b: { f: "numar", v: 2 } };
  assert.notDeepEqual(Object.keys(unu), Object.keys(doi), "ordinea de inserare chiar difera");
  assert.equal(serializeazaCanonic(unu), serializeazaCanonic(doi));
  assert.equal(amprentaConfiguratiei(unu), amprentaConfiguratiei(doi));
});

test("normalizarea chiar preface minus zero in zero", () => {
  /*
   * ⚠ Proba „minus zero e zero" de mai sus trece si fara normalizare, fiindca `String(-0)` da
   * chiar „0" in JavaScript — deci amprenta era aparata de serializare, nu de normalizare.
   * Aici se verifica valoarea insasi, cu `Object.is`, care deosebeste `-0` de `0`.
   *
   * Conteaza pentru ceilalti cititori ai lui `Valori`: comparatia a doua configuratii si
   * numerele date motorului de formule.
   */
  const v = normalizeazaValori({ x: { f: "numar", v: -0 } });
  const x = v.x as { f: "numar"; v: number };
  assert.equal(Object.is(x.v, -0), false, "minus zero nu are voie sa supravietuiasca");
  assert.equal(Object.is(x.v, 0), true);
});
