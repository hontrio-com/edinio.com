import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import type { CurieraConfig } from "./client";
import { FANBOX_MAX_WEIGHT_KG } from "@/lib/fancourier";
import {
  GREUTATE_MAXIMA_LOCKER_KG,
  adresaCuSector,
  ascii,
  lipsuriExpediereCuriera,
  optiuniAwbCuriera,
  parametriExpediereCuriera,
  referintaCuriera,
  type DateExpediereCuriera,
} from "./expediere";

const CONFIG: CurieraConfig = {
  enabled: true,
  api_key: "k",
  expeditor: {
    nume: "Magazinul Știință", persoana_contact: "Ana", telefon: "+40 740 000 000", email: "a@b.ro",
    adresa: "Strada Mărășești nr. 3", oras: "Timișoara", judet: "Județul Timiș", cod_postal: "300001",
  },
};

const DATE: DateExpediereCuriera = {
  destinatar: {
    nume: "Ion Popescu", telefon: "0750 000 000", email: "ion@x.ro",
    adresa: "Bd. Unirii nr. 5, bl. A1", oras: "Sector 3", judet: "București", codPostal: "030167",
  },
  greutateKg: 1.5,
  colete: 1,
  referinta: "EDN-AB12-0042",
};

describe("textul pleaca in ASCII", () => {
  /*
   * Masurat pe eticheta tiparita, 29.09.2026: „ș"/„ț" cu virgula iesisera „?", iar „â"/„î"
   * caractere de inlocuire. Numai sedila si „ă" treceau.
   */
  test("toate formele romanesti, si cu virgula si cu sedila", () => {
    assert.equal(ascii("Ștefan Țărănescu Âî ş ţ"), "Stefan Taranescu Ai s t");
  });

  test("alte diacritice si punctuatia tipografica", () => {
    assert.equal(ascii("Forgács Józsefné – „Kelet” … "), "Forgacs Jozsefne - \"Kelet\" ...");
  });

  test("ce ramane in afara ASCII se scoate, nu devine „?”", () => {
    assert.equal(ascii("Magazin ★ 😀 bun"), "Magazin bun");
    assert.equal(ascii(null), "");
  });

  test("nicio valoare trimisa nu are caractere in afara ASCII", () => {
    const p = parametriExpediereCuriera(CONFIG, { ...DATE, continut: "Ciorapi și șosete", observatii: "Sunați înainte" });
    for (const [k, v] of Object.entries(p)) {
      assert.match(v, /^[\x20-\x7e]*$/, `${k} = ${v}`);
    }
    assert.equal(p.from_name, "Magazinul Stiinta");
    assert.equal(p.from_city, "Timisoara");
    assert.equal(p.from_county, "Timis");
    assert.equal(p.content, "Ciorapi si sosete");
  });
});

describe("adresa si sectorul", () => {
  /*
   * ⚠ Masurat: `to_sector` langa `to_address` se PIERDE (nu apare nici pe eticheta). Deci
   * sectorul se scrie in linie, iar orasul pleaca „Bucuresti".
   */
  test("sectorul din oras intra in linia de adresa", () => {
    const p = parametriExpediereCuriera(CONFIG, DATE);
    assert.equal(p.to_address, "Bd. Unirii nr. 5, bl. A1, Sector 3");
    assert.equal(p.to_city, "Bucuresti");
    assert.equal(p.to_county, "Bucuresti");
    assert.equal(p.to_sector, undefined);
  });

  test("sectorul depozitului din Bucuresti intra si el in linie", () => {
    const p = parametriExpediereCuriera(
      { ...CONFIG, expeditor: { ...CONFIG.expeditor, adresa: "Str. Florilor 10", oras: "Sector 2", judet: "Municipiul Bucuresti" } },
      DATE,
    );
    assert.equal(p.from_address, "Str. Florilor 10, Sector 2");
    assert.equal(p.from_city, "Bucuresti");
    assert.equal(p.from_county, "Bucuresti");
  });

  test("linia care pomeneste deja un sector ramane cum e", () => {
    assert.equal(adresaCuSector("Str. X 1, sector 4", "Bucuresti", "Bucuresti"), "Str. X 1, sector 4");
  });

  test("⚠ sectorul nu se ghiceste", () => {
    assert.equal(adresaCuSector("Str. X 1", "Bucuresti", "Bucuresti"), "Str. X 1");
  });

  test("in afara Bucurestiului nu se adauga nimic", () => {
    assert.equal(adresaCuSector("Str. X 1", "Cluj-Napoca", "Cluj"), "Str. X 1");
  });

  test("⚠ niciodata „Str.” adaugat de ei: pleaca `to_address`, nu `to_str`", () => {
    const p = parametriExpediereCuriera(CONFIG, DATE);
    assert.equal(p.to_str, undefined);
    assert.equal(p.from_address, "Strada Marasesti nr. 3");
    assert.equal(p.from_str, undefined);
  });
});

