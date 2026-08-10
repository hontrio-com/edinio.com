import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  cheieStatus,
  clasificaStatus,
  eStareFinala,
  esteRetur,
  statusComandaDinNume,
  statusUrmator,
  trebuieSemnalat,
  citesteMemoria,
  scrieMemoria,
} from "./statusuri";

/*
 * ⚠ Pall-Ex NU publica nicio lista de statusuri. `/consignment_status_types`
 * intoarce perechi (id, nume) pe care le stabileste instalarea lor, iar
 * specificatia da doua exemple si atat.
 *
 * Deci fisierul probat aici e o PRESUPUNERE despre vocabular, si probele astea
 * sunt singurul loc in care presupunerea se vede scrisa. Un status tradus gresit
 * nu crapa nimic: comanda ajunge tacut in starea nepotrivita — iar „livrata"
 * inchide comanda, o scoate din urmarire si, la magazinele cu facturare automata,
 * emite si factura.
 *
 * Probele de INVARIANTA de la sfarsit sunt cele care conteaza cel mai mult: ele
 * raman valabile oricat s-ar schimba vocabularul.
 */

test("cheia se curata de diacritice, majuscule si punctuatie", () => {
  assert.equal(cheieStatus("În Hub"), "in hub");
  assert.equal(cheieStatus("LIVRATĂ — parțial"), "livrata partial");
  assert.equal(cheieStatus(null), "");
  assert.equal(cheieStatus("   "), "");
});

test("⚠ spatiile RAMAN in cheie, spre deosebire de judete", () => {
  /* Lipite, „in curs" si un ipotetic „incurs" ar deveni acelasi lucru. */
  assert.equal(cheieStatus("In curs de livrare"), "in curs de livrare");
});

// ─── Livrarea ─────────────────────────────────────────────────────────────────

test("livrarea inchide comanda", () => {
  assert.equal(statusComandaDinNume("Livrat"), "delivered");
  assert.equal(statusComandaDinNume("Livrata"), "delivered");
  assert.equal(statusComandaDinNume("Delivered"), "delivered");
  assert.equal(statusComandaDinNume("Marfa receptionata de destinatar"), "delivered");
});

test("⚠ „nelivrat” contine „livrat” si NU inchide comanda", () => {
  /*
   * Cea mai scumpa greseala cu putinta in fisierul asta. Fara lista de negatii,
   * fiecare dintre numele de mai jos ar fi inchis comanda ca livrata.
   */
  for (const nume of [
    "Nelivrat",
    "Livrare esuata",
    "Livrare partiala",
    "Not delivered",
    "Undelivered",
    "Livrare refuzata de destinatar",
    "Livrare anulata",
  ]) {
    assert.notEqual(statusComandaDinNume(nume), "delivered", nume);
  }
});

// ─── Restul treptelor ─────────────────────────────────────────────────────────

test("partida din reteaua Pall-Ex inseamna comanda expediata", () => {
  assert.equal(statusComandaDinNume("In hub"), "shipped");
  assert.equal(statusComandaDinNume("Colectat de la client"), "shipped");
  assert.equal(statusComandaDinNume("In tranzit"), "shipped");
  assert.equal(statusComandaDinNume("Out for delivery"), "shipped");
  assert.equal(statusComandaDinNume("In curs de livrare"), "shipped");
});

test("⚠ marfa inca la comerciant NU e „expediat”", () => {
  /*
   * O comanda marcata expediata aici ar minti clientul — si daca comerciantul
   * apasa „trimite instiintarea", l-ar minti in scris pentru marfa care n-a
   * plecat din depozit.
   */
  assert.equal(statusComandaDinNume("Partida creata"), "processing");
  assert.equal(statusComandaDinNume("Nevalidat"), "processing");
  assert.equal(statusComandaDinNume("Unvalidated"), "processing");
  assert.equal(statusComandaDinNume("Validated by client"), "processing");
  assert.equal(statusComandaDinNume("Programat pentru colectare"), "processing");
  assert.equal(statusComandaDinNume("Awaiting collection"), "processing");
});

