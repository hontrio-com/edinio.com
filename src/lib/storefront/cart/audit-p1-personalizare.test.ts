import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { lineKey } from "./normalize";
import { cosDupaComanda } from "./consume";
import { cereRevizuire, pretulBucatii, rezumatulLiniei } from "./pret-linie";
import type { CartItem } from "@/components/storefront/cart/CartProvider";

/**
 * PATRU CONSTATARI DIN AUDITUL GPT (07.09.2026), reparate si aparate.
 *
 * ⚠ Le-am verificat una cate una in cod inainte sa repar ceva: din noua reclamatii P1, patru erau
 * reale, una era falsa ca defect (dar arata o fragilitate adevarata), doua sunt hotarari scrise
 * dinainte, si doua sunt teoretice pe datele de azi. Ce e aici sunt cele care chiar se puteau
 * intampla.
 */

const CANA: CartItem = {
  productId: "p1",
  name: "Cana",
  price: 50,
  quantity: 1,
} as CartItem;

const cu = (c: Record<string, unknown>): CartItem => ({ ...CANA, customization: c } as CartItem);

/* ═══════════════════════════════════════════════════════════════════════════
   P1.1 — linia scoasa din cos dupa comanda
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ se scoate DOAR linia comandata, chiar cand celelalte sunt acelasi produs", () => {
  /*
   * ⚠ RECLAMATIA ERA FALSA CA DEFECT, si merita spus limpede: `lineKey` citea deja personalizarea,
   * iar apelantii dau chiar obiectele din cos, FILTRATE, nu remapate — deci campul era acolo.
   *
   * Fragilitatea era insa adevarata: `LinieCos` nu declara `customization`, deci un apelant care
   * ar fi construit lista prin `.map(i => ({ productId: i.productId }))` — ceva ce tipul PERMITEA
   * — ar fi produs chei care nu se potrivesc cu niciuna din cos. Urmarea: ori nu se scotea nimic,
   * ori se scotea linia gresita, si omul ramanea cu o cana necomandata sau platea de doua ori.
   *
   * Acum tipul o declara, si randurile de aici masoara purtarea.
   */
  const robert = cu({ g: "Robert" });
  const maria = cu({ g: "Maria" });
  const simplu = { ...CANA, productId: "p2", name: "Pahar" } as CartItem;

  const ramas = cosDupaComanda([robert, maria, simplu], [robert]);

  assert.equal(ramas.length, 2, "s-a scos altceva decat linia comandata");
  assert.deepEqual(
    ramas.map((i) => (i.customization as { g?: string } | undefined)?.g ?? i.productId),
    ["Maria", "p2"],
    "a ramas gravura gresita in cos",
  );
});

test("⚠ doua personalizari diferite NU cad pe aceeasi cheie", () => {
  /* Temelia celei de sus: fara ea, „se scoate doar linia comandata" n-ar avea inteles. */
  assert.notEqual(lineKey(cu({ g: "Robert" })), lineKey(cu({ g: "Maria" })));
  /* Si perechea: aceleasi valori, alta ordine a cheilor, dau ACEEASI linie. */
  assert.equal(lineKey(cu({ a: "1", b: "2" })), lineKey(cu({ b: "2", a: "1" })));
});

/* ═══════════════════════════════════════════════════════════════════════════
   P1.5 — amprenta personalizarilor lungi
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ personalizarile lungi care incep la fel raman linii DIFERITE", () => {
  /*
   * ⚠ CE ERA: amprenta avea 32 de biti, iar langa ea scria ca „doua texte diferite nu mai pot da
   * aceeasi cheie". Nu e adevarat — o amprenta are coliziuni, oricat de lunga ar fi — si nu era o
   * subtilitate: intrarea e scrisa de CLIENT. O coliziune nu-l lasa sa fraudeze pretul (serverul
   * repretuieste), dar produce exact paguba de la care s-a plecat: doua personalizari diferite
   * ajung o singura linie cu cantitatea 2.
   *
   * Acum sunt 128 de biti, si comentariul spune ce e adevarat: contopirea cere acelasi prefix de
   * 2.000 de caractere, aceeasi lungime SI aceeasi amprenta.
   */
  const lung = "x".repeat(2400);
  const a = cu({ t: `${lung}AAAA` });
  const b = cu({ t: `${lung}BBBB` });

  assert.notEqual(lineKey(a), lineKey(b), "doua texte lungi diferite s-au contopit intr-o linie");
});

