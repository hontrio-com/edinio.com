import test from "node:test";
import assert from "node:assert/strict";

/**
 * LOGOUL DIN EMAIL PLEACA PNG, NU WEBP, SI CU MARIMEA SCRISA PENTRU OUTLOOK.
 *
 * ═══ ⚠ CE APARA ═══
 *
 * Reclamat de BricoSmart pe 10.09.2026, cu poza: in emailul „Comanda noua", logoul lor transparent
 * statea pe un dreptunghi negru. Logoul e WebP cu transparenta (1600x289, 312.324 de pixeli
 * transparenti din 462.400), iar Gmail transforma WebP-ul in JPG, care n-are transparenta. Sub
 * pixelii transparenti culoarea stocata e (0, 0, 0), deci au iesit negri.
 *
 * Si a doua jumatate, gasita la revizie: Outlook pe Windows nu stie `max-height` si arata poza la
 * marimea ei reala. Fara `width`/`height`, PNG-ul de 640px ar fi iesit acolo urias.
 *
 * ⚠ SE PROBEAZA PE HTML-UL INVELISULUI, nu doar pe functiile care compun adresa si marimea: o
 * functie corecta pe care invelisul n-o mai cheama ar lasa verzi toate probele ei, iar emailul ar
 * ramane negru. Drumul prin expeditorul adevarat e probat in `logo-apelant.test.ts`.
 *
 * ⚠ MEDIUL SE PUNE INAINTEA IMPORTURILOR: `r2-url.ts` isi citeste domeniile la incarcare.
 */

const CDN = "https://edinio-cdn.com";
const R2 = "https://pub-alnostru.r2.dev";
process.env.NEXT_PUBLIC_CDN_URL = CDN;
process.env.R2_PUBLIC_URL = R2;

const { storeEmailShell } = await import("./store-shell");
const { buildStoreSender } = await import("./config");
const { buildEditableEmail } = await import("./preview");
const { atributeLogo, INALTIME_LOGO_EMAIL, LATIME_MAXIMA_LOGO_EMAIL } = await import("./logo-email");
const { LATIME_PNG, cheieOptimizabila } = await import("@/lib/latimi-imagini");
const { PREFIX_INCARCARI } = await import("@/lib/customization/adresa");

type Dim = { latime: number; inaltime: number };

/** Forma reala a logoului BricoSmart din baza, si marimea lui. */
const CHEIE = "logos/545924b8-70f7-4963-bd79-e44b89eca1c5/1785676092941-s8wln.webp";
const MARIME_BRICOSMART: Dim = { latime: 1600, inaltime: 289 };

const magazin = (logo_url: string | null) => ({
  store_name: "BricoSmart",
  business_name: "Bricosmart SRL",
  logo_url,
  primary_color: "#F28C28",
  slug: "bricosmart",
  custom_domain: "bricosmart.ro",
  email: null,
});

/** Emailul asa cum pleaca: expeditorul construit din magazin, cu marimea logoului cand se stie. */
function email(logo_url: string | null, logoDimensiuni?: Dim) {
  const b = buildStoreSender({}, magazin(logo_url)).branding;
  return storeEmailShell(logoDimensiuni ? { ...b, logoDimensiuni } : b, "<p>Comanda noua</p>");
}

/** Eticheta `<img>` a logoului. Invelisul n-are alta imagine. */
function img(html: string): string {
  return /<img [^>]*>/.exec(html)?.[0] ?? "";
}

/** `src`-ul logoului, cu `&amp;` intors in `&`, cum il citeste clientul de email. */
function srcLogo(html: string): string | null {
  const m = /src="([^"]*)"/.exec(img(html));
  return m ? m[1].replace(/&amp;/g, "&") : null;
}

/** Un atribut numeric al logoului, sau `null` cand lipseste. */
function atribut(html: string, nume: "width" | "height"): number | null {
  const m = new RegExp(` ${nume}="(\\d+)"`).exec(img(html));
  return m ? Number(m[1]) : null;
}

