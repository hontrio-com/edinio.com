import { strict as assert } from "node:assert";
import { test } from "node:test";

import { COMPARISON_RIVALS, COMPARISON_US, CULORI_MARCA } from "./comparison";
import { VERDE_CITIBIL } from "./linii";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CULORILE PLATFORMELOR DIN CARDURILE DE PE TELEFON (31.08.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Cerute de client: pe telefon, unde siglele nu apar, numele fiecărei platforme
  se scrie în culoarea ei. Pe desktop nu — acolo antetul coloanei are sigla.

  ⚠ PROBA ASTA EXISTĂ PENTRU CONTRAST, nu ca să numere culori. Hexul de marcă e
  ales pentru un logo, nu pentru text de 13px pe alb: Shopify are 2,14:1 și
  OpenCart 2,96:1, amândouă sub pragul de 4,5:1. Sunt în catalog întunecate,
  cu nuanța păstrată.

  Fără rândurile de aici, primul om care „repară culoarea ca la brand" pune
  hexul brut, pagina arată bine pe ecranul lui, și numele devin ilizibile pentru
  cine nu vede perfect. E aceeași grijă pentru care verdele site-ului nu e
  `#1AB554` — vezi nota din capul lui `globals.css`.
*/

/** Luminanța relativă, după formula WCAG. */
function luminanta(hex: string): number {
  const c = hex.replace("#", "");
  const canale = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
  return 0.2126 * canale[0] + 0.7152 * canale[1] + 0.0722 * canale[2];
}

/** Contrastul față de alb, fundalul pe care stau cardurile. */
function contrastPeAlb(hex: string): number {
  return 1.05 / (luminanta(hex) + 0.05);
}

const PLATFORME = [COMPARISON_US, ...COMPARISON_RIVALS];

test("fiecare platformă comparată are o culoare", () => {
  /*
    ⚠ Se pornește de la LISTA de platforme, nu de la catalogul de culori. Invers,
    un rival adăugat fără culoare ar fi trecut neobservat, iar pe telefon numele
    lui ar fi ieșit negru printre celelalte colorate — greșeala arată ca o alegere.
  */
  const fara = PLATFORME.filter((p) => !CULORI_MARCA[p]);
  assert.deepEqual(fara, [], `platforme fără culoare: ${fara.join(", ")}`);
});

test("nicio culoare nu coboară sub pragul de citire pe alb", () => {
  /*
    ⚠ CE NU E HEX SE SEPARĂ ÎNTÂI, ȘI ASTA A FOST O GAURĂ ÎN CHIAR PROBA ASTA.

    Prima variantă măsura tot ce găsea. Dar culoarea noastră e `var(--primary)`,
    nu un hex — `parseInt` pe ea dă `NaN`, luminanța iese `NaN`, iar
    `NaN < 4.5` e FALS. Deci orice valoare nemăsurabilă TRECEA tăcut, tocmai
    proba care exista ca să nu treacă nimic nemăsurat.

    Acum: hexurile se măsoară, iar restul trebuie să fie tokenul site-ului, a
    cărui valoare e documentată (4,95:1, vezi capul lui `globals.css`). Orice
    altceva — o culoare CSS scrisă direct, un `rgb(...)`, un token necunoscut —
    pică, fiindcă nimeni nu i-a măsurat contrastul.
  */
  const TOKENURI_STIUTE = new Set([VERDE_CITIBIL]);
  const esteHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

  const nemasurabile = PLATFORME.filter(
    (p) => !esteHex(CULORI_MARCA[p]) && !TOKENURI_STIUTE.has(CULORI_MARCA[p]),
  ).map((p) => `${p}="${CULORI_MARCA[p]}"`);
  assert.deepEqual(
    nemasurabile,
    [],
    `valori cărora nu le pot măsura contrastul: ${nemasurabile.join(", ")}`,
  );

  const prea_deschise = PLATFORME.filter((p) => esteHex(CULORI_MARCA[p]))
    .map((p) => ({ p, r: contrastPeAlb(CULORI_MARCA[p]) }))
    .filter((x) => x.r < 4.5)
    .map((x) => `${x.p} ${x.r.toFixed(2)}:1`);

  assert.deepEqual(
    prea_deschise,
    [],
    `sub 4,5:1 pe alb, la 13px: ${prea_deschise.join(", ")}. ` +
      "Întunecă hexul de marcă păstrându-i nuanța, nu-l lăsa brut.",
  );
});

test("martor: măsurătoarea chiar respinge un hex de marcă brut", () => {
  /*
    ⚠ Fără rândul ăsta, proba de deasupra ar fi verde și pe o funcție de contrast
    scrisă greșit care întoarce mereu un număr mare. Verdele de marcă al Edinio e
    exemplul din depozit cu valoarea măsurată: 2,70:1.
  */
  assert.ok(contrastPeAlb("#1AB554") < 4.5, "verdele de marcă ar fi trebuit respins");
  assert.ok(contrastPeAlb("#95BF47") < 4.5, "verdele Shopify brut ar fi trebuit respins");
  assert.ok(contrastPeAlb("#000000") > 4.5, "negrul ar fi trebuit acceptat");
});

test("Edinio poartă verdele site-ului, nu unul scris aici", () => {
  /*
    Coloana noastră e deja verde în valori; numele trebuie să fie ACELAȘI verde,
    altfel apar două verzi în același card.

    ⚠ SE COMPARĂ CU TOKENUL, NU CU UN HEX. Prima variantă a probei aștepta
    `#12874A` — verdele DE DINAINTE, pe care depozitul l-a înlocuit cu
    `var(--primary)` (4,95:1 în loc de 4,54:1). Scrisă cu hexul, proba ar fi
    cerut întoarcerea la culoarea veche la prima rulare de după o schimbare de
    temă. A picat, și bine a făcut.
  */
  assert.equal(CULORI_MARCA[COMPARISON_US], VERDE_CITIBIL);
});
