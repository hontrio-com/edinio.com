import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CE_NU_OPRESTE_LIMITA, DE_CE_SE_AFLA_ABIA_LA_TRIMITERE, despreLimita, limitaValida,
} from "./per-client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CE SE VERIFICA IN FORMULAR, SI CE SE SPUNE PE ECRAN             (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Adevarul limitei sta in SQL (vezi
 * `revendicarea-e-o-singura-instructiune.test.ts`). Aici stau doua lucruri
 * marunte, si amandoua au fost defecte in alte parti ale casei:
 *
 *   * ce se refuza in formular — ca sa nu iasa o eroare de Postgres in loc de o
 *     propozitie pentru om;
 *   * ce se SPUNE, fiindca o limita care nu-si spune intelesul e o promisiune
 *     pe care comerciantul o intelege gresit.
 */

/* ── Ce se poate scrie in camp ──────────────────────────────────────────── */

test("gol inseamna „fara limita", () => {
  for (const v of [null, undefined, ""]) {
    const r = limitaValida(v);
    assert.ok(!("error" in r), String(v));
    assert.equal(r.limita, null);
  }
});

test("un numar intreg de la 1 in sus trece", () => {
  for (const v of [1, 2, 10, "3"]) {
    const r = limitaValida(v);
    assert.ok(!("error" in r), String(v));
    assert.equal(r.limita, Number(v));
  }
});

test("⚠ zero NU inseamna „fara limita", () => {
  /*
   * Ar fi fost citit ca „nimeni nu-l poate folosi", si a doua zi comerciantul ar
   * fi intrebat de ce nu merge codul. Baza are si ea constrangerea
   * (`per_customer_limit >= 1`), dar ea ar fi iesit ca o eroare de Postgres.
   */
  const r = limitaValida(0);
  assert.ok("error" in r);
  assert.match(r.error, /măcar o dată/i);
});

test("⚠ numerele negative si cele cu zecimale se refuza", () => {
  assert.ok("error" in limitaValida(-1));
  assert.ok("error" in limitaValida(1.5));
  assert.ok("error" in limitaValida("doua"));
  assert.ok("error" in limitaValida(Infinity));
});

/* ── Ce scrie pe ecran ──────────────────────────────────────────────────── */

test("⚠⚠ textul spune si CE SE INTAMPLA LA ANULARE", () => {
  /*
   * E prima intrebare a oricui intelege ce citeste, si raspunsul nu e evident:
   * o comanda anulata ii da omului dreptul inapoi, la fel cum il da campaniei.
   * Hotararea e scrisa in `release_order_discount`; daca ea se schimba, textul
   * asta minte, si proba de aici cade ca sa se vada.
   */
  const t = despreLimita(1);
  assert.match(t, /o singură dată/);
  assert.match(t, /telefon/i, "nu spune ce inseamna „acelasi client”");
  assert.match(t, /anulează/i, "nu spune ce se intampla la anulare");
});

test("textul se potriveste cu numarul, nu spune mereu „o data", () => {
  assert.match(despreLimita(3), /de 3 ori/);
  assert.match(despreLimita(null), /de câte ori vrea/i);
});

test("⚠⚠ se spune pe fata si CE NU OPRESTE limita", () => {
  /*
   * Cumparatorul isi scrie singur telefonul. Fara randul asta, comerciantul
   * crede ca a cumparat o garantie si afla abia din raport ca n-a fost una.
   */
  assert.match(CE_NU_OPRESTE_LIMITA, /singur telefonul/);
  assert.ok(CE_NU_OPRESTE_LIMITA.length > 80, "e prea scurt ca sa spuna ceva");
});

/* ── De ce nu se afla la aplicarea codului ──────────────────────────────── */

test("⚠⚠ limita pe om NU se verifica in `validateDiscount`", () => {
  /*
   * ⚠⚠ ASTA E O PROBA DE SECURITATE, nu una de purtare.
   *
   * `validateDiscount` e un capat public. Daca raspunsul lui ar tine seama de
   * cine e omul, atunci „valid" ar insemna „numarul asta n-a cumparat niciodata
   * de aici", iar „nu e valid" ar insemna „a cumparat" — si oricine ar putea
   * cerne telefoane pe rand, cu un cod anuntat pe pagina magazinului.
   *
   * Oracolul NU e in text, e in bitul valid/nevalid: mesajul unic nu-l poate
   * inchide. De-aia limita se judeca abia la revendicare.
   *
   * Pe o farmacie, pe un magazin veterinar sau pe unul de produse intime, asta
   * inseamna: „numarul 07xx a cumparat de acolo".
   */
  const sursa = readFileSync("src/lib/actions/discount.actions.ts", "utf8");
  const de = sursa.indexOf("export async function validateDiscount(");
  const la = sursa.indexOf("\nexport ", de + 10);
  const corp = sursa.slice(de, la);

  assert.ok(corp.length > 1500, `felia are doar ${corp.length} semne`);
  assert.ok(!corp.includes("per_customer_limit"),
    "limita pe om a intrat in validare: capatul public a devenit un oracol „numarul asta a cumparat de aici?”");
  assert.ok(!corp.includes("customer_phone") && !corp.includes("customer_email"),
    "validarea a capatat identitatea cumparatorului ca argument");
  assert.ok(!corp.includes("discount_customer_key"),
    "validarea socoteste cheia omului");
});

test("⚠ si motivul e scris langa regula, nu doar in probe", () => {
  /* Un comentariu sters ar fi lasat urmatorul cititor sa „repare" lipsa. */
  assert.match(DE_CE_SE_AFLA_ABIA_LA_TRIMITERE, /trimiterea comenzii/i);
  assert.match(DE_CE_SE_AFLA_ABIA_LA_TRIMITERE, /telefoane|numere/i);
});

/* ── Drumul intors, in cele doua copii ale checkoutului ─────────────────── */

test("⚠⚠ marca revendicarii se scrie pe comanda IN CHIAR insertul ei", () => {
  /*
   * O actualizare separata de dupa insert poate sa pice, si atunci utilizarea
   * omului ramane agatata in aer: randul exista in registru, dar nicio comanda
   * nu stie de el, deci nimeni n-ar mai avea cum sa i-o dea inapoi.
   *
   * ⚠ De doua ori, fiindca `placeOrder` si `placeCartOrder` sunt doua copii ale
   * aceluiasi checkout. Una reparata si cealalta uitata lasa un drum intreg
   * descoperit, si nimic n-ar cadea.
   */
  const c = readFileSync("src/lib/actions/order.actions.ts", "utf8");
  assert.equal(c.split("discount_use_id: marcaUtilizarii,").length - 1, 2);
  assert.equal(c.split('admin.rpc("claim_discount_use"').length - 1, 2);
  assert.equal(c.split("p_customer_phone: data.customer_phone").length - 1, 2,
    "revendicarea nu mai trimite telefonul in amandoua copiile");
  assert.equal(c.split("elibereazaCuponul(admin, marcaUtilizarii)").length - 1, 4,
    "nu toate cele patru compensari dau inapoi dreptul OMULUI");
  /* ⚠ Se cauta APELUL, nu numele: functia e pomenita si in comentarii, iar o
     proba pe nume ar fi cazut pe un rand de explicatie. */
  assert.ok(!c.includes('rpc("release_discount_use"'),
    "s-a intors eliberarea care stie doar de contorul campaniei");
  assert.equal(c.split('rpc("release_discount_claim"').length - 1, 1,
    "eliberarea nu mai trece prin `elibereazaCuponul`, singurul loc care o jurnalizeaza");
});
