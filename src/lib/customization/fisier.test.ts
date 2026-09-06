import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeazaDefinitia, TIPURI } from "./definitie";
import { normalizeazaValorile } from "./valori";
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
  const vitrina = sursa("src/components/storefront/sections/product/_shared/CampuriPersonalizare.tsx");
  assert.match(vitrina, /const documente = camp\.type === "fisier";/);
  assert.match(vitrina, /\{adrese\.length > 0 && !documente && \(/, "vitrina deseneaza miniaturi si pentru documente");

  const panou = sursa("src/components/dashboard/OrderDetailClient.tsx");
  assert.match(
    panou, /field\.type === "fisier" && Array\.isArray\(field\.value\) \?/,
    "panoul de comenzi randeaza un PDF ca imagine",
  );

  /* 4. Comerciantul poate CHIAR sa aleaga tipul. */
  const editor = sursa("src/components/dashboard/PersonalizareCampuri.tsx");
  assert.match(editor, /fisier: "Fisier \(PDF sau imagine\)",/, "tipul nu se poate alege din meniu");
});
