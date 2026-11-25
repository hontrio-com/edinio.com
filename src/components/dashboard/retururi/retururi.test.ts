import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { comandaDinRand, FARA_INTEGRARI } from "@/components/dashboard/comenzi/date";
import { aplicaActiunea, cerereDinRand, STARI_AFISATE, type CerereRetur, type StareLista } from "./date";
import { adresaFiltrelor, areFiltre, FILE_RETUR, FILTRE_GOALE, filtreDinAdresa, STARI_RETUR, type StareRetur } from "./filtre";

/*
  Pagina de Retururi (25.11.2026): filtrele din adresa, forma unei cereri si ce se intampla cu
  lista cand omul apasa un buton, in clipa dintre apasare si raspunsul serverului.

  Ce pazesc probele: numarul de pe o fila e numarul cererilor din lista ei, si atunci cand lista
  abia s-a schimbat pe ecran. Proprietarul a prins exact asta la prototipul Comenzilor („De ce in
  dreptul la Rambursate apare 14 dar daca dau pe el apare Nicio comanda?").
*/

/* ── Filtrele din adresa ──────────────────────────────────────────────────── */

test("filtrele se citesc din adresa, iar o stare necunoscuta nu ajunge in interogare", () => {
  assert.deepEqual(filtreDinAdresa({}), FILTRE_GOALE);
  assert.deepEqual(
    filtreDinAdresa({ q: " 1331 ", status: "aprobat", de_la: "2026-11-01", pana_la: "2026-11-24", page: "2" }),
    { q: "1331", status: "aprobat", deLa: "2026-11-01", panaLa: "2026-11-24", page: 2 },
  );
  for (const rau of ["Aprobat", "sters", "nou;drop", ""]) assert.equal(filtreDinAdresa({ status: rau }).status, "all", rau);
});

test("adresa unei stari se citeste inapoi la fel, iar implicitul nu se scrie", () => {
  assert.equal(adresaFiltrelor("/dashboard/returns", FILTRE_GOALE), "/dashboard/returns");
  const f = { q: "ana", status: "nou" as const, deLa: "2026-11-01", panaLa: "", page: 3 };
  const adresa = adresaFiltrelor("/dashboard/returns", f);
  assert.equal(adresa, "/dashboard/returns?q=ana&status=nou&de_la=2026-11-01&page=3");
  assert.deepEqual(filtreDinAdresa(Object.fromEntries(new URLSearchParams(adresa.split("?")[1]))), f);
  assert.equal(areFiltre(FILTRE_GOALE), false);
  assert.equal(areFiltre({ ...FILTRE_GOALE, page: 4 }), false);
  assert.equal(areFiltre({ ...FILTRE_GOALE, status: "respins" }), true);
});