/** Cere ca adresa sa fie varianta PNG a cheii, prin optimizatorul platformei. */
function estePngPrinOptimizator(src: string | null, cheie: string) {
  assert.ok(src, "emailul n-are logo");
  const u = new URL(src);
  assert.equal(u.origin, "https://www.edinio.com", `logoul nu trece prin platforma: ${src}`);
  assert.equal(u.pathname, "/api/img", `logoul nu trece prin optimizator: ${src}`);
  assert.equal(u.searchParams.get("f"), "png", `logoul nu se cere ca PNG: ${src}`);
  assert.equal(u.searchParams.get("p"), cheie, "logoul cere alta poza");
  assert.equal(u.searchParams.get("w"), String(LATIME_PNG));
  /* Fara `q`: la PNG ruta nu-l citeste, iar forma fara el n-a mai fost ceruta niciodata, deci niciun
     cache nu tine pentru ea raspunsul de dinainte de reparatie. */
  assert.equal(u.searchParams.has("q"), false, `adresa poarta inca \`q\`: ${src}`);
  /* Si ruta chiar o primeste: altfel emailul ar purta o poza RUPTA, mai rau decat una neagra. */
  assert.equal(cheieOptimizabila(cheie), true, `ruta ar refuza cheia ${cheie}`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADRESA: ce pleaca prin PNG, si ce ramane neatins
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ logoul WebP de pe CDN pleaca in email ca PNG (cazul BricoSmart)", () => {
  const html = email(`${CDN}/${CHEIE}`);
  estePngPrinOptimizator(srcLogo(html), CHEIE);
  assert.equal(/<img src="[^"]*\.webp"/.test(html), false, "in email a ramas adresa WebP bruta");
});

test("⚠ si logoul WebP ramas pe `r2.dev`, si cel AVIF", () => {
  estePngPrinOptimizator(srcLogo(email(`${R2}/${CHEIE}`)), CHEIE);
  const avif = "logos/545924b8-70f7-4963-bd79-e44b89eca1c5/logo.avif";
  estePngPrinOptimizator(srcLogo(email(`${CDN}/${avif}`)), avif);
});

test("⚠ si logoul ales ANUME pentru emailuri trece prin PNG", () => {
  const cheie = "logos/545924b8-70f7-4963-bd79-e44b89eca1c5/email.webp";
  const b = buildStoreSender({ branding: { logo: `${CDN}/${cheie}` } }, magazin(`${CDN}/${CHEIE}`)).branding;
  estePngPrinOptimizator(srcLogo(storeEmailShell(b, "<p>x</p>")), cheie);
});

test("PNG, JPG si GIF raman neatinse: se vad bine in email si azi", () => {
  for (const ext of ["png", "jpg", "jpeg", "gif"]) {
    const adresa = `${CDN}/logos/545924b8-70f7-4963-bd79-e44b89eca1c5/logo.${ext}`;
    assert.equal(srcLogo(email(adresa)), adresa, `.${ext} a fost trimis inutil prin optimizator`);
  }
});

test("⚠ o adresa care doar SEAMANA cu depozitul nostru ramane neatinsa", () => {
  /*
   * Ruta ar cauta cheia in depozitul NOSTRU, n-ar gasi-o, iar emailul ar purta o poza rupta.
   * `r2KeyFromUrl` gaseste `.r2.dev/` oriunde in sir, deci cheia trebuie sa fie chiar calea adresei.
   */
  for (const adresa of [
    "https://exemplu.ro/logo.webp",
    "https://edinio-cdn.com.altcineva.ro/logos/a/logo.webp",
    "https://altcineva.ro/x.r2.dev/logos/a/logo.webp",
    `https://altcineva.ro/?u=${R2}/logos/a/logo.webp`,
    `${CDN}/${CHEIE}#ancora`,
  ]) {
    assert.equal(srcLogo(email(adresa)), adresa, adresa);
  }
});

