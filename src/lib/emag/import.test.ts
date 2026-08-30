import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  cheieEan, cheieSku, construiesteIndex, ofertaVenita, potriveste, raportImport,
  type OfertaCunoscuta, type OfertaVenita, type RandLocal,
} from "./import";

/*
 * Probele importului din eMAG.
 *
 * Ce pazesc: fiecare fel in care o potrivire poate iesi gresit FARA sa dea vreo
 * eroare. Toate cele de mai jos ar fi trecut nevazute in productie si s-ar fi
 * aflat de la un client care a primit alt produs decat a comandat.
 */

const P1 = "11111111-1111-1111-1111-111111111111";
const P2 = "22222222-2222-2222-2222-222222222222";
const P3 = "33333333-3333-3333-3333-333333333333";

function oferta(x: Partial<OfertaVenita> & { emag_id: number }): OfertaVenita {
  return { part_number_key: null, part_number: null, ean: [], ...x };
}

/* ── Cheile ────────────────────────────────────────────────────────────────── */

test("eMAG import: UPC-12 si EAN-13 ale aceluiasi produs dau ACEEASI cheie", () => {
  /*
   * Regula GS1: codurile se compara aliniate la dreapta pe 14 semne. Comparate ca
   * text, `012345678905` si `0012345678905` sunt doua siruri diferite — si atunci
   * fiecare produs adus vreodata dintr-un catalog american si-ar fi facut duplicat
   * la primul import din eMAG.
   */
  assert.equal(cheieEan("012345678905"), cheieEan("0012345678905"));
  assert.equal(cheieEan("012345678905"), "00012345678905");
});

test("eMAG import: codul de bare se citeste si cand e scris cu spatii", () => {
  assert.equal(cheieEan("5 941234 567890"), cheieEan("5941234567890"));
});

test("eMAG import: ce nu e cod de bare nu devine cheie", () => {
  assert.equal(cheieEan(""), null);
  assert.equal(cheieEan(null), null);
  assert.equal(cheieEan("1234"), null, "prea scurt");
  assert.equal(cheieEan("123456789012345"), null, "prea lung");
  assert.equal(cheieEan("fara-cifre"), null);
});

test("eMAG import: SKU-ul nostru se recunoaste in `part_number`-ul intors de ei", () => {
  /*
   * eMAG sterge spatiile, virgula si punctul-virgula la primire. Deci ce trimitem
   * si ce ni se intoarce nu sunt acelasi text. Fara normalizare, un produs trimis
   * de noi ieri nu s-ar fi recunoscut azi si l-am fi creat a doua oara.
   */
  assert.equal(cheieSku("ABC 123, X"), cheieSku("ABC123X"));
  assert.equal(cheieSku("abc123x"), cheieSku("ABC123X"), "litera mare/mica nu deosebeste");
  assert.equal(cheieSku("   "), null);
  assert.equal(cheieSku(null), null);
});

/* ── Ierarhia de incredere ─────────────────────────────────────────────────── */

test("eMAG import: `emag_id` bate orice altceva", () => {
  const index = construiesteIndex([{ product_id: P2, variant_title: null, sku: "X", ean: "5941234567890" }]);
  const cunoscute: OfertaCunoscuta[] = [
    { emag_id: 7, product_id: P1, variant_title: null, part_number_key: null },
  ];
  const r = potriveste([oferta({ emag_id: 7, part_number: "X", ean: ["5941234567890"] })], index, cunoscute).potriviri;
  const p = r.get(7)!;
  assert.equal(p.fel, "cunoscuta");
  assert.equal(p.fel === "cunoscuta" && p.product_id, P1, "ramane pe ce s-a scris data trecuta");
});

test("eMAG import: `part_number_key` se ia inaintea EAN-ului", () => {
  const index = construiesteIndex([{ product_id: P2, variant_title: null, sku: null, ean: "5941234567890" }]);
  const cunoscute: OfertaCunoscuta[] = [
    { emag_id: 99, product_id: P1, variant_title: null, part_number_key: "D5DD9BBBM" },
  ];
  const r = potriveste(
    [oferta({ emag_id: 7, part_number_key: "D5DD9BBBM", ean: ["5941234567890"] })], index, cunoscute,
  ).potriviri;
  const p = r.get(7)!;
  assert.equal(p.fel, "legat");
  assert.equal(p.fel === "legat" && p.prin, "part_number_key");
  assert.equal(p.fel === "legat" && p.product_id, P1);
});

