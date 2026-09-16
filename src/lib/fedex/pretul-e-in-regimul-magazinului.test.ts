import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PRETUL TRANSPORTULUI E IN REGIMUL MAGAZINULUI             (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `buildFedexOptions` impingea `price: o.pret` — adica `totalNetCharge`, asa cum vine de la ei.
 * Pe un magazin cu preturi AFISATE FARA TVA, `computeVat` adauga cota peste pretul livrarii; iar
 * daca acela include deja TVA-ul FedEx, cumparatorul il plateste de DOUA ori.
 *
 * ⚠ Nu e o ipoteza teoretica: acelasi defect a fost reparat la Cargus, unde randul e
 * `tvaPeDeasupra ? q.priceNoVat : q.price`. FedEx era singurul care avea numerele si nu le
 * folosea — `ofertePosibile` calculeaza `verdictTva` si `pretFaraTva` pentru fiecare oferta.
 *
 * ⚠⚠ SI DE CE NU SE COBOARA MEREU LA NET: `verdictTva` are TREI valori tocmai fiindca raspunsul
 * lor nu e intotdeauna lamurit. Pe „exclude" pretul e deja net; pe „necunoscut" nu se ghiceste,
 * si se lasa brutul — care greseste in favoarea cumparatorului, nu a comerciantului.
 */

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const SHIPPING = "src/lib/actions/shipping.actions.ts";

describe("FedEx: pretul cotat respecta regimul de TVA al magazinului", () => {
  const s = viu(SHIPPING);

  test("⚠⚠ optiunea NU mai pleaca cu `o.pret` brut", () => {
    assert.ok(
      !/courier: "fedex",[\s\S]{0,300}?price: o\.pret,/.test(s),
      "pretul FedEx pleaca iar brut, deci TVA-ul se poate aduna de doua ori",
    );
    assert.match(s, /price: inRegimulMagazinului\(o\)/, "nu mai trece prin regimul magazinului");
  });

  test("⚠ si coborarea la net cere AMANDOUA conditiile", () => {
    /* Regimul magazinului SI un verdict limpede. Fara verdict, netul poate lipsi sau poate fi
       chiar egal cu brutul, iar o coborare oarba ar subfactura transportul. */
    assert.match(s, /tvaPeDeasupra && o\.verdictTva === "include"/);
    assert.match(s, /typeof o\.pretFaraTva === "number"/, "netul se foloseste fara sa se verifice ca exista");
  });

  test("⚠ regimul chiar ajunge in functie, nu se presupune acolo", () => {
    assert.match(s, /buildFedexOptions\(fxCfg, destination, weight, zone\.label, businessId, tvaPeDeasupra\)/);
    assert.match(s, /\n  tvaPeDeasupra: boolean,\n\): Promise<ShippingOption\[\]> \{/);
  });
});

describe("⚠ si niciun curier care coteaza LIVE nu uita regimul", () => {
  /*
   * Plasa apara REGULA peste toti, nu doar FedEx: `tvaPeDeasupra` s-a mutat deasupra buclei
   * tocmai fiindca il folosesc sapte curieri. Un al optulea care coteaza live si nu-l citeste
   * cade aici.
   */
  test("`tvaPeDeasupra` se citeste o singura data si se da mai departe", () => {
    const s = viu(SHIPPING);
    assert.match(
      s, /const tvaPeDeasupra = !!settings\.vat_enabled && settings\.prices_include_vat === false;/,
      "regimul nu se mai citeste din setarile magazinului",
    );
    const folosiri = (s.match(/tvaPeDeasupra/g) ?? []).length;
    assert.ok(folosiri >= 6, `regimul e folosit doar de ${folosiri} ori: un curier l-a pierdut`);
  });

  test("⚠ si constructorii de oferte FedEx/Woot il primesc pe fata", () => {
    const s = viu(SHIPPING);
    for (const f of ["buildFedexOptions", "buildWootOptions"]) {
      const i = s.indexOf(`async function ${f}`);
      assert.ok(i > 0, `${f} nu mai exista`);
      assert.ok(
        s.slice(i, i + 700).includes("tvaPeDeasupra"),
        `${f} nu mai primeste regimul magazinului`,
      );
    }
  });
});