test("⚠ starile listei sunt cele pe care le primeste actiunea de server, toate cu fila si cu nume", () => {
  const actiune = readFileSync("src/lib/actions/return.actions.ts", "utf8");
  const dinActiune = actiune.match(/const RETURN_STATUSES = \[([^\]]+)\] as const;/)?.[1].split(",").map((s) => s.trim().replace(/"/g, ""));
  assert.deepEqual(dinActiune, [...STARI_RETUR]);
  /* Fiecare stare are o fila si un nume aratat; „Toate" e prima fila. */
  assert.deepEqual(FILE_RETUR.map((f) => f.cheie).filter((c) => c !== "all").sort(), [...STARI_RETUR].sort());
  assert.equal(FILE_RETUR[0].cheie, "all");
  for (const s of STARI_RETUR) assert.ok(STARI_AFISATE[s].eticheta.length > 0, s);
});

/* ── Forma unei cereri ────────────────────────────────────────────────────── */

const RAND = {
  id: "r1", order_id: "o1", order_number: "#1331", customer_name: " Ana Pop ", customer_email: "ana@exemplu.ro", customer_phone: "0722000111",
  items: [
    { product_id: "p1", name: "Pernă decorativă", quantity: 2, price: 19.99 },
    { product_id: "p2", name: "Veioză", quantity: 1, price: 20 },
  ],
  reason: "Nu se potrivește.", refund_method: "iban", refund_iban: "RO49AAAA1B31007593840000", status: "nou", is_read: false, created_at: "2026-11-24T09:15:00Z",
};

test("un rand din baza ajunge cerere: produse cu poze, valoarea adunata in bani, starea cu nume", () => {
  const c = cerereDinRand(RAND, { p1: "/poza-1.webp" }, {});
  assert.equal(c.numarComanda, "#1331");
  assert.equal(c.idComanda, "o1");
  assert.equal(c.citit, false);
  assert.deepEqual(c.client, { nume: "Ana Pop", telefon: "0722000111", email: "ana@exemplu.ro" });
  assert.deepEqual(c.produse.map((p) => p.poza), ["/poza-1.webp", null]);
  assert.equal(c.bucati, 3);
  /* 2 × 19,99 + 20 = 59,98. Adunat ca fractii iese 59,980000000000004. */
  assert.equal(c.valoare, 59.98);
  assert.deepEqual(c.status, { cheie: "nou", eticheta: "Nouă", ton: "asteptare" });
  assert.deepEqual(c.rambursare, { fel: "iban", eticheta: "Transfer bancar", scurt: "Transfer bancar", iban: "RO49AAAA1B31007593840000" });
  /* Comanda nu mai exista (sau n-a fost citita): cererea se arata si fara ea. */
  assert.equal(c.comanda, null);
});

test("o stare necunoscuta se arata ca noua, o metoda necunoscuta isi arata cheia, lipsurile nu strica nimic", () => {
  const c = cerereDinRand({ id: "r2", status: "arhivat", refund_method: "voucher", items: null, created_at: "2026-11-24T09:15:00Z" }, {}, {});
  assert.equal(c.status.cheie, "nou");
  assert.deepEqual(c.rambursare, { fel: "voucher", eticheta: "voucher", scurt: "voucher", iban: null });
  assert.deepEqual(c.produse, []);
  assert.equal(c.valoare, 0);
  assert.equal(c.idComanda, null);
  assert.equal(cerereDinRand({ id: "r3", created_at: "x" }, {}, {}).rambursare.eticheta, "Nespecificată");
  /* O linie fara cantitate e o bucata, nu zero. */
  assert.equal(cerereDinRand({ id: "r4", items: [{ name: "X", price: 10 }], created_at: "x" }, {}, {}).bucati, 1);
});

test("din comanda cererii se citesc plata, totalul si documentul", () => {
  const comanda = comandaDinRand(
    { id: "o1", order_number: "#1331", created_at: "2026-11-20T10:00:00Z", status: "delivered", total: "163.98", payment_method: "netopia", payment_status: "refunded",
      smartbill_invoice_series: "EDI", smartbill_invoice_number: "0042", items: [] },
    FARA_INTEGRARI,
    {},
  );
  const c = cerereDinRand(RAND, {}, { o1: comanda });
  assert.deepEqual(c.comanda, {
    plata: "Card", plataRambursata: true, total: 163.98, moneda: "lei",
    document: { fel: "factura", casa: "smartbill", numar: "EDI 0042" },
  });
});

/* ── Ce face o apasare cu lista, pana raspunde serverul ───────────────────── */

const cerere = (id: string, stare: StareRetur, citit = false): CerereRetur => ({
  ...cerereDinRand({ ...RAND, id, status: stare, is_read: citit }, {}, {}),
});
const stareLista = (): StareLista => ({
  cereri: [cerere("a", "nou"), cerere("b", "nou", true), cerere("c", "aprobat", true)],
  numarari: { nou: 2, aprobat: 1, respins: 0, rambursat: 4 },
  total: 7,
  totalFiltru: 7,
});
const sumaFilelor = (s: StareLista) => Object.values(s.numarari).reduce((a, n) => a + n, 0);

test("⚠ aprobata din „Toate”: randul isi schimba starea si se muta numerele de pe file", () => {
  const s = aplicaActiunea(stareLista(), { tip: "stare", id: "a", stare: "aprobat" }, "all");
  assert.deepEqual(s.cereri.map((r) => [r.id, r.status.cheie]), [["a", "aprobat"], ["b", "nou"], ["c", "aprobat"]]);
  assert.equal(s.cereri[0].status.eticheta, "Aprobată");
  assert.deepEqual(s.numarari, { nou: 1, aprobat: 2, respins: 0, rambursat: 4 });
  /* Nimic n-a plecat si nimic n-a aparut: totalurile raman. */
  assert.equal(s.total, 7);
  assert.equal(s.totalFiltru, 7);
  assert.equal(sumaFilelor(s), 7);
});

test("⚠ aprobata din fila „Noi”: cererea pleaca din lista, iar fila scade odata cu ea", () => {
  const inainte: StareLista = { ...stareLista(), cereri: [cerere("a", "nou"), cerere("b", "nou", true)], totalFiltru: 2 };
  const s = aplicaActiunea(inainte, { tip: "stare", id: "a", stare: "aprobat" }, "nou");
  assert.deepEqual(s.cereri.map((r) => r.id), ["b"]);
  assert.equal(s.numarari.nou, 1);
  assert.equal(s.numarari.aprobat, 2);
  /* Numarul filei e numarul listei ei. */
  assert.equal(s.totalFiltru, 1);
  assert.equal(s.numarari.nou, s.cereri.length);
  assert.equal(s.total, 7);
});

test("mutata in chiar starea filei pe care e omul, cererea ramane in lista", () => {
  const inainte: StareLista = { ...stareLista(), cereri: [cerere("c", "aprobat", true)], totalFiltru: 1 };
  const s = aplicaActiunea(inainte, { tip: "stare", id: "c", stare: "aprobat" }, "aprobat");
  /* Aceeasi stare: nimic de facut, deci chiar acelasi obiect (nicio redesenare). */
  assert.equal(s, inainte);
});

test("⚠ o cerere careia i s-a hotarat starea devine si citita, ca in baza", () => {
  const s = aplicaActiunea(stareLista(), { tip: "stare", id: "a", stare: "respins" }, "all");
  assert.equal(s.cereri.find((r) => r.id === "a")?.citit, true);
  /* Aceeasi regula o scrie si actiunea de server: altfel ecranul si baza s-ar desparti la prima reincarcare. */
  const actiune = readFileSync("src/lib/actions/return.actions.ts", "utf8");
  assert.ok(actiune.includes(".update({ status, is_read: true, updated_at: new Date().toISOString() })"));
});

test("citit si necitit schimba doar semnul randului, niciun numar", () => {
  const inainte = stareLista();
  const s = aplicaActiunea(inainte, { tip: "citit", id: "a", citit: true }, "all");
  assert.equal(s.cereri.find((r) => r.id === "a")?.citit, true);
  assert.deepEqual(s.numarari, inainte.numarari);
  assert.equal(s.total, 7);
  assert.equal(aplicaActiunea(s, { tip: "citit", id: "a", citit: false }, "all").cereri[0].citit, false);
});

test("⚠ stergerea scoate randul si scade fila lui, totalul magazinului si totalul filtrului", () => {
  const s = aplicaActiunea(stareLista(), { tip: "sterge", id: "c" }, "all");
  assert.deepEqual(s.cereri.map((r) => r.id), ["a", "b"]);
  assert.deepEqual(s.numarari, { nou: 2, aprobat: 0, respins: 0, rambursat: 4 });
  assert.equal(s.total, 6);
  assert.equal(s.totalFiltru, 6);
  assert.equal(sumaFilelor(s), s.total);
});

test("o cerere care nu e pe pagina nu schimba nimic, iar numerele nu coboara sub zero", () => {
  const inainte = stareLista();
  assert.equal(aplicaActiunea(inainte, { tip: "sterge", id: "nu-exista" }, "all"), inainte);
  const goala: StareLista = { cereri: [cerere("a", "nou")], numarari: {}, total: 0, totalFiltru: 0 };
  const s = aplicaActiunea(goala, { tip: "sterge", id: "a" }, "all");
  assert.equal(s.numarari.nou, 0);
  assert.equal(s.total, 0);
  assert.equal(s.totalFiltru, 0);
});

test("lista primita nu e schimbata: React o tine drept starea de la server", () => {
  const inainte = stareLista();
  const copie = JSON.parse(JSON.stringify(inainte));
  aplicaActiunea(inainte, { tip: "stare", id: "a", stare: "aprobat" }, "nou");
  aplicaActiunea(inainte, { tip: "sterge", id: "b" }, "all");
  assert.deepEqual(JSON.parse(JSON.stringify(inainte)), copie);
});

/* ── Sursa paginii si a listei ────────────────────────────────────────────── */

const PAGINA = readFileSync("src/app/(dashboard)/dashboard/returns/page.tsx", "utf8").replace(/\r\n/g, "\n");
const LISTA = readFileSync("src/components/dashboard/retururi/ListaRetururi.tsx", "utf8").replace(/\r\n/g, "\n");
const PIESE = readFileSync("src/components/dashboard/retururi/piese.tsx", "utf8").replace(/\r\n/g, "\n");

test("⚠ numaratoarea si pagina primesc ACELEASI filtre, si se numara inainte de a cere pagina", () => {
  assert.ok(PAGINA.includes('await cuFiltre(cereri().select("id", { count: "exact", head: true }).eq("business_id", idMagazin), filtre)'));
  assert.ok(PAGINA.includes('await cuFiltre(cereri().select(COLOANE_RETUR).eq("business_id", idMagazin), filtre)'));
  /* Intai numarul, apoi fereastra stransa la el: un `?page=` prea mare ar primi 416 si ar pierde numarul. */
  assert.ok(PAGINA.indexOf("const fereastra = fereastraPaginii(filtre.page, total, PE_PAGINA);") < PAGINA.indexOf(".range(fereastra.deLa, fereastra.panaLa)"));
  assert.ok(PAGINA.includes("const term = orSafeTerm(f.q);"));
});

test("⚠ fiecare citire e legata de magazin: cererile, comenzile lor si pozele produselor", () => {
  const citiri = PAGINA.split("cereri().select(").slice(1);
  assert.ok(citiri.length >= 4);
  assert.equal(citiri.filter((b) => !b.slice(0, 120).includes('.eq("business_id", idMagazin)')).length, 0);
  assert.ok(PAGINA.includes('supabase.from("orders").select(ce).eq("business_id", idMagazin).in("id", grup)'));
  assert.ok(PAGINA.includes("pozeleProduselor(supabase, lista.randuri, idMagazin)"));
});

test("⚠ cele trei scrieri trec prin actiunile de server, cu apelul singur in `try`", () => {
  for (const actiune of ["updateReturnStatus(r.id, stare)", "toggleReturnRead(r.id, !r.citit)", "deleteReturnRequest(r.id)"]) {
    assert.ok(LISTA.includes(`try {\n        res = await ${actiune};\n      } catch {`), actiune);
  }
  /* O cadere nu spune nici ca s-a scris, nici ca nu: cere starea adevarata. */
  assert.equal(LISTA.split("toast.error(faraRaspuns(").length - 1, 3);
  assert.equal(LISTA.split("router.refresh();").length - 1, 6);
  /* Numele tranzitiei incepe cu `start`: asa o vede si proba generala a tranzitiilor. */
  assert.ok(LISTA.includes("const [ocupat, startScriere] = useTransition();"));
});

test("⚠ stergerea cere confirmare in fereastra panoului, nu in casuta browserului", () => {
  assert.equal(/\bconfirm\(/.test(LISTA), false);
  assert.ok(LISTA.includes("sterge: setDeSters"));
  assert.ok(LISTA.includes("onClick={() => { if (deSters) stergeConfirmat(deSters); }}"));
  /* Piesele cer doar; nu sterg singure. */
  assert.ok(PIESE.includes("onClick={() => sterge(r)}"));
  assert.equal(PIESE.includes("deleteReturnRequest"), false);
});

test("pagina adevarata nu mai poarta nimic de prototip", () => {
  for (const [nume, sursa] of [["pagina", PAGINA], ["lista", LISTA], ["piese", PIESE]] as const) {
    assert.equal(/prototip|variante-/i.test(sursa), false, nume);
  }
});

test("⚠ o cerere cu linii de alta forma decat cea asteptata nu darama lista", () => {
  /* `items` e `jsonb`: o linie care nu e obiect se sare. */
  const c = cerereDinRand({ id: "r9", items: [null, "text", 3, { name: "Vază", quantity: 1, price: 12.5 }], created_at: "2026-11-24T09:15:00Z" }, {}, {});
  assert.deepEqual(c.produse.map((p) => p.nume), ["Vază"]);
  assert.equal(c.valoare, 12.5);
  assert.deepEqual(cerereDinRand({ id: "r10", items: "nu e o lista", created_at: null }, {}, {}).produse, []);
});
