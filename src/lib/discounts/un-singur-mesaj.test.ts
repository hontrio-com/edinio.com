import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ESEC_CUPON, PREA_MULTE_INCERCARI } from "./mesaj";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * UN SINGUR MESAJ PENTRU ORICE CUPON RESPINS                     (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ PANA AZI, REGULA ASTA NU ERA APARATA DE NIMIC. Cautat in toate fisierele
 * `*.test.ts`: `validateDiscount` — zero, `ESEC_CUPON` — zero. Adica mutatii ca
 * astea lasau TOATA suita verde:
 *
 *   * desparte mesajele inapoi („a expirat” / „limita maxima” / „minim X lei”),
 *     si oracolul de dictionar de cupoane se redeschide;
 *   * schimba `.eq("code", cod)` in `.ilike(...)`, si `%` redevine metacaracter
 *     — chiar defectul masurat pe productie, unde `C%` scotea un cupon de 30%;
 *   * scoate cele doua limite de incercari de la inceput.
 *
 * ⚠⚠ REGULA SE JUDECA PE CE EXCLUDE, NU PE CE SE VEDE. O proba care ar fi cerut
 * doar „`ESEC_CUPON` se foloseste undeva” ar fi trecut si peste un fisier in
 * care a fost adaugat un al doilea mesaj alaturi. De-aia proba taie fisierul in
 * doua la clipa CAUTARII si cere: dupa ea, nicio iesire in afara de `esecCupon`.
 *
 * ⚠ Proba citeste CHIAR SURSA, fiindca `discount.actions.ts` e `"use server"`:
 * importat intr-o proba, ar fi cerut anteturi de cerere, client Supabase si
 * cheie de serviciu. Sursa spune adevarul despre STRUCTURA, care e chiar ce
 * aparam aici.
 */

const SURSA = readFileSync("src/lib/actions/discount.actions.ts", "utf8");
const COMENZI = readFileSync("src/lib/actions/order.actions.ts", "utf8");

/**
 * Corpul unei functii de nivel zero.
 *
 * ⚠ FELIA IMPRUMUTA DE LA VECIN daca nu se opreste la timp: taiata „pana la
 * capatul fisierului”, orice proba de mai jos ar fi trecut verde peste o cale
 * golita, fiindca ar fi gasit textul cautat la urmatoarea functie. De-aia se
 * taie pana la urmatorul `export` de nivel zero, si se si verifica pe urma ca
 * felia NU contine numele vecinului.
 */
function corpul(sursa: string, nume: string): string {
  const de = sursa.indexOf(`export async function ${nume}(`);
  assert.ok(de > -1, `nu mai gasesc \`${nume}\``);
  const dupa = sursa.indexOf("\nexport ", de + 10);
  return sursa.slice(de, dupa === -1 ? sursa.length : dupa);
}

const VALIDARE = corpul(SURSA, "validateDiscount");

test("⚠ felia chiar e a lui `validateDiscount`, si nu imprumuta de la vecin", () => {
  assert.ok(VALIDARE.length > 1500, `felia are doar ${VALIDARE.length} semne`);
  assert.ok(!VALIDARE.includes("createDiscount"), "felia a inghitit si functia urmatoare");
  assert.ok(VALIDARE.includes('.from("discounts")'), "felia nu mai contine citirea codului");
});

/* ── Inima regulii ──────────────────────────────────────────────────────── */

/*
 * Clipa de la care orice raspuns deosebit devine oracol: cautarea codului. Ce e
 * INAINTE de ea nu poate spune nimic despre un cod anume, fiindca nu s-a uitat
 * inca in baza.
 */
const CAUTAREA = VALIDARE.indexOf('.from("discounts")');
const DUPA_CAUTARE = VALIDARE.slice(CAUTAREA);
const INAINTE_DE_CAUTARE = VALIDARE.slice(0, CAUTAREA);

test("⚠⚠ dupa cautarea codului NU exista nicio iesire in afara de `esecCupon`", () => {
  /*
   * Asta e plasa care tine toata sectiunea. Fiecare regula noua — programarea
   * de azi, limita per client, restrangerea pe produse — respinge mai des, si
   * fiecare e ispitita sa-si spuna motivul. Oricare dintre ele ar redeschide
   * enumerarea: ajunge UNA ca sa se poata afla daca un cod exista.
   */
  const iesiri = [...DUPA_CAUTARE.matchAll(/return\s+([^;]+);/g)].map((m) => m[1].trim());
  assert.ok(iesiri.length >= 4, `gasite doar ${iesiri.length} iesiri — s-a schimbat forma functiei?`);

  for (const iesire of iesiri) {
    const eRespingere = iesire.includes("valid: false") || iesire.includes("esecCupon");
    if (!eRespingere) continue;
    assert.match(
      iesire,
      /^esecCupon\(businessId\)$/,
      `iesire de respingere scrisa de mana dupa cautare: \`${iesire}\` — trebuie sa treaca prin esecCupon`,
    );
  }
});

test("⚠⚠ mesajul nu se scrie de mana nicaieri in fisier", () => {
  /*
   * `ESEC_CUPON` sta acum in `src/lib/discounts/mesaj.ts`, fiindca il cer si
   * `placeOrder`, si `placeCartOrder`, si vitrina. Copiat inapoi ca sir, s-ar
   * fi despartit de original la prima schimbare de virgula.
   */
  assert.ok(!SURSA.includes(ESEC_CUPON), "textul mesajului e scris de mana in fisierul de actiuni");
  assert.match(SURSA, /import \{[^}]*ESEC_CUPON[^}]*\} from "@\/lib\/discounts\/mesaj"/);
});

