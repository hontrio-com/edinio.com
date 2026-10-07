import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import type { LocalitateEpacket } from "./client";
import {
  alegeLocalitatea, cheieLocalitate, codJudet, comunaDinOras, formeleOrasului, localitatiPentruOras, numeleLocalitatii, rezolvaLocalitatea,
  sectorulAdresei, type CautaLocalitati,
} from "./localitati";

/*
 * Un decupaj REAL din nomenclatorul e-packet, descarcat intreg pe 07.10.2026 (14.179 de
 * localitati). Numele si id-urile sunt ale lor, cu majusculele si parantezele lor.
 */
const NOMENCLATOR: LocalitateEpacket[] = [
  { id: 114, nume: "Campia turzii", afisare: "Campia Turzii (Cluj)", judet: "CJ" },
  { id: 113, nume: "Gherla", afisare: "Gherla (Cluj)", judet: "CJ" },
  { id: 109, nume: "CLUJ NAPOCA", afisare: "Cluj Napoca (Cluj)", judet: "CJ" },
  { id: 6863, nume: "Agarbiciu", afisare: "Agarbiciu (Cluj)", judet: "CJ" },
  { id: 175, nume: "PIATRA NEAMT", afisare: "Piatra Neamt (Neamț)", judet: "NT" },
  { id: 10128, nume: "Valeni (Piatra Neamt)", afisare: "Valeni (Piatra Neamt) (Neamț)", judet: "NT" },
  { id: 10674, nume: "Victoria (Hlipiceni)", afisare: "Victoria (Hlipiceni) (Botoșani)", judet: "BT" },
  { id: 12742, nume: "Victoria (Stauceni)", afisare: "Victoria (Stauceni) (Botoșani)", judet: "BT" },
  { id: 431, nume: "RAMNICU VALCEA", afisare: "Ramnicu Valcea (Vâlcea)", judet: "VL" },
  { id: 13277, nume: "Cazanesti (Ramnicu Valcea)", afisare: "Cazanesti (Ramnicu Valcea) (Vâlcea)", judet: "VL" },
  { id: 7953, nume: "Salistea", afisare: "Salistea (Vâlcea)", judet: "VL" },
  { id: 14614, nume: "SALISTEA", afisare: "Salistea (Ramnicu Valcea) (Valcea)", judet: "VL" },
  { id: 14616, nume: "SALISTEA", afisare: "Salistea (Malaia) (Valcea)", judet: "VL" },
  { id: 14758, nume: "Salistea (Goranu)", afisare: "Salistea (Goranu) (Valcea)", judet: "VL" },
  { id: 14515, nume: "Sectorul 1 (Bucuresti)", afisare: "Sectorul 1 (Bucuresti)", judet: "B" },
  { id: 14516, nume: "Sectorul 2 (Bucuresti)", afisare: "Sectorul 2 (Bucuresti)", judet: "B" },
  { id: 14517, nume: "Sectorul 3 (Bucuresti)", afisare: "Sectorul 3 (Bucuresti)", judet: "B" },
  { id: 14518, nume: "Sectorul 4 (Bucuresti)", afisare: "Sectorul 4 (Bucuresti)", judet: "B" },
  { id: 14519, nume: "Sectorul 5 (Bucuresti)", afisare: "Sectorul 5 (Bucuresti)", judet: "B" },
  { id: 14520, nume: "Sectorul 6 (Bucuresti)", afisare: "Sectorul 6 (Bucuresti)", judet: "B" },
  { id: 4759, nume: "Olari", afisare: "Olari (Prahova)", judet: "PH" },
  { id: 5176, nume: "Olarii Vechi", afisare: "Olarii Vechi (Prahova)", judet: "PH" },
  { id: 4623, nume: "Rosu", afisare: "Rosu (Ilfov)", judet: "IF" },
  { id: 104, nume: "IASI", afisare: "Iasi (Iași)", judet: "IS" },
  { id: 849, nume: "Motca", afisare: "Motca (Iași)", judet: "IS" },
  { id: 11341, nume: "Boureni (Bals)", afisare: "Boureni (Bals) (Iași)", judet: "IS" },
  { id: 5135, nume: "Boureni (Motca)", afisare: "Boureni (Motca) (Iași)", judet: "IS" },
  { id: 14528, nume: "Boureni (Targu Frumos) (Iasi)", afisare: "Boureni (Targu Frumos) (Iasi)", judet: "IS" },
  { id: 9833, nume: "Carbunesti Sat", afisare: "Carbunesti Sat (Gorj)", judet: "GJ" },
  { id: 461, nume: "Targu Carbunesti", afisare: "Targu Carbunesti (Gorj)", judet: "GJ" },
  { id: 394, nume: "DROBETA TURNU SEVERIN", afisare: "Drobeta Turnu Severin (Mehedinți)", judet: "MH" },
  { id: 487, nume: "SFANTU GHEORGHE", afisare: "Sfantu Gheorghe (Covasna)", judet: "CV" },
  { id: 11806, nume: "Iasi", afisare: "Iasi (Brașov)", judet: "BV" },
  { id: 2429, nume: "Tantava", afisare: "Tantava (Giurgiu)", judet: "GR" },
  { id: 9292, nume: "Lespezi", afisare: "Lespezi (Argeș)", judet: "AG" },
  { id: 679, nume: "Valea Calugareasca", afisare: "Valea Calugareasca (Prahova)", judet: "PH" },
  { id: 11069, nume: "Schiau (Valea Calugareasca)", afisare: "Schiau (Valea Calugareasca) (Prahova)", judet: "PH" },
  { id: 400, nume: "TARGU MURES", afisare: "Targu Mures (Mureș)", judet: "MS" },
];

