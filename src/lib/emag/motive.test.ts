import { strict as assert } from "node:assert";
import { test } from "node:test";
import { eRespinsaDeEmag, motiveDeLaEi } from "./motive";

/*
 * ═══ 152 DE PRODUSE REFUZATE, ZERO MOTIVE ARATATE (audit 24.08.2026) ═══
 *
 * Masurat pe contul unui comerciant: 112 oferte cu documentatia respinsa, 34 blocate,
 * 6 cu EAN respins — si la TOATE 152, `doc_errors` gol.
 *
 * `doc_errors` era o presupunere de-a noastra: raspunsul lui `product_offer/read` NU e
 * in schema lor. Exact ca `ownership`, care s-a dovedit `boolean` acolo unde
 * documentatia scrie 1/2.
 *
 * Planul integrarii scrie chiar asta ca greseala de evitat (§12.9, lectia Trendyol):
 * motivul respingerii n-a fost aratat, iar produsele au stat „in aprobare" la
 * nesfarsit, cu comerciantul convins ca noi le tinem pe loc.
 */

test("eMAG motive: se culege din `doc_errors`, forma pe care o asteptam", () => {
  assert.deepEqual(motiveDeLaEi({ doc_errors: ["Lipseste marca", "EAN invalid"] }),
    ["Lipseste marca", "EAN invalid"]);
});

test("eMAG motive: se culege si din celelalte forme plauzibile", () => {
  /* ⚠ Nu se mai ghiceste O cheie. Cauza intregii probleme a fost ca am ales una
     singura si am crezut-o. */
  assert.deepEqual(motiveDeLaEi({ errors: [{ message: "Imagine inaccesibila" }] }),
    ["Imagine inaccesibila"]);
  assert.deepEqual(motiveDeLaEi({ validation_errors: "Categorie interzisa" }),
    ["Categorie interzisa"]);
  assert.deepEqual(motiveDeLaEi({ messages: [{ text: "Pret in afara benzii" }] }),
    ["Pret in afara benzii"]);
});

test("eMAG motive: dintr-un obiect se ia TEXTUL, nu tot obiectul", () => {
  /* ⚠ Luat intreg si serializat, motivul ar fi ajuns pe ecran ca
     `{"field":"ean","code":17}` — o forma cu care omul n-are ce face. */
  assert.deepEqual(
    motiveDeLaEi({ doc_errors: [{ field: "ean", code: 17, message: "EAN deja folosit" }] }),
    ["EAN deja folosit"],
  );
});

test("eMAG motive: acelasi motiv sub doua chei ramane unul singur", () => {
  assert.deepEqual(
    motiveDeLaEi({ doc_errors: ["Lipseste marca"], errors: ["Lipseste marca"] }),
    ["Lipseste marca"],
  );
});

test("eMAG motive: fara niciun motiv se intoarce lista goala, nu zgomot", () => {
  /* ⚠ Si asta E o informatie: o oferta respinsa fara motiv scris inseamna ca motivul e
     numai in panoul lor, iar ecranul trebuie sa spuna chiar asta. */
  for (const gol of [null, undefined, {}, "text", 7, { alta_cheie: "x" }]) {
    assert.deepEqual(motiveDeLaEi(gol), [], JSON.stringify(gol));
  }
});

test("eMAG motive: un motiv urias se taie, ca sa poata fi citit", () => {
  const r = motiveDeLaEi({ doc_errors: ["x".repeat(3000)] });
  assert.equal(r.length, 1);
  assert.ok(r[0].length <= 401, `${r[0].length} caractere`);
});