test("⚠ cele doua mesaje de limitare au voie sa fie altele — dar numai INAINTE de cautare", () => {
  /*
   * Nu sunt oracol: se intorc inainte de orice citire, deci raspunsul lor nu
   * depinde in niciun fel de codul cerut. Spun doar ca apelantul a batut prea
   * des. ⚠ Mutate DUPA cautare, ar deveni oracol chiar fara sa-si schimbe
   * textul — de-aia proba se uita la LOCUL lor, nu la cuvintele lor.
   */
  assert.equal(INAINTE_DE_CAUTARE.split("PREA_MULTE_INCERCARI").length - 1, 2);
  assert.ok(!DUPA_CAUTARE.includes("PREA_MULTE_INCERCARI"), "o limitare a ajuns dupa cautare");
  assert.notEqual(PREA_MULTE_INCERCARI, ESEC_CUPON);
});

test("⚠ amandoua franele de incercari sunt inca acolo, si sunt pe APELANT", () => {
  /*
   * Fara ele, cupoanele unui magazin se afla prin incercari, una dupa alta.
   * ⚠ Si trebuie sa ramana cheiate pe IP: o frana pe MAGAZIN pusa inaintea
   * cautarii ar opri plasarea comenzilor tuturor cumparatorilor magazinului —
   * vezi comentariul de la `esecCupon`.
   */
  assert.match(INAINTE_DE_CAUTARE, /rateLimit\(`validateDiscount:\$\{ip\}`/);
  assert.match(INAINTE_DE_CAUTARE, /consumaLimita\(`cupon:ip:\$\{ip\}`/);
  assert.ok(
    !INAINTE_DE_CAUTARE.includes("cupon:biz:"),
    "contorul pe magazin a ajuns o poarta inaintea cautarii",
  );
});

/* ── Potrivirea codului ─────────────────────────────────────────────────── */

test("⚠⚠ codul se cauta cu potrivire EXACTA, niciodata cu `ilike`", () => {
  /*
   * `ilike` trimite sirul mai departe ca SABLON, iar `%` si `_` raman
   * metacaractere. Masurat pe productie: `C%` scotea un cupon de 30%, `B%` unul
   * de 15% — adica oricine lua reducerea magazinului fara sa stie niciun cod.
   */
  assert.match(DUPA_CAUTARE, /\.eq\("code", cod\)/);
  assert.ok(!VALIDARE.includes(".ilike("), "cautarea codului s-a intors la sablon");
  assert.ok(!VALIDARE.includes(".like("), "cautarea codului s-a intors la sablon");
});

test("⚠ si magazinul se pune in cautare, nu doar codul", () => {
  /* Fara `business_id`, un cod ghicit de la alt magazin ar fi mers aici. */
  assert.match(DUPA_CAUTARE, /\.eq\("business_id", businessId\)/);
});

/* ── Poarta programarii, adaugata azi ───────────────────────────────────── */

test("⚠⚠ programarea cade in ACELASI mesaj, nu intr-unul al ei", () => {
  /*
   * Un cod „inca nu a pornit” e cel mai ispititor de explicat dintre toate:
   * pare nevinovat. Dar spune ca un cod EXISTA, iar asta e tot ce-i trebuie
   * cuiva ca sa afle codurile magazinului, unul cate unul.
   */
  assert.match(DUPA_CAUTARE, /data\.starts_at/, "poarta programarii a disparut din validare");
  const poarta = DUPA_CAUTARE.slice(DUPA_CAUTARE.indexOf("data.starts_at"));
  assert.match(
    poarta.slice(0, 200),
    /return esecCupon\(businessId\)/,
    "programarea nu mai cade in esecCupon",
  );
});

/* ── Si al doilea drum public: plasarea comenzii ─────────────────────────── */

test("⚠⚠ si revendicarea refuzata cade in acelasi mesaj, in AMANDOUA copiile", () => {
  /*
   * `placeOrder` si `placeCartOrder` sunt tot `"use server"`, adica tot drumuri
   * publice. Raspundeau cu un text al lor, despre plafonul de utilizari —
   * care de azi e si NEADEVARAT (revendicarea refuza acum si un
   * cod stins, expirat sau inca programat) si DEOSEBIT, adica exact oracolul pe
   * care `ESEC_CUPON` il inchide.
   *
   * ⚠ Se cere DE DOUA ORI fiindca blocul e scris in doua copii. Una reparata si
   * cealalta uitata lasa un checkout intreg descoperit, si nimic n-ar cadea.
   */
  /* ⚠ Se numara APELURILE, nu aparitiile numelui: functia e pomenita si in
     patru comentarii, iar un `split` pe nume ar fi numarat sase. */
  assert.equal(
    COMENZI.split(`admin.rpc("claim_discount_use"`).length - 1, 2,
    "nu mai sunt exact doua revendicari — s-a mutat sau s-a adaugat una",
  );
  assert.ok(
    !COMENZI.includes("Codul a atins limita maxima de utilizari"),
    "mesajul deosebit s-a intors pe drumul de plasare",
  );
  assert.equal(
    COMENZI.split("return { error: ESEC_CUPON };").length - 1, 2,
    "cele doua copii nu raspund amandoua cu mesajul unic",
  );
  assert.match(COMENZI, /import \{ ESEC_CUPON \} from "@\/lib\/discounts\/mesaj"/);
});

test("⚠ motivul adevarat nu se pierde: se scrie in jurnal, nu in raspuns", () => {
  /*
   * Mesajul unic il apara pe comerciant de enumerare, dar nu are voie sa-l lase
   * si pe el orb. Un refuz de revendicare inseamna ca o comanda buna s-a oprit;
   * asta trebuie sa se vada undeva.
   */
  assert.equal(COMENZI.split("claimDiscountUse.refuzat").length - 1, 2);
});
