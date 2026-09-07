import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CAMPURI, MAX_OPTIUNI,
  cerePersonalizarea, citesteImpact, laturaSchimbata, normalizeazaDefinitia,
} from "./definitie";

/**
 * Cititorul formei de personalizare.
 *
 * ⚠ CE APARA, INAINTE DE ORICE: cele 29 de produse care folosesc personalizarea AZI, in 4
 * magazine, cu 49 de campuri din care 20 obligatorii. Ele n-au fost resalvate si nu vor fi: daca
 * cititorul asta le citeste altfel decat le-a scris formularul, magazinele lor se strica fara ca
 * nimeni sa fi atins nimic.
 *
 * Tipurile folosite in productie sunt DOAR `text`, `textarea` si `image` — masurat, nu presupus.
 */

/** Forma EXACTA scrisa azi de `ProductForm`, cu cele noua chei ale ei. */
const CAMP_VECHI = {
  id: "f1",
  type: "text",
  label: "Nume gravat",
  placeholder: "Robert",
  required: true,
  max_length: 20,
  max_files: 5,
  max_file_size_mb: 10,
  helper_text: "Cel mult 20 de caractere",
};

test("⚠ LEGACY: forma de azi se citeste NEATINSA", () => {
  const d = normalizeazaDefinitia({ enabled: true, fields: [CAMP_VECHI] });
  assert.ok(d);
  const c = d.fields[0];
  assert.equal(c.id, "f1");
  assert.equal(c.type, "text");
  assert.equal(c.label, "Nume gravat");
  assert.equal(c.placeholder, "Robert");
  assert.equal(c.required, true);
  assert.equal(c.max_length, 20);
  assert.equal(c.helper_text, "Cel mult 20 de caractere");
  /* ⚠ Fara pret: un produs vechi nu devine deodata mai scump. */
  assert.equal(c.impact, undefined);
  assert.equal(d.pret, undefined);
});

test("⚠ LEGACY: cele trei tipuri folosite in productie trec toate", () => {
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "a", type: "text", label: "A", required: true, max_length: 30 },
      { id: "b", type: "textarea", label: "B", required: false, max_length: 500 },
      { id: "c", type: "image", label: "C", required: true, max_files: 3, max_file_size_mb: 8 },
    ],
  });
  assert.ok(d);
  assert.equal(d.fields.length, 3);
  assert.equal(d.fields[2].max_files, 3);
  assert.equal(d.fields[2].max_file_size_mb, 8);
});

test("⚠ `select` se CONVERTESTE in lista derulanta, nu se arunca", () => {
  /*
   * ═══ ⚠ PROBA S-A INTORS PE 07.09.2026 ═══
   *
   * Aici scria: „`select` ramane pe siruri, fara id-uri... o «modernizare» a lui ar fi fost o
   * migrare fara niciun castig." Prima parte a ramas adevarata — baza n-are niciun `select`
   * (masurat: 32 de produse cu personalizare, 0 selecturi, 0 chei `options`) —, dar concluzia s-a
   * schimbat: tocmai fiindca nu-l foloseste nimeni, se putea RETRAGE, nu doar lasat in pace.
   *
   * Auditul cerea sa fie adus la forma lui `butoane`, cu `{id, eticheta, impact}`. Asta l-ar fi
   * facut un al doilea tip identic cu `butoane`, deosebit numai prin desen — exact ce proiectul a
   * refuzat la `radio` si `checkbox`. Asa ca a devenit un STIL: „Lista derulanta".
   *
   * ⚠ SI SE CONVERTESTE, NU SE ARUNCA. Baza n-are astazi niciunul, dar o copie de siguranta sau un
   * import vechi il pot aduce inapoi. Aruncat, un „Marime" obligatoriu ar fi disparut din produs
   * fara niciun semn — si produsul s-ar fi putut comanda fara marime.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [{ id: "s", type: "select", label: "Marime", required: true, options: ["S", "M", "L"] }],
  });
  assert.ok(d);
  const c = d.fields[0];
  assert.equal(c.type, "butoane", "campul nu s-a convertit");
  /* ⚠ Desenul ramane cel de dinainte: altfel o lista de opt optiuni s-ar desface in opt butoane. */
  assert.equal(c.stil, "lista", "desenul s-a schimbat sub ochii comerciantului");
  assert.deepEqual(c.optiuni, [
    { id: "s", eticheta: "S" },
    { id: "m", eticheta: "M" },
    { id: "l", eticheta: "L" },
  ]);
});

