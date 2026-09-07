import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeazaDefinitia, TIPURI } from "./definitie";
import { normalizeazaValorile } from "./valori";
import { sePoateRandaCaImagine } from "./adresa";
import { verificaPersonalizarea } from "./comanda";
import { detectDocMime, detectImageMime, isAllowedImage } from "@/lib/utils/file-signature";

/**
 * Al zecelea tip de camp: `fisier` (PDF sau imagine).
 *
 * ═══ ⚠ DE CE UN TIP NOU, SI NU UN `image` LARGIT ═══
 *
 * Cele 29 de produse personalizabile din productie au deja campuri `image`, iar trei locuri le
 * randeaza ca IMAGINI: vitrina (`<img>`), panoul de comenzi (`<Image>` cu miniatura) si emailul.
 * Largit `image` ca sa primeasca PDF, toate trei ar fi inceput sa deseneze o miniatura pentru un
 * document — adica o poza rupta pe fiecare, pe produse pe care nimeni nu le-a atins.
 *
 * ⚠ SI CAPATUL DE INCARCARE E PUBLIC. Felul continutului i-l spune tot clientul (`documente=1`),
 * deci el nu poate fi o poarta: oricine poate cere „documente" si urca un PDF, apoi il trimite
 * intr-un camp de IMAGINE. Poarta adevarata sta la COMANDA, unde se stie definitia produsului.
 */

process.env.R2_PUBLIC_URL = "https://pub-alnostru.r2.dev";

const BIZ = "11111111-1111-4111-8111-111111111111";
const adr = (nume: string) => `https://pub-alnostru.r2.dev/products/customizations/${BIZ}/${nume}`;

function produs(tip: "image" | "fisier") {
  return {
    customization: {
      enabled: true,
      fields: [{ id: "f", type: tip, label: "Fisierul de tipar", required: true, max_files: 2 }],
    },
  };
}

test("⚠ `fisier` e in lista de tipuri, si se citeste cu reglajele lui", () => {
  assert.ok((TIPURI as readonly string[]).includes("fisier"));
  const d = normalizeazaDefinitia(produs("fisier").customization)!;
  assert.equal(d.fields[0].type, "fisier");
  assert.equal(d.fields[0].max_files, 2, "reglajele de fisiere nu se citesc la tipul nou");
});

test("⚠ valorile se curata IDENTIC cu `image` — deosebirea o face serverul", () => {
  /*
   * In browser nu se poate sti daca adresa e a depozitului nostru: variabilele de mediu ale
   * serverului nu exista acolo. Deci `valori.ts` verifica FORMA, si atat — la fel pentru amandoua
   * tipurile.
   */
  for (const tip of ["image", "fisier"] as const) {
    const d = normalizeazaDefinitia(produs(tip).customization)!;
    const v = normalizeazaValorile(d, { f: [adr("x.pdf")] });
    assert.equal(v.ok, true, tip);
    assert.deepEqual(v.valori.get("f"), { fel: "fisiere", adrese: [adr("x.pdf")] }, tip);
  }
});

test("⚠ UN PDF INTR-UN CAMP DE IMAGINE SE REFUZA LA COMANDA", () => {
  /*
   * ⚠ ASTA E POARTA, si merita citita de doua ori.
   *
   * Ruta de incarcare accepta PDF numai cand i se cere (`documente=1`) — dar cererea aia vine de
   * la client, pe un capat PUBLIC si neautentificat. Deci oricine poate urca un PDF si il poate
   * trimite apoi intr-un camp de imagine. Consecinta nu e teoretica: panoul comerciantului
   * randeaza `type === "image"` cu `<Image>`, deci pe hartia dupa care se produce marfa ar fi
   * aparut o poza rupta in dreptul fisierului.
   *
   * Se poate verifica fiindca TERMINATIA E PUSA DE NOI: ruta o alege din OCTETII fisierului
   * (`EXT_BY_MIME`), nu din numele trimis de browser. Deci intrebarea „ce e in fisierul asta?"
   * are deja raspuns, si el sta chiar in cheie.
   */
  const laImagine = verificaPersonalizarea(produs("image"), { f: [adr("tipar.pdf")] }, BIZ);
  assert.equal(laImagine.fel, "eroare", "un PDF a intrat intr-un camp de imagine");
  assert.match(String((laImagine as { mesaj: string }).mesaj), /doar imagini/);

  /* Perechea, si fara ea proba n-ar insemna nimic: la campul de FISIER acelasi PDF trece. */
  const laFisier = verificaPersonalizarea(produs("fisier"), { f: [adr("tipar.pdf")] }, BIZ);
  assert.equal(laFisier.fel, "ok", "campul de fisier refuza chiar fisierele pentru care exista");

  /* Si o imagine trece pe amandoua — tipul nou nu inchide nimic din ce mergea. */
  assert.equal(verificaPersonalizarea(produs("image"), { f: [adr("poza.jpg")] }, BIZ).fel, "ok");
  assert.equal(verificaPersonalizarea(produs("fisier"), { f: [adr("poza.jpg")] }, BIZ).fel, "ok");
});

