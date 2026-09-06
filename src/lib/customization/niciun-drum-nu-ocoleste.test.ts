import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cerePersonalizarea } from "./definitie";
import { cerePersonalizare } from "@/lib/storefront/variants";
import { slimPageSections } from "@/lib/storefront/catalog-slim";
import { getProductPriceRange } from "@/lib/utils/product-price";

/**
 * Niciun drum nu duce un produs personalizabil in cos fara personalizare.
 *
 * ═══ ⚠ DE CE E O PROBLEMA DE BANI, NU DE DATE ═══
 *
 * Cat timp personalizarea era doar text, un produs ajuns in cos de pe card insemna o comanda fara
 * gravura: neplacut, dar reparabil cu un telefon. De cand personalizarea schimba PRETUL, acelasi
 * drum inseamna un fototapet de 910 lei vandut la 89 — pierderea e a comerciantului, si el o afla
 * abia cand produce marfa.
 *
 * ⚠ Am verificat drumurile UNUL CATE UNUL inainte sa adaug ceva. Cinci pareau neaparate; doua chiar
 * erau. Ofertele (`needsChoice`), pachetele (filtrul de componente), cosurile abandonate (la
 * restaurare) si paginile de produs aveau deja poarta lor — si n-am atins-o.
 */

const RAD = process.cwd();

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF. */
function sursa(relativ: string): string {
  return readFileSync(path.join(RAD, relativ), "utf8").replace(/\r\n/g, "\n");
}

const FOTOTAPET = {
  customization: {
    enabled: true,
    fields: [{ id: "d", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
      latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 } }],
  },
  variants: { enabled: false, options: [] },
};

test("⚠ steagul SUPRAVIETUIESTE slimuirii, altfel cardul nu poate sti nimic", () => {
  /*
   * ⚠ ASTA E TEMELIA CELORLALTE. Pe suprafetele de catalog `page_sections` ajunge in browser taiat
   * de `slimPageSections`, care pastra doar `variants` si `bundle`. Deci intrebarea „cere
   * personalizare?" raspundea „nu" pe TOATE cardurile, oricat de bine ar fi fost pusa poarta.
   *
   * Mutantul care o dovedeste: se scoate ramura din `slimPageSections`. Garzile de mai jos raman
   * scrise in cod si nu mai apara nimic — exact felul de reparatie care arata facuta.
   */
  const slim = slimPageSections(FOTOTAPET);
  assert.ok(slim, "slimuirea a aruncat tot");
  assert.equal(cerePersonalizarea(slim), true, "cardul nu poate sti ca produsul cere personalizare");

  /* ⚠ Si CAMPURILE nu se trimit: un catalog de o mie de produse le-ar purta degeaba. */
  const c = (slim as { customization?: Record<string, unknown> }).customization;
  assert.equal(c?.fields, undefined, "campurile pleaca in browser pe fiecare card");

  /* Un produs obisnuit nu capata steagul. */
  const simplu = slimPageSections({ variants: { enabled: false, options: [] } });
  assert.equal(cerePersonalizarea(simplu), false);
});

