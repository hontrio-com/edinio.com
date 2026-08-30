import test from "node:test";
import assert from "node:assert/strict";
import { pdfDintrunSingurFolio, faraDiacritice } from "./pdf-simplu";

/* ══════════════════════════════════════════════════════════════════════════
   PDF-UL SCRIS DE MANA CHIAR E UN PDF (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   eMAG cere ca atasamentul sa fie un `.pdf` la o adresa. Un fisier stricat n-ar da o
   eroare limpede: ei ar refuza atasamentul cu un mesaj despre document, iar comerciantul
   ar cauta greseala in numarul de AWB.

   ⚠ Probele de aici NU se uita la cum ARATA pagina — se uita la STRUCTURA, fiindca aia e
   ce citeste cititorul lor. Mai ales tabelul `xref`: pozitiile scrise acolo trebuie sa
   arate CHIAR catre inceputul fiecarui obiect. Gresite, unele cititoare repara singure si
   altele refuza — adica exact defectul care merge la tine si nu merge la ei.
*/

const octeti = (b: Buffer) => b.toString("latin1");

test("are antet si coada", () => {
  const p = octeti(pdfDintrunSingurFolio([{ text: "AWB 12345" }]));
  assert.ok(p.startsWith("%PDF-1.4\n"), "antetul lipseste");
  assert.ok(p.trimEnd().endsWith("%%EOF"), "coada lipseste");
});

test("⚠ fiecare pozitie din `xref` arata chiar catre obiectul ei", () => {
  /*
   * Proba cea mai importanta din fisier. Pozitiile se socotesc din octetii CHIAR SCRISI,
   * nu dintr-o numaratoare paralela — iar asta se verifica citindu-le inapoi.
   */
  const buf = pdfDintrunSingurFolio([
    { text: "Curier: FanCourier" },
    { text: "AWB: 2100000123456" },
    { text: "Comanda: EMAG-407112233" },
  ]);
  const p = octeti(buf);

  /*
   * ⚠ SE CAUTA `\nxref\n`, NU `xref\n`. Prima formă a probei folosea
   * `lastIndexOf("xref\n")`, care se potrivește ÎNĂUNTRUL lui `startxref\n` — deci proba
   * cădea pe un fișier bun. O probă care se înșală singură e mai rea decât una care
   * lipsește: te pune să repari ce nu e stricat.
   */
  const iXref = p.indexOf("\nxref\n") + 1;
  assert.ok(iXref > 0, "tabelul xref lipseste");

  /* `startxref` trebuie sa arate catre tabel. */
  const startxref = Number(/startxref\n(\d+)/.exec(p)?.[1]);
  assert.equal(startxref, iXref, "startxref nu arata catre xref");

  /* Fiecare rand de zece cifre e o pozitie; prima e cea libera si se sare. */
  const randuri = [...p.slice(iXref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.equal(randuri.length, 5, "asteptam cinci obiecte");
  randuri.forEach((poz, i) => {
    const acolo = p.slice(poz, poz + 12);
    assert.ok(acolo.startsWith(`${i + 1} 0 obj`), `obiectul ${i + 1} nu e la ${poz}, ci: ${acolo}`);
  });
});

test("⚠ `/Length` chiar e lungimea fluxului", () => {
  /* Un `/Length` gresit face cititorul sa taie continutul sau sa citeasca peste el. */
  const p = octeti(pdfDintrunSingurFolio([{ text: "ceva" }]));
  const lung = Number(/<< \/Length (\d+) >>/.exec(p)?.[1]);
  const flux = /stream\n([\s\S]*?)\nendstream/.exec(p)?.[1] ?? "";
  assert.equal(Buffer.byteLength(flux, "latin1"), lung);
});

test("⚠ parantezele dintr-un nume de curier nu rup fisierul", () => {
  /*
   * In sirurile PDF, `(`, `)` si `\` sunt semne de structura. Nescapate, un nume ca
   * „Sameday (locker)" ar fi inchis sirul mai devreme si restul paginii ar fi ajuns cod.
   */
  const p = octeti(pdfDintrunSingurFolio([{ text: "Curier: Sameday (locker) \\ test" }]));
  assert.match(p, /\(Curier: Sameday \\\(locker\\\) \\\\ test\) Tj/);
});

test("⚠ diacriticele se aduc la forma fara semne, nu se pierd randuri", () => {
  /*
   * Fontul de baza e in WinAnsi, unde „ș" si „ț" n-au loc. Lasate asa, ar fi iesit semne
   * straine. Aduse la „s" si „t", textul se citeste — o pierdere pe care n-o vede nimeni.
   */
  assert.equal(faraDiacritice("Curierul tău: Poșta Română"), "Curierul tau: Posta Romana");
  const p = octeti(pdfDintrunSingurFolio([{ text: "Expediat cu Poșta Română" }]));
  assert.match(p, /\(Expediat cu Posta Romana\) Tj/);
});

test("randurile de dupa primul coboara, nu se suprapun", () => {
  const p = octeti(pdfDintrunSingurFolio([{ text: "unu" }, { text: "doi" }, { text: "trei" }]));
  assert.match(p, /1 0 0 1 56 780 Tm/, "primul rand se aseaza absolut");
  assert.equal((p.match(/0 -18 Td/g) ?? []).length, 2, "celelalte doua coboara");
});

test("un text gol nu strica fisierul", () => {
  /* ⚠ Se poate intampla: un curier fara nume in baza. Mai bine o pagina saraca decat un
     atasament refuzat. */
  const p = octeti(pdfDintrunSingurFolio([{ text: "" }]));
  assert.ok(p.startsWith("%PDF-1.4"));
  assert.match(p, /\(\) Tj/);
});
