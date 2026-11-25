import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coletDinRand, coletUsor, curierDecont, socotesteDecontarile, sumaDinRand, type ColetUsor } from "./date";
import { adresaFiltrelor, areFiltre, FILTRE_GOALE, filtreDinAdresa } from "./filtre";

/*
  Pagina de Decontări (25.11.2026): filtrele din adresa, forma unui colet si SOCOTEALA filtrului.

  Ce pazesc probele: totalul de pe ecran e comparat de om cu extrasul de banca, cifra cu cifra.
  Un numar de fila care nu e al listei, o suma cu o eroare de rotunjire sau una socotita peste o
  lista taiata fara s-o spuna sunt exact greselile care nu se vad pana cand cineva chiar compara.
*/

const colet = (id: string, curier: string, zi: string, suma: number): ColetUsor => ({ id, curier, zi, suma });

/* ── Filtrele din adresa ──────────────────────────────────────────────────── */

test("filtrele se citesc din adresa, iar ce nu e de inteles cade pe implicit", () => {
  assert.deepEqual(filtreDinAdresa({}), FILTRE_GOALE);
  assert.deepEqual(
    filtreDinAdresa({ q: "  Popescu  ", curier: "FanCourier", de_la: "2026-09-01", pana_la: "2026-09-30", page: "3" }),
    { q: "Popescu", curier: "fancourier", deLa: "2026-09-01", panaLa: "2026-09-30", page: 3 },
  );
  /* Un curier scris cu semne care n-au ce cauta intr-o cheie nu ajunge in interogare. */
  assert.equal(filtreDinAdresa({ curier: "fan courier;drop" }).curier, "all");
  assert.equal(filtreDinAdresa({ curier: "a".repeat(41) }).curier, "all");
  /* O zi care nu e zi se ignora; o pagina care nu e numar e prima. */
  assert.equal(filtreDinAdresa({ de_la: "ieri" }).deLa, "");
  assert.equal(filtreDinAdresa({ page: "-4" }).page, 1);
  /* Cautarea se taie la 80 de semne: restul n-ar gasi nimic si doar ar lungi adresa. */
  assert.equal(filtreDinAdresa({ q: "x".repeat(200) }).q.length, 80);
});

test("adresa unei stari scrie doar ce nu e pe implicit, si se citeste inapoi la fel", () => {
  assert.equal(adresaFiltrelor("/dashboard/settlements", FILTRE_GOALE), "/dashboard/settlements");
  const f = { q: "AWB 123", curier: "sameday", deLa: "2026-09-01", panaLa: "2026-09-30", page: 2 };
  const adresa = adresaFiltrelor("/dashboard/settlements", f);
  assert.equal(adresa, "/dashboard/settlements?q=AWB+123&curier=sameday&de_la=2026-09-01&pana_la=2026-09-30&page=2");
  const inapoi = Object.fromEntries(new URLSearchParams(adresa.split("?")[1]));
  assert.deepEqual(filtreDinAdresa(inapoi), f);
});

test("„Șterge filtrele” apare doar cand e pus un filtru; pagina singura nu e filtru", () => {
  assert.equal(areFiltre(FILTRE_GOALE), false);
  assert.equal(areFiltre({ ...FILTRE_GOALE, page: 7 }), false);
  for (const pus of [{ q: "x" }, { curier: "dpd" }, { deLa: "2026-01-01" }, { panaLa: "2026-01-01" }]) {
    assert.equal(areFiltre({ ...FILTRE_GOALE, ...pus }), true, JSON.stringify(pus));
  }
});

/* ── Forma unui colet ─────────────────────────────────────────────────────── */

test("⚠ o suma lipsa ramane zero doar la adunat: `numeric` poate veni ca sir", () => {
  assert.equal(sumaDinRand(12.5), 12.5);
  assert.equal(sumaDinRand("149.99"), 149.99);
  assert.equal(sumaDinRand(null), 0);
  assert.equal(sumaDinRand(undefined), 0);
  assert.equal(sumaDinRand("nimic"), 0);
});

