import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Configuratia ajunge la OMUL care are de lucrat dupa ea?
 *
 * ═══ ⚠ CE SE INTAMPLA CAND NU AJUNGE ═══
 *
 * Instantaneul se scrie corect in `orders.items`, dar de acolo incolo totul e orb daca nu-l
 * citeste nimeni. Comerciantul primeste „Cana personalizata x1 — 89 lei" si atat: nu afla ce
 * gravura, iar cu doua cani gravate diferit vede DOUA RANDURI IDENTICE pe fiecare ecran si in
 * fiecare email. Marfa pleaca gresit, si nimeni nu poate spune de ce.
 *
 * ═══ ⚠ DE CE O PROBA PE SURSA ═══
 *
 * Suprafetele sunt multe si scrise separat, iar fiecare isi compune singura randul de linie. Ce
 * paza aici e ca niciuna dintre cele legate nu se dezleaga in tacere — nu forma HTML-ului, care
 * se poate schimba oricand.
 */

const SRC = path.resolve(process.cwd(), "src");

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF. */
function sursa(relativ: string): string {
  return readFileSync(path.join(SRC, relativ), "utf8").replace(/\r\n/g, "\n");
}

test("PANOUL arata configuratia pe linia de comanda", () => {
  const s = sursa("components/dashboard/OrderDetailClient.tsx");
  assert.ok(s.includes("<ConfiguratiaLiniei linie={item} />"), "detaliul comenzii n-o mai deseneaza");
  assert.ok(s.includes("instantaneulLiniei(linie)"), "si n-o mai citeste aparat");
});

test("TOATE cele trei emailuri cu linii de comanda o poarta", () => {
  /*
   * ⚠ Trei constructori de randuri scrisi separat: confirmarea catre client, instiintarea catre
   * comerciant, si al treilea. Unul singur lasat pe dinafara inseamna ca jumatate din oameni afla
   * si jumatate nu.
   */
  const s = sursa("lib/email.ts");
  const cate = s.split("${randConfiguratie(i)}").length - 1;
  assert.equal(cate, 3, `configuratia apare in ${cate} randuri de email, nu in 3`);
});

test("textul clientului se ESCAPEAZA inainte sa intre in email", () => {
  /*
   * ⚠ NU e o formalitate. Gravura e un sir ales de un strain, lipit intr-un HTML care ajunge in
   * casuta comerciantului. `esc` e singurul lucru care sta intre cele doua.
   */
  const s = sursa("lib/email.ts");
  assert.match(
    s,
    /function randConfiguratie[\s\S]{0,600}\$\{esc\(text\)\}/,
    "randul de configuratie nu mai trece prin `esc`",
  );
});

test("PANOUL DE EDITARE refuza sa adauge un produs configurabil", () => {
  /*
   * ⚠ Adaugat, intra ca linie SIMPLA, la pretul de BAZA, fara nicio specificatie — o cana nescrisa
   * langa una gravata pe care a platit-o clientul. Nimic nu cade, si nimeni nu afla.
   */
  const s = sursa("lib/orders/edit-pricing.ts");
  assert.ok(s.includes("if (cat.areConfigurator) {"), "poarta a disparut din planificarea adaugarii");
  const o = sursa("lib/actions/order.actions.ts");
  assert.ok(
    o.includes("areConfigurator: configurabile.has(p.id as string)"),
    "catalogul de editare nu mai afla care produse sunt configurabile, deci poarta e mereu deschisa",
  );
});
