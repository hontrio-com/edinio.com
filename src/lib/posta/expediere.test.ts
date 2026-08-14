import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  adresaPosta,
  avertismenteExpediere,
  baniPosta,
  corpExpediere,
  curata,
  dataPrezentarePosta,
  greutatePosta,
  judetPosta,
  lipsuriExpediere,
  localitatePosta,
  numePosta,
  sectorDinOras,
  valoareDeDeclarat,
  GREUTATE_MINIMA_KG,
  LUNGIMI,
  VALOARE_MINIMA_CU_RAMBURS,
  type AdresaPosta,
  type DateExpediere,
} from "./expediere";

/*
 * ⚠ Poșta Română NU are mediu de test, si nu exista cont pe care sa probam.
 * Fiecare `POST /api/awb` e o trimitere reala facturata. Fisierul asta e SINGURUL
 * loc din integrare care se poate verifica inainte de prima expediere adevarata —
 * si de aceea probele de mai jos urmaresc chiar exemplele din documentatie, camp
 * cu camp, nu ce ni s-ar parea rezonabil.
 */

const DESTINATAR: AdresaPosta = {
  nume: "Popescu Ion",
  strada: "Calea Giulesti",
  numar: "6-8",
  oras: "Bucuresti",
  judet: "Municipiul Bucuresti",
  codPostal: "060274",
  telefon: "+40 712 345 678",
  email: "ion@exemplu.ro",
};

function date(peste: Partial<DateExpediere> = {}): DateExpediere {
  return {
    destinatar: DESTINATAR,
    greutateKg: 0.2,
    codTrimitere: "3,1,10",
    continut: "Produse",
    ...peste,
  };
}

// ─── Judet, localitate, adresa ────────────────────────────────────────────────

test("judetul Bucurestiului pleaca „Bucuresti”, ca in exemplele lor", () => {
  assert.equal(judetPosta("Municipiul Bucuresti"), "Bucuresti");
  assert.equal(judetPosta("bucuresti"), "Bucuresti");
  assert.equal(judetPosta("BUCUREŞTI"), "Bucuresti");
});

test("celelalte judete pleaca din lista canonica", () => {
  assert.equal(judetPosta("cluj"), "Cluj");
  assert.equal(judetPosta("BISTRIŢA-NĂSĂUD"), "Bistrita-Nasaud");
  assert.equal(judetPosta("Caras Severin"), "Caras-Severin");
});

test("un judet nerecunoscut pleaca asa cum l-a scris omul, nu golit", () => {
  assert.equal(judetPosta("Chisinau"), "Chisinau");
  assert.equal(judetPosta(null), "");
});

test("„Sector 3” NU e localitate: devine Bucuresti si se muta in adresa", () => {
  assert.equal(localitatePosta("Sector 3"), "Bucuresti");
  assert.equal(localitatePosta("sector 1"), "Bucuresti");
  assert.equal(sectorDinOras("Sector 3"), "Sector 3");

  const a = adresaPosta({ ...DESTINATAR, oras: "Sector 3" });
  assert.ok(a.startsWith("Sector 3, "), a);
  assert.ok(a.includes("Calea Giulesti"), a);
});

test("localitatile obisnuite raman neatinse", () => {
  assert.equal(localitatePosta("Cluj-Napoca"), "Cluj-Napoca");
  assert.equal(sectorDinOras("Cluj-Napoca"), "");
});

test("„Sector 7” nu exista, deci nu se pliaza", () => {
  assert.equal(localitatePosta("Sector 7"), "Sector 7");
  assert.equal(sectorDinOras("Sector 7"), "");
});

test("adresa se compune pe un rand, in ordinea in care o citeste factorul", () => {
  const a = adresaPosta({
    ...DESTINATAR,
    numar: "12",
    bloc: "A1",
    scara: "B",
    etaj: "3",
    apartament: "23",
  });
  assert.equal(a, "Calea Giulesti, nr. 12, bl. A1, sc. B, et. 3, ap. 23");
});

test("partile lipsa nu lasa virgule goale", () => {
  assert.equal(adresaPosta({ ...DESTINATAR, numar: null, bloc: "" }), "Calea Giulesti");
});

