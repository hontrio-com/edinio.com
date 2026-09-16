import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * STRADA CUMPARATORULUI NU SE PIERDE CAND LIVRAREA MERGE IN PUNCT (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La livrarea in punct, `customer_address` devine adresa PUNCTULUI. Asta e corect si ramane:
 * tot ce citeste comanda mai departe — eticheta, emailul, factura, cererea catre curier —
 * trebuie sa vada unde pleaca de fapt coletul.
 *
 * Ce NU era corect: strada pe care si-o scrisese cumparatorul disparea odata cu inlocuirea.
 *
 * ⚠ MASURAT PE BAZA DE PRODUCTIE, 16.09.2026, si masuratoarea a schimbat concluzia:
 *   * 106 comenzi au un punct de ridicare;
 *   * 100 dintre ele vin de pe **eMAG** si n-au NICIO strada — marketplace-ul nu trimite
 *     adresa de acasa la livrarea in easybox, deci acolo n-a existat nimic de pierdut;
 *   * cele 6 venite din checkout-ul NOSTRU aveau, toate sase, `address` identic cu
 *     `locker_address`. Deci nu se pierdea „uneori": se pierdea de fiecare data.
 *
 * ⚠ La ce foloseste: GLS are `FinalDeliveryAddress`, adresa de rezerva incercata daca punctul
 * devine indisponibil. Fara ea, un punct inchis inseamna colet intors — iar la ramburs, si
 * marfa intoarsa, si bani neincasati.
 *
 * ⚠ CE NU REZOLVA, si sta scris ca sa nu se creada altceva: comenzile de marketplace tot n-au
 * adresa de acasa, iar la noi campul NU e obligatoriu cand se alege un punct (vezi
 * `checkout-core.ts`). Deci adresa de rezerva exista cand cumparatorul a completat-o, nu mereu.
 */

const sursa = (cale: string) => readFileSync(cale, "utf8").replace(/\r\n/g, "\n");

const COMENZI = "src/lib/actions/order.actions.ts";
const CHECKOUTURI = [
  "src/components/ministore/OrderModal.tsx",
  "src/components/storefront/sections/checkout/checkout-core.ts",
];

describe("Strada lui se pastreaza separat", () => {
  test("⚠⚠ AMANDOUA checkout-urile o trimit, nu doar unul", () => {
    /*
     * Incarcatura se construieste in DOUA fisiere aproape identice, fara niciun tip comun care
     * sa le lege: un camp adaugat intr-unul singur compileaza curat si merge pentru jumatate
     * dintre comenzi. Aceeasi plasa ca la `locker_token` si `fan_point_type`.
     */
    for (const fisier of CHECKOUTURI) {
      assert.match(
        sursa(fisier), /customer_home_address: form\.address,/,
        `${fisier} nu trimite strada cumparatorului: adresa de rezerva ar exista doar pe jumatate din comenzi`,
      );
    }
  });

  test("⚠ si o trimit pe cea a OMULUI, nu pe cea a punctului", () => {
    /*
     * Daca ar trimite `courierSelection.lockerAddress`, campul ar fi plin si complet inutil:
     * adresa de rezerva ar fi chiar punctul care tocmai s-a dovedit indisponibil.
     */
    for (const fisier of CHECKOUTURI) {
      const s = sursa(fisier);
      const rand = /customer_home_address: ([^\n,]+),/.exec(s)?.[1] ?? "";
      assert.equal(rand.trim(), "form.address", `${fisier}: adresa de rezerva nu e a cumparatorului`);
    }
  });

  test("⚠⚠ serverul o scrie DOAR cand aduce ceva: nevida si diferita de adresa de livrare", () => {
    /*
     * Pe o livrare obisnuita cele doua sunt acelasi lucru. O copie in plus n-ar fi decat un al
     * doilea adevar care poate ramane in urma — si care ar face `home_address` sa para o adresa
     * de rezerva chiar acolo unde nu exista niciun punct.
     */
    const s = sursa(COMENZI);
    assert.match(s, /data\.customer_home_address\?\.trim\(\)/);
    assert.match(
      s, /data\.customer_home_address\.trim\(\) !== data\.customer_address\.trim\(\)/,
      "lipseste conditia care impiedica dublarea adresei pe o livrare obisnuita",
    );
    assert.match(s, /home_address: data\.customer_home_address\.trim\(\)/);
  });

  test("⚠ si o scrie pe AMANDOUA drumurile de comanda din `order.actions`", () => {
    /* Fisierul are doua constructii aproape identice de `shipping_address` (cos si comanda
       scrisa de comerciant). Una singura reparata ar lasa cealalta jumatate fara nimic. */
    const s = sursa(COMENZI);
    const cate = s.split("home_address: data.customer_home_address.trim()").length - 1;
    assert.equal(cate, 2, `s-a scris pe ${cate} drumuri din 2`);
  });

  test("⚠ adresa de livrare RAMANE a punctului: nimic din reparatia asta n-o atinge", () => {
    /*
     * Cel mai usor mod de a „repara" pierderea ar fi fost sa nu se mai inlocuiasca
     * `customer_address`. Ar fi fost gresit si scump: eticheta, emailul si cererea catre curier
     * ar fi plecat spre casa omului, iar coletul spre punct.
     */
    for (const fisier of CHECKOUTURI) {
      assert.match(
        sursa(fisier), /customer_address: courierSelection\?\.deliveryType === "locker" && courierSelection\.lockerAddress/,
        `${fisier}: adresa de livrare nu mai e a punctului`,
      );
    }
  });
});
