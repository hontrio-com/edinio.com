import test from "node:test";
import assert from "node:assert/strict";

import {
  DESPRE_ETICHETA, PRAGURI_IMPLICITE, eticheteleClientului, faraIdentitate,
  type ClientDeEtichetat,
} from "./etichete";
import { SEGMENTE } from "./filtre";

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

test("⚠⚠ VIP se aprinde NUMAI pe valoare, nu pe numarul de comenzi", () => {
  /*
   * Pana la 21.09.2026 regula era `3 comenzi SAU 1.000 lei`, si ajungea oricare
   * dintre ele. Masurat atunci: aproape toti VIP-ii ajungeau acolo prin NUMARUL
   * de comenzi — cinci comenzi de cincizeci de lei faceau un VIP.
   *
   * El a cerut limpede: „doar daca a comandat de peste 10.000 lei". Deci numarul
   * de comenzi a iesit cu totul din regula, nu i s-a urcat doar pragul.
   */
  const multeComenziPutiniBani = client({ orderCount: 30, validOrderCount: 30, ordersValue: 900 });
  assert.ok(
    !eticheteleClientului(multeComenziPutiniBani, PRAGURI_IMPLICITE, ACUM).includes("vip"),
    "treizeci de comenzi mici fac iar un VIP",
  );

  const putineComenziMultiBani = client({ orderCount: 1, validOrderCount: 1, ordersValue: 10_000 });
  assert.ok(eticheteleClientului(putineComenziMultiBani, PRAGURI_IMPLICITE, ACUM).includes("vip"));
});

test("⚠ pragul e „PESTE 10.000”, deci exact 10.000 intra", () => {
  /* `>=`, ca peste tot in sectiune. Un om cu fix zece mii e VIP. */
  assert.equal(PRAGURI_IMPLICITE.vipLei, 10_000);
  assert.ok(eticheteleClientului(client({ orderCount: 1, validOrderCount: 1, ordersValue: 10_000 }), PRAGURI_IMPLICITE, ACUM).includes("vip"));
  assert.ok(!eticheteleClientului(client({ orderCount: 1, validOrderCount: 1, ordersValue: 9_999.99 }), PRAGURI_IMPLICITE, ACUM).includes("vip"));
});

test("⚠⚠ pragul cerut de el NU se aprinde azi pentru nimeni, si asta se stie", () => {
  /*
   * Masurat inainte de schimbare:
   *   PRODUCTIE  494 de clienti, cel mai mare a cumparat vreodata de 699 lei.
   *   DEMO       358 de clienti, cel mai mare 3.294,29 lei.
   * Peste 10.000 lei: ZERO, in amandoua.
   *
   * ⚠ Proba asta NU spune ca e gresit — e hotararea lui, luata cu cifrele la
   * vedere. Spune doar ca eticheta e moarta pana cand cineva cumpara de zece mii,
   * ca sa nu para mai tarziu un defect. Si arata cum se repara: pragul se poate
   * cobori pe magazin.
   */
  const celMaiMareDePeProductie = client({ orderCount: 2, validOrderCount: 2, ordersValue: 699 });
  assert.ok(!eticheteleClientului(celMaiMareDePeProductie, PRAGURI_IMPLICITE, ACUM).includes("vip"));

  const celMaiMareDePeDemo = client({ orderCount: 4, validOrderCount: 4, ordersValue: 3_294.29 });
  assert.ok(!eticheteleClientului(celMaiMareDePeDemo, PRAGURI_IMPLICITE, ACUM).includes("vip"));

  /* Cu pragul coborat pe magazin, amandoi sunt VIP. */
  const aleLui = { ...PRAGURI_IMPLICITE, vipLei: 500 };
  assert.ok(eticheteleClientului(celMaiMareDePeProductie, aleLui, ACUM).includes("vip"));
});

/* ── Inactiv: SCOASA ca eticheta, PASTRATA ca filtru ────────────────────── */

test("⚠⚠ nu se mai lipeste nicio eticheta „Inactiv” pe rand", () => {
  /*
   * Scoasa la cererea lui, pe 21.09.2026. Un om care n-a mai comandat de patru
   * luni ramane in lista cu „Recurent" si atat — nu i se mai pune un semn.
   *
   * ⚠ Proba asta apara SCOATEREA, nu regula: daca cineva o pune la loc fara sa
   * ceara nimeni, pica aici.
   */
  const deMult = client({
    orderCount: 2, validOrderCount: 2,
    firstOrderAt: zileInUrma(400), lastOrderAt: zileInUrma(120),
  });
  const e = eticheteleClientului(deMult, PRAGURI_IMPLICITE, ACUM);
  assert.deepEqual(e, ["recurent"], `a aparut ceva in plus: ${e.join(", ")}`);
  assert.ok(!(e as string[]).includes("inactiv"));
});

