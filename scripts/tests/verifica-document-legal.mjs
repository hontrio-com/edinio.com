/**
 * Compara un document juridic de pe site cu textul primit de la client.
 *
 * ═══ DE CE EXISTA ═══
 *
 * Termenii au 50 de articole, Confidentialitatea 63, Cookies 42. Transcrise de
 * mana, ele NU se verifica recitindu-le: ochiul trece peste un rand lipsa la fel
 * de usor cum trece peste unul in plus, iar intr-un document juridic ambele
 * conteaza.
 *
 * La prima rulare, pe Termeni, scriptul a prins ceva ce n-as fi vazut citind:
 * pusesem „Denumire:" in fata numelui firmei, adica un cuvant care nu e al
 * clientului, intr-un document juridic.
 *
 * ═══ CUM SE RULEAZA ═══
 *
 *   node --import ./scripts/tests/register.mjs \
 *        scripts/tests/verifica-document-legal.mjs <modul> <export> <original.txt>
 *
 * de exemplu:
 *
 *   node --import ./scripts/tests/register.mjs \
 *        scripts/tests/verifica-document-legal.mjs \
 *        src/lib/website/termeni.ts TERMENI /tmp/termeni-original.txt
 *
 * Iese cu 0 daca nu e nicio diferenta si cu 1 daca e macar una.
 *
 * ⚠ Fisierul cu originalul NU se tine in depozit: ar fi o a doua copie a
 * aceluiasi text, care se demodeaza exact cand conteaza mai mult. Se ia de la
 * client la fiecare modificare.
 *
 * ═══ CE SE NORMALIZEAZA, SI CE NU ═══
 *
 * Doar spatiile (mai multe la rand devin unul) si, optional, majusculele. Restul
 * — fiecare cuvant, fiecare punct si virgula, fiecare diacritica, cratima lunga
 * din „Client–Edinio" — trebuie sa se potriveasca exact. Daca as normaliza mai
 * mult, o transcriere care pierde diacriticele ar trece proba.
 *
 * Rularea implicita IGNORA majusculele, fiindca titlurile din documentele
 * primite sunt scrise cu MAJUSCULE iar pe site sunt scrise normal (alegere de
 * tipografie, notata in fisierele de continut). Cu `--majuscule` se compara si
 * ele: acolo trebuie sa iasa exact titlurile, si nimic altceva.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { liniiDocument } from "../../src/lib/website/legal.ts";

const [caleModul, numeExport, caleOriginal, ...steaguri] = process.argv.slice(2);
if (!caleModul || !numeExport || !caleOriginal) {
  console.error(
    "Utilizare: verifica-document-legal.mjs <modul.ts> <EXPORT> <original.txt> [--majuscule]",
  );
  process.exit(2);
}
const tineContDeMajuscule = steaguri.includes("--majuscule");

const modul = await import(pathToFileURL(caleModul).href);
const doc = modul[numeExport];
if (!doc) {
  console.error(`Modulul ${caleModul} nu exporta ${numeExport}`);
  process.exit(2);
}

function normalizeaza(s) {
  const curat = s.replace(/\s+/g, " ").trim();
  return tineContDeMajuscule ? curat : curat.toLowerCase();
}

/** Fara numerotarea de la inceput de rand („10.4. ", „7.1. "). */
function faraNumar(s) {
  return normalizeaza(s.replace(/^\d+(\.\d+)*\.\s*/, ""));
}

const transcriere = liniiDocument(doc);
const original = readFileSync(caleOriginal, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);

/* Doua multimi pentru fiecare parte: cu numar si fara. In original numarul sta
   pe acelasi rand cu textul, in transcriere sta separat, iar comparatia trebuie
   sa le potriveasca fara sa piarda randurile care CHIAR difera. */
function multimi(linii) {
  return { cuNr: new Set(linii.map(normalizeaza)), faraNr: new Set(linii.map(faraNumar)) };
}
const mT = multimi(transcriere);
const mO = multimi(original);

const seGaseste = (linie, m) =>
  m.cuNr.has(normalizeaza(linie)) || m.cuNr.has(faraNumar(linie)) || m.faraNr.has(faraNumar(linie));

const lipsa = original.filter((l) => !seGaseste(l, mT));
const inPlus = transcriere.filter((l) => !seGaseste(l, mO));

console.log(`document:  ${numeExport} (${caleModul})`);
console.log(`majuscule: ${tineContDeMajuscule ? "se compara" : "ignorate"}`);
console.log(`randuri:   original ${original.length} · transcriere ${transcriere.length}`);
console.log("");
console.log(`=== LIPSA din transcriere (${lipsa.length}) ===`);
for (const l of lipsa) console.log("  - " + l);
console.log("");
console.log(`=== IN PLUS fata de original (${inPlus.length}) ===`);
for (const l of inPlus) console.log("  + " + l);

process.exit(lipsa.length || inPlus.length ? 1 : 0);