/**
 * Cautarea lor, imitata pe purtarea MASURATA: subsir, fara diacritice si cratime, si in numele
 * judetului din `display_name` („cluj" in CJ prinde si „Agarbiciu (Cluj)"). Fiecare cerere se
 * numara, ca proba sa vada si cate apeluri costa o rezolvare.
 */
function cautareFalsa() {
  const cereri: string[] = [];
  const cauta: CautaLocalitati = async (text, judet) => {
    cereri.push(`${text}|${judet}`);
    const k = cheieLocalitate(text);
    return NOMENCLATOR.filter((l) => l.judet === judet && cheieLocalitate(l.afisare).includes(k));
  };
  return { cauta, cereri };
}

describe("formele in care se cauta orasul", () => {
  test("textele adevarate din comenzi, fara nimic inventat", () => {
    assert.deepEqual(formeleOrasului("Cluj-Napoca"), ["cluj napoca"]);
    assert.deepEqual(formeleOrasului("com Olari sat Olarii Vechi"), ["olarii vechi", "olari"]);
    assert.deepEqual(formeleOrasului("Calinesti nr 40"), ["calinesti"]);
    assert.deepEqual(formeleOrasului("Balilesti 117087"), ["balilesti"]);
    assert.deepEqual(formeleOrasului("loc. Lacustenii de Sus, jud Valcea"), ["lacustenii de sus"]);
    assert.deepEqual(formeleOrasului("Rosu Ilfov", "Ilfov"), ["rosu ilfov", "rosu"]);
    assert.ok(formeleOrasului("Tg Carbunesti,").includes("targu carbunesti"));
    assert.ok(formeleOrasului("Dr Tr Severin").includes("drobeta turnu severin"));
    assert.ok(formeleOrasului("Rimnicu Vilcea").includes("ramnicu valcea"));
  });

  test("⚠⚠ judetul de la coada e doar REZERVA: „Ramnicu Valcea” nu devine „Ramnicu”", () => {
    /* Regresie prinsa pe 600 de comenzi reale: taiat inainte, pierdea 24 de comenzi. */
    assert.equal(formeleOrasului("Ramnicu Valcea", "Valcea")[0], "ramnicu valcea");
    assert.equal(formeleOrasului("Piatra Neamț", "Neamt")[0], "piatra neamt");
    assert.equal(formeleOrasului("Curtea de Arges", "Arges")[0], "curtea de arges");
  });

  test("satul scris de checkout ca „Sat (Comuna)”", () => {
    assert.deepEqual(formeleOrasului("Tantava (Gradinari)"), ["tantava"]);
    assert.equal(comunaDinOras("Tantava (Gradinari)"), "gradinari");
    assert.equal(comunaDinOras("Lespezi (Comuna Hârtiești)"), "hartiesti");
  });

  test("judetul de la coada se taie NUMAI cand e chiar judetul comenzii", () => {
    /* „Satu Mare" nu pierde „Mare" doar fiindca seamana a nume de judet. */
    assert.deepEqual(formeleOrasului("Satu Mare", "Satu Mare"), ["satu mare"]);
    assert.deepEqual(formeleOrasului("Gherla Cluj", "Alba"), ["gherla cluj"]);
  });

  test("comuna scrisa langa sat", () => {
    assert.equal(comunaDinOras("Boureni comuna Motca"), "motca");
    assert.equal(comunaDinOras("com Olari sat Olarii Vechi"), "olari");
    assert.equal(comunaDinOras("Cluj-Napoca"), null);
  });
});

