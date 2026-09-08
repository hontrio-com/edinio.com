import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { citesteComanda, type ComandaPepita } from "./comanda-forma";
import {
  compuneMotiv, lipsuriComandaScrisa, lipsuriLivrare, motivNelivrabila, scoateBucata,
} from "./carantina";

const STOC = "Stocul nu s-a putut scădea. Se reîncearcă automat.";
const CODURI = "Coduri fără corespondent în Edinio: ABC";

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
  const m = compuneMotiv([("x").repeat(400), ("y").repeat(400)]);
  assert.equal(m, ("x").repeat(400), "a doua bucata a fost taiata in loc sa fie lasata afara");

  const cuStoc = compuneMotiv([("x").repeat(400), STOC]) as string;
  assert.ok(cuStoc.includes(STOC), "motivul de stoc trebuie sa incapa INTREG, ca sa fie recunoscut");
  assert.equal(scoateBucata(cuStoc, STOC), ("x").repeat(400));
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
   CRONUL NU MAI COMPARA PE EGALITATE
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Plasa scaneaza sursa, si stie ce poate: spune ca hotararea cronului trece prin
   `scoateBucata`, nu ca se poarta bine. Purtarea e probata mai sus, pe valori. Ce apara e
   intoarcerea la comparatia pe egalitate, care lasa in carantina tocmai comenzile reparate.
*/

const CRON = "src/app/api/cron/pepita-stoc/route.ts";

test("⚠ cronul de stoc nu compara motivul pe egalitate", () => {
  const s = readFileSync(CRON, "utf8");
  assert.match(s, /scoateBucata\(/, "cronul nu-si mai scoate bucata din motivul compus");
  assert.match(s, /includes\(MOTIV_STOC_NEFACUT\)/, "cronul nu mai recunoaste motivul intr-un sir compus");
  /* ⚠ Orice comparatie pe egalitate, oricum s-ar chema variabila din stanga. */
  assert.ok(!/=== MOTIV_STOC_NEFACUT/.test(s),
    "comparatia pe egalitate nu recunoaste un motiv compus");
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

test("⚠ cronul de stoc nu atinge comenzile moarte", () => {
  /*
   * Comanda al carei consum a picat la sosire ramane cu `stoc_marketplace_la` NULL. Anulata
   * intre timp, `elibereaza_stoc_comanda` iese cu „necunoscut" si NU stampileaza
   * `stoc_eliberat_la`, fiindca n-are ce elibera. Deci randul ramanea in interogarea cronului
   * pentru totdeauna, si prima rulare care prindea baza sanatoasa scadea stocul pentru o
   * comanda care nu pleaca niciodata — iar cifra falsa pleca pe alte cinci canale.
   *
   * Cele doua verificari nu se acopera una pe alta, deci se cer amandoua.
   */
  const s = readFileSync(CRON, "utf8");
  assert.match(s, /orders\.status/, "cronul nu se uita la starea comenzii");
  assert.match(s, /cancelled/, "comenzile anulate nu sunt excluse");
  assert.match(s, /orders\.stoc_eliberat_la/, "comenzile cu marfa deja intoarsa pe raft nu sunt excluse");
  /* Si campurile chiar se cer: necerute, ar veni `undefined`. */
  assert.match(s, /status, stoc_marketplace_la, stoc_eliberat_la/, "citirea nu cere campurile de care atarna");
});