test("eMAG import: EAN-ul se ia inaintea SKU-ului", () => {
  const index = construiesteIndex([
    { product_id: P1, variant_title: null, sku: null, ean: "5941234567890" },
    { product_id: P2, variant_title: null, sku: "TRICOU-1", ean: null },
  ]);
  const r = potriveste([oferta({ emag_id: 7, part_number: "TRICOU-1", ean: ["5941234567890"] })], index, []).potriviri;
  const p = r.get(7)!;
  assert.equal(p.fel === "legat" && p.prin, "ean");
  assert.equal(p.fel === "legat" && p.product_id, P1);
});

/* ── Cea mai importanta: nehotararea nu se rezolva coborand ────────────────── */

test("eMAG import: EAN ambiguu NU se limpezeste cu SKU-ul — ramane nehotarat", () => {
  /*
   * ═══ PROBA CEA MAI IMPORTANTA DIN FISIER ═══
   *
   * Doua produse Edinio poarta acelasi cod de bare (se intampla: acelasi obiect
   * urcat de doua ori, sau un EAN copiat gresit). Unul dintre ele are si SKU-ul pe
   * care il poarta oferta.
   *
   * Tentatia e sa cobori la SKU si sa „rezolvi" ambiguitatea. Ar fi exact pe dos:
   * SKU-ul e cheia CEA MAI SLABA, iar folosita ca arbitru tocmai acolo unde datele
   * se contrazic, ea nu limpezeste nimic — doar ascunde contradictia. Rezultatul e
   * o legatura care arata sigura si e ghicita.
   *
   * Deci se opreste, si omul afla.
   */
  const index = construiesteIndex([
    { product_id: P1, variant_title: null, sku: "TRICOU-1", ean: "5941234567890" },
    { product_id: P2, variant_title: null, sku: null, ean: "5941234567890" },
  ]);
  const r = potriveste([oferta({ emag_id: 7, part_number: "TRICOU-1", ean: ["5941234567890"] })], index, []).potriviri;
  const p = r.get(7)!;
  assert.equal(p.fel, "nehotarat");
  assert.equal(p.fel === "nehotarat" && p.prin, "ean");
  assert.equal(p.fel === "nehotarat" && p.candidati, 2);
});

test("eMAG import: doua EAN-uri ale ACELEIASI oferte care duc in locuri diferite = nehotarat", () => {
  const index = construiesteIndex([
    { product_id: P1, variant_title: null, sku: null, ean: "5941234567890" },
    { product_id: P2, variant_title: null, sku: null, ean: "4001234567890" },
  ]);
  const r = potriveste([oferta({ emag_id: 7, ean: ["5941234567890", "4001234567890"] })], index, []).potriviri;
  assert.equal(r.get(7)!.fel, "nehotarat");
});

test("eMAG import: doua EAN-uri care duc la ACELASI lucru se leaga linistit", () => {
  const index = construiesteIndex([{ product_id: P1, variant_title: null, sku: null, ean: "5941234567890" }]);
  const r = potriveste([oferta({ emag_id: 7, ean: ["5941234567890", "5 941234 567890"] })], index, []).potriviri;
  assert.equal(r.get(7)!.fel, "legat");
});

/* ── Lipsa unei chei nu e o cheie ──────────────────────────────────────────── */

test("eMAG import: o oferta fara EAN nu se leaga de un produs fara EAN", () => {
  /*
   * `Map` primeste bucuros sirul gol drept cheie. Cautat cu el, un produs fara cod
   * de bare ar fi raspuns la o oferta fara cod de bare — si s-ar fi legat intre ele
   * lucruri care n-au nimic in comun in afara lipsei. La un catalog unde nimeni
   * n-a pus EAN-uri, TOT importul s-ar fi legat de primul produs.
   */
  const index = construiesteIndex([{ product_id: P1, variant_title: null, sku: null, ean: null }]);
  const r = potriveste([oferta({ emag_id: 7 })], index, []).potriviri;
  assert.equal(r.get(7)!.fel, "nou");
});

/* ── Un lucru nu poate avea doua oferte ────────────────────────────────────── */