test("⚠ o terminatie inventata nu trece pe niciun tip", () => {
  /* Adresa e a depozitului nostru, prefixul e bun — si totusi nu poate veni de la ruta noastra. */
  for (const tip of ["image", "fisier"] as const) {
    for (const nume of ["ceva.exe", "ceva.svg", "fara-terminatie"]) {
      assert.equal(
        verificaPersonalizarea(produs(tip), { f: [adr(nume)] }, BIZ).fel, "eroare",
        `${tip} a acceptat ${nume}`,
      );
    }
  }
});

test("⚠ PDF-ul se recunoaste din OCTETI, si SEPARAT de imagini", () => {
  /*
   * ⚠ `detectImageMime` e chemat din sase locuri care inteleg toate prin „da" ca fisierul e o
   * IMAGINE si ca se poate randa, redimensiona sau trimite mai departe ca atare. O ramura de PDF
   * acolo l-ar fi facut sa minta in toate sase, tacut — inclusiv in conducta de optimizare.
   */
  const pdf = Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n", "binary");
  assert.equal(detectDocMime(pdf), "application/pdf");
  assert.equal(detectImageMime(pdf), null, "PDF-ul trece drept imagine");
  assert.equal(isAllowedImage(pdf, ["image/jpeg", "image/png"]), false);

  /* Perechea: o imagine adevarata nu devine document. */
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(detectImageMime(jpg), "image/jpeg");
  assert.equal(detectDocMime(jpg), null);

  /* Si un fisier prea scurt nu arunca. */
  assert.equal(detectDocMime(Buffer.from("%PD")), null);
});

