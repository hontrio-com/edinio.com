import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Piesele consumate de o configuratie chiar se scad din stoc, pe FIECARE cale de comanda?
 *
 * ═══ ⚠ DE CE O PROBA PE SURSA, SI NU UNA DE COMPORTAMENT ═══
 *
 * `placeOrder` si `placeCartOrder` au peste o mie de randuri fiecare, cu baza de date, cotatii de
 * transport, cupoane si oferte in mijloc; `updateOrderDetails` la fel. O proba de comportament ar
 * fi cerut toate astea. Intrebarea de aici e insa mica: ajunge oare consumul in CHIAR lista de
 * scaderi pe care o duce comanda mai departe, adica in drumul de stoc care exista deja?
 *
 * Aceeasi hotarare, si acelasi tipar, ca in `comanda-repretuieste-configuratia.test.ts` — care e
 * probat ca cele doua cai au divergit deja o data, cu verificarea de stoc pe varianta scrisa doar
 * pe una si cu treptele de cantitate onorate doar de cealalta.
 *
 * ═══ CE PAZESTE ═══
 *
 *   1. Fiecare cale de vanzare aduna consumul din verdictele configuratorului.
 *   2. Consumul se contopeste cu `decrements` DUPA desfacerea pachetelor, si NU trece prin
 *      `expandBundleStock`: aceea refuza un produs care nu e `is_active`, iar o balama sau o ora
 *      de manopera se tin stinse dinadins. Trecute pe acolo, fiecare comanda cu o linie
 *      configurata ar fi fost oprita cu un mesaj despre un pachet care nu exista.
 *   3. Lista contopita e chiar cea care se revendica, se scrie pe comanda si se elibereaza —
 *      altfel contopirea ar fi fost un calcul mort si anularea n-ar mai fi dat piesele inapoi.
 *   4. `placeOrder` aduna consumul in DOUA locuri: produsul din formular, si cosul purtat.
 *   5. Nu se cheama `revendicaStocul` cu o a doua lista, si nu se scrie o cheie noua in
 *      `stoc_rezervat`: pentru asta ar fi trebuit schimbate trei functii din baza.
 */

const FISIER = path.resolve(process.cwd(), "src/lib/actions/order.actions.ts");

/** ⚠ Terminatiile se normalizeaza: pe Windows git scrie CRLF, iar potrivirile pe rand cad tacut. */
function sursa(): string {
  return readFileSync(FISIER, "utf8").replace(/\r\n/g, "\n");
}

function corpul(nume: string): string {
  const s = sursa();
  const start = s.indexOf(`export async function ${nume}(`);
  assert.ok(start > 0, `nu am gasit ${nume}`);
  const urmator = s.indexOf("\nexport ", start + 10);
  const corp = s.slice(start, urmator > 0 ? urmator : s.length);
  // ⚠ Garda de marime: un cititor rupt ar fi intors cateva randuri, si toate potrivirile de mai
  // jos ar fi cazut pe gol — adica un zero fals care arata exact ca un zero adevarat.
  assert.ok(corp.length > 5000, `am citit doar ${corp.length} caractere din ${nume}`);
  return corp;
}

/**
 * Fiecare apel la `nume(...)` din text, cu tot cu argumente.
 *
 * ⚠ PARANTEZELE SE NUMARA, nu se cauta prima inchisa. Prima forma era o expresie regulata
 * `nume\\([\\s\\S]{0,80}?\\)`, si ea nu putea ajunge la paranteza unui apel scris pe patru randuri:
 * nu potrivea NIMIC, deci bucla de dupa ea nu se executa niciodata si proba trecea verde orice
 * s-ar fi scris inauntru. Un paznic care nu potriveste nimic arata exact ca unul multumit.
 */
function apelurile(text: string, nume: string): string[] {
  const out: string[] = [];
  let i = 0;
  for (;;) {
    i = text.indexOf(nume + "(", i);
    if (i < 0) return out;
    const start = i + nume.length;
    let adanc = 0;
    let k = start;
    for (; k < text.length; k++) {
      if (text[k] === "(") adanc++;
      else if (text[k] === ")" && --adanc === 0) { k++; break; }
    }
    assert.ok(adanc === 0, `apel neinchis la ${nume}`);
    out.push(text.slice(i, k));
    i = k;
  }
}