test("⚠ amprenta are 128 de biti, nu 32", () => {
  /*
   * Se masoara pe CHEIE, nu pe functia interna: `amprenta` nu e exportata, si nici n-ar trebui.
   * Bucata de dupa ultimul `#` e amprenta; 32 de caractere hexazecimale inseamna 128 de biti.
   */
  const cheie = lineKey(cu({ t: "y".repeat(3000) }));
  const coada = cheie.slice(cheie.lastIndexOf("#") + 1);
  assert.equal(coada.length, 32, `amprenta are ${coada.length * 4} de biti`);
  assert.match(coada, /^[0-9a-f]{32}$/);
});

test("⚠ personalizarile SCURTE isi pastreaza cheia intreaga, caracter cu caracter", () => {
  /*
   * ⚠ PERECHEA CARE APARA COSURILE DEJA SALVATE. Cheia scurta nu trece prin amprenta deloc; daca
   * ar fi trecut, fiecare cos aflat acum in browserul cuiva s-ar fi repliat gresit la prima
   * deschidere.
   */
  const cheie = lineKey(cu({ g: "Robert" }));
  assert.equal(cheie.includes("#"), false, `cheia scurta a trecut prin amprenta: ${cheie}`);
  assert.match(cheie, /^p1::/);
});

/* ═══════════════════════════════════════════════════════════════════════════
   P1.7 — pretul aratat cand definitia nu se mai potriveste
   ═══════════════════════════════════════════════════════════════════════════ */

/*
 * ⚠ DOUA CAMPURI, SI ASTA E TOT ROSTUL FIXTURII.
 *
 * Cu unul singur, mutantul care scoate `if (!curate.ok)` trecea VERDE: o alegere inexistenta nu
 * aduce niciun supliment, deci pretul iesea 100 in amandoua cazurile si proba nu deosebea nimic.
 * Masurat — asa a si trecut prima oara.
 *
 * Cu doua, nepotrivirea e ADEVARATA: „gravura" se curata si aduce +20, „material" nu se
 * potriveste. Fara paza, cosul aduna suplimentul campului valid dintr-o configuratie INVALIDA si
 * arata 120 ca pe un pret bun.
 */
const REGULA_CU_OPTIUNI = {
  price: 100,
  combos: {},
  tiers: null,
  customization: {
    enabled: true,
    fields: [
      { id: "g", type: "text", label: "Gravura", required: true, max_length: 20,
        impact: { fel: "fix", suma: 20 } },
      { id: "mat", type: "butoane", label: "Material", required: true,
        optiuni: [{ id: "std", eticheta: "Standard", impact: { fel: "fix", suma: 30 } }] },
    ],
  },
};

test("⚠ o alegere care NU mai exista in definitie nu produce un pret plauzibil", () => {
  /*
   * ⚠ CE ERA: `normalizeazaValorile` intoarce `{ ok, valori }`, iar `valori` e o multime PARTIALA
   * cand ceva nu se potriveste. Codul lua `valori` fara sa citeasca `ok` — desi comentariul de
   * deasupra promitea de mult ca se cade pe `null` „cand valorile nu se mai potrivesc cu
   * definitia".
   *
   * Se intampla exact cand comerciantul schimba definitia dupa ce clientul a pus produsul in cos:
   * sterge o optiune, face un camp obligatoriu, stramteaza marginile. Clientul vedea o suma
   * plauzibila si afla abia la finalizare ca nu se poate comanda.
   *
   * ⚠ NU ERA O GAURA DE BANI — serverul repretuieste si refuza — ci o minciuna de ecran, langa un
   * comentariu care promitea o plasa inexistenta.
   */
  const stricata = { ...CANA, customization: { g: "Robert", mat: "premium-sters" } } as CartItem;
  assert.equal(
    pretulBucatii(stricata, REGULA_CU_OPTIUNI), 100,
    "cosul a adunat suplimentul campului valid dintr-o configuratie invalida si l-a aratat ca pret bun",
  );
});

test("⚠ perechea: o alegere VALIDA se pretuieste in continuare", () => {
  /*
   * Fara randul asta, „nu se mai socoteste nimic" ar fi trecut verde si peste o reparatie care
   * strica pretuirea cu totul — adica peste fototapetul vandut la pretul de catalog.
   */
  const bun = { ...CANA, customization: { g: "Robert", mat: "std" } } as CartItem;
  assert.equal(pretulBucatii(bun, REGULA_CU_OPTIUNI), 150, "suplimentele valide nu mai intra in pret");
});