test("⚠ id-urile convertite vin din ETICHETA, si sunt stabile", () => {
  /*
   * ⚠ NU DIN POZITIE. Un id luat din index s-ar fi mutat cand comerciantul reordoneaza optiunile,
   * iar pretul ar fi trecut tacut de pe „Premium" pe „Standard" — inclusiv pe comenzi plasate.
   */
  const cu = (options: string[]) => normalizeazaDefinitia({
    enabled: true,
    fields: [{ id: "s", type: "select", label: "M", required: true, options }],
  })!.fields[0].optiuni!;

  const a = cu(["Standard", "Premium"]);
  const b = cu(["Premium", "Standard"]);
  assert.equal(a.find((o) => o.eticheta === "Premium")!.id, b.find((o) => o.eticheta === "Premium")!.id,
    "id-ul s-a mutat odata cu randul");

  /* ⚠ Diacriticele se scot, ca in cautarea magazinului — o singura regula in proiect. */
  assert.equal(cu(["Mătase"])[0].id, "matase");

  /*
   * ⚠ SI DOUA ETICHETE CARE SE REDUC LA ACELASI SIR RAMAN DOUA OPTIUNI. Fara dezambiguizare, a
   * doua ar fi fost inghitita de prima: comerciantul scria trei optiuni si clientul vedea doua.
   */
  const gemene = cu(["Alb!", "Alb?", "Alb"]);
  assert.equal(gemene.length, 3, "o optiune s-a pierdut");
  assert.equal(new Set(gemene.map((o) => o.id)).size, 3, "doua optiuni au primit acelasi id");

  /* ⚠ Iar o eticheta din care nu ramane nicio litera capata totusi un id, nu dispare. */
  const simboluri = cu(["★", "☆"]);
  assert.equal(simboluri.length, 2);
  assert.equal(new Set(simboluri.map((o) => o.id)).size, 2);
});

test("⚠ personalizarea stinsa sau goala inseamna NIMIC", () => {
  assert.equal(normalizeazaDefinitia(null), null);
  assert.equal(normalizeazaDefinitia({ enabled: false, fields: [CAMP_VECHI] }), null);
  assert.equal(normalizeazaDefinitia({ enabled: true, fields: [] }), null);
  assert.equal(normalizeazaDefinitia({ enabled: true }), null);
  /* ⚠ Un camp pe care cititorul il arunca nu face produsul „personalizabil". */
  assert.equal(normalizeazaDefinitia({ enabled: true, fields: [{ type: "text" }] }), null);
});

test("⚠ `cerePersonalizarea` da acelasi verdict ca cititorul", () => {
  /*
   * Doua raspunsuri la aceeasi intrebare ar fi insemnat un produs care ascunde butonul de cos
   * pentru un formular care iese gol — clientul n-ar mai fi avut nicio cale sa cumpere.
   */
  assert.equal(cerePersonalizarea({ customization: { enabled: true, fields: [CAMP_VECHI] } }), true);
  assert.equal(cerePersonalizarea({ customization: { enabled: true, fields: [{ type: "text" }] } }), false);
  assert.equal(cerePersonalizarea({ customization: { enabled: false, fields: [CAMP_VECHI] } }), false);
  assert.equal(cerePersonalizarea(null), false);
  assert.equal(cerePersonalizarea({}), false);
});

