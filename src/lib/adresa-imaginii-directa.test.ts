import test from "node:test";
import assert from "node:assert/strict";
import { CALITATE, LATIMI, cheieVarianta } from "./latimi-imagini";
import { CALE } from "../../infra/cloudflare/worker-variante-imagini.js";

/**
 * CALEA DIRECTA — cand browserul cere varianta de pe domeniul CDN, fara sa mai treaca pe la noi.
 *
 * ═══ ⚠ DE CE E UN FISIER SEPARAT ═══
 *
 * Steagul `NEXT_PUBLIC_IMAGINI_DIRECT` se citeste la INCARCAREA modulului, nu la fiecare apel.
 * Deci cele doua purtari nu incap in aceeasi trecere: `adresa-imaginii.test.ts` probeaza calea
 * prin `/api/img`, asta o probeaza pe cea directa.
 *
 * ⚠ CE APARA: cu steagul aprins, o adresa gresita nu mai e o poza mai putin clara, e o POZA
 * RUPTA — nimic nu mai sta intre browser si depozit ca sa repare ceva. Iar adresa trebuie sa fie
 * chiar cea pe care o SCRIE `/api/img` si pe care o RECUNOASTE Workerul; trei piese, un singur
 * sir.
 */

const CDN = "https://cdn-de-proba.exemplu";
process.env.NEXT_PUBLIC_CDN_URL = CDN;
process.env.NEXT_PUBLIC_IMAGINI_DIRECT = "1";

const { default: imageLoader } = await import("./supabase-image-loader");
const { cdnImage } = await import("./cdn-image");

const CHEIE = "products/11111111-1111-4111-8111-111111111111/poza.webp";
const PE_R2 = `https://pub-exemplu.r2.dev/${CHEIE}`;

test("⚠ cu steagul aprins, amandoua caile cer obiectul DIRECT de pe CDN", () => {
  for (const latime of LATIMI) {
    const asteptat = `${CDN}/${cheieVarianta(CHEIE, latime, CALITATE)}`;

    assert.equal(
      imageLoader({ src: PE_R2, width: latime, quality: CALITATE }), asteptat,
      `next/image nu cere direct la latimea ${latime}`,
    );
    assert.equal(
      cdnImage(PE_R2, latime), asteptat,
      `cdnImage nu cere direct la latimea ${latime}`,
    );
  }
});

test("⚠ adresa ceruta e chiar cea pe care o RECUNOASTE Workerul", () => {
  /*
   * ⚠ LANTUL INTREG, INTR-UN SINGUR RAND. Loaderul compune adresa, Workerul o desface. Intre ele
   * nu exista nici tip comun, nici build comun — doar sirul asta. Daca se despart, browserul cere
   * ceva ce Workerul nu recunoaste, deci nimeni nu mai face varianta si poza ramane rupta.
   */
  for (const latime of LATIMI) {
    const adresa = imageLoader({ src: PE_R2, width: latime, quality: CALITATE });
    const cale = new URL(adresa).pathname;
    const m = CALE.exec(cale);

    assert.ok(m, `Workerul nu recunoaste ce cere loaderul: ${cale}`);
    assert.equal(Number(m[1]), latime);
    assert.equal(Number(m[2]), CALITATE);
    assert.equal(m[3], CHEIE, "cheia pe care ar cere-o Workerul nu e cea ceruta de browser");
  }
});

test("⚠ ce nu e al nostru pleaca neatins si in modul direct", () => {
  /*
   * Perechea negativa ramane neaparata: aici o greseala nu mai are nicio plasa dedesubt, fiindca
   * `/api/img` — care refuza cheile straine — nu mai e pe drum.
   */
  for (const strain of ["https://exemplu.ro/poza.jpg", "/local/poza.png", ""]) {
    assert.equal(cdnImage(strain, 640), strain);
    assert.equal(imageLoader({ src: strain, width: 640 }), strain);
  }
});

test("⚠ fara `NEXT_PUBLIC_CDN_URL` calea directa NU se aprinde", async () => {
  /*
   * ⚠ CELE DOUA CONDITII SE CER AMANDOUA. Fara gazda, o adresa directa ar fi iesit ca
   * `/_optim/…` — o cale relativa pe domeniul magazinului, unde nu exista niciun obiect. Adica
   * poze rupte pe tot magazinul, dintr-o singura variabila uitata in panou.
   *
   * ⚠ SE PROBEAZA CA PURTARE, nu citind sursa dupa `DIRECT && CDN`: o proba pe sursa ar fi
   * trecut si peste conditia scrisa doar intr-un comentariu, si n-ar fi spus nimic despre CE
   * adresa iese. Modulele isi citesc mediul la incarcare, deci se reincarca cu alt mediu — de-aia
   * importul poarta o interogare, care da o instanta noua.
   */
  const cdnDeDinainte = process.env.NEXT_PUBLIC_CDN_URL;
  delete process.env.NEXT_PUBLIC_CDN_URL;
  try {
    /*
     * ⚠ SPECIFICATORUL STA INTR-O VARIABILA, si nu din cochetarie: scris literal, `tsc` incearca
     * sa rezolve `./cdn-image.ts?fara-cdn` ca fisier si cade cu TS2307. Interogarea e pentru
     * incarcatorul din Node — ea da o INSTANTA noua a modulului, cu mediul de acum — si nu
     * inseamna nimic pentru sistemul de tipuri.
     */
    const caleLoader = "./supabase-image-loader.ts?fara-cdn";
    const caleCdn = "./cdn-image.ts?fara-cdn";
    const { default: fara } = (await import(caleLoader)) as { default: typeof imageLoader };
    const { cdnImage: faraCdnImage } = (await import(caleCdn)) as { cdnImage: typeof cdnImage };

    for (const iesire of [fara({ src: PE_R2, width: 640, quality: CALITATE }), faraCdnImage(PE_R2, 640)]) {
      assert.equal(
        iesire.startsWith("/_optim/"), false,
        `a iesit o cale relativa care nu duce nicaieri: ${iesire}`,
      );
      assert.ok(iesire.startsWith("/api/img?"), `nu s-a cazut pe optimizatorul nostru: ${iesire}`);
    }
  } finally {
    if (cdnDeDinainte !== undefined) process.env.NEXT_PUBLIC_CDN_URL = cdnDeDinainte;
  }
});
