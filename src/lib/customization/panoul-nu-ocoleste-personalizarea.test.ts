import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { subtotalMaximDinCatalog } from "@/lib/shipping/cart-weight";

/**
 * ═══ CELE DOUA DRUMURI DIN PANOU CARE OCOLEAU PERSONALIZAREA ═══
 *
 * Tot ce vede cumparatorul fusese adus la zi: pagina, cosul, finalizarea, comanda directa,
 * transportul. Rămăsese „Editeaza comanda" din panou, care e alt drum si n-a fost atins niciodata —
 * si acolo personalizarea pur si simplu nu exista.
 *
 * Niciunul nu e o gaura pe care s-o poata folosi un cumparator: ecranul cere sesiune si
 * proprietatea magazinului. Amandoua sunt insa integritate comerciala — comerciantul isi poate
 * strica singur comanda, fara sa afle.
 */

const sursa = (r: string) => readFileSync(path.resolve(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");

test("⚠ un produs care CERE personalizare nu se poate adauga din «Editeaza comanda»", () => {
  /*
   * ⚠ CE SE INTAMPLA FARA GARDA: `added_items` poarta produs, varianta si cantitate — si atat. Deci
   * un fototapet adaugat din panou intra in comanda FARA dimensiuni, fara material si fara fisiere,
   * la pretul de CATALOG: 89 de lei in loc de 910. Comanda iese invalida si subevaluata, iar
   * atelierul o primeste fara sa stie ce produce.
   *
   * ⚠ SE REFUZA, NU SE CONSTRUIESTE PERSONALIZAREA ACOLO. Ar fi fost al TREILEA formular de
   * personalizare, langa pagina de produs si comanda directa — trei locuri de tinut in sincron
   * pentru un drum pe care comerciantul il face rar.
   */
  const actiuni = sursa("src/lib/actions/order.actions.ts");

  /*
   * ⚠ PE SERVER, SI ASTA E PARTEA CARE CONTEAZA. Ecranul deseneaza produsele ca nealegibile, dar
   * `added_items` vine de la client: o verificare doar in panou ar fi fost o sugestie.
   */
  assert.match(
    actiuni,
    /const cerPersonalizare = idsAdaugate\.filter\(\(id\) => cerePersonalizarea\(live\.get\(id\)\?\.page_sections\)\);/,
    "serverul accepta iar produse personalizabile fara personalizare",
  );
  assert.match(actiuni, /se comanda personalizat, din pagina lui/, "refuzul nu spune omului ce sa faca");

  /*
   * ⚠ SI IMPORTUL NU MAI E MORT. `cerePersonalizarea` era importat in fisier si nefolosit nicaieri —
   * adica pазa arata ca exista fara sa existe. Se cere sa fie CHEMAT, nu doar adus.
   */
  const chemari = (actiuni.match(/cerePersonalizarea\(/g) ?? []).length;
  assert.ok(chemari >= 1, "`cerePersonalizarea` e iar doar importat, nu chemat");

  /* Si panoul il arata stins, ca refuzul sa se vada INAINTE de clic. */
  const modal = sursa("src/components/dashboard/OrderEditModal.tsx");
  assert.match(modal, /\|\| !!p\.cerePersonalizare/, "panoul lasa produsul sa fie ales");
  assert.match(modal, /SE COMANDA DIN MAGAZIN/, "produsul stins nu spune de ce e stins");
  assert.match(
    sursa("src/lib/actions/order.actions.ts"), /cerePersonalizare: cerePersonalizarea\(p\.page_sections\)/,
    "cautarea nu trimite steagul, deci panoul n-are ce sa deseneze",
  );
});

test("⚠ recotarea transportului nu pierde valoarea unei comenzi personalizate", () => {
  /*
   * ═══ ⚠ CE COSTA, SI NU DOAR IN REGULI ═══
   *
   * `valoareMarfii` = min(subtotalul cerut, plafonul din catalog). Plafonul recalculeaza
   * personalizarea din valorile BRUTE — pe care o comanda deja plasata nu le mai are: instantaneul
   * ei pastreaza textele („350 x 250 cm"), nu valorile.
   *
   * Deci la „Recoteaza transportul" un fototapet de 910 lei cadea inapoi pe cei 89 din catalog. Iar
   * numarul ala hotaraste si regulile de transport, SI VALOAREA DECLARATA CURIERULUI: coletul
   * pleca asigurat la 89 in loc de 910.
   */
  const produse = [{ id: "p1", price: 89, page_sections: null as unknown }];
  const linii = [{ productId: "p1", quantity: 1 }];

  /* Fara dovada, plafonul e cel de catalog — purtarea de pana acum, neatinsa. */
  assert.equal(subtotalMaximDinCatalog(linii, produse), 89);

  /* Cu ce s-a incasat pe comanda, plafonul urca la adevar. */
  assert.equal(
    subtotalMaximDinCatalog(linii, produse, new Map([["p1", 910]])), 910,
    "comanda personalizata isi pierde valoarea la recotare",
  );

  /*
   * ⚠ SI NU COBOARA NICIODATA. Se ia cea mai MARE dintre socoteala de azi si dovada: o linie
   * istorica nu poate valora mai putin decat s-a incasat pe ea, iar o dovada mica nu are voie sa
   * taie plafonul unui produs care intre timp s-a scumpit.
   */
  assert.equal(subtotalMaximDinCatalog(linii, produse, new Map([["p1", 10]])), 89);
  /* Iar un produs care nu e in comanda nu capata nimic. */
  assert.equal(subtotalMaximDinCatalog(linii, produse, new Map([["altul", 5000]])), 89);

  /*
   * ⚠ APELANTUL NU TRIMITE NICIUN PRET, doar id-ul comenzii — sumele le citeste serverul din
   * `orders.items`. Altfel plafonul, care exista tocmai ca sa nu creada un numar de la client, ar
   * fi devenit un numar de la client.
   */
  const shipping = sursa("src/lib/actions/shipping.actions.ts");
  assert.match(shipping, /\.eq\("id", destination\.comanda\)\s*\n\s*\.eq\("business_id", businessId\)/,
    "comanda se citeste fara sa se verifice ca e a magazinului cerut");
  assert.match(shipping, /subtotalMaximDinCatalog\(destination\.cart, produseCotate, istoric\)/,
    "dovada nu ajunge la plafon");

  const modal = sursa("src/components/dashboard/OrderEditModal.tsx");
  assert.match(modal, /comanda: order\.id,/, "panoul nu numeste comanda la recotare");
  /*
   * ⚠ Si NU trimite preturi: ar fi mutat plafonul in mana apelantului.
   *
   * ⚠ SE CITESTE CODUL, NU COMENTARIILE — a patra oara cand proiectul cade pe asta, si a patra oara
   * pe o proba scrisa de mine. Chiar nota care EXPLICA de ce nu se trimite un pret contine cuvantul
   * „pret:", si proba pica pe ea.
   */
  const bloc = modal
    .slice(modal.indexOf("getShippingOptions(businessId, {"), modal.indexOf("}).then((optiuni)"))
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(bloc.length > 50, "n-am gasit blocul de cotare");
  assert.equal(/price:|pret:/.test(bloc), false, "panoul trimite un pret la cotare");
});

test("⚠ recuperarea unui cos expira odata cu fisierele lui", () => {
  /*
   * ⚠ DOUA SUBSISTEME CU DOUA CEASURI. Cronul apara fisierele cosurilor deschise cat tine
   * fereastra de retentie, apoi le sterge — pe drept. Dar linkul de recuperare nu se uita la nicio
   * varsta: un cos de acum sapte luni se restaura cu cheile unor fisiere care nu mai exista, iar
   * omul ajungea pe un cos in care poza lui lipseste.
   *
   * ⚠ SE REFUZA INTREG, nu pe jumatate: `restoreCart` SUPRASCRIE cosul clientului, deci un cos
   * „recuperat" fara fisiere i-ar fi sters si ce avea in el intre timp.
   *
   * ⚠ SI DINTR-O SINGURA SURSA (`pragulComenzilor`): doua numere care se apropie ar fi lasat o
   * fereastra in care cosul e recuperabil si fisierele lui nu mai sunt — chiar defectul de aici.
   */
  const act = sursa("src/lib/actions/abandoned-cart.actions.ts");
  assert.match(act, /import \{ pragulComenzilor \} from "@\/app\/api\/cron\/curata-fisiere\/reguli";/,
    "recuperarea isi scrie propriul termen in loc sa-l ia de la retentie");
  assert.match(act, /miscat < pragulComenzilor\(new Date\(\)\)\) return \[\];/,
    "recuperarea nu se uita la varsta cosului");
  assert.match(act, /select\("business_id, items, status, last_activity_at"\)/,
    "varsta nici nu se citeste din baza");
});