test("numele e firma daca exista, altfel persoana", () => {
  assert.equal(numePosta(DESTINATAR), "Popescu Ion");
  assert.equal(numePosta({ ...DESTINATAR, companie: "SC Exemplu SRL" }), "SC Exemplu SRL");
});

// ─── Numerele, in forma din exemplele lor ─────────────────────────────────────

test("greutatea pleaca SIR, cu punct zecimal — ca „0.2” din exemplul lor", () => {
  assert.equal(greutatePosta(0.2), "0.2");
  assert.equal(greutatePosta(1.5), "1.5");
  assert.equal(greutatePosta(2), "2");
});

test("greutatea NU se rotunjeste in sus la kilogram intreg", () => {
  /* Spre deosebire de eColet, unde specificatia cerea intreg. Aici zecimalele
     sunt cerute explicit, iar rotunjirea ar umfla tariful fiecarui plic. */
  assert.equal(greutatePosta(0.35), "0.35");
  assert.equal(greutatePosta(1.02), "1.02");
});

test("greutatea zero sau lipsa cade pe minimul nostru, nu pe „0”", () => {
  assert.equal(greutatePosta(0), String(GREUTATE_MINIMA_KG));
  assert.equal(greutatePosta(null), String(GREUTATE_MINIMA_KG));
  assert.equal(greutatePosta("aiurea"), String(GREUTATE_MINIMA_KG));
  assert.equal(greutatePosta(-3), String(GREUTATE_MINIMA_KG));
});

test("banii pleaca SIR, cu cel mult doi zecimali", () => {
  assert.equal(baniPosta(250), "250");
  assert.equal(baniPosta(19.999), "20");
  assert.equal(baniPosta(19.994), "19.99");
  assert.equal(baniPosta(0), "0");
});

test("data de prezentare pleaca in formatul LOR: ZZ.LL.AAAA HH:mm", () => {
  assert.equal(dataPrezentarePosta("2026-01-29", "14:31"), "29.01.2026 14:31");
  assert.equal(dataPrezentarePosta("2026-01-29"), "29.01.2026 12:00", "ora implicita");
  assert.equal(dataPrezentarePosta("2026-01-29", "9:05"), "29.01.2026 09:05");
});

test("o data pe care n-o putem citi NU se trimite deloc", () => {
  assert.equal(dataPrezentarePosta("29.01.2026"), "");
  assert.equal(dataPrezentarePosta(null), "");
  assert.equal(dataPrezentarePosta(""), "");
});

// ─── Valoarea asigurata ───────────────────────────────────────────────────────

test("cu ramburs, valoarea declarata nu coboara sub pragul lor de 20 lei", () => {
  assert.equal(valoareDeDeclarat(250, 5, "comanda"), VALOARE_MINIMA_CU_RAMBURS);
  assert.equal(valoareDeDeclarat(250, 0, "minim"), VALOARE_MINIMA_CU_RAMBURS);
  assert.equal(valoareDeDeclarat(250, 480, "comanda"), 480);
});

test("modul „minim” declara pragul chiar si pe o comanda scumpa", () => {
  assert.equal(valoareDeDeclarat(1200, 1200, "minim"), VALOARE_MINIMA_CU_RAMBURS);
});

test("fara ramburs, asigurarea e optionala", () => {
  assert.equal(valoareDeDeclarat(0, 480, "minim"), null);
  assert.equal(valoareDeDeclarat(0, 480, "comanda"), 480);
  assert.equal(valoareDeDeclarat(0, 0, "comanda"), null);
});

// ─── Ce opreste ───────────────────────────────────────────────────────────────

test("o comanda intreaga nu are nicio lipsa", () => {
  assert.deepEqual(lipsuriExpediere(date()), []);
});

test("fara codul de trimitere nu se poate emite nimic", () => {
  const l = lipsuriExpediere(date({ codTrimitere: "" }));
  assert.equal(l.length, 1);
  assert.ok(l[0].includes("codul de trimitere"), l[0]);
});

