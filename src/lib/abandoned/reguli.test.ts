import { strict as assert } from "node:assert";
import { test } from "node:test";

import { readAutomationConfig } from "@/lib/abandoned-cart";

import {
  eLiniste, numeleSursei, refuzulLaMana, refuzulRegulilor, type Dosar, type ReguliAutomatizare,
} from "./reguli";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE APARA PROBELE ASTEA
  ═══════════════════════════════════════════════════════════════════════════════

  Regulile astea hotarasc daca pleaca sau nu un mesaj catre un om adevarat, pe
  banii comerciantului. Gresite, fac doua feluri de rau, si amandoua tacute:
  ori trimit cuiva care nu trebuia, ori NU trimit nimanui si pagina arata la
  fel ca atunci cand totul merge.
*/

const DOSAR: Dosar = {
  canal: "email",
  valoare: 300,
  sursa: "cart",
  produse: ["p1", "p2"],
  aMaiComandat: false,
  mesajeCatreClient: 0,
  zileDeLaUltimul: null,
  smsLunaAsta: 0,
  mesajeAzi: 0,
  dezabonari30: 0,
  mesaje30: 0,
  ora: 12,
  ziSaptamanii: 3,
};

const d = (p: Partial<Dosar> = {}): Dosar => ({ ...DOSAR, ...p });
const cheie = (r: ReguliAutomatizare, dd: Dosar = DOSAR) => refuzulRegulilor(r, dd)?.cheie ?? null;

test("fara nicio regula, mesajul pleaca", () => {
  assert.equal(refuzulRegulilor({}, DOSAR), null);
});

test("praguri de valoare, la amandoua capetele", () => {
  assert.equal(cheie({ min_cart_value: 500 }), "sub-minim");
  assert.equal(cheie({ min_cart_value: 300 }), null, "exact pe prag trece");
  assert.equal(cheie({ max_cart_value: 200 }), "peste-maxim");
  assert.equal(cheie({ max_cart_value: 300 }), null, "exact pe prag trece");
  assert.equal(cheie({ min_cart_value: 100, max_cart_value: 500 }), null);
});

test("⚠ CAND NU SE STIE DACA E CLIENT NOU, NU SE TRIMITE", () => {
  /*
    ⚠ Ghicit gresit, omul primeste un mesaj scris pentru altcineva: „bine ai
    revenit" catre cineva care n-a cumparat niciodata. Tacerea e mai ieftina
    decat mesajul gresit.
  */
  assert.equal(cheie({ clienti: "noi" }, d({ aMaiComandat: null })), "istoric-necunoscut");
  assert.equal(cheie({ clienti: "revin" }, d({ aMaiComandat: null })), "istoric-necunoscut");
  /* Cand regula e „toti", istoricul nici nu conteaza. */
  assert.equal(cheie({ clienti: "toti" }, d({ aMaiComandat: null })), null);
});

test("clienti noi vs. clienti care revin", () => {
  assert.equal(cheie({ clienti: "noi" }, d({ aMaiComandat: false })), null);
  assert.equal(cheie({ clienti: "noi" }, d({ aMaiComandat: true })), "nu-e-nou");
  assert.equal(cheie({ clienti: "revin" }, d({ aMaiComandat: true })), null);
  assert.equal(cheie({ clienti: "revin" }, d({ aMaiComandat: false })), "nu-a-comandat");
});

test("produse si surse alese", () => {
  assert.equal(cheie({ produse: ["p2"] }), null, "macar unul din cos e de ajuns");
  assert.equal(cheie({ produse: ["p9"] }), "alte-produse");
  assert.equal(cheie({ produse: [] }), null, "lista goala nu filtreaza nimic");
  assert.equal(cheie({ surse: ["cart"] }), null);
  assert.equal(cheie({ surse: ["buy_now"] }), "alta-sursa");
});

test("⚠ ORELE DE LINISTE TREC PESTE MIEZUL NOPTII", () => {
  /*
    ⚠ 22 → 8 nu e un interval obisnuit. Scris `start <= ora < end`, linistea de
    noapte n-ar fi prins NICIODATA nicio ora: nicio ora nu e in acelasi timp
    peste 22 si sub 8. Formularul ar fi aratat linistea pusa, si mesajele ar fi
    plecat la trei dimineata.
  */
  const noaptea = { start: 22, end: 8 };
  for (const ora of [22, 23, 0, 3, 7]) assert.equal(eLiniste(ora, noaptea), true, `ora ${ora}`);
  for (const ora of [8, 12, 21]) assert.equal(eLiniste(ora, noaptea), false, `ora ${ora}`);

  /* Si un interval obisnuit, de zi. */
  const ziua = { start: 9, end: 17 };
  assert.equal(eLiniste(12, ziua), true);
  assert.equal(eLiniste(8, ziua), false);
  assert.equal(eLiniste(17, ziua), false, "capatul de sus e in afara");

  assert.equal(eLiniste(12, null), false, "fara liniste, nicio ora nu e linistita");
  assert.equal(eLiniste(12, { start: 9, end: 9 }), true, "inceput = sfarsit inseamna toata ziua");
});