describe("punctul de ridicare", () => {
  test("cu punct pleaca serviciul de punct si id-ul, fara sector adaugat", () => {
    const p = parametriExpediereCuriera(
      { ...CONFIG, serviciu_punct: "LOCKERE" },
      { ...DATE, punctId: "16478", destinatar: { ...DATE.destinatar, adresa: "Bd. Theodor Pallady 51", oras: "Bucuresti", judet: "Bucuresti" } },
    );
    assert.equal(p.service_type, "LOCKERE");
    assert.equal(p.to_delivery_location, "16478");
    assert.equal(p.to_address, "Bd. Theodor Pallady 51");
  });

  test("fara punct pleaca serviciul de adresa (implicit „standard”)", () => {
    const p = parametriExpediereCuriera(CONFIG, DATE);
    assert.equal(p.service_type, "standard");
    assert.equal(p.to_delivery_location, undefined);
  });

  test("id de punct nenumeric nu trece de lipsuri", () => {
    assert.ok(lipsuriExpediereCuriera(CONFIG, { ...DATE, punctId: "abc" }).some((l) => l.includes("punct")));
  });
});

describe("campurile", () => {
  test("telefoanele se normalizeaza la forma locala", () => {
    const p = parametriExpediereCuriera(CONFIG, DATE);
    assert.equal(p.from_phone, "0740000000");
    assert.equal(p.to_phone, "0750000000");
  });

  test("rambursul si asigurarea pleaca doar cand sunt peste zero, cu doua zecimale", () => {
    const fara = parametriExpediereCuriera(CONFIG, DATE);
    assert.equal(fara.ramburs, undefined);
    assert.equal(fara.insurance, undefined);
    const cu = parametriExpediereCuriera(CONFIG, { ...DATE, ramburs: 123.456, valoareAsigurata: 200 });
    assert.equal(cu.ramburs, "123.46");
    assert.equal(cu.insurance, "200");
  });

  test("⚠ `ramburs_type` nu se trimite (contractul il hotaraste, masurat)", () => {
    const p = parametriExpediereCuriera(CONFIG, { ...DATE, ramburs: 50 });
    assert.equal(p.ramburs_type, undefined);
  });

  test("⚠ serviciile extra pleaca cu „true”, niciodata „1”", () => {
    const p = parametriExpediereCuriera(CONFIG, { ...DATE, serviciiExtra: ["443", "443", " 616 ", "x"] });
    assert.equal(p.service_443, "true");
    assert.equal(p.service_616, "true");
    assert.equal(Object.keys(p).filter((k) => /^service_\d+$/.test(k)).length, 2);
  });

  test("greutatea se imparte egal pe colete, cu dimensiunile pe fiecare", () => {
    const p = parametriExpediereCuriera(CONFIG, {
      ...DATE, colete: 2, greutateKg: 5, dimensiuni: { lungime: 30, latime: 20, inaltime: 10 },
    });
    assert.equal(p.cnt, "2");
    assert.equal(p.weight, "2.5");
    assert.equal(p.weight2, "2.5");
    assert.equal(p.length2, "30");
    assert.equal(p.weight3, undefined);
  });

  test("continutul cade pe cel implicit din configurare", () => {
    const p = parametriExpediereCuriera({ ...CONFIG, continut_implicit: "Îmbrăcăminte" }, DATE);
    assert.equal(p.content, "Imbracaminte");
  });

  test("referinta si tipul pleaca mereu", () => {
    const p = parametriExpediereCuriera(CONFIG, DATE);
    assert.equal(p.customer_reference, "EDN-AB12-0042");
    assert.equal(p.type, "package");
    assert.equal(p.to_country, "RO");
  });
});

