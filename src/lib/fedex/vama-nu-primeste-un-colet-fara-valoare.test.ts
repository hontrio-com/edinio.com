import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";
import {
  avertismenteExpediere, corpExpediere, lipsuriExpediere,
  type AdresaComanda, type DateExpediere,
} from "./expediere";
import type { FedexConfig } from "./client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * VAMA NU PRIMESTE UN COLET FARA VALOARE, NICI UNUL „CU PRODUSE”  (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Trei defecte ale drumului international, toate gasite citind ce trimitem NOI, nu ce
 * raspunde FedEx.
 *
 * 1. ⚠⚠ `corpExpediere` punea `customsValue`, `unitPrice` si `totalCustomsValue` numai cand
 *    `valoareComanda > 0`. Sub zero lei — o comanda de inlocuire, un cadou, o linie cu pret
 *    zero — `customsClearanceDetail` pleca cu o marfa fara nicio valoare declarata. Nu e o
 *    chichita de schema: factura comerciala pe care FedEx o intocmeste din campurile astea
 *    merge la vama. Ori ei refuza cererea, ori coletul e OPRIT acolo si se descurca
 *    cumparatorul — si a doua varianta nu se afla decat de la el.
 *
 * 2. ⚠ Descrierea implicita e „Produse” (modalul) sau „Bunuri de consum” (`corpExpediere`).
 *    `Commodity.description` e singurul camp obligatoriu din schema lor, deci trece. Trece la
 *    FEDEX. La vama, o descriere generica e motivul obisnuit pentru care un colet e retinut.
 *
 * 3. ⚠⚠ Butonul de emitere era `disabled={emitand || !aleasa}`, iar `aleasa` venea doar dintr-o
 *    oferta cotata. `ofertePosibile` insa arunca TOATE ofertele cand contul coteaza in alta
 *    valuta decat leul — ceea ce conturile FedEx din Romania fac des. Comerciantul vedea un
 *    avertisment limpede despre valuta si un buton pe care nu-l putea apasa NICIODATA, desi
 *    coletul se putea expedia perfect. Refuzul de a AFISA un pret in euro devenise o
 *    imposibilitate de a expedia.
 */

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const EXPEDITOR = {
  nume: "Depozit Edinio",
  companie: "Edinio SRL",
  telefon: "0721000111",
  strada: "Str. Fabricii nr. 12",
  oras: "Cluj-Napoca",
  judet: "Cluj",
  cod_postal: "400001",
  tara: "RO",
};

const CONFIG: FedexConfig = {
  enabled: true,
  client_id: "cheie",
  client_secret: "secret",
  account_number: "613902139",
  mediu: "productie",
  expeditor: EXPEDITOR,
};

const IN_TARA: AdresaComanda = {
  nume: "Ion Popescu",
  strada: "Strada Aviatorilor",
  numar: "25",
  oras: "Constanta",
  judet: "Constanta",
  codPostal: "900330",
  telefon: "0722333444",
  tara: "RO",
};

const IN_GERMANIA: AdresaComanda = { ...IN_TARA, oras: "Berlin", judet: null, codPostal: "10115", tara: "DE" };

const date = (p: Partial<DateExpediere> = {}): DateExpediere => ({
  destinatar: IN_TARA,
  greutateKg: 2.4,
  serviceType: "FEDEX_PRIORITY",
  referinta: "EDN-AB12-000123",
  valoareComanda: 250,
  ...p,
});

describe("Valoarea marfii la international", () => {
  test("⚠⚠ fara valoare, coletul international se OPRESTE inainte de apel", () => {
    const l = lipsuriExpediere(CONFIG, date({ destinatar: IN_GERMANIA, valoareComanda: 0 }));
    assert.ok(
      l.comanda.some((x) => x.includes("valoarea marfii")),
      `nu se opreste: ${l.comanda.join(" | ")}`,
    );
  });

  test("⚠ si mesajul spune DE UNDE si INCOTRO, ca omul sa priceapa de ce i se cere", () => {
    const l = lipsuriExpediere(CONFIG, date({ destinatar: IN_GERMANIA, valoareComanda: 0 }));
    const m = l.comanda.find((x) => x.includes("valoarea marfii")) ?? "";
    assert.match(m, /din RO in DE/);
  });

  test("⚠ cu valoare, nu opreste nimic", () => {
    assert.deepEqual(lipsuriExpediere(CONFIG, date({ destinatar: IN_GERMANIA })).comanda, []);
  });

  test("⚠ si in tara nu se cere DELOC: nu exista vama", () => {
    assert.deepEqual(lipsuriExpediere(CONFIG, date({ valoareComanda: 0 })).comanda, []);
  });

  test("⚠⚠ fara tara SCRISA nu se presupune international — pe acolo trece COTAREA din checkout", () => {
    /*
     * `buildFedexOptions` compune destinatarul fara tara si fara valoarea cosului. O conditie
     * care ar socoti „lipsa tarii” drept international ar taia cotarea FedEx pentru orice
     * magazin al carui expeditor nu e in Romania: pret fix in loc de cel adevarat, tacut.
     */
    const faraTara: AdresaComanda = { ...IN_TARA, tara: undefined };
    const strain: FedexConfig = { ...CONFIG, expeditor: { ...EXPEDITOR, tara: "DE" } };
    assert.deepEqual(
      lipsuriExpediere(strain, date({ destinatar: faraTara, valoareComanda: 0 })).comanda, [],
      "cotarea din checkout a fost taiata",
    );
  });

  test("si valoarea chiar ajunge in corp, pe toate cele trei campuri", () => {
    const corp = corpExpediere(CONFIG, date({ destinatar: IN_GERMANIA, valoareComanda: 250 }));
    const exp = corp.requestedShipment as Record<string, unknown>;
    const vama = exp.customsClearanceDetail as Record<string, unknown>;
    const marfa = (vama.commodities as Record<string, unknown>[])[0];
    assert.deepEqual(marfa.customsValue, { amount: 250, currency: "RON" });
    assert.deepEqual(marfa.unitPrice, { amount: 250, currency: "RON" });
    assert.deepEqual(vama.totalCustomsValue, { amount: 250, currency: "RON" });
  });
});