test("eMAG import: a doua oferta pe acelasi produs iese «ocupat», nu darama importul", () => {
  /*
   * `emag_offers` are unic pe `(business_id, product_id, variant_title)`. Doua
   * oferte care se potrivesc pe acelasi rand ar fi cazut pe `duplicate key` la
   * scriere — si ar fi oprit IMPORTUL INTREG, nu randul acela.
   */
  const index = construiesteIndex([{ product_id: P1, variant_title: null, sku: "X", ean: "5941234567890" }]);
  const r = potriveste([
    oferta({ emag_id: 7, ean: ["5941234567890"] }),
    oferta({ emag_id: 8, ean: ["5941234567890"] }),
  ], index, []).potriviri;
  assert.equal(r.get(7)!.fel, "legat");
  assert.equal(r.get(8)!.fel, "ocupat");
});

test("eMAG import: ce s-a legat intr-o rulare trecuta ramane ocupat in urmatoarea", () => {
  const index = construiesteIndex([{ product_id: P1, variant_title: null, sku: null, ean: "5941234567890" }]);
  const cunoscute: OfertaCunoscuta[] = [
    { emag_id: 7, product_id: P1, variant_title: null, part_number_key: null },
  ];
  /* ⚠ Oferta 7 vine SI ACUM de la eMAG. Doar atat timp isi tine produsul ocupat. */
  const r = potriveste(
    [oferta({ emag_id: 7, ean: ["5941234567890"] }), oferta({ emag_id: 8, ean: ["5941234567890"] })],
    index, cunoscute,
  ).potriviri;
  assert.equal(r.get(7)!.fel, "cunoscuta");
  assert.equal(r.get(8)!.fel, "ocupat", "P1 e al ofertei 7, care inca exista");
});

test("eMAG import: oferta stearsa si refacuta in panoul eMAG se leaga, nu ramane «ocupat» pe veci", () => {
  /*
   * ═══ GASIT DE O PROBA CARE PAREA GRESITA SI NU ERA ═══
   *
   * eMAG nu ingaduie doua oferte pe aceeasi pagina de produs. Deci un
   * `part_number_key` care se repeta inseamna un singur lucru: comerciantul a sters
   * oferta din panoul lor si a facut-o din nou. Acelasi `part_number_key`, alt
   * `emag_id`.
   *
   * Randul vechi ramane insa in `emag_offers`, legat de produsul Edinio. Socotit
   * printre lucrurile vorbite, el ocupa produsul — iar oferta noua iese „ocupat", si
   * ramane asa la FIECARE import de aici incolo. Comerciantul ar fi vazut la
   * nesfarsit „nu se poate lega" pentru o oferta care e chiar a lui.
   *
   * Deci o revendicare veche tine numai cat timp oferta care o tine mai vine de la ei.
   */
  const index = construiesteIndex([{ product_id: P1, variant_title: null, sku: null, ean: "5941234567890" }]);
  const cunoscute: OfertaCunoscuta[] = [
    { emag_id: 7, product_id: P1, variant_title: null, part_number_key: "D5DD9BBBM" },
  ];
  /* Oferta 7 NU mai vine. In locul ei a venit 8, cu acelasi `part_number_key`. */
  const rez = potriveste(
    [oferta({ emag_id: 8, part_number_key: "D5DD9BBBM", ean: ["5941234567890"] })], index, cunoscute,
  );
  const p = rez.potriviri.get(8)!;
  assert.equal(p.fel, "legat");
  assert.equal(p.fel === "legat" && p.product_id, P1);
  assert.equal(p.fel === "legat" && p.prin, "part_number_key");

  /* ⚠ Randul vechi NU se sterge pe tacute — se scoate in raport si hotaraste omul. */
  assert.equal(rez.disparute.length, 1);
  assert.equal(rez.disparute[0].emag_id, 7);
});

/* ── Rezultatul nu depinde de ordinea in care sosesc paginile ──────────────── */

test("eMAG import: aceleasi oferte in alta ordine dau ACELASI rezultat", () => {
  /*
   * Cand doua oferte se bat pe acelasi produs, „prima castiga". Dar ordinea
   * paginilor lor nu e garantata de nimic. Luata cum vine, un import ar fi legat
   * oferta 8 si urmatorul oferta 7 — iar stocul ar fi sarit intre doua produse
   * fara ca cineva sa fi schimbat ceva. De aceea se sorteaza dupa `emag_id`.
   */
  const index = construiesteIndex([{ product_id: P1, variant_title: null, sku: null, ean: "5941234567890" }]);
  const a = [oferta({ emag_id: 7, ean: ["5941234567890"] }), oferta({ emag_id: 8, ean: ["5941234567890"] })];
  const b = [...a].reverse();
  const ra = potriveste(a, index, []).potriviri;
  const rb = potriveste(b, index, []).potriviri;
  assert.deepEqual(ra.get(7), rb.get(7));
  assert.deepEqual(ra.get(8), rb.get(8));
  assert.equal(ra.get(7)!.fel, "legat");
});

