import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Personalizarea e in TOATE modelele de pagina de produs?
 *
 * ═══ ⚠ CE COSTA CAND NU E ═══
 *
 * Asta nu e o teama, e ce s-a intamplat: pana acum campurile traiau EXCLUSIV in `OrderModal`, iar
 * pe pagina modelul `classic` arata cel putin o pastila „Personalizabil". Modelul `detailed` nu
 * arata NIMIC — un produs cu cinci campuri obligatorii se vedea acolo ca un produs oarecare.
 *
 * Un model nou de pagina se adauga scriind un fisier si o linie in registru. Nimic din tsc, din
 * build sau din probele de pana acum nu observa ca el a uitat personalizarea: pagina se randeaza,
 * pretul se afiseaza, butonul merge — si vinde un fototapet fara dimensiuni.
 *
 * ⚠ PROBA E PE SURSA, SI NU SE POATE ALTFEL. Proiectul nu are jsdom, nici React Testing Library,
 * nici Playwright (vezi `package.json`): nicio componenta React nu se randeaza intr-o proba. Ce se
 * poate apara e LANTUL — carligul, componenta si poarta butonului — iar fiecare veriga in parte
 * merge si fara celelalte.
 */

const DIR = path.resolve(process.cwd(), "src/components/storefront/sections/product");

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF. */
function sursa(fisier: string): string {
  return readFileSync(path.join(DIR, fisier), "utf8").replace(/\r\n/g, "\n");
}

/**
 * Modelele, citite din REGISTRU, nu dintr-o lista scrisa aici.
 *
 * ⚠ Scrise de mana, un model nou n-ar fi fost niciodata verificat — proba ar fi ramas verde
 * tocmai in ziua in care apare al treilea model. Registrul e `ProductPageSection.tsx`, chiar cel
 * care alege ce se randeaza.
 */
