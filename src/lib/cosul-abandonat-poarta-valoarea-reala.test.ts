import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * COSUL ABANDONAT SE SALVEAZA CU VALOAREA LUI ADEVARATA, SI INTREG.
 *
 * ═══ ⚠ DOUA DEFECTE DIN ACEEASI FAMILIE ═══
 *
 * Amandoua vin din faptul ca instantaneul cosului abandonat e compus de mana, in doua locuri, si
 * niciunul nu era legat de ce stia deja componenta din jurul lui.
 *
 *   1. PRETUL. Se salva `i.price`, adica instantaneul de CATALOG pus in localStorage la adaugare.
 *      Pentru un fototapet de 910 lei (8,75 m² × Premium × protectie) se scria 89. Cosul stia
 *      pretul adevarat: `lineUnit(i)` statea in aceeasi functie, folosit doua randuri mai jos
 *      pentru evenimentele de marketing.
 *
 *   2. LINIILE. Din „Comanda acum" se salva DOAR produsul de pe care s-a apasat, desi comanda
 *      insasi pleaca de mult cu produsele purtate din cos (`additional_items`). Cosul abandonat se
 *      scrie pe SESIUNE, deci clientul cu o cana „Robert" in cos care apasa „Comanda acum" pe un
 *      tricou si apoi se razgandeste ramanea cu un cos de recuperat din care cana disparuse. Iar
 *      `restoreCart` SUPRASCRIE, deci recuperarea i-ar fi luat si ce mai avea.
 *
 * ═══ ⚠ CE COSTA, DINCOLO DE STATISTICI ═══
 *
 * Automatizarea are un prag: „trimite doar pentru cosuri peste 300 de lei". Judecat pe 89 in loc de
 * 910, tocmai cosurile MARI nu primeau niciodata mesajul, iar comerciantul n-avea de unde sa afle
 * de ce. De aceea pragul se judeca acum pe valoarea REPRETUITA din catalog, nu pe numarul venit din
 * browser: `trackAbandonedCart` e o actiune publica, deci cine vrea mesajele isi declara ce suma
 * pofteste.
 *
 * ⚠ DE CE SE CITESTE SURSA. Cele trei locuri sunt componente React care cer un furnizor de cos, o
 * sesiune si un client Supabase. Ce trebuie aparat nu e o valoare intoarsa, ci DIN CE se compune
 * instantaneul si ORDINEA portilor din cron. Amandoua se vad din sursa, si numai din ea.
 */

const RAD = process.cwd();

/**
 * Sursa fara comentarii.
 *
 * ⚠ SE TAIE, si nu de eleganta: fisierele astea isi explica pe larg propriile defecte vechi, cu
 * `i.price` si `cart.subtotal` scrise in text. O cautare peste fisierul intreg s-ar fi indeplinit
 * pe explicatie si ar fi trecut peste codul stricat. S-a intamplat de patru ori in proiectul asta.
 */
function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const CHECKOUT = "src/components/storefront/sections/checkout/checkout-core.ts";
const FORMULAR = "src/components/storefront/sections/checkout/CheckoutForm.tsx";
const COMANDA_ACUM = "src/components/ministore/OrderModal.tsx";
const CRON = "src/app/api/cron/abandoned-recovery/route.ts";

/** Bucata de sursa a instantaneului: de la `trackAbandonedCart(` pana la inchiderea lui. */
function instantaneul(cod: string): string {
  const i = cod.indexOf("trackAbandonedCart({");
  assert.ok(i > 0, "instantaneul cosului abandonat si-a schimbat forma");
  const j = cod.indexOf("}, 1500);", i);
  assert.ok(j > i, "nu gasesc capatul instantaneului");
  return cod.slice(i, j);
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. PRETUL SALVAT E CEL AL LINIEI
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ finalizarea salveaza pretul LINIEI, nu pe cel din catalog", () => {
  const snap = instantaneul(sursa(CHECKOUT));

  assert.match(snap, /price: lineUnit\(i\)/, "cosul abandonat se salveaza iar cu pretul de catalog");
  /*
   * ⚠ SI PERECHEA, care e jumatatea care conteaza: `i.price` n-are voie sa se intoarca. Lasat
   * alaturi, ar fi o a doua sursa pentru acelasi numar, si prima „simplificare" l-ar alege pe el.
   */
  assert.doesNotMatch(snap, /price: i\.price/, "`i.price` s-a intors in instantaneu");
});

