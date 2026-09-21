import test from "node:test";
import assert from "node:assert/strict";

import {
  DESPRE_ETICHETA, PRAGURI_IMPLICITE, eticheteleClientului, faraIdentitate,
  type ClientDeEtichetat,
} from "./etichete";

const ACUM = new Date("2026-09-21T12:00:00Z").getTime();
const zileInUrma = (z: number) => new Date(ACUM - z * 86_400_000).toISOString();

function client(p: Partial<ClientDeEtichetat> = {}): ClientDeEtichetat {
  return {
    orderCount: 1, validOrderCount: 1, refundedCount: 0, ordersValue: 100,
    firstOrderAt: zileInUrma(5), lastOrderAt: zileInUrma(5),
    ...p,
  };
}

/* ── Importat ───────────────────────────────────────────────────────────── */

test("⚠ fara nicio comanda, singurul lucru care se poate spune e „importat”", () => {
  /*
   * Si NUMAI el: un contact adus dintr-un fisier n-a fost niciodata activ, deci nu
   * poate fi „inactiv". Altfel lista ar fi plina de oameni marcati ca pierduti, care
   * n-au fost niciodata castigati.
   */
  const e = eticheteleClientului(client({ orderCount: 0, validOrderCount: 0, ordersValue: 0, firstOrderAt: null, lastOrderAt: null }), PRAGURI_IMPLICITE, ACUM);
  assert.deepEqual(e, ["importat"]);
});

/* ── Nou ────────────────────────────────────────────────────────────────── */

test("prima comanda, recenta, inseamna „nou”", () => {
  assert.ok(eticheteleClientului(client({ firstOrderAt: zileInUrma(3) }), PRAGURI_IMPLICITE, ACUM).includes("nou"));
});

test("⚠⚠ „nou” se judeca dupa PRIMA comanda, nu dupa ultima", () => {
  /*
   * ⚠ ASTA E PROBA CARE APARA INTELESUL CUVANTULUI. Un client de trei ani care
   * tocmai a cumparat are ultima comanda de ieri; dupa ea, ar fi „nou". Cuvantul ar
   * inceta sa mai insemne ceva, iar filtrul „clienti noi" ar aduce si clientii vechi.
   */
  const vechiCareTocmaiACumparat = client({
    orderCount: 4, validOrderCount: 4,
    firstOrderAt: zileInUrma(900), lastOrderAt: zileInUrma(1),
  });
  const e = eticheteleClientului(vechiCareTocmaiACumparat, PRAGURI_IMPLICITE, ACUM);
  assert.ok(!e.includes("nou"), `a iesit: ${e.join(", ")}`);
  assert.ok(e.includes("recurent"));
});

test("⚠ dupa a doua comanda nu mai e „nou”, chiar daca prima e de ieri", () => {
  /* „Nou" inseamna „n-a apucat sa se intoarca inca", nu „a intrat de curand". */
  const e = eticheteleClientului(
    client({ orderCount: 2, validOrderCount: 2, firstOrderAt: zileInUrma(2), lastOrderAt: zileInUrma(1) }),
    PRAGURI_IMPLICITE, ACUM,
  );
  assert.ok(!e.includes("nou"));
  assert.ok(e.includes("recurent"));
});

test("prima comanda veche nu mai e „nou”", () => {
  assert.ok(!eticheteleClientului(client({ firstOrderAt: zileInUrma(60), lastOrderAt: zileInUrma(60) }), PRAGURI_IMPLICITE, ACUM).includes("nou"));
});

/* ── Recurent ───────────────────────────────────────────────────────────── */

test("recurent inseamna mai mult de o comanda VALIDA", () => {
  /* Doua comenzi din care una anulata nu e o revenire. */
  assert.ok(!eticheteleClientului(client({ orderCount: 2, validOrderCount: 1 }), PRAGURI_IMPLICITE, ACUM).includes("recurent"));
  assert.ok(eticheteleClientului(client({ orderCount: 2, validOrderCount: 2 }), PRAGURI_IMPLICITE, ACUM).includes("recurent"));
});

/* ── VIP ────────────────────────────────────────────────────────────────── */

test("VIP se aprinde si pe comenzi, si pe valoare", () => {
  assert.ok(eticheteleClientului(client({ orderCount: 3, validOrderCount: 3, ordersValue: 100 }), PRAGURI_IMPLICITE, ACUM).includes("vip"));
  assert.ok(eticheteleClientului(client({ ordersValue: 1500 }), PRAGURI_IMPLICITE, ACUM).includes("vip"));
});

test("⚠⚠ pragul de lei ales de NOI nu s-ar aprinde pentru nimeni", () => {
  /*
   * Masurat pe productie: cel mai mare client al platformei are 968,99 lei in tot
   * istoricul, iar pragul de 95% e 256,52. Un VIP legat numai de 1.000 de lei ar fi
   * o eticheta moarta in fiecare magazin, pana cand cineva s-ar intreba de ce nu
   * merge. De-aia exista SI pragul pe comenzi, si de-aia amandoua se pot schimba.
   */
  const celMaiMareClientAlPlatformei = client({ orderCount: 1, validOrderCount: 1, ordersValue: 968.99 });
  assert.ok(!eticheteleClientului(celMaiMareClientAlPlatformei, PRAGURI_IMPLICITE, ACUM).includes("vip"));

  /* Cu pragul magazinului, acelasi om e VIP. */
  const aleLui = { ...PRAGURI_IMPLICITE, vipLei: 500 };
  assert.ok(eticheteleClientului(celMaiMareClientAlPlatformei, aleLui, ACUM).includes("vip"));
});

