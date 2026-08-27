import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { cercetareSemnatura, formaValorii } from "./semnatura-descoperire";
import { verifyAboutYouSignature } from "./webhooks";

/* ══════════════════════════════════════════════════════════════════════════
   CE FEL DE SEMNATURA PUNE ABOUT YOU (27.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   `verifyAboutYouSignature` e o DEDUCTIE: HMAC-SHA256 peste corpul brut, in hex, pe patru antete
   ghicite. Documentatia spune ca la abonare primesti un `client_secret`, dar nu descrie antetul,
   algoritmul, codificarea sau ce anume se semneaza. De-aia exista a doua incuietoare, tokenul.

   ⚠ RASPUNSUL VINE IN FIECARE CERERE, iar ruta il arunca: se uita doar la cele patru antete ghicite
   si, cand niciunul nu se potrivea, mergea mai departe pe token fara sa vada ce era acolo.

   ⚠ PROBA ASTA NU VERIFICA CA UNEALTA E SCRISA. Verifica pe rand ca IDENTIFICA schema, pentru
   fiecare fel plauzibil - inclusiv pe antete la care nu ne-am gandit. O unealta de masura care
   n-a fost pusa la incercare pe un raspuns cunoscut nu masoara nimic.
*/

const SECRET = "un-secret-de-proba";
const CORP = '{"id":"evt_1","event":"stock.updated","message":[{"sku":"ABC","quantity":3}]}';

const cu = (h: Record<string, string>) => new Headers(h);

test("⚠ hexa pe `x-signature` — presupunerea noastra de azi", () => {
  const hex = createHmac("sha256", SECRET).update(CORP).digest("hex");
  const c = cercetareSemnatura(SECRET, cu({ "x-signature": hex }), CORP);
  assert.equal(c.potrivire, "hmac-sha256(corp)/hex");
  assert.equal(c.potrivirePeAntet, "x-signature");
});

test("⚠ base64, care e la fel de obisnuit si pe care nu-l acceptam azi", () => {
  const b64 = createHmac("sha256", SECRET).update(CORP).digest("base64");
  const c = cercetareSemnatura(SECRET, cu({ "x-aboutyou-signature": b64 }), CORP);
  assert.equal(c.potrivire, "hmac-sha256(corp)/base64");
});

test("⚠ cu prefixul `sha256=`, ca la GitHub", () => {
  const hex = createHmac("sha256", SECRET).update(CORP).digest("hex");
  const c = cercetareSemnatura(SECRET, cu({ "x-hub-signature-256": `sha256=${hex}` }), CORP);
  assert.equal(c.potrivire, "hmac-sha256(corp)/hex+prefix");
  assert.equal(c.potrivirePeAntet, "x-hub-signature-256");
});

test("⚠ cu marca de timp in fata, ca la Stripe", () => {
  /* Aici presupunerea noastra de azi ar fi picat, si n-am fi stiut de ce. */
  const t = "1787840000";
  const hex = createHmac("sha256", SECRET).update(`${t}.${CORP}`).digest("hex");
  const c = cercetareSemnatura(SECRET, cu({ "x-signature": hex, "x-timestamp": t }), CORP);
  assert.equal(c.potrivire, "hmac-sha256(1787840000.corp)/hex");
});

test("⚠ SI PE UN ANTET LA CARE NU NE-AM GANDIT", () => {
  /*
   * Miezul uneltei. Daca schema lor foloseste un nume care nu e in lista noastra, tocmai ala e
   * raspunsul cautat - si l-am rata exact pe el daca ne-am uita doar la candidati.
   */
  const hex = createHmac("sha256", SECRET).update(CORP).digest("hex");
  const c = cercetareSemnatura(SECRET, cu({ "x-ay-digest": hex }), CORP);
  assert.equal(c.potrivire, "hmac-sha256(corp)/hex");
  assert.equal(c.potrivirePeAntet, "x-ay-digest");
});

test("⚠ cand nu se potriveste nimic, se pastreaza ce s-a primit", () => {
  /*
   * Cazul cel mai probabil la prima livrare: nicio combinatie nu tine. Atunci lista antetelor e
   * tot ce ne trebuie ca sa ne dam seama singuri - sau ca sa punem o intrebare exacta la ei.
   */
  const c = cercetareSemnatura(SECRET, cu({
    "x-signature": "0".repeat(64), "x-ceva-nou": "abcdef0123456789abcdef", "content-type": "application/json",
  }), CORP);
  assert.equal(c.potrivire, null);
  assert.deepEqual(c.antete, [{ nume: "x-signature", forma: "hexa:64" }]);
  assert.ok(c.toateAnteteleNume.includes("x-ceva-nou"));
});

test("⚠ forma valorii spune codificarea fara sa spuna valoarea", () => {
  /*
   * ⚠ Nu se scrie niciodata valoarea intreaga si nici secretul. Alfabetul si lungimea sunt tot ce
   * trebuie ca sa stim ce sa implementam: 64 hexa = SHA-256 in hex, 44 base64 = acelasi in base64.
   */
  assert.equal(formaValorii("a".repeat(64)), "hexa:64");
  assert.equal(formaValorii("sha256=" + "a".repeat(64)), "hexa:64:cu-prefix-sha256");
  assert.equal(formaValorii(createHmac("sha256", "x").update("y").digest("base64")), "base64:44");
});

