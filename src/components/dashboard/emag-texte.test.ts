import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";

/**
 * Textele pe care le citește comerciantul în ecranele eMAG.
 *
 * ═══ ⚠ DE CE E O PROBĂ, ȘI NU O ÎNȚELEGERE ═══
 *
 * Comerciantul a cerut-o direct, uitându-se la ecran: *„nu mai folosi EM DASH la
 * notițele alea sau la texte și formulează totul mai coerent și să înțeleagă omul"*.
 * Avea dreptate: linia de pauză lungă e semnul după care se recunoaște un text scris
 * de o mașină, iar într-un panou pe care omul îl citește în grabă ea rupe fraza în
 * loc să o lege.
 *
 * O curățenie făcută o dată se strică la a treia frază nouă scrisă de cineva grăbit.
 * Proba o ține.
 *
 * ⚠ SE UITĂ NUMAI LA CE VEDE OMUL. În comentarii, linia lungă e binevenită: acolo
 * scriem pentru cineva care citește cod, nu pentru cumpărător. De aceea proba sare
 * peste comentarii în loc să interzică semnul din fișier.
 */

const DOSAR = "src/components/dashboard";
const EM_DASH = String.fromCharCode(0x2014);

/** Liniile care ajung pe ecran: fără comentarii de linie și fără blocuri `/* … *\/`. */
function liniiVizibile(sursa: string): { n: number; text: string }[] {
  const iesire: { n: number; text: string }[] = [];
  let inBloc = false;

  sursa.split(String.fromCharCode(10)).forEach((linie, i) => {
    const t = linie.trim();
    if (inBloc) {
      if (t.includes("*/")) inBloc = false;
      return;
    }
    if (t.startsWith("/*") || t.startsWith("{/*")) {
      if (!t.includes("*/")) inBloc = true;
      return;
    }
    if (t.startsWith("*") || t.startsWith("//")) return;
    iesire.push({ n: i + 1, text: t });
  });

  return iesire;
}

test("eMAG texte: nicio linie de pauză lungă în ce vede comerciantul", () => {
  const fisiere = readdirSync(DOSAR).filter((f) => f.startsWith("Emag") && f.endsWith(".tsx"));
  assert.ok(fisiere.length > 5, "n-am găsit ecranele eMAG; s-a mutat dosarul?");

  const gasite: string[] = [];
  for (const f of fisiere) {
    for (const l of liniiVizibile(readFileSync(`${DOSAR}/${f}`, "utf8"))) {
      if (l.text.includes(EM_DASH)) gasite.push(`${f}:${l.n}  ${l.text.slice(0, 90)}`);
    }
  }

  assert.deepEqual(
    gasite, [],
    `Folosește punct, virgulă sau două puncte în loc de linia lungă:\n${gasite.join("\n")}`,
  );
});

test("eMAG texte: proba chiar se uită la ceva", () => {
  /*
   * ⚠ Cealaltă jumătate. O probă care filtrează prea mult trece mereu, și atunci nu
   * păzește nimic — exact felul de probă care dă liniște falsă.
   */
  const fisiere = readdirSync(DOSAR).filter((f) => f.startsWith("Emag") && f.endsWith(".tsx"));
  const total = fisiere.reduce(
    (s, f) => s + liniiVizibile(readFileSync(`${DOSAR}/${f}`, "utf8")).length, 0,
  );
  assert.ok(total > 500, `numai ${total} linii vizibile citite; filtrul taie prea mult`);
});
