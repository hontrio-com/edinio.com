import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CULORILE DE TEXT ALE SITE-ULUI TREBUIE SĂ SE CITEASCĂ PE FUNDALURILE LOR
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ EXISTA DEJA O PROBĂ DE CONTRAST, ȘI TRECEA. `comparison-culori.test.ts` are
  chiar un test numit „nicio culoare nu coboară sub pragul de citire pe alb" —
  dar el verifică `CULORI_MARCA`, adică cele ȘASE culori ale concurenților din
  cardurile de comparație. Tokenii proprii ai site-ului nu erau acoperiți de
  nimic.

  Rezultatul, măsurat cu Lighthouse pe 01.09.2026: `--color-ink-3` era `#8A8A94`,
  adică **3,42:1 pe alb**, sub pragul WCAG AA de 4,5:1 pentru text normal. Folosit
  de 117 ori pe site — etichetele cu majuscule, rândurile de sub butoane, textele
  de 8 px din machete. Accesibilitatea ieșea 96, cu `color-contrast` picat.

  După `#72727C` (4,76:1): accesibilitate **100**, zero auditări picate.

  ⚠ CE ÎNVĂȚĂM: o probă verde care măsoară ALTCEVA e mai rea decât nicio probă,
  fiindcă răspunde „da" la o întrebare pe care n-a pus-o nimeni. Aici se
  verifică tokenii CU CARE E SCRIS SITE-UL, nu culorile pe care le împrumutăm.
*/

const CSS = readFileSync(join(process.cwd(), "src/app/stil-comun.css"), "utf8").replace(/\r\n/g, "\n");

/** Luminanța relativă, WCAG 2.1. */
function luminanta(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminanta(a), luminanta(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Citește un token din `stil-comun.css`. Aruncă dacă lipsește — vezi martorul. */
function token(nume: string): string {
  const m = CSS.match(new RegExp(`--color-${nume}:\\s*(#[0-9A-Fa-f]{6})`));
  assert.ok(m, `tokenul \`--color-${nume}\` nu mai există în \`stil-comun.css\` — s-a redenumit?`);
  return m![1];
}

/*
  ⚠ PRAGUL E 4,5:1, NU 3:1. WCAG dă voie la 3:1 doar pentru „text mare" — cel
  puțin 24 px, sau 18,66 px îngroșat. Tokenii ăștia sunt folosiți TOCMAI pe textul
  mic: Lighthouse a numit elemente de 7,5 px, 8 px, 12 px și 13 px. Deci pragul
  care contează e cel strict.
*/
const PRAG = 4.5;

/* Cele două fundaluri pe care stă text pe tot site-ul. */
const ALB = "#FFFFFF";
const TINTA = () => token("tint");

const CULORI_DE_TEXT = ["ink", "ink-2", "ink-3"];

for (const nume of CULORI_DE_TEXT) {
  test(`\`--color-${nume}\` se citește pe alb`, () => {
    const hex = token(nume);
    const raport = contrast(hex, ALB);
    assert.ok(
      raport >= PRAG,
      `\`--color-${nume}\` (${hex}) are ${raport.toFixed(2)}:1 pe alb, sub ${PRAG}. ` +
        "E folosit pe text mic (Lighthouse a numit elemente de 7,5–13 px), deci " +
        "pragul pentru text mare (3:1) NU se aplică. Închide culoarea până trece.",
    );
  });

  test(`\`--color-${nume}\` se citește și pe \`--color-tint\``, () => {
    /*
      Fundalul stins e folosit pe secțiuni întregi (`bg-tint`). O culoare care
      trece pe alb dar cade pe el ar fi o problemă care apare doar pe jumătate
      din pagină — exact felul de defect care scapă la o verificare din ochi.
    */
    const hex = token(nume);
    const raport = contrast(hex, TINTA());
    assert.ok(
      raport >= PRAG,
      `\`--color-${nume}\` (${hex}) are ${raport.toFixed(2)}:1 pe \`--color-tint\` ` +
        `(${TINTA()}), sub ${PRAG}.`,
    );
  });
}

test("martor: socoteala chiar respinge o culoare prea deschisă", () => {
  /*
    ⚠ Fără rândul ăsta, probele de sus ar fi verzi și dacă `luminanta()` ar
    întoarce mereu aceeași valoare, sau dacă `token()` ar citi altceva. Se cere
    ca funcția să dea un NU pe o valoare despre care știm sigur că e prea
    deschisă — chiar cea de dinainte, `#8A8A94`, măsurată de Lighthouse la 3,42.
  */
  const vechi = contrast("#8A8A94", ALB);
  assert.ok(vechi < PRAG, `#8A8A94 ar trebui să pice; socoteala dă ${vechi.toFixed(2)}:1`);
  assert.ok(
    Math.abs(vechi - 3.42) < 0.05,
    `socoteala dă ${vechi.toFixed(2)}:1 pentru #8A8A94, iar Lighthouse a măsurat 3,41. ` +
      "Dacă cele două nu se potrivesc, formula de aici e greșită.",
  );

  /* Și un DA pe una despre care știm că trece. */
  assert.ok(contrast("#0A0A0A", ALB) > 15, "negrul ar trebui să aibă contrast foarte mare");
});