test("un rand din baza ajunge colet: textele goale devin `null`, comanda isi ia numarul", () => {
  const c = coletDinRand(
    {
      id: "c1", courier: "fancourier", awb_number: "2150012345678", return_awb_number: "  ", transfer_date: "2026-09-16",
      transaction_date: "2026-09-14", amount_collected: "219.90", recipient_name: " Ana Pop ", recipient_locality: "", order_id: "o1",
    },
    { o1: "#1331" },
  );
  assert.deepEqual(c, {
    id: "c1", curier: "fancourier", awb: "2150012345678", awbRetur: null, viratPe: "2026-09-16", incasatPe: "2026-09-14",
    suma: 219.9, destinatar: "Ana Pop", localitate: null, comanda: { id: "o1", numar: "#1331" },
  });
  /* AWB emis din afara platformei: fara comanda. Comanda stearsa intre timp: legatura ramane, fara numar. */
  assert.equal(coletDinRand({ id: "c2", order_id: null }, {}).comanda, null);
  assert.deepEqual(coletDinRand({ id: "c3", order_id: "o9" }, {}).comanda, { id: "o9", numar: null });
});

test("curierul cunoscut isi arata numele si sigla; unul necunoscut, cheia din baza", () => {
  const fan = curierDecont("fancourier");
  assert.equal(fan.nume, "FAN Courier");
  assert.equal(fan.sigla?.logo, "/integrations/fan-courier.svg");
  /* Sigla e varianta MICA acolo unde exista: `cargus.svg` are 215 KB. */
  assert.equal(curierDecont("cargus").sigla?.logo, "/integrations/mici/cargus.webp");
  assert.deepEqual(curierDecont("curier-nou"), { nume: "curier-nou", sigla: null });
  /* O cheie care seamana cu o proprietate mostenita nu e curier. */
  assert.deepEqual(curierDecont("constructor"), { nume: "constructor", sigla: null });
});

test("randul usor pastreaza doar ce trebuie la numarat si adunat", () => {
  assert.deepEqual(coletUsor({ id: 7, courier: "dpd", transfer_date: "2026-10-02", amount_collected: "80.00" }), { id: "7", curier: "dpd", zi: "2026-10-02", suma: 80 });
  assert.deepEqual(coletUsor({ id: "x" }), { id: "x", curier: "", zi: "", suma: 0 });
});

/* ── Socoteala filtrului ──────────────────────────────────────────────────── */

const LISTA: ColetUsor[] = [
  colet("1", "fancourier", "2026-09-16", 100),
  colet("2", "fancourier", "2026-09-16", 50.5),
  colet("3", "sameday", "2026-09-16", 200),
  colet("4", "fancourier", "2026-09-15", 10),
  colet("5", "sameday", "2026-09-14", 40),
  colet("6", "fancourier", "2026-09-14", 5),
];

test("fara curier ales: toate coletele, o virare pentru fiecare zi si curier", () => {
  const s = socotesteDecontarile(LISTA, "all");
  assert.equal(s.aleCurierului.length, 6);
  /* FAN 16, 15, 14 + Sameday 16, 14 = cinci virari, nu sase colete si nu trei zile. */
  assert.equal(s.virari, 5);
  assert.equal(s.suma, 405.5);
  assert.deepEqual(s.curieri.map((c) => [c.cheie, c.numar]), [["fancourier", 4], ["sameday", 2]]);
});

test("⚠ cu un curier ales, filele raman numarate FARA el, iar totalul e al lui", () => {
  const s = socotesteDecontarile(LISTA, "sameday");
  /* Filele: altfel FAN ar arata zero si n-ar mai fi de unde alege. */
  assert.deepEqual(s.curieri.map((c) => [c.cheie, c.numar]), [["fancourier", 4], ["sameday", 2]]);
  assert.deepEqual(s.aleCurierului.map((c) => c.id), ["3", "5"]);
  assert.equal(s.virari, 2);
  assert.equal(s.suma, 240);
  /* Numarul de pe fila e numarul listei de sub ea. */
  assert.equal(s.curieri.find((c) => c.cheie === "sameday")?.numar, s.aleCurierului.length);
});

test("curierul ales ramane pe file si cand cautarea nu-i mai lasa niciun colet", () => {
  const s = socotesteDecontarile(LISTA.filter((c) => c.curier === "fancourier"), "sameday");
  assert.deepEqual(s.curieri.map((c) => [c.cheie, c.numar]), [["fancourier", 4], ["sameday", 0]]);
  assert.equal(s.aleCurierului.length, 0);
  assert.equal(s.virari, 0);
  assert.equal(s.suma, 0);
});