/** Apelul, cu apelurile dinauntrul argumentelor scoase: ramane doar ce i se da IN MANA. */
function faraApeluriInauntru(apel: string): string {
  const desch = apel.indexOf("(");
  let adanc = 0;
  let out = apel.slice(0, desch + 1);
  for (let k = desch + 1; k < apel.length; k++) {
    const c = apel[k];
    if (c === "(") adanc++;
    else if (c === ")") { if (adanc === 0) out += c; else adanc--; }
    else if (adanc === 0) out += c;
  }
  return out;
}

const CAI_DE_VANZARE = ["placeOrder", "placeCartOrder"];

test("⚠ probele stiu sa citeasca fisierul", () => {
  assert.ok(sursa().length > 100_000, "fisierul de actiuni se citeste intreg");
  for (const cale of CAI_DE_VANZARE) corpul(cale);
  corpul("updateOrderDetails");
});

for (const cale of CAI_DE_VANZARE) {
  test(`${cale}: consumul pieselor se aduna din verdictele configuratorului`, () => {
    const corp = corpul(cale);
    assert.match(corp, /const consumComponente: \{ product_id: string; quantity: number \}\[\] = \[\];/,
      `${cale} nu aduna nicio piesa`);
    assert.match(corp, /decrementeleComponentelor\(/,
      `${cale} nu cheama decrementeleComponentelor`);
  });

  test(`⚠ ${cale}: piesele se contopesc in lista care CHIAR scade stocul`, () => {
    /*
     * ⚠ Si NU prin `expandBundleStock`: aceea refuza un produs care nu e `is_active`, iar o
     * balama sau o ora de manopera se tin STINSE dinadins. Trecute pe acolo, fiecare comanda cu
     * o linie configurata ar fi fost oprita cu „Un produs din pachet nu mai este disponibil”.
     */
    const corp = corpul(cale);
    assert.match(corp, /const decremente = contopesteConsumul\(stockExp\.decrements, consumComponente\);/,
      `${cale}: consumul nu se contopeste cu scaderile comenzii`);

    const i = corp.indexOf("expandBundleStock(");
    assert.ok(i > 0, `${cale} nu cheama expandBundleStock`);
    const argumente = corp.slice(i, corp.indexOf("]);", i));
    assert.equal(argumente.includes("consumComponente"), false,
      `${cale}: piesele NU au voie sa treaca prin garda is_active a lui expandBundleStock`);
  });

  test(`⚠ ${cale}: lista contopita e cea care se revendica, se scrie si se elibereaza`, () => {
    /*
     * ⚠ Contopita si nefolosita, ar fi fost un calcul mort: stocul s-ar fi scazut mai departe
     * fara piese, iar `stoc_rezervat` n-ar fi stiut de ele — deci nici anularea nu le-ar fi dat
     * inapoi. Se cere deci ca `stockExp.decrements` sa NU mai apara dupa contopire.
     */
    const corp = corpul(cale);
    // ⚠ DUPA instructiunea de contopire, nu de la ea: chiar ea contine `stockExp.decrements`,
    // deci pornita de la ea potrivirea de mai jos ar fi cazut mereu, oricat de bun ar fi codul.
    const ANCORA = "const decremente = contopesteConsumul(stockExp.decrements, consumComponente);";
    const iAncora = corp.indexOf(ANCORA);
    assert.ok(iAncora > 0, `${cale}: nu gasesc instructiunea de contopire`);
    const dupa = corp.slice(iAncora + ANCORA.length);

    /*
     * ⚠ SE CER CELE TREI CONSUMATOARE PE NUME, nu absenta identificatorului.
     *
     * Prima forma cerea ca `stockExp.decrements` sa nu mai APARA deloc dupa contopire. Simplu, dar
     * prea larg: lista de dinainte de contopire e chiar raspunsul la o alta intrebare, una care
     * n-are legatura cu stocul — „care dintre produsele astea sunt linii adevarate din cosul
     * omului, si care sunt piese consumate de o configuratie". Pe lista CONTOPITA intrebarea aia
     * n-are raspuns: acolo piesele sunt deja amestecate cu marfa, deci fiecare balama ar arata ca
     * o linie de cos si mesajul de refuz s-ar intoarce la cel gresit.
     *
     * Se cere deci exact ce trebuia cerut de la inceput: cine SCADE, cine SCRIE si cine DA INAPOI
     * stoc lucreaza pe lista contopita. Restul are voie sa se uite la ce vrea.
     */
    for (const consumator of ["revendicaStocul", "stocRezervat", "elibereazaStocul"]) {
      const apeluri = apelurile(dupa, consumator);
      assert.ok(apeluri.length > 0, `${cale}: nu gasesc niciun apel la ${consumator}`);
      for (const a of apeluri) {
        /*
         * ⚠ SE UITA LA CE PRIMESTE CONSUMATORUL IN MANA, nu la tot ce scrie in apel.
         *
         * Un argument poate fi el insusi un apel, si acela are voie sa se uite la lista de
         * dinainte de contopire: `numelePieselor` chiar asta si intreaba — care dintre produse
         * sunt linii adevarate din cos, si care sunt piese. Pe lista contopita intrebarea aia
         * n-are raspuns, fiindca acolo piesele sunt deja amestecate cu marfa.
         */
        assert.equal(faraApeluriInauntru(a).includes("stockExp.decrements"), false,
          `${cale}: ${consumator} primeste lista de dinainte de contopire: ${a}`);
      }
    }

    // ⚠ `\s*` peste tot: apelul poate sta pe mai multe randuri, si o proba care cere un singur
    // rand cade la prima reformatare — adica exact cand nimeni nu se uita la ce apara.
    assert.match(dupa, /revendicaStocul\(\s*admin,\s*decremente,/, `${cale}: nu se revendica lista contopita`);
    assert.match(dupa, /stocRezervat\(\s*decremente,/, `${cale}: nu se scrie lista contopita pe comanda`);
    assert.match(dupa, /elibereazaStocul\(\s*admin,\s*decremente,/, `${cale}: nu se elibereaza lista contopita`);
  });

  test(`⚠ ${cale}: consumul se inmulteste cu cantitatea liniei`, () => {
    /*
     * ⚠ `decrementeleComponentelor(x.consum)` fara al doilea argument compileaza si trece toate
     * probele de tipuri — dar trei usi ar fi scazut balamalele uneia singure. Se cere aici, unde
     * cantitatea e la indemana, ca al doilea argument sa fie CHIAR trecut.
     */
    const corp = corpul(cale);
    const apeluri = corp.match(/decrementeleComponentelor\([^)]*\)/g) ?? [];
    assert.ok(apeluri.length > 0, `${cale} nu cheama decrementeleComponentelor`);
    for (const a of apeluri) {
      /*
       * ⚠ Se cere o CANTITATE ADEVARATA, nu orice al doilea argument.
       *
       * Prima forma cerea doar `, <ceva>)`, iar `\w` prinde si cifrele: `decrementeleComponentelor(
       * consum, 1)` trecea verde. Zece usi comandate, piese rezervate pentru una — iar comerciantul
       * afla din stocul care nu se potriveste, peste saptamani.
       */
      assert.match(
        a,
        /,\s*[A-Za-z_$][\w$]*(\.\w+|\[[^\]]+\])*\)/,
        `apel fara cantitate adevarata in ${cale}: ${a}`,
      );
      assert.ok(
        !/,\s*\d+\s*\)/.test(a),
        `cantitate SCRISA DE MANA in ${cale}: ${a} — se scad piesele unei singure bucati`,
      );
    }
  });
}

