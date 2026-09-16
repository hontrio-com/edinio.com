import { strict as assert } from "node:assert";
import { test, describe } from "node:test";

import { localitateaExpedierii, localitateShipo } from "./localitati";
import { corpExpediere, corpTarife } from "./expediere";
import type { ShipoConfig } from "./client";

/*
 * ⚠⚠ JUDETUL NU AJUNGEA NICIODATA LA SHIPO, IAR OMONIMELE PLECAU UNDE VOIAU EI.
 *
 * `oras_sosire` e una dintre denumirile vechi pe care Shipo le pastreaza pentru
 * integrarile existente, si documentatia lor spune limpede ce asteapta campul:
 *
 *   „Ele asteapta localitatea intr-un singur camp, in formatul «Oras, Judet»."
 *
 * Noi trimiteam doar numele orasului. Iar regula lor de potrivire e scrisa tot
 * acolo, in acelasi paragraf:
 *
 *   „Daca in acelasi judet exista mai multe localitati cu acelasi nume, adauga
 *    municipality sau foloseste ID-ul, ALTFEL SE IA PRIMA POTRIVIRE."
 *
 * Fara judet, „prima potrivire" nu se mai cauta intr-un judet: se cauta in toata
 * tara.
 *
 * ⚠ Si nu e o teama teoretica. Chiar `/city` al lor intoarce omonime, iar
 * integrarea noastra are deja scris in `orasulPotrivit` ca „Victoria" exista in
 * PATRU judete (Brasov, Iasi, Braila, Vaslui). Coletul pleca in alt judet cu HTTP
 * 200, cu AWB valid, fara nicio urma. Comerciantul afla de la client.
 *
 * ⚠ Defectul era ascuns tocmai fiindca partea grea fusese deja rezolvata: la
 * CAUTAREA punctelor, `orasulPotrivit` cere si judetul si refuza ambiguitatea. La
 * EXPEDIERE, unde conteaza cel mai mult, judetul nu pleca deloc.
 *
 * ═══ CE APARA PROBELE ═══
 *
 *   1. judetul pleaca lipit de oras, in forma ceruta de ei;
 *   2. ⚠ Bucurestiul FACE EXCEPTIE, si tot ei o cer: „Pentru Bucuresti se trimite
 *      doar city: «Bucuresti», FARA judet, impreuna cu sector";
 *   3. nu se inventeaza un judet cand comanda n-are niciunul;
 *   4. ⚠ `/rates` ramane cu numele SINGUR: acolo `delivery_city` e documentat ca
 *      „Orasul de livrare", cu exemplul „Cluj-Napoca". Doua campuri, doua reguli.
 */

const CONFIG: ShipoConfig = { enabled: true, api_key: "cheie", sender_address_id: 7 };

const DESTINATAR = {
  nume: "Ion Popescu",
  strada: "Strada Morii 12",
  oras: "Victoria",
  judet: "Brasov",
  telefon: "0721000000",
  email: "ion@exemplu.ro",
};

const LA_ADRESA = { id: 10, recipient_address_type: "address" as const, sender_address_type: "address" as const };

function corp(peste: Record<string, unknown> = {}) {
  return corpExpediere(
    CONFIG,
    { destinatar: { ...DESTINATAR, ...peste }, greutateKg: 2, felLivrare: "domiciliu" },
    LA_ADRESA,
  ) as Record<string, unknown>;
}

describe("Shipo: judetul pleaca lipit de oras, asa cum cere campul vechi", () => {
  test("forma e chiar cea din documentatia lor", () => {
    assert.equal(localitateaExpedierii("Cluj-Napoca", "Cluj"), "Cluj-Napoca, Cluj");
  });

  /* ⚠ Chiar defectul: doua „Victoria" din judete diferite trebuie sa plece DIFERIT. */
  test("doua localitati omonime nu mai pleaca identic", () => {
    const brasov = localitateaExpedierii("Victoria", "Brasov");
    const iasi = localitateaExpedierii("Victoria", "Iasi");
    assert.notEqual(brasov, iasi, "omonimele pleaca la fel: Shipo ia prima potrivire din tara");
    assert.equal(brasov, "Victoria, Brasov");
    assert.equal(iasi, "Victoria, Iasi");
  });

  test("judetul se curata de „Judetul” si „Municipiul”, si de diacritice", () => {
    assert.equal(localitateaExpedierii("Sibiu", "Judetul Sibiu"), "Sibiu, Sibiu");
    assert.equal(localitateaExpedierii("Bacau", "Bacău"), "Bacau, Bacau");
  });

  test("nu se pune de doua ori daca numele il poarta deja", () => {
    assert.equal(localitateaExpedierii("Victoria, Brasov", "Brasov"), "Victoria, Brasov");
  });

  /*
   * ⚠ Fara judet nu se inventeaza unul. Mai bine ambiguitatea LOR decat un judet
   * pus de noi: comanda fara judet e oprita oricum de `lipsuriExpediere`.
   */
  test("comanda fara judet pleaca cu numele singur", () => {
    assert.equal(localitateaExpedierii("Victoria", null), "Victoria");
    assert.equal(localitateaExpedierii("Victoria", "   "), "Victoria");
  });

  /*
   * ⚠ BUCURESTIUL, exceptia scrisa de ei: „se trimite doar city «Bucuresti», FARA
   * judet, impreuna cu sector". Un „Bucuresti, Bucuresti" ar fi chiar forma pe
   * care documentatia o exclude.
   */
  test("Bucurestiul pleaca SINGUR, fara judet", () => {
    for (const [oras, judet] of [
      ["Sector 3", "Bucuresti"],
      ["Bucuresti", "Municipiul Bucuresti"],
      ["bucuresti sector 5", null],
      ["București", "București"],
    ] as const) {
      const r = localitateaExpedierii(oras, judet);
      assert.equal(r, "Bucuresti", `„${oras}" / „${judet}" a plecat ca „${r}"`);
      assert.doesNotMatch(r, /,/);
    }
  });
});

/*
 * ⚠ MUTANTUL PE APELANT.
 *
 * Ajutorul poate fi corect si tot degeaba, daca `corpExpediere` cheama in
 * continuare varianta fara judet. Si invers: `/rates` NU trebuie sa primeasca
 * judetul, fiindca acolo campul e altul, cu alta regula.
 */
describe("Shipo: expedierea primeste judetul, cotarea nu", () => {
  test("`oras_sosire` poarta judetul", () => {
    assert.equal(corp().oras_sosire, "Victoria, Brasov");
  });

  test("`oras_sosire` NU poarta judetul in Bucuresti, dar sectorul pleaca separat", () => {
    const c = corp({ oras: "Bucuresti, Sector 3", judet: "Bucuresti" });
    assert.equal(c.oras_sosire, "Bucuresti");
    assert.equal(c.recipient_address_sector, 3);
  });

  /*
   * ⚠ `delivery_city` de la `/rates` e documentat ca „Orasul de livrare", cu
   * exemplul „Cluj-Napoca". Lipit cu judetul acolo, cotarea ar putea sa nu mai
   * gaseasca nimic, iar cumparatorul ar ramane fara optiuni de livrare: pretul
   * fix in loc de cel real, tacut.
   */
  test("cotarea ramane cu numele SINGUR", () => {
    const t = corpTarife(CONFIG, { destinatar: DESTINATAR, greutateKg: 2, felLivrare: "domiciliu" });
    assert.equal(t.delivery_city, "Victoria");
    assert.equal(localitateShipo("Victoria", "Brasov"), "Victoria");
  });
});