describe("lipsurile, singura plasa", () => {
  /*
   * ⚠ „There are no mandatory fields except api_key": un camp lipsa nu da eroare la ei, da o
   * CIORNA care nu pleaca. Deci tot ce stim ca le trebuie se opreste aici.
   */
  test("o comanda completa n-are lipsuri", () => {
    assert.deepEqual(lipsuriExpediereCuriera(CONFIG, DATE), []);
  });

  test("fara telefon, adresa sau greutate", () => {
    const l = lipsuriExpediereCuriera(CONFIG, {
      ...DATE, greutateKg: 0, destinatar: { ...DATE.destinatar, telefon: "", adresa: "" },
    });
    assert.ok(l.includes("telefonul destinatarului"));
    assert.ok(l.includes("adresa destinatarului"));
    assert.ok(l.includes("greutatea coletului"));
  });

  test("la punct adresa nu e ceruta", () => {
    const l = lipsuriExpediereCuriera(CONFIG, { ...DATE, punctId: "16478", destinatar: { ...DATE.destinatar, adresa: "" } });
    assert.deepEqual(l, []);
  });

  test("expeditorul incomplet se spune ca e din configurare", () => {
    const l = lipsuriExpediereCuriera({ ...CONFIG, expeditor: { ...CONFIG.expeditor, oras: "" } }, DATE);
    assert.deepEqual(l, ["orasul de ridicare (configurarea Curiera)"]);
  });

  test("doua dimensiuni din trei nu trec", () => {
    const l = lipsuriExpediereCuriera(CONFIG, { ...DATE, dimensiuni: { lungime: 10, latime: 10, inaltime: 0 } });
    assert.ok(l.some((x) => x.includes("dimensiunile")));
  });
});

describe("lockerul FANbox", () => {
  const LA_LOCKER: DateExpediereCuriera = {
    ...DATE, punctId: "16478", punctLocker: true, destinatar: { ...DATE.destinatar, adresa: "" },
  };

  test("⚠ un singur colet, de cel mult 30 kg, si la emitere (checkoutul opreste doar cosul)", () => {
    assert.deepEqual(lipsuriExpediereCuriera(CONFIG, LA_LOCKER), []);
    assert.ok(lipsuriExpediereCuriera(CONFIG, { ...LA_LOCKER, colete: 2 }).some((l) => l.includes("un singur colet")));
    assert.ok(lipsuriExpediereCuriera(CONFIG, { ...LA_LOCKER, greutateKg: 34 }).some((l) => l.includes("30 kg")));
  });

  test("pudo si oficiile (fara steag) n-au limita publicata, deci nu se opresc", () => {
    assert.deepEqual(lipsuriExpediereCuriera(CONFIG, { ...LA_LOCKER, punctLocker: false, colete: 2, greutateKg: 40 }), []);
  });

  test("pragul e acelasi cu al checkoutului (FANBOX_MAX_WEIGHT_KG)", () => {
    assert.equal(GREUTATE_MAXIMA_LOCKER_KG, FANBOX_MAX_WEIGHT_KG);
  });
});

describe("optiunile ferestrei AWB", () => {
  test("⚠ numai cele trei campuri: cheia API nu pleaca in browser", () => {
    const o = optiuniAwbCuriera({ ...CONFIG, api_key: "secret", asigurare: true, servicii_extra: ["443"], continut_implicit: "  Haine " });
    assert.deepEqual(Object.keys(o).sort(), ["asigurare", "continutImplicit", "serviciiExtra"]);
    assert.deepEqual(o, { asigurare: true, serviciiExtra: ["443"], continutImplicit: "Haine" });
    assert.ok(!JSON.stringify(o).includes("secret"));
  });

  test("fara configurare, totul stins si gol", () => {
    assert.deepEqual(optiuniAwbCuriera(null), { asigurare: false, serviciiExtra: [], continutImplicit: "" });
  });
});

describe("referinta", () => {
  test("poarta o bucata din magazin, ca doua magazine pe acelasi cont sa nu se incurce", () => {
    assert.equal(referintaCuriera("ab12cd34-0000-4000-8000-000000000000", "#0042"), "EDN-AB12-0042");
    assert.equal(referintaCuriera("ab12cd34-0000-4000-8000-000000000000", 7), "EDN-AB12-7");
  });
});