test("⚠ LINISTEA E PE CANAL, nu una pentru amandoua", () => {
  /*
    ⚠ Un email la 23:00 nu trezeste pe nimeni; un SMS da. Cu o singura
    fereastra, comerciantul care voia sa opreasca SMS-urile noaptea isi oprea
    si emailurile - adica tocmai canalul gratuit.
  */
  const reguli = { quiet_hours: { start: 22, end: 8 }, quiet_hours_email: null };
  assert.equal(cheie(reguli, d({ canal: "sms", ora: 23 })), "ore-liniste");
  assert.equal(cheie(reguli, d({ canal: "email", ora: 23 })), null, "emailul n-are voie sa fie oprit de linistea SMS");
});

test("zilele oprite se spun pe nume", () => {
  const r = refuzulRegulilor({ zile_oprite: [0, 6] }, d({ ziSaptamanii: 0 }));
  assert.equal(r?.cheie, "zi-oprita");
  assert.match(r!.motiv, /duminica/);
  assert.equal(cheie({ zile_oprite: [0, 6] }, d({ ziSaptamanii: 3 })), null);
});

test("limita de mesaje pe client si pauza dintre ele", () => {
  assert.equal(cheie({ max_mesaje_pe_client: 2 }, d({ mesajeCatreClient: 2 })), "prea-multe-pe-client");
  assert.equal(cheie({ max_mesaje_pe_client: 3 }, d({ mesajeCatreClient: 2 })), null);
  assert.equal(cheie({ pauza_zile: 7 }, d({ zileDeLaUltimul: 3 })), "prea-devreme");
  assert.equal(cheie({ pauza_zile: 7 }, d({ zileDeLaUltimul: 7 })), null);
  assert.equal(cheie({ pauza_zile: 7 }, d({ zileDeLaUltimul: null })), null, "cine n-a primit nimic nu asteapta");
});

test("⚠ PLAFONUL DE SMS NU OPRESTE SI EMAILURILE", () => {
  /*
    ⚠ Plafonul e pus fiindca SMS-urile COSTA. Aplicat si emailurilor, ar fi
    oprit canalul gratuit tocmai cand cel platit s-a terminat - adica exact pe
    dos fata de ce vrea omul.
  */
  const r = { plafon_sms_lunar: 100 };
  assert.equal(cheie(r, d({ canal: "sms", smsLunaAsta: 100 })), "plafon-sms");
  assert.equal(cheie(r, d({ canal: "email", smsLunaAsta: 100 })), null);
});

test("plafonul zilnic priveste amandoua canalele", () => {
  const r = { plafon_zilnic: 50 };
  assert.equal(cheie(r, d({ canal: "sms", mesajeAzi: 50 })), "plafon-zilnic");
  assert.equal(cheie(r, d({ canal: "email", mesajeAzi: 50 })), "plafon-zilnic");
  assert.equal(cheie(r, d({ mesajeAzi: 49 })), null);
});

test("⚠ PRAGUL DE DEZABONARE CERE UN MINIM DE MESAJE", () => {
  /*
    ⚠ O dezabonare din trei mesaje e 33%. Oprita acolo, automatizarea s-ar fi
    stins la a doua zi de folosire, iar comerciantul ar fi crezut ca e stricata.
    Procentul are inteles abia pe o multime cat de cat mare.
  */
  const r = { prag_dezabonare: 5 };
  assert.equal(cheie(r, d({ dezabonari30: 1, mesaje30: 3 })), null, "trei mesaje nu sunt o masuratoare");
  assert.equal(cheie(r, d({ dezabonari30: 2, mesaje30: 20 })), "prag-dezabonare", "10% din 20 e o masuratoare");
  assert.equal(cheie(r, d({ dezabonari30: 0, mesaje30: 500 })), null);
  assert.equal(cheie(r, d({ dezabonari30: 5, mesaje30: 0 })), null, "fara mesaje nu se imparte la zero");
});

