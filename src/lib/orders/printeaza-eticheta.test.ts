import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { dinBase64, esteChromium, estePdf } from "./printeaza-eticheta";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * „PRINTEAZA" LANGA „DESCARCA", IN FIECARE FEREASTRA DE AWB      (04.10.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cerut de un comerciant: eticheta sa se deschida direct pentru printare, fara fisier pe disc.
 * Drumul in browser l-a probat omul, in Chrome, pe modulul compilat: apare fereastra de printare
 * cu eticheta in ea. Aici se apara ce se poate apara fara browser: recunoasterea PDF-ului,
 * alegerea drumului, si ca nicio fereastra de curier nu ramane fara buton.
 */

const PDF = new TextEncoder().encode("%PDF-1.7\n...");
const ZPL = new TextEncoder().encode("^XA^FO50,50^FDAWB^FS^XZ");

test("PDF-ul se recunoaste dupa primii octeti, ZPL si paginile de eroare nu", () => {
  assert.equal(estePdf(PDF), true);
  assert.equal(estePdf(ZPL), false, "o eticheta Zebra s-ar fi trimis la printare ca PDF gol");
  assert.equal(estePdf(new TextEncoder().encode("<!doctype html>")), false);
  assert.equal(estePdf(new TextEncoder().encode("%PDF")), false, "prea scurt ca sa fie un PDF");
  assert.equal(estePdf(new Uint8Array()), false);
});

test("base64-ul actiunilor de server da exact octetii etichetei", () => {
  const b64 = Buffer.from(PDF).toString("base64");
  assert.deepEqual([...dinBase64(b64)], [...PDF]);
});

test("Chromium se recunoaste dupa `userAgentData`; Firefox si Safari merg pe tab nou", () => {
  assert.equal(esteChromium({ userAgentData: { brands: [{ brand: "Chromium" }, { brand: "Google Chrome" }] } }), true);
  assert.equal(esteChromium({ userAgentData: { brands: [{ brand: "Microsoft Edge" }, { brand: "Chromium" }] } }), true);
  /* Firefox si Safari nu au deloc `userAgentData`. */
  assert.equal(esteChromium({}), false);
  assert.equal(esteChromium(undefined), false);
  assert.equal(esteChromium({ userAgentData: { brands: [] } }), false);
});

test("⚠ cadrul de printare NU e `display: none`, altfel Chrome printeaza o pagina alba", () => {
  const sursa = readFileSync("src/lib/orders/printeaza-eticheta.ts", "utf8");
  const stil = sursa.match(/cadru\.style\.cssText = "([^"]+)"/);
  assert.ok(stil, "nu mai gasesc stilul cadrului");
  assert.doesNotMatch(stil[1], /display:\s*none|visibility:\s*hidden|width:\s*0|height:\s*0/);
});

test("⚠⚠ CSP-ul lasa cadrul `blob:`, altfel Chrome il blocheaza si printarea cade pe tab nou", () => {
  /*
   * Asa a iesit prima varianta in productie: probata local fara CSP, mergea; pe edinio.com,
   * `frame-src 'self' https:` bloca cadrul si omul primea un tab nou in loc de printare.
   */
  const config = readFileSync("next.config.ts", "utf8");
  const frame = config.match(/"frame-src ([^"]+)"/);
  assert.ok(frame, "nu mai gasesc `frame-src` in CSP");
  assert.match(frame[1], /(^|\s)blob:(\s|$)/, "`frame-src` nu mai permite `blob:`: printarea directa cade pe tab nou");
});

/* ═══ Fiecare fereastra de AWB are butonul ═══ */

/** Ferestrele care NU dau eticheta deloc, deci n-au ce printa. Fiecare cu motivul ei. */
const FARA_ETICHETA: Record<string, string> = {
  "PostaAwbModal.tsx": "API-ul Postei nu are metoda de tiparire; eticheta se scoate din aplicatia lor",
  "InnoshipAwbModal.tsx": "fereastra doar emite; eticheta nu se aduce prin ea",
};

test("⚠⚠ FIECARE fereastra de AWB care descarca o eticheta are si „Printeaza”", () => {
  const dir = join("src", "components", "dashboard");
  const ferestre = readdirSync(dir).filter((f) => /AwbModal\.tsx$/.test(f));
  assert.ok(ferestre.length >= 18, `doar ${ferestre.length} ferestre de AWB: s-a mutat folderul`);
  for (const f of ferestre) {
    const sursa = readFileSync(join(dir, f), "utf8");
    if (FARA_ETICHETA[f]) {
      assert.doesNotMatch(sursa, /\.download = |window\.open\(/,
        `${f} a primit o descarcare de eticheta; scoate-o din lista de exceptii si pune-i butonul`);
      continue;
    }
    assert.match(sursa, /<ButonPrinteaza\b/, `${f} descarca eticheta, dar n-are butonul de printare`);
    assert.match(sursa, /import \{ ButonPrinteaza \} from "\.\/ButonPrinteaza";/, `${f}: butonul nu e cel comun`);
  }
});

test("lotul din lista de comenzi se poate si printa, nu doar descarca", () => {
  const sursa = readFileSync("src/components/dashboard/OrdersClient.tsx", "utf8");
  assert.match(sursa, /onClick=\{\(\) => void descarcaEtichetele\("printeaza"\)\}/);
  assert.match(sursa, /await printeazaEticheta\(blob\)/);
});
