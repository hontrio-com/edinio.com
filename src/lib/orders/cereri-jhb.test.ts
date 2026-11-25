import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { aplicaFiltreleListei, ziuaFiltrului } from "./filtrele-listei";
import { COLOANA_VERIFICARE, tabelulExportului, type ComandaExport } from "./export-comenzi";
import {
  BIFA_PUSA,
  VALOARE_MAX,
  campuriAditionaleDinConfigurare,
  campuriDeEditat,
  citesteNotele,
  noteleDupaEditare,
} from "./campuri-aditionale";

/*
 * Cererile unui magazin din 23.11.2026, partea de panou: perioada „de la / pana la” in lista de
 * comenzi si in exportul ei, coloana „Cont” cu numele titularului, „Campurile aditionale” in
 * „Editeaza comanda” si coloana „Colet cu verificare” din export. Datele sunt inventate.
 */

const citeste = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

/** Un constructor de interogare care tine minte ce i s-a cerut, in ordine. */
function interogare() {
  const cereri: string[] = [];
  const q = {
    cereri,
    eq(c: string, v: string) { cereri.push(`eq ${c} ${v}`); return q; },
    in(c: string, v: readonly string[]) { cereri.push(`in ${c} ${v.join(",")}`); return q; },
    is(c: string, v: null) { cereri.push(`is ${c} ${v}`); return q; },
    or(f: string) { cereri.push(`or ${f.slice(0, 24)}`); return q; },
    gte(c: string, v: string) { cereri.push(`gte ${c} ${v}`); return q; },
    lte(c: string, v: string) { cereri.push(`lte ${c} ${v}`); return q; },
  };
  return q;
}

describe("Perioada din lista de comenzi a panoului", () => {
  test("⚠ zilele sunt romanesti si amandoua capetele sunt incluse", () => {
    const q = aplicaFiltreleListei(interogare(), { status: "all", source: "all", q: "", deLa: "2026-11-15", panaLa: "2026-11-30" });
    assert.deepEqual(q.cereri, [
      /* Ora de iarna (UTC+2): 15.11, ora 00:00 la Bucuresti = 14.11, 22:00 UTC. */
      "gte created_at 2026-11-14T22:00:00.000Z",
      "lte created_at 2026-11-30T21:59:59.999Z",
    ]);
    /* Ora de vara (UTC+3). */
    assert.deepEqual(
      aplicaFiltreleListei(interogare(), { status: "all", source: "all", q: "", deLa: "2026-07-01" }).cereri,
      ["gte created_at 2026-06-30T21:00:00.000Z"],
    );
  });

  test("fara perioada, sau cu o zi care nu e zi, lista e cea de dinainte", () => {
    assert.deepEqual(aplicaFiltreleListei(interogare(), { status: "all", source: "all", q: "" }).cereri, []);
    assert.deepEqual(
      aplicaFiltreleListei(interogare(), { status: "all", source: "all", q: "", deLa: "ieri", panaLa: "2026-02-30" }).cereri,
      [],
    );
    assert.deepEqual(
      aplicaFiltreleListei(interogare(), { status: "shipped", source: "store", q: "", panaLa: "2026-11-30" }).cereri,
      ["eq status shipped", "is order_source->>marketplace null", "lte created_at 2026-11-30T21:59:59.999Z"],
    );
  });

  test("o grupa de stari se cere deodata, iar lista goala nu filtreaza nimic", () => {
    /* Asezarile pe grupe („De lucru” = in asteptare, confirmate, in procesare) si exportul lor trec pe aici. */
    assert.deepEqual(
      aplicaFiltreleListei(interogare(), { status: "all", source: "all", q: "", stari: ["pending", "confirmed", "processing"] }).cereri,
      ["in status pending,confirmed,processing"],
    );
    assert.deepEqual(aplicaFiltreleListei(interogare(), { status: "all", source: "all", q: "", stari: [] }).cereri, []);
  });

  test("ziua din adresa se valideaza: ce nu e zi devine „fara filtru”", () => {
    assert.equal(ziuaFiltrului("2026-11-15"), "2026-11-15");
    assert.equal(ziuaFiltrului(" 2026-11-15 "), "2026-11-15");
    for (const rau of ["", "15.11.2026", "2026-13-01", "2026-02-30", "2026-11-15'; drop table orders; --", null, undefined, 20261115, ["2026-11-15"]]) {
      assert.equal(ziuaFiltrului(rau), "", String(rau));
    }
  });

  test("⚠ pagina, lista si exportul poarta ACEEASI perioada", () => {
    const pagina = citeste("src/app/(dashboard)/dashboard/orders/page.tsx");
    assert.match(pagina, /const deLa = ziuaFiltrului\(firstParam\(sp\.de_la\)\);/);
    assert.match(pagina, /const panaLa = ziuaFiltrului\(firstParam\(sp\.pana_la\)\);/);
    assert.match(pagina, /aplicaFiltreleListei\(listQuery, \{ status, source, q, deLa, panaLa \}\)/);
    assert.match(pagina, /dateFrom=\{deLa\} dateTo=\{panaLa\}/);

    const lista = citeste("src/components/dashboard/OrdersClient.tsx");
    assert.match(lista, /filtre: \{ status: statusFilter, source: sourceFilter, q: searchQuery, deLa: dateFrom, panaLa: dateTo \}/);
    assert.match(lista, /if \(ndeLa\) params\.set\("de_la", ndeLa\);/);
    assert.match(lista, /if \(npanaLa\) params\.set\("pana_la", npanaLa\);/);
    /* Perioada intra in dependentele adresei: altfel paginarea ar fi pierdut-o. */
    assert.match(lista, /\[pathname, searchQuery, statusFilter, sourceFilter, dateFrom, dateTo, page\]/);

    const actiune = citeste("src/lib/actions/export-comenzi.actions.ts");
    assert.match(actiune, /deLa: ziuaFiltrului\(f\.deLa\),/);
    assert.match(actiune, /panaLa: ziuaFiltrului\(f\.panaLa\),/);
  });
});