/* ── Inactiv ────────────────────────────────────────────────────────────── */

test("inactiv se masoara de la ultima comanda", () => {
  const e = eticheteleClientului(
    client({ orderCount: 2, validOrderCount: 2, firstOrderAt: zileInUrma(400), lastOrderAt: zileInUrma(120) }),
    PRAGURI_IMPLICITE, ACUM,
  );
  assert.ok(e.includes("inactiv"));
  assert.ok(e.includes("recurent"), "poate purta amandoua, si asta spune ceva");
});

test("⚠ un contact importat NU e „inactiv”", () => {
  /* N-a fost niciodata activ. Vezi proba de sus: iese doar cu „importat". */
  const e = eticheteleClientului(
    client({ orderCount: 0, validOrderCount: 0, firstOrderAt: null, lastOrderAt: null }),
    PRAGURI_IMPLICITE, ACUM,
  );
  assert.ok(!e.includes("inactiv"));
});

/* ── Risc de retur ──────────────────────────────────────────────────────── */

test("⚠⚠ un singur retur NU face un om „cu risc”", () => {
  /*
   * ⚠ ASTA E PROBA CARE APARA UN OM. Masurat pe productie: toti cei 20 de clienti cu
   * retur au o SINGURA comanda — chiar cea returnata. Cu regula „macar un retur",
   * toti douazeci ar fi fost marcati drept risc, pe baza unui singur fapt, care poate
   * fi un produs gresit trimis de magazin. O rata are nevoie de un numitor.
   */
  const e = eticheteleClientului(
    client({ orderCount: 1, validOrderCount: 0, refundedCount: 1 }), PRAGURI_IMPLICITE, ACUM,
  );
  assert.ok(!e.includes("risc-retur"), `a iesit: ${e.join(", ")}`);
});

test("de la trei comenzi incolo, jumatate returnate inseamna risc", () => {
  const e = eticheteleClientului(
    client({ orderCount: 4, validOrderCount: 2, refundedCount: 2 }), PRAGURI_IMPLICITE, ACUM,
  );
  assert.ok(e.includes("risc-retur"));
});

test("trei comenzi cu un singur retur NU e risc", () => {
  assert.ok(!eticheteleClientului(
    client({ orderCount: 3, validOrderCount: 2, refundedCount: 1 }), PRAGURI_IMPLICITE, ACUM,
  ).includes("risc-retur"));
});

/* ── Textele ────────────────────────────────────────────────────────────── */

test("⚠ fiecare eticheta are un text si o explicatie care spune REGULA", () => {
  /*
   * Un badge fara explicatie il pune pe comerciant sa ghiceasca de ce e acolo — si
   * sa ia hotarari despre un om pe baza unei ghiciri.
   */
  const feluri = Object.keys(DESPRE_ETICHETA);
  assert.equal(feluri.length, 6);
  for (const [fel, d] of Object.entries(DESPRE_ETICHETA)) {
    assert.ok(d.text.length >= 3, fel);
    assert.ok(d.explicatie.length > 30, `${fel}: explicatia e prea scurta ca sa spuna regula`);
  }
});

test("⚠ orice eticheta intoarsa are si un text", () => {
  /* O eticheta fara text s-ar randa goala, si nimeni n-ar sti ce lipseste. */
  const toate = [
    eticheteleClientului(client({ orderCount: 0, validOrderCount: 0, firstOrderAt: null, lastOrderAt: null }), PRAGURI_IMPLICITE, ACUM),
    eticheteleClientului(client({ orderCount: 5, validOrderCount: 2, refundedCount: 3, ordersValue: 2000, firstOrderAt: zileInUrma(400), lastOrderAt: zileInUrma(200) }), PRAGURI_IMPLICITE, ACUM),
    eticheteleClientului(client(), PRAGURI_IMPLICITE, ACUM),
  ].flat();
  assert.ok(toate.length >= 4);
  for (const e of toate) assert.ok(DESPRE_ETICHETA[e], `eticheta fara text: ${e}`);
});

/* ── Capcana identitatii ────────────────────────────────────────────────── */

test("⚠⚠ o comanda fara telefon SI fara email se vede", () => {
  /*
   * Cheia de grupare e in cascada: telefon → `email:` → `order:`. Ultima treapta
   * inseamna ca fiecare comanda devine un „client" al ei, iar doua comenzi ale
   * aceluiasi om nu se unesc niciodata.
   *
   * ⚠ Masurat pe productie: ZERO comenzi cad acolo azi. Dar cand se va intampla, nu
   * va da nicio eroare — va umfla incet numarul de clienti cu oameni care nu exista.
   * De-aia se arata, nu se comenteaza.
   */
  assert.equal(faraIdentitate("order:8f1c-..."), true);
  assert.equal(faraIdentitate("email:ion@mail.ro"), false);
  assert.equal(faraIdentitate("722111222"), false);
});
