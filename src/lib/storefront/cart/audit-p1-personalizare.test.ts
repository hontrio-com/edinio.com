import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { lineKey } from "./normalize";
import { cosDupaComanda } from "./consume";
import { cereRevizuire, pretulBucatii } from "./pret-linie";
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

test("⚠ finalizarea arata personalizarea, cu ACELASI ajutor ca sertarul de cos", () => {
  /*
   * ⚠ CE ERA: cosul o arata, finalizarea nu. Omul care scrisese „Robert" pe o cana si „Maria" pe
   * alta vedea la ultimul pas doua randuri identice — acelasi nume, acelasi pret — deci nu putea
   * verifica nimic si nici macar nu putea sti daca apasase de doua ori.
   *
   * ⚠ Se cere si ca ajutorul sa fie ACELASI: doi formatori scrisi separat ar fi ajuns sa numeasca
   * altfel aceleasi alegeri, iar cele doua ecrane s-ar fi contrazis.
   *
   * Proba e pe sursa fiindca proiectul n-are jsdom; ce se cere e o afirmatie structurala.
   */
  const sursa = (r: string) =>
    readFileSync(path.resolve(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");

  const checkout = sursa("src/components/storefront/sections/checkout/CheckoutSummary.tsx");
  /*
   * ⚠ SE CER AMANDOUA CHEMARILE: cea din conditie SI cea din randare. Cerand una singura, proba
   * trecea si cand a doua era inlocuita cu `null` — adica un rand gol randat sub o conditie
   * adevarata. Masurat cu un mutant care a facut exact asta.
   */
  const chemari = (checkout.match(/rezumatPersonalizare\(item\.customization\)/g) ?? []).length;
  assert.ok(
    chemari >= 2,
    `finalizarea cheama ajutorul de ${chemari} ori din 2 (conditia si randarea): ecranul ramane gol`,
  );
  assert.match(
    checkout, /from "@\/lib\/storefront\/cart\/normalize"/,
    "finalizarea si-a scris propriul formator",
  );

  /* Si sertarul foloseste exact acelasi ajutor — altfel „acelasi" n-ar insemna nimic. */
  const sertar = sursa("src/components/storefront/sections/cart/CartDrawerClassic.tsx");
  assert.match(sertar, /rezumatPersonalizare\(item\.customization\)/);
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
