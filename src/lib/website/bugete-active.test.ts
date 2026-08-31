import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PROVIDER_LOGOS } from "./logos";

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

  /*
    ⚠ CELE PATRU DE MAI JOS AU FOST ADĂUGATE PE 01.09.2026, după ce un inventar
    al lui `public/` a arătat că bugetele apărau trei fișiere și lăsau
    nesupravegheate tocmai cele mai grele de pe rute. Marja e măsurat × 1,06 —
    o recodare a aceleiași imagini trece, un export proaspăt nesocotit cade.
  */
  /* /mentenanta-gratuita. Cea mai grea imagine de pe tot site-ul. Sub fold, cu
     `<Image>` fără `priority`, deci nu intră în prima afișare. */
  "mentenanta/securitate.webp": 149_500,
  /* /mentenanta-gratuita, fundalul conversației. ⚠ E fundal CSS, nu `<Image>`,
     deci se cere de îndată ce elementul intră în arborele de randare — nu când
     ajunge pe ecran. Sursa are 760×1396 și se desenează cu `cover` într-o casetă
     mult mai joasă, deci aici mai e loc de tăiat. */
  "mentenanta/fundal_whatsapp.webp": 82_000,
  /* /optimizare, captura de produs din panoul de rezultate. */
  "optimizare/produs.webp": 100_600,
  /* Pagina de start, cea mai mare treaptă din `srcset`-ul primului card. */
  "features/magazin-1440.webp": 67_700,
};

/*
  ⚠ PLAFONUL PENTRU SIGLE — o regulă, nu o listă.

  Pe 01.09.2026, douăsprezece sigle raster cântăreau 460.659 de octeți; cea mai
  grasă, `ing.webp`, avea 3840×955 px pentru o casetă de cel mult 120. Recodate
  la 400 px pe latura lungă: 107.974 octeți, minus 77%.

  ⚠ DE CE O REGULĂ ȘI NU ÎNCĂ 64 DE RÂNDURI ÎN TABELUL DE SUS: siglele se adaugă
  des, iar un tabel scris de mână ar rămâne mereu în urmă cu ultima. Regula
  prinde și siglele care nu existau când s-a scris proba — exact cazul care a dus
  la `ing.webp`.

  ⚠ SVG-urile nu intră: ele se comprimă pe fir (mailchimp.svg are 28.513 pe disc
  și 8.262 pe fir), deci mărimea de pe disc ar minți despre ce plătește omul.
*/
const PLAFON_SIGLA = 20_000;

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

test("nicio siglă raster din catalog nu trece de plafon", () => {
  /*
    Se citește chiar `PROVIDER_LOGOS`, nu un dosar: contează ce CERE site-ul, nu
    ce zace în `public/`. Fișierele pe care le folosește doar panoul (originalele
    de la care s-au tăiat variantele `-mic`) rămân, pe bună dreptate, în afara
    socotelii.
  */
  const grele: string[] = [];
  let raster = 0;

  for (const logo of Object.values(PROVIDER_LOGOS) as Array<{ src: string }>) {
    if (/\.svg$/i.test(logo.src)) continue; // vezi nota despre SVG-uri
    raster++;
    const cale = join(RADACINA, logo.src.replace(/^\//, ""));
    if (!existsSync(cale)) {
      grele.push(`${logo.src} — nu există pe disc`);
      continue;
    }
    const octeti = statSync(cale).size;
    if (octeti > PLAFON_SIGLA) grele.push(`${logo.src} — ${octeti} octeți`);
  }

  assert.ok(raster >= 20, `doar ${raster} sigle raster verificate — s-a rupt citirea catalogului?`);
  assert.deepEqual(
    grele,
    [],
    `Sigle peste plafonul de ${PLAFON_SIGLA} octeți. Se desenează în cel mult 120 px ` +
      "lățime (`BibliotecaIntegrari.tsx`), iar loaderul NU micșorează fișiere locale. " +
      "Fă o variantă `-mic.webp` la 400 px pe latura lungă și schimbă `src` în " +
      "`logos.ts` — NU rescrie fișierul pe loc, cache-ul e imutabil un an:\n  " +
      grele.join("\n  "),
  );
});

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
