import { strict as assert } from "node:assert";
import { test } from "node:test";

/*
 * ⚠ CHEIA SE PUNE INAINTE DE IMPORTUL MODULULUI SEMNAT, si e o masuratoare, nu o formalitate.
 *
 * `secret()` din `ecolet/documente.ts` ARUNCA de pe 15.09.2026 daca lipsesc amandoua variabilele,
 * in loc sa cada tacut pe sirul gol. Incarcatorul probelor (`scripts/tests/register.mjs`) nu aduce
 * niciun `.env`, deci in procesul de test amandoua au lungimea ZERO: fara randul de mai jos, fiecare
 * afirmatie din fisierul asta ar cadea pe lipsa cheii, nu pe regula probata.
 *
 * ⚠ `||=`, nu `=`, ca la vecinul Pall-Ex: daca masina chiar are un secret, se foloseste al ei.
 * Si importul se face DUPA, cu `await import`, fiindca modulul insusi nu semneaza la incarcare dar
 * vecinii lui da, iar tiparul se copiaza intreg ca sa nu se desparta.
 */
process.env.SHIPPING_QUOTE_SECRET ||= "secret-de-proba";
const { cheieEticheta, felulEtichetei, numeFisier } = await import("./documente");
const { cheieDocument } = await import("@/lib/pallex/documente");
const { cheieEticheta: cheieGls } = await import("@/lib/gls/eticheta");

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * ETICHETA eCOLET NU SE POATE GHICI DIN CDN                     (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fisierele din R2 se servesc PUBLIC prin CDN, cu `max-age` de un an. O eticheta AWB poarta NUMELE,
 * ADRESA si TELEFONUL cumparatorului, adica date personale ale unui TERT, nu ale comerciantului.
 * Singurul lucru care le apara acolo e ca adresa lor nu se poate compune din identificatori.
 *
 * ⚠ Fisierul asta NU exista pana azi. `cheieEticheta` era nefolosita de nicio proba, deci nimic nu
 * apara promisiunea scrisa in capul modulului („de aceea cheia nu se poate ghici").
 */

const BIZ = "11111111-1111-1111-1111-111111111111";
const CMD = "22222222-2222-2222-2222-222222222222";
const PREFIX = `awb/ecolet/${BIZ}/${CMD}-`;

/* ── Cheia ────────────────────────────────────────────────────────────────── */

test("cheia e determinista: aceleasi date dau acelasi fisier", () => {
  /* Ruta de descarcare RECOMPUNE cheia, nu o citeste de undeva. Nedeterminista, fiecare descarcare
     ar fi cautat alt fisier decat cel scris. */
  assert.equal(cheieEticheta(BIZ, CMD), cheieEticheta(BIZ, CMD));
});

test("⚠⚠ cheia nu se poate compune din cele doua UUID-uri", () => {
  /*
   * ⚠ AFIRMATIA CARE APARA TOT MODULUL. Comerciantul isi stie identificatorii, si un fost angajat
   * la fel. Fara semnatura, oricine ii are descarca eticheta oricarei comenzi direct de pe CDN.
   */
  const cheie = cheieEticheta(BIZ, CMD);
  assert.ok(cheie.startsWith(PREFIX), cheie);
  const semnatura = cheie.slice(PREFIX.length, -".pdf".length);
  assert.equal(semnatura.length, 24, "semnatura si-a schimbat lungimea: etichetele vechi devin de negasit");
  assert.match(semnatura, /^[0-9a-f]{24}$/);
});

test("⚠ comenzi diferite si magazine diferite dau chei diferite", () => {
  const altaComanda = "33333333-3333-3333-3333-333333333333";
  const altMagazin = "44444444-4444-4444-4444-444444444444";
  assert.notEqual(cheieEticheta(BIZ, CMD), cheieEticheta(BIZ, altaComanda));
  assert.notEqual(cheieEticheta(BIZ, CMD), cheieEticheta(altMagazin, CMD));
});

test("⚠⚠ PDF-ul si ZPL-ul NU impart acelasi fisier", () => {
  /*
   * eColet poate intoarce ZPL in loc de PDF. Fara extensia in SEMNATURA, nu doar in nume, cele doua
   * ar fi ajuns la acelasi fisier, iar un ZPL servit ca PDF se deschide gol: comerciantul afla abia
   * de la imprimanta. Se cere ca semnatura insasi sa difere, nu doar coada numelui.
   */
  const pdf = cheieEticheta(BIZ, CMD, "pdf");
  const zpl = cheieEticheta(BIZ, CMD, "zpl");
  assert.notEqual(pdf, zpl);
  const sPdf = pdf.slice(PREFIX.length, -".pdf".length);
  const sZpl = zpl.slice(PREFIX.length, -".zpl".length);
  assert.notEqual(sPdf, sZpl, "extensia nu intra in semnatura: doua formate ar imparti un fisier");
});

test("⚠ o extensie inventata cade inapoi pe pdf, si nu deschide o cale noua", () => {
  /* `waybill_extension` vine de la ei si e text liber. Nefiltrata, ar fi intrat in numele unui
     obiect din R2, unde o bara sau un punct dublu inseamna alt drum. */
  assert.equal(cheieEticheta(BIZ, CMD, "../../secret"), cheieEticheta(BIZ, CMD, "pdf"));
  assert.equal(cheieEticheta(BIZ, CMD, ""), cheieEticheta(BIZ, CMD, "pdf"));
  assert.ok(!cheieEticheta(BIZ, CMD, "../../secret").includes(".."));
});

test("⚠ eColet, Pall-Ex si GLS nu se calca pe fisiere pe ACEEASI comanda", () => {
  /*
   * Prefixul si sirul semnat poarta amandoua numele curierului. Copiate de la un vecin, doua
   * etichete ale unor curieri diferiti pe aceeasi comanda ar fi ajuns la aceeasi cheie: reemiterea
   * ar fi suprascris-o pe prima, iar anularea uneia ar fi sters-o pe a celeilalte.
   */
  const ecolet = cheieEticheta(BIZ, CMD);
  const pallex = cheieDocument(BIZ, CMD, "label");
  const gls = cheieGls(BIZ, CMD);
  assert.equal(new Set([ecolet, pallex, gls]).size, 3, "doi curieri impart aceeasi cheie de fisier");
  assert.ok(ecolet.startsWith("awb/ecolet/"), ecolet);
});

/* ── Felul fisierului ─────────────────────────────────────────────────────── */

test("⚠ ZPL-ul nu se serveste ca PDF", () => {
  /* Servit cu `application/pdf`, browserul incearca sa-l deschida ca PDF si arata o pagina goala:
     un defect care pare al nostru si nu e. */
  assert.deepEqual(felulEtichetei("zpl"), { ext: "zpl", tip: "application/vnd.zebra.zpl" });
  assert.deepEqual(felulEtichetei("ZPL"), { ext: "zpl", tip: "application/vnd.zebra.zpl" });
  assert.deepEqual(felulEtichetei(" zpl "), { ext: "zpl", tip: "application/vnd.zebra.zpl" });
});

test("orice altceva, inclusiv lipsa, inseamna PDF", () => {
  for (const v of [null, undefined, "", "pdf", "PDF", "altceva"]) {
    assert.deepEqual(felulEtichetei(v), { ext: "pdf", tip: "application/pdf" });
  }
});

/* ── Numele de descarcare ─────────────────────────────────────────────────── */

test("numele fisierului spune al cui e si ce format are", () => {
  assert.equal(numeFisier("EC12345678"), "awb-ecolet-EC12345678.pdf");
  assert.equal(numeFisier("EC12345678", "zpl"), "awb-ecolet-EC12345678.zpl");
});

test("⚠ numele fisierului nu poate fi stricat de continutul comenzii", () => {
  /* AWB-ul vine de la ei si poate purta orice. Un nume cu bara ar fi produs un fisier pe care
     sistemul de operare il refuza, sau ar fi iesit din dosar. */
  assert.equal(numeFisier("EC/123 45"), "awb-ecolet-EC12345.pdf");
  assert.equal(numeFisier(""), "awb-ecolet-expediere.pdf");
  assert.ok(!numeFisier("../../etc/passwd").includes("/"));
});

/* ── Secretul ─────────────────────────────────────────────────────────────── */

test("⚠⚠ fara secret NU se semneaza cu cheie goala: se ARUNCA", () => {
  /*
   * ⚠ Cu `""`, `createHmac` scoate tot 24 de caractere hexazecimale, deci nimic, nici o proba, nu
   * deosebeste o cheie neghicibila de una pe care o poate calcula oricine. O degradare tacuta de
   * securitate e mai rea decat o eroare zgomotoasa.
   *
   * ⚠ SE STERG AMANDOUA VARIABILELE din lant: stearsa doar prima, afirmatia ar trece si peste un
   * cod nereparat, pe orice masina care se intampla sa aiba cheia de serviciu in mediu.
   */
  const a = process.env.SHIPPING_QUOTE_SECRET;
  const b = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SHIPPING_QUOTE_SECRET;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.throws(() => cheieEticheta(BIZ, CMD), /secretul de semnare a etichetelor eColet/i);
  } finally {
    /* ⚠ Puse la loc, altfel probele de dupa din acelasi fisier ar rula fara cheie. */
    if (a !== undefined) process.env.SHIPPING_QUOTE_SECRET = a;
    if (b !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = b;
  }
});
