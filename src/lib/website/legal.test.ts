import { strict as assert } from "node:assert";
import { test } from "node:test";
import { liniiDocument, segmenteEvidentiate, type Bloc, type DocumentLegal } from "./legal";
import { TERMENI } from "./termeni";
import { CONFIDENTIALITATE } from "./confidentialitate";
import { COOKIES } from "./cookies";

/*
 * Un document juridic se strica altfel decat codul: nu crapa, doar spune
 * altceva. Un articol sters din greseala, o numerotare care sare peste 37 sau o
 * ingrosare care rupe o fraza in doua nu produc nicio eroare — pagina se
 * randeaza frumos si gresit.
 *
 * Probele de aici pazesc exact lucrurile alea, pe TOATE TREI documentele
 * deodata: ce se strica intr-unul se strica de obicei si in celelalte, fiindca
 * trec prin acelasi randator.
 *
 * ⚠ Ce NU pot pazi: ca textul e cel primit de la client. Asta se verifica
 * comparand cu originalul, cu `scripts/tests/verifica-document-legal.mjs`.
 * Ultima rulare: Termeni 598 randuri, Confidentialitate 844, Cookies 425 —
 * zero lipsa, zero in plus, la fiecare.
 */

const DOCUMENTE: { nume: string; doc: DocumentLegal; articole: number }[] = [
  { nume: "Termeni", doc: TERMENI, articole: 50 },
  { nume: "Confidentialitate", doc: CONFIDENTIALITATE, articole: 63 },
  { nume: "Cookies", doc: COOKIES, articole: 42 },
];

function toateBlocurile(doc: DocumentLegal): Bloc[] {
  return [...doc.preambul, ...doc.sectiuni.flatMap((s) => s.blocuri)];
}

for (const { nume, doc, articole } of DOCUMENTE) {
  test(`${nume}: are ${articole} articole, numerotate fara goluri`, () => {
    assert.equal(doc.sectiuni.length, articole);
    doc.sectiuni.forEach((s, i) => {
      assert.equal(s.nr, i + 1, `articolul de pe pozitia ${i + 1} are numarul ${s.nr}`);
    });
  });

  test(`${nume}: ancorele sunt unice si utilizabile intr-o adresa`, () => {
    /* Ancora e adresa unei clauze: pe ea se pot da linkuri din email sau din
       contracte. Doua articole cu acelasi `id` inseamna ca unul devine
       inaccesibil, tacut. */
    const vazute = new Set<string>();
    for (const s of doc.sectiuni) {
      assert.ok(!vazute.has(s.id), `ancora „${s.id}" apare de doua ori`);
      vazute.add(s.id);
      assert.match(s.id, /^[a-z0-9-]+$/, `ancora „${s.id}" cere codificare in URL`);
    }
  });

  test(`${nume}: niciun bloc nu e gol si niciun articol nu e fara continut`, () => {
    for (const s of doc.sectiuni) {
      assert.ok(s.titlu.trim().length > 0, `articolul ${s.nr} n-are titlu`);
      assert.ok(s.blocuri.length > 0, `articolul ${s.nr} („${s.titlu}") e gol`);
    }
    for (const bloc of toateBlocurile(doc)) {
      switch (bloc.tip) {
        case "paragraf":
        case "accent":
        case "subtitlu":
          assert.ok(bloc.text.trim().length > 0, `bloc ${bloc.tip} gol`);
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
        case "adresa":
          assert.ok(bloc.linii.length > 0, "adresa fara randuri");
          break;
        case "email":
          assert.match(bloc.adresa, /^[^@\s]+@[^@\s]+\.[^@\s]+$/, `adresa „${bloc.adresa}" invalida`);
          break;
        case "tabel":
          assert.ok(bloc.antet.length > 0, "tabel fara antet");
          assert.ok(bloc.randuri.length > 0, "tabel fara randuri");
          break;
      }
    }
  });

  test(`${nume}: fiecare rand de tabel are exact cate celule are antetul`, () => {
    /*
     * Un rand mai scurt nu arunca: pe desktop iese o celula goala la coada, iar
     * pe telefon eticheta „Durata" ar sta deasupra scopului, adica documentul ar
     * spune altceva decat trebuie. Nimic nu s-ar plange.
     */
    for (const bloc of toateBlocurile(doc)) {
      if (bloc.tip !== "tabel") continue;
      for (const rand of bloc.randuri) {
        assert.equal(
          rand.length,
          bloc.antet.length,
          `randul „${rand[0]}" are ${rand.length} celule, antetul are ${bloc.antet.length}`,
        );
      }
    }
  });

  test(`${nume}: evidentierea nu schimba NICIODATA textul`, () => {
    /* Cea mai importanta proba din fisier. Ingrosarea se face taind fraza in
       bucati; daca lipirea la loc n-ar da exact intrarea, pagina ar afisa un
       text juridic diferit de cel primit — si nimeni n-ar observa. */
    for (const bloc of toateBlocurile(doc)) {
      if (bloc.tip !== "paragraf") continue;
      const refacut = segmenteEvidentiate(bloc.text, bloc.evidenta)
        .map((s) => s.text)
        .join("");
      assert.equal(refacut, bloc.text, `textul s-a schimbat la evidentiere: „${bloc.text}"`);
    }
  });

  test(`${nume}: fiecare termen de evidentiat chiar exista in fraza lui`, () => {
    /* O litera gresita in `evidenta` nu arunca: pur si simplu nu se ingroasa
       nimic, iar la zeci de articole nimeni nu observa ce lipseste. */
    for (const bloc of toateBlocurile(doc)) {
      if (bloc.tip !== "paragraf" || !bloc.evidenta) continue;
      for (const termen of bloc.evidenta) {
        assert.ok(
          bloc.text.includes(termen),
          `„${termen}" nu apare in fraza ${bloc.nr ?? ""} — evidentierea n-ar face nimic`,
        );
      }
    }
  });

  test(`${nume}: datele firmei apar in document`, () => {
    /*
     * ⚠ Nu e o formalitate. Datele au fost SCOASE din subsol (2026-08-10) cu
     * motivul ca apar in Politici. Paginile astea sunt singurele locuri care le
     * mai tin — iar identificarea comerciantului trebuie sa ramana accesibila,
     * inclusiv pentru procesatorii de plati.
     */
    const text = liniiDocument(doc).join("\n");
    for (const obligatoriu of [
      "VOID SFT GAMES SRL",
      "43474393",
      "J18/1054/2020",
      "Mătăsari",
      "contact@edinio.com",
      "0750 456 809",
    ]) {
      assert.ok(text.includes(obligatoriu), `„${obligatoriu}" nu mai apare in ${nume}`);
    }
  });

  test(`${nume}: extragerea textului scoate tot ce e in document`, () => {
    /*
     * `liniiDocument` e ce compara scriptul de integritate cu originalul primit
     * de la client. Daca ar uita un tip de bloc, comparatia ar raporta „lipsa"
     * pentru text care de fapt E pe pagina — sau, mai rau, ar trece cu vederea
     * text sters. Aici se verifica doar ca fiecare tip de bloc folosit chiar
     * ajunge in extragere.
     */
    const linii = liniiDocument(doc).join("\n");
    for (const bloc of toateBlocurile(doc)) {
      if (bloc.tip === "paragraf" || bloc.tip === "accent" || bloc.tip === "subtitlu") {
        assert.ok(linii.includes(bloc.text), `lipseste din extragere: „${bloc.text.slice(0, 60)}"`);
      } else if (bloc.tip === "tabel") {
        assert.ok(linii.includes(bloc.randuri[0].join(" ")), "un rand de tabel lipseste");
        if (bloc.nota) assert.ok(linii.includes(bloc.nota), "nota tabelului lipseste");
      } else if (bloc.tip === "adresa") {
        assert.ok(linii.includes(bloc.linii[0]), "o adresa lipseste");
      }
    }
  });
}