describe("judetul si sectorul", () => {
  test("codul de judet al lor", () => {
    assert.equal(codJudet("Cluj"), "CJ");
    assert.equal(codJudet("Județul Iași"), "IS");
    assert.equal(codJudet("Municipiul București"), "B");
    assert.equal(codJudet("", "Sector 3"), "B");
    assert.equal(codJudet("", "București"), "B");
    assert.equal(codJudet("Atlantida"), null, "un judet necunoscut nu se ghiceste");
  });

  test("sectorul se cauta in oras, judet si strada, si nu se inventeaza", () => {
    assert.equal(sectorulAdresei("Sector 3", "Bucuresti"), 3);
    assert.equal(sectorulAdresei("Bucuresti", "Sectorul 4"), 4);
    assert.equal(sectorulAdresei("Bucuresti", "Bucuresti", "Str. Lunga 5, sector 2"), 2);
    assert.equal(sectorulAdresei("Bucuresti", "Bucuresti", "Calea Victoriei 12"), null);
  });
});

describe("alegerea din raspunsul lor", () => {
  test("⚠ subsirul nu e potrivire: „cluj” in CJ nu e Agarbiciu, iar Piatra Neamt nu e Valeni", () => {
    const r = alegeLocalitatea(NOMENCLATOR.filter((l) => l.judet === "CJ"), "Cluj Napoca", "CJ");
    assert.equal(r.fel, "unica");
    assert.equal(r.fel === "unica" && r.localitate.id, 109);
    const p = alegeLocalitatea(NOMENCLATOR.filter((l) => l.judet === "NT"), "Piatra-Neamț", "NT");
    assert.equal(p.fel === "unica" && p.localitate.id, 175);
  });

  test("⚠⚠ numele SCURTAT nu se completeaza: „Cluj” nu devine pe ghicite Cluj-Napoca", () => {
    /* Banc de mutanti, 07.10.2026: cu „contine” in loc de „egal”, nicio alta proba nu cadea. */
    assert.equal(alegeLocalitatea(NOMENCLATOR, "Cluj", "CJ").fel, "niciuna");
    assert.equal(alegeLocalitatea(NOMENCLATOR, "Piatra", "NT").fel, "niciuna");
  });

  test("acelasi nume in alt judet nu se ia: Iasi din Brasov nu e Iasi din Iasi", () => {
    const r = alegeLocalitatea(NOMENCLATOR, "Iasi", "IS");
    assert.equal(r.fel === "unica" && r.localitate.id, 104);
  });

  test("omonimele din acelasi judet NU se aleg singure", () => {
    const r = alegeLocalitatea(NOMENCLATOR, "Victoria", "BT");
    assert.equal(r.fel, "mai_multe");
    assert.deepEqual(r.fel === "mai_multe" && r.candidati.map((l) => l.id).sort(), [10674, 12742]);
    const s = alegeLocalitatea(NOMENCLATOR, "Salistea", "VL");
    assert.equal(s.fel, "mai_multe");
  });

  test("comuna scrisa de om alege intre omonime", () => {
    const r = alegeLocalitatea(NOMENCLATOR, "Boureni", "IS", "Motca");
    assert.equal(r.fel === "unica" && r.localitate.id, 5135);
    /* O comuna care nu se potriveste nu alege nimic. */
    assert.equal(alegeLocalitatea(NOMENCLATOR, "Boureni", "IS", "Atlantida").fel, "mai_multe");
  });
});