test("⚠ lantul e INTREG: ruta cere felul, iar cele trei ecrane nu deseneaza miniaturi", () => {
  /*
   * Un tip care se vede in meniu si nu functioneaza e mai rau decat unul care lipseste:
   * comerciantul il alege, salveaza, si afla abia din prima comanda ca nu se poate incarca nimic.
   * Probele de mai jos sunt pe SURSA fiindca proiectul n-are jsdom.
   */
  const sursa = (r: string) =>
    readFileSync(path.resolve(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");

  /* 1. Ruta: plafon propriu si octeti verificati separat. */
  const ruta = sursa("src/app/api/upload-customization/route.ts");
  assert.match(ruta, /const cereDocumente = formData\.get\("documente"\) === "1";/);
  assert.match(ruta, /const document = cereDocumente \? detectDocMime\(buffer\) : null;/);
  assert.match(ruta, /"application\/pdf": "pdf",/, "ruta n-ar sti ce terminatie sa puna");
  assert.match(ruta, /const plafon = cereDocumente \? MAX_SIZE_DOC : MAX_SIZE;/);

  /* 2. Carligul chiar CERE documentele; fara asta ruta ar refuza fiecare PDF. */
  const carlig = sursa("src/components/storefront/sections/product/_shared/usePersonalizare.ts");
  assert.match(carlig, /const documente = camp\.type === "fisier";/);
  assert.match(carlig, /if \(documente\) fd\.append\("documente", "1"\);/);

  /* 3. Vitrina si panoul nu randeaza miniatura pentru un document. */
  /*
   * ⚠ PROBA ASTA INGHETASE FORMA, si a picat cand forma s-a facut mai buna.
   *
   * Ea cerea textual `{adrese.length > 0 && !documente && (` — adica doua liste paralele, una
   * pentru documente si una pentru imagini. Purtarea aia era corecta pentru PDF si GRESITA pentru
   * HEIC: o poza de pe iPhone e o imagine adevarata, intr-un camp de imagini, si tot nu se poate
   * desena. Intrebarea buna nu e „ce fel de CAMP e", ci „se poate desena ADRESA asta".
   *
   * Se cere acum REGULA: fiecare adresa trece prin `sePoateRandaCaImagine`, in amandoua ecranele.
   */
  const vitrina = sursa("src/components/storefront/sections/product/_shared/CampuriPersonalizare.tsx");
  assert.match(vitrina, /sePoateRandaCaImagine\(url\) \? \(/,
    "vitrina deseneaza miniaturi fara sa intrebe daca se poate");
  assert.equal(
    /\{adrese\.length > 0 && !documente && \(/.test(vitrina), false,
    "vitrina alege iar dupa TIPUL campului, nu dupa ce se poate desena",
  );

  const panou = sursa("src/components/dashboard/OrderDetailClient.tsx");
  assert.match(
    panou, /field\.type === "fisier" && Array\.isArray\(field\.value\) \?/,
    "panoul de comenzi randeaza un PDF ca imagine",
  );
  assert.match(panou, /sePoateRandaCaImagine\(url\) \? \(/,
    "panoul cere miniatura si pentru ce nu se poate decoda");

  /* 4. Comerciantul poate CHIAR sa aleaga tipul. */
  const editor = sursa("src/components/dashboard/PersonalizareCampuri.tsx");
  assert.match(editor, /fisier: "Fisier \(PDF sau imagine\)",/, "tipul nu se poate alege din meniu");
});

test("⚠ HEIC e o imagine ADEVARATA care nu se poate DESENA", () => {
  /*
   * ⚠ DOUA INTREBARI DIFERITE, si aici se vede de ce n-au acelasi raspuns.
   *
   * `TERMINATII` spune ce are voie intr-un camp: `.heic` e o imagine, trece de verificarea pe
   * octeti, si are voie intr-un camp de tip `image`. `sePoateRandaCaImagine` spune altceva: se
   * poate DESENA? Nu — Chrome, Firefox si Edge n-au decodor HEIC, iar `/api/img` refuza `.heic`
   * dinadins, ca octetii HEIF trimisi de un anonim sa nu ajunga la libheif.
   *
   * ⚠ CE COSTA CAND CELE DOUA SE CONFUNDA, masurat inainte de reparatie: clientul de pe Windows
   * alege `IMG_0421.HEIC`, incarcarea REUSESTE (200), si vede un patrat rupt exact in locul unde
   * tocmai a pus poza — fara niciun mesaj, fiindca nu e nicio eroare. Iar in panou `/api/img`
   * raspundea 404, deci comerciantul vedea acelasi patrat gol pe hartia dupa care produce marfa —
   * in ORICE browser, Safari inclusiv.
   */
  const nostru = (n: string) => `https://pub-alnostru.r2.dev/products/customizations/${BIZ}/${n}`;

  /* Are VOIE intr-un camp de imagini... */
  assert.equal(verificaPersonalizarea(produs("image"), { f: [nostru("poza.heic")] }, BIZ).fel, "ok");
  /* ...dar NU se deseneaza. */
  assert.equal(sePoateRandaCaImagine(nostru("poza.heic")), false);
  assert.equal(sePoateRandaCaImagine(nostru("poza.heif")), false);

  /* Perechea: formatele care chiar se pot desena. */
  for (const n of ["poza.jpg", "poza.jpeg", "poza.PNG", "poza.webp", "poza.gif"]) {
    assert.equal(sePoateRandaCaImagine(nostru(n)), true, n);
  }
  /* Si documentele, care n-au fost niciodata desenabile. */
  assert.equal(sePoateRandaCaImagine(nostru("tipar.pdf")), false);
  /*
   * ⚠ TERMINATIA SE IA DIN CALE, nu din tot sirul — si asta a prins-o un mutant.
   *
   * O adresa poate purta un parametru (`?v=2`, sau prefixul de redimensionare al CDN-ului). Citita
   * ca sir intreg, `poza.jpg?x=.pdf` ar fi parut un PDF, iar `tipar.pdf?v=.jpg` o imagine — adica
   * exact pe dos, si tocmai pe adresele pe care le compune singur CDN-ul.
   */
  assert.equal(sePoateRandaCaImagine(nostru("poza.jpg") + "?x=.pdf"), true);
  assert.equal(sePoateRandaCaImagine(nostru("tipar.pdf") + "?v=.jpg"), false);

  /* O adresa care nu se poate citi nu se deseneaza pe o presupunere. */
  assert.equal(sePoateRandaCaImagine("nu-e-o-adresa"), false);
  assert.equal(sePoateRandaCaImagine(nostru("fara-terminatie")), false);
});