/* ── Combinatiile se potrivesc pe combinatie, nu pe produs ─────────────────── */

test("eMAG import: fiecare marime se leaga de marimea ei, nu de produsul intreg", () => {
  /*
   * eMAG n-are variante imbricate: S si M sunt doua oferte. Legate amandoua de
   * produs, a doua ar fi iesit „ocupat" si o marime intreaga ar fi ramas nelegata
   * — iar vanzarile ei ar fi scazut stocul altei marimi.
   */
  const randuri: RandLocal[] = [
    { product_id: P1, variant_title: "S", sku: "TR-S", ean: null },
    { product_id: P1, variant_title: "M", sku: "TR-M", ean: null },
  ];
  const r = potriveste(
    [oferta({ emag_id: 7, part_number: "TR-S" }), oferta({ emag_id: 8, part_number: "TR-M" })],
    construiesteIndex(randuri), [],
  ).potriviri;
  const s = r.get(7)!, m = r.get(8)!;
  assert.equal(s.fel, "legat");
  assert.equal(m.fel, "legat");
  assert.equal(s.fel === "legat" && s.variant_title, "S");
  assert.equal(m.fel === "legat" && m.variant_title, "M");
});

/* ── Verdictul ─────────────────────────────────────────────────────────────── */

test("eMAG import: raportul se numara din ce S-A POTRIVIT, nu din cate randuri au venit", () => {
  /*
   * Chiar defectul reparat la feedul de stocuri: verdictul se lua din numarul de
   * randuri ale fisierului, deci un feed cu 8000 de randuri din care nu se potrivea
   * NICIUNUL raporta „8000 procesate" si arata a reusita deplina.
   */
  const index = construiesteIndex([
    { product_id: P1, variant_title: null, sku: null, ean: "5941234567890" },
    { product_id: P2, variant_title: null, sku: null, ean: "4001111111111" },
    { product_id: P3, variant_title: null, sku: null, ean: "4001111111111" },
  ]);
  const r = potriveste([
    oferta({ emag_id: 7, ean: ["5941234567890"] }),     // legat
    oferta({ emag_id: 8, ean: ["5941234567890"] }),     // ocupat
    oferta({ emag_id: 9, ean: ["4001111111111"] }),     // nehotarat (P2 si P3)
    oferta({ emag_id: 10, part_number: "NECUNOSCUT" }), // nou
  ], index, []).potriviri;

  assert.deepEqual(raportImport(r), {
    citite: 4, cunoscute: 0, legate: 1, noi: 1, nehotarate: 1, ocupate: 1,
  });
});

/* ── Citirea unei oferte brute ─────────────────────────────────────────────── */

test("eMAG import: campurile goale devin `null`, nu siruri goale", () => {
  const o = ofertaVenita({ id: 5, part_number_key: "  ", part_number: "", ean: ["", "594", " "] });
  assert.equal(o.part_number_key, null);
  assert.equal(o.part_number, null);
  assert.deepEqual(o.ean, ["594"], "EAN-urile goale se scot inca de la citire");
});

/* ── Marcajul nu se scrie inaintea randurilor (24.08.2026) ─────────────────── */