test("⚠ „programat pentru colectare” bate „colectat”", () => {
  /* Amandoua radacinile sunt in text; marfa insa n-a plecat inca. */
  assert.equal(clasificaStatus("Programat pentru colectare"), "la_comerciant");
  assert.equal(clasificaStatus("To be collected"), "la_comerciant");
  assert.equal(clasificaStatus("Collected"), "in_retea");
});

test("un nume necunoscut nu misca nimic", () => {
  assert.equal(statusComandaDinNume("Verificare interna 7B"), null);
  assert.equal(statusComandaDinNume(""), null);
  assert.equal(statusComandaDinNume(null), null);
  assert.equal(clasificaStatus("Verificare interna 7B"), "necunoscut");
});

// ─── Sfarsiturile proaste ─────────────────────────────────────────────────────

test("⚠ returul nu inchide si nu anuleaza comanda", () => {
  /*
   * Marfa se intoarce la comerciant, dar anularea atrage dupa ea eliberarea de
   * stoc si, uneori, rambursarea. Alea sunt decizii ale comerciantului, nu ale
   * curierului. Se semnaleaza, atat.
   */
  assert.equal(statusComandaDinNume("Retur la expeditor"), null);
  assert.equal(statusComandaDinNume("Return to sender"), null);
  assert.ok(trebuieSemnalat("Retur la expeditor"));
  assert.ok(esteRetur("Retur la expeditor"));
  assert.ok(esteRetur("Return to sender"));
  assert.ok(!esteRetur("In hub"));
});

test("marfa avariata sau pierduta nu se inchide singura", () => {
  for (const nume of ["Marfa avariata", "Partida pierduta", "Damaged", "Lost in transit"]) {
    assert.equal(statusComandaDinNume(nume), null, nume);
    assert.ok(trebuieSemnalat(nume), nume);
  }
});

test("⚠ un eveniment poate SI sa mute comanda, SI sa ceara atentie", () => {
  /*
   * Prima forma a fisierului le amesteca: orice nume de semnalat iesea
   * „problema", deci o comanda al carei prim eveniment era o incercare esuata de
   * livrare nu ajungea NICIODATA pe „expediata".
   */
  assert.equal(statusComandaDinNume("Incercare de livrare esuata"), "shipped");
  assert.ok(trebuieSemnalat("Incercare de livrare esuata"));
});

test("ce nu e de semnalat chiar nu se semnaleaza", () => {
  for (const nume of ["In hub", "Livrat", "Colectat", "Partida creata"]) {
    assert.ok(!trebuieSemnalat(nume), nume);
  }
});

// ─── Scara comenzii ───────────────────────────────────────────────────────────

test("⚠ statusul nu coboara niciodata", () => {
  /* Evenimentele pot sosi in alta ordine decat s-au produs. */
  assert.equal(statusUrmator("delivered", "In hub"), null);
  assert.equal(statusUrmator("shipped", "Partida creata"), null);
  assert.equal(statusUrmator("processing", "In hub"), "shipped");
  assert.equal(statusUrmator("shipped", "Livrat"), "delivered");
});

test("acelasi status de doua ori nu produce a doua scriere", () => {
  assert.equal(statusUrmator("shipped", "In hub"), null);
  assert.equal(statusUrmator("delivered", "Livrat"), null);
});

test("⚠ o comanda anulata sau rambursata nu se misca de la un curier", () => {
  assert.equal(statusUrmator("cancelled", "Livrat"), null);
  assert.equal(statusUrmator("refunded", "Livrat"), null);
});

// ─── Iesirea din urmarire ─────────────────────────────────────────────────────

test("⚠ starile incheiate scot partida din raza cronului", () => {
  assert.ok(eStareFinala("Livrat"));
  assert.ok(eStareFinala("Retur la expeditor"));
  assert.ok(eStareFinala("Partida pierduta"));
  assert.ok(eStareFinala("Anulat"));
});

