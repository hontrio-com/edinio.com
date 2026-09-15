import { strict as assert } from "node:assert";
import { test } from "node:test";

/*
 * ⚠ CHEIA SE PUNE INAINTE DE IMPORT, si e o masuratoare, nu o formalitate.
 *
 * `semnaturaCheii` ARUNCA daca lipsesc amandoua variabilele din lant, iar incarcatorul probelor
 * (`scripts/tests/register.mjs`) nu aduce niciun `.env`: in procesul de test amandoua au lungimea
 * ZERO. Fara randul de mai jos, fiecare afirmatie de aici ar cadea pe lipsa cheii, nu pe regula.
 *
 * ⚠ `||=`, nu `=`: daca masina chiar are un secret, se foloseste al ei.
 */
process.env.SHIPPING_QUOTE_SECRET ||= "secret-de-proba";
const { semnaturaCheii } = await import("./cheie-neghicibila");

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CHEIA NEGHICIBILA A FISIERELOR PRIVATE                        (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ FISIERUL ASTA NU EXISTA PANA AZI, si asta a fost gaura. `semnaturaCheii` nu era importata de
 * NICIO proba din depozit. Masurat cu un banc de mutanti pe suita INTREAGA: scoasa aruncarea din
 * ea, adica pusa la loc caderea pe sirul gol, toate cele 7.865 de afirmatii ramaneau verzi.
 *
 * Ce apara functia: adresele din R2 ale facturilor (`billing/factura-comenzii.ts`) si ale
 * AWB-urilor proprii eMAG (`emag/awb-propriu.ts`). Fisierele alea se servesc public prin CDN si
 * poarta datele cumparatorului. Adresa lor E o capabilitate: cine o are, o foloseste. Trebuie sa
 * fie asa, fiindca marketplace-ul vine singur sa ia documentul si n-avem cum sa-i cerem sesiune.
 * Ce nu are voie sa se intample e ca adresa sa poata fi RECONSTRUITA din datele comenzii, pe care
 * comerciantul si un fost angajat le stiu.
 */

const CTX = "factura:2026:11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222:F-001";

test("semnatura e determinista: acelasi context da acelasi sir", () => {
  /* Ruta de descarcare RECOMPUNE cheia, nu o citeste de undeva. Nedeterminista, fiecare descarcare
     ar fi cautat alt fisier decat cel scris. */
  assert.equal(semnaturaCheii(CTX), semnaturaCheii(CTX));
});

test("forma e fixa: 24 de caractere hexazecimale", () => {
  /* ⚠ Lungimea nu e cosmetica: cheile deja scrise in R2 o poarta. Schimbata, etichetele si
     facturile vechi devin de negasit, la descarcare si la stergere deopotriva. */
  const s = semnaturaCheii(CTX);
  assert.equal(s.length, 24);
  assert.match(s, /^[0-9a-f]{24}$/);
});

test("⚠ contexte diferite dau semnaturi diferite", () => {
  assert.notEqual(semnaturaCheii("factura:a"), semnaturaCheii("factura:b"));
  assert.notEqual(semnaturaCheii("factura:a"), semnaturaCheii("awb-emag:a"));
});

test("⚠⚠ secretul CHIAR intra in semnatura", () => {
  /*
   * Fara afirmatia asta, „cheia e neghicibila" ramane o vorba din comentariu: cu secretul cazut pe
   * sirul gol, semnatura arata la fel, tot 24 de caractere hexazecimale, si nimic nu trada
   * degradarea. Se schimba secretul si se cere ca rezultatul sa se schimbe.
   */
  const cuUnul = semnaturaCheii(CTX);
  const vechi = process.env.SHIPPING_QUOTE_SECRET;
  process.env.SHIPPING_QUOTE_SECRET = "cu-totul-alt-secret";
  const cuAltul = semnaturaCheii(CTX);
  process.env.SHIPPING_QUOTE_SECRET = vechi;

  assert.notEqual(cuUnul, cuAltul, "semnatura nu depinde de secret: oricine o poate calcula");
  assert.equal(semnaturaCheii(CTX), cuUnul, "secretul nu s-a restaurat, probele urmatoare ar minti");
});

test("⚠⚠ fara secret DELOC nu se semneaza cu cheie goala: se ARUNCA", () => {
  /*
   * ⚠ ALTA INTREBARE DECAT CEA DE MAI SUS, si tocmai ea lipsea din depozit. A schimba secretul
   * dovedeste ca el e FOLOSIT. A-l sterge dovedeste ca LIPSA lui e refuzata. Numai a doua prinde
   * un `secret()` intors la forma care cadea pe sirul gol.
   *
   * ⚠ SE STERG AMANDOUA VARIABILELE din lant: stearsa doar prima, afirmatia ar trece si peste un
   * cod nereparat, pe orice masina care se intampla sa aiba cheia de serviciu in mediu.
   */
  const a = process.env.SHIPPING_QUOTE_SECRET;
  const b = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SHIPPING_QUOTE_SECRET;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.throws(() => semnaturaCheii(CTX), /secretul de semnare a cheilor de fisier/i);
  } finally {
    /* ⚠ Puse la loc, altfel probele de dupa din acelasi fisier ar rula fara cheie. */
    if (a !== undefined) process.env.SHIPPING_QUOTE_SECRET = a;
    if (b !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = b;
  }
});
