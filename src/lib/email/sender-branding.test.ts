import assert from "node:assert/strict";
import { test } from "node:test";
import { buildStoreSender, fromLine, looksLikeEmail } from "./config";
import { storeEmailShell } from "./store-shell";

/**
 * Emailurile catre CLIENTUL magazinului poarta marca magazinului, nu a Edinio.
 *
 * Invelisul curat exista de mult, dar era legat de SMTP, nu de magazin: cine
 * n-avea server propriu de email isi trimitea clientii cu logo Edinio, subsol
 * Edinio si expeditor „Edinio.com". Adica exact comerciantii care n-aveau cum sa
 * repare asta singuri.
 */

const ADRESA = "no-reply@edinio.com";

const magazin = (peste: Partial<Parameters<typeof buildStoreSender>[1]> = {}) => ({
  store_name: "Bricosmart",
  business_name: "Bricosmart SRL",
  logo_url: "https://exemplu.ro/logo.png",
  primary_color: "#1877F2",
  slug: "bricosmart",
  custom_domain: null,
  email: "contact@bricosmart.ro",
  ...peste,
});

/* ── Expeditorul ── */

test("la expeditor scrie numele magazinului, nu Edinio", () => {
  assert.equal(fromLine("Bricosmart", ADRESA), `"Bricosmart" <${ADRESA}>`);
});

test("adresa ramane a Edinio, oricare ar fi numele", () => {
  // Nu e o scapare, e singura varianta care trece de SPF si DKIM. Vezi `fromLine`.
  assert.ok(fromLine("Bricosmart", ADRESA).endsWith(`<${ADRESA}>`));
});

test("fara nume de magazin ramane Edinio, ca pana acum", () => {
  assert.equal(fromLine(null, ADRESA), `Edinio.com <${ADRESA}>`);
  assert.equal(fromLine("   ", ADRESA), `Edinio.com <${ADRESA}>`);
});

test("un nume cu linie noua NU poate adauga anteturi in email", () => {
  // Numele il scrie comerciantul si ajunge intr-un antet. Fara curatare, asta ar
  // fi strecurat un Bcc catre altcineva in fiecare email trimis clientilor lui.
  const linie = fromLine("Magazin\r\nBcc: spion@exemplu.ro", ADRESA);
  assert.equal(linie.includes("\r"), false);
  assert.equal(linie.includes("\n"), false);
  // `@` cade si el, din alt motiv (vezi testul cu numele care pare adresa), deci
  // ce ramane e text inofensiv pe un singur rand.
  assert.equal(linie, `"Magazin Bcc: spionexemplu.ro" <${ADRESA}>`);
});

test("ghilimelele si parantezele unghiulare se scot, ca sa nu rupa adresa", () => {
  assert.equal(fromLine('Ma"gazin <hop>', ADRESA), `"Magazin hop" <${ADRESA}>`);
});

test("un nume foarte lung se taie", () => {
  const linie = fromLine("x".repeat(200), ADRESA);
  assert.equal(linie, `"${"x".repeat(78)}" <${ADRESA}>`);
});

/* ── Reply-To ── */

test("raspunsurile clientului merg la comerciant, nu in no-reply", () => {
  assert.equal(buildStoreSender({}, magazin()).replyTo, "contact@bricosmart.ro");
});

test("fara email de contact nu se pune Reply-To gol", () => {
  assert.equal(buildStoreSender({}, magazin({ email: "  " })).replyTo, undefined);
  assert.equal(buildStoreSender({}, magazin({ email: null })).replyTo, undefined);
});

test("un email de contact stricat NU ajunge in antet", () => {
  // Nimic nu valideaza campul la scriere. Trecut mai departe, Resend ar RESPINGE
  // mesajul, deci un singur camp completat gresit ar taia toate emailurile catre
  // clientii magazinului aceluia.
  for (const stricat of ["nu-i email", "a@b", "a b@c.ro", "x@y.ro, z@w.ro", "<a@b.ro>", "a@b.ro\r\nBcc: x@y.ro"]) {
    assert.equal(looksLikeEmail(stricat), false, stricat);
    assert.equal(buildStoreSender({}, magazin({ email: stricat })).replyTo, undefined, stricat);
  }
});