test("⚠ id-urile duplicate se arunca", () => {
  /*
   * Valorile clientului se cheiesc pe `id`. Doua campuri cu acelasi id ar fi impartit o singura
   * valoare: omul completeaza al doilea camp si vede cum se schimba primul.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "x", type: "text", label: "Primul", required: false },
      { id: "x", type: "text", label: "Al doilea", required: false },
    ],
  });
  assert.ok(d);
  assert.equal(d.fields.length, 1);
  assert.equal(d.fields[0].label, "Primul");
});

test("⚠ un camp fara `id` se arunca, nu se numeroteaza dupa pozitie", () => {
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [{ type: "text", label: "Fara id", required: true }, CAMP_VECHI],
  });
  assert.ok(d);
  assert.equal(d.fields.length, 1);
  assert.equal(d.fields[0].id, "f1");
});

test("⚠ plafoanele se aplica la CITIRE, deci si pe randurile care exista deja", () => {
  const multe = Array.from({ length: MAX_CAMPURI + 20 }, (_, i) => ({
    id: `c${i}`, type: "text", label: `C${i}`, required: false,
  }));
  const d = normalizeazaDefinitia({ enabled: true, fields: multe });
  assert.equal(d?.fields.length, MAX_CAMPURI);

  const opt = Array.from({ length: MAX_OPTIUNI + 10 }, (_, i) => ({ id: `o${i}`, eticheta: `O${i}` }));
  const b = normalizeazaDefinitia({
    enabled: true,
    fields: [{ id: "b", type: "butoane", label: "B", required: true, optiuni: opt }],
  });
  assert.equal(b?.fields[0].optiuni?.length, MAX_OPTIUNI);
});

test("⚠ optiunile fara `id` se arunca; cele duplicate, la fel", () => {
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [{
      id: "b", type: "butoane", label: "Material", required: true,
      optiuni: [
        { eticheta: "Fara id" },
        { id: "std", eticheta: "Standard" },
        { id: "std", eticheta: "Standard din nou" },
      ],
    }],
  });
  assert.equal(d?.fields[0].optiuni?.length, 1);
  assert.equal(d?.fields[0].optiuni?.[0].eticheta, "Standard");
});

test("⚠ sumele negative NU devin preturi", () => {
  /*
   * O reducere pe optiune pare inofensiva, dar cu doua-trei negative pretul liniei poate cobori
   * sub zero, iar de acolo fiecare socoteala a platformei primeste un numar in care nu crede.
   */
  assert.deepEqual(citesteImpact({ fel: "fix", suma: -10 }), { fel: "fara" });
  assert.deepEqual(citesteImpact({ fel: "pe_m2", suma: -1 }), { fel: "fara" });
  assert.deepEqual(citesteImpact({ fel: "fix" }), { fel: "fara" });
  assert.deepEqual(citesteImpact({ fel: "fix", suma: "nu-i numar" }), { fel: "fara" });
  assert.deepEqual(citesteImpact({ fel: "inventat", suma: 10 }), { fel: "fara" });
  assert.deepEqual(citesteImpact(null), { fel: "fara" });
  assert.deepEqual(citesteImpact({ fel: "fix", suma: 20 }), { fel: "fix", suma: 20 });
});