test("⚠ o cheie pe care ruta ar refuza-o NU se trimite la ruta", () => {
  /*
   * Ruta raspunde 404 unei chei pe care n-o primeste, deci adresa compusa ar fi o poza RUPTA in
   * emailul fiecarui client: mai rau decat defectul reparat. Ramane adresa bruta.
   */
  for (const adresa of [
    `${CDN}/${CHEIE}?v=2`,
    `${CDN}/alt-dosar/545924b8/logo.webp`,
    `${CDN}/logos/../facturi/logo.webp`,
    `${CDN}/${PREFIX_INCARCARI}11111111-1111-4111-8111-111111111111/poza.webp`,
  ]) {
    assert.equal(srcLogo(email(adresa)), adresa, adresa);
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   MARIMEA: pentru Outlook pe Windows
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ OUTLOOK: logoul PNG are `width` si `height`, la inaltimea antetului", () => {
  const html = email(`${CDN}/${CHEIE}`, MARIME_BRICOSMART);
  estePngPrinOptimizator(srcLogo(html), CHEIE);
  assert.equal(atribut(html, "height"), 48, "fara inaltime, Outlook arata PNG-ul de 640px intreg");
  assert.equal(atribut(html, "width"), 266);
});

test("fara marime cunoscuta, `<img>` ramane fara atribute, ca inainte", () => {
  const html = email(`${CDN}/${CHEIE}`);
  assert.equal(atribut(html, "width"), null);
  assert.equal(atribut(html, "height"), null);
});

test("⚠ atributele stau doar pe PNG-ul trimis prin ruta", () => {
  /* Pentru un logo lasat neatins nu stim ce marime primeste clientul, iar in editor browserul
     comerciantului se uita oricum la stil. */
  const png = email(`${CDN}/logos/545924b8-70f7-4963-bd79-e44b89eca1c5/logo.png`, MARIME_BRICOSMART);
  assert.equal(atribut(png, "width"), null, "logoul neatins a primit o marime ghicita");

  const b = { ...buildStoreSender({}, magazin(`${CDN}/${CHEIE}`)).branding, logoDimensiuni: MARIME_BRICOSMART };
  const editor = buildEditableEmail("new_order", b, { subject: "x", intro: "" }, true).html;
  assert.equal(atribut(editor, "width"), null, "editorul din panou a primit atribute");
});

test("⚠ marimea: inaltimea antetului, proportia originalului, fara marire, plafonata la tabel", () => {
  const cazuri: [string, Dim, Dim][] = [
    ["BricoSmart, lat", { latime: 1600, inaltime: 289 }, { latime: 266, inaltime: 48 }],
    ["patrat", { latime: 640, inaltime: 640 }, { latime: 48, inaltime: 48 }],
    ["inalt, ca o poza de produs", { latime: 810, inaltime: 1440 }, { latime: 27, inaltime: 48 }],
    ["mic: nu se mareste", { latime: 100, inaltime: 30 }, { latime: 100, inaltime: 30 }],
    ["VetDepo, sub 48px", { latime: 128, inaltime: 40 }, { latime: 128, inaltime: 40 }],
    ["foarte lat: plafonat la tabel", { latime: 4000, inaltime: 100 }, { latime: 520, inaltime: 13 }],
  ];
  for (const [nume, original, asteptat] of cazuri) {
    const a = atributeLogo(original);
    assert.deepEqual(a, asteptat, nume);
    assert.ok(a && a.inaltime <= INALTIME_LOGO_EMAIL && a.latime <= LATIME_MAXIMA_LOGO_EMAIL, nume);
  }
  for (const rau of [null, undefined, { latime: 0, inaltime: 10 }, { latime: 10, inaltime: -1 }, { latime: NaN, inaltime: 10 }]) {
    assert.equal(atributeLogo(rau as Dim | null | undefined), null, JSON.stringify(rau));
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   EDITORUL SI RESTUL
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ in editorul din panou ramane adresa din baza; previzualizarea needitabila arata ce pleaca", () => {
  const b = buildStoreSender({}, magazin(`${CDN}/${CHEIE}`)).branding;
  const valori = { subject: "Comanda noua", intro: "" };
  assert.equal(srcLogo(buildEditableEmail("new_order", b, valori, true).html), `${CDN}/${CHEIE}`);
  estePngPrinOptimizator(srcLogo(buildEditableEmail("new_order", b, valori, false).html), CHEIE);
});

test("fara logo apare tot numele magazinului, fara nicio imagine", () => {
  const html = email(null);
  assert.equal(html.includes("<img"), false);
  assert.ok(html.includes("BricoSmart"));
});
