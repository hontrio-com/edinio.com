import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * PESTE PLAFONUL DE RAMBURS, FAN RAMANE IN LISTA. SE SPUNE, NU SE ASCUNDE.
 *
 * ═══ ⚠ CE S-A INCHIS ═══
 *
 * `info.cod` are maximum 10.000 lei la FAN, iar emiterea refuza peste. Plafonul a fost
 * pus si la cotare, ca omul sa afle inainte de a comanda. Dar a fost pus ca POARTA pe
 * optiune, si atunci inchidea AMANDOUA ramurile deodata:
 *
 *     if (fanPosibil && useAutoPrice) { ... }          // fanPosibil = cod <= 10.000
 *     else if (!hasApi || fanPosibil) { ... }
 *
 * Cu integrarea pornita si rambursul peste plafon, niciuna nu se executa, deci nicio
 * optiune FAN nu se mai adauga. Pe un magazin care are FAN ca singura zona activa,
 * `options` iese GOL, `getShippingOptions` intoarce `[]`, `CourierSelector` intoarce
 * `null`, si sectiunea de livrare DISPARE din pagina, fara niciun mesaj. Cumparatorul
 * nu mai poate trimite comanda, si nu are de unde sa afle de ce.
 *
 * ⚠ Masurat in productie la data reparatiei: toate cele TREI magazine cu FAN au zona
 * `fan-courier` activa SI rambursul ca SINGURA metoda de plata. De aceea leacul nu e
 * nici filtrarea metodelor de plata: le-ar fi lasat cu zero, adica aceeasi fundatura
 * mutata cu un pas mai incolo.
 *
 * ═══ ⚠ DE CE PROBA CITESTE SURSA ═══
 *
 * Regula nu e o functie, e o CABLARE: „nicio conditie de pe drumul optiunilor nu are
 * voie sa atarne de plafon". Ramura FAN din `getShippingOptions` nu se poate rula fara
 * sesiune, baza si furnizor, iar defectul statea chiar in conditii. Acelasi tipar, si
 * din acelasi motiv, ca proba vecina despre TVA-ul tarifului FAN.
 *
 * Mutantul se pune pe COD, nu pe proba: punand `codAmount <= FAN_MAX_COD` inapoi in
 * oricare din cele doua conditii, probele de mai jos cad.
 */

const RAD = process.cwd();

/** ⚠ Comentariile se taie: fisierele isi explica pe larg propriile reguli. */
function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const COTARE = "src/lib/actions/shipping.actions.ts";
const SELECTOR = "src/components/ministore/CourierSelector.tsx";

/** Doar ramura FAN, taiata la urmatorul curier. */
function ramuraFan(): string {
  const s = sursa(COTARE);
  const de_la = s.indexOf('courierId === "fan-courier"');
  assert.ok(de_la > 0, "nu mai exista o ramura `fan-courier` in cotare: proba n-are pe ce cadea");
  const rest = s.slice(de_la);
  const pana = rest.indexOf("} else if (courierId ===");
  assert.ok(pana > 0, "ramura FAN nu se mai incheie cu alt curier: taierea ar lua tot fisierul");
  return rest.slice(0, pana);
}

test("⚠ optiunea la locker nu mai atarna de plafonul de ramburs", () => {
  const r = ramuraFan();
  /*
   * ⚠ SE CERE REGULA, NU LINIA. Prima forma a probei cerea literal
   * `const fanboxAllowed = hasApi && weight <= 30;`, si a cazut in ziua in care aceeasi
   * conditie a primit, legitim, verificarea de gabarit. Aia era cablare: pinuia textul,
   * nu proprietatea. Ce conteaza e ca declaratia EXISTA si ca plafonul de ramburs nu e
   * in ea.
   */
  assert.match(r, /const fanboxAllowed =/,
    "nu mai exista `fanboxAllowed`: afirmatia de mai jos n-ar mai avea pe ce cadea");
  assert.doesNotMatch(r, /fanboxAllowed =[^;]*FAN_MAX_COD/,
    "plafonul de ramburs a intrat inapoi in `fanboxAllowed`, deci peste 10.000 lockerul dispare");
});

test("⚠ FANbox se ofera doar pentru un colet care chiar incape", () => {
  /*
   * Urmare directa a dimensiunilor devenite obligatorii: comerciantul isi seteaza
   * „coletul obisnuit", iar daca acela e 60x40x40, cotarea impingea mai departe optiunea
   * la locker (trecea doar de greutate), clientul o alegea si PLATEA, si abia emiterea o
   * refuza. Comparatia e aceeasi ca la emitere, chemata din acelasi loc.
   */
  const r = ramuraFan();
  assert.match(r, /incapeInFanbox\(coletul\)/,
    "cotarea nu mai compara coletul cu compartimentul FANbox");
  assert.match(r, /weight <= FANBOX_MAX_WEIGHT_KG/,
    "limita de greutate FANbox a redevenit o cifra scrisa de mana in cotare");
});