test("⚠ o livrare NEGATA nu e stare finala", () => {
  /*
   * „Livrare esuata" scoasa din urmarire ar fi lasat comanda expediata pentru
   * totdeauna, cu marfa blocata undeva si fara nicio rulare viitoare care sa mai
   * afle ce s-a intamplat cu ea.
   */
  assert.ok(!eStareFinala("Livrare esuata"));
  assert.ok(!eStareFinala("Nelivrat"));
  assert.ok(!eStareFinala("In hub"));
  assert.ok(!eStareFinala(""));
  assert.ok(!eStareFinala(null));
});

// ─── Invariante ───────────────────────────────────────────────────────────────

test("⚠ ce e final si nu misca statusul trebuie sa fie si de semnalat", () => {
  /*
   * Altfel o partida s-ar opri din urmarire fara ca nimeni sa afle vreodata de
   * ce: comanda ramane „expediata", cronul n-o mai intreaba, si nu exista nicio
   * notificare.
   */
  const finaleProaste = [
    "Retur la expeditor", "Partida pierduta", "Marfa distrusa", "Anulat", "Cancelled",
  ];
  for (const nume of finaleProaste) {
    assert.ok(eStareFinala(nume), `${nume} ar trebui sa fie finala`);
    assert.equal(statusComandaDinNume(nume), null, `${nume} nu misca statusul`);
    assert.ok(trebuieSemnalat(nume), `${nume} trebuie semnalat`);
  }
});

test("⚠ nicio livrare recunoscuta nu e in acelasi timp semnal de problema", () => {
  for (const nume of ["Livrat", "Livrata", "Delivered", "Marfa receptionata de destinatar"]) {
    assert.equal(clasificaStatus(nume), "livrat", nume);
    assert.ok(!trebuieSemnalat(nume), `${nume} nu are de ce sa alarmeze`);
  }
});

test("clasificarea e stabila oricum ar fi scris numele", () => {
  const forme = ["in hub", "IN HUB", "  În   Hub  ", "În-Hub"];
  const asteptat = clasificaStatus(forme[0]);
  for (const f of forme) assert.equal(clasificaStatus(f), asteptat, f);
});

// ─── Memoria de pe comanda ────────────────────────────────────────────────────

test("memoria pastreaza id-ul si semnul de avertisment", () => {
  assert.deepEqual(citesteMemoria("12"), { id: "12", avertizat: false });
  assert.deepEqual(citesteMemoria("12+av"), { id: "12", avertizat: true });
  assert.deepEqual(citesteMemoria(null), { id: null, avertizat: false });
  assert.deepEqual(citesteMemoria("  "), { id: null, avertizat: false });
  /* Am avertizat inainte sa stim vreun status: se poate, si nu trebuie sa se piarda. */
  assert.deepEqual(citesteMemoria("+av"), { id: null, avertizat: true });
});

test("scrierea si citirea memoriei se inchid", () => {
  for (const [id, av] of [["12", false], ["12", true], [null, true], [null, false]] as const) {
    const scris = scrieMemoria(id, av);
    const citit = citesteMemoria(scris);
    assert.equal(citit.id, id);
    assert.equal(citit.avertizat, av);
  }
});

test("⚠ memoria goala e null, nu sir gol", () => {
  /* Un sir gol scris in coloana ar trece drept „am prelucrat un status" si ar
     opri chiar avertismentul pentru care exista campul. */
  assert.equal(scrieMemoria(null, false), null);
  assert.equal(scrieMemoria("", false), null);
});

test("⚠ un id de status nu se confunda cu semnul de avertisment", () => {
  /* Daca vreodata Pall-Ex ar intoarce un id care se termina in „+av", citirea ar
     minti. Nu se poate: id-urile sunt intregi. Proba tine regula scrisa. */
  assert.deepEqual(citesteMemoria("120"), { id: "120", avertizat: false });
  assert.notEqual(scrieMemoria("120", false), scrieMemoria("120", true));
});

// ─── Radacinile care au inselat o data ────────────────────────────────────────

