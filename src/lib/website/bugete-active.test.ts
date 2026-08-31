import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CÂT CÂNTĂREȘTE CE DESCARCĂ UN VIZITATOR ANONIM (31.08.2026)
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ S-A PLĂTIT O DATĂ CA SĂ EXISTE PROBA ASTA. `public/logo.png` avea 96.469 de
  octeți — 284×289 px — și se afișa la 24–32 px, în bară ȘI în subsol, pe fiecare
  pagină publică. Adică 94 kB pentru un pătrat cât o unghie: 43% din tot
  JavaScriptul paginii de start, de 2,6 ori cât HTML-ul ei.

  ⚠ ȘI N-A PRINS-O NIMIC, fiindcă `<Image width={32}>` PARE că rezolvă problema.
  Nu o rezolvă: `supabase-image-loader` întoarce adresa neatinsă pentru orice nu
  e cheie R2, deci fișierul local pleacă întreg, oricât ai scrie în `width`.
  Atributul liniștește cititorul codului fără să facă nimic — cea mai rea formă
  de defect.

  Proba asta se uită la OCTEȚII DE PE DISC, singurul lucru care nu poate minți.
*/

const RADACINA = join(process.cwd(), "public");

/**
 * Bugetul fiecărei imagini pe care o cere o pagină publică.
 *
 * ⚠ NUMERELE SUNT MĂSURATE, NU ALESE. Fiecare e ce cântărește fișierul azi, plus
 * o margine de creștere. Când unul se depășește, întrebarea nu e „mărim
 * bugetul?", ci „de ce a crescut imaginea?".
 */
const BUGETE: Record<string, number> = {
  /* Bara și subsolul, pe fiecare pagină. Afișat la 24–32 px, 64 în autentificare. */
  "logo-128.png": 12_000,
  /* Sigla mare: date structurate (Google cere ≥112 px) și antetul e-mailurilor. */
  "logo.png": 30_000,
  /* Fundalul din ultima secțiune a paginii de start. Lazy, deci nu intră în
     prima afișare — dar tot ajunge la cine derulează până jos. */
  "ro.svg": 80_000,
};

for (const [fisier, buget] of Object.entries(BUGETE)) {
  test(`\`${fisier}\` stă în bugetul lui`, () => {
    const cale = join(RADACINA, fisier);
    assert.ok(existsSync(cale), `${fisier} nu mai există în public/ — s-a redenumit?`);

    const octeti = statSync(cale).size;
    assert.ok(
      octeti <= buget,
      `${fisier} are ${octeti} octeți, peste bugetul de ${buget}. ` +
        "Recodează-l sau fă o variantă mai mică pentru locul unde se afișează mic — " +
        "`width` pe `<Image>` NU micșorează fișierele locale, vezi nota de sus.",
    );
  });
}

/*
  ⚠ MARTORUL. Fără el, probele de mai sus ar fi verzi și dacă cineva ar șterge
  fișierele: `statSync` ar arunca, dar un buget scris greșit ca `Infinity` ar
  trece pe orice. Rândul ăsta cere ca măsurătoarea să respingă ceva.
*/
test("martor: bugetul chiar respinge un fișier prea mare", () => {
  const mare = statSync(join(RADACINA, "logo.png")).size;
  assert.ok(mare > 1_000, "logo.png pare gol — măsurătoarea nu citește fișierul adevărat");
  assert.ok(mare > BUGETE["logo-128.png"], "sigla mică ar trebui să fie mai mică decât cea mare");
});

/*
  ⚠ ȘI CINE FOLOSEȘTE CE. Bugetul de mai sus apără mărimea fișierului; rândul
  ăsta apără ALEGEREA lui. Fără el, cineva poate întoarce `Logo` la `/logo.png`
  — care e în buget, dar e de trei ori mai greu — și nimic n-ar cădea.
*/
test("bara și subsolul folosesc sigla mică, nu pe cea de e-mail", () => {
  const sursa = readFileSync(join(process.cwd(), "src/components/ui/Logo.tsx"), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  assert.match(sursa, /src="\/logo-128\.png"/, "componenta `Logo` nu mai cere sigla mică");
  assert.doesNotMatch(
    sursa,
    /src="\/logo\.png"/,
    "componenta `Logo` cere sigla mare (21 kB) pentru un pătrat de 32 px",
  );
});