test("campurile obligatorii ale destinatarului se cer pe nume", () => {
  const l = lipsuriExpediere(date({
    destinatar: { ...DESTINATAR, nume: "", strada: "", oras: "", judet: "" },
  }));
  assert.ok(l.some((x) => x.includes("numele destinatarului")), l.join(" | "));
  assert.ok(l.some((x) => x.includes("judetul destinatarului")), l.join(" | "));
  assert.ok(l.some((x) => x.includes("localitatea destinatarului")), l.join(" | "));
  assert.ok(l.some((x) => x.includes("strada destinatarului")), l.join(" | "));
});

test("⚠ strada goala cu numar completat NU trece drept adresa", () => {
  /* Prins de proba: `adresaPosta` intorcea „nr. 6-8", adica un sir negol, deci
     campul obligatoriu parea completat si coletul ar fi plecat fara strada. */
  const l = lipsuriExpediere(date({ destinatar: { ...DESTINATAR, strada: "" } }));
  assert.ok(l.some((x) => x.includes("strada destinatarului")), l.join(" | "));
});

test("un camp obligatoriu prea lung OPRESTE, si spune cat si cat se poate", () => {
  const strada = "A".repeat(LUNGIMI.adresaDestinatar + 5);
  const l = lipsuriExpediere(date({ destinatar: { ...DESTINATAR, strada } }));
  assert.equal(l.length, 1);
  assert.ok(l[0].includes(String(LUNGIMI.adresaDestinatar)), l[0]);
  assert.ok(l[0].includes("Adresa destinatarului"), l[0]);
});

test("o comanda cu ramburs trece, fiindca pragul de 20 lei se ridica singur", () => {
  /*
   * Regula Postei („valoarea e obligatorie si de minim 20 de lei pentru orice
   * trimitere cu ramburs") e respectata de `valoareDeDeclarat` in AMANDOUA
   * modurile, deci nicio comanda cinstita nu se opreste aici. Verificarea din
   * `lipsuriExpediere` ramane ca plasa: daca cineva schimba vreodata
   * `valoareDeDeclarat`, ea prinde greseala inainte sa ajunga la Posta — al carei
   * refuz vine intr-un format nedocumentat.
   */
  assert.deepEqual(lipsuriExpediere(date({ ramburs: 250, valoareMarfa: 0, modValoare: "comanda" })), []);
  assert.deepEqual(lipsuriExpediere(date({ ramburs: 250, modValoare: "minim" })), []);
});

test("livrarea la oficiu cere oficiul", () => {
  const l = lipsuriExpediere(date({ postRestant: true }));
  assert.equal(l.length, 1);
  assert.ok(l[0].includes("oficiul postal"), l[0]);
});

test("⚠ regula LOR: post-restant nu se combina cu mana proprie sau factaj livrare", () => {
  const cuMana = lipsuriExpediere(date({
    postRestant: true, idOficiuPR: "31793", servicii: { manaProprie: true },
  }));
  assert.equal(cuMana.length, 1);
  assert.ok(cuMana[0].includes("mana proprie"), cuMana[0]);

  const cuFactaj = lipsuriExpediere(date({
    postRestant: true, idOficiuPR: "31793", servicii: { factajLivrare: true },
  }));
  assert.equal(cuFactaj.length, 1);
  assert.ok(cuFactaj[0].includes("factaj livrare"), cuFactaj[0]);

  /* Aceleasi servicii, fara post-restant, sunt in regula. */
  assert.deepEqual(lipsuriExpediere(date({ servicii: { manaProprie: true, factajLivrare: true } })), []);
});

// ─── Ce doar avertizeaza ──────────────────────────────────────────────────────

test("⚠ un email peste 32 de caractere se OMITE, nu opreste coletul", () => {
  const email = "alexandra.popescu@companie-lunga.ro";
  assert.ok(email.length > LUNGIMI.emailDestinatar);

  const d = date({ destinatar: { ...DESTINATAR, email } });
  assert.deepEqual(lipsuriExpediere(d), [], "nu opreste");

  const av = avertismenteExpediere(d);
  assert.ok(av.some((x) => x.includes("email")), av.join(" | "));

  const corp = corpExpediere(d);
  assert.ok(!("emailDestinatar" in corp), "campul prea lung nu se trimite");
});

