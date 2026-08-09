import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  segmenteEvidentiate,
  TERMENI_PREAMBUL,
  TERMENI_SECTIUNI,
  type Bloc,
} from "./termeni";

/*
 * Un document juridic se strica altfel decat codul: nu crapa, doar spune
 * altceva. Un articol sters din greseala, o numerotare care sare peste 37 sau o
 * ingrosare care rupe o fraza in doua nu produc nicio eroare — pagina se
 * randeaza frumos si gresit.
 *
 * Probele de aici pazesc exact lucrurile alea.
 */

const toateBlocurile: Bloc[] = [
  ...TERMENI_PREAMBUL,
  ...TERMENI_SECTIUNI.flatMap((s) => s.blocuri),
];

test("sunt 50 de articole, numerotate fara goluri", () => {
  assert.equal(TERMENI_SECTIUNI.length, 50);
  TERMENI_SECTIUNI.forEach((s, i) => {
    assert.equal(s.nr, i + 1, `articolul de pe pozitia ${i + 1} are numarul ${s.nr}`);
  });
});

test("ancorele sunt unice si utilizabile intr-o adresa", () => {
  /* Ancora e adresa unei clauze: pe ea se pot da linkuri din email sau din
     contracte. Doua articole cu acelasi `id` inseamna ca unul devine
     inaccesibil, tacut. */
  const vazute = new Set<string>();
  for (const s of TERMENI_SECTIUNI) {
    assert.ok(!vazute.has(s.id), `ancora „${s.id}" apare de doua ori`);
    vazute.add(s.id);
    assert.match(s.id, /^[a-z0-9-]+$/, `ancora „${s.id}" are semne care cer codificare in URL`);
  }
});

test("niciun bloc nu e gol", () => {
  for (const bloc of toateBlocurile) {
    switch (bloc.tip) {
      case "paragraf":
      case "accent":
        assert.ok(bloc.text.trim().length > 0, "paragraf gol");
        break;
      case "lista":
        assert.ok(bloc.items.length > 0, "lista fara elemente");
        assert.ok(
          bloc.items.every((i) => i.trim().length > 0),
          "element de lista gol",
        );
        break;
      case "definitii":
        assert.ok(bloc.items.length > 0, "bloc de definitii gol");
        break;
      case "date":
        assert.ok(bloc.items.length > 0, "fisa de date goala");
        break;
      case "email":
        assert.match(bloc.adresa, /^[^@\s]+@[^@\s]+\.[^@\s]+$/, `adresa „${bloc.adresa}" nu e valida`);
        break;
    }
  }
});

test("titlurile si articolele au continut", () => {
  for (const s of TERMENI_SECTIUNI) {
    assert.ok(s.titlu.trim().length > 0, `articolul ${s.nr} n-are titlu`);
    assert.ok(s.blocuri.length > 0, `articolul ${s.nr} („${s.titlu}") e gol`);
  }
});

test("datele firmei sunt in articolul 1", () => {
  /*
   * ⚠ Nu e o formalitate. Datele au fost SCOASE din subsol (2026-08-10) cu
   * motivul ca apar in Politici. Pagina asta e unul dintre cele doua locuri
   * care le mai tin, deci daca dispar de aici dispar aproape de tot de pe site
   * — iar identificarea comerciantului trebuie sa ramana accesibila, inclusiv
   * pentru procesatorii de plati.
   */
  const articol1 = TERMENI_SECTIUNI[0];
  const text = JSON.stringify(articol1);
  for (const obligatoriu of [
    "VOID SFT GAMES SRL",
    "43474393",
    "J18/1054/2020",
    "Mătăsari",
    "contact@edinio.com",
    "0750 456 809",
  ]) {
    assert.ok(text.includes(obligatoriu), `„${obligatoriu}" nu mai apare in articolul 1`);
  }
});

test("evidentierea nu schimba NICIODATA textul", () => {
  /* Cea mai importanta proba din fisier. Ingrosarea se face taind fraza in
     bucati; daca lipirea la loc n-ar da exact intrarea, pagina ar afisa un text
     juridic diferit de cel primit — si nimeni n-ar observa. */
  for (const bloc of toateBlocurile) {
    if (bloc.tip !== "paragraf") continue;
    const refacut = segmenteEvidentiate(bloc.text, bloc.evidenta)
      .map((s) => s.text)
      .join("");
    assert.equal(refacut, bloc.text, `textul s-a schimbat la evidentiere: „${bloc.text}"`);
  }
});

test("fiecare termen de evidentiat chiar exista in fraza lui", () => {
  /* O litera gresita in `evidenta` nu arunca: pur si simplu nu se ingroasa
     nimic, iar la 50 de articole nimeni nu observa ce lipseste. */
  for (const bloc of toateBlocurile) {
    if (bloc.tip !== "paragraf" || !bloc.evidenta) continue;
    for (const termen of bloc.evidenta) {
      assert.ok(
        bloc.text.includes(termen),
        `„${termen}" nu apare in fraza ${bloc.nr ?? ""} — evidentierea n-ar face nimic`,
      );
    }
  }
});

test("evidentierea marcheaza chiar bucatile cerute", () => {
  const segmente = segmenteEvidentiate("plafon de 6 luni si inca 6 luni", ["6 luni"]);
  assert.deepEqual(segmente, [
    { text: "plafon de ", tare: false },
    { text: "6 luni", tare: true },
    { text: " si inca ", tare: false },
    { text: "6 luni", tare: true },
  ]);
});

test("un termen cu semne de regex nu arunca si nu se potriveste aiurea", () => {
  /* `evidenta` primeste text, nu tipare. Fara neutralizare, „(a)" ar fi fost
     citit ca grup de captura si ar fi rupt taierea. */
  const segmente = segmenteEvidentiate("litera (a) din lege, nu litera b", ["(a)"]);
  assert.deepEqual(segmente, [
    { text: "litera ", tare: false },
    { text: "(a)", tare: true },
    { text: " din lege, nu litera b", tare: false },
  ]);
});

test("fara evidenta, textul iese intr-o singura bucata neingrosata", () => {
  assert.deepEqual(segmenteEvidentiate("text simplu"), [{ text: "text simplu", tare: false }]);
  assert.deepEqual(segmenteEvidentiate("text simplu", []), [{ text: "text simplu", tare: false }]);
});

test("cele doua clauze declarate esentiale sunt marcate ca atare", () => {
  /* Textul se declara EL INSUSI esential in articolele 11 si 34. Daca cineva
     schimba tipul blocului in „paragraf", propozitia se topeste in restul
     paginii si nu se mai vede. */
  for (const nr of [11, 34]) {
    const articol = TERMENI_SECTIUNI.find((s) => s.nr === nr);
    assert.ok(articol, `lipseste articolul ${nr}`);
    const accente = articol.blocuri.filter((b) => b.tip === "accent");
    assert.equal(accente.length, 1, `articolul ${nr} ar trebui sa aiba exact un accent`);
    assert.match(
      accente[0].tip === "accent" ? accente[0].text : "",
      /condiție esențială/,
      `accentul din articolul ${nr} nu mai e propozitia care declara clauza esentiala`,
    );
  }
});