test("curierii cu acelasi numar de colete se aseaza dupa nume, nu la intamplare", () => {
  const s = socotesteDecontarile([colet("1", "sameday", "2026-09-16", 1), colet("2", "dpd", "2026-09-16", 1), colet("3", "cargus", "2026-09-16", 1)], "all");
  assert.deepEqual(s.curieri.map((c) => c.nume), ["Cargus", "DPD", "Sameday"]);
});

test("⚠ banii se aduna in bani intregi: 0,1 + 0,2 e 0,30, nu 0,30000000000000004", () => {
  const s = socotesteDecontarile([colet("1", "dpd", "2026-09-16", 0.1), colet("2", "dpd", "2026-09-16", 0.2)], "all");
  assert.equal(s.suma, 0.3);
  /* O mie de colete de 19,99: adunate ca fractii, ultima zecimala fuge. */
  const mie = Array.from({ length: 1000 }, (_, i) => colet(String(i), "dpd", "2026-09-16", 19.99));
  assert.equal(socotesteDecontarile(mie, "all").suma, 19990);
});

test("lista primita nu e schimbata: ordinea ei e ordinea paginii", () => {
  const copie = LISTA.map((c) => ({ ...c }));
  const s = socotesteDecontarile(LISTA, "all");
  assert.deepEqual(LISTA, copie);
  assert.deepEqual(s.aleCurierului.map((c) => c.id), ["1", "2", "3", "4", "5", "6"]);
});

/* ── Pagina de pe server: ce citeste din sursa ────────────────────────────── */

const PAGINA = readFileSync("src/app/(dashboard)/dashboard/settlements/page.tsx", "utf8").replace(/\r\n/g, "\n");
const LISTA_TSX = readFileSync("src/components/dashboard/decontari/ListaDecontari.tsx", "utf8").replace(/\r\n/g, "\n");

test("⚠ fiecare citire din `courier_settlements` e legata de magazin", () => {
  /* O citire fara `business_id` s-ar sprijini doar pe RLS; legata, nu poate aduce coletele altui magazin nici daca politica s-ar strica. */
  const citiri = PAGINA.split("decontari().select(").length - 1;
  assert.ok(citiri >= 4, `ma asteptam la cel putin patru citiri, am gasit ${citiri}`);
  assert.equal(PAGINA.split('decontari().select(').slice(1).filter((bucata) => !bucata.slice(0, 220).includes('.eq("business_id", idMagazin)')).length, 0);
});

test("⚠ filtrele ajung in SQL printr-o singura functie, iar numaratoarea cere numarul exact", () => {
  assert.ok(PAGINA.includes("cuFiltre(decontari().select(COLOANE_USOARE, cuNumar ? { count: \"exact\" } : undefined)"));
  /* Cautarea trece prin `orSafeTerm`: un termen cu virgula sau paranteza ar rupe filtrul `or`. */
  assert.ok(PAGINA.includes("const term = orSafeTerm(f.q);"));
  /* Perioada e pe ziua virarii, cu amandoua capetele incluse. */
  assert.ok(PAGINA.includes('q.gte("transfer_date", f.deLa)') && PAGINA.includes('q.lte("transfer_date", f.panaLa)'));
});

test("⚠ o felie cazuta nu se inghite: totalul ar iesi mai mic, in tacere", () => {
  assert.ok(PAGINA.includes("let cazuta = !!prima.error;"));
  assert.ok(PAGINA.includes("if (r.error) cazuta = true;"));
  assert.ok(PAGINA.includes("citireCazuta={usoare.cazuta || paginaCazuta}"));
  assert.ok(LISTA_TSX.includes("{citireCazuta && ("));
});

test("⚠ lista taiata se spune, cu numarul adevarat alaturi", () => {
  assert.ok(PAGINA.includes("inBaza: usoare.inBaza > LIMITA ? usoare.inBaza : socoteala.aleCurierului.length,"));
  assert.ok(LISTA_TSX.includes("{rezumat.inBaza > rezumat.colete && ("));
});

test("pagina adevarata nu mai poarta nimic de prototip", () => {
  for (const [nume, sursa] of [["pagina", PAGINA], ["lista", LISTA_TSX]] as const) {
    assert.equal(/prototip|variante-/i.test(sursa), false, nume);
  }
});
