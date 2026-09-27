import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  caractereInAfaraGsm, costEstimatEurocenti, cuDezabonare, estimeazaMesaj, ETICHETA_DEZABONARE,
  normalizeazaTextSms, partiSms, punVariabile, textDeTrimis,
} from "./mesaj";
import { curataFiltre, telefonMascat } from "./campanie";

/*
  SMS-ul unei campanii (27.09.2026). Masurat in productie: mesajele aveau in medie 170 de
  caractere, iar ecranul numara cu 160 pe parte, deci omul platea doua SMS-uri fara sa stie.
*/

test("partile: 160 intr-unul, apoi 153 pe parte", () => {
  assert.equal(partiSms("a".repeat(160)).parti, 1);
  assert.equal(partiSms("a".repeat(161)).parti, 2);
  assert.equal(partiSms("a".repeat(306)).parti, 2);
  assert.equal(partiSms("a".repeat(307)).parti, 3, "cu 160 pe parte ar fi iesit 2, si s-ar fi platit 3");
});

test("caracterele extinse valoreaza doua; diacriticele se normalizeaza si valoreaza una", () => {
  assert.equal(partiSms("€".repeat(80)).unitati, 160);
  assert.equal(partiSms("€".repeat(81)).parti, 2);
  assert.equal(partiSms("ăîșțâ").unitati, 5);
  assert.equal(normalizeazaTextSms("Țară „nouă” – ieftin…"), "Tara \"noua\" - ieftin...");
});

test("un singur emoji trece mesajul pe UCS-2 (70 pe parte) si se spune ce caracter e", () => {
  const p = partiSms("Reducere 🎉 " + "a".repeat(60));
  assert.equal(p.ucs2, true);
  assert.equal(p.parti, 2);
  assert.deepEqual(caractereInAfaraGsm("Reducere 🎉"), ["🎉"]);
  assert.deepEqual(caractereInAfaraGsm("Reducere ăîș „bun”"), [], "diacriticele si ghilimelele nu sunt o problema: se normalizeaza");
});

test("dezabonarea e garantata, o singura data", () => {
  assert.equal(cuDezabonare("Salut"), `Salut Dezabonare: ${ETICHETA_DEZABONARE}`);
  assert.equal(cuDezabonare(`Salut ${ETICHETA_DEZABONARE}`), `Salut ${ETICHETA_DEZABONARE}`);
  assert.ok(textDeTrimis("Oferta!", { prenume: "Ana", magazin: "X" }).includes(ETICHETA_DEZABONARE));
});

test("variabilele: prenumele lipsa nu lasa „Salut ,”", () => {
  assert.equal(punVariabile("Salut {prenume}, vezi {magazin}!", { prenume: "Ana", magazin: "Casa" }), "Salut Ana, vezi Casa!");
  assert.equal(punVariabile("Salut {prenume}, vezi oferta!", { prenume: null, magazin: "Casa" }), "Salut, vezi oferta!");
});

test("estimarea socoteste legatura de dezabonare si un prenume obisnuit", () => {
  const e = estimeazaMesaj("a".repeat(120), "Magazin");
  assert.equal(e.adaugaDezabonare, true);
  assert.equal(e.parti, 2, "120 de caractere + „ Dezabonare: ” + legatura trec de 160");
  assert.equal(costEstimatEurocenti(100, 2, null), 700);
  assert.equal(costEstimatEurocenti(100, 1, 3.2), 320);
});

test("filtrele venite din browser se curata inainte de SQL", () => {
  assert.deepEqual(curataFiltre({
    date_from: "2026-01-01", date_to: "1 ianuarie", min_amount: "-5", order_statuses: ["delivered", "hacked"],
    counties: ["Cluj", 7], categorie: "  Lampi ", min_comenzi: 2.7, inactivi_zile: "90",
  }), { date_from: "2026-01-01", order_statuses: ["delivered"], counties: ["Cluj"], categorie: "Lampi", min_comenzi: 2, inactivi_zile: 90 });
  assert.deepEqual(curataFiltre(null), {});
  assert.equal(telefonMascat("753639611"), "07•• ••• 611");
});
