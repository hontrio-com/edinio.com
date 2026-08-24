import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  grupeaza, tiparulMesajului, VALIDARE_RA, OFERTE_PE_GRUP, type Necaz,
} from "./probleme";

/*
 * Probele centrului de probleme (§64).
 *
 * Toate pazesc acelasi rau: un centru care NU aduna nimic. Ala e mai rau decat lipsa
 * lui, fiindca arata ca o unealta si nu e — omul se uita la el, vede aceleasi treizeci
 * si opt de randuri sub alt nume, si se intoarce sa le citeasca unul cate unul.
 */

/* ── Normalizarea ──────────────────────────────────────────────────────────── */

test("eMAG probleme: doua caracteristici lipsa sunt ACELASI necaz", () => {
  /*
   * ═══ GRESEALA CARE AR FI GOLIT ECRANUL DE ORICE ROST ═══
   *
   * Mesajele lor poarta id-uri inauntru. Grupate pe textul brut, „characteristic 38"
   * si „characteristic 41" ar fi iesit doua grupuri de cate unul — adica exact lista
   * pe care centrul asta trebuie s-o inlocuiasca.
   */
  const a = tiparulMesajului("characteristic 38 (Marime) is required for category 2735");
  const b = tiparulMesajului("characteristic 41 (Culoare) is required for category 2735");
  assert.equal(a, b);
});

test("eMAG probleme: doua necazuri DIFERITE raman diferite", () => {
  /* Normalizarea n-are voie sa taie atat de mult incat sa amestece necazuri care se
     repara altfel. Un EAN gresit si o marca nerecunoscuta n-au nimic in comun. */
  const ean = tiparulMesajului("EAN 5941234567890 is invalid");
  const marca = tiparulMesajului("Brand 'Nike' is not recognized");
  assert.notEqual(ean, marca);
});

test("eMAG probleme: valorile dintre ghilimele nu despart necazul", () => {
  const a = tiparulMesajului(`Brand "Nike" is not recognized`);
  const b = tiparulMesajului(`Brand „Adidas” is not recognized`);
  assert.equal(a, b);
});

test("eMAG probleme: preturile nu despart necazul", () => {
  const a = tiparulMesajului("sale_price 129,99 is outside min_sale_price 100,00");
  const b = tiparulMesajului("sale_price 4,50 is outside min_sale_price 3,00");
  assert.equal(a, b);
});

/* ── Gruparea ──────────────────────────────────────────────────────────────── */

const NECAZ = (mesaj: string, emagId: number): Necaz => ({ sursa: "emag", mesaj, emagId });

test("eMAG probleme: treizeci si opt de oferte cu acelasi necaz dau UN grup", () => {
  const necazuri = Array.from({ length: 38 }, (_, i) =>
    NECAZ(`characteristic ${i + 10} (Ceva) is required for category 2735`, 1_000_000_000 + i));

  const g = grupeaza(necazuri);
  assert.equal(g.length, 1, "un singur grup, nu treizeci si opt de randuri");
  assert.equal(g[0].cate, 38);
});

test("eMAG probleme: grupurile ies cu cel mai des necaz PRIMUL", () => {
  /* Ordonate altfel, omul ar fi inceput reparatia cu un necaz care atinge o singura
     oferta, iar cel care atinge o suta ar fi stat mai jos, necitit. */
  const g = grupeaza([
    NECAZ("EAN 111 is invalid", 1),
    NECAZ("characteristic 38 (A) is required", 2),
    NECAZ("characteristic 41 (B) is required", 3),
    NECAZ("characteristic 42 (C) is required", 4),
  ]);
  assert.equal(g[0].cate, 3);
  assert.equal(g[1].cate, 1);
});

test("eMAG probleme: AMANUNTUL sters la normalizare se pastreaza in exemplu", () => {
  /*
   * ⚠ Fara asta, grupul ar fi spus „lipseste o caracteristica" fara sa spuna CARE —
   * si n-ar fi ajutat cu nimic. Normalizarea e pentru grupat, nu pentru aratat.
   */
  const g = grupeaza([NECAZ("characteristic 38 (Marime) is required for category 2735", 7)]);
  assert.match(g[0].exemplu, /38/);
  assert.match(g[0].exemplu, /Marime/);
});