test("⚠ o latura cu margini absurde se arunca, ca sa nu blocheze campul", () => {
  /*
   * Cu `min > max` nicio valoare nu trece validarea, iar clientul ramane blocat pe un camp
   * obligatoriu fara sa inteleaga de ce. Se arunca latura, si campul se poarta ca nemarginit.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [{
      id: "d", type: "dimensiuni", label: "D", required: true, unitate: "cm",
      latime: { min: 500, max: 100 },
      inaltime: { min: 70, max: 350 },
    }],
  });
  assert.equal(d?.fields[0].latime, undefined);
  assert.deepEqual(d?.fields[0].inaltime, { min: 70, max: 350 });
});

test("⚠ unitatea necunoscuta cade pe centimetri, nu pe nimic", () => {
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [{ id: "d", type: "dimensiuni", label: "D", required: true, unitate: "leghe",
      latime: { min: 1, max: 2 }, inaltime: { min: 1, max: 2 } }],
  });
  assert.equal(d?.fields[0].unitate, "cm");
});

test("⚠ pretul pe CAMP nu se citeste la `butoane` si `select`", () => {
  /*
   * Acolo alegerea e o optiune, deci pretul sta pe ea. Citit si pe camp, comerciantul ar fi putut
   * pune doua preturi pentru aceeasi alegere, si n-ar mai fi fost limpede din ecran ce se incaseaza.
   */
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "b", type: "butoane", label: "B", required: true, impact: { fel: "fix", suma: 50 },
        optiuni: [{ id: "x", eticheta: "X" }] },
      { id: "t", type: "text", label: "T", required: false, impact: { fel: "fix", suma: 20 } },
    ],
  });
  assert.equal(d?.fields[0].impact, undefined);
  assert.deepEqual(d?.fields[1].impact, { fel: "fix", suma: 20 });
});

test("⚠ nu arunca niciodata, oricat de strambe ar fi datele", () => {
  /*
   * E chemata si pe drumul comenzii. O exceptie de aici ar fi oprit o vanzare pentru un
   * `page_sections` scris gresit — adica un magazin care nu mai poate incasa, dintr-o virgula.
   */
  for (const intrare of [
    undefined, null, 0, "", "text", [], { fields: null },
    { enabled: true, fields: "nu-i tablou" },
    { enabled: true, fields: [null, undefined, 5, "x", []] },
    { enabled: true, fields: [CAMP_VECHI], pret: "stricat" },
    { enabled: true, fields: [CAMP_VECHI], pret: { fel: "suprafata" } },
  ]) {
    assert.doesNotThrow(() => normalizeazaDefinitia(intrare), `a aruncat pe ${JSON.stringify(intrare)}`);
  }
});

test("⚠ „numar” cu minimul peste maxim iese din cititor FARA margini", () => {
  /*
   * Plasa pentru randurile care ajung in baza pe alt drum decat panoul (import, scris de mana):
   * poarta de salvare le-ar fi ratat, iar produsul ar fi ramas nevandabil pentru totdeauna.
   *
   * ⚠ Se arunca AMANDOUA marginile, nu una. Pastrata singura, cealalta ar fi taiat tacut
   * jumatate din intervalul pe care comerciantul credea ca l-a pus.
   */
  const d = normalizeazaDefinitia({ enabled: true, fields: [
    { id: "n", type: "numar", label: "Bucati", required: true, min: 100, max: 10 },
  ] })!;
  assert.equal(d.fields[0].min, undefined);
  assert.equal(d.fields[0].max, undefined);

  /* Perechea: marginile bune raman. */
  const bun = normalizeazaDefinitia({ enabled: true, fields: [
    { id: "n", type: "numar", label: "Bucati", required: true, min: 10, max: 100 },
  ] })!;
  assert.equal(bun.fields[0].min, 10);
  assert.equal(bun.fields[0].max, 100);
});

test("⚠ valoarea implicita trece prin ACELEASI reguli ca valoarea clientului", () => {
  /*
   * Preumpluta cu ceva ce validarea refuza, casuta arata clientului o valoare care pica la prima
   * apasare — pe un camp pe care el nu l-a atins. Regula „e pe pas" e acum una singura
   * (`pePas`), folosita si de cititor, si de validare: scrise separat, prima nepotrivire ar fi
   * fost tocmai casuta asta.
   */
  const citeste = (extra: Record<string, unknown>) => normalizeazaDefinitia({
    enabled: true, fields: [{ id: "n", type: "numar", label: "N", required: false, ...extra }],
  })!.fields[0];

  assert.equal(citeste({ min: 10, max: 100, implicit: 5 }).implicit, undefined, "sub minim");
  assert.equal(citeste({ min: 10, max: 100, implicit: 200 }).implicit, undefined, "peste maxim");
  assert.equal(citeste({ min: 0, max: 100, pas: 10, implicit: 37 }).implicit, undefined, "nu e pe pas");
  assert.equal(citeste({ min: 0, max: 100, pas: 10, implicit: 30 }).implicit, 30);
  assert.equal(citeste({ implicit: 7 }).implicit, 7, "fara margini, orice implicit e bun");

  /* Si la laturile campului de dimensiuni, aceeasi regula. */
  const dim = normalizeazaDefinitia({ enabled: true, fields: [
    { id: "d", type: "dimensiuni", label: "D", required: false, unitate: "cm",
      latime: { min: 100, max: 500, pas: 10, implicit: 137 },
      inaltime: { min: 70, max: 350, pas: 10, implicit: 150 } },
  ] })!.fields[0];
  assert.equal(dim.latime?.implicit, undefined, "137 nu e pe pasul de 10 masurat de la 100");
  assert.equal(dim.inaltime?.implicit, 150);
});