describe("Coloana „Cont” din lista de comenzi", () => {
  test("arata numele titularului; emailul ramane in indiciu si ca rezerva", () => {
    const lista = citeste("src/components/dashboard/OrdersClient.tsx");
    assert.match(lista, /\{conturi\[order\.id\]\.nume \|\| conturi\[order\.id\]\.email \|\| "Cont client"\}/);
    assert.doesNotMatch(lista, /\{conturi\[order\.id\]\.email \|\| conturi\[order\.id\]\.nume/);
    assert.match(lista, /title=\{\[conturi\[order\.id\]\.email, `ID cont: \$\{conturi\[order\.id\]\.contId\}`\]\.filter\(Boolean\)\.join\(" · "\)\}/);
  });
});

describe("Campurile aditionale ale unei comenzi", () => {
  const CONFIG = {
    custom_fields: [
      { id: "cf_tara", label: "Tara", type: "text", pe_awb: true },
      { id: "cf_reper", label: " Punct reper ", type: "text", pe_awb: true },
      { id: "cf_obs", label: "Observatii", type: "textarea" },
      { id: "cf_marime", label: "Marime inel", type: "select", options: "16, 17 ,18" },
      { id: "cf_verificare", label: "Colet cu verificare", type: "checkbox" },
      { id: "cf_ciudat", label: "Fara tip", type: "culoare" },
      { label: "fara id" }, null,
    ],
  };
  const CAMPURI = campuriAditionaleDinConfigurare(CONFIG);

  test("configurarea se citeste cu forma fiecarui camp", () => {
    assert.deepEqual(CAMPURI.map((c) => [c.id, c.label, c.type, c.options.join("|"), c.peAwb]), [
      ["cf_tara", "Tara", "text", "", true],
      ["cf_reper", "Punct reper", "text", "", true],
      ["cf_obs", "Observatii", "textarea", "", false],
      ["cf_marime", "Marime inel", "select", "16|17|18", false],
      ["cf_verificare", "Colet cu verificare", "checkbox", "", false],
      ["cf_ciudat", "Fara tip", "text", "", false],
    ]);
    assert.deepEqual(campuriAditionaleDinConfigurare(null), []);
    assert.deepEqual(campuriAditionaleDinConfigurare({ custom_fields: "nu" }), []);
  });

  test("ce tine `notes`: gol, campuri sau text simplu", () => {
    assert.deepEqual(citesteNotele(null), { fel: "gol" });
    assert.deepEqual(citesteNotele("  "), { fel: "gol" });
    assert.deepEqual(citesteNotele(JSON.stringify({ cf_tara: "Romania", cf_gol: " ", cf_nr: 5 })), { fel: "campuri", valori: { cf_tara: "Romania", cf_nr: "5" } });
    assert.deepEqual(citesteNotele("Sunati inainte"), { fel: "text", text: "Sunati inainte" });
    assert.deepEqual(citesteNotele("[1,2]"), { fel: "text", text: "[1,2]" });
  });

  test("fereastra arata campurile magazinului, apoi cheile ramase de la campuri scoase din formular", () => {
    const note = citesteNotele(JSON.stringify({ cf_reper: "langa scoala", cf_sters: "valoare veche" }));
    const lista = campuriDeEditat(CAMPURI, note, () => "Camp scos din formular");
    assert.deepEqual(lista.map((c) => c.id), [...CAMPURI.map((c) => c.id), "cf_sters"]);
    assert.deepEqual(lista.at(-1), { id: "cf_sters", label: "Camp scos din formular", type: "text", options: [], peAwb: false });
    /* O comanda cu text simplu nu se editeaza pe campuri. */
    assert.deepEqual(campuriDeEditat(CAMPURI, citesteNotele("text liber"), () => "x"), []);
  });

  test("se corecteaza un camp, se adauga altul, iar cel golit iese", () => {
    const vechi = JSON.stringify({ cf_tara: "Romania", cf_reper: "langa scoala" });
    const r = noteleDupaEditare(vechi, { cf_tara: "Romania", cf_reper: "  langa   primarie ", cf_obs: "  Sunati\r\ninainte  " }, CAMPURI);
    assert.ok(r.ok && r.schimbat);
    assert.deepEqual(JSON.parse(r.note!), { cf_tara: "Romania", cf_reper: "langa primarie", cf_obs: "Sunati\ninainte" });

    const golit = noteleDupaEditare(vechi, { cf_tara: "", cf_reper: "" }, CAMPURI);
    assert.deepEqual(golit, { ok: true, note: null, schimbat: true }, "fara niciun camp, coloana ramane NULL, ca la plasare");

    assert.deepEqual(noteleDupaEditare(vechi, { cf_tara: "Romania", cf_reper: "langa scoala" }, CAMPURI), { ok: true, note: vechi, schimbat: false });
    /* Ce nu a trimis fereastra ramane cum era. */
    const partial = noteleDupaEditare(vechi, { cf_reper: "etaj 2" }, CAMPURI);
    assert.ok(partial.ok);
    assert.deepEqual(JSON.parse(partial.note!), { cf_tara: "Romania", cf_reper: "etaj 2" });
  });

  test("⚠⚠ nu se poate scrie orice cheie: numai campurile magazinului si cele deja pe comanda", () => {
    const vechi = JSON.stringify({ cf_sters: "x" });
    const r = noteleDupaEditare(vechi, { cf_sters: "y", cf_tara: "Romania", inventata: "z", __proto__: "w", constructor: "q" }, CAMPURI);
    assert.ok(r.ok);
    assert.deepEqual(JSON.parse(r.note!), { cf_sters: "y", cf_tara: "Romania" });
    for (const rau of [null, "text", 5, ["cf_tara"]]) {
      assert.deepEqual(noteleDupaEditare(vechi, rau, CAMPURI), { ok: false, error: "Date invalide." }, String(rau));
    }
  });

  test("bifa, lista si lungimea au regulile lor", () => {
    const bifat = noteleDupaEditare(null, { cf_verificare: "Da" }, CAMPURI);
    assert.ok(bifat.ok);
    assert.deepEqual(JSON.parse(bifat.note!), { cf_verificare: BIFA_PUSA });
    assert.deepEqual(noteleDupaEditare(JSON.stringify({ cf_verificare: BIFA_PUSA }), { cf_verificare: "" }, CAMPURI), { ok: true, note: null, schimbat: true });

    const lista = noteleDupaEditare(null, { cf_marime: "17" }, CAMPURI);
    assert.ok(lista.ok);
    assert.deepEqual(JSON.parse(lista.note!), { cf_marime: "17" });
    const inAfaraListei = noteleDupaEditare(null, { cf_marime: "99" }, CAMPURI);
    assert.ok(!inAfaraListei.ok && inAfaraListei.error.includes("Marime inel"));
    /* Valoarea veche, scoasa intre timp din lista, ramane daca fereastra o trimite neschimbata. */
    assert.deepEqual(noteleDupaEditare(JSON.stringify({ cf_marime: "15" }), { cf_marime: "15" }, CAMPURI), { ok: true, note: JSON.stringify({ cf_marime: "15" }), schimbat: false });

    const lung = noteleDupaEditare(null, { cf_obs: "a".repeat(VALOARE_MAX + 1) }, CAMPURI);
    assert.ok(!lung.ok && lung.error.includes("Observatii"));
    assert.ok(noteleDupaEditare(null, { cf_obs: "a".repeat(VALOARE_MAX) }, CAMPURI).ok);
  });

  test("⚠ o comanda cu mentiune scrisa ca text simplu nu se atinge", () => {
    const r = noteleDupaEditare("Sunati inainte de livrare", { cf_tara: "Romania" }, CAMPURI);
    assert.ok(!r.ok && r.error.includes("text simplu"));
  });

  test("actiunea scrie O coloana, pe comanda omului, si nu trece prin editarea mare", () => {
    const s = citeste("src/lib/actions/campuri-aditionale.actions.ts");
    assert.equal((s.match(/^export /gm) ?? []).length, 1, "un fisier „use server” expune fiecare export");
    assert.match(s, /^"use server";/);
    /* Comanda se citeste cu clientul omului (RLS), scrierea e filtrata pe id SI pe magazin. */
    assert.match(s, /await supabase\s+\.from\("orders"\)\s+\.select\("id, business_id, notes"\)\s+\.eq\("id", orderId\)/);
    assert.match(s, /\.update\(\{ notes: rez\.note \}\)\s+\.eq\("id", order\.id\)\s+\.eq\("business_id", order\.business_id\)/);
    assert.match(s, /if \(eSetari\) return \{ error:/, "fara configurare citita nu se scrie pe ghicite");
    assert.doesNotMatch(s, /updateOrderDetails\(/);

    const modal = citeste("src/components/dashboard/OrderEditModal.tsx");
    assert.match(modal, /const doarCampuri = campuriSchimbate && !alteSchimbari;/);
    assert.match(modal, /if \(!doarCampuri\) try \{\s+res = await updateOrderDetails\(order\.id,/);
    assert.match(modal, /rc = await salveazaCampurileAditionale\(/);
    assert.match(modal, /const areSchimbari = alteSchimbari \|\| campuriSchimbate;/);
    /* Panoul da ferestrei si forma campurilor, nu doar numele. */
    assert.match(citeste("src/lib/orders/detalii-pentru-awb.ts"), /\.\.\.\(typeof c\.type === "string" \? \{ type: c\.type \} : \{\}\),/);
  });
});

describe("Coloana „Colet cu verificare” din export", () => {
  const baza = (o: Partial<ComandaExport>): ComandaExport => ({
    id: "o1", order_number: "#1001", created_at: "2026-11-20T10:00:00.000Z", status: "shipped",
    payment_method: "cash_on_delivery", payment_status: "unpaid", total: "100",
    customer_name: "Ana Pop", customer_phone: "0722000000", customer_email: null,
    billing_company: null, shipping_address: { address: "Str. Mare 12", city: "Iasi", county: "Iasi" }, notes: null,
    ...o,
  });
  const COMENZI = [
    baza({ id: "a", curiera_awb_number: "711000001", curiera_servicii_extra: ["443"] }),
    baza({ id: "b", curiera_awb_number: "711000002", curiera_servicii_extra: [] }),
    baza({ id: "c", curiera_awb_number: "711000003", curiera_servicii_extra: null }),
    baza({ id: "d", dpd_awb_number: "80000000001" }),
    baza({ id: "e" }),
  ];

  test("Da / Nu / gol cand nu se stie, imediat dupa coloanele de AWB", () => {
    const t = tabelulExportului(COMENZI, {}, []);
    const i = t.antete.indexOf(COLOANA_VERIFICARE);
    assert.equal(i, t.antete.indexOf("AWB intermediar") + 1);
    assert.deepEqual(t.randuri.map((r) => r[i]), ["Da", "Nu", null, null, null]);
    assert.equal(t.latimi.length, t.antete.length);
    for (const r of t.randuri) assert.equal(r.length, t.antete.length);
    assert.equal(new Set(t.antete).size, t.antete.length);
  });

  test("⚠ fara nicio comanda la care se stie, coloana nu apare deloc", () => {
    const t = tabelulExportului([COMENZI[2], COMENZI[3], COMENZI[4]], {}, []);
    assert.equal(t.antete.includes(COLOANA_VERIFICARE), false);
    for (const r of t.randuri) assert.equal(r.length, t.antete.length);
  });

  test("un camp de formular cu acelasi nume nu dubleaza antetul", () => {
    const t = tabelulExportului(
      [baza({ id: "a", curiera_awb_number: "711000001", curiera_servicii_extra: ["443"], notes: JSON.stringify({ cf_v: "da" }) })],
      {},
      [{ id: "cf_v", label: "Colet cu verificare" }],
    );
    assert.deepEqual(t.antete.filter((a) => a.startsWith("Colet cu verificare")), ["Colet cu verificare", "Colet cu verificare (formular)"]);
  });

  test("exportul cere coloana, emiterea o scrie din parametrii trimisi, dezlegarea o goleste", () => {
    assert.match(citeste("src/lib/actions/export-comenzi.actions.ts"), /curiera_partener_awb, curiera_servicii_extra, dhl_awb_number/);
    const actiune = citeste("src/lib/actions/curiera.actions.ts");
    assert.match(actiune, /curiera_servicii_extra: serviciiExtraTrimise\(parametri\),/);
    assert.match(actiune, /curiera_partener_awb: null,\s+curiera_servicii_extra: null,/);
    const migratie = citeste("migrations/2027-02-13-curiera-servicii-extra-pe-comanda.sql");
    assert.match(migratie, /alter table public\.orders add column if not exists curiera_servicii_extra text\[\];/);
  });
});
