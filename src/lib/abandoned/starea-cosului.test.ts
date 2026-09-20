import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  FILTRE, NUMELE_STARII, cateInCos, stareaCosului, trece, trepteleePalniei,
} from "./starea-cosului";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE APARA PROBELE ASTEA
  ═══════════════════════════════════════════════════════════════════════════════

  Randul purta pana pe 21.09.2026 doua etichete deodata („Mail trimis", „SMS
  trimis"), iar de pe 21.09 si o a treia („Ignorat"). Trei etichete care nu
  raspund la intrebarea omului: ce fac cu cosul asta?
*/

test("un cos fara niciun mesaj e necontactat", () => {
  assert.equal(stareaCosului({}), "abandonat");
  assert.equal(NUMELE_STARII.abandonat.titlu, "Necontactat");
});

test("⚠ STARILE SUNT O SCARA: prima care se potriveste castiga", () => {
  /*
    ⚠ Un cos ignorat caruia i s-a trimis si mail, si SMS, si care a fost
    deschis, are toate cele patru semne deodata. Fara o ordine scrisa, eticheta
    lui ar depinde de ordinea in care se intampla sa fie scrise verificarile -
    adica s-ar putea schimba la o rescriere, fara ca nimeni sa observe.
  */
  const cuTot = {
    ignorat_la: "2026-09-21T10:00:00Z",
    recovery_email_sent_at: "2026-09-19T10:00:00Z",
    recovery_sms_sent_at: "2026-09-20T10:00:00Z",
    deschis_la: "2026-09-20T12:00:00Z",
  };
  assert.equal(stareaCosului(cuTot), "ignorat", "hotararea comerciantului bate orice");
  assert.equal(stareaCosului({ ...cuTot, ignorat_la: null }), "deschis", "deschiderea bate trimiterea");
  assert.equal(
    stareaCosului({ ...cuTot, ignorat_la: null, deschis_la: null }), "contactat",
  );
});

test("oricare dintre cele doua canale inseamna „contactat”", () => {
  assert.equal(stareaCosului({ recovery_email_sent_at: "2026-09-19T10:00:00Z" }), "contactat");
  assert.equal(stareaCosului({ recovery_sms_sent_at: "2026-09-19T10:00:00Z" }), "contactat");
});

test("⚠ FILTRELE NU SE SUPRAPUN: fiecare cos cade intr-unul singur", () => {
  /*
    ⚠ Capcana: filtrat pe coloane („are data de email"), „Contactate" ar fi
    prins si cosurile deschise, fiindca si ele au data de trimitere. Doua
    filtre care arata acelasi cos, fara ca nimic sa spuna de ce.
  */
  const cosuri = [
    {},
    { recovery_email_sent_at: "x" },
    { recovery_email_sent_at: "x", deschis_la: "y" },
    { ignorat_la: "z", recovery_sms_sent_at: "x" },
  ];
  const stari = FILTRE.filter((f) => f.cheie !== "toate");
  for (const c of cosuri) {
    const potrivite = stari.filter((f) => trece(c, f.cheie));
    assert.equal(potrivite.length, 1, `cosul cade in ${potrivite.length} filtre: ${JSON.stringify(c)}`);
  }
  /* „Toate" le prinde chiar pe toate. */
  for (const c of cosuri) assert.ok(trece(c, "toate"));
});

test("fiecare stare isi spune ce inseamna, si nu se repeta", () => {
  const titluri = Object.values(NUMELE_STARII).map((s) => s.titlu);
  assert.equal(new Set(titluri).size, titluri.length);
  for (const s of Object.values(NUMELE_STARII)) assert.ok(s.explicatie.length > 30);
  assert.match(NUMELE_STARII.ignorat.explicatie, /rămâne în statistici/i);
  assert.match(NUMELE_STARII.deschis.explicatie, /7 zile/);
});

test("⚠ `item_count` E SUMA CANTITATILOR, NU NUMARUL DE PRODUSE", () => {
  /*
    ⚠ Prins pe ecran, nu in cod: sertarul scria „În coș · 3 produse" si dedesubt
    lista avea DOUA randuri. Coloana e suma bucatilor, iar textul o citea ca pe
    un numar de produse. Aceeasi greseala era si in tabel, si in fereastra de
    stergere - trei locuri, o singura socoteala scrisa de trei ori.
  */
  const doua = [{ quantity: 2 }, { quantity: 1 }];
  assert.equal(cateInCos(doua, 3), "2 produse · 3 buc", "doua produse, trei bucati");
  assert.equal(cateInCos([{ quantity: 1 }], 1), "1 produs", "cand sunt la fel, nu se mai spune de doua ori");
  assert.equal(cateInCos([{ quantity: 4 }], 4), "1 produs · 4 buc");

  /*
    ⚠ Un cos ale carui produse nu se mai pot reface are `items` gol, dar
    `item_count` nenul: nu are voie sa spuna „3 produse" peste o lista goala.
  */
  assert.equal(cateInCos([], 3), "0 produse");
});

test("⚠ PROCENTUL PALNIEI E FATA DE TREAPTA DINAINTE, nu fata de prima", () => {
  /*
    ⚠ Socotit fata de prima, „26%" de la Contactate ar fi devenit „25% din
    cosurile salvate" - o cifra adevarata care raspunde la alta intrebare.
    Omul se uita la palnie ca sa afle UNDE pierde, nu cat a mai ramas.
  */
  const t = trepteleePalniei({ salvate: 100, neterminate: 50, contactate: 10, deschise: 5, recuperate: 1 });
  assert.equal(t[0].dinPasulAnterior, null, "prima treapta n-are fata de ce");
  assert.equal(t[1].dinPasulAnterior, 50, "50 din 100");
  assert.equal(t[2].dinPasulAnterior, 20, "10 din 50, NU 10 din 100");
  assert.equal(t[3].dinPasulAnterior, 50, "5 din 10");
  assert.equal(t[4].dinPasulAnterior, 20, "1 din 5");
});

test("o treapta goala nu rupe socoteala si nu dispare de pe ecran", () => {
  const t = trepteleePalniei({ salvate: 10, neterminate: 4, contactate: 0, deschise: 0, recuperate: 0 });
  assert.equal(t[2].dinPasulAnterior, 0, "0 din 4 e zero la suta, nu «nu se stie»");
  assert.equal(t[3].dinPasulAnterior, null, "cand treapta dinainte e 0, procentul n-are inteles");
  for (const treapta of t) assert.ok(treapta.latime >= 2, "o treapta de zero tot trebuie sa se vada");
});

test("un magazin fara niciun cos nu imparte la zero", () => {
  const t = trepteleePalniei({ salvate: 0, neterminate: 0, contactate: 0, deschise: 0, recuperate: 0 });
  assert.equal(t.length, 5);
  for (const treapta of t) {
    assert.equal(treapta.numar, 0);
    assert.ok(Number.isFinite(treapta.latime));
  }
});
