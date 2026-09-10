import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import sharp from "sharp";
import { MAX_PIXELI } from "@/lib/utils/file-signature";

/**
 * O poza de sub un megaoctet nu are voie sa omoare o functie.
 *
 * ═══ ⚠ CE APARA, SI DE CE NU AJUNGE SEMNATURA ═══
 *
 * Incarcarile se verifica pe OCTETI, nu pe antetul trimis de browser — bine, si asta raspunde la
 * „ce fel de fisier e". Dar nu raspunde la „cat de mare se desface". Un PNG INTERLAZAT de
 * 16000x16000 cu pixeli zero se comprima la sub un megaoctet, deci trece si de plafonul de 10 MB —
 * iar `sharp` il decodeaza INTREG, fiindca interlazarea nu se poate citi in flux.
 *
 * Masurat cu chiar lantul din `/api/img` (rotate + resize 256 + webp), inainte de reparatie:
 *
 *     16000x16000 interlazat (973 KiB), fara plafon : OK  1772 ms, varf 1166 MiB
 *     acelasi, cu plafonul                          : refuzat in 1 ms, 73 MiB
 *     2000x1500 obisnuita, cu plafon                : OK  27 ms, 93 MiB
 *
 * Amplificare de ~1200x, pe un capat PUBLIC si scutit de poarta MFA. O functie de 1024 MB moare la
 * o singura cerere, si nu trebuie nici macar un cont ca s-o trimiti.
 *
 * ⚠ EXEMPLUL DIN AUDIT ERA CEL NEPERICULOS. 50000x50000 e refuzat si fara noi, de plafonul
 * implicit al lui `sharp` (268 de megapixeli). Cel care trece e tocmai cel care incape sub el —
 * de-aia proba de mai jos construieste o imagine de 60 de megapixeli, nu una absurda.
 *
 * ⚠ SI CE NU SE FACE, fiindca ar redeschide o usa inchisa cu bilet: nu se adauga `.heic` in
 * `KEY_RE` (regula de chei a lui `/api/img`, din `latimi-imagini.ts`), si nu se pune conversie pe server. `securitate-audit.test.ts` pazeste
 * dinadins ca octetii HEIF trimisi de un anonim sa NU ajunga la libheif pe calea de decodare.
 */

/** Cat de mare e imaginea din proba: peste plafon, dar sub cel implicit al lui `sharp`. */
const LATURA = 8000;
const INALTIME = 7500; /* 60 de megapixeli */

/**
 * Un PNG adevarat, de dimensiunile cerute, construit aici.
 *
 * ⚠ Se construieste, nu se tine in repo: un fisier binar de proba n-ar spune nimanui de ce exista,
 * iar unul mic n-ar dovedi nimic. Zece randuri de zlib arata exact unde e amplificarea.
 */