test("⚠ sase secvente de tastare din panou: ce se trimite e ce se serveste", () => {
  /*
   * ⚠ PROBA ASTA A EXISTAT ABIA DUPA UN MUTANT. Reducerul traia intr-o componenta React, deci nu
   * se putea proba — si tocmai in el era greseala: punea `min: 0` si `max: 0` la fiecare atingere,
   * iar `citesteLatura` arunca apoi toata latura.
   *
   * Cele sase secvente sunt cele masurate pe reducerul adevarat. Fiecare se ruleaza pana la capat,
   * apoi se trece prin CITITOR — fiindca intrebarea nu e „ce obiect iese din panou", ci „ce ajunge
   * sa fie servit clientului".
   */
  const tasteaza = (pasi: Array<["min" | "max" | "implicit" | "pas", number | undefined]>) => {
    let v: Record<string, number> | undefined;
    for (const [k, val] of pasi) v = laturaSchimbata(v, k, val);
    const d = normalizeazaDefinitia({
      enabled: true,
      fields: [{ id: "d", type: "dimensiuni", label: "D", required: false, unitate: "cm",
        latime: v, inaltime: { min: 70, max: 350 } }],
    });
    return { trimis: v, servit: d?.fields[0].latime };
  };

  /* A) min apoi max — merge si azi, si trebuie sa ramana asa. */
  const a = tasteaza([["min", 100], ["max", 500]]);
  assert.deepEqual(a.trimis, { min: 100, max: 500 });
  assert.deepEqual(a.servit, { min: 100, max: 500 });

  /* B) DOAR „max" — inainte se trimitea {min:0, max:500} si nu se servea NIMIC. */
  const b = tasteaza([["max", 500]]);
  assert.deepEqual(b.trimis, { max: 500 }, "panoul fabrica iar un minim pe care nimeni nu l-a scris");

  /* D) min, max, apoi se STERGE min — cheia trebuie sa dispara, nu sa ramana `undefined`. */
  const d = tasteaza([["min", 100], ["max", 500], ["min", undefined]]);
  assert.deepEqual(d.trimis, { max: 500 });

  /*
   * F) DOAR „pas" — cazul care nu cere nicio greseala, si cel mai scump.
   * Inainte: {min:0, max:0, pas:10} -> se servea NIMIC, deci regula rolei disparea in tacere.
   */
  const f = tasteaza([["pas", 10]]);
  assert.deepEqual(f.trimis, { pas: 10 }, "panoul fabrica iar margini pe care nimeni nu le-a scris");

  /* Si golirea ultimei casute lasa latura NEEXISTENTA, nu un obiect gol. */
  assert.equal(tasteaza([["pas", 10], ["pas", undefined]]).trimis, undefined);

  /*
   * ⚠ CE RAMANE ADEVARAT: cititorul tot arunca laturile fara margini bune, si asta e deliberat —
   * el apara vanzarea. Diferenta e ca acum poarta de SALVARE o spune (vezi `salvare.test.ts`), in
   * loc s-o lase tacuta.
   */
  assert.equal(b.servit, undefined);
  assert.equal(f.servit, undefined);
});