test("eMAG motive: care stari inseamna „respins”", () => {
  /* 5 marca · 6 EAN · 8 documentatie · 10 blocat · 12 actualizare respinsa */
  for (const s of [5, 6, 8, 10, 12]) assert.equal(eRespinsaDeEmag(s), true, `${s}`);
  /* 9 aprobat · 4 in validare · 1 in asteptare · 3 asteapta EAN · 11 actualizare */
  for (const s of [1, 3, 4, 9, 11, null, undefined]) {
    assert.equal(eRespinsaDeEmag(s), false, `${s}`);
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   MOTIVUL DIN LOCUL LUI ADEVARAT (masurat pe 154 de oferte respinse)
   ══════════════════════════════════════════════════════════════════════════ */

/** Forma EXACTA venita de la ei, copiata dintr-un `raspuns_brut` din productie. */
const RASPUNS_ADEVARAT = {
  id: 4046,
  name: "Bluza Fitness Indi-Go Geo",
  doc_errors: [],
  validation_status: [{
    value: 8,
    errors: {
      errors: [{
        code: "naming:standardFailure:size",
        value: null,
        message: {
          bg_BG: "...",
          en_GB: "Size - Please add the size in the name of the product...",
          ro_RO: "Marime - Te rugam sa adaugi marimea produsului sau sa corectezi informatiile care nu coincid cu restul documentatiei.",
        },
        section: "name",
        extraInfo: "",
        identifier: null,
        description: null,
      }],
      warnings: [],
    },
    description: "Documentation rejected",
  }],
};

test("motivul se culege din `validation_status[].errors.errors[].message.ro_RO`", () => {
  /*
   * ⚠ Chiar gaura care lasa 154 de produse respinse fara niciun motiv pe ecran.
   * `doc_errors` la nivel de oferta e GOL la toate — motivul e ingropat aici.
   */
  const m = motiveDeLaEi(RASPUNS_ADEVARAT);
  assert.equal(m.length, 1, "un motiv, nu trei traduceri ale lui");
  assert.ok(m[0].startsWith("Marime - Te rugam"), `romana, nu engleza: ${m[0]}`);
});

test("mesajul se ia in romana, nu in toate limbile", () => {
  /* ⚠ Fara alegerea limbii, acelasi motiv ajungea pe ecran de trei ori. */
  const m = motiveDeLaEi(RASPUNS_ADEVARAT);
  assert.ok(!m.some((t) => t.includes("Please add the size")), "engleza n-are ce cauta");
  assert.ok(!m.some((t) => t === "..."), "nici bulgara");
});

test("`extraInfo` se lipeste de mesaj: fara el, motivul nu spune CE lipseste", () => {
  /* „Caracteristici mandatory lipsa" e adevarat si nefolositor. `extraInfo` spune care. */
  const m = motiveDeLaEi({
    validation_status: [{
      value: 8,
      errors: { errors: [{
        code: "MISSING_MANDATORY_CHARACTERISTICS",
        message: { ro_RO: "Caracteristica/Caracteristici mandatory lipsa." },
        extraInfo: "The product must have both size and converted size values.",
      }] },
    }],
  });
  assert.equal(
    m[0],
    "Caracteristica/Caracteristici mandatory lipsa. (The product must have both size and converted size values.)",
  );
});

test("avertismentele se citesc si ele, dupa erori", () => {
  /*
   * ⚠ Masurat: din 114 oferte cu documentatia respinsa, 27 au NUMAI avertismente. Citite
   * doar erorile, acelea 27 ar fi ramas tot fara motiv — desi „Brand invalid… te rugam
   * sa o corectezi" e exact ce are omul de facut.
   */
  const m = motiveDeLaEi({
    validation_status: [{
      value: 8,
      errors: {
        errors: [{ message: { ro_RO: "Eroarea" } }],
        warnings: [{ message: { ro_RO: "Avertismentul" } }],
      },
    }],
  });
  assert.deepEqual(m, ["Eroarea", "Avertismentul"], "erorile intai");
});

test("notele de tip `info` NU sunt motive", () => {
  /*
   * ⚠ 52 din cele 154 au numai note ca „Valoarea «Bumbac» de pe caracteristica
   * «Material» a fost generata automat". Aratate ca motiv al respingerii, l-ar fi
   * trimis pe om sa repare ceva ce nu e stricat. Pentru ele ecranul spune cinstit ca
   * eMAG n-a trimis niciun motiv.
   */
  const m = motiveDeLaEi({
    validation_status: [{
      value: 8,
      errors: { info: [{ message: { ro_RO: "Valoarea a fost generata automat." } }] },
    }],
  });
  assert.deepEqual(m, []);
});

test("o oferta fara nimic scris intoarce lista goala, nu un obiect serializat", () => {
  assert.deepEqual(motiveDeLaEi({ validation_status: [{ value: 10, errors: null, description: "Blocked" }] }), []);
});
