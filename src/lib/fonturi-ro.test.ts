import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { FETE_ROMANESTI } from "./fonturi-ro";
import { CALE_FONTURI_RO, cssFeteRomanesti } from "./fonturi-ro-css";

/*
  Literele romanesti dintr-un fisier mic (19.11.2026, auditul temelor). De ce exista: `lib/fonturi-ro-css.ts`.

  Ce poate strica asta in tacere, si ce apara probele de aici:
   - un font nou adaugat in `next/font` fara fisierul lui: literele lui romanesti vin iar din latin-ext (15-117 KB);
   - un fisier schimbat sub acelasi nume: `next.config` pune `immutable` pe un an pe `.woff2`, deci browserele l-ar
     tine pe cel vechi;
   - fetele declarate INAINTEA celor `next/font`: la intervale suprapuse castiga ultima fata declarata.
*/

const DOSAR = join("public", "fonturi-ro");
const cod = (cale: string) => readFileSync(cale, "utf8").replace(/\r\n/g, "\n");

/** Familiile incarcate prin `next/font/google` intr-un fisier: `Plus_Jakarta_Sans` -> „Plus Jakarta Sans”. */
function familiiDeclarate(fisier: string): string[] {
  const text = cod(fisier);
  const importuri = [...text.matchAll(/import\s*\{([^}]+)\}\s*from\s*"next\/font\/google"/g)].flatMap((m) => m[1].split(","));
  return importuri.map((n) => n.trim()).filter(Boolean).map((n) => n.replace(/_/g, " "));
}

const SURSE = ["src/app/layout.tsx", "src/lib/storefront/design/fonts.ts", "src/components/pages/fonturi-incarcate.ts"];

test("⚠⚠ fiecare font incarcat prin `next/font` are fisierul lui cu literele romanesti", () => {
  const declarate = [...new Set(SURSE.flatMap(familiiDeclarate))];
  assert.ok(declarate.length >= 35, `doar ${declarate.length} fonturi gasite in surse: unealta probei nu mai citeste importurile`);
  const cuFisier = new Set(FETE_ROMANESTI.map((f) => f.familie));
  const fara = declarate.filter((f) => !cuFisier.has(f));
  assert.deepEqual(
    fara,
    [],
    "Fonturi fara fisier romanesc: literele ă, ș, ț ale lor se descarca din tot subsetul latin-ext.\n" +
      "Dupa `next build`, ruleaza: python scripts/fonturi-ro.py\n  " + fara.join("\n  "),
  );
});

test("fiecare fata are fisierul ei pe disc, mic, cu amprenta continutului in nume", () => {
  assert.ok(FETE_ROMANESTI.length >= 35);
  for (const f of FETE_ROMANESTI) {
    const cale = join(DOSAR, f.fisier);
    assert.ok(existsSync(cale), `${f.fisier} lipseste din public/fonturi-ro`);
    const octeti = readFileSync(cale);
    assert.ok(octeti.length > 600 && octeti.length < 8000, `${f.fisier}: ${octeti.length} octeti (un subset romanesc are 1-6 KB)`);
    assert.equal(octeti.subarray(0, 4).toString("latin1"), "wOF2", `${f.fisier} nu e un fisier woff2`);
    // ⚠ `immutable` pe un an (`next.config`): un fisier schimbat trebuie sa aiba alt nume.
    const amprenta = createHash("sha1").update(octeti).digest("hex").slice(0, 8);
    assert.ok(f.fisier.endsWith(`.${amprenta}.woff2`), `${f.fisier}: numele nu poarta amprenta continutului (${amprenta})`);
  }
  // Si invers: niciun fisier ramas pe disc de la o generare mai veche.
  const peDisc = readdirSync(DOSAR).filter((n) => n.endsWith(".woff2")).sort();
  assert.deepEqual(peDisc, FETE_ROMANESTI.map((f) => f.fisier).sort(), "fisiere orfane (sau lipsa) in public/fonturi-ro");
  const total = peDisc.reduce((s, n) => s + statSync(join(DOSAR, n)).size, 0);
  assert.ok(total < 250_000, `dosarul are ${total} octeti`);
});

test("CSS-ul: aceeasi familie, doar literele romanesti, `swap`, un fisier de la noi", () => {
  const css = cssFeteRomanesti();
  const fete = [...css.matchAll(/@font-face\{([^}]*)\}/g)].map((m) => m[1]);
  assert.equal(fete.length, FETE_ROMANESTI.length);
  // Literele permise: Ă ă, Ș ș Ț ț, Ş ş Ţ ţ, Ő ő Ű ű. Nimic din latinul de baza: acela vine din fisierul `latin`.
  const PERMISE = new Set(["U+102-103", "U+150-151", "U+15E-15F", "U+162-163", "U+170-171", "U+218-21B"]);
  for (const [i, corp] of fete.entries()) {
    const f = FETE_ROMANESTI[i];
    assert.ok(corp.includes(`font-family:"${f.familie}"`), `${f.familie}: alt nume de familie decat cel din next/font`);
    assert.ok(corp.includes("font-display:swap"));
    assert.ok(corp.includes(`src:url(${CALE_FONTURI_RO}${f.fisier})format("woff2")`));
    assert.ok(corp.includes(`font-weight:${f.greutate}`));
    const interval = /unicode-range:([^;}]+)/.exec(corp)?.[1] ?? "";
    for (const bucata of interval.split(",")) assert.ok(PERMISE.has(bucata), `${f.familie}: ${bucata} in afara literelor romanesti`);
    // ă si ș/ț cu virgula sunt chiar rostul fisierului.
    assert.ok(interval.includes("U+102-103") && interval.includes("U+218-21B"), `${f.familie}: fara ă sau fara ș/ț`);
  }
  // Doar familiile cerute, cand se cer.
  const doarInter = cssFeteRomanesti(["Inter"]);
  assert.equal([...doarInter.matchAll(/@font-face/g)].length, FETE_ROMANESTI.filter((f) => f.familie === "Inter").length);
  assert.equal(cssFeteRomanesti([]), "");
});

test("⚠ vitrina le declara in corpul paginii, inaintea continutului (dupa foile din <head>)", () => {
  const layout = cod("src/app/(public)/[slug]/layout.tsx");
  const iFete = layout.indexOf("<FeteRomanesti />");
  const iCopii = layout.indexOf("{children}");
  assert.ok(iFete > 0, "layoutul magazinului nu mai pune `<FeteRomanesti />`");
  assert.ok(iFete < iCopii, "fetele romanesti vin dupa continut: primul text le-ar cere inainte sa existe");
  const componenta = cod("src/components/pages/FeteRomanesti.tsx");
  // Fara `href` / `precedence`: cu ele React ar muta `<style>` in <head>, unde ordinea fata de foile `next/font` nu e a noastra.
  assert.doesNotMatch(componenta, /precedence=|href=/);
  assert.match(componenta, /<style data-fete-ro="" dangerouslySetInnerHTML=\{\{ __html: CSS_TOATE \}\} \/>/);
});