test("⚠ FIECARE REFUZ ISI SPUNE MOTIVUL, pe intelesul omului", () => {
  /*
    ⚠ „Nu s-a trimis" il face pe comerciant sa apese din nou, si iar, si sa
    creada ca e stricat. Motivul e si el o regula.
  */
  const cazuri: [ReguliAutomatizare, Dosar][] = [
    [{ min_cart_value: 500 }, DOSAR],
    [{ max_cart_value: 100 }, DOSAR],
    [{ clienti: "noi" }, d({ aMaiComandat: true })],
    [{ produse: ["p9"] }, DOSAR],
    [{ surse: ["buy_now"] }, DOSAR],
    [{ zile_oprite: [3] }, DOSAR],
    [{ quiet_hours_email: { start: 9, end: 17 } }, DOSAR],
    [{ max_mesaje_pe_client: 1 }, d({ mesajeCatreClient: 1 })],
    [{ pauza_zile: 7 }, d({ zileDeLaUltimul: 1 })],
    [{ plafon_sms_lunar: 10 }, d({ canal: "sms", smsLunaAsta: 10 })],
    [{ plafon_zilnic: 10 }, d({ mesajeAzi: 10 })],
    [{ prag_dezabonare: 5 }, d({ dezabonari30: 3, mesaje30: 30 })],
  ];
  const motive = new Set<string>();
  for (const [r, dd] of cazuri) {
    const refuz = refuzulRegulilor(r, dd);
    assert.ok(refuz, `regula ${JSON.stringify(r)} n-a oprit nimic`);
    assert.ok(refuz!.motiv.length > 25, `motiv prea scurt: ${refuz!.motiv}`);
    /* ⚠ Fara jargon: omul nu stie ce e un „dosar" sau o „cheie". */
    assert.doesNotMatch(refuz!.motiv, /null|undefined|NaN|\[object/);
    motive.add(refuz!.motiv);
  }
  assert.equal(motive.size, cazuri.length, "doua reguli diferite spun acelasi lucru");
});

test("⚠ SE INTOARCE UN SINGUR MOTIV, chiar cand se incalca mai multe", () => {
  /*
    Patru motive deodata nu ajuta pe nimeni: omul repara primul si vede al
    doilea. Ordinea e cea din cod, de la „cine" catre „cat".
  */
  const r: ReguliAutomatizare = {
    min_cart_value: 1000,
    zile_oprite: [3],
    plafon_zilnic: 1,
  };
  const refuz = refuzulRegulilor(r, d({ mesajeAzi: 5 }));
  assert.equal(refuz?.cheie, "sub-minim", "nu s-a intors primul motiv din lant");
});

test("⚠ LISTA SURSELOR NU E INCHISA IN COD", () => {
  /*
    ⚠ Masurat pe 21.09.2026: in productie sunt „buy_now" (278) si „cart" (111),
    iar pe baza demo mai apare „checkout". Scrisa ca doua valori fixe,
    filtrarea ar fi aruncat tacut o treime din cosuri - si pe magazinul unde
    valoarea e alta, pe toate.
  */
  assert.equal(cheie({ surse: ["checkout"] }, d({ sursa: "checkout" })), null);
  assert.equal(cheie({ surse: ["buy_now"] }, d({ sursa: "buy_now" })), null);
  assert.equal(cheie({ surse: ["ceva_nou_de_maine"] }, d({ sursa: "ceva_nou_de_maine" })), null);

  /* Un cos fara sursa nu se strecoara intr-un filtru pe surse. */
  assert.equal(cheie({ surse: ["cart"] }, d({ sursa: null })), "alta-sursa");

  /* Si numele de pe ecran: cunoscutele traduse, necunoscutele aratate ca atare. */
  assert.equal(numeleSursei("buy_now"), "Cumpără acum");
  assert.equal(numeleSursei("checkout"), "Finalizare");
  assert.equal(numeleSursei("ceva_nou"), "ceva_nou");
  assert.equal(numeleSursei(null), "Necunoscută");
});

test("⚠ ZERO INSEAMNA „FARA REGULA”, NU „zero lei”", () => {
  /*
    ⚠ Campul gol din formular ajunge la server tot ca 0. Pastrat ca atare, un
    plafon „sters" de omul care voia sa scape de el ar fi devenit cea mai dura
    regula dintre toate: zero SMS-uri pe luna, zero mesaje pe zi. Automatizarea
    ar fi tacut complet, si formularul ar fi aratat gol.
  */
  const c = readAutomationConfig({
    enabled: true, steps: [],
    min_cart_value: 0, max_cart_value: 0,
    plafon_sms_lunar: 0, plafon_zilnic: 0, pauza_zile: 0,
    max_mesaje_pe_client: 0, prag_dezabonare: 0,
  });
  for (const [nume, v] of Object.entries({
    min_cart_value: c.min_cart_value, max_cart_value: c.max_cart_value,
    plafon_sms_lunar: c.plafon_sms_lunar, plafon_zilnic: c.plafon_zilnic,
    pauza_zile: c.pauza_zile, max_mesaje_pe_client: c.max_mesaje_pe_client,
    prag_dezabonare: c.prag_dezabonare,
  })) {
    assert.equal(v, null, `${nume}: zero a ramas regula`);
  }

  /* Si niciuna dintre ele nu opreste nimic, dupa curatare. */
  assert.equal(refuzulRegulilor(c, DOSAR), null);
});

test("⚠ TOATE REGULILE SE CITESC INAPOI, nu doar se scriu", () => {
  /*
    ⚠ Un camp salvat si necitit dispare la prima resalvare, fara nicio eroare.
    Proba trece TOATE regulile prin aceeasi poarta si cere sa iasa cum au intrat.
  */
  const puse = {
    enabled: true, steps: [],
    min_cart_value: 50, max_cart_value: 5000,
    clienti: "revin", produse: ["p1", "p2"], surse: ["cart"],
    quiet_hours: { start: 22, end: 8 },
    quiet_hours_email: { start: 1, end: 5 },
    zile_oprite: [0, 6],
    max_mesaje_pe_client: 3, pauza_zile: 7,
    plafon_sms_lunar: 500, plafon_zilnic: 50, prag_dezabonare: 5,
  };
  const dus = readAutomationConfig(puse);
  for (const cheieR of Object.keys(puse) as (keyof typeof puse)[]) {
    if (cheieR === "enabled" || cheieR === "steps") continue;
    assert.deepEqual(dus[cheieR], puse[cheieR], `regula ${cheieR} s-a pierdut la citire`);
  }
  /* Si inca o data: ce iese trebuie sa reintre la fel. */
  assert.deepEqual(readAutomationConfig(dus), dus);
});

test("zilele oprite se curata: fara dubluri, fara valori imposibile", () => {
  const c = readAutomationConfig({ enabled: true, steps: [], zile_oprite: [1, 1, 9, -2, 6, 3.7] });
  assert.deepEqual(c.zile_oprite, [1, 3, 6], "au ramas dubluri sau zile care nu exista");
});

test("⚠ TINTIREA NU OPRESTE O TRIMITERE FACUTA CU MANA", () => {
  /*
    ⚠ Un mesaj apasat de mana e DEJA tintit: omul s-a uitat la cosul ala si a
    apasat pe el. Oprit fiindca „ai pus minimul la 300 de lei", panoul ar
    refuza tocmai ce i-a cerut comerciantul.
  */
  const tintire: ReguliAutomatizare = {
    min_cart_value: 1000, max_cart_value: 2000, clienti: "revin",
    produse: ["altceva"], surse: ["buy_now"],
  };
  assert.ok(refuzulRegulilor(tintire, DOSAR), "din cron ar trebui sa fie oprit");
  assert.equal(refuzulLaMana(tintire, DOSAR), null, "de mana trebuie sa treaca");
});

test("⚠ PLAFOANELE SI LINISTEA OPRESC SI MANA OMULUI", () => {
  /*
    ⚠ Un SMS la 3 noaptea deranjeaza la fel, apasat de mana sau de cron, iar
    plafonul lunar e pus tocmai ca sa nu se depaseasca din graba.
  */
  const cazuri: [ReguliAutomatizare, Dosar][] = [
    [{ quiet_hours: { start: 22, end: 8 } }, d({ canal: "sms", ora: 3 })],
    [{ plafon_sms_lunar: 10 }, d({ canal: "sms", smsLunaAsta: 10 })],
    [{ plafon_zilnic: 5 }, d({ mesajeAzi: 5 })],
    [{ max_mesaje_pe_client: 2 }, d({ mesajeCatreClient: 2 })],
    [{ pauza_zile: 7 }, d({ zileDeLaUltimul: 1 })],
    [{ zile_oprite: [3] }, DOSAR],
    [{ prag_dezabonare: 5 }, d({ dezabonari30: 3, mesaje30: 30 })],
  ];
  for (const [r, dd] of cazuri) {
    assert.ok(refuzulLaMana(r, dd), `plafonul ${Object.keys(r)[0]} n-a oprit trimiterea de mana`);
  }
});

test("⚠ UN COS CARE INCALCA SI TINTIREA, SI UN PLAFON, TOT E OPRIT", () => {
  /*
    ⚠ Capcana: se verifica, se vede ca primul refuz e de tintire, si se
    intoarce „trece" - sarind tocmai plafonul care venea dupa el. De-aia
    verificarea se RELUA fara regulile de tintire, nu se abandoneaza.
  */
  const amandoua: ReguliAutomatizare = {
    min_cart_value: 9999,            // tintire: nu opreste mana
    plafon_zilnic: 5,                // plafon: opreste
  };
  const refuz = refuzulLaMana(amandoua, d({ mesajeAzi: 5 }));
  assert.ok(refuz, "plafonul a fost sarit fiindca tintirea a raspuns prima");
  assert.equal(refuz!.cheie, "plafon-zilnic");
});
