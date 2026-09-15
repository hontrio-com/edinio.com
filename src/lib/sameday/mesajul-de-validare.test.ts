import { test } from "node:test";
import assert from "node:assert/strict";
import { greselileSameday, mesajulDeValidareSameday } from "./mesajul-de-validare";

/*
 * Forma e copiata dupa parserul din SDK-ul lor oficial
 * (`Sameday/Exceptions/SamedayBadRequestException.php::parseErrors`), care coboara pe
 * `errors.children` la varf si pe `children` mai jos.
 */
const RESPINS_LOCALITATE = {
  error: {
    code: 400,
    message: "Validation Failed",
    errors: {
      children: {
        awbRecipient: {
          children: {
            cityString: { errors: ["This value is not valid."] },
            address: { children: {} },
          },
        },
      },
    },
  },
};

test("campul vinovat iese din arbore, nu se pierde in el", () => {
  const greseli = greselileSameday(RESPINS_LOCALITATE);
  assert.deepEqual(greseli, [
    { camp: "awbRecipient.cityString", mesaje: ["This value is not valid."] },
  ]);
});

test("comerciantul citeste care camp e de vina, pe romaneste", () => {
  const mesaj = mesajulDeValidareSameday(RESPINS_LOCALITATE);
  assert.equal(mesaj, "Localitatea destinatarului: This value is not valid.");
});

test("textul LOR ramane neatins: numai eticheta campului se traduce", () => {
  /* Daca am traduce si mesajul, un text nou de-al lor ar fi ascuns sub unul vechi de-al
     nostru. Proba tine asta pe loc. */
  const mesaj = mesajulDeValidareSameday({
    errors: { children: { cashOnDelivery: { errors: ["Ceva nou pe care nu-l stim"] } } },
  });
  assert.equal(mesaj, "Valoarea rambursului: Ceva nou pe care nu-l stim");
});

test("un camp pe care nu-l traducem se vede cu numele LOR, nu dispare", () => {
  const mesaj = mesajulDeValidareSameday({
    errors: { children: { campNouDeAlLor: { errors: ["nu merge"] } } },
  });
  assert.equal(mesaj, "campNouDeAlLor: nu merge");
});

test("mai multe campuri respinse se vad TOATE", () => {
  const mesaj = mesajulDeValidareSameday({
    error: {
      errors: {
        children: {
          awbRecipient: {
            children: {
              cityString: { errors: ["oras necunoscut"] },
              countyString: { errors: ["judet necunoscut"] },
            },
          },
        },
      },
    },
  });
  assert.ok(mesaj);
  assert.ok(mesaj.includes("Localitatea destinatarului: oras necunoscut"), mesaj);
  assert.ok(mesaj.includes("Judetul destinatarului: judet necunoscut"), mesaj);
});

test("o eroare fara camp isi pastreaza propozitia, fara doua puncte in fata", () => {
  assert.equal(mesajulDeValidareSameday({ errors: ["Contul nu are serviciul cerut"] }),
    "Contul nu are serviciul cerut");
});

test("fara validari se intoarce null, ca apelantul sa-si pastreze mesajul lui", () => {
  assert.equal(mesajulDeValidareSameday({ error: { message: "Validation Failed" } }), null);
  assert.equal(mesajulDeValidareSameday({ awbNumber: "1ONB1" }), null);
  assert.equal(mesajulDeValidareSameday(null), null);
  assert.equal(mesajulDeValidareSameday("nu e json"), null);
  assert.equal(mesajulDeValidareSameday([1, 2, 3]), null);
});

test("un arbore care se intoarce in el insusi nu invarte parserul la nesfarsit", () => {
  /* Nu e un capriciu: `coboara` merge pe adancime, iar un raspuns stricat n-are voie sa
     blocheze emiterea unui AWB care POATE chiar a plecat. */
  const nod: Record<string, unknown> = { errors: ["adanc"] };
  nod.children = { iar: nod };
  assert.doesNotThrow(() => mesajulDeValidareSameday(nod));
});
