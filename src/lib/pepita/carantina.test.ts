import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { citesteComanda, type ComandaPepita } from "./comanda-forma";
import {
  compuneMotiv, INCEPUT_CODURI, lipsuriComandaScrisa, lipsuriLivrare, motivCoduri,
  motivNelivrabila, scoateBucata,
} from "./carantina";
/*
 * ⚠ CONSTANTELE ADEVARATE, nu copii scrise de mana. Cu o copie, o reformulare a textului
 * trecea verde aici, iar in productie cronul nu-si mai recunostea propriul motiv pe randurile
 * scrise inainte de desfasurare si nu le mai scotea din carantina niciodata.
 */
import { MOTIV_STOC_NEFACUT } from "./ingest";

const STOC = MOTIV_STOC_NEFACUT;
const CODURI = motivCoduri(["ABC"]) as string;

/* ══════════════════════════════════════════════════════════════════════════
   MOTIVELE SE ADUNA
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ un singur motiv iese EXACT cum a intrat", () => {
  /*
   * De asta atarna randurile aflate deja in carantina in productie: cronul de stoc isi
   * recunoaste motivul, iar o schimbare de forma l-ar face sa nu-l mai gaseasca niciodata.
   */
  assert.equal(compuneMotiv([STOC]), STOC);
  assert.equal(compuneMotiv([null, STOC, undefined]), STOC);
});

test("doua motive stau amandoua in sir, si niciunul nu-l sterge pe celalalt", () => {
  const m = compuneMotiv([CODURI, STOC]);
  assert.ok(m?.includes(CODURI));
  assert.ok(m?.includes(STOC));
});

test("fara niciun motiv iese null, nu sirul gol", () => {
  assert.equal(compuneMotiv([]), null);
  assert.equal(compuneMotiv([null, "", "   "]), null);
});

test("⚠ ce nu incape se ARUNCA INTREG, nu se taie prin mijloc", () => {
  /*
   * Taiat la 500 de semne, ultimul motiv devenea un ciot pe care nimeni nu-l mai recunoaste.
   * Daca ciotul era chiar motivul de stoc, cronul nu-l mai gasea si nu mai scotea comanda din
   * carantina niciodata.
   */
  const m = compuneMotiv([("x").repeat(900), ("y").repeat(900)]);
  assert.equal(m, ("x").repeat(900), "a doua bucata a fost taiata in loc sa fie lasata afara");

  const cuStoc = compuneMotiv([("x").repeat(900), STOC]) as string;
  assert.ok(cuStoc.includes(STOC), "motivul de stoc trebuie sa incapa INTREG, ca sa fie recunoscut");
  assert.equal(scoateBucata(cuStoc, STOC), ("x").repeat(900));
});

test("⚠ semnul dintre motive se scoate din bucati: altfel un nume de produs rupe motivul", () => {
  /*
   * Motivul liniilor nelegate contine nume de variante: „varianta «S | M» nu mai există".
   * Lasat asa, sirul s-ar fi rupt in doua la prima citire, iar ciotul ar fi ramas pe veci.
   */
  const m = compuneMotiv(["Coduri fără corespondent în Edinio: varianta «S | M» nu mai există", STOC]) as string;
  assert.equal(scoateBucata(m, STOC)?.includes("S / M"), true);
  assert.equal(m.split(" | ").length, 2, "motivul s-a rupt in mai multe bucati decat sunt");
});

test("⚠ cronul isi scoate DOAR bucata lui", () => {
  const m = compuneMotiv([CODURI, STOC]) as string;
  assert.equal(scoateBucata(m, STOC), CODURI, "a sters si motivul celuilalt");
  assert.equal(scoateBucata(STOC, STOC), null, "singur, motivul trebuie sa dispara de tot");
  assert.equal(scoateBucata(null, STOC), null);
  assert.equal(scoateBucata(CODURI, STOC), CODURI, "a scos ceva ce nu era acolo");
});

/* ══════════════════════════════════════════════════════════════════════════
   CE TREBUIE CA SA POTI EXPEDIA
   ══════════════════════════════════════════════════════════════════════════ */

