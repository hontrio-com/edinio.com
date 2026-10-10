import test from "node:test";
import assert from "node:assert/strict";
import {
  CALITATE, LATIMI, LATIMI_ECRAN, TREPTE_CALITATE, TREPTE_LATIME, cheieVarianta, calitateaVariantei, latimeaVariantei,
  gazdaImaginiDirecte,
} from "./latimi-imagini";
import { variantaCeruta } from "../../infra/cloudflare/imagini-directe/worker.js";

/**
 * CALEA DIRECTA — pagina cere varianta de la Worker, fara redirectarea prin Vercel (09.10.2026).
 *
 * ═══ ⚠ DE CE E UN FISIER SEPARAT ═══
 *
 * `NEXT_PUBLIC_IMAGINI_DIRECTE` se citeste la INCARCAREA modulelor, nu la fiecare apel, deci cele
 * doua purtari nu incap in aceeasi trecere: `adresa-imaginii.test.ts` probeaza calea prin
 * `/api/img` (variabila stinsa), fisierul asta pe cea directa.
 *
 * ⚠ CE APARA: cu calea aprinsa, o adresa care nu se potriveste cu ce scrie ruta nu e o poza mai
 * putin clara, e o poza care ocoleste MEREU prin ruta (Workerul n-o gaseste niciodata in depozit)
 * sau una refuzata cu 404. Deci probele cer potrivirea pe TOT lantul: adresa din pagina -> ce
 * accepta Workerul -> ce scrie ruta.
 */

const CDN = "https://cdn-de-proba.exemplu";
const GAZDA = "https://img.de-proba.exemplu";
process.env.NEXT_PUBLIC_CDN_URL = CDN;
process.env.NEXT_PUBLIC_IMAGINI_DIRECTE = GAZDA;

const { default: imageLoader } = await import("./supabase-image-loader");
const { cdnImage, cdnSrcSet, imaginePagina } = await import("./cdn-image");

const CHEIE = "products/11111111-1111-4111-8111-111111111111/poza.webp";
const PE_R2 = `https://pub-exemplu.r2.dev/${CHEIE}`;
const PE_CDN = `${CDN}/${CHEIE}`;

/** Ce obiect ar scrie `/api/img` pentru cererea asta (aceleasi trepte ca ruta). */
const scrisDeRuta = (cheie: string, w: number, q: number) => cheieVarianta(cheie, latimeaVariantei(w), calitateaVariantei(q));

test("cu calea aprinsa, pozele din depozit merg direct la Worker, nu prin /api/img", () => {
  for (const src of [PE_R2, PE_CDN]) {
    const u = imageLoader({ src, width: 640, quality: 75 });
    assert.equal(u, `${GAZDA}/_optim/w640q75/${CHEIE}.webp`);
    assert.equal(cdnImage(src, 640), u, "cdnImage si next/image trebuie sa dea ACEEASI adresa");
  }
});

test("⚠ fiecare adresa directa e acceptata de Worker si arata EXACT obiectul pe care il scrie ruta", () => {
  /*
   * ⚠ ASTA E PROBA CARE APARA LANTUL. Daca adresa din pagina si cheia scrisa de ruta se despart
   * (alta treapta, alta terminatie, alt prefix), Workerul nu gaseste niciodata varianta si fiecare
   * poza ocoleste prin ruta: costul de dinainte, plus un salt.
   */
  const chei = [
    CHEIE,
    "products/u/poza.jpg",
    "logos/u/sigla.png",
    "covers/u/coperta.jpeg",
    "gallery/u/a/b/c.gif",
    "avatars/u/x_y-z.avif",
  ];
  for (const cheie of chei) {
    for (const src of [`https://pub-exemplu.r2.dev/${cheie}`, `${CDN}/${cheie}`]) {
      for (const w of [...LATIMI, 1, 100, 700, 5000]) {
        for (const q of [undefined, 75, 80, 1, 100]) {
          const din = [imageLoader({ src, width: w, quality: q }), cdnImage(src, w, q ?? CALITATE)];
          for (const u of din) {
            assert.ok(u.startsWith(`${GAZDA}/_optim/`), `nu e directa: ${u}`);
            const v = variantaCeruta(new URL(u).pathname);
            assert.ok(v, `Workerul refuza adresa pe care o da pagina: ${u}`);
            assert.equal(v.cheie, cheie);
            assert.equal(v.obiect, scrisDeRuta(cheie, v.latime, v.calitate), `Workerul cauta alt obiect decat scrie ruta: ${u}`);
          }
        }
      }
    }
  }
});

