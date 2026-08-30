import { strict as assert } from "node:assert";
import { test } from "node:test";
import { coleteDeTrimis } from "./colete";
import { eanuriDeCautat, verdictEan } from "./ean";
import { descriereaPentruEmag } from "./descriere";
import { statusEdinio } from "./orders";
import { ziuaInTara, ziuaUrmatoareInTara } from "./auth";

/*
 * Probele reparațiilor găsite la auditul complet.
 *
 * Toate patru pazesc lucruri care NU dau nicio eroare: dimensiuni inventate, un
 * eveniment vechi care suprascrie unul nou, HTML care se desface pe pagina lor, și
 * un produs creat a doua oară în catalogul comun eMAG.
 */

/* ── §48. Unitati: cm/kg la colet, mm/g la produs ──────────────────────────── */

test("eMAG audit: fara dimensiuni NU se trimite niciun colet inventat", () => {
  /*
   * ═══ DEFECTUL GASIT LA AUDIT ═══
   *
   * Prima forma a ecranului trimitea `20 × 15 × 10` pentru ORICE colet, ca sa nu
   * ramana campul gol. Dar `packages` e folosit de eMAG la taxarea VOLUMETRICA: un
   * frigider declarat cutie de pantofi inseamna un cost calculat gresit, iar
   * diferenta o refactureaza curierul peste saptamani — cand nimeni nu mai leaga
   * suma de un camp dintr-un formular.
   *
   * `packages` e optional la ei. Cand nu stim, nu trimitem: curierul masoara oricum.
   */
  assert.equal(coleteDeTrimis(2, 1, null), undefined);
  assert.equal(coleteDeTrimis(2, 1, {}), undefined);
  assert.equal(coleteDeTrimis(2, 1, { length: 30, width: 20 }), undefined,
    "doua laturi si a treia inventata e mai rau decat nimic");
});

test("eMAG audit: greutatea se imparte pe colete, dimensiunile NU", () => {
  const c = coleteDeTrimis(6, 3, { length: 30, width: 20, height: 10 });
  assert.equal(c?.length, 3);
  assert.deepEqual(c?.[0], { weight: 2, length: 30, width: 20, height: 10 });
  assert.deepEqual(c?.[2], { weight: 2, length: 30, width: 20, height: 10 },
    "doua cutii identice cantaresc fiecare jumatate, dar fiecare e intreaga");
});

test("eMAG audit: fara greutate nu pleaca niciun colet", () => {
  assert.equal(coleteDeTrimis(0, 1, { length: 30, width: 20, height: 10 }), undefined);
  assert.equal(coleteDeTrimis(Number.NaN, 1, { length: 1, width: 1, height: 1 }), undefined);
});

/* ── §3. Produsul exista deja in catalogul lor? ────────────────────────────── */

test("eMAG audit: produs gasit si deschis => ATASARE, nu creare", () => {
  /*
   * eMAG are catalog COMUN. Trimis ca produs nou, acelasi obiect intra a doua oara
   * acolo: documentatia intra in validare manuala si sta zile, iar oferta ajunge pe
   * o pagina fara recenzii si fara vizitatori. Comerciantul vede „publicat" si nu
   * vinde nimic.
   */
  const v = verdictEan([{
    part_number_key: "D5DD9BBBM", product_name: "Tricou bumbac", brand_name: "Marca",
    category_name: "Tricouri", allow_to_add_offer: 1, vendor_has_offer: 0,
  }]);
  assert.equal(v.fel, "atasare");
  assert.equal(v.fel === "atasare" && v.part_number_key, "D5DD9BBBM");
});

test("eMAG audit: `1`, `true` si `\"1\"` inseamna toate DA", () => {
  /* Ei le trimit pe toate trei. Citit pe una singura, jumatate din produsele care se
     pot atasa ar fi fost create din nou. */
  for (const da of [1, true, "1"] as const) {
    const v = verdictEan([{ part_number_key: "X", allow_to_add_offer: da, vendor_has_offer: 0 }]);
    assert.equal(v.fel, "atasare", `allow_to_add_offer = ${JSON.stringify(da)}`);
  }
});

test("eMAG audit: pagina inchisa NU devine produs nou", () => {
  /* Produsul exista, dar eMAG nu mai accepta oferte pe el. Creat in schimb, ar fi
     exact duplicatul de care fugim — si l-ar respinge oricum. */
  const v = verdictEan([{ part_number_key: "X", product_name: "Y", allow_to_add_offer: 0 }]);
  assert.equal(v.fel, "inchis");
});

test("eMAG audit: cand avem deja oferta acolo, nu se mai creeaza nimic", () => {
  const v = verdictEan([{ part_number_key: "X", product_name: "Y", allow_to_add_offer: 1, vendor_has_offer: 1 }]);
  assert.equal(v.fel, "avem_deja");
});