test("⚠ «Comanda acum» salveaza si liniile din cos, cu pretul lor efectiv", () => {
  const snap = instantaneul(sursa(COMANDA_ACUM));

  /* Produsul de pe care s-a apasat ramane primul, ca pana acum. */
  assert.match(snap, /product_id: product\.id/, "produsul principal a iesit din instantaneu");

  /*
   * ⚠ SI LINIILE PURTATE DIN COS. Fara ele, cosul abandonat al sesiunii se SUBTIA la fiecare
   * „Comanda acum": recuperarea ii dadea clientului mai putin decat avea, si definitiv, fiindca
   * `restoreCart` suprascrie.
   */
  assert.match(snap, /\.\.\.cart\.map\(/, "liniile din cos lipsesc iar din instantaneu");
  assert.match(snap, /price: pretBucataCos\(i\)/, "liniile din cos se salveaza cu pretul de catalog");
  assert.match(snap, /customization: i\.customization/, "personalizarea liniilor din cos nu se salveaza");
  assert.match(snap, /variant_title: i\.variantTitle/, "varianta liniilor din cos nu se salveaza");
});

test("⚠ si cosul e in dependintele capturii, altfel o linie scoasa nu se vede niciodata", () => {
  /*
   * Efectul se reia cand se schimba ce e in dependinte. Fara `cart`, instantaneul ar fi ramas cel
   * de la prima tastare, iar o linie scoasa din cos cu formularul deschis ar fi fost „recuperata"
   * inapoi clientului care tocmai o aruncase.
   */
  const cod = sursa(COMANDA_ACUM);
  const i = cod.indexOf("trackAbandonedCart({");
  const dupa = cod.slice(i);
  const dep = dupa.slice(dupa.indexOf("}, 1500);"));
  const lista = dep.slice(0, dep.indexOf("]);") + 3);
  assert.match(lista, /\bcart\]/, "`cart` nu e in dependintele capturii");
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. PRAGUL AUTOMATIZARII SE JUDECA PE VALOAREA AUTORITARA
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ pragul comerciantului se masoara DUPA repretuire, si pe totalul repretuit", () => {
  /*
   * ═══ ⚠ ORDINEA E CHIAR AFIRMATIA ═══
   *
   * Pragul statea INAINTEA drumului la catalog, ca sa fie ieftin, si se uita la `cart.subtotal`.
   * Numarul ala e socotit de `trackAbandonedCart` din preturile trimise de BROWSER, iar aceea e o
   * actiune publica: cine vrea mesajele isi declara ce suma pofteste, cine nu vrea isi declara
   * zero. Si chiar cinstit fiind, era gresit pentru produsele personalizate.
   *
   * Deci nu ajunge sa se cheme `proaspat.total`; el trebuie sa fie DUPA `cosRecuperabil`, altfel
   * n-ar exista inca.
   */
  const cod = sursa(CRON);
  const bucla = cod.slice(cod.indexOf("for (const cart of carts ?? [])"));

  const repretuire = bucla.indexOf("const proaspat = await cosRecuperabil(");
  const prag = bucla.indexOf("min_cart_value");
  assert.ok(repretuire > 0, "repretuirea din cron si-a schimbat forma");
  assert.ok(prag > 0, "pragul comerciantului a disparut din cron");
  assert.ok(prag > repretuire, "pragul se judeca INAINTE de repretuire, deci pe numarul din browser");

  const randul = bucla.slice(prag - 60, prag + 160);
  assert.match(randul, /proaspat\.total < store\.automation\.min_cart_value/,
    "pragul nu se masoara pe valoarea repretuita");
  assert.doesNotMatch(bucla.slice(0, prag + 200), /Number\(cart\.subtotal \|\| 0\) < store\.automation\.min_cart_value/,
    "pragul se masoara iar pe subtotalul trimis de browser");
});

test("⚠ pragul NU revendica pasul: cosul ramane de reincercat", () => {
  /*
   * Un cos sub prag azi poate trece maine, daca se scumpeste catalogul sau daca comerciantul
   * coboara pragul. Revendicat, pasul ar fi avansat degeaba si secventa s-ar fi consumat pe un cos
   * caruia nu i s-a trimis nimic.
   */
  const cod = sursa(CRON);
  const bucla = cod.slice(cod.indexOf("for (const cart of carts ?? [])"));
  /* ⚠ Doar RANDUL pragului, nu o fereastra in jurul lui: cel de dedesubt chiar revendica pasul. */
  const randul = bucla.split("\n").find((l) => l.includes("min_cart_value"));
  assert.ok(randul, "pragul comerciantului a disparut din cron");
  assert.match(randul, /continue;/, "pragul nu mai sare cosul");
  assert.doesNotMatch(randul, /revendicaPasul/, "pragul revendica pasul, deci consuma secventa degeaba");
});