function pngUrias(latime: number, inaltime: number): Buffer {
  const semnatura = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const bucata = (tip: string, date: Buffer): Buffer => {
    const lungime = Buffer.alloc(4);
    lungime.writeUInt32BE(date.length, 0);
    const corp = Buffer.concat([Buffer.from(tip, "ascii"), date]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(corp), 0);
    return Buffer.concat([lungime, corp, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(latime, 0);
  ihdr.writeUInt32BE(inaltime, 4);
  ihdr[8] = 8;   /* 8 biti pe canal */
  ihdr[9] = 0;   /* tonuri de gri: cat mai putini octeti bruti, ca proba sa fie rapida */
  ihdr[10] = 0;  /* deflate */
  ihdr[11] = 0;  /* filtru standard */
  ihdr[12] = 0;  /* neintretesut */

  /* Randuri de zerouri: se comprima aproape complet, si tocmai asta e ideea. */
  const brut = Buffer.alloc((latime + 1) * inaltime, 0);
  const idat = deflateSync(brut, { level: 9 });

  return Buffer.concat([
    semnatura,
    bucata("IHDR", ihdr),
    bucata("IDAT", idat),
    bucata("IEND", Buffer.alloc(0)),
  ]);
}

let TABEL: number[] | null = null;
function crc32(buf: Buffer): number {
  if (!TABEL) {
    TABEL = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABEL[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const octet of buf) c = TABEL[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

test("⚠ plafonul de pixeli REFUZA bomba, si LASA o poza adevarata sa treaca", async () => {
  /*
   * ⚠ AMANDOUA FETELE, si a doua nu e decor: un plafon pus prea jos ar fi refuzat pozele
   * cumparatorilor, iar proba ar fi ramas verde. Cele 29 de produse personalizabile din productie
   * au toate campuri de imagine — deci exact ele ar fi patit-o.
   */
  const bomba = pngUrias(LATURA, INALTIME);
  assert.ok(LATURA * INALTIME > MAX_PIXELI, "imaginea de proba nu depaseste plafonul");
  assert.ok(bomba.length < 10 * 1024 * 1024, `bomba are ${bomba.length} octeti — ar cadea oricum pe marime`);

  await assert.rejects(
    () => sharp(bomba, { limitInputPixels: MAX_PIXELI }).resize({ width: 256 }).webp().toBuffer(),
    /pixel limit/i,
    "bomba a fost decodata",
  );

  /* Perechea: o poza de telefon, cu ACELASI plafon. 48 MP inseamna 8000x6000; 12 MP e obisnuitul. */
  const obisnuita = await sharp({
    create: { width: 4000, height: 3000, channels: 3, background: { r: 200, g: 200, b: 200 } },
  }).png().toBuffer();
  const iesire = await sharp(obisnuita, { limitInputPixels: MAX_PIXELI })
    .resize({ width: 256 }).webp().toBuffer();
  assert.ok(iesire.length > 0, "plafonul refuza si pozele adevarate");
});

test("⚠ plafonul e CHEMAT pe toate cele trei capete care ating octetii", () => {
  /*
   * O constanta care nu se foloseste nicaieri nu apara nimic, si nici tsc, nici proba de mai sus
   * n-ar observa. Cele trei capete si ce apara fiecare:
   *
   *  - `/api/img` DECODEAZA. E capatul public si scutit de poarta MFA, deci acolo e paguba.
   *  - `/api/upload-customization` e tot public, si el SCRIE in depozit. Fara paza aici, bomba
   *    ramane acolo si o poate declansa oricine ii cere miniatura — inclusiv comerciantul care
   *    deschide comanda, fara sa stie ce apasa.
   *  - `/api/upload` e autentificat, dar scrie in aceeasi galeata si aceleasi chei ajung tot la
   *    `/api/img`.
   */
  const citeste = (r: string) => readFileSync(join(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");

  const img = citeste("src/app/api/img/route.ts");
  assert.match(img, /sharp\(original, \{ limitInputPixels: MAX_PIXELI \}\)/,
    "/api/img decodeaza iar fara plafon");

  /*
   * ⚠ SE CERE GARDA INTREAGA, NU EXPRESIA — si asta a prins-o un mutant, nu o citire atenta.
   *
   * Prima forma cerea doar `pixeli > MAX_PIXELI`. Mutantul care punea `if (false && pixeli >
   * MAX_PIXELI)` lasa expresia la locul ei si trecea: comparatia exista, dar nu mai hotara nimic.
   * Cerand `if (` lipit de comparatie, se cere ca ea sa fie CONDITIA, nu un fragment din ea.
   */
  /*
   * ⚠ S-A MUTAT PE 07.09.2026, SI E MAI BINE ASA. Octetii nu mai trec prin functie (Vercel refuza
   * cererile de peste 4,5 MB, iar platforma promitea 10 si 40), deci masurarea se face la
   * FINALIZARE, pe octetii citti inapoi din depozit.
   *
   * ⚠ SI SE MASOARA PE ANTET, nu pe fisierul intreg: `sharp().metadata()` nu decodeaza. Adus
   * intreg, un PDF de 40 MB ar fi intrat degeaba in memoria functiei — adica exact drumul de care
   * am scapat.
   *
   * ⚠ CE E NOU SI NU EXISTA INAINTE: bomba refuzata se si STERGE din depozit. Pana acum ea nici nu
   * ajungea acolo; acum ajunge, deci trebuie scoasa — altfel ar fi ramas pe factura, si `/api/img`
   * ar fi putut-o primi.
   */
  const pers = citeste("src/app/api/upload-customization/finalizeaza/route.ts");
  assert.match(pers, /await sharp\(inceput\)\.metadata\(\)/, "capatul public nu mai masoara imaginea");
  assert.match(
    pers, /if \(\(m\.width \?\? 0\) \* \(m\.height \?\? 0\) > MAX_PIXELI\) \{/,
    "capatul public nu mai OPRESTE la plafon",
  );
  assert.ok(
    pers.indexOf("MAX_PIXELI") < pers.indexOf("await mutaIncarcarea("),
    "bomba se masoara dupa ce a primit deja o cheie buna",
  );
  assert.match(pers, /await stergeIncarcarea\(referinta\)/, "bomba refuzata ramane in depozit");

  const media = citeste("src/app/api/upload/route.ts");
  assert.match(
    media, /if \(width !== null && height !== null && width \* height > MAX_PIXELI\) \{/,
    "biblioteca media nu mai OPRESTE la plafon",
  );
  /*
   * ⚠ SI MASURAREA STA INAINTEA SCRIERII. Mutata dupa `uploadToR2`, cum era, bomba ajunge oricum
   * in depozit si refuzul devine o vorba: fisierul e acolo, si `/api/img` il poate primi.
   */
  assert.ok(
    media.indexOf("width * height > MAX_PIXELI") < media.indexOf("await uploadToR2(buffer, key"),
    "dimensiunile se masoara dupa ce fisierul a fost deja scris in depozit",
  );
});
