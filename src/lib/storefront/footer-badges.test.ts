import assert from "node:assert/strict";
import { test } from "node:test";
import {
  citesteInsigneFooter,
  INALTIME_INSIGNA_IMPLICITA,
  INALTIME_INSIGNA_MAX,
  INALTIME_INSIGNA_MIN,
  MAX_INSIGNE_FOOTER,
  TITLU_INSIGNE_IMPLICIT,
} from "./footer-badges";

/**
 * Continutul vine dintr-o coloana jsonb pe care o scrie comerciantul, deci forma
 * nu e garantata de nimic. Testele astea sunt tot ce sta intre ea si atributele
 * `href`/`src` din subsolul fiecarui magazin.
 */

const IMG = "https://pub-x.r2.dev/logos/ansvsa.png";

test("magazinul fara insigne nu randeaza nimic, iar titlul nu conteaza", () => {
  assert.deepEqual(citesteInsigneFooter(undefined).insigne, []);
  assert.deepEqual(citesteInsigneFooter(null).insigne, []);
  assert.deepEqual(citesteInsigneFooter({}).insigne, []);
  assert.deepEqual(citesteInsigneFooter({ footer_badges: "nu e tablou" }).insigne, []);
});

test("o insigna intreaga trece cu tot cu link", () => {
  const { insigne } = citesteInsigneFooter({
    footer_badges: [{ id: "a", image: IMG, href: "https://www.ansvsa.ro/", alt: "ANSVSA" }],
  });
  assert.equal(insigne.length, 1);
  assert.equal(insigne[0].image, IMG);
  assert.equal(insigne[0].href, "https://www.ansvsa.ro/");
  assert.equal(insigne[0].alt, "ANSVSA");
});

test("`javascript:` in link nu ajunge niciodata intr-un href", () => {
  const { insigne } = citesteInsigneFooter({
    footer_badges: [{ image: IMG, href: "javascript:alert(1)", alt: "x" }],
  });
  // Insigna ramane — autorizatia se vede — dar fara link.
  assert.equal(insigne.length, 1);
  assert.equal(insigne[0].href, null);
});

test("si `data:` cade, la fel si adresele relative", () => {
  for (const rau of ["data:text/html,<script>", "/pagina-mea", "  ", "vbscript:x"]) {
    const { insigne } = citesteInsigneFooter({ footer_badges: [{ image: IMG, href: rau }] });
    assert.equal(insigne[0].href, null, rau);
  }
});

test("o imagine care nu e adresa buna scoate insigna cu totul", () => {
  // Fara imagine n-ar mai fi o insigna, ci un link gol intr-un subsol.
  for (const rau of ["javascript:alert(1)", "data:image/svg+xml,<svg/>", "", "/local.png", 42]) {
    const { insigne } = citesteInsigneFooter({ footer_badges: [{ image: rau, href: "https://a.ro" }] });
    assert.deepEqual(insigne, [], String(rau));
  }
});

test("randurile stricate se sar, cele bune raman", () => {
  const { insigne } = citesteInsigneFooter({
    footer_badges: [null, { image: IMG }, "text", 7, { image: IMG, href: "https://b.ro/" }],
  });
  assert.equal(insigne.length, 2);
});

test("fara text alternativ, insigna primeste totusi un nume accesibil", () => {
  const { insigne } = citesteInsigneFooter({ footer_badges: [{ image: IMG }] });
  assert.equal(insigne[0].alt, TITLU_INSIGNE_IMPLICIT);
});

test("cheia lipsa nu strica randarea: se face una din pozitie", () => {
  const { insigne } = citesteInsigneFooter({ footer_badges: [{ image: IMG }, { image: IMG }] });
  assert.equal(insigne[0].id, "insigna-0");
  assert.equal(insigne[1].id, "insigna-1");
  assert.notEqual(insigne[0].id, insigne[1].id);
});

test("peste plafon nu se randeaza: subsolul nu se lasa umplut", () => {
  const multe = Array.from({ length: MAX_INSIGNE_FOOTER + 5 }, () => ({ image: IMG }));
  assert.equal(citesteInsigneFooter({ footer_badges: multe }).insigne.length, MAX_INSIGNE_FOOTER);
});

test("inaltimea: implicita, respectata, si incadrata intre limite", () => {
  const { insigne } = citesteInsigneFooter({
    footer_badges: [
      { image: IMG },
      { image: IMG, height: 90 },
      { image: IMG, height: 5 },
      { image: IMG, height: 10000 },
      { image: IMG, height: "72" },
      { image: IMG, height: Number.NaN },
    ],
  });
  assert.equal(insigne[0].height, INALTIME_INSIGNA_IMPLICITA, "lipsa");
  assert.equal(insigne[1].height, 90, "aleasa");
  assert.equal(insigne[2].height, INALTIME_INSIGNA_MIN, "prea mica");
  assert.equal(insigne[3].height, INALTIME_INSIGNA_MAX, "prea mare");
  assert.equal(insigne[4].height, 72, "sir numeric");
  assert.equal(insigne[5].height, INALTIME_INSIGNA_IMPLICITA, "NaN");
});

test("latimea maxima creste cu inaltimea, dar are un plafon absolut", () => {
  const { insigne } = citesteInsigneFooter({
    footer_badges: [{ image: IMG, height: 40 }, { image: IMG, height: INALTIME_INSIGNA_MAX }],
  });
  assert.equal(insigne[0].maxWidth, 160);
  assert.equal(insigne[1].maxWidth, 320, "plafonul absolut bate raportul");
});

test("titlul: implicit cand lipseste, ales cand e scris", () => {
  assert.equal(citesteInsigneFooter({ footer_badges: [{ image: IMG }] }).titlu, TITLU_INSIGNE_IMPLICIT);
  assert.equal(
    citesteInsigneFooter({ footer_badges: [{ image: IMG }], footer_badges_title: "Certificari" }).titlu,
    "Certificari",
  );
});

test("titlul golit sau stins inseamna doar imaginile, fara niciun cuvant", () => {
  assert.equal(citesteInsigneFooter({ footer_badges: [{ image: IMG }], footer_badges_title: "" }).titlu, null);
  assert.equal(citesteInsigneFooter({ footer_badges: [{ image: IMG }], footer_badges_title: "   " }).titlu, null);
  assert.equal(
    citesteInsigneFooter({ footer_badges: [{ image: IMG }], footer_badges_title_enabled: false }).titlu,
    null,
  );
  assert.equal(
    citesteInsigneFooter({
      footer_badges: [{ image: IMG }],
      footer_badges_title: "Autorizatii",
      footer_badges_title_enabled: false,
    }).titlu,
    null,
    "comutatorul bate textul",
  );
});

test("titlul prea lung se taie, nu rupe coloana", () => {
  const lung = "A".repeat(200);
  const t = citesteInsigneFooter({ footer_badges: [{ image: IMG }], footer_badges_title: lung }).titlu;
  assert.equal(t?.length, 40);
});