test("⚠ evenimentele de hub cu „predat”/„receptionat” NU sunt livrari", () => {
  /*
   * Regresia gasita la verificarea propriilor modificari, si cea mai scumpa din
   * fisier. Prima forma avea radacinile goale „predat" si „receptionat" in lista
   * de livrare, iar verificarea de livrare se face inaintea celei de retea: toate
   * numele de mai jos inchideau comanda, o scoteau din urmarire si, la magazinele
   * cu facturare automata, produceau si factura — pentru marfa care abia intrase
   * in primul depozit.
   */
  for (const nume of [
    "Predat la hub Bucuresti",
    "Receptionat in hub",
    "Receptionat in depozit",
    "Predat catre partener",
    "Predat soferului",
    "Descarcat si receptionat",
    "Receptionat la terminal",
  ]) {
    assert.notEqual(statusComandaDinNume(nume), "delivered", nume);
    assert.ok(!eStareFinala(nume), `${nume} nu are voie sa iasa din urmarire`);
  }
});

test("evenimentele acelea inseamna totusi „in retea”, nu „necunoscut”", () => {
  /* Altfel o partida care chiar se misca n-ar misca niciodata comanda. */
  for (const nume of ["Predat la hub Bucuresti", "Receptionat in depozit", "Predat soferului"]) {
    assert.equal(clasificaStatus(nume), "in_retea", nume);
    assert.equal(statusUrmator("processing", nume), "shipped", nume);
  }
});

test("livrarea adevarata cere destinatarul, si merge in ambele acorduri", () => {
  for (const nume of [
    "Livrat", "Livrata", "Delivered",
    "Predat destinatarului", "Predata destinatarului",
    "Marfa receptionata de destinatar", "Colet receptionat de client",
  ]) {
    assert.equal(statusComandaDinNume(nume), "delivered", nume);
  }
});

test("⚠ o livrare scrisa cu „la” tot e livrare", () => {
  /*
   * Regresia produsa de reparatia PRECEDENTA: intrarea „predat la" din lista de
   * retea revendica tot spatiul „predat la <oricine>", deci „Predat la destinatar"
   * iesea „in retea". Comanda ramanea „expediata" pentru totdeauna: fara factura
   * automata, fara notificare, si reinterogata la fiecare rulare 21 de zile — desi
   * marfa era la client, iar banii deja incasati (Pall-Ex n-are ramburs).
   */
  for (const nume of [
    "Predat la destinatar", "Predata la destinatar",
    "Predat la client", "Marfa predata la destinatar",
  ]) {
    assert.equal(statusComandaDinNume(nume), "delivered", nume);
    assert.ok(eStareFinala(nume), nume);
  }
});

test("⚠ formele masculine si feminine dau acelasi raspuns", () => {
  /*
   * Romana acorda participiul cu subiectul („coletul predat" / „marfa predata"),
   * iar potrivirea e pe subsiruri: „predat soferului" NU e in „predata soferului".
   * O pereche uitata inseamna ca doua scrieri ale ACELUIASI eveniment duc comanda
   * in stari diferite — si nimic n-o semnaleaza.
   */
  const perechi: [string, string][] = [
    ["Predat soferului", "Predata soferului"],
    ["Predat la hub Bucuresti", "Predata la hub Bucuresti"],
    ["Predat partenerului", "Predata partenerului"],
    ["Predat destinatarului", "Predata destinatarului"],
    ["Receptionat la depozit", "Receptionata la depozit"],
    ["Livrat", "Livrata"],
  ];
  for (const [masculin, feminin] of perechi) {
    assert.equal(
      clasificaStatus(feminin), clasificaStatus(masculin),
      `„${feminin}" nu se poarta ca „${masculin}"`,
    );
  }
});

test("⚠ niciun cuvant de retea nu revendica un actor final", () => {
  /*
   * Invarianta care prinde clasa intreaga de greseli, nu doar exemplele de mai
   * sus: orice nume care pomeneste destinatarul sau clientul si un cuvant de
   * predare/receptie trebuie sa fie livrare, nu eveniment de retea.
   */
  for (const actor of ["destinatar", "destinatarului", "client", "clientului"]) {
    for (const verb of ["Predat", "Predata", "Receptionat de", "Receptionata de"]) {
      const nume = `${verb} ${actor}`;
      assert.notEqual(
        clasificaStatus(nume), "in_retea",
        `„${nume}" pomeneste destinatarul si totusi iese eveniment de retea`,
      );
    }
  }
});
