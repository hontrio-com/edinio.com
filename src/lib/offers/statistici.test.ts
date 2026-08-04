import assert from "node:assert/strict";
import { test } from "node:test";
import { idsDeAfisare, MAX_OFERTE_PE_AFISARE } from "./statistici";
import { MAX_OFERTE_ACCEPTATE } from "./offer-pricing";

/**
 * Contorul de afisari primeste id-uri direct din browser, pe o cale publica si
 * anonima. Curatarea lor e aceeasi cu a ofertelor revendicate pe comanda, doar
 * ca depasirea se taie in loc sa refuze: o statistica nu opreste nimic.
 */

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("id-urile de afisare se deduplica si se curata", () => {
  assert.deepEqual(idsDeAfisare([UUID(1), UUID(1), UUID(2)]), [UUID(1), UUID(2)]);
  assert.deepEqual(idsDeAfisare(undefined), []);
  assert.deepEqual(idsDeAfisare([]), []);
});

test("ce nu e uuid nu ajunge in interogare", () => {
  // Coloana e `uuid`: un sir care nu se poate converti face RPC-ul sa cada.
  assert.deepEqual(idsDeAfisare(["", "a", "x".repeat(65), "'; drop table offers;--"]), []);
});

test("un sir umflat se TAIE, nu refuza", () => {
  // Cale publica, deci plafonata. Dar o afisare pierduta e mai buna decat o
  // pagina de produs care se plange ca n-a putut numara.
  const multe = Array.from({ length: MAX_OFERTE_PE_AFISARE + 5 }, (_, i) => UUID(i));
  assert.equal(idsDeAfisare(multe).length, MAX_OFERTE_PE_AFISARE);
  assert.deepEqual(idsDeAfisare(multe), multe.slice(0, MAX_OFERTE_PE_AFISARE));
});

test("plafonul de afisari e mai larg decat cel de oferte acceptate pe comanda", () => {
  // Comanda accepta cel mult 8 oferte; o pagina de produs poate ARATA mai multe
  // (`resolveProductOffers` nu taie lista), deci contorul nu are voie sa
  // mosteneasca plafonul comenzii.
  assert.ok(MAX_OFERTE_PE_AFISARE > MAX_OFERTE_ACCEPTATE);
});
