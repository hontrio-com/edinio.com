import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { MAX_ETICHETA_OCTETI, raspunsEticheta } from "@/lib/orders/raspuns-eticheta";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * ETICHETA PLEACA CU OCTETII EI, SI NUMAI CU AI EI          (13.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ MUTANTUL SE PUNE PE APELANT: vederea peste un bloc mai mare, corpul care nu e PDF,
 * documentul gol, cel supradimensionat si numele cu ghilimele. Toate cinci treceau inainte.
 *
 * ⚠ CE NU PROBEAZA. Ca fiecare dintre cele unsprezece rute chiar cheama functia asta.
 * Aia se vede in `etichetele-pleaca-prin-aceeasi-poarta.test.ts`, care numara apelantii:
 * o regula scrisa intr-un singur loc si chemata din zece din unsprezece ar fi exact
 * dezbinarea pe care functia o repara.
 */

/** Un PDF minim: semnatura plus ceva continut. */
const PDF = Buffer.from("%PDF-1.4\nceva\n", "latin1");

test("⚠⚠ octetii sunt EXACT ai documentului, nu blocul din spate", async () => {
  /*
   * ⚠ AFIRMATIA CENTRALA, si singura care reproduce chiar defectul masurat de audit.
   *
   * Se face un bloc mare si o VEDERE mica peste el, exact cum arata un `Buffer` intors de
   * `Buffer.from(..., "base64")` cand Node il taie dintr-un bloc comun. Varianta veche
   * trimitea `vedere.buffer`, adica tot blocul: documentul de cativa octeti pleca insotit
   * de mii de octeti straini, veniti din ce mai folosise procesul.
   */
  const bloc = Buffer.alloc(8192, 0x41); // 'A' peste tot: santinela vizibila
  PDF.copy(bloc, 100);
  const vedere = bloc.subarray(100, 100 + PDF.length);

  assert.equal(vedere.byteLength, PDF.length, "vederea de proba nu e mai mica decat blocul: proba n-ar dovedi nimic");
  assert.equal(vedere.buffer.byteLength, 8192, "blocul din spate nu mai e mai mare: mutantul n-ar mai avea ce scurge");

  const r = raspunsEticheta(vedere, "awb.pdf");
  const primit = Buffer.from(await r.arrayBuffer());

  assert.equal(primit.byteLength, PDF.length,
    `au plecat ${primit.byteLength} octeti in loc de ${PDF.length}: raspunsul poarta blocul din spate`);
  assert.ok(primit.equals(PDF), "octetii trimisi nu sunt cei ai documentului");
  assert.equal(r.headers.get("Content-Length"), String(PDF.length));
});

test("⚠⚠ eticheta nu poate fi tinuta in cache: poarta datele cumparatorului", () => {
  const r = raspunsEticheta(PDF, "awb.pdf");
  assert.equal(r.headers.get("Cache-Control"), "private, no-store",
    "eticheta poate fi pastrata de un CDN sau de un intermediar, cu nume, adresa si telefon");
  assert.equal(r.headers.get("Content-Type"), "application/pdf");
});

test("⚠ un corp care nu e PDF nu se serveste ca PDF", () => {
  /*
   * Cazul real: curierul raspunde cu o pagina HTML de eroare pe un HTTP 200. Servita cu
   * `Content-Type: application/pdf`, se deschide ca document stricat, fara niciun mesaj,
   * si omul crede ca eticheta e de vina.
   */
  const html = Buffer.from("<!DOCTYPE html><h1>Session expired</h1>", "latin1");
  assert.throws(() => raspunsEticheta(html, "awb.pdf"), /nu este un PDF/);
});

test("⚠ dar ZPL trece: e text pentru imprimanta, fara nicio semnatura", () => {
  /*
   * ⚠ FARA RANDURILE ASTEA, verificarea de semnatura ar fi refuzat chiar etichetele bune
   * ale GLS si eColet, care pot fi ZPL. O plasa care prinde si pestele bun nu e o plasa.
   */
  const zpl = Buffer.from("^XA^FO50,50^ADN,36,20^FDTest^FS^XZ", "latin1");
  const r = raspunsEticheta(zpl, "eticheta.zpl", "x-application/zpl");
  assert.equal(r.headers.get("Content-Type"), "x-application/zpl");
  assert.equal(r.headers.get("Cache-Control"), "private, no-store");
});

test("⚠ documentul gol si cel supradimensionat sunt erori, nu raspunsuri", () => {
  assert.throws(() => raspunsEticheta(Buffer.alloc(0), "awb.pdf"), /goala/);

  /* ⚠ Se probeaza PRAGUL, nu o cifra scrisa de mana: legata de constanta, proba ramane
     adevarata si daca plafonul se schimba. */
  const prea = Buffer.alloc(MAX_ETICHETA_OCTETI + 1);
  PDF.copy(prea, 0);
  assert.throws(() => raspunsEticheta(prea, "awb.pdf"), /plafonul/);
});

test("⚠ numele de fisier nu poate rupe antetul in doua", () => {
  /*
   * Numarul AWB vine de la curier, deci nu e sub controlul nostru. O ghilimea sau un rand
   * nou in `Content-Disposition` sparge antetul; un `/` schimba calea sugerata browserului.
   */
  const r = raspunsEticheta(PDF, 'awb"\r\nX-Injectat: 1/../etc.pdf');
  const cd = r.headers.get("Content-Disposition") ?? "";

  /*
   * ⚠ SE VERIFICA NUMELE, NU ANTETUL INTREG.
   *
   * Prima forma a randului asta cerea ca tot antetul sa n-aiba nicio ghilimea, si a cazut
   * pe ghilimelele care INCADREAZA numele, adica pe forma corecta. Proba cadea cu mesajul
   * gresit: parea ca reparatia nu curata nimic, cand de fapt curatase tot.
   */
  const nume = /filename="([^"]*)"/.exec(cd)?.[1];
  assert.ok(nume, `antetul nu mai are un nume incadrat corect: ${cd}`);
  assert.doesNotMatch(nume, /[\r\n"]/, `numele a ramas cu caractere care rup antetul: ${nume}`);
  assert.equal(r.headers.get("X-Injectat"), null, "s-a putut adauga un antet nou prin numele fisierului");
});

/* ═══════════════════════════════════════════════════════════════════════════
   SI TOATE RUTELE TREC PRIN EA
   ═══════════════════════════════════════════════════════════════════════════

   ⚠ O regula scrisa intr-un loc si chemata din sase din sapte rute e chiar dezbinarea pe
   care functia o repara. Forma corecta exista deja de o tura la GLS si Pall-Ex, si tocmai
   de aceea nimeni n-a observat ca celelalte patru scurg blocul din spate.
*/

const DIR_API = "src/app/api";

/** Rutele care servesc o eticheta de curier, gasite pe disc, nu dintr-o lista scrisa. */
function ruteDeEticheta(): string[] {
  const gasite: string[] = [];
  for (const curier of readdirSync(DIR_API, { withFileTypes: true })) {
    if (!curier.isDirectory()) continue;
    for (const sub of ["awb", "document"]) {
      const cale = `${DIR_API}/${curier.name}/${sub}/route.ts`;
      try {
        readFileSync(cale);
        gasite.push(cale);
      } catch { /* nu exista, e in regula */ }
    }
  }
  return gasite;
}

test("⚠⚠ nicio ruta nu mai poate servi BLOCUL din spate al documentului", () => {
  /*
   * ⚠ AFIRMATIA CARE APARA CEL MAI MULT, fiindca defectul e invizibil: raspunsul se deschide
   * ca PDF valid, doar ca poarta in coada octeti din ce a mai folosit procesul.
   */
  const vinovate = ruteDeEticheta().filter((f) => /\.buffer as ArrayBuffer/.test(readFileSync(f, "utf8")));
  assert.deepEqual(vinovate, [],
    `rutele astea trimit blocul din spate, nu documentul:\n${vinovate.join("\n")}`);
});

test("⚠ si fiecare ruta de eticheta spune ca documentul NU se tine in cache", () => {
  const rute = ruteDeEticheta();

  /*
   * ⚠ SE NUMARA. Fara pragul asta, o redenumire a folderelor ar face proba sa treaca peste
   * ZERO rute si sa iasa verde. Masurat pe 13.09.2026: sapte.
   */
  assert.ok(rute.length >= 7, `gasite doar ${rute.length} rute de eticheta: plasa n-are pe cine cadea`);

  const fara: string[] = [];
  for (const f of rute) {
    const s = readFileSync(f, "utf8");
    /* Ori trece prin poarta comuna, ori isi pune singura antetul (GLS si Pall-Ex, care
       aveau forma corecta dinainte si au si cache in R2). */
    if (!s.includes("raspunsEticheta(") && !s.includes('"Cache-Control"')) fara.push(f);
  }
  assert.deepEqual(fara, [],
    "rutele astea servesc eticheta fara `Cache-Control`, desi ea poarta numele, adresa si "
    + `telefonul cumparatorului:\n${fara.join("\n")}`);
});