function comanda(client: Record<string, unknown>, peste: Record<string, unknown> = {}): ComandaPepita {
  const v = citesteComanda({
    id: 1, delivery_mod: "shipping", payment_mode: "cod",
    products: [{ id: "1", sku: "S", quantity: 1, price: 10 }],
    customer: { last_name: "Pop", first_name: "Ion", phone: "0720000000",
      shipping_country: "RO", shipping_county: "Cluj", shipping_city: "Cluj-Napoca",
      shipping_street: "Str. Florilor 12", ...client },
    ...peste,
  });
  assert.equal(v.ok, true);
  return v.ok ? v.comanda : (undefined as never);
}

test("o comanda intreaga nu are nicio lipsa", () => {
  assert.deepEqual(lipsuriLivrare(comanda({})), []);
});

test("⚠ curier propriu fara telefon: AWB-ul pleaca si nu ajunge nicaieri", () => {
  assert.deepEqual(lipsuriLivrare(comanda({ phone: "" })), ["telefonul"]);
  /* Trei cifre nu sunt un numar de telefon, oricat ar arata a camp completat. */
  assert.deepEqual(lipsuriLivrare(comanda({ phone: "123" })), ["telefonul"]);
});

test("lipsurile se numesc pe rand, in ordinea din formular", () => {
  const l = lipsuriLivrare(comanda({
    last_name: "", first_name: "", phone: "", shipping_county: "", shipping_city: "", shipping_street: "",
  }));
  assert.deepEqual(l, ["numele clientului", "telefonul", "județul", "localitatea", "strada"]);
  assert.match(motivNelivrabila(l) ?? "", /lipsesc/);
  assert.match(motivNelivrabila(["telefonul"]) ?? "", /lipsește telefonul/);
  assert.equal(motivNelivrabila([]), null);
});

test("⚠ LIVRAREA PEPITEI nu cere nimic de la noi: coletul pleaca cu eticheta lor", () => {
  for (const mod of ["gls", "gls_parcelshop"]) {
    const c = comanda({ phone: "", shipping_city: "", shipping_street: "" }, { delivery_mod: mod });
    assert.deepEqual(lipsuriLivrare(c), [], `${mod}: carantina aici ar fi o alarma falsa`);
  }
});

test("⚠ datele din facturare tin loc celor de livrare: altfel carantinam ce aveam deja", () => {
  const c = comanda({
    shipping_city: "", shipping_street: "", shipping_street_address: "", shipping_house_number: "",
    billing_city: "Oradea", billing_street: "Str. Republicii 3",
  });
  assert.deepEqual(lipsuriLivrare(c), []);
});

test("judetul se cere DOAR la comenzile romanesti", () => {
  /* „only for Romanian orders", scrie in documentatia lor. */
  const ro = comanda({ shipping_county: "" });
  assert.ok(lipsuriLivrare(ro).includes("județul"));
  const hu = comanda({ shipping_county: "", shipping_country: "HU" });
  assert.ok(!lipsuriLivrare(hu).includes("județul"), "o comanda unguresca n-are judet, si e in regula");
});

/* ══════════════════════════════════════════════════════════════════════════
   CRONUL N-ARE SOCOTEALA LUI
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Pana pe 08.09.2026 cronul isi refacea singur cantitatile din `orders.items` si chema direct
   functia de consum din baza. Doua adevaruri despre aceeasi comanda, si al doilea n-avea
   niciuna dintre pazele primului: consuma A DOUA OARA o linie adaugata de mana din panou, si
   scadea stocul unei comenzi anulate inainte de orice consum. Acum cheama `reproceseaza`.

   ⚠ CE APARA PLASA, SI CE NU. Scaneaza sursa, deci spune ca nu mai exista a doua socoteala si
   ca interogarea cere si filtreaza ce trebuie. Purtarea e probata in `ingest.test.ts`, pe
   `reproceseaza`, prin baza falsa: acolo se vede ce se scade si ce nu.
*/

const CRON = "src/app/api/cron/pepita-stoc/route.ts";
/* Comentariile se scot INTAI: plasa a cazut deja o data pe chiar nota care apara regula. */
const SURSA_CRON = readFileSync(CRON, "utf8")
  .replace(/[/][*][^]*?[*][/]/g, " ")
  .replace(/^\s*[/][/].*$/gm, " ");