describe("rezolvarea intreaga, cu cautari", () => {
  test("Cluj-Napoca: o singura cerere, o singura localitate", async () => {
    const { cauta, cereri } = cautareFalsa();
    const r = await rezolvaLocalitatea({ oras: "Cluj-Napoca", judet: "Cluj" }, cauta);
    assert.equal(r.fel === "gasita" && r.localitate.id, 109);
    assert.deepEqual(cereri, ["cluj napoca|CJ"]);
  });

  test("⚠ capitala merge pe SECTOR, cautat ca „Sectorul N” (cu „sector N” nu gasesc nimic)", async () => {
    const { cauta, cereri } = cautareFalsa();
    const r = await rezolvaLocalitatea({ oras: "Sector 3", judet: "Municipiul Bucuresti" }, cauta);
    assert.equal(r.fel === "gasita" && r.localitate.id, 14517);
    assert.deepEqual(cereri, ["Sectorul 3|B"]);
    const s = await rezolvaLocalitatea({ oras: "Bucuresti", judet: "Bucuresti", strada: "Str. Lunga 5, Sector 6" }, cauta);
    assert.equal(s.fel === "gasita" && s.localitate.id, 14520);
  });

  test("⚠ capitala FARA sector: omul alege dintre cele sase, nimic ghicit", async () => {
    const { cauta } = cautareFalsa();
    const r = await rezolvaLocalitatea({ oras: "Bucuresti", judet: "Bucuresti", strada: "Calea Victoriei 12" }, cauta);
    assert.equal(r.fel, "de_ales");
    assert.equal(r.fel === "de_ales" && r.candidati.length, 6);
  });

  test("satul cu comuna, si satul omonim", async () => {
    const { cauta } = cautareFalsa();
    const olari = await rezolvaLocalitatea({ oras: "com Olari sat Olarii Vechi", judet: "Prahova" }, cauta);
    assert.equal(olari.fel === "gasita" && olari.localitate.id, 5176, "satul, nu comuna");
    const boureni = await rezolvaLocalitatea({ oras: "Boureni comuna Motca", judet: "Iasi" }, cauta);
    assert.equal(boureni.fel === "gasita" && boureni.localitate.id, 5135, "satul din comuna scrisa, nu resedinta");
    const victoria = await rezolvaLocalitatea({ oras: "Victoria", judet: "Botosani" }, cauta);
    assert.equal(victoria.fel, "de_ales");
  });

  test("prescurtarile oamenilor ajung la localitatea lor", async () => {
    const { cauta } = cautareFalsa();
    const tg = await rezolvaLocalitatea({ oras: "Tg Carbunesti,", judet: "Gorj" }, cauta);
    assert.equal(tg.fel === "gasita" && tg.localitate.id, 461);
    const dr = await rezolvaLocalitatea({ oras: "Dr Tr Severin", judet: "Mehedinti" }, cauta);
    assert.equal(dr.fel === "gasita" && dr.localitate.id, 394);
    const rm = await rezolvaLocalitatea({ oras: "Rimnicu Vilcea", judet: "Valcea" }, cauta);
    assert.equal(rm.fel === "gasita" && rm.localitate.id, 431);
  });

  test("⚠⚠ orasele al caror nume se termina cu judetul", async () => {
    const { cauta } = cautareFalsa();
    for (const [oras, judet, id] of [
      ["Ramnicu Valcea", "Valcea", 431], ["Piatra Neamț", "Neamt", 175], ["Târgu mures", "Mures", 400],
    ] as const) {
      const r = await rezolvaLocalitatea({ oras, judet }, cauta);
      assert.equal(r.fel === "gasita" && r.localitate.id, id, oras);
    }
  });

  test("satul din checkout si prescurtarea „V.”", async () => {
    const { cauta } = cautareFalsa();
    const t = await rezolvaLocalitatea({ oras: "Tantava (Gradinari)", judet: "Giurgiu" }, cauta);
    assert.equal(t.fel === "gasita" && t.localitate.id, 2429);
    const l = await rezolvaLocalitatea({ oras: "Lespezi (Comuna Hârtiești)", judet: "Arges" }, cauta);
    assert.equal(l.fel === "gasita" && l.localitate.id, 9292);
    const v = await rezolvaLocalitatea({ oras: "V. Calugareasca", judet: "Prahova" }, cauta);
    assert.equal(v.fel === "gasita" && v.localitate.id, 679);
  });

  test("judetul necunoscut opreste inainte de orice cerere", async () => {
    const { cauta, cereri } = cautareFalsa();
    const r = await rezolvaLocalitatea({ oras: "Cluj-Napoca", judet: "Atlantida" }, cauta);
    assert.equal(r.fel, "de_ales");
    assert.equal(cereri.length, 0);
  });

  test("⚠ o cautare PICATA arunca: „nu s-a putut cauta” nu e „nu exista”", async () => {
    const cauta: CautaLocalitati = async () => { throw new Error("e-packet localities: 500"); };
    await assert.rejects(rezolvaLocalitatea({ oras: "Cluj-Napoca", judet: "Cluj" }, cauta), /500/);
  });
});