test("cele doua clauze declarate esentiale din Termeni sunt marcate ca atare", () => {
  /* Textul se declara EL INSUSI esential in articolele 11 si 34. Daca cineva
     schimba tipul blocului in „paragraf", propozitia se topeste in restul
     paginii si nu se mai vede. */
  for (const nr of [11, 34]) {
    const articol = TERMENI.sectiuni.find((s) => s.nr === nr);
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

test("distinctia de roluri din Confidentialitate ramane scoasa in evidenta", () => {
  const articol = CONFIDENTIALITATE.sectiuni.find((s) => s.nr === 4);
  assert.ok(articol);
  const accente = articol.blocuri.filter((b) => b.tip === "accent");
  assert.equal(accente.length, 1);
  assert.match(accente[0].tip === "accent" ? accente[0].text : "", /esențială/);
});

test("evidentierea marcheaza chiar bucatile cerute", () => {
  assert.deepEqual(segmenteEvidentiate("plafon de 6 luni si inca 6 luni", ["6 luni"]), [
    { text: "plafon de ", tare: false },
    { text: "6 luni", tare: true },
    { text: " si inca ", tare: false },
    { text: "6 luni", tare: true },
  ]);
});

test("un termen cu semne de regex nu arunca si nu se potriveste aiurea", () => {
  /* `evidenta` primeste text, nu tipare. Fara neutralizare, „(a)" ar fi fost
     citit ca grup de captura si ar fi rupt taierea. */
  assert.deepEqual(segmenteEvidentiate("litera (a) din lege, nu litera b", ["(a)"]), [
    { text: "litera ", tare: false },
    { text: "(a)", tare: true },
    { text: " din lege, nu litera b", tare: false },
  ]);
});

test("fara evidenta, textul iese intr-o singura bucata neingrosata", () => {
  assert.deepEqual(segmenteEvidentiate("text simplu"), [{ text: "text simplu", tare: false }]);
  assert.deepEqual(segmenteEvidentiate("text simplu", []), [{ text: "text simplu", tare: false }]);
});

test("adresa cu doua randuri iese pe doua randuri la extragere", () => {
  /* Fisa firmei tine adresa cu `\n` acolo unde documentul o rupe. Daca
     extragerea ar lipi-o, comparatia cu originalul ar raporta o diferenta
     falsa — si data viitoare cineva ar „repara" textul, nu scriptul. */
  const linii = liniiDocument({
    titlu: "T",
    actualizare: "azi",
    preambul: [],
    sectiuni: [
      {
        id: "x",
        nr: 1,
        titlu: "X",
        blocuri: [{ tip: "date", items: [{ eticheta: "Sediu", valoare: "Strada A\nOrasul B" }] }],
      },
    ],
  });
  assert.ok(linii.includes("Sediu:"));
  assert.ok(linii.includes("Strada A"));
  assert.ok(linii.includes("Orasul B"));
});
