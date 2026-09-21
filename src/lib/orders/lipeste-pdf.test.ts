import test from "node:test";
import assert from "node:assert/strict";

import { pdfDintrunSingurFolio } from "@/lib/emag/pdf-simplu";
import { lipesteCuNumar, lipesteDocumente } from "./lipeste-pdf";

/*
 * ⚠ SE LIPESC PDF-URI ADEVARATE, nu obiecte mimate.
 *
 * Toata miza fisierului e daca biblioteca poate CITI documente facute de altcineva
 * si le poate pune cap la cap. Un test cu obiecte inventate ar fi probat exact
 * partea care nu conteaza. Documentele de aici sunt scrise de `pdf-simplu.ts`, adica
 * de alt cod decat cel care le lipeste.
 */
function unPdf(text: string): Uint8Array {
  const b = pdfDintrunSingurFolio([{ text, marime: 12 }]);
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength).slice();
}

/**
 * Cate pagini are documentul.
 *
 * ⚠ SE CITESTE DOCUMENTUL, nu se numara potriviri de `/Type /Page` in octeti. Prima
 * forma a probei facea exact asta si raporta ZERO pagini pentru un document bun, cu
 * doua pagini inauntru: pdf-lib nu scrie obiectele in forma pe care o cauta regexul.
 * Adica o proba care „cadea" pe cod corect — la fel de rea ca una care trece pe cod
 * stricat, si mai inselatoare, fiindca trimite la reparat ce n-are nimic.
 */
async function catePagini(pdf: Uint8Array): Promise<number> {
  const { PDFDocument } = await import("pdf-lib");
  return (await PDFDocument.load(pdf)).getPageCount();
}

test("⚠ documentele adevarate chiar se lipesc, si iese un PDF valid", async () => {
  const r = await lipesteCuNumar([unPdf("AWB 1"), unPdf("AWB 2"), unPdf("AWB 3")]);

  assert.equal(r.lipite, 3);
  assert.equal(r.refuzate, 0);
  assert.equal(Buffer.from(r.octeti.subarray(0, 4)).toString("latin1"), "%PDF");
  assert.equal(await catePagini(r.octeti), 3, "documentul lipit n-are cate o pagina de fiecare eticheta");
});

test("⚠⚠ o eticheta STRICATA nu rupe documentul, si se numara", async () => {
  /*
   * PDF-urile vin de la saisprezece furnizori si nu toate sunt curate. Fara prinderea
   * din bucla, una singura refuzata de biblioteca ar fi lasat lotul fara NICIUNA, iar
   * comerciantul ar fi trebuit sa ghiceasca de la care a pornit.
   */
  const stricat = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x00, 0x01]);
  const r = await lipesteCuNumar([unPdf("bun 1"), stricat, unPdf("bun 2")]);

  assert.equal(r.lipite, 2, "cele doua bune trebuiau sa intre");
  assert.equal(r.refuzate, 1);
  assert.equal(await catePagini(r.octeti), 2);
});

test("un singur document ramane un document cu o pagina", async () => {
  const r = await lipesteCuNumar([unPdf("singur")]);
  assert.equal(r.lipite, 1);
  assert.equal(await catePagini(r.octeti), 1);
});

test("⚠ zero documente dau un PDF gol, nu o aruncare", async () => {
  /* `adunaEtichete` nu cheama lipitorul pe gol, dar regula nu are voie sa atarne de asta. */
  const r = await lipesteCuNumar([]);
  assert.equal(r.lipite, 0);
  assert.equal(Buffer.from(r.octeti.subarray(0, 4)).toString("latin1"), "%PDF");
});

test("forma scurta da aceiasi octeti ca cea cu numar", async () => {
  const doc = [unPdf("a"), unPdf("b")];
  const scurt = await lipesteDocumente(doc);
  const lung = await lipesteCuNumar(doc);
  assert.equal(scurt.byteLength, lung.octeti.byteLength);
});

test("⚠ biblioteca se incarca LA CERERE, nu la pornirea modulului", async () => {
  /*
   * Cele cateva sute de kiloocteti n-au voie sa atarne de gatul fiecarei porniri reci
   * a altor rute. Obiectia sta scrisa in `emag/pdf-simplu.ts` si aici e respectata:
   * importul trebuie sa fie `await import`, nu unul de sus.
   */
  const { readFileSync } = await import("node:fs");
  const sursa = readFileSync("src/lib/orders/lipeste-pdf.ts", "utf8");
  assert.ok(/await import\("pdf-lib"\)/.test(sursa), "pdf-lib trebuie incarcat la cerere");
  assert.ok(
    !/^import .*from "pdf-lib"/m.test(sursa),
    "pdf-lib nu are voie sa fie importat de sus: ar intra in fiecare pornire rece",
  );
});