test("lipsa telefonului se semnaleaza, dar nu opreste", () => {
  const d = date({ destinatar: { ...DESTINATAR, telefon: null } });
  assert.deepEqual(lipsuriExpediere(d), []);
  assert.ok(avertismenteExpediere(d).some((x) => x.includes("telefon")));
});

test("un cod din plaja cu alta lungime decat 13 se semnaleaza", () => {
  const av = avertismenteExpediere(date({ codAwb: "LN0919999" }));
  assert.ok(av.some((x) => x.includes("13")), av.join(" | "));
});

// ─── Corpul ───────────────────────────────────────────────────────────────────

test("corpul poarta campurile obligatorii, in tipurile din exemplele lor", () => {
  const corp = corpExpediere(date());

  assert.equal(corp.codTrimitere, "3,1,10");
  assert.equal(corp.numeDestinatar, "Popescu Ion");
  assert.equal(corp.judetDestinatar, "Bucuresti");
  assert.equal(corp.localitateDestinatar, "Bucuresti");
  assert.equal(corp.adresaDestinatar, "Calea Giulesti, nr. 6-8");
  assert.equal(corp.continut, "Produse");

  /* ⚠ SIRURI, ca in exemplul lor — nu numere, desi proza le declara `decimal`. */
  assert.equal(typeof corp.greutateTrimitere, "string");
  assert.equal(corp.greutateTrimitere, "0.2");
});

test("telefonul pleaca normalizat", () => {
  const corp = corpExpediere(date());
  assert.equal(corp.telefonDestinatar, "0712345678");
});

test("expeditorul NU se trimite cand nu a fost cerut anume", () => {
  /* Documentatia: campurile lipsa „se vor completa automat cu detaliile contului
     după care se face apelul" — adica din contract, care e sursa adevarata. */
  const corp = corpExpediere(date());
  assert.ok(!("numeExpeditor" in corp));
  assert.ok(!("adresaExpeditor" in corp));
  assert.ok(!("persoanaDeContact" in corp));
});

test("expeditorul se trimite intreg cand comerciantul a cerut alta adresa", () => {
  const corp = corpExpediere(date({
    expeditor: {
      nume: "Depozitul Meu",
      strada: "Bucuresti-Ploiesti",
      numar: "172",
      oras: "Bucuresti",
      judet: "Municipiul Bucuresti",
      codPostal: "013695",
      telefon: "0214824089",
      persoanaContact: "Maria Ionescu",
    },
  }));
  assert.equal(corp.numeExpeditor, "Depozitul Meu");
  assert.equal(corp.judetExpeditor, "Bucuresti");
  assert.equal(corp.adresaExpeditor, "Bucuresti-Ploiesti, nr. 172");
  assert.equal(corp.persoanaDeContact, "Maria Ionescu");
});

test("rambursul si valoarea pleaca siruri, si numai cand e cazul", () => {
  const fara = corpExpediere(date());
  assert.ok(!("ramburs" in fara));

  const cu = corpExpediere(date({ ramburs: 250, valoareMarfa: 480, modValoare: "comanda" }));
  assert.equal(cu.ramburs, "250");
  assert.equal(cu.valoare, "480");
  assert.equal(typeof cu.ramburs, "string");
});

test("⚠ tipMandat si tipAchitareRamburs se trimit DOAR completate", () => {
  /* Valorile lor nu sunt documentate: proza despre `tipAchitareRamburs` se
     termina cu o liniuta. Un „POSTAL" pus de noi ar fi o afirmatie despre
     contractul altcuiva. */
  const implicit = corpExpediere(date({ ramburs: 250 }));
  assert.ok(!("tipMandat" in implicit));
  assert.ok(!("tipAchitareRamburs" in implicit));

  const completat = corpExpediere(date({
    ramburs: 250, tipMandat: "POSTAL", tipAchitareRamburs: "LA_ADRESA",
  }));
  assert.equal(completat.tipMandat, "POSTAL");
  assert.equal(completat.tipAchitareRamburs, "LA_ADRESA");
});