test("⚠ cronul nu-si mai face socoteala lui: cheama `reproceseaza`", () => {
  assert.match(SURSA_CRON, /reproceseaza\(/, "cronul nu mai trece prin socoteala comuna");
  assert.ok(!/\.rpc\(/.test(SURSA_CRON), "cronul cheama direct o functie din baza: a doua socoteala");
  assert.ok(!/consuma_stoc_comanda_marketplace/.test(SURSA_CRON), "cronul consuma stoc pe cont propriu");
});

test("⚠ roata cronului se invarte: randul atins trece la coada, oricare ar fi verdictul", () => {
  /*
   * Un rand iese din interogarea cronului doar cand i se pune `stoc_marketplace_la`. Dar
   * reprocesarea are verdicte care NU ating stocul dinadins: liniile care nu mai corespund cu ce
   * ne-au trimis ei, sau o legatura pierduta. Ordonat dupa clipa sosirii, un asemenea rand e
   * mereu primul si mananca la nesfarsit din cele 50 de locuri; cu 50 de astfel de randuri,
   * cronul nu mai ajunge NICIODATA la comanda al carei stoc chiar a picat.
   *
   * Aceeasi lectie ca la rotatiile celorlalte cozi: roata se invarte pe campul NOSTRU.
   */
  assert.match(SURSA_CRON, /\.order\("prelucrat_la"/, "roata se invarte pe clipa sosirii, deci nu se invarte");
  assert.ok(!/\.order\("primit_la"\)/.test(SURSA_CRON), "a ramas ordonarea dupa clipa sosirii");
  assert.match(SURSA_CRON, /trecutPrin\(/, "randul atins nu se mai stampileaza");
});

test("⚠ cronul stampileaza randul pe FIECARE drum de iesire, nu doar pe cele de refuz", () => {
  /*
   * Roata se invarte doar daca randul atins primeste `prelucrat_la` ORICE s-ar intampla cu el.
   * Doua din patru iesiri nu-l scriau si se bizuiau pe scrierea din `reproceseaza` — care are
   * ea insasi o iesire timpurie, pe „comanda nu mai are nimic de reparat", inainte de ea.
   *
   * ⚠ Se cere `finally`, nu un numar de apeluri: numarand apelurile, proba ramanea verde chiar
   * cu un drum nestampilat.
   */
  const i = SURSA_CRON.indexOf("for (const r of randuri)");
  assert.ok(i > 0, "bucla cronului nu se mai gaseste");
  const bucla = SURSA_CRON.slice(i);
  assert.match(bucla, /finally {[^}]*trecutPrin\(/, "stampila nu e pe un drum care se face oricum");
  /* Si nicaieri altundeva: pusa si pe drumuri, s-ar scrie de doua ori si ar parea ca e nevoie. */
  assert.equal((bucla.match(/trecutPrin\(/g) ?? []).length, 1, "stampila se scrie pe mai multe drumuri");
});

test("⚠ cronul nu atinge comenzile moarte, si CERE campurile de care atarna", () => {
  assert.match(SURSA_CRON, /status, stoc_marketplace_la, stoc_eliberat_la/, "citirea nu cere campurile");
  assert.match(SURSA_CRON, /orders\.status/, "nu se uita la starea comenzii");
  assert.match(SURSA_CRON, /cancelled/, "comenzile anulate nu sunt excluse");
  assert.match(SURSA_CRON, /orders\.stoc_eliberat_la/, "comenzile cu marfa intoarsa pe raft nu sunt excluse");
});

/* ══════════════════════════════════════════════════════════════════════════
   ACELEASI LIPSURI, CITITE DIN COMANDA SCRISA
   ══════════════════════════════════════════════════════════════════════════

   ⚠ De asta atarna butonul „Reprocesează". Sarcina bruta nu se pastreaza nicaieri, dinadins,
   deci dupa ce comerciantul completeaza adresa, adevarul e pe comanda. Daca cele doua adaptoare
   ar raspunde diferit pentru aceeasi comanda, butonul n-ar scoate-o niciodata din carantina.
*/

const COMANDA_INTREAGA = {
  customer_name: "Ion Pop",
  customer_phone: "0720000000",
  shipping_address: { address: "Str. Florilor 12", city: "Cluj-Napoca", county: "Cluj", country: "RO" },
  order_source: { marketplace: "pepita", livrare_pepita: false },
};

test("comanda scrisa si intreaga nu are nicio lipsa", () => {
  assert.deepEqual(lipsuriComandaScrisa(COMANDA_INTREAGA), []);
});

test("⚠ lipsurile din comanda scrisa sunt ACELEASI cu cele din sarcina lor", () => {
  /*
   * Aceeasi comanda, citita pe cele doua drumuri, trebuie sa dea acelasi raspuns. Fara proba
   * asta, `lipsuriComandaScrisa` putea intoarce `[]` mereu si nimeni n-ar fi aflat.
   */
  const dinSarcina = lipsuriLivrare(comanda({
    last_name: "", first_name: "", phone: "", shipping_county: "", shipping_city: "", shipping_street: "",
  }));
  const dinComanda = lipsuriComandaScrisa({
    customer_name: "",
    customer_phone: "",
    shipping_address: { address: "", city: "", county: "", country: "RO" },
    order_source: { marketplace: "pepita", livrare_pepita: false },
  });
  assert.deepEqual(dinComanda, dinSarcina);
});

test("⚠ pe comanda scrisa, livrarea Pepitei se citeste din `order_source`", () => {
  /*
   * Modul de livrare nu se mai are de unde recalcula: sarcina bruta nu se pastreaza. Semnul e
   * pus pe comanda la ingest, si tot de acolo se citeste.
   */
  const gol = { customer_name: "", customer_phone: "", shipping_address: {} };
  assert.equal(lipsuriComandaScrisa({ ...gol, order_source: { livrare_pepita: true } }).length, 0);
  assert.ok(lipsuriComandaScrisa({ ...gol, order_source: { livrare_pepita: false } }).length > 0);
  /* ⚠ Comenzile scrise INAINTE de reparatia asta n-au deloc campul: se poarta ca la curier propriu. */
  assert.ok(lipsuriComandaScrisa({ ...gol, order_source: { marketplace: "pepita" } }).length > 0);
});

test("campurile care nu sunt text nu trec drept completate", () => {
  const l = lipsuriComandaScrisa({
    customer_name: null,
    customer_phone: null,
    shipping_address: { address: 12, city: null, county: undefined, country: "RO" },
    order_source: null,
  });
  assert.deepEqual(l, ["numele clientului", "telefonul", "județul", "localitatea", "strada"]);
});

test("⚠ o comanda de dinaintea acestei versiuni se recunoaste tot ca livrare Pepita", async () => {
  /*
   * `livrare_pepita` se scrie abia de la ingestul din 08.09.2026. Comenzile mai vechi au doar
   * `pepita_delivery_mode`. Fara caderea pe el, o comanda Pepita Delivery ramasa in carantina de
   * pe versiunea veche s-ar purta ca una cu curier propriu, iar la automatul de colet adresa
   * lipseste PE DREPT: n-ar iesi din carantina niciodata, oricat ar repara comerciantul.
   */
  const veche = {
    customer_name: "", customer_phone: "",
    shipping_address: {},
    order_source: { marketplace: "pepita", pepita_delivery_mode: "gls_parcelshop" },
  };
  assert.deepEqual(lipsuriComandaScrisa(veche), []);

  /* Iar una veche cu curier propriu ramane cu lipsurile ei. */
  const vecheProprie = { ...veche, order_source: { marketplace: "pepita", pepita_delivery_mode: "shipping" } };
  assert.ok(lipsuriComandaScrisa(vecheProprie).length > 0);
});

test("⚠ lista de coduri se margineste SINGURA, ca sa nu impinga afara celelalte motive", () => {
  /*
   * Textul per linie nelegata a crescut de la un cod (~10 semne) la o propozitie intreaga
   * („ABC (varianta «Rosu» nu mai există la produsul Set de ustensile)"). Patru linii umpleau
   * singure tot motivul, si impingeau afara avertismentul de moneda sau pe cel de STOC — iar
   * fara motivul de stoc, cronul nu mai recunoaste randul si comanda ramane in carantina pe vecie.
   */
  const multe = Array.from({ length: 40 }, (_, i) => `COD-${i} (varianta «Rosu aprins» nu mai există la produsul Set de ustensile pentru grătar, 12 piese)`);
  const m = compuneMotiv([motivCoduri(multe), MOTIV_STOC_NEFACUT]) as string;

  assert.ok(m.startsWith(INCEPUT_CODURI));
  assert.match(m, /și încă \d+/, "lista nu s-a marginit");
  assert.ok(m.length <= 1000, `motivul are ${m.length} semne`);
  assert.ok(m.includes(MOTIV_STOC_NEFACUT), "motivul de stoc a fost impins afara: cronul nu-l mai gaseste");
  assert.equal(scoateBucata(m, MOTIV_STOC_NEFACUT)?.startsWith(INCEPUT_CODURI), true);
});
