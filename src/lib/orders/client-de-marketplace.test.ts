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

/**
 * Functia de nivel zero care contine pozitia `i`: de la randul ei de inceput (`async function`
 * sau `export async function`, la coloana zero) pana la urmatoarea declaratie de nivel zero.
 *
 * ⚠ PE RANDURI DE NIVEL ZERO, nu pe acolade: o functie care intoarce `Promise<{ … } | null>`
 * are prima acolada in TIPUL intors, iar potrivirea pe acolade ar fi taiat bucata acolo.
 */
function functiaDinJurul(s: string, i: number): string {
  const linii = s.split(/\r?\n/);
  let poz = 0;
  let rand = 0;
  for (; rand < linii.length; rand++) {
    if (poz + linii[rand].length >= i) break;
    poz += linii[rand].length + 1;
  }
  let start = rand;
  while (start > 0 && !/^(export )?async function /.test(linii[start])) start--;
  let stop = start + 1;
  while (stop < linii.length && !/^(export |async function |function |type |const |interface )/.test(linii[stop])) stop++;
  return linii.slice(start, stop).join("\n");
}

test("⚠ orice functie care isi citeste singura comanda CERE `order_source` si trece prin poarta", () => {
  /*
   * Ce nu se cere in `select` vine `undefined`, iar poarta ar fi citit `undefined` si ar fi
   * tacut exact pe comenzile pentru care exista. A patra oara in aceeasi zi cand tiparul asta
   * era gata sa treaca.
   *
   * ⚠ DE LA 18.09.2026 REGULA E GENERALA, nu pe doua nume. Marcarea platii si a intoarcerii
   * (anulare, rambursare) citeste comanda prin cititori comuni (`trimiteStatusul` la Brevo,
   * `comandaPentruMailchimp`, `comandaPentruKlaviyo`), iar un cititor nou adaugat maine intra
   * singur in proba: e cautat dupa `.from("orders")`, nu dupa nume.
   */
  let cititori = 0;
  for (const f of MODULE) {
    const s = readFileSync(f, "utf8");
    for (let de = s.indexOf('.from("orders")'); de >= 0; de = s.indexOf('.from("orders")', de + 1)) {
      const bucata = functiaDinJurul(s, de);
      assert.match(bucata, /^(export )?async function /, `${f}: citirea comenzii nu sta intr-o functie`);
      assert.match(bucata, /\.select\("[^"]*order_source[^"]*"\)/, `${f}: citirea nu cere originea\n${bucata.slice(0, 200)}`);
      assert.match(bucata, /clientDeMarketplace\(/, `${f}: poarta lipseste din functia care citeste comanda\n${bucata.slice(0, 200)}`);
      cititori++;
    }
  }
  // Cate unul in fiecare modul (Brevo, Mailchimp, Klaviyo): o lista goala ar trece verde.
  assert.ok(cititori >= 3, `gasiti doar ${cititori} cititori de comanda`);
});

test("⚠ marcarea platii si a intoarcerii trece prin cititorul pazit, la toti trei", () => {
  /*
   * Proba de sus apara CITIREA. Asta apara ca functiile chemate din `lib/email-marketing/comanda.ts`
   * chiar citesc prin ea, si nu cumva primesc comanda de la apelant, nepazita.
   */
  const perechi: Array<[string, string, string[]]> = [
    ["src/lib/mailchimp-sync.ts", "comandaPentruMailchimp(", ["maybeMarkMailchimpOrderPaid", "maybeMarkMailchimpOrderReturned"]],
    ["src/lib/brevo-sync.ts", "trimiteStatusul(", ["maybeMarkBrevoOrderPaid", "maybeMarkBrevoOrderReturned"]],
    ["src/lib/klaviyo-sync.ts", "comandaPentruKlaviyo(", ["maybeMarkKlaviyoOrderPaid", "maybeMarkKlaviyoOrderReturned"]],
  ];
  for (const [f, cititor, functii] of perechi) {
    const s = readFileSync(f, "utf8");
    for (const fn of functii) {
      const i = s.indexOf(`export async function ${fn}(`);
      assert.ok(i >= 0, `${f}: lipseste ${fn}`);
      assert.ok(functiaDinJurul(s, i).includes(cititor), `${f}: ${fn} nu citeste prin ${cititor}`);
    }
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

   ⚠ DE LA 18.09.2026 PAZA S-A MUTAT, dar regula e aceeasi. Propul `customer` nu mai exista:
   potrivirea avansata se hash-uieste pe SERVER si pleaca prin `window.__edinioAM` (Meta) si
   `window.__edinioTTAM` (TikTok). Deci se cere ca amandoua sa se calculeze NUMAI in blocul
   trecut prin `clientDeMarketplace`, si sa porneasca de la `null`.
*/

const CONFIRMARE = "src/app/(public)/[slug]/confirm/page.tsx";

test("⚠ pagina de confirmare nu da datele omului pixelilor, pe o comanda de marketplace", () => {
  const s = readFileSync(CONFIRMARE, "utf8");
  assert.match(s, /\.select\("[^"]*order_source[^"]*"\)/, "citirea comenzii nu cere originea");
  assert.match(s, /let potrivireMeta: DateNormalizate \| null = null;/, "potrivirea Meta nu porneste de la `null`");
  assert.match(s, /let potrivireTikTok: \{ email\?: string; phone_number\?: string \} \| null = null;/, "potrivirea TikTok nu porneste de la `null`");
  const garda = s.indexOf("&& !clientDeMarketplace(sursaComenzii)) {");
  assert.ok(garda > 0, "blocul pixelilor nu mai trece prin `clientDeMarketplace`");
  assert.ok(s.indexOf("potrivireMeta = potrivireaPentruPixel(") > garda, "datele Meta se calculeaza inaintea portii");
  assert.ok(s.indexOf("potrivireTikTok = potrivireaPentruPixelTikTok(") > garda, "datele TikTok se calculeaza inaintea portii");
  assert.doesNotMatch(s, /customer=\{/, "propul `customer` a revenit: datele omului pleaca iar in browser");
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
  assert.ok(!bloc.includes("maybeMark") && !bloc.includes("anuntaEmail"), "marcarea a intrat inapoi sub conditia telefonului");
  // Si chiar exista, undeva mai jos: altfel proba de sus ar trece si pe un fisier din care
  // marcarea a disparut cu totul. De la 18.09.2026 trece prin `anuntaEmailPlata`, care o duce
  // la Mailchimp, Brevo si Klaviyo deodata.
  assert.ok(linii.slice(sfarsit).some((l) => l.includes("anuntaEmailPlata(orderId")),
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

/* ══════════════════════════════════════════════════════════════════════════
   COLETUL DUS DE MARKETPLACE NU PRIMESTE AWB PROPRIU
   ══════════════════════════════════════════════════════════════════════════

   ⚠ La Pepita Delivery transportul e in fluxul lor, cu eticheta lor. Un AWB emis de comerciant
   inseamna doua etichete pe acelasi pachet si un al doilea transport platit. Pe o comanda
   deschisa de om paguba se vede si se opreste; la generarea IN MASA nu, fiindca acolo nu exista
   niciun camp de corectat si nimeni nu se uita la fiecare rand.
*/

test("⚠ generarea in masa de AWB sare coletele duse de marketplace", () => {
  const s = readFileSync("src/lib/actions/bulk-orders.actions.ts", "utf8");
  assert.match(s, /livrareaEDusaDeMarketplace\(/, "lotul emite AWB si pe coletele duse de ei");
  /* ⚠ Si CERE `order_source`: necerut, ar veni `undefined` si verificarea ar tacea. */
  assert.match(s, /\.select\("[^"]*order_source[^"]*"\)/, "citirea lotului nu cere originea");
  /* Si se SPUNE ce s-a sarit: „sarite" fara motiv arata ca un lot care a mers pe jumatate. */
  assert.match(s, /duseDeEi/, "comenzile sarite nu se spun nicaieri");
});