test("latimea si calitatea din adresa sunt treptele rutei, nu numarul cerut", () => {
  // quality=80 nu e treapta: ruta il urca la 85, deci si adresa directa trebuie sa spuna 85.
  assert.equal(imageLoader({ src: PE_R2, width: 640, quality: 80 }), `${GAZDA}/_optim/w640q85/${CHEIE}.webp`);
  // cdnImage urca intai pe scara comuna (700 -> 1024), apoi pe treptele rutei (1024 ramane).
  assert.equal(cdnImage(PE_R2, 700), `${GAZDA}/_optim/w1024q75/${CHEIE}.webp`);
  for (const w of LATIMI) assert.ok((TREPTE_LATIME as readonly number[]).includes(w), `latimea ${w} de pe scara nu e treapta a rutei`);
  assert.ok((TREPTE_CALITATE as readonly number[]).includes(CALITATE));
});

test("⚠ ce n-ar optimiza ruta ramane pe /api/img, nu primeste o adresa directa refuzata", () => {
  /*
   * Fisierele cumparatorilor, terminatiile care nu-s imagini si prefixele straine: Workerul le-ar
   * da 404, adica POZA RUPTA. Pe /api/img primesc ce primeau si inainte.
   */
  const refuzate = [
    "products/customizations/u/fisier.webp",
    "products/u/CUSTOMIZATIONS/../x.webp",
    "products/u/document.pdf",
    "altceva/u/poza.webp",
    "products/u/cu spatiu.webp",
  ];
  for (const cheie of refuzate) {
    const src = `${CDN}/${cheie}`;
    for (const u of [imageLoader({ src, width: 640, quality: 75 }), cdnImage(src, 640)]) {
      assert.ok(!u.startsWith(GAZDA), `o cheie refuzata a primit adresa directa: ${u}`);
    }
  }
});

test("adresele straine, cele deja transformate si cele directe raman neatinse", () => {
  const straina = "https://altcineva.exemplu/poza.webp";
  assert.equal(imageLoader({ src: straina, width: 640 }), straina);
  assert.equal(cdnImage(straina, 640), straina);
  const directa = `${GAZDA}/_optim/w640q75/${CHEIE}.webp`;
  assert.equal(imageLoader({ src: directa, width: 1024 }), directa);
  assert.equal(cdnImage(directa, 1024), directa);
  assert.equal(cdnImage("", 640), "");
});

test("srcset-ul are o intrare pe treapta, toate directe, cu descriptorul latimii reale", () => {
  const s = cdnSrcSet(PE_CDN);
  assert.ok(s);
  const intrari = s.split(", ");
  assert.equal(intrari.length, LATIMI_ECRAN.length);
  LATIMI_ECRAN.forEach((w, i) => assert.equal(intrari[i], `${GAZDA}/_optim/w${w}q75/${CHEIE}.webp ${w}w`));
  assert.equal(cdnSrcSet("https://altcineva.exemplu/poza.webp"), undefined, "o adresa straina n-are srcset");
  assert.equal(cdnSrcSet(""), undefined);
});

test("⚠ in blocurile de pagina un GIF ramane originalul; restul pozelor merg la varianta", () => {
  const gif = `${CDN}/products/u/banner.gif`;
  assert.equal(imaginePagina(gif, 1024), gif, "sharp ar fi pastrat doar primul cadru al animatiei");
  assert.equal(imaginePagina(`${gif}?v=1`, 1024), `${gif}?v=1`);
  assert.equal(cdnSrcSet(gif), undefined);
  assert.equal(imaginePagina(PE_CDN, 1024), cdnImage(PE_CDN, 1024));
  assert.equal(imaginePagina("", 1024), "");
});

test("⚠ o valoare stricata in Vercel STINGE calea directa, nu rupe pozele", () => {
  assert.equal(gazdaImaginiDirecte(undefined), "");
  assert.equal(gazdaImaginiDirecte(""), "");
  assert.equal(gazdaImaginiDirecte("http://img.exemplu"), "", "fara https, pagina ar cere continut mixt");
  assert.equal(gazdaImaginiDirecte("https://img.exemplu/imagini"), "", "cu cale, adresele ar iesi gresite");
  assert.equal(gazdaImaginiDirecte("https://img.exemplu/?a=1"), "");
  assert.equal(gazdaImaginiDirecte("nu e adresa"), "");
  assert.equal(gazdaImaginiDirecte("https://u:p@img.exemplu"), "");
  assert.equal(gazdaImaginiDirecte("https://img.exemplu/"), "https://img.exemplu", "bara de la final se iarta");
  assert.equal(gazdaImaginiDirecte("  https://img.exemplu  "), "https://img.exemplu");
});