test("⚠ ramura cu cotare automata nu mai e pazita de plafon", () => {
  const r = ramuraFan();
  assert.match(r, /if \(hasApi && useAutoPrice\) \{/,
    "conditia cotarii automate nu mai e cea de dinaintea plafonului");
  assert.doesNotMatch(r, /if \([a-zA-Z]*[Pp]osibil && useAutoPrice\)/,
    "cotarea automata a fost pusa din nou in spatele unei porti de plafon");
});

test("⚠ rezerva pe tariful zonei e NECONDITIONATA", () => {
  const r = ramuraFan();
  assert.match(r, /\} else \{/,
    "rezerva pe pretul zonei si-a recapatat o conditie: peste plafon nu mai ramane nicio optiune");
  assert.doesNotMatch(r, /\} else if \(!hasApi \|\|/,
    "s-a intors exact conditia care inchidea amandoua ramurile deodata");
});

test("⚠ peste plafon optiunea pleaca MARCATA, nu scoasa din lista", () => {
  const s = sursa(COTARE);
  /*
   * Marcarea sta dupa asteptarea promisiunilor dinadins: patru din cele sase optiuni FAN se
   * imping din `.then()`/`.catch()`, deci inca nu exista in lista cand ramura se incheie.
   *
   * ⚠ ANCORA SE CERE GASITA, ALTFEL PROBA MINTE (13.09.2026). Forma dintai taia cu
   * `s.slice(s.indexOf("await Promise.all(promises);"))`. In ziua in care asteptarea a primit
   * un plafon de timp si a devenit `Promise.race([Promise.all(promises), plafon])`, `indexOf`
   * a intors −1, iar `slice(-1)` da ULTIMUL CARACTER din fisier: un „\n" pe care nicio
   * afirmatie nu-l potriveste. Proba a cazut cu mesajul GRESIT, aratand spre marcare cand
   * stricata era taierea. De aia ancora se verifica intai si de aia e cea larga: se cere SA SE
   * astepte promisiunile, nu felul in care se asteapta.
   */
  const ancora = s.indexOf("Promise.all(promises)");
  assert.ok(ancora > 0,
    "nu se mai asteapta promisiunile cotarii: taierea de mai jos n-ar mai insemna nimic");
  const dupaAsteptare = s.slice(ancora);
  assert.match(dupaAsteptare, /if \(fanRambursPestePlafon\) \{/,
    "optiunile FAN nu se mai marcheaza dupa ce se aduna si cele cotate asincron");
  assert.match(dupaAsteptare, /o\.rambursIndisponibil = true/);
  assert.match(ramuraFan(), /fanRambursPestePlafon = hasApi && codAmount > FAN_MAX_COD;/,
    "steagul nu se mai calculeaza din plafon");
});

test("⚠ si optiunile puse de PLAFONUL DE TIMP trec tot prin marcare", () => {
  /*
   * ⚠ OBLIGATIE NOUA, NASCUTA DIN PLAFONUL DE 25s (13.09.2026).
   *
   * La expirare, curierii care n-au apucat sa raspunda intra in lista cu tariful fix al
   * zonei, FAN inclusiv. Daca marcarea ar sta INAINTEA acelei bucle, optiunea FAN pusa pe
   * tarif fix ar pleca NEMARCATA peste plafonul de ramburs: cumparatorul ar alege rambursul,
   * si abia emiterea l-ar refuza. Adica exact defectul inchis mai sus, intors pe alta usa.
   *
   * Ordinea de azi e cea buna. Proba o tine acolo, fiindca nimic din cod nu o impune:
   * amandoua blocurile sunt instructiuni de sine statatoare, si mutarea uneia peste cealalta
   * ar fi trecut tacut.
   */
  const s = sursa(COTARE);
  const umplere = s.indexOf("if (cotatieExpirata) {");
  const marcare = s.indexOf("if (fanRambursPestePlafon) {");
  assert.ok(umplere > 0,
    "nu mai exista umplerea pe tarif fix la expirarea plafonului de timp: reciteste de ce exista regula");
  assert.ok(marcare > 0, "nu mai exista marcarea optiunilor FAN peste plafonul de ramburs");
  assert.ok(marcare > umplere,
    "marcarea a ajuns INAINTEA umplerii pe tarif fix: optiunea FAN pusa la expirare pleaca nemarcata");
});

test("⚠ si ecranul chiar spune de ce, altfel marcajul nu ajunge la nimeni", () => {
  const s = sursa(SELECTOR);
  assert.match(s, /opt\.rambursIndisponibil &&/,
    "selectorul nu mai arata motivul: marcajul ar calatori degeaba pana in browser");
  assert.equal((s.match(/opt\.rambursIndisponibil &&/g) ?? []).length, 2,
    "avertismentul trebuie sa fie pe AMANDOUA felurile de optiuni, si la domiciliu si la locker");
});

test("⚠ cele doua guri ale capcanei sunt inca acolo, deci regula ramane necesara", () => {
  /*
   * Proba asta nu apara reparatia, ci TEMEIUL ei. Daca vreodata lista goala ar inceta sa
   * ascunda sectiunea de livrare, regula de mai sus s-ar putea rediscuta. Cat timp cele
   * doua randuri exista, o lista goala inseamna un checkout fara nicio metoda.
   */
  assert.match(sursa(COTARE), /if \(options\.length === 0\) return \[\];/,
    "cotarea nu mai intoarce lista goala: reciteste de ce exista regula de mai sus");
  assert.match(sursa(SELECTOR), /if \(options\.length === 0\) return null;/,
    "selectorul nu mai ascunde sectiunea pe lista goala: reciteste de ce exista regula");
});
