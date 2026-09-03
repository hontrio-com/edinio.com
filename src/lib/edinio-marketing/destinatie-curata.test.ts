import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { curataDestinatia } from "./adresa-curata";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  UNDE DUCE O LEGATURA, FARA CE E IN EA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ N-A FOST O SCURGERE VIE. Toate legaturile marcate azi sunt nevinovate. Ce se
  repara e infrastructura: `href`-ul brut ajungea in GA4, deci un singur
  `?token=…` scris maine intr-un marcaj ar fi plecat acolo.
*/

test("⚠ sirul de interogare nu pleaca, nici de la noi, nici de la altii", () => {
  assert.equal(curataDestinatia("/ceva?token=SECRET"), "/ceva");
  assert.equal(curataDestinatia("https://www.edinio.com/x?utm_source=a&cod=SECRET"), "/x");
  assert.equal(curataDestinatia("https://furnizor.ro/oferta?cheie=SECRET"), "furnizor.ro/oferta");
});

test("⚠ dintr-un `mailto:` nu iese adresa", () => {
  /*
    ⚠ CAZUL CEL MAI URAT. Un buton de contact scris asa ar fi dus un email intr-un
    cont de analiza — chiar lucrul pe care paza anti-PII il opreste peste tot.
  */
  assert.equal(curataDestinatia("mailto:cineva@edinio.com"), "mailto:");
  assert.equal(curataDestinatia("tel:+40712345678"), "tel:");
  /* ⚠ Si numarul din cale: `wa.me/<telefon>` se taie la gazda. Ce ne trebuie e
     „a plecat catre WhatsApp", nu catre cine. */
  assert.equal(curataDestinatia("https://wa.me/40712345678?text=Buna"), "wa.me");

  for (const rau of ["mailto:cineva@edinio.com", "tel:+40712345678"]) {
    const iesit = curataDestinatia(rau) ?? "";
    assert.ok(!iesit.includes("@"), `a ramas o adresa: ${iesit}`);
    assert.ok(!/\d{6}/.test(iesit), `a ramas un numar: ${iesit}`);
  }
});

test("ce trebuie sa ramana, ramane", () => {
  /* ⚠ Martorul: regula n-are voie sa goleasca masuratoarea ca sa para sigura. */
  assert.equal(curataDestinatia("/register"), "/register");
  assert.equal(curataDestinatia("https://www.edinio.com/preturi"), "/preturi");
  assert.equal(curataDestinatia("https://facebook.com/edinio"), "facebook.com/edinio");
  assert.equal(curataDestinatia("#preturi"), "#preturi");
});

test("intrarile goale sau stricate nu produc o valoare", () => {
  for (const gol of [null, undefined, "", "   "]) {
    assert.equal(curataDestinatia(gol), undefined, `"${String(gol)}" a produs o valoare`);
  }
});

test("⚠ si runtime-ul CHIAR trece destinatiile prin regula", () => {
  /*
    ⚠ CUTITUL TAIE IN AMANDOUA PARTILE. Regula de mai sus e a unei functii pure;
    ce conteaza e sa fie chemata acolo unde se citeste marcajul.
  */
  const cod = readFileSync("src/components/edinio-marketing/RuntimeMarketing.tsx", "utf8");
  for (const camp of ["cta_destination", "destination_path"]) {
    const i = cod.indexOf(`${camp}:`);
    assert.ok(i > 0, `nu mai gasesc campul ${camp}`);
    const randul = cod.slice(i, cod.indexOf(String.fromCharCode(10), i));
    assert.match(randul, /curataDestinatia\(/, `${camp} ia \`href\`-ul brut: ${randul.trim()}`);
  }
});