test("eMAG audit: coduri care duc la pagini DIFERITE = nehotarat", () => {
  /*
   * Se intampla cand un pachet poarta si codul cutiei, si al continutului. Ales
   * primul, oferta ar fi ajuns pe pagina altui obiect — iar cumparatorul ar fi
   * primit altceva decat a vazut.
   */
  const v = verdictEan([
    { part_number_key: "A", allow_to_add_offer: 1 },
    { part_number_key: "B", allow_to_add_offer: 1 },
  ]);
  assert.equal(v.fel, "nehotarat");
  assert.equal(v.fel === "nehotarat" && v.candidati, 2);
});

test("eMAG audit: negasit => produs nou, cu documentatie", () => {
  assert.equal(verdictEan([]).fel, "produs_nou");
  assert.equal(verdictEan([{ product_name: "fara cheie" }]).fel, "produs_nou");
});

test("eMAG audit: se cauta cel mult 100 de coduri, si numai cele valide", () => {
  /* Peste 100, „extra codes are ignored with a notification message" — raspuns 200,
     coduri necautate, si nicio eroare. */
  const multe = Array.from({ length: 150 }, (_, i) => String(59412345670 + i));
  assert.equal(eanuriDeCautat(multe).length, 100);
  assert.deepEqual(eanuriDeCautat(["5 941234 567890", "5941234567890"]), ["5941234567890"],
    "acelasi cod scris in doua feluri se cauta o data");
  assert.deepEqual(eanuriDeCautat(["123", "", null, undefined]), []);
});

/* ── §24. Descrierea: „basic HTML", nu HTML-ul storefrontului ──────────────── */

test("eMAG audit: `div`, `span` si `style` NU pleaca la eMAG", () => {
  /*
   * Descrierea ajunge pe pagina LOR, cu foaia LOR de stil. `div`-urile si clasele
   * storefrontului nostru ajung acolo fara CSS-ul care le tine, iar descrierea se
   * desface: blocuri lipite, aliniere aiurea, uneori text alb pe alb. Produsul se
   * publica, arata rupt, si nimeni nu leaga forma de o integrare care „a mers".
   */
  const iesire = descriereaPentruEmag(
    '<div class="prose"><p style="color:#fff">Text</p><span>alt text</span></div>',
  );
  assert.ok(!/<div|<span|style=|class=/.test(iesire ?? ""), `a ramas ceva: ${iesire}`);
  assert.match(iesire ?? "", /Text/);
  assert.match(iesire ?? "", /alt text/, "textul ramane, doar invelisul cade");
});

test("eMAG audit: `script` si `iframe` nu trec", () => {
  const iesire = descriereaPentruEmag('<p>Bun</p><script>alert(1)</script><iframe src="x"></iframe>');
  assert.ok(!/script|iframe|alert/.test(iesire ?? ""), iesire);
  assert.match(iesire ?? "", /Bun/);
});

test("eMAG audit: marcajele care inseamna acelasi lucru oriunde raman", () => {
  const iesire = descriereaPentruEmag("<p><strong>Gros</strong> si <em>inclinat</em></p><ul><li>unu</li></ul>");
  assert.match(iesire ?? "", /<strong>Gros<\/strong>/);
  assert.match(iesire ?? "", /<em>inclinat<\/em>/);
  assert.match(iesire ?? "", /<ul><li>unu<\/li><\/ul>/);
});

test("eMAG audit: `h1` coboara la `h2`, nu se sterge", () => {
  /* Pagina lor are deja un titlu; al doilea strica structura. Dar textul din el e
     chiar ce vrea comerciantul sa spuna, deci nu se arunca. */
  const iesire = descriereaPentruEmag("<h1>Titlu</h1>");
  assert.equal(iesire, "<h2>Titlu</h2>");
});

test("eMAG audit: o descriere goala dupa filtrare iese `undefined`, nu sir gol", () => {
  /* Trimis ca sir gol, eMAG respinge campul: schema lor cere `minLength: 1`. */
  assert.equal(descriereaPentruEmag('<div class="x"></div>'), undefined);
  assert.equal(descriereaPentruEmag(null), undefined);
  assert.equal(descriereaPentruEmag(""), undefined);
});

/* ── §30. Statusurile comenzii ─────────────────────────────────────────────── */

test("eMAG audit: statusurile lor si ale noastre stau in doua straturi", () => {
  /* `emag_orders.order_status` pastreaza numarul LOR, iar `orders.status` e al
     nostru. Suprapuse, o schimbare in vocabularul oricareia dintre parti ar fi
     stricat-o pe cealalta. */
  assert.equal(statusEdinio(0), "cancelled");
  assert.equal(statusEdinio(5), "refunded");
  assert.equal(statusEdinio(99), "pending", "un status nou inventat de ei nu iese livrat");
});

/* ── §53. Data AWB-ului de retur, in fusul tarii contului ──────────────────── */