test("emailurile bune trec", () => {
  for (const bun of ["contact@bricosmart.ro", " a.b-c+d@sub.exemplu.co.uk "]) {
    assert.equal(looksLikeEmail(bun), true, bun);
  }
});

test("un nume cu @ nu mai pare adresa de email", () => {
  // Un nume afisat care arata a adresa, dar nu se potriveste cu adresa reala,
  // e tratat de Gmail ca imitare de expeditor: avertisment sau direct spam.
  assert.equal(fromLine("@Fp smart@", ADRESA), `"Fp smart" <${ADRESA}>`);
  assert.equal(fromLine("Cafe@Home", ADRESA), `"CafeHome" <${ADRESA}>`);
});

test("brandurile cu .ro in nume raman NEATINSE", () => {
  // eSAFE.ro, Ralls.ro, Suporti-Numar.ro sunt nume reale de magazine. Un punct
  // si un TLD nu inseamna adresa de email, deci nu e nimic de curatat.
  assert.equal(fromLine("eSAFE.ro - Echipamente protectia muncii", ADRESA),
    `"eSAFE.ro - Echipamente protectia muncii" <${ADRESA}>`);
  assert.equal(fromLine("Ralls.ro", ADRESA), `"Ralls.ro" <${ADRESA}>`);
});

/* ── Invelisul ── */

/**
 * „Fara Edinio" inseamna fara MARCA Edinio: logo, nume de expeditor, subsolul cu
 * „Platforma ta de e-commerce".
 *
 * NU inseamna ca sirul „edinio" dispare din email. Magazinul fara domeniu propriu
 * chiar locuieste la `edinio.com/slug`, iar aia e adresa LUI: linkul din subsol
 * trebuie sa duca unde sta magazinul. Cine isi ia domeniu propriu nu mai are
 * nici atat.
 */
test("invelisul nu poarta marca Edinio: nici logo, nici subsolul nostru", () => {
  const html = storeEmailShell(buildStoreSender({}, magazin()).branding, "<p>Comanda ta</p>");
  assert.ok(html.includes("https://exemplu.ro/logo.png"), "logo-ul magazinului e in antet");
  assert.equal(html.includes("/logo.png\" width=\"44\""), false, "nu apare logo-ul Edinio");
  assert.equal(/Platforma ta de e-commerce/i.test(html), false);
  assert.ok(html.includes("Bricosmart"), "subsolul poarta numele magazinului");
});

test("cu domeniu propriu nu mai ramane nici urma de edinio in email", () => {
  const b = buildStoreSender({}, magazin({ custom_domain: "bricosmart.ro" })).branding;
  assert.equal(/edinio/i.test(storeEmailShell(b, "<p>x</p>")), false);
});

test("fara logo apare NUMELE magazinului, nu logo-ul Edinio", () => {
  // Comerciantul care n-a apucat sa-si puna logo e ultimul care trebuie sa-si
  // trimita clientii cu marca altcuiva.
  const html = storeEmailShell(buildStoreSender({}, magazin({ logo_url: null })).branding, "<p>x</p>");
  assert.equal(html.includes("<img"), false, "nu se pune nicio imagine straina");
  assert.ok(html.includes("Bricosmart"));
});

test("magazinul fara nume de vitrina cade pe numele firmei", () => {
  const b = buildStoreSender({}, magazin({ store_name: null })).branding;
  assert.equal(b.storeName, "Bricosmart SRL");
});

test("logo-ul si culoarea pentru emailuri bat pe cele ale magazinului", () => {
  const b = buildStoreSender(
    { branding: { logo: "https://exemplu.ro/logo-email.png", color: "#FF0000" } },
    magazin(),
  ).branding;
  assert.equal(b.logoUrl, "https://exemplu.ro/logo-email.png");
  assert.equal(b.color, "#FF0000");
});