describe("Descrierea marfii pentru vama", () => {
  test("⚠⚠ implicitul generic AVERTIZEAZA la international", () => {
    const av = avertismenteExpediere(CONFIG, date({ destinatar: IN_GERMANIA, continut: "Produse" }));
    assert.equal(av.length, 1, av.join(" | "));
    assert.match(av[0], /prea generala pentru vama/);
    assert.match(av[0], /DE/);
  });

  test("⚠ si o descriere goala la fel: acolo pleaca „Bunuri de consum”", () => {
    assert.equal(avertismenteExpediere(CONFIG, date({ destinatar: IN_GERMANIA, continut: "" })).length, 1);
    assert.equal(avertismenteExpediere(CONFIG, date({ destinatar: IN_GERMANIA, continut: null })).length, 1);
  });

  test("⚠ dar NU OPRESTE: „Produse” poate fi chiar descrierea potrivita", () => {
    /* Refuzat, comerciantul n-ar mai putea expedia deloc — si noi n-avem cum sa stim ce e
       inauntru. De aia e avertisment, nu lipsa. */
    assert.deepEqual(
      lipsuriExpediere(CONFIG, date({ destinatar: IN_GERMANIA, continut: "Produse" })).comanda, [],
    );
  });

  test("o descriere adevarata nu avertizeaza nimic", () => {
    assert.deepEqual(avertismenteExpediere(CONFIG, date({ destinatar: IN_GERMANIA, continut: "Tricouri bumbac" })), []);
  });

  test("⚠ si in tara nu se spune nimic: descrierea nu ajunge la nicio vama", () => {
    assert.deepEqual(avertismenteExpediere(CONFIG, date({ continut: "Produse" })), []);
  });

  test("⚠⚠ iar avertismentul chiar AJUNGE la om, INAINTE de emitere", () => {
    /*
     * O unealta scrisa anume si nechemata nu apara nimic. Si locul conteaza: intors din
     * raspunsul de EMITERE, avertismentul ar veni dupa ce coletul a plecat.
     */
    const actiuni = viu("src/lib/actions/fedex.actions.ts");
    assert.match(actiuni, /avertismente: avertismenteExpediere\(config, d\)/, "cotarea nu le calculeaza");
    const modal = viu("src/components/dashboard/FedexAwbModal.tsx");
    assert.match(modal, /setAvertismente\(r\.avertismente\)/, "modalul nu le primeste");
    assert.match(modal, /\{avertismente\.map\(/, "modalul nu le arata");
  });
});

describe("Cotarea in euro nu mai blocheaza emiterea", () => {
  const modal = viu("src/components/dashboard/FedexAwbModal.tsx");

  test("⚠⚠ butonul nu mai cere neaparat o oferta cotata", () => {
    assert.match(
      modal, /disabled=\{emitand \|\| \(!aleasa && !serviciuManual\)\}/,
      "emiterea atarna iar de o oferta pe care valuta o poate arunca toata",
    );
  });

  test("⚠ si exista de unde alege: nomenclatorul vine odata cu cotarea", () => {
    assert.match(viu("src/lib/actions/fedex.actions.ts"), /serviciiDeMana: serviciiPropuse\(/);
    assert.match(modal, /setServiciiDeMana\(r\.serviciiDeMana\)/);
    assert.match(modal, /<select/, "nu exista selector de serviciu");
  });

  test("⚠ selectorul apare DOAR cand cotarea chiar n-a intors nimic", () => {
    /* Aratat mereu, ar fi o a doua cale de a alege un serviciu si o sursa de greseli. */
    assert.match(modal, /oferte !== null && oferte\.length === 0 && serviciiDeMana\.length > 0/);
  });

  test("⚠⚠ iar pretul ramane NECUNOSCUT, nu zero", () => {
    /*
     * Un 0 scris in `fedex_cost` s-ar vedea la reconciliere ca transport gratuit si ar ascunde
     * exact diferenta pe care coloana exista s-o arate.
     */
    assert.match(modal, /cost: aleasa\?\.pret \?\? null/);
    assert.match(modal, /valuta: aleasa\?\.valuta \?\? null/);
    assert.ok(!/cost: aleasa\?\.pret \?\? 0/.test(modal));
  });

  test("⚠ oferta cotata are intaietate fata de alegerea cu mana", () => {
    assert.match(modal, /serviceType: aleasa\?\.serviceType \?\? manual\?\.cod \?\? null/);
  });
});