test("⚠⚠ dar PRAGUL de inactivitate ramane, fiindca il folosesc FILTRELE", () => {
  /*
   * „Inactivi de 30 / 90 / 180 de zile" sunt segmente din bara de filtre, nu
   * etichete. Sters si pragul odata cu eticheta, comerciantul n-ar mai fi avut
   * cum sa-si gaseasca clientii adormiti — adica tocmai lucrul pentru care
   * exista sectiunea. Vezi `SEGMENTE` din `filtre.ts` si `customer_in_segment`.
   */
  assert.equal(PRAGURI_IMPLICITE.zileInactiv, 90);
  assert.ok(SEGMENTE.includes("inactivi-30"));
  assert.ok(SEGMENTE.includes("inactivi-90"));
  assert.ok(SEGMENTE.includes("inactivi-180"));
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
  /*
   * ⚠ Numarul e scris de mana DINADINS, nu luat din `FelEticheta`: asa, cine
   * adauga o eticheta e OBLIGAT sa treaca pe aici si sa-i scrie explicatia.
   * Derivat, proba ar fi trecut peste orice eticheta noua, tacuta.
   *
   * Erau sase. Tot pe 21.09.2026 au ajuns sapte („Importat" s-a despartit in
   * „Importat" si „Adaugat manual", fiindca adaugarea de mana a facut prima
   * eticheta sa minta despre oamenii luati la telefon), si apoi iar sase:
   * „Inactiv" a fost scoasa la cererea lui.
   *
   * ⚠ Proba a picat la amandoua schimbarile, si asa trebuie: mutarea multimii de
   * etichete nu are voie sa treaca pe tacute.
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

/* ── De unde vine contactul ─────────────────────────────────────────────── */

test("⚠⚠ un client ADAUGAT DE MANA nu se mai cheama „Importat”", () => {
  /*
   * ⚠ DEFECT ADEVARAT, vazut pe ecran pe 21.09.2026, in chiar ziua in care s-a
   * scris adaugarea de mana. Eticheta se punea dupa `orderCount === 0`, iar asta
   * era adevarat exact cat timp importul era singurul drum catre un contact fara
   * comenzi. Un om luat la telefon aparea in lista scris „Importat": nicio
   * eroare, nicio proba cazuta, doar o propozitie falsa despre el.
   *
   * ⚠ Proba asta apara FELUL defectului, nu doar cazul: o insusire dedusa din
   * alta e adevarata pana cand cineva adauga a doua cale, si nimeni nu te
   * anunta cand o face.
   */
  const fara = {
    orderCount: 0, validOrderCount: 0, refundedCount: 0, ordersValue: 0,
    firstOrderAt: null, lastOrderAt: null,
  };
  assert.deepEqual(eticheteleClientului({ ...fara, source: "manual" }), ["adaugat-manual"]);
  assert.deepEqual(eticheteleClientului({ ...fara, source: "import" }), ["importat"]);
});

test("⚠ fara `source`, se cade pe „Importat” — ce erau toti pana azi", () => {
  /*
   * Apelantii mai vechi nu trimit campul. Cazuti pe „Adaugat manual", ar fi
   * mintit in cealalta directie, si inca despre toata lista deodata.
   */
  const fara = {
    orderCount: 0, validOrderCount: 0, refundedCount: 0, ordersValue: 0,
    firstOrderAt: null, lastOrderAt: null,
  };
  assert.deepEqual(eticheteleClientului(fara), ["importat"]);
  assert.deepEqual(eticheteleClientului({ ...fara, source: null }), ["importat"]);
});

test("⚠ `source` NU schimba nimic pentru cine are comenzi", () => {
  /*
   * Un cumparator are `source = null` (n-are rand in `customers`), dar si unul
   * importat care apoi a comandat pastreaza `import`. Niciunul nu e „contact":
   * amandoi au cumparat, si asta e ce conteaza.
   */
  const acum = Date.UTC(2026, 8, 21);
  const cumparator = {
    orderCount: 3, validOrderCount: 3, refundedCount: 0, ordersValue: 900,
    firstOrderAt: new Date(acum - 40 * 86_400_000).toISOString(),
    lastOrderAt: new Date(acum - 5 * 86_400_000).toISOString(),
  };
  const a = eticheteleClientului({ ...cumparator, source: null }, PRAGURI_IMPLICITE, acum);
  const b = eticheteleClientului({ ...cumparator, source: "import" }, PRAGURI_IMPLICITE, acum);
  const c = eticheteleClientului({ ...cumparator, source: "manual" }, PRAGURI_IMPLICITE, acum);
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
  assert.ok(!a.includes("importat") && !a.includes("adaugat-manual"));
});

test("⚠ fiecare eticheta are si text, si explicatie — inclusiv cea noua", () => {
  for (const f of ["importat", "adaugat-manual"] as const) {
    assert.ok(DESPRE_ETICHETA[f].text.length > 2, `${f}: fara text`);
    assert.ok(DESPRE_ETICHETA[f].explicatie.length > 25, `${f}: fara explicatie`);
  }
  /* Si cele doua nu spun acelasi lucru. */
  assert.notEqual(DESPRE_ETICHETA["importat"].explicatie, DESPRE_ETICHETA["adaugat-manual"].explicatie);
});