/* ═══════════════════════════════════════════════════════════════════════════
   P1.2 — ultima verificare de dinaintea platii
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ finalizarea arata personalizarea, si o ia din ACELASI loc ca sertarul", () => {
  /*
   * ⚠ CE ERA: cosul o arata, finalizarea nu. Omul care scrisese „Robert" pe o cana si „Maria" pe
   * alta vedea la ultimul pas doua randuri identice — acelasi nume, acelasi pret — deci nu putea
   * verifica nimic si nici macar nu putea sti daca apasase de doua ori.
   *
   * ⚠ AFIRMATIA S-A MUTAT ODATA CU CODUL. Cerea `rezumatPersonalizare(item.customization)`, adica
   * rezumatul din valorile BRUTE — cel care scria id-uri de optiuni in loc de „Premium". Acum toate
   * ecranele cer `lineSummary`, care citeste definitia. Proba nu s-a sters, s-a intors.
   */
  const sursa = (r: string) =>
    readFileSync(path.resolve(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");

  const checkout = sursa("src/components/storefront/sections/checkout/CheckoutSummary.tsx");
  assert.match(
    checkout, /lineSummary\(item\)/,
    "ultimul ecran de dinaintea platii nu arata ce s-a personalizat",
  );
  /* Si sertarul il ia din acelasi loc — altfel „acelasi" n-ar insemna nimic. */
  const sertar = sursa("src/components/storefront/sections/cart/CartDrawerClassic.tsx");
  assert.match(sertar, /lineSummary\(item\)/);
});

/* ═══════════════════════════════════════════════════════════════════════════
   P1.7, jumatatea de interfata — semnalul catre om
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ o configuratie care nu se mai potriveste CERE revizuire", () => {
  /*
   * ⚠ CEALALTA JUMATATE A LUI P1.7. Caderea pe pretul de catalog opreste minciuna de pret — dar
   * TACE. Clientul vede o suma plauzibila si afla abia la finalizare, cand serverul refuza, ca
   * linia nu se poate comanda. Nimic din asta nu e vina lui: comerciantul a schimbat definitia
   * dupa ce el pusese produsul in cos.
   */
  const stricata = { ...CANA, customization: { g: "Robert", mat: "premium-sters" } } as CartItem;
  assert.equal(cereRevizuire(stricata, REGULA_CU_OPTIUNI), true, "linia stricata nu se anunta");
});

test("⚠ o linie BUNA nu se anunta niciodata ca stricata", () => {
  /*
   * ⚠ PERECHEA CARE APARA VANZAREA. Un semnal pus pe linii valide ar speria clientii de pe
   * fiecare cos — mai rau decat tacerea pe care o repara.
   */
  const bun = { ...CANA, customization: { g: "Robert", mat: "std" } } as CartItem;
  assert.equal(cereRevizuire(bun, REGULA_CU_OPTIUNI), false, "o linie valida se anunta ca stricata");
  /* Si un produs fara personalizare deloc. */
  assert.equal(cereRevizuire(CANA, REGULA_CU_OPTIUNI), false);
});

test("⚠ pana ajung preturile, nicio linie nu e aratata ca stricata", () => {
  /*
   * ⚠ Preturile ajung in browser ASINCRON. Pana atunci `regula` lipseste — si daca lipsa ar
   * insemna „stricata", fiecare cos ar fi clipit rosu la fiecare incarcare de pagina, pe linii
   * perfect bune.
   *
   * Se cere sa STIM ca nu se potriveste, nu doar sa nu stim ca se potriveste.
   */
  const oricare = { ...CANA, customization: { g: "Robert" } } as CartItem;
  assert.equal(cereRevizuire(oricare, undefined), false, "linia clipeste rosu pana ajung preturile");
});

test("⚠ produsul caruia i s-a STINS personalizarea cere revizuire", () => {
  /*
   * Cazul care nu se vede din formule: linia poarta valori, dar produsul nu mai are personalizare
   * deloc. Serverul o va refuza (`verificaPersonalizarea` intoarce „fara" si atunci datele
   * trimise se refuza), deci omul trebuie sa afle acum, nu la plata.
   */
  const cuValori = { ...CANA, customization: { g: "Robert" } } as CartItem;
  assert.equal(cereRevizuire(cuValori, { price: 100, combos: {}, tiers: null, customization: null }), true);
});