test("⚠ fara secret nu se incearca nimic, dar antetele tot se strang", () => {
  /* Un magazin fara secret salvat e chiar cazul in care vrem sa vedem ce vine, ca sa aflam de ce. */
  const c = cercetareSemnatura(null, cu({ "x-signature": "abc123abc123abc123" }), CORP);
  assert.equal(c.potrivire, null);
  assert.equal(c.antete.length, 1);
});

test("⚠ nu hotaraste nimic: e o masuratoare, nu o poarta", () => {
  /*
   * ⚠ Un instrument de masura care schimba si rezultatul n-ar fi un instrument de masura. Trecerea
   * evenimentului ramane hotararea tokenului; asta doar constata.
   */
  const c = cercetareSemnatura(SECRET, cu({ "x-signature": "0".repeat(64) }), CORP);
  assert.deepEqual(Object.keys(c).sort(), ["antete", "potrivire", "potrivirePeAntet", "toateAnteteleNume"]);
});

/* ══════════════════════════════════════════════════════════════════════════
   SI ACUM SCHEMA ADEVARATA, MASURATA (27.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Doua livrari adevarate pe contul de sandbox - o schimbare de stoc dus-intors - au raspuns la
   intrebarea care statea deschisa de la prima zi a integrarii. Din jurnal, verbatim:

       schema de semnatura AFLATA: hmac-sha256(corp)/hex pe antetul „x-signature"
       (verificarea de azi o accepta deja)

   ⚠ DEDUCTIA DIN PRIMA ZI ERA CORECTA. Comentariul care spunea „SEMNATURA NU E CONFIRMATA… daca
   schema difera, TOATE evenimentele cad tacut" a stat luni si a intrat in fiecare audit ca risc
   deschis - pentru un lucru care mergea.

   ⚠ SI IN TOATA LISTA ANTETELOR primite nu exista alt candidat de semnatura si niciun antet de
   marca de timp: 48 de antete, dintre care unul singur e `x-signature`. Deci nu e o schema cu
   `timestamp.corp`. Verificat pe lista intreaga, nu pe cele patru la care ne uitam.
*/

test("⚠ schema masurata e chiar cea pe care o acceptam", () => {
  /*
   * Proba reface exact ce s-a masurat: acelasi algoritm, aceeasi codificare, acelasi antet. Daca
   * cineva strange candidatii si scoate tocmai varianta asta, aici se vede.
   */
  const corp = '{"id":"evt","event":"stock.updated"}';
  const hex = createHmac("sha256", SECRET).update(corp).digest("hex");
  assert.equal(hex.length, 64, "64 de caractere hexa, ca in masuratoare");

  const c = cercetareSemnatura(SECRET, cu({ "x-signature": hex }), corp);
  assert.equal(c.potrivire, "hmac-sha256(corp)/hex");
  assert.equal(c.potrivirePeAntet, "x-signature");
  assert.deepEqual(c.antete, [{ nume: "x-signature", forma: "hexa:64" }]);
});

test("⚠ si verificarea din productie o accepta", () => {
  /*
   * ⚠ Legatura care conteaza: unealta MASOARA, `verifyAboutYouSignature` HOTARASTE. Daca cele doua
   * se despart, masuratoarea devine o curiozitate. Aici se cere sa spuna acelasi lucru.
   */
  const corp = '{"id":"evt","event":"stock.updated"}';
  const hex = createHmac("sha256", SECRET).update(corp).digest("hex");
  assert.equal(verifyAboutYouSignature(SECRET, hex, corp), true);
  /* Si un secret gresit nu trece, altfel proba de mai sus n-ar dovedi nimic. */
  assert.equal(verifyAboutYouSignature("alt-secret", hex, corp), false);
});

test("⚠ nota veche care spunea ca schema NU e confirmata a fost stearsa", () => {
  /*
   * ⚠ O afirmatie falsa lasata in cod devine fapt pentru cine o citeste mai tarziu - azi am gasit
   * doua asa, si amandoua modelasera hotarari saptamani la rand („GET /products/ da doar trei
   * campuri", si asta). Se sterge odata cu masuratoarea.
   */
  const brut = readFileSync("src/lib/aboutyou/webhooks.ts", "utf8");
  assert.match(brut, /SCHEMA DE SEMNATURA E CONFIRMATA/);
  assert.match(brut, /hmac-sha256\(corp\)\/hex pe antetul/);

  /*
   * ⚠ Fraza veche mai apare o data, si e in regula: in CITATUL cu care se explica ce scria
   * inainte. Asta nu e o afirmatie activa, e istoria corecturii — iar pastrata, urmatorul care
   * citeste fisierul intelege de ce nota s-a schimbat. Se cere doar sa NU mai fie o afirmatie de
   * sine statatoare.
   */
  for (const linie of brut.split(/\r?\n/)) {
    if (!linie.includes("SEMNATURA NU E CONFIRMATA")) continue;
    assert.ok(linie.includes("Aici scria"),
      `„SEMNATURA NU E CONFIRMATA" a reaparut ca afirmatie, nu ca citat: ${linie.trim()}`);
  }
});
