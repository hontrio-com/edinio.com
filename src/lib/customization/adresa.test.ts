import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { numeleFisierului, sePoateRandaCaImagine, terminatia } from "./adresa";

/**
 * Modulul pur care citeste o valoare de fisier — si de ce merita el o proba proprie.
 *
 * ═══ ⚠ DEFECTUL PE CARE NIMIC NU L-A PRINS ═══
 *
 * Valoarea unui camp de fisier si-a schimbat forma: din adresa absoluta in cheie semnata. Citirea
 * terminatiei trecea prin `new URL()`, care ARUNCA pentru o cheie — deci intorcea `null`, si de
 * acolo poarta comenzii refuza ORICE fisier incarcat („se accepta doar imagini" pe un JPG
 * adevarat), iar amandoua ecranele nu mai desenau nicio miniatura.
 *
 * `tsc` era curat, lintul tacea, si TOATE probele treceau — fiindca fiecare dintre ele folosea
 * inca forma veche. De-aia fiecare afirmatie de aici are PERECHE pe amandoua formele.
 */

const CHEIE = "products/customizations/11111111-1111-4111-8111-111111111111/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee-0123456789abcdef01234567";
const ADRESA = "https://pub-alnostru.r2.dev/products/customizations/11111111-1111-4111-8111-111111111111/aaaaaaaa.jpg";

test("⚠ terminatia se citeste din CHEIE, nu doar dintr-o adresa", () => {
  assert.equal(terminatia(`${CHEIE}.jpg`), "jpg", "o cheie nu e o adresa absoluta, si asta rupea tot");
  assert.equal(terminatia(`${CHEIE}.PDF`), "pdf", "terminatia nu s-a facut mica");

  /* Perechea, forma veche: comenzile de dinainte poarta adrese intregi si trebuie sa mearga la fel. */
  assert.equal(terminatia(ADRESA), "jpg");
  assert.equal(terminatia(`${ADRESA}?v=2`), "jpg", "sirul de interogare nu face parte din nume");
});

test("⚠ ce nu se poate citi da null, si nu arunca", () => {
  for (const gunoi of ["", "fara-punct", "a.terminatie-prea-lunga", "https://exemplu.ro/fara-punct",
    "a.b/c", "not a url", "://", `${CHEIE}.`]) {
    assert.doesNotThrow(() => terminatia(gunoi), `a aruncat: ${gunoi}`);
    assert.equal(terminatia(gunoi), null, `a trecut: ${gunoi}`);
  }
  /* ⚠ `a.b/c` e proba pentru „ultima bucata, nu ultimul punct": un dosar cu punct in nume. */
});

test("⚠ miniatura se decide pe cheie la fel ca pe adresa", () => {
  assert.equal(sePoateRandaCaImagine(`${CHEIE}.jpg`), true, "miniatura nu se mai deseneaza niciodata");
  assert.equal(sePoateRandaCaImagine(`${CHEIE}.png`), true);

  /*
   * ⚠ Perechea care apara regula, nu forma: `heic` E o imagine si are voie intr-un camp `image`,
   * dar nu se poate DESENA in niciun browser de pe piata, iar `/api/img` o refuza dinadins. La fel
   * un PDF intr-un camp de fisier.
   */
  assert.equal(sePoateRandaCaImagine(`${CHEIE}.heic`), false);
  assert.equal(sePoateRandaCaImagine(`${CHEIE}.pdf`), false);
  assert.equal(sePoateRandaCaImagine(ADRESA), true);
});

test("⚠ numele afisat spune pozitia si felul, nu 65 de caractere de hexazecimal", () => {
  /*
   * Cheia nu poarta numele omului: ea e `<uuid>-<semnatura>.<ext>`, fiindca numele trimis de
   * browser nu se scrie niciodata pe disc. Deci ce se poate arata cinstit e „Fisierul 2.jpg".
   */
  assert.equal(numeleFisierului(`${CHEIE}.jpg`, 1), "Fisierul 2.jpg");
  assert.equal(numeleFisierului("ceva-fara-terminatie", 0), "Fisierul 1");

  /*
   * ⚠ Perechea care apara comenzile VECHI: ele poarta adresa intreaga, iar panoul scria de acolo
   * ultima bucata. Sarita, fiecare fisier al lor ar fi devenit „Fisierul N" peste noapte.
   */
  assert.equal(numeleFisierului(ADRESA, 0), "aaaaaaaa.jpg");
  assert.equal(numeleFisierului("https://pub-alnostru.r2.dev/a/poza%20de%20familie.jpg", 0), "poza de familie.jpg");

  /* Cine are numele adevarat in mana — vitrina, care tocmai a primit fisierul — il trece mai departe. */
  assert.equal(numeleFisierului(`${CHEIE}.jpg`, 0, "poza-de-familie.jpg"), "poza-de-familie.jpg");
  assert.equal(numeleFisierului(`${CHEIE}.jpg`, 0, "   "), "Fisierul 1.jpg", "un nume gol nu e un nume");
});

test("⚠ modulul ramane PUR: nimic de server nu are voie sa intre aici", () => {
  /*
   * ⚠ ASTA APARA CHIAR BUILD-UL. Doua componente „use client" — vitrina si panoul de comenzi —
   * importa de aici. Cand functia statea in `comanda.ts`, care importa `fisiere-private.ts`,
   * bundlerul trebuia sa rezolve `node:crypto` pentru pachetul de BROWSER al fiecarei pagini de
   * produs: schema `node:` nu e acoperita de harta de polyfill a lui Next (ea e pe numele
   * neprefixat), deci ori cadea build-ul, ori intra o biblioteca de criptografie in fiecare vitrina.
   */
  const brut = readFileSync(path.join(process.cwd(), "src/lib/customization/adresa.ts"), "utf8");
  /*
   * ⚠ COMENTARIILE SE SCOT INAINTE DE CAUTARE. Prima scriere a probei cadea pe propriul ei
   * comentariu, care pomeneste tocmai ce cauta („fara `process.env`") — o proba rosie pe un cod
   * curat e la fel de rea ca una verde pe unul stricat.
   */
  const sursa = brut.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const importuri = sursa.match(/^import .*$/gm) ?? [];
  assert.deepEqual(importuri, [], "modulul pur a capatat un import");
  assert.equal(/process\.env/.test(sursa), false, "un modul din browser a inceput sa citeasca mediul");

  /* Si amandoua ecranele trebuie sa ia regula DE AICI, nu din poarta de server. */
  for (const ecran of [
    "src/components/storefront/sections/product/_shared/CampuriPersonalizare.tsx",
    "src/components/dashboard/OrderDetailClient.tsx",
  ]) {
    const s = readFileSync(path.join(process.cwd(), ecran), "utf8");
    assert.match(s, /from "@\/lib\/customization\/adresa"/, `${ecran} nu mai citeste din modulul pur`);
    assert.equal(
      /from "@\/lib\/customization\/comanda"/.test(s), false,
      `${ecran} trage iar poarta de server in pachetul browserului`,
    );
  }
});