test("eMAG import: `catalog_citit_la` se scrie DUPA `scrieOferte`, nu inainte", async () => {
  /*
   * ═══ PROBA UNEI ORDINI, FIINDCA ORDINEA E CHIAR REGULA ═══
   *
   * `catalog_citit_la` deschide publicarea. Prima forma il scria imediat dupa citirea
   * catalogului, cu argumentul ca el raspunde doar la „le-am vazut catalogul?”.
   *
   * Argumentul s-a darâmat in aceeasi zi: `scrieOferte` a picat pe un `ownership: true`,
   * marcajul ramasese scris, si publicarea s-a DESCHIS cu zero oferte cunoscute — adica
   * exact starea din care s-au nascut cele 208 apasari de dimineata.
   *
   * Intrebarea la care raspunde marcajul nu e „am citit”, ci „STIM ce e la ei”. A sti
   * inseamna randuri scrise, nu un tablou care a trecut prin memorie.
   *
   * ⚠ Se probeaza pe sursa, nu pe comportament, si dinadins: ordinea a doua efecte in
   * aceeasi functie nu se vede din afara decat facand sa cada chiar scrierea — adica
   * mimand PostgREST. O proba pe text prinde regresia in intregime si nu minte despre
   * ce verifica.
   */
  const { readFileSync } = await import("node:fs");
  const sursa = readFileSync("src/lib/emag/import-run.ts", "utf8");

  const scrierea = sursa.indexOf("await scrieOferte(");
  const marcajul = sursa.lastIndexOf("catalog_citit_la: new Date().toISOString()");
  assert.notEqual(scrierea, -1, "n-am gasit `scrieOferte`");
  assert.notEqual(marcajul, -1, "n-am gasit scrierea marcajului");
  assert.ok(
    scrierea < marcajul,
    "marcajul se scrie inaintea randurilor: o cadere la scriere ar deschide publicarea pe gol",
  );
});

/* ── Retragerea unui produs sters (24.08.2026) ─────────────────────────────── */

test("eMAG: ofertele se citesc INAINTE de stergerea produsului", async () => {
  /*
   * ═══ PROBA UNEI ORDINI, CA MAI SUS, SI DIN ACELASI MOTIV ═══
   *
   * `emag_offers.product_id` devine `null` la stergerea produsului (`on delete set
   * null`). Deci dupa `.from("products").delete()` nu se mai poate afla ce oferte avea:
   * legatura se rupe exact in clipa in care ne trebuie.
   *
   * ⚠ CE COSTA daca ordinea se inverseaza inapoi: comerciantul sterge produsul din
   * magazin si continua sa primeasca comenzi eMAG pentru marfa pe care n-o mai are.
   * Anularile le plateste el, in bani si in punctaj la ei.
   *
   * Se probeaza pe sursa fiindca ordinea a doua efecte in aceeasi functie nu se vede
   * din afara decat mimand PostgREST — iar o inversare e chiar felul de schimbare pe
   * care o face cineva care „mai muta un rand".
   */
  const { readFileSync } = await import("node:fs");
  const sursa = readFileSync("src/lib/actions/product.actions.ts", "utf8");

  const chemari = [...sursa.matchAll(/enqueueEmagRetragereInainteDeStergere\(/g)].map((m) => m.index ?? -1);
  const stergeri = [...sursa.matchAll(/from\("products"\)\.delete\(\)/g)].map((m) => m.index ?? -1);

  assert.equal(stergeri.length, 2, "sunt doua cai de stergere: una singura si una in masa");
  assert.equal(chemari.length, 2, "fiecare cale isi citeste ofertele inainte");

  for (const st of stergeri) {
    const inainte = chemari.filter((c) => c < st);
    assert.ok(inainte.length > 0, "o stergere fara citirea ofertelor inaintea ei");
  }

  /* ⚠ Si se ASTEAPTA: pusa cu `void`, citirea ar porni inaintea stergerii dar s-ar
     termina dupa ea, pe o legatura deja rupta. */
  assert.ok(
    !/void\s+enqueueEmagRetragereInainteDeStergere/.test(sursa),
    "citirea ofertelor nu se pune cu `void`: trebuie asteptata inaintea stergerii",
  );
});

test("eMAG cron: o retragere fara `product_id` NU se arunca din coada", async () => {
  /*
   * Retragerea unui produs sters intra ANUME cu `product_id: null` — produsul chiar nu
   * mai exista. Forma dinainte stergea orice element fara produs, fara log si fara
   * „cazut": toata logica scrisa pentru cazul asta era cod mort pe calea automata.
   */
  const { readFileSync } = await import("node:fs");
  const sursa = readFileSync("src/app/api/cron/emag-sync/route.ts", "utf8");

  const i = sursa.indexOf("if (!el.product_id) {");
  assert.notEqual(i, -1, "n-am gasit ramura elementelor fara produs");

  const ramura = sursa.slice(i, i + 900);
  assert.ok(
    ramura.includes("retragePeEmagId("),
    "ramura fara produs trebuie sa incerce retragerea dupa `emag_id`",
  );
  assert.ok(
    ramura.includes('el.op !== "retragere"'),
    "numai ce NU e retragere se arunca din coada",
  );
});
