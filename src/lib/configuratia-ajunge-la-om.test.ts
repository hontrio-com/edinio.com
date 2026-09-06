import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randConfiguratie } from "./email/rand-configuratie";

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

test("TOATE cele trei emailuri cu linii de comanda il cheama", () => {
  /*
   * ⚠ Trei constructori de randuri scrisi separat: confirmarea catre client, instiintarea catre
   * comerciant, si al treilea. Unul singur lasat pe dinafara inseamna ca jumatate din oameni afla
   * si jumatate nu.
   */
  const s = sursa("lib/email.ts");
  const cate = s.split("${randConfiguratie(i)}").length - 1;
  assert.equal(cate, 3, `configuratia apare in ${cate} randuri de email, nu in 3`);
});

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ SI CA FUNCTIA CHIAR SCRIE CEVA
   ══════════════════════════════════════════════════════════════════════════

   Proba de deasupra numara aparitiile unui SIR in sursa. Ea a trecut verde luni de zile peste o
   functie MOARTA: `order.actions.ts` compunea liniile de email cu un `.map` care enumera patru
   campuri si il pierdea pe `configuratie`, iar `randConfiguratie` primeste `unknown` si intoarce
   sirul gol pentru orice. Deci cele trei apeluri existau, si toate trei scriau nimic. `tsc` n-avea
   ce spune, si nici proba.

   De aceea functia s-a mutat in `lib/email/rand-configuratie.ts`: ca sa poata fi CHEMATA de aici,
   cu o linie adevarata, si sa se vada ce iese.
*/

const LINIE_CONFIGURATA = {
  product_id: "p1",
  name: "Cana personalizata",
  quantity: 1,
  price: 89,
  configuratie: {
    configuratorId: "c1",
    versiuneId: "v1",
    numarVersiune: 3,
    amprenta: "abc",
    grame: 400,
    valori: { grav: { f: "text", v: "Pentru Ana, 2026" } },
    rezumat: [{ id: "grav", eticheta: "Gravura", valoare: "Pentru Ana, 2026", scurt: true }],
  },
};

test("⚠ randul CHIAR scrie gravura, chemat cu o linie adevarata", () => {
  const h = randConfiguratie(LINIE_CONFIGURATA);
  assert.ok(h.includes("Pentru Ana, 2026"), `randul a iesit: ${JSON.stringify(h)}`);
  assert.ok(h.includes("Gravura"), h);
});

test("o linie FARA configuratie nu adauga nimic", () => {
  assert.equal(randConfiguratie({ product_id: "p1", name: "Cana", quantity: 1, price: 89 }), "");
});

test("⚠ textul clientului se ESCAPEAZA, si asta se vede pe iesire", () => {
  /*
   * ⚠ NU e o formalitate. Gravura e un sir ales de un strain, lipit intr-un HTML care ajunge in
   * casuta comerciantului. Proba de dinainte cauta `${esc(text)}` in sursa; asta se uita la ce IESE,
   * deci nu se poate pacali nici mutand functia, nici escapand alta variabila.
   */
  const rau = { ...LINIE_CONFIGURATA, configuratie: { ...LINIE_CONFIGURATA.configuratie,
    rezumat: [{ id: "grav", eticheta: "Gravura", valoare: "<script>alert(1)</script>", scurt: true }] } };
  const h = randConfiguratie(rau);
  assert.ok(!h.includes("<script>"), `HTML neescapat in email: ${h}`);
  assert.ok(h.includes("&lt;script&gt;"), h);
});

test("nu arunca pe nimic din ce poate sta intr-o comanda veche", () => {
  // ⚠ Un email care arunca nu se trimite deloc, si comanda ramane nestiuta.
  for (const rau of [null, undefined, 7, "x", {}, { configuratie: "aiurea" }, { configuratie: {} }]) {
    assert.doesNotThrow(() => randConfiguratie(rau));
  }
});

test("⚠ comanda CHIAR trimite `configuratie` catre emailuri, pe amandoua caile", () => {
  /*
   * ⚠ ASTA E LEGATURA CARE A FOST RUPTA, si singura care nu se poate proba chemand ceva:
   * `randConfiguratie` merge perfect si cu ea rupta. Se cere deci ca `.map`-ul care compune
   * liniile de email sa duca mai departe campul.
   *
   * Se numara amandoua caile: `placeOrder` si `placeCartOrder` isi scriu fiecare propriul `.map`,
   * si una singura reparata inseamna ca jumatate din comenzi raman fara.
   */
  const s = sursa("lib/actions/order.actions.ts");
  const duc = s.match(/\.\.\.\(i\.configuratie \? \{ configuratie: i\.configuratie \} : \{\}\),/g) ?? [];
  assert.equal(duc.length, 2, `configuratia pleaca spre emailuri pe ${duc.length} cai, nu pe 2`);
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

test("PAGINA DE CONFIRMARE arata clientului ce a configurat", () => {
  /*
   * ⚠ E singura pagina pe care omul o vede dupa ce a platit. Fara randul de configuratie, ii
   * arata „Cana personalizata x1" si atat — nu poate verifica daca gravura pe care a scris-o e cea
   * care pleaca in productie. Iar cand nu e, afla cand desface coletul: atunci e un retur, nu o
   * corectura.
   */
  const s = sursa("app/(public)/[slug]/confirm/page.tsx");
  assert.ok(s.includes("instantaneulLiniei(item)"), "pagina de confirmare nu mai citeste configuratia");
  assert.ok(s.includes("caUnRand(cfg.rezumat)"), "si n-o mai scrie");
});

test("CONTINUTUL AWB-ului ramane numele produselor, si asta e o hotarare", () => {
  /*
   * ⚠ NU se adauga configuratia acolo, si merita scris de ce: campul are 100 de caractere si
   * spune curierului CE E in cutie, pentru manipulare si vama. Umplut cu gravuri, ar fi impins
   * afara chiar numele produselor — iar curierul n-are ce face cu textul gravat.
   *
   * Specificatia e a atelierului, si ea ajunge acolo prin panou si prin emailul comerciantului.
   */
  const s = sursa("lib/actions/bulk-orders.actions.ts");
  assert.match(
    s,
    /const content = \(items\.map\(\(i\) => i\?\.name\)/,
    "continutul coletului s-a schimbat; daca a fost dinadins, muta si nota asta",
  );
});