function modele(): string[] {
  const reg = sursa("ProductPageSection.tsx");
  const out = new Set<string>();
  /*
   * ⚠ AMANDOUA formele de import, si asta a prins-o chiar proba: `classic` se importa static, dar
   * `detailed` vine prin `dynamic(() => import("./ProductPageDetailed"))`. Cu un singur tipar,
   * cititorul intorcea UN model, iar toate probele de mai jos ar fi verificat jumatate din registru
   * si ar fi ramas verzi.
   */
  for (const m of reg.matchAll(/(?:from\s+"|import\("|import\(\s*"|require\(")\.\/(ProductPage\w+)"/g)) {
    if (m[1] !== "ProductPageSection" && m[1] !== "ProductPageDinDesign") out.add(m[1]);
  }
  return [...out];
}

test("⚠ registrul chiar da modelele, si sunt cel putin doua", () => {
  /* Perechea obligatorie: un cititor rupt ar face toate probele de mai jos verzi pe o lista goala. */
  const m = modele();
  assert.ok(m.length >= 2, `am citit ${m.length} modele din registru`);
  assert.ok(m.includes("ProductPageClassic"));
  assert.ok(m.includes("ProductPageDetailed"));
});

test("⚠ FIECARE model cheama carligul si randeaza componenta comuna", () => {
  for (const model of modele()) {
    const s = sursa(`${model}.tsx`);
    assert.match(
      s, /import \{ usePersonalizare \} from "\.\/_shared\/usePersonalizare";/,
      `${model} nu importa carligul`,
    );
    assert.match(
      s, /const pers = usePersonalizare\(product\.page_sections, business\.id\);/,
      `${model} nu cheama carligul`,
    );
    assert.match(
      s, /<CampuriPersonalizare stare=\{pers\}/,
      `${model} nu randeaza campurile — un produs personalizabil arata acolo ca unul oarecare`,
    );
  }
});

test("⚠ FIECARE model blocheaza comanda cand personalizarea e incompleta", () => {
  /*
   * ⚠ Fara asta, „Camp obligatoriu" ramane o sugestie: clientul apasa „Comanda", fereastra se
   * deschide, si el trimite o cerere pe care serverul o refuza — dupa ce a completat toata adresa.
   * Serverul o refuza oricum (vezi `verificaPersonalizarea`), dar aici se opreste inainte ca omul
   * sa piarda timpul.
   */
  for (const model of modele()) {
    const s = sursa(`${model}.tsx`);
    assert.match(
      s, /if \(!pers\.verifica\(\)\) return;/,
      `${model} deschide fereastra de comanda fara sa verifice personalizarea`,
    );
  }
});

test("⚠ FIECARE model arata pretul CU supliment, dar trimite pretul de CATALOG", () => {
  /*
   * ⚠ CEA MAI SCUMPA DIN FISIER, si merita citita de doua ori.
   *
   * `displayPrice` pleaca la `OrderModal` ca `product_price`, iar acolo `authoritativeSubtotal` il
   * compara cu preturile legitime din CATALOG, cu toleranta de 0,50 lei. Trimis cu suplimentul
   * inclus — 910 in loc de 89 — comanda ar fi fost REFUZATA la fiecare fototapet, cu mesajul
   * „Pretul comenzii nu este valid".
   *
   * Deci: `pretAfisat` se vede, `displayPrice` se trimite. Cele doua nu au voie sa se amestece.
   */
  for (const model of modele()) {
    const s = sursa(`${model}.tsx`);
    assert.match(
      s, /const pretAfisat = pers\.pretDeAfisat\(displayPrice\);/,
      `${model} nu socoteste pretul de afisat`,
    );
    assert.match(s, /formatPrice\(pretAfisat\)/, `${model} nu afiseaza pretul personalizat`);
    assert.match(
      s, /price: displayPrice,/,
      `${model} nu mai trimite pretul de CATALOG catre fereastra de comanda`,
    );
    assert.equal(
      /price: pretAfisat/.test(s), false,
      `${model} trimite pretul personalizat ca \`product_price\` — serverul il va REFUZA`,
    );
  }
});

test("⚠ fereastra de comanda NU mai cere aceleasi campuri a doua oara", () => {
  /*
   * Campurile se completeaza pe pagina, unde clientul vede si cum ii creste pretul. Cerute din nou
   * in fereastra, ar fi fost acelasi formular de doua ori — iar cele doua copii ar fi putut spune
   * lucruri diferite.
   */
  const modal = readFileSync(
    path.resolve(process.cwd(), "src/components/ministore/OrderModal.tsx"), "utf8",
  ).replace(/\r\n/g, "\n");
  assert.match(modal, /personalizare\?: StarePersonalizare;/, "fereastra nu primeste starea");
  assert.equal(
    /const \[custValues, setCustValues\]/.test(modal), false,
    "fereastra isi tine inca propria stare de personalizare",
  );
  assert.match(modal, /Personalizarea ta/, "fereastra nu arata rezumatul");
  /*
   * ⚠ PROBA ASTA INGHETASE O FORMULA GRESITA, si merită scris limpede.
   *
   * Ea cerea textual `treapta.subtotal + supliment * quantity` — adica exact adunarea oarba care
   * ignora `bazaInclusa`. La un fototapet cu baza stinsa, fereastra arata 89 + 910 = 999, pagina
   * arata 910, si serverul incasa 910. Proba era VERDE peste toate trei.
   *
   * O proba care cere o formula anume, si nu un REZULTAT, apara implementarea de care s-a scris
   * odata — nu purtarea care trebuie. Acum se cere ca `bazaInclusa` sa fie CITITA, si formula sa
   * fie aceeasi cu cea din `placeOrder`.
   */
  assert.match(modal, /personalizare\?\.detalii\.bazaInclusa === false \? 0 : treapta\.subtotal/);
  assert.match(modal, /\+ \(personalizare\?\.supliment \?\? 0\) \* quantity/);
  assert.equal(
    /const productSubtotal = treapta\.subtotal \+ \(personalizare/.test(modal), false,
    "fereastra aduna iar suplimentul peste baza, fara sa citeasca `bazaInclusa`",
  );
});

test("⚠ nicaieri nu se mai construieste payload-ul cu etichete de la client", () => {
  /*
   * Etichetele veneau din browser si ajungeau nemodificate in comanda — adica in hartia dupa care
   * se produce marfa. Serverul le pune acum pe ale lui; forma veche nu mai are voie sa reapara.
   */
  const modal = readFileSync(
    path.resolve(process.cwd(), "src/components/ministore/OrderModal.tsx"), "utf8",
  ).replace(/\r\n/g, "\n");
  assert.equal(
    /\{ type: f\.type, label: f\.label, value:/.test(modal), false,
    "payload-ul poarta iar etichetele scrise de client",
  );
  assert.match(modal, /const customizationPayload = hasCustomization \? personalizare\?\.valori : undefined;/);
});

test("⚠ componenta comuna e SINGURA care deseneaza campurile", () => {
  /*
   * Daca un model si-ar desena propriile controale, ar fi a doua copie — si prima divergenta s-ar
   * fi vazut ca un camp obligatoriu care lipseste doar acolo.
   */
  const fisiere = readdirSync(DIR).filter((f) => f.startsWith("ProductPage") && f.endsWith(".tsx"));
  for (const f of fisiere) {
    const s = sursa(f);
    assert.equal(
      /camp\.type === "dimensiuni"|camp\.type === "butoane"/.test(s), false,
      `${f} isi deseneaza propriile controale de personalizare`,
    );
  }
});
