import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";
import { coletGls, type AdresaComanda, type DateExpediere } from "./expediere";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * ADRESA DE REZERVA LA LIVRAREA IN PUNCT (PSD)                (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * MyGLS API, pagina 9, verbatim:
 *
 *   FinalDeliveryAddress — „Backup delivery address (recipient's own address) when using PSD
 *   service. Used if ParcelShop becomes unavailable."
 *
 * Fara ea, un ParcelShop inchis inseamna colet intors — iar la ramburs, si marfa intoarsa, si
 * bani neincasati.
 *
 * ⚠ DE CE S-A PUTUT ABIA ACUM: strada cumparatorului era SUPRASCRISA cu adresa punctului la
 * plasarea comenzii, deci se pierdea. De pe 16.09.2026 se pastreaza separat, in
 * `shipping_address.home_address`. Blocajul era in checkout, nu la GLS.
 *
 * ⚠ SI CE RAMANE ADEVARAT: rezerva exista doar cand cumparatorul chiar si-a scris adresa
 * (formularul nu o cere cand se alege un punct), si niciodata pentru comenzile de marketplace.
 */

const OM: AdresaComanda = {
  nume: "Ion Popescu",
  strada: "Str. Lalelelor 4",
  oras: "Pascani",
  judet: "Iasi",
  codPostal: "705200",
  tara: "RO",
  telefon: "0721000111",
  email: "ion@example.com",
};

const PUNCT: AdresaComanda = {
  ...OM,
  strada: "Str. Stefan cel Mare 2",
  codPostal: "705201",
};

const BAZA: DateExpediere = {
  referinta: "#0011",
  destinatar: PUNCT,
  expeditor: { ...OM, nume: "Depozit", oras: "Cluj-Napoca", judet: "Cluj", codPostal: "400001" },
  clientNumber: 100000001,
  numarColete: 1,
};

describe("GLS: adresa de rezerva se trimite DOAR la punct, si doar intreaga", () => {
  test("⚠⚠ la punct, cu adresa lui completa: pleaca `FinalDeliveryAddress`", () => {
    const colet = coletGls({
      ...BAZA,
      servicii: { parcelShopId: "RO-PASCANI-01" },
      adresaDeAcasa: OM,
    });
    assert.ok(colet.FinalDeliveryAddress, "rezerva lipseste tocmai unde e nevoie de ea");
    assert.equal(colet.FinalDeliveryAddress?.City, "Pascani");
    assert.equal(colet.FinalDeliveryAddress?.ZipCode, "705200");
    assert.match(colet.FinalDeliveryAddress?.Street ?? "", /Lalelelor/);
    /* ⚠ Si adresa de LIVRARE ramane a punctului: rezerva n-o inlocuieste. */
    assert.match(colet.DeliveryAddress.Street, /Stefan cel Mare/);
    assert.equal(colet.DeliveryAddress.ZipCode, "705201");
  });

  test("⚠ la livrare obisnuita NU se trimite, chiar daca o avem", () => {
    /* Acolo adresa de livrare E deja a omului: o rezerva n-ar avea niciun inteles. */
    const colet = coletGls({ ...BAZA, destinatar: OM, adresaDeAcasa: OM });
    assert.equal(colet.FinalDeliveryAddress, undefined);
  });

  test("⚠ fara adresa lui, expedierea pleaca oricum — fara rezerva", () => {
    /* Comenzile de marketplace n-au adresa de acasa deloc. Un colet fara rezerva e cu mult mai
       bun decat niciun colet. */
    const colet = coletGls({ ...BAZA, servicii: { parcelShopId: "RO-PASCANI-01" } });
    assert.equal(colet.FinalDeliveryAddress, undefined);
    assert.ok(colet.DeliveryAddress, "expedierea trebuie sa plece si fara rezerva");
  });

  test("⚠⚠ o rezerva INCOMPLETA nu se trimite deloc", () => {
    /*
     * La ei `Name`, `Street`, `City` si `ZipCode` sunt toate REQUIRED intr-un `Address`. Una
     * incompleta ar fi refuzata cu totul — adica ar strica si expedierea care altfel pleca bine.
     * Mai bine fara rezerva decat fara colet.
     */
    for (const lipsa of ["nume", "strada", "oras", "codPostal"] as const) {
      const ciunta = { ...OM, [lipsa]: "" };
      const colet = coletGls({
        ...BAZA,
        servicii: { parcelShopId: "RO-PASCANI-01" },
        adresaDeAcasa: ciunta,
      });
      assert.equal(
        colet.FinalDeliveryAddress, undefined,
        `o rezerva fara ${lipsa} a plecat totusi: GLS ar refuza toata expedierea`,
      );
    }
  });
});

describe("⚠ si actiunea chiar o compune, din adresa pastrata la plasare", () => {
  const sursa = (c: string) => readFileSync(c, "utf8").replace(/\r\n/g, "\n");

  test("citeste `home_address`, nu adresa de livrare", () => {
    const s = sursa("src/lib/actions/gls.actions.ts");
    assert.match(s, /home_address/, "actiunea nu mai citeste strada pastrata a cumparatorului");
    assert.match(s, /adresaDeAcasa/, "adresa de rezerva nu mai ajunge la coletul GLS");
  });

  test("⚠ si rezolva codul postal pe localitatea LUI, nu pe a punctului", () => {
    /* E alta adresa: codul punctului ar duce rezerva in alta parte decat casa omului. */
    const s = sursa("src/lib/actions/gls.actions.ts").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.match(s, /codPostalOras\(config\.tara \|\| "RO", orasAcasa/);
  });
});
