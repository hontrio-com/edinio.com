import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { clientDeMarketplace } from "./client-de-marketplace";

/* ══════════════════════════════════════════════════════════════════════════
   CUMPARATORUL UNUI MARKETPLACE NU E CLIENTUL COMERCIANTULUI
   ══════════════════════════════════════════════════════════════════════════

   ⚠ SCURGEREA ERA REALA, si nu prin calea de ingest, care e curata: `updateOrder` chema
   `maybeMarkBrevoOrderPaid` si `maybeMarkMailchimpOrderPaid` de fiecare data cand comerciantul
   trecea o comanda pe „platit", fara sa se uite la origine. Deci prima apasare pe butonul de
   plata trimitea emailul, si comanda, intr-o lista de marketing.

   Emailul poate fi chiar un ALIAS al platformei, dat anume pentru comunicarea despre acea
   comanda. Iar problema nu e a Pepitei: atinge eMAG, Trendyol, About You si OLX la fel.
*/

test("orice comanda cu marketplace poarta un client care nu e al comerciantului", () => {
  for (const m of ["pepita", "emag", "trendyol", "aboutyou", "olx", "ceva-nou-de-maine"]) {
    assert.equal(clientDeMarketplace({ marketplace: m }), true, m);
  }
});

test("⚠ regula nu e o LISTA de nume, ci prezenta campului", () => {
  /*
   * O lista ar fi ramas in urma la a sasea integrare, si tocmai cea noua ar fi fost nepazita.
   * Proba de mai sus contine dinadins un nume care nu exista azi.
   */
  const sursa = readFileSync("src/lib/orders/client-de-marketplace.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
  for (const nume of ["pepita", "emag", "trendyol", "aboutyou", "olx"]) {
    assert.ok(!sursa.includes(`"${nume}"`), `regula numeste „${nume}”, deci e o lista`);
  }
});

test("comanda din magazin NU e a unui marketplace", () => {
  for (const s of [null, undefined, {}, { marketplace: "" }, { marketplace: "   " },
                   { utm_source: "facebook" }, { marketplace: 42 }, { marketplace: null }, "nu e obiect"]) {
    assert.equal(clientDeMarketplace(s), false, JSON.stringify(s));
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   POARTA CHIAR E PE DRUMURI
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Probele de mai jos SCANEAZA SURSA, si stiu ce pot: spun ca poarta e chemata acolo unde
   se citeste comanda, nu ca ea se poarta bine. Purtarea e probata mai sus, pe valori.

   Ce apara ele e altceva, si nu se poate afla altfel: ca poarta n-a fost stearsa din vreunul
   dintre cele trei module de marketing la o reparatie viitoare.
*/

/*
 * ⚠ CITITA DE PE DISC, nu scrisa de mana: un al patrulea furnizor de email adaugat maine ca
 * `src/lib/mailerlite-sync.ts` intra singur in proba. O lista scrisa aici ar fi ramas in urma
 * exact la integrarea cea noua, adica la singura nepazita.
 */
const MODULE = readdirSync("src/lib")
  .filter((n) => n.endsWith("-sync.ts"))
  .map((n) => `src/lib/${n}`);

test("⚠ toate cele trei module de marketing intreaba de origine", () => {
  for (const f of MODULE) {
    const s = readFileSync(f, "utf8");
    assert.match(s, /clientDeMarketplace\(/, `${f} nu cheama poarta`);
  }
});

test("⚠ cele doua functii care isi citesc singure comanda CER `order_source`", () => {
  /*
   * Ce nu se cere in `select` vine `undefined`, iar poarta ar fi citit `undefined` si ar fi
   * tacut exact pe comenzile pentru care exista. A patra oara in aceeasi zi cand tiparul asta
   * era gata sa treaca.
   */
  for (const f of ["src/lib/brevo-sync.ts", "src/lib/mailchimp-sync.ts"]) {
    const s = readFileSync(f, "utf8");
    /*
     * ⚠ BUCATA SE TAIE PE ACOLADE, nu pe un numar de caractere. Fereastra de 900 avea 68 de
     * caractere de rezerva la Mailchimp: doua randuri de comentariu in plus si proba ar fi
     * cazut pe cod corect. Iar in celalalt sens, o alta functie scurta strecurata intre `select`
     * si poarta ar fi tinut-o verde chiar cu poarta stearsa.
     */
    const i = s.indexOf("OrderPaid");
    assert.ok(i > 0, `${f}: nu s-a gasit functia de marcare`);
    const inceput = s.lastIndexOf("export async function", i);
    let adanc = 0;
    let sfarsit = s.length;
    for (let k = s.indexOf("{", i); k < s.length; k++) {
      if (s[k] === "{") adanc++;
      else if (s[k] === "}") { adanc--; if (adanc === 0) { sfarsit = k; break; } }
    }
    const bucata = s.slice(inceput, sfarsit);
    assert.match(bucata, /\.select\("[^"]*order_source[^"]*"\)/, `${f}: citirea nu cere originea`);
    assert.match(bucata, /clientDeMarketplace\(/, `${f}: poarta lipseste din functie`);
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   A DOUA USA, MAI LARGA DECAT CEA DINTAI: „SINCRONIZEAZA CLIENTII EXISTENTI"
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Butonul din panou ia TOT istoricul de comenzi al magazinului si il duce in lista de
   marketing. O singura apasare ducea acolo fiecare cumparator Pepita, eMAG, Trendyol si
   About You. La Klaviyo era mai rau: `subscribeProfiles`, adica ABONARE.

   ⚠ CE APARA PLASA DE MAI JOS, SI CE NU. Ea citeste sursa, deci spune ca poarta e chemata
   si ca originea e ceruta in `select`. NU spune ca poarta se poarta bine: purtarea e probata
   pe valori, sus. Si nu poate ghici un furnizor nou care nu foloseste niciunul din verbele
   de mai jos; atunci proba trece, si asta se stie.
*/

const VERBE_DE_MARKETING = ["batchUpsert", "importContacts", "subscribeProfiles"];

const ACTIUNI_CU_MARKETING = readdirSync("src/lib/actions")
  .filter((n) => n.endsWith(".actions.ts"))
  .map((n) => `src/lib/actions/${n}`)
  .filter((f) => {
    const s = readFileSync(f, "utf8");
    return VERBE_DE_MARKETING.some((v) => s.includes(`${v}(`));
  });

test("⚠ plasa chiar are pe cine cadea", () => {
  // Fara randul asta, o redenumire a verbelor ar goli lista si toate probele de mai jos ar
  // trece pe o multime vida, verzi si nefolositoare.
  assert.ok(ACTIUNI_CU_MARKETING.length >= 3, `gasite doar ${ACTIUNI_CU_MARKETING.length} actiuni cu marketing`);
  assert.ok(MODULE.length >= 3, `gasite doar ${MODULE.length} module de marketing`);
});

test("⚠ orice actiune care duce contacte la un furnizor de marketing trece prin poarta", () => {
  for (const f of ACTIUNI_CU_MARKETING) {
    const s = readFileSync(f, "utf8");
    assert.match(s, /clientDeMarketplace\(/, `${f}: duce contacte in marketing fara poarta`);
    assert.match(s, /\.is\("order_source->>marketplace", null\)/, `${f}: nu filtreaza marketplace-urile in SQL`);
    assert.match(s, /\.select\("[^"]*order_source[^"]*"\)/, `${f}: citirea nu cere originea, deci poarta ar citi undefined`);
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   A TREIA USA: PAGINA DE CONFIRMARE
   ══════════════════════════════════════════════════════════════════════════

   Pagina citeste ORICE comanda a magazinului dupa id, cu clientul admin si fara sesiune,
   iar la vanzare confirmata trimite numele, emailul si telefonul in potrivirea avansata
   Meta si TikTok. Pentru o comanda de marketplace `vanzareaEConfirmata` e adevarat, fiindca
   raspunde „da" pentru orice metoda de plata din afara listei de plati online.

   ⚠ Propul trebuie sa fie `undefined`, nu un obiect cu campuri goale: componenta face
   `customer && {...}`, iar un obiect e mereu adevarat.
*/

const CONFIRMARE = "src/app/(public)/[slug]/confirm/page.tsx";

test("⚠ pagina de confirmare nu da datele omului pixelilor, pe o comanda de marketplace", () => {
  const s = readFileSync(CONFIRMARE, "utf8");
  assert.match(s, /\.select\("[^"]*order_source[^"]*"\)/, "citirea comenzii nu cere originea");
  assert.match(s, /customer=\{clientDeMarketplace\([^)]*\) \? undefined :/, "propul `customer` nu e trecut prin poarta, sau nu da `undefined`");
});

/* ══════════════════════════════════════════════════════════════════════════
   MARCAREA „PLATIT" NU MAI ATARNA DE TELEFON
   ══════════════════════════════════════════════════════════════════════════

   Statea inauntrul lui `if (order.customer_phone && …)`, blocul SMS-urilor, deci pe o
   comanda fara telefon nu pleca niciodata, tacut. Nu e o problema de marketplace, dar e in
   chiar randurile astea, si o reparatie viitoare o poate pune la loc.
*/

test("marcarea platit nu mai sta in blocul SMS-urilor", () => {
  /*
   * ⚠ PE LINII, nu pe indici de caractere: un fisier cu CRLF ar fi rupt orice cautare de
   * „salt de rand plus doua spatii", si proba ar fi cazut fara sa fie nimic stricat.
   */
  const linii = readFileSync("src/lib/actions/order.actions.ts", "utf8").split(/\r?\n/);
  const start = linii.findIndex((l) => l.includes("if (order.customer_phone &&"));
  assert.ok(start >= 0, "nu s-a gasit blocul SMS-urilor");
  const sfarsit = linii.findIndex((l, k) => k > start && l === "  }");
  assert.ok(sfarsit > start, "nu s-a gasit sfarsitul blocului SMS-urilor");
  const bloc = linii.slice(start, sfarsit).join(" ");
  assert.ok(!bloc.includes("maybeMark"), "marcarea a intrat inapoi sub conditia telefonului");
  // Si chiar exista, undeva mai jos: altfel proba de sus ar trece si pe un fisier din care
  // marcarea a disparut cu totul.
  assert.ok(linii.slice(sfarsit).some((l) => l.includes("maybeMarkMailchimpOrderPaid(orderId)")),
    "marcarea nu se mai cheama deloc dupa blocul SMS-urilor");
});

/* ══════════════════════════════════════════════════════════════════════════
   CE ARE VOIE SA INTRE IN `order_source` DE LA CUMPARATOR
   ══════════════════════════════════════════════════════════════════════════

   ⚠ `order_source` a incetat sa fie doar atribuire de marketing: pe el atarna si BANII.
   `rambursDeIncasat` intoarce zero cand vede `incaseaza_marketplace: true` sau o moneda care
   nu e RON, iar poarta de mai sus se uita la `marketplace`. Iar `data.source` vine DIN BROWSER,
   prin doua actiuni publice. Cu raspandirea obiectului (`{ ...source }`), un cumparator putea
   trimite `{ "incaseaza_marketplace": true }` cu o comanda cu plata la livrare de 850 de lei:
   coletul ar fi plecat cu ramburs 0,00, iar generarea in MASA de AWB n-are camp de corectat.
*/

test("⚠ `order_source` nu se mai scrie cu ce trimite browserul", () => {
  const s = readFileSync("src/lib/actions/order.actions.ts", "utf8");
  assert.ok(!/\.\.\.\(source \?\? \{\}\)/.test(s),
    "obiectul din browser se raspandeste in `order_source`: orice cheie trece");
  assert.match(s, /CHEI_ATRIBUIRE/, "lista alba a disparut");
  /* Cheile care hotarasc bani nu au voie sa fie in lista alba. */
  const i = s.indexOf("const CHEI_ATRIBUIRE");
  assert.ok(i > 0);
  const lista = s.slice(i, s.indexOf("]", i));
  for (const cheie of ["incaseaza_marketplace", "currency", "marketplace", "livrare_pepita", "vat_mixt"]) {
    assert.ok(!lista.includes(cheie), `„${cheie}" hotaraste bani si nu se scrie de la cumparator`);
  }
});