test("⚠ semnalul se vede in TOATE cele trei suprafete, nu doar in una", () => {
  /*
   * ⚠ O LISTA DE LOCURI E O MOSTRA, NU MULTIMEA. Cosul are un sertar SI trei modele de pagina
   * (care impart `CartPieces`), iar finalizarea are rezumatul ei. Pus intr-unul singur, omul care
   * cumpara din sertar — sau care ajunge direct la finalizare — n-ar fi aflat nimic.
   */
  const sursa = (r: string) =>
    readFileSync(path.resolve(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");

  for (const [fisier, ce] of [
    ["src/components/storefront/sections/cart/_shared/CartPieces.tsx", "cele trei pagini de cos"],
    ["src/components/storefront/sections/cart/CartDrawerClassic.tsx", "sertarul de cos"],
    ["src/components/storefront/sections/checkout/CheckoutSummary.tsx", "finalizarea"],
  ] as const) {
    const s = sursa(fisier);
    assert.match(s, /lineNeedsReview\(item\)/, `${ce} nu arata semnalul`);
    assert.match(s, /Necesita actualizare/, `${ce} nu spune omului ce are de facut`);
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   REZUMATUL LINIEI — ce vede omul inainte sa plateasca
   ═══════════════════════════════════════════════════════════════════════════ */

/** Fototapetul din audit: dimensiuni, un tarif ales din butoane, si o protectie pe comutator. */
const FOTOTAPET = {
  price: 89,
  combos: {},
  tiers: null,
  customization: {
    enabled: true,
    fields: [
      { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: true, unitate: "cm",
        latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 } },
      { id: "mat", type: "butoane", label: "Material", required: true, optiuni: [
        { id: "9c8409f1-8bdf-4a10-9d2e-000000000001", eticheta: "Standard", impact: { fel: "pe_m2", suma: 69 } },
        { id: "9c8409f1-8bdf-4a10-9d2e-000000000002", eticheta: "Premium", impact: { fel: "pe_m2", suma: 89 } },
      ] },
      { id: "prot", type: "comutator", label: "Protectie impermeabila", required: false,
        impact: { fel: "pe_m2", suma: 15 } },
    ],
  },
};

const LINIE_FOTOTAPET = {
  ...CANA,
  customization: {
    dim: { latime: 350, inaltime: 250 },
    mat: "9c8409f1-8bdf-4a10-9d2e-000000000002",
    prot: true,
  },
} as CartItem;

test("⚠ rezumatul arata ETICHETA optiunii, nu id-ul ei", () => {
  /*
   * ⚠ CE VEDEA CLIENTUL PANA PE 07.09.2026: „350 x 250 · 9c8409f1-8bdf-4a10…".
   *
   * Rezumatul de dinainte lucra pe valorile BRUTE din cos, iar la `butoane` valoarea e ID-ul
   * optiunii — un UUID facut de panou. Serverul si instantaneul comenzii erau corecte de mult;
   * minciuna era doar INAINTE de comanda, adica exact acolo unde omul verifica ce cumpara.
   */
  const r = rezumatulLiniei(LINIE_FOTOTAPET, FOTOTAPET);
  assert.match(r, /Premium/, `rezumatul nu numeste optiunea aleasa: ${r}`);
  assert.doesNotMatch(r, /9c8409f1/, `rezumatul arata id-ul optiunii clientului: ${r}`);
});

test("⚠ comutatorul PORNIT se vede, cu numele campului langa el", () => {
  /*
   * ⚠ VECHIUL REZUMAT IL ARUNCA CU TOTUL: `if (v === true) continue;`. Deci „Protectie
   * impermeabila: Da" nu aparea NICIODATA — desi se si platea, 15 lei pe metru patrat.
   *
   * ⚠ Si se pune ETICHETA: „Da" singur nu inseamna nimic. „Premium" si „350 × 250 cm" se citesc
   * singure, deci ele raman fara.
   */
  const r = rezumatulLiniei(LINIE_FOTOTAPET, FOTOTAPET);
  assert.match(r, /Protectie impermeabila: Da/, `comutatorul pornit nu se vede: ${r}`);
});

test("⚠ dimensiunile poarta UNITATEA comerciantului", () => {
  const r = rezumatulLiniei(LINIE_FOTOTAPET, FOTOTAPET);
  assert.match(r, /350 × 250 cm/, `dimensiunile ies fara unitate: ${r}`);
});

test("⚠ rezumatul intreg, in ordinea campurilor din definitie", () => {
  /*
   * ⚠ ORDINEA E A DEFINITIEI, nu a cheilor trimise de browser: doi clienti care completeaza
   * aceleasi campuri in alta ordine trebuie sa vada acelasi rand.
   */
  assert.equal(
    rezumatulLiniei(LINIE_FOTOTAPET, FOTOTAPET),
    "350 × 250 cm · Premium · Protectie impermeabila: Da",
  );
});

test("⚠ comutatorul STINS nu se vede — altfel randul s-ar umple de „Nu”", () => {
  const stins = { ...LINIE_FOTOTAPET, customization: { ...LINIE_FOTOTAPET.customization as object, prot: false } } as CartItem;
  const r = rezumatulLiniei(stins, FOTOTAPET);
  assert.doesNotMatch(r, /Protectie/, `un comutator stins umple randul: ${r}`);
  assert.match(r, /Premium/, "restul rezumatului s-a pierdut odata cu comutatorul");
});

test("⚠ pana ajunge definitia, se cade pe rezumatul vechi — nu pe nimic", () => {
  /*
   * Preturile vin asincron. Un rezumat GOL in clipa aia ar face doua linii personalizate diferit
   * sa arate identic — chiar defectul de la care a plecat tot helperul.
   */
  const r = rezumatulLiniei(LINIE_FOTOTAPET, undefined);
  assert.notEqual(r, "", "linia ramane fara niciun semn distinctiv pana ajung preturile");
  assert.match(r, /350 x 250/, "rezumatul de rezerva nu mai arata nimic recognoscibil");
});

test("⚠ toate cele patru ecrane cheama ACELASI rezumat", () => {
  /*
   * ⚠ Sertarul, cele trei modele de pagina de cos (prin `CartPieces`) si finalizarea. Scrise
   * separat, cele patru ar fi numit altfel aceleasi alegeri — iar clientul care trece din cos in
   * finalizare ar fi vazut alt text pentru acelasi produs.
   */
  const sursa = (r: string) =>
    readFileSync(path.resolve(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");

  for (const f of [
    "src/components/storefront/sections/cart/_shared/CartPieces.tsx",
    "src/components/storefront/sections/cart/CartDrawerClassic.tsx",
    "src/components/storefront/sections/checkout/CheckoutSummary.tsx",
  ]) {
    const s = sursa(f);
    assert.match(s, /lineSummary\(item\)/, `${f} nu foloseste rezumatul comun`);
    assert.doesNotMatch(
      s, /rezumatPersonalizare\(item\.customization\)/,
      `${f} inca foloseste rezumatul din valorile brute, care arata id-uri de optiuni`,
    );
  }
});

test("⚠ un titlu de varianta cu `::` nu poate imita o alta linie", () => {
  /*
   * ⚠ CAZUL EXOTIC, dar identitatea comerciala a unei linii nu se sprijina pe „nimeni n-o sa scrie
   * asta". Cheia se compune lipind bucati cu `::`, deci un titlu care contine chiar `::` putea
   * reproduce inceputul altei linii — si doua linii diferite cadeau pe o singura cheie, cu
   * cantitatea 2.
   */
  const a = { ...CANA, variantTitle: 'X::{"g":"Robert"}' } as CartItem;
  const b = { ...CANA, variantTitle: "X", customization: { g: "Robert" } } as CartItem;
  assert.notEqual(lineKey(a), lineKey(b), "doua linii diferite au ajuns la aceeasi cheie");
});

test("⚠ titlurile OBISNUITE isi pastreaza cheia caracter cu caracter", () => {
  /*
   * ⚠ PERECHEA CARE APARA COSURILE DEJA SALVATE. Escapand fiecare `:`, orice cos cu variante aflat
   * acum in browserul cuiva s-ar fi repliat gresit la prima deschidere. Se escapeaza DOAR `::`.
   */
  assert.equal(lineKey({ ...CANA, variantTitle: "Marimea: L" } as CartItem), "p1::Marimea: L");
  assert.equal(lineKey({ ...CANA, variantTitle: "Rosu / L" } as CartItem), "p1::Rosu / L");
  assert.equal(lineKey(CANA), "p1");
});