test("⚠ cardul din grila DUCE LA PAGINA, nu adauga in cos", () => {
  const s = sursa("src/components/ministore/MiniStoreRenderer.tsx");
  assert.match(s, /import \{ cerePersonalizarea \} from "@\/lib\/customization\/definitie";/);
  /* ⚠ Poarta e INAINTE de `addItem`, altfel linia ar fi deja scrisa cand se ia hotararea. */
  const i = s.indexOf("function handleAddToCart");
  const corp = s.slice(i, s.indexOf("function handleQuickAdd", i));
  const poarta = corp.indexOf("cerePersonalizarea(product.page_sections)");
  const adauga = corp.indexOf("addItem({");
  assert.ok(poarta > 0, "cardul nu verifica personalizarea");
  assert.ok(adauga > 0 && poarta < adauga, "poarta vine DUPA adaugarea in cos");
  /*
   * ⚠ `router.push`, nu o reincarcare intreaga. Fisierul are hotararea scrisa deasupra lui
   * `const router`: o reincarcare trimite ~207 kB in loc de ~45 kB de payload RSC si sare
   * derularea in capul paginii. Prima versiune a garzii mele cerea `window.location.href` — adica
   * ar fi inghetat in proba chiar lucrul pe care fisierul il explica de ce nu se face.
   */
  assert.match(corp, /router\.push\(`\$\{basePath\}\/product\//);
});

test("⚠ blocul de produse din paginile proprii face la fel", () => {
  const s = sursa("src/components/pages/blocks/AddToCartButton.tsx");
  assert.match(s, /import \{ cerePersonalizarea \} from "@\/lib\/customization\/definitie";/);
  const i = s.indexOf("function handleClick");
  const corp = s.slice(i, i + 900);
  const poarta = corp.indexOf("cerePersonalizarea(product.pageSections)");
  const scrie = corp.indexOf("writeLine({");
  assert.ok(poarta > 0, "blocul nu verifica personalizarea");
  assert.ok(scrie > 0 && poarta < scrie, "poarta vine DUPA scrierea liniei");
});

test("⚠ drumurile care erau DEJA aparate au ramas aparate", () => {
  /*
   * ⚠ Le verific ca sa nu le stric si ca sa nu adaug o a doua poarta peste una care exista. Doua
   * porti pe acelasi drum inseamna doua raspunsuri care pot diverge.
   */
  assert.match(
    sursa("src/lib/offers/offers.ts"),
    /needsChoice: hasVariants\(p\.page_sections\) \|\| cerePersonalizare\(p\.page_sections\)/,
    "ofertele nu mai exclud produsele personalizabile",
  );
  assert.match(
    sursa("src/lib/actions/bundle.actions.ts"),
    /!hasVariants\(p\.page_sections\) && !cerePersonalizare\(p\.page_sections\)/,
    "pachetele accepta iar componente personalizabile",
  );
  assert.match(
    sursa("src/lib/abandoned-cart.ts"),
    /if \(hasVariants\(p\.page_sections\) \|\| cerePersonalizare\(p\.page_sections\)\) continue;/,
    "restaurarea cosului abandonat nu mai sare produsele personalizabile",
  );
  for (const model of ["ProductPageClassic", "ProductPageDetailed"]) {
    assert.match(
      sursa(`src/components/storefront/sections/product/${model}.tsx`),
      /!cerePersonalizarea? &&/,
      `${model} arata iar butonul de cos pe produsele personalizabile`,
    );
  }
});

test("⚠ importul CSV nu mai STERGE personalizarea la reimport", () => {
  /*
   * `buildPayload` reconstruieste `page_sections` de la zero din coloanele fisierului, iar
   * actualizarea o scrie INTREAGA. Cheia `customization` nu vine niciodata dintr-un CSV, deci un
   * reimport cu „suprascrie" o radea — cu tot cu tariful pe metru patrat.
   *
   * Comerciantul isi configura fototapetul, isi actualiza preturile din fisier a doua zi, si
   * produsul se intorcea la pretul de catalog. Fara nicio eroare, si fara niciun rand in raportul
   * importului: pentru import, nimic nu esuase.
   */
  /*
   * ⚠ PROBA ASTA A INGHETAT O IMPLEMENTARE, si a picat cand implementarea s-a facut mai buna.
   *
   * Cerea textual `Map<string, unknown>` si `customization: persVeche` — adica forma care tinea
   * DOAR cheia `customization`. Cand reimportul a inceput sa pastreze `page_sections` INTREG
   * (fiindca stergea si `gpsr`, de pe 116 produse vii), proba s-a facut rosie pe o schimbare care
   * repara mai mult decat apara ea.
   *
   * Acum cere REZULTATUL: harta poarta randul intreg, si se citeste intr-o singura interogare.
   * Cheile anume se probeaza in `page-sections-nu-se-pierde.test.ts`.
   */
  const s = sursa("src/lib/import/committer.ts");
  assert.match(s, /const personalizareaVeche = new Map<string, Record<string, unknown>>\(\);/);
  /* ⚠ Se citeste in ACEEASI interogare — la 4000 de randuri, una pe produs ar fi 4000 de drumuri. */
  assert.match(s, /\.select\("id, external_id, page_sections"\)/);
  assert.match(s, /personalizareaVeche\.set\(e\.id as string, veche as Record<string, unknown>\)/);
  assert.match(s, /\.\.\.psVeche,/);
  /* Si ca harta chiar ajunge la scriitor, pe amandoua chemarile. */
  const chemari = (s.match(/scrieProdusele\(admin, businessId, \w+, \w+, personalizareaVeche\)/g) ?? []).length;
  assert.equal(chemari, 2, `harta ajunge la ${chemari} chemari din 2`);
});

test("⚠ SERVERUL refuza liniile personalizabile pe caile care n-au unde sa le tina", () => {
  /*
   * ⚠ INTERFATA CARE ASCUNDE UN BUTON NU E O POARTA DE SECURITATE, si probele de mai sus apara
   * exact interfata: cardul duce la pagina, blocul din paginile proprii la fel. Toate trei sunt
   * reguli ale BROWSERULUI.
   *
   * `placeCartOrder` si `additional_items` sunt exporturi dintr-un modul „use server", adica
   * capete publice. O cerere scrisa de mana cu id-ul unui fototapet trecea de tot restul
   * verificarilor — produs activ, varianta, stoc, trepte — si se pretuia din CATALOG: 89 de lei in
   * loc de 910. Nu date lipsa: bani pierduti de comerciant la fiecare comanda asa.
   *
   * ⚠ Se REFUZA, nu se pretuieste. Sa socotim suplimentul aici ar fi cerut valorile, iar ele nu
   * exista pe drumul asta — nici cosul, nici liniile purtate nu le trimit.
   */
  const s = sursa("src/lib/actions/order.actions.ts");
  assert.match(s, /function linieCarePerePersonalizare\(/, "ajutorul nu mai exista");

  /* Calea COSULUI. */
  assert.match(
    s, /const eroarePers = linieCarePerePersonalizare\(activeProducts, data\.items\);/,
    "`placeCartOrder` nu mai verifica personalizarea",
  );
  assert.match(s, /placeCartOrder\.customizationRequired/, "refuzul de pe cos nu se logheaza");

  /* Liniile PURTATE din formularul de comanda. */
  assert.match(
    s, /linieCarePerePersonalizare\(extraProducts \?\? \[\], data\.additional_items\);/,
    "`additional_items` nu mai verifica personalizarea",
  );
  assert.match(s, /placeOrder\.customizationRequiredInCart/, "refuzul de pe liniile purtate nu se logheaza");

  /*
   * ⚠ Si ca poarta chiar OPRESTE. Fara `return`, ea ar fi doar un rand in jurnal, iar comanda
   * ar fi plecat la pretul de catalog exact ca inainte — cu urma care spune ca stiam.
   */
  for (const m of s.matchAll(/const (eroarePers|eroarePersCos) = linieCarePerePersonalizare[\s\S]{0,400}?\n(\s*)\}/g)) {
    assert.match(m[0], /return \{ error: eroarePers(Cos)? \};/, "poarta logheaza, dar nu opreste comanda");
  }
});

test("⚠ exista UN SINGUR raspuns la „cere personalizare?", () => {
  /*
   * ⚠ ERAU DOUA, cu doua raspunsuri diferite, si diferentele nu erau teoretice:
   *
   *  1. Pe suprafetele de CATALOG, `page_sections` ajunge taiat de `slimPageSections`, care lasa
   *     doar steagul `{ cere: true }` — fara `fields`. Cea din `variants.ts` raspundea „nu" pe
   *     TOATE cardurile, adica exact acolo unde se pune poarta de quick-add.
   *  2. Un camp pe care cititorul il arunca (fara `id`, cu `type` necunoscut) o facea sa spuna
   *     „da" pentru un formular care iese GOL.
   *
   * Noua locuri o importa de langa `hasVariants`, deci numele ramane unde e; doar raspunsul e
   * acum unul singur.
   */
  const s = sursa("src/lib/storefront/variants.ts");
  assert.match(s, /import \{ cerePersonalizarea \} from "@\/lib\/customization\/definitie";/);
  assert.match(s, /return cerePersonalizarea\(pageSections\);/);
  assert.equal(
    /Array\.isArray\(c\.fields\) && c\.fields\.length > 0/.test(s), false,
    "`variants.ts` isi raspunde iar singura, si va diverge de motorul de personalizare",
  );

  /* Si purtarea, nu doar forma: steagul slim trebuie sa fie recunoscut de amandoua numele. */
  assert.equal(cerePersonalizare({ customization: { cere: true } }), true);
  assert.equal(cerePersonalizarea({ customization: { cere: true } }), true);
  assert.equal(cerePersonalizare({ customization: { enabled: true, fields: [{ nimic: 1 }] } }), false,
    "un camp pe care cititorul il arunca face produsul „personalizabil\" degeaba");
});

test("⚠ pretul de pe CARD cunoaste podeaua personalizarii", () => {
  /*
   * ⚠ CE SE VEDEA, masurat: card „89,00 lei", pagina „603,75 lei". De 6,8 ori mai mult, intre
   * doua ecrane, fara ca omul sa fi atins nimic. Iar fara implicite pe laturi pagina scria chiar
   * „0,00 lei" — deci cei 89 nu erau pret de pornire in NICIO configuratie.
   *
   * ⚠ SI NU E DOAR CARDUL. Acelasi numar merge in sortare (`sortare.ts` compara `price_min`),
   * in filtrul de pret si in cel de reduceri (SQL, pe `catalog_produs.price_min`), in insigna de
   * discount, si in datele structurate. De-aia reparatia sta in `getProductPriceRange`, prin care
   * trec toate sase — nu in card.
   */
  const fototapet = {
    customization: {
      enabled: true,
      fields: [
        { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
          latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 } },
        { id: "mat", type: "butoane", label: "Material", required: true,
          optiuni: [
            { id: "std", eticheta: "Standard", impact: { fel: "pe_m2", suma: 69 } },
            { id: "prm", eticheta: "Premium", impact: { fel: "pe_m2", suma: 89 } },
          ] },
      ],
      pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 69, campTarif: "mat",
        includePretulProdusului: false },
    },
  };

  /* 100x70 cm = 0,7 m² x 69 = 48,30. Pretul de catalog (89) nu se incaseaza niciodata. */
  const interval = getProductPriceRange(89, fototapet);
  assert.equal(interval.min, 48.3);
  assert.equal(interval.dePornire, true, "cardul n-ar sti ca numarul e o podea");

  /* ⚠ Perechea: produsele VECHI raman exact cum sunt. Sunt 29 in productie. */
  const vechi = { customization: { enabled: true, fields: [
    { id: "f1", type: "text", label: "Nume gravat", required: true, max_length: 20 },
  ] } };
  const alVechiului = getProductPriceRange(89, vechi);
  assert.equal(alVechiului.min, 89);
  assert.equal(alVechiului.dePornire, undefined, "un produs vechi a capatat „de la\" degeaba");

  /*
   * ⚠ SI PE DATELE SLIMUITE, unde campurile nu mai exista dinadins. Fara ramura asta, cardul
   * din grila — singurul care primeste slimul — ar fi ramas exact ecranul care nu stie nimic.
   */
  const slim = slimPageSections(fototapet, 89);
  assert.deepEqual(slim?.customization, { cere: true, dePornire: true });
  assert.equal(getProductPriceRange(48.3, slim).dePornire, true);
  assert.deepEqual(
    slimPageSections(vechi, 89)?.customization, { cere: true },
    "un produs vechi a capatat steagul de podea",
  );
});

test("⚠ butonul cardului SPUNE ce face, nu ce ar vrea clientul sa faca", () => {
  /*
   * Un produs personalizabil nu e „variabil", deci cardul cadea pe ultima ramura si promitea
   * „Adauga in cos" — dar apasarea duce la pagina produsului. Clientul citeste „butonul e stricat"
   * sau „am dat gresit click pe poza", nu „produsul asta trebuie configurat intai" — mai ales ca
   * in cosul aceluiasi magazin `CartRecommendations` arata corect o sageata in loc de buton.
   *
   * ⚠ Doua controale, aceeasi intrebare, doua raspunsuri vizuale opuse — asta e ce se repara.
   * Hotararea RAMANE in handler (doua porti pe acelasi drum pot diverge); aici se cere doar ca
   * eticheta sa se socoteasca din acelasi predicat.
   */
  for (const [fisier, semn] of [
    ["src/components/storefront/product/ProductCard.tsx", "cerePersonalizarea(product.page_sections)"],
    ["src/components/pages/blocks/AddToCartButton.tsx", "cerePersonalizarea(product.pageSections)"],
  ] as const) {
    const s = sursa(fisier);
    assert.ok(s.includes(`const cerePersonalizare = ${semn};`), `${fisier} nu intreaba deloc`);
    assert.match(s, /Personalizeaza/, `${fisier} promite inca altceva decat face`);
  }
});

test("⚠ cardul pastreaza „de la” si dupa ce comerciantul face ce-i cere platforma", () => {
  /*
   * ⚠ ZIUA 2 DIN SCENARIU, si e chiar drumul pe care il indica platforma.
   *
   * Poarta de feed scoate fototapetul din Google si ii scrie comerciantului „pretul din catalog
   * [trebuie sa devina] chiar pretul de pornire". El pune 48,30 — produsul se intoarce in feeduri,
   * si pana la reparatie cardul isi pierdea tacut „de la", pe un produs care se vinde pana la
   * 1557 de lei.
   */
  const fototapet = {
    customization: {
      enabled: true,
      fields: [
        { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
          latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 } },
        { id: "mat", type: "butoane", label: "Material", required: true, optiuni: [
          { id: "std", eticheta: "Standard", impact: { fel: "pe_m2", suma: 69 } },
          { id: "prm", eticheta: "Premium", impact: { fel: "pe_m2", suma: 89 } },
        ] },
      ],
      pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 69, campTarif: "mat",
        includePretulProdusului: false },
    },
  };

  /* Ziua 1: catalog 89 — cardul spune „de la 48,30". */
  assert.equal(getProductPriceRange(89, fototapet).dePornire, true);

  /* Ziua 2: catalog 48,30 — podeaua e chiar catalogul, si „de la" TREBUIE sa ramana. */
  const ziua2 = getProductPriceRange(48.3, fototapet);
  assert.equal(ziua2.min, 48.3);
  assert.equal(ziua2.dePornire, true, "cardul si-a pierdut „de la” exact cand nu trebuia");

  /* Si in payload-ul slim, de unde il citeste cardul din grila. */
  assert.deepEqual(
    slimPageSections(fototapet, 48.3)?.customization,
    { cere: true, dePornire: true },
  );
});