/* ═══════════════════════════════════════════════════════════════════════════
   3. O LINIE CARE NU SE MAI POATE COMANDA OPRESTE BUTONUL
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ finalizarea se blocheaza cand o linie cere revizuire, nu doar se plange", () => {
  /*
   * Comerciantul a scos „Premium" dintre optiuni, iar linia din cos poarta o configuratie care nu
   * mai exista. Rezumatul o marca deja, dar butonul ramanea apasabil: clientul completa tot
   * formularul, isi dadea adresa, alegea plata, apasa, si SERVERUL refuza. Poarta adevarata e si
   * ramane la server; asta e ca omul sa afle inainte, nu dupa.
   */
  const core = sursa(CHECKOUT);
  assert.match(core, /const liniiDeRevizuit = items\.filter\(lineNeedsReview\)/,
    "finalizarea nu mai stie care linii cer revizuire");
  assert.match(core, /lineNeedsReview/, "`lineNeedsReview` nu se mai cere de la cos");

  const form = sursa(FORMULAR);
  /*
   * ⚠ Butonul are acum si a treia conditie, pentru liniile al caror pret nu s-a validat. Proba se
   * uita la CE se cere, nu la sirul intreg, ca sa nu cada la fiecare conditie noua adaugata pe
   * langa ea.
   */
  assert.match(form, /disabled=\{isPending \|\| belowMinOrder \|\|[^}]*liniiDeRevizuit\.length > 0/,
    "butonul de finalizare se apasa iar peste o linie care nu se poate comanda");
  /* ⚠ Si i se SPUNE de ce, altfel un buton stins fara explicatie e mai rau decat unul care refuza. */
  assert.match(form, /liniiDeRevizuit\.length > 0 && \(/, "nu se spune de ce e blocat butonul");
});

/* ═══════════════════════════════════════════════════════════════════════════
   4. PRETURILE SCRISE IN RAND VIN DIN CATALOG, NU DIN CERERE
   ═══════════════════════════════════════════════════════════════════════════ */

const ACTIUNI = "src/lib/actions/abandoned-cart.actions.ts";
const EMAIL = "src/lib/email.ts";

test("⚠ captura REPRETUIESTE inainte sa scrie, si scrie ce a repretuit", () => {
  /*
   * ═══ ⚠ ACTIUNEA E PUBLICA SI ANONIMA ═══
   *
   * Id-ul ei ajunge in pachetul fiecarui magazin. Pretul trimis se aduna in „Valoare cosuri
   * abandonate", in media pe cos, in venitul potential si in „Cele mai abandonate produse": cine o
   * cheama de mana isi declara ce suma pofteste. Nu se poate cumpara nimic pe pretul asta, dar
   * cifrele dupa care comerciantul isi masoara magazinul se pot murdari.
   *
   * ⚠ SI NU AJUNGE SA SE CHEME REPRETUIREA: rezultatul ei trebuie sa ajunga si in `subtotal`, si in
   * `items`. „Top produse abandonate" citeste din jsonb-ul brut, deci un rand care s-ar contrazice
   * singur ar fi lasat jumatate din defect in loc.
   */
  const cod = sursa(ACTIUNI);
  const i = cod.indexOf("export async function trackAbandonedCart");
  assert.ok(i > 0, "captura si-a schimbat numele");
  const corp = cod.slice(i, cod.indexOf("export async function", i + 40));

  assert.match(corp, /const cuPreturi = await cuPreturileDinCatalog\(admin, input\.businessId, items\)/,
    "captura nu mai repretuieste din catalog");
  assert.match(corp, /cuPreturi\.reduce\(/, "subtotalul se socoteste iar din preturile trimise");
  assert.match(corp, /items: cuPreturi\.map\(/, "jsonb-ul pastreaza preturile trimise de client");
  assert.doesNotMatch(corp, /const subtotal = round2\(items\.reduce\(/,
    "subtotalul s-a intors pe preturile din cerere");
});

test("⚠ steagul „preturi sigure” ajunge de la repretuire pana in email", () => {
  /*
   * Cand o linie a cazut inapoi pe pretul de catalog (comerciantul a scos „Premium"), suma nu mai
   * poate fi promisa. Cele doua drumuri care trimit emailul trebuie sa duca steagul mai departe,
   * iar sablonul chiar sa se uite la el.
   */
  for (const [nume, fisier] of [["cronul", CRON], ["trimiterea de mana", ACTIUNI]] as const) {
    assert.match(sursa(fisier), /preturiSigure: proaspat\.sigur/,
      `${nume} nu mai duce steagul pana la email`);
  }

  const email = sursa(EMAIL);
  assert.match(email, /const preturiSigure = data\.preturiSigure !== false/,
    "sablonul nu se mai uita la steag");
  /* ⚠ Si chiar ASCUNDE suma: un sablon care citeste steagul si-l ignora ar fi trecut altfel. */
  assert.match(email, /preturiSigure \? formatPrice\(i\.price \* i\.quantity\) : ""/,
    "preturile pe linie se scriu oricum");
  assert.match(email, /\$\{preturiSigure \? `/, "totalul se scrie oricum");
});