test("⚠ placeOrder aduna piesele in DOUA locuri: formularul SI cosul purtat", () => {
  /*
   * Sunt scrise separat, la o suta de randuri distanta. O proba care cere doar „exista undeva un
   * `decrementeleComponentelor`" trece si dupa ce a doua adunare a disparut — iar un cos cu doua
   * usi configurate ar fi scazut balamalele uneia singure, tacut.
   */
  const corp = corpul("placeOrder");
  const apeluri = corp.match(/consumComponente\.push\(/g) ?? [];
  assert.equal(apeluri.length, 2, "placeOrder trebuie sa adune si produsul din formular, si cosul");
});

test("⚠ nicio cale nu inventeaza o a doua scadere de stoc", () => {
  /*
   * ⚠ Ce ar fi costat: `orders.stoc_rezervat` are exact doua chei, iar TREI functii din baza o
   * REscriu cu `jsonb_build_object('produse', …, 'variante', …)`. O cheie `componente` ar fi fost
   * stearsa tacut la prima editare de comanda sau la prima potrivire de marketplace, si la anulare
   * piesele nu s-ar mai fi intors niciodata pe raft.
   *
   * Tot consumul ajunge deci in `decrements`, adica sub cheia `produse` — pe care baza o stie
   * deja, si pe care cele trei functii o rescriu corect.
   */
  const s = sursa();
  assert.equal(s.includes("componente:"), false, "nicio cheie `componente` in stoc_rezervat");
  const rpc = s.match(/"revendica_stoc_complet"/g) ?? [];
  assert.equal(rpc.length, 1, "o singura revendicare de stoc in tot fisierul");
  const elib = s.match(/"elibereaza_stoc_complet"/g) ?? [];
  assert.equal(elib.length, 1, "o singura eliberare de stoc in tot fisierul");
});

test("⚠ updateOrderDetails spune de ce NU aduna piese", () => {
  /*
   * A treia cale nu consuma piese, si nu din uitare: `edit-pricing.ts` refuza sa ADAUGE din panou
   * un produs cu configurator, iar o linie care POARTA o configuratie nu e `eLinieSimpla`, deci
   * cantitatea ei nu se poate mari. Deci `plan.adaugate` nu poate contine o linie configurata.
   *
   * Proba tine lipita EXPLICATIA de cod. Cine scoate vreodata una dintre cele doua garzi din
   * `edit-pricing.ts` trebuie sa dea si peste randurile astea, nu sa descopere peste luni ca
   * bucatile pleaca din depozit fara ca vreo comanda s-o arate.
   */
  const corp = corpul("updateOrderDetails");
  assert.match(corp, /PIESELE UNUI CONFIGURATOR NU INTRA AICI/,
    "lipseste nota care leaga updateOrderDetails de garzile din edit-pricing");
});

test("⚠ garzile din edit-pricing pe care se sprijina updateOrderDetails chiar exista", () => {
  /*
   * ⚠ Perechea obligatorie a probei de mai sus: un comentariu care spune „ma bizui pe alta garda"
   * nu apara nimic daca garda aia a fost stearsa intre timp. Aici se verifica CHIAR ea.
   */
  const editare = readFileSync(
    path.resolve(process.cwd(), "src/lib/orders/edit-pricing.ts"), "utf8",
  ).replace(/\r\n/g, "\n");
  assert.match(editare, /if \(cat\.areConfigurator\) \{\s*\n\s*return \{ error:/,
    "un produs configurabil trebuie sa NU poata fi adaugat din panou");
  assert.match(editare, /: !simpla \? MOTIV_LINIE_SPECIALA/,
    "o linie care poarta o configuratie trebuie sa NU-si poata mari cantitatea");
});

test("⚠ refuzul de stoc stie care produse sunt PIESE, pe amandoua caile", () => {
  /*
   * ⚠ CE SE PIERDE FARA LISTA. `revendica_stoc_complet` refuza cu `products.name`, iar pentru
   * o balama numele ala e al unui rand de stoc tinut STINS dinadins. Cumparatorul primea
   * „«BLM-110-INT» tocmai s-a epuizat. Scoate-l din cos si incearca din nou.” — despre ceva ce
   * n-are in cos, n-are cum sa scoata, si de care n-a auzit; plus numele intern al unui produs
   * pe care comerciantul il tine ascuns.
   *
   * ⚠ DE CE O PROBA PE SURSA, si nu una pe `mesajRefuzStoc`: acolo regula e deja probata, si
   * trece verde si cand nimeni nu-i mai DA lista. Legatura e chiar ce se rupe tacut — un
   * argument optional scos dintr-un apel nu supara nici tsc, nici eslint.
   */
  for (const cale of ["placeOrder", "placeCartOrder"] as const) {
    const corp = corpul(cale);
    assert.match(
      corp,
      /revendicaStocul\([\s\S]{0,200}numelePieselor\(stockExp\.decrements, bucatiConsumate\)/,
      `${cale} revendica stocul fara sa spuna care produse sunt piese`,
    );
    const stranse = corp.match(/bucatiConsumate\.push\(/g) ?? [];
    assert.ok(stranse.length >= 1, `${cale} nu strange nicio bucata, deci lista e mereu goala`);
  }

  /*
   * ⚠ `placeOrder` are DOUA locuri de strans, ca si `consumComponente`: produsul din formular
   * si liniile purtate din cos. Cu unul singur, o comanda cu doua usi configurate ar fi dat
   * mesajul bun pentru una si pe cel gresit pentru cealalta.
   */
  const stranseP = corpul("placeOrder").match(/bucatiConsumate\.push\(/g) ?? [];
  assert.equal(stranseP.length, 2, `placeOrder strange bucatile din ${stranseP.length} locuri, nu din 2`);
});