describe("localitatile unui oras fara judet (punctele din checkout)", () => {
  /* Cautarea fara judet: subsir in toata tara, ca la ei. */
  const cauta: CautaLocalitati = async (text, judet) => {
    const k = cheieLocalitate(text);
    return NOMENCLATOR.filter((l) => (!judet || l.judet === judet) && cheieLocalitate(l.afisare).includes(k));
  };

  test("sectorul scris: numai el; „Bucuresti” simplu: toate sase", async () => {
    assert.deepEqual((await localitatiPentruOras("Sector 3", cauta)).map((l) => l.id), [14517]);
    assert.equal((await localitatiPentruOras("București", cauta)).length, 6);
  });

  test("un oras obisnuit: exact el, iar omonimele din alte judete vin si ele (judetul se vede)", async () => {
    assert.deepEqual((await localitatiPentruOras("Cluj-Napoca", cauta)).map((l) => l.id), [109]);
    assert.deepEqual((await localitatiPentruOras("Iasi", cauta)).map((l) => l.id).sort(), [104, 11806]);
    assert.deepEqual(await localitatiPentruOras("Atlantida", cauta), []);
  });

  test("numele din lista: fara judetul de la coada, dar sectorul ramane intreg", () => {
    assert.equal(numeleLocalitatii(NOMENCLATOR.find((l) => l.id === 109)!), "Cluj Napoca");
    assert.equal(numeleLocalitatii(NOMENCLATOR.find((l) => l.id === 14517)!), "Sectorul 3 (Bucuresti)");
  });
});