test("eMAG audit: ziua se ia din tara contului, nu din UTC", () => {
  /*
   * ═══ GASIT DE SCEPTICI, IN COD DEJA LIVRAT ═══
   *
   * `date` e OBLIGATORIU la AWB-urile de retur, iar prima forma il calcula cu
   * `new Date().toISOString().slice(0, 10)`. Masurat: la `2026-09-02T00:30` ora
   * Romaniei, UTC-ul e inca `2026-09-01T21:30`, deci iesea ZIUA DE IERI.
   *
   * Un curier chemat sa ridice marfa intre miezul noptii si ora trei ar fi primit o
   * data de ridicare IN TRECUT. eMAG o refuza, iar mesajul lor vorbeste despre un
   * camp, nu despre ceas — comerciantul ar fi vazut ca „uneori nu merge noaptea" si
   * n-ar fi avut ce sa raporteze.
   *
   * Casa invatase deja lectia la Pall-Ex (`ziuaInRomania`), dar acolo nu se putea
   * refolosi: contul poate fi unguresc, si Ungaria e pe alt fus decat Romania.
   */
  const noapte = new Date("2026-09-02T00:30:00+03:00"); // 2 septembrie, 00:30 la Bucuresti
  assert.equal(noapte.toISOString().slice(0, 10), "2026-09-01", "asa ar fi iesit gresit");
  assert.equal(ziuaInTara("ro", noapte), "2026-09-02");
  assert.equal(ziuaInTara("bg", noapte), "2026-09-02", "Bulgaria e pe acelasi fus cu Romania");
});

test("eMAG audit: Ungaria e pe ALT fus decat Romania", () => {
  /*
   * ⚠ `Europe/Budapest` e CET, cu o ora mai putin decat Bucurestiul. O singura zona
   * pentru toate trei ar fi mutat data cu o zi in Ungaria la fiecare ridicare
   * programata intre miezul noptii si ora unu.
   */
  const clipa = new Date("2026-09-02T00:30:00+03:00"); // 2 sept la Bucuresti = 1 sept, 23:30 la Budapesta
  assert.equal(ziuaInTara("ro", clipa), "2026-09-02");
  assert.equal(ziuaInTara("hu", clipa), "2026-09-01");
});

test("eMAG audit: la amiaza toate trei tarile dau aceeasi zi", () => {
  const amiaza = new Date("2026-09-02T12:00:00Z");
  for (const t of ["ro", "bg", "hu"] as const) {
    assert.equal(ziuaInTara(t, amiaza), "2026-09-02", t);
  }
});

/* ── §53. Data ridicarii la retur ────────────────────────────────── */

test("eMAG retur: data de ridicare e ZIUA URMATOARE, nu ziua de azi", () => {
  /*
   * ═══ O REGULA SCRISA IN SCHEMA LOR, PE CARE O INCALCAM ═══
   *
   * `AWBSave.date`: „Required for AWBs belonging to returns. Must be at least the
   * NEXT DAY of the AWB issuing."
   *
   * Forma dinainte punea ziua de AZI — corect in privinta fusului, gresit in privinta
   * regulii. AWB-ul de ridicare era refuzat de FIECARE data, iar mesajul lor vorbeste
   * despre un camp, nu despre regula: comerciantul ar fi vazut ca „ridicarile pur si
   * simplu nu merg", si n-ar fi avut ce sa raporteze.
   */
  const amiaza = new Date("2026-09-02T09:00:00Z");
  assert.equal(ziuaInTara("ro", amiaza), "2026-09-02", "azi");
  assert.equal(ziuaUrmatoareInTara("ro", amiaza), "2026-09-03", "maine");
});

test("eMAG retur: ziua urmatoare se socoteste peste ZIUA DIN TARA, nu peste UTC", () => {
  /*
   * ⚠ La 00:30 ora Romaniei, in UTC e inca 21:30 ziua precedenta. O zi adunata peste
   * UTC si formatata apoi in fusul lor ar fi dat tot ziua de AZI — adica exact
   * greseala reparata de `ziuaInTara`, mutata cu o zi si la fel de tacuta.
   */
  const noapte = new Date("2026-09-01T21:30:00Z"); /* 2 septembrie, 00:30 la Bucuresti */
  assert.equal(ziuaInTara("ro", noapte), "2026-09-02");
  assert.equal(ziuaUrmatoareInTara("ro", noapte), "2026-09-03");
  /* Ungaria e cu o ora in urma: acolo e inca 1 septembrie, deci maine e 2. */
  assert.equal(ziuaInTara("hu", noapte), "2026-09-01");
  assert.equal(ziuaUrmatoareInTara("hu", noapte), "2026-09-02");
});

test("eMAG retur: ziua urmatoare trece corect peste luna si peste anul bisect", () => {
  /* O adunare pe sirul de text („zi + 1") ar fi dat „2026-08-32". */
  assert.equal(ziuaUrmatoareInTara("ro", new Date("2026-08-31T09:00:00Z")), "2026-09-01");
  assert.equal(ziuaUrmatoareInTara("ro", new Date("2026-12-31T09:00:00Z")), "2027-01-01");
  assert.equal(ziuaUrmatoareInTara("ro", new Date("2028-02-28T09:00:00Z")), "2028-02-29", "2028 e bisect");
});