test("fara ramburs nu pleaca nici mandatul, chiar daca e configurat", () => {
  const corp = corpExpediere(date({ tipMandat: "POSTAL" }));
  assert.ok(!("tipMandat" in corp));
});

test("toate bifele pleaca explicit, si stinse din oficiu", () => {
  /* Ca in exemplul lor, unde apar toate. Omise, n-am fi stiut daca implicitul lor
     e „nu" sau „ca in contract" — iar diferenta se plateste la fiecare colet. */
  const corp = corpExpediere(date());
  for (const bifa of [
    "retur", "rambursPostRestant", "pcp", "confirmarePrimire", "confirmarePrimirePostRestant",
    "ec", "fragil", "voluminos", "garantieLivrare", "desfacereColet", "avizareSms",
    "manaProprie", "factajLivrare", "factajPreluare", "postRestant",
  ]) {
    assert.equal(corp[bifa], false, `${bifa} ar trebui sa fie false`);
  }
});

test("bifele aprinse in configurare ajung aprinse", () => {
  const corp = corpExpediere(date({ servicii: { retur: true, fragil: true } }));
  assert.equal(corp.retur, true);
  assert.equal(corp.fragil, true);
  assert.equal(corp.voluminos, false);
});

test("livrarea la oficiu duce id-ul oficiului ca SIR", () => {
  const corp = corpExpediere(date({ postRestant: true, idOficiuPR: "31793" }));
  assert.equal(corp.postRestant, true);
  assert.equal(corp.idOficiuPR, "31793");
  assert.equal(typeof corp.idOficiuPR, "string");
});

test("borderoul pleaca `null` cand nu se foloseste, si NUMAR cand se foloseste", () => {
  /* `"idBorderou": null` e chiar in exemplul lor de la 2.2. */
  assert.equal(corpExpediere(date()).idBorderou, null);
  assert.equal(corpExpediere(date({ idBorderou: 555 })).idBorderou, 555);
  assert.equal(typeof corpExpediere(date({ idBorderou: 555 })).idBorderou, "number");
});

test("tipPersoana e FIZICA din oficiu si JURIDICA pe comenzile de firma", () => {
  assert.equal(corpExpediere(date()).tipPersoana, "FIZICA");
  assert.equal(corpExpediere(date({ tipPersoana: "JURIDICA" })).tipPersoana, "JURIDICA");
});

test("referintele noastre ajung pe campurile de date suplimentare", () => {
  const corp = corpExpediere(date({
    idComanda: "1042", nrFactura: "EDN-2026-15", obiectRamburs: "Boxe, mouse",
  }));
  assert.equal(corp.idComanda, "1042");
  assert.equal(corp.nrFactura, "EDN-2026-15");
  assert.equal(corp.obiectRamburs, "Boxe, mouse");
});

test("continutul prea lung se taie, fiindca e text compus de noi", () => {
  const corp = corpExpediere(date({ continut: "x".repeat(LUNGIMI.continut + 20) }));
  assert.equal(String(corp.continut).length, LUNGIMI.continut);
});

test("continutul gol cade pe rezerva, nu pleaca gol", () => {
  assert.equal(corpExpediere(date({ continut: "" })).continut, "Produse");
  assert.equal(corpExpediere(date({ continut: null })).continut, "Produse");
});

test("⚠ nicaieri in corp nu ajung campurile de vama", () => {
  /* `decTaraImport`, `decTaraColet` si `decValoareEur` apar in exemple si nu sunt
     descrise nicaieri in proza. Gresite, inseamna colet oprit in vama. */
  const corp = corpExpediere(date());
  assert.ok(!("decTaraImport" in corp));
  assert.ok(!("decTaraColet" in corp));
  assert.ok(!("decValoareEur" in corp));
});

test("codul din plaja pleaca pe `codAwb`; fara plaja, campul lipseste cu totul", () => {
  assert.ok(!("codAwb" in corpExpediere(date())));
  assert.equal(corpExpediere(date({ codAwb: "LN09199999999" })).codAwb, "LN09199999999");
});

test("curata strange spatiile, dar nu ciunteste textul", () => {
  assert.equal(curata("  Calea   Giulesti  "), "Calea Giulesti");
  assert.equal(curata(null), "");
});