test("eMAG probleme: un tipar NECUNOSCUT se arata cu textul lor, nu ca «altele»", () => {
  /*
   * ⚠ Un mesaj nou de-al lor e tocmai cel despre care nu stie nimeni nimic. Ascuns sub
   * „Problemă necunoscută", ar fi ramas acolo pentru totdeauna — si tocmai el ar fi
   * meritat citit.
   */
  const g = grupeaza([NECAZ("Some brand new eMAG rule nobody has seen", 3)]);
  assert.equal(g[0].titlu, "Some brand new eMAG rule nobody has seen");
});

test("eMAG probleme: sursa desparte grupurile, chiar la acelasi text", () => {
  /* „Nu s-a putut trimite, lipseste ceva la noi" si „eMAG a refuzat" se repara in
     locuri diferite. Amestecate, omul ar fi cautat in panoul gresit. */
  const g = grupeaza([
    { sursa: "edinio", mesaj: "lipseste categoria", emagId: 1 },
    { sursa: "emag", mesaj: "lipseste categoria", emagId: 2 },
  ]);
  assert.equal(g.length, 2);
});

test("eMAG probleme: se tin cateva oferte de exemplu, nu toate", () => {
  const necazuri = Array.from({ length: 300 }, (_, i) => NECAZ("acelasi necaz", i + 1));
  const g = grupeaza(necazuri);
  assert.equal(g[0].cate, 300, "se NUMARA toate");
  assert.equal(g[0].oferte.length, OFERTE_PE_GRUP, "dar se tin doar cateva pentru ecran");
});

test("eMAG probleme: un titlu gata scris bate mesajul", () => {
  const g = grupeaza([
    { sursa: "emag", cheie: "validare:5", titlu: VALIDARE_RA[5], mesaj: "brand rejected", emagId: 1 },
    { sursa: "emag", cheie: "validare:5", titlu: VALIDARE_RA[5], mesaj: "brand rejected", emagId: 2 },
  ]);
  assert.equal(g.length, 1);
  assert.equal(g[0].titlu, "Marcă respinsă de eMAG");
  assert.equal(g[0].cate, 2);
});

test("eMAG probleme: starile BUNE nu sunt probleme", () => {
  /*
   * ⚠ `1` = asteapta MKTP, `9` = aprobat, `11` = actualizare in asteptare. Puse in
   * centru, un catalog perfect sanatos ar fi aratat sute de „probleme" care nu sunt —
   * iar omul ar fi invatat sa nu se mai uite la ecranul asta deloc.
   */
  for (const bun of [1, 9, 11]) {
    assert.equal(VALIDARE_RA[bun], undefined, `starea ${bun} nu e o problema`);
  }
  for (const rau of [2, 3, 4, 5, 6, 8, 10, 12]) {
    assert.equal(typeof VALIDARE_RA[rau], "string", `starea ${rau} e o problema`);
  }
});

test("eMAG probleme: un necaz poate purta un NUMAR, nu numai unitatea", () => {
  /*
   * ⚠ Starile de validare se afla din `count` exact, fara sa se citeasca niciun rand.
   * Fara campul `cate`, un magazin cu patruzeci de mii de oferte respinse ar fi cerut
   * un tablou de patruzeci de mii de elemente identice — construit in memorie doar ca
   * gruparea sa numere pana acolo.
   */
  const g = grupeaza([
    { sursa: "emag", cheie: "validare:8", titlu: VALIDARE_RA[8], mesaj: "x", cate: 4000 },
    { sursa: "emag", cheie: "validare:8", titlu: VALIDARE_RA[8], mesaj: "x", cate: 12 },
  ]);
  assert.equal(g.length, 1);
  assert.equal(g[0].cate, 4012);
});

test("eMAG probleme: un necaz fara mesaj si fara titlu se sare, nu face grup gol", () => {
  const g = grupeaza([{ sursa: "emag", mesaj: "  ", emagId: 1 }]);
  assert.deepEqual(g, []);
});
