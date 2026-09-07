import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  adresaDeEditare,
  cheiaDeEditat,
  incheie,
  inlocuiesteLinia,
  liniaDeEditat,
  porneste,
  SLOT_EDITARE,
  type StocareLinie,
} from "./editare";
import { lineKey, type CartItem } from "./normalize";
import { optiunileDinTitlu } from "@/lib/storefront/variants";
import { normalizeazaDefinitia } from "@/lib/customization/definitie";
import { valorileDinLinie } from "@/lib/customization/valori";

/**
 * ═══ EDITAREA UNEI LINII PERSONALIZATE, DIN COS ═══
 *
 * Cine gresea o gravura n-avea pana acum decat sa stearga linia si s-o ia de la zero — cu tot cu
 * pozele incarcate. Iar cosul chiar ii CEREA asta pe liniile invechite („deschide produsul si
 * alege din nou"), fara sa-i dea unde.
 *
 * ⚠ SI DE CE E O REPARATIE CU DINTI: singura data cand codul asta greseste, greseala se SCRIE in
 * `localStorage` — o linie in plus (omul plateste de doua ori) sau una in minus (produsul dispare
 * din cos fara sa fi cerut nimeni). Probele de aici stau pe cele trei cazuri ale inlocuirii.
 */

const sursa = (r: string) => readFileSync(path.resolve(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");

function stocareFalsa(initial: Record<string, string> = {}): StocareLinie & { date: Record<string, string> } {
  const date = { ...initial };
  return {
    date,
    getItem: (k) => (k in date ? date[k] : null),
    setItem: (k, v) => { date[k] = v; },
    removeItem: (k) => { delete date[k]; },
  };
}

/** O stocare care ARUNCA — navigare privata, sau stocare inchisa pe site. */
const stocareStricata: StocareLinie = {
  getItem: () => { throw new Error("SecurityError"); },
  setItem: () => { throw new Error("QuotaExceededError"); },
  removeItem: () => { throw new Error("SecurityError"); },
};

const linie = (peste: Partial<CartItem> = {}): CartItem => ({
  productId: "p1",
  slug: "cana",
  name: "Cana",
  price: 40,
  imageUrl: null,
  quantity: 1,
  ...peste,
});

/* ═══════════════════════════════════════════════════════════════════════════
   CE CALATORESTE, SI PE UNDE
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ prin adresa nu trece nimic din ce a scris clientul", () => {
  /*
   * ⚠ AFIRMATIA CARE APARA HOTARAREA. `lineKey` poarta personalizarea intreaga: numele copilului,
   * gravura, cheile fisierelor incarcate. Pusa in adresa, ea ar fi ajuns in fiecare jurnal de acces
   * prin care trece pagina, si s-ar fi lipit de link cand omul il da mai departe.
   */
  const cu = linie({ customization: { gravura: "Robert", poze: ["a/b/copil.jpg"] } });
  const adresa = adresaDeEditare("/magazin", cu)!;
  assert.ok(adresa, "nu s-a construit nicio adresa");
  for (const secret of ["Robert", "copil.jpg", "gravura"]) {
    assert.ok(!adresa.includes(secret), `„${secret}" a ajuns in adresa`);
  }
  assert.equal(adresa, "/magazin/product/cana?editeaza=1");
});

test("⚠ fara `slug` nu se deseneaza niciun buton", () => {
  /* Liniile salvate inainte de `slug` n-au cheia — un buton catre 404 e mai rau decat lipsa lui. */
  assert.equal(adresaDeEditare("/magazin", { slug: undefined }), null);
  assert.equal(adresaDeEditare("/magazin", { slug: "" }), null);
});

test("⚠ STEAGUL SI STOCAREA, amandoua sau nimic", () => {
  const st = stocareFalsa();
  assert.equal(porneste("cheia-mea", st), true);
  assert.equal(st.date[SLOT_EDITARE], "cheia-mea");

  assert.equal(cheiaDeEditat("?editeaza=1", st), "cheia-mea");

  /*
   * ⚠ FARA STEAG NU SE EDITEAZA NIMIC, chiar daca cheia a ramas in fila. Altfel o vizita
   * obisnuita la pagina produsului, mai tarziu, ar fi redeschis editarea unei linii uitate —
   * si „Adauga in cos" ar fi devenit, fara ca omul sa ceara, „inlocuieste linia aia".
   */
  assert.equal(cheiaDeEditat("", st), null, "s-a editat fara steag");
  assert.equal(cheiaDeEditat("?altceva=1", st), null, "alt parametru a tinut loc de steag");
  assert.equal(cheiaDeEditat(null, st), null);

  /* ⚠ SI FARA CHEIE NU SE EDITEAZA, chiar cu steag: pagina cade pe „adauga in cos". */
  assert.equal(cheiaDeEditat("?editeaza=1", stocareFalsa()), null, "steagul singur a pornit o editare");
});

test("⚠ o stocare care ARUNCA nu porneste o editare oarba", () => {
  /*
   * ⚠ CE S-AR FI INTAMPLAT ALTFEL: in navigare privata `sessionStorage.setItem` arunca. Daca
   * `porneste` ar fi raportat reusita, butonul ar fi navigat cu steagul, pagina n-ar fi gasit
   * nicio cheie — si „Salveaza modificarile" ar fi ADAUGAT o linie noua langa cea veche. Omul ar
   * fi platit acelasi fototapet de doua ori.
   */
  assert.equal(porneste("cheia-mea", stocareStricata), false);
  assert.equal(cheiaDeEditat("?editeaza=1", stocareStricata), null);
  assert.doesNotThrow(() => incheie(stocareStricata));
});

test("⚠ incheierea sterge cheia — altfel urmatoarea deschidere reintra in editare", () => {
  const st = stocareFalsa();
  porneste("cheia-mea", st);
  incheie(st);
  assert.equal(cheiaDeEditat("?editeaza=1", st), null);
});

test("⚠ linia se cauta dupa CHEIE, nu dupa pozitie", () => {
  const a = linie({ customization: { g: "Robert" } });
  const b = linie({ customization: { g: "Maria" } });
  assert.equal(liniaDeEditat([a, b], lineKey(b))?.customization?.g, "Maria");
  assert.equal(liniaDeEditat([a, b], "cheie-care-nu-exista"), null);
  assert.equal(liniaDeEditat([a, b], null), null);
});

/* ═══════════════════════════════════════════════════════════════════════════
   INLOCUIREA — cele trei cazuri
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ o linie NESCHIMBATA ramane in cos — capcana lui „adauga apoi sterge”", () => {
  /*
   * ⚠ CHIAR DEFECTUL DE LA CARE A PLECAT `inlocuiesteLinia`. Cu doua chemari, editarea unei linii
   * pe care omul o deschide si o salveaza fara sa schimbe nimic ar fi: crescut cantitatea la 2
   * (`addItem` gaseste aceeasi cheie), apoi STERS tot randul (`removeItem` sterge dupa cheie,
   * adica randul contopit). Produsul disparea din cos, si nimic nu i-o spunea.
   */
  const a = linie({ customization: { g: "Robert" }, quantity: 3 });
  const cos = [a, linie({ productId: "p2", slug: "tricou", name: "Tricou" })];
  const dupa = inlocuiesteLinia(cos, lineKey(a), { ...a }, 3);
  assert.equal(dupa.length, 2, "cosul si-a schimbat numarul de linii");
  assert.equal(dupa[0].quantity, 3, "cantitatea s-a schimbat singura");
  assert.equal(dupa[0].customization?.g, "Robert");
});

test("⚠ linia noua ii ia LOCUL celei vechi, nu coada cosului", () => {
  const a = linie({ productId: "p0", slug: "a", name: "A" });
  const tinta = linie({ customization: { g: "Robert" }, quantity: 2 });
  const c = linie({ productId: "p2", slug: "c", name: "C" });
  const dupa = inlocuiesteLinia([a, tinta, c], lineKey(tinta), { ...tinta, customization: { g: "Maria" } }, 2);
  assert.equal(dupa.length, 3);
  /*
   * ⚠ POZITIA E PARTE DIN REPARATIE, nu cosmetica: pusa la coada, linia ar fi sarit de sub ochii
   * omului tocmai in clipa in care se uita la ea, si el ar fi crezut ca s-a sters.
   */
  assert.equal(dupa[1].customization?.g, "Maria", "linia editata nu e pe locul ei");
  assert.equal(dupa[0].name, "A");
  assert.equal(dupa[2].name, "C");
  assert.equal(dupa[1].quantity, 2, "cantitatea nu s-a pastrat");
});

test("⚠ doua linii ajunse identice se CONTOPESC, cu cantitatile adunate", () => {
  /*
   * Omul avea o cana „Robert" (1 buc) si una „Maria" (2 buc). Editeaza „Robert" ca sa scrie tot
   * „Maria". Lasate doua randuri, cosul ar fi aratat doua linii pe care ochiul nu le poate deosebi
   * — chiar paguba de la care a plecat `lineKey`.
   */
  const robert = linie({ customization: { g: "Robert" }, quantity: 1 });
  const maria = linie({ customization: { g: "Maria" }, quantity: 2 });
  const dupa = inlocuiesteLinia([robert, maria], lineKey(robert), { ...robert, customization: { g: "Maria" } }, 1);
  assert.equal(dupa.length, 1, "au ramas doua randuri identice");
  assert.equal(dupa[0].quantity, 3, "cantitatile nu s-au adunat");
  assert.equal(dupa[0].customization?.g, "Maria");
});

test("⚠ linia stearsa intre timp se ADAUGA, nu se pierde ce a completat omul", () => {
  /* Se intampla cand omul goleste cosul din alta fila cat timp completeaza. */
  const alta = linie({ productId: "p2", slug: "tricou", name: "Tricou" });
  const noua = linie({ customization: { g: "Robert" } });
  const dupa = inlocuiesteLinia([alta], "cheie-disparuta", noua, 2);
  assert.equal(dupa.length, 2);
  assert.equal(dupa[1].customization?.g, "Robert");
  assert.equal(dupa[1].quantity, 2);
});

test("⚠ cantitatea trece prin aceeasi clema ca peste tot in cos", () => {
  const a = linie({ customization: { g: "Robert" } });
  assert.equal(inlocuiesteLinia([a], lineKey(a), { ...a }, 0)[0].quantity, 1, "zero a trecut");
  assert.equal(inlocuiesteLinia([a], lineKey(a), { ...a }, -5)[0].quantity, 1, "un numar negativ a trecut");
  assert.equal(inlocuiesteLinia([a], lineKey(a), { ...a }, 2.7)[0].quantity, 2, "o fractie a trecut nerotunjita");
});

/* ═══════════════════════════════════════════════════════════════════════════
   CE SE RESTAUREAZA PE PAGINA
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ varianta se restaureaza doar cand titlul se citeste FARA dubiu", () => {
  const optiuni = [
    { id: "o1", name: "Marime", values: ["S", "M"] },
    { id: "o2", name: "Culoare", values: ["Rosu", "Alb / Crem"] },
  ];
  assert.deepEqual(
    optiunileDinTitlu(optiuni, "M / Rosu"),
    { Marime: "M", Culoare: "Rosu" },
  );

  /*
   * ⚠ CAZUL PENTRU CARE SE NUMARA BUCATILE. „Alb / Crem" contine chiar separatorul: taiat orb,
   * „S / Alb / Crem" da TREI bucati pentru DOUA optiuni.
   */
  assert.equal(optiunileDinTitlu(optiuni, "S / Alb / Crem"), null, "un titlu ambiguu a fost ghicit");

  /*
   * ⚠ SI ACESTA E CAZUL CARE CHIAR DOARE — prima varianta a probei nu-l avea, si un mutant care
   * stergea numaratoarea trecea verde.
   *
   * Aici prefixul taiat e el insusi o valoare DECLARATA: combinatia adevarata e „Rosu / Mat", dar
   * „Rosu" exista si el in lista. Fara numaratoare, citirea se opreste dupa doua bucati si
   * intoarce o potrivire perfect plauzibila — ALTA decat cea din cos. Omul ar fi apasat „Salveaza"
   * pe o varianta pe care n-a ales-o niciodata, si ar fi primit-o acasa.
   */
  const capcana = [
    { id: "o1", name: "Marime", values: ["S"] },
    { id: "o2", name: "Finisaj", values: ["Rosu", "Rosu / Mat"] },
  ];
  assert.equal(
    optiunileDinTitlu(capcana, "S / Rosu / Mat"), null,
    "titlul s-a citit pe jumatate, si a iesit ALTA varianta",
  );
  /* Iar combinatia care CHIAR se poate citi se citeste — altfel proba ar fi cerut doar refuzuri. */
  assert.deepEqual(optiunileDinTitlu(capcana, "S / Rosu"), { Marime: "S", Finisaj: "Rosu" });

  /* ⚠ Si o valoare care nu mai exista in optiuni (comerciantul a sters-o) nu se restaureaza. */
  assert.equal(optiunileDinTitlu(optiuni, "XL / Rosu"), null, "o valoare disparuta a fost restaurata");
  assert.equal(optiunileDinTitlu(optiuni, "M"), null, "un titlu incomplet a trecut");
  assert.equal(optiunileDinTitlu(optiuni, null), null);
  assert.equal(optiunileDinTitlu([], "M / Rosu"), null);
});

test("⚠ valorile aduse din cos se filtreaza prin definitia de ACUM", () => {
  const d = normalizeazaDefinitia({
    enabled: true,
    fields: [
      { id: "gravura", type: "text", label: "Gravura", required: true },
      { id: "culoare", type: "color", label: "Culoare", required: false, default_color: "#ff0000" },
    ],
  })!;

  const iesit = valorileDinLinie(d, { gravura: "Robert", campSters: "ceva ce nu se mai vede" });
  assert.equal(iesit.gravura, "Robert", "valoarea completata s-a pierdut");
  /*
   * ⚠ AFIRMATIA CARE APARA FILTRUL. Turnata intreaga, valoarea unui camp sters ar fi calatorit
   * mai departe intr-o comanda — invizibila pe ecran, fiindca nimic n-o mai deseneaza, dar tot
   * acolo. Omul ar fi salvat o linie despre care n-avea cum sa stie ce contine.
   */
  assert.ok(!("campSters" in iesit), "o valoare de la un camp sters a supravietuit");
  /* ⚠ Iar un camp adaugat DUPA ce omul a pus produsul in cos porneste de la implicitul lui. */
  assert.equal(iesit.culoare, "#ff0000", "campul nou n-a pornit de la implicit");

  /*
   * ⚠ CE A GOLIT OMUL RAMANE GOL — si asta e a doua jumatate a regulii, pe care prima varianta a
   * probei n-o cerea: un mutant care scria `aduse[c.id] ?? out[c.id]` trecea verde.
   *
   * Cine sterge dinadins culoarea de pe o linie (campul e optional) si redeschide editarea trebuie
   * s-o gaseasca stearsa. Cazuta inapoi pe implicitul comerciantului, ea s-ar fi REAPRINS singura
   * — iar la salvare omul ar fi cumparat un rosu pe care tocmai il scosese, fara sa fi atins nimic.
   */
  const golit = valorileDinLinie(d, { gravura: "Robert", culoare: "" });
  assert.equal(golit.culoare, "", "campul golit dinadins s-a reaprins pe implicit");
});

/* ═══════════════════════════════════════════════════════════════════════════
   CELE DOUA MODELE DE PAGINA, SI CELE DOUA SUPRAFETE DE COS
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ AMANDOUA modelele de pagina inlocuiesc linia — nu unul adauga si celalalt inlocuieste", () => {
  /*
   * ⚠ CHIAR TIPARUL PRINS LA `numeroteaza`, dar cu alt pret: reparat doar un model, jumatate din
   * magazine ar fi ADAUGAT o linie in loc s-o inlocuiasca, si omul ar fi platit de doua ori.
   */
  for (const f of [
    "src/components/storefront/sections/product/ProductPageClassic.tsx",
    "src/components/storefront/sections/product/ProductPageDetailed.tsx",
  ]) {
    const v = sursa(f);
    assert.ok(v.includes("cos.replaceItem(editare.cheie, linieNoua"), `${f} nu inlocuieste linia`);
    assert.ok(v.includes("editare.incheieEditarea()"), `${f} lasa steagul pus dupa salvare`);
    assert.ok(v.includes("Salveaza"), `${f} nu-si schimba butonul`);
    assert.ok(v.includes("Renunta la modificari"), `${f} n-are iesire din editare`);
    assert.ok(v.includes("Editezi un produs din cos"), `${f} nu spune omului pe ce ecran e`);
    /* ⚠ „Comanda acum" dispare: lasat, ar fi lasat linia stricata in cos langa o comanda noua. */
    assert.ok(v.includes("{!editare.activ && <CTAButton"), `${f} lasa comanda directa in editare`);
  }
});

test("⚠ butonul „Editeaza” exista in AMANDOUA suprafetele de cos", () => {
  /*
   * Un magazin cu sertar poate ajunge la finalizare fara ca omul sa deschida vreodata pagina
   * cosului. Pus intr-un singur loc, butonul ar fi lipsit tocmai celor care au nevoie de el.
   */
  const piese = sursa("src/components/storefront/sections/cart/_shared/CartPieces.tsx");
  assert.ok(piese.includes("export function ButonEditeaza"), "piesele n-au butonul");
  assert.ok(piese.includes("<ButonEditeaza item={item}"), "pagina de cos nu-l deseneaza");
  const sertar = sursa("src/components/storefront/sections/cart/CartDrawerClassic.tsx");
  assert.ok(sertar.includes("<ButonEditeaza item={item}"), "sertarul nu-l deseneaza");

  /*
   * ⚠ SI INDICATIA DE PE LINIILE INVECHITE URMEAZA CE SE VEDE. Cat timp editarea n-a existat,
   * singurul sfat care se putea da era „ia-o de la capat"; acum, unde butonul e, el e raspunsul.
   */
  for (const [nume, v] of [["paginile de cos", piese], ["sertar", sertar]] as const) {
    assert.ok(v.includes("adresaDeEditare(basePath, item)\n"), `${nume}: indicatia nu se uita la buton`);
  }
});

test("⚠ butonul nu apare pe liniile FARA personalizare", () => {
  /*
   * Pe un produs obisnuit n-ar avea ce edita — pagina s-ar deschide identica, iar „Salveaza" ar
   * fi rescris o linie fara sa fi schimbat nimic. Un buton care nu face nimic e mai rau decat
   * lipsa lui.
   */
  const v = sursa("src/components/storefront/sections/cart/_shared/CartPieces.tsx");
  assert.ok(
    v.includes("const areValori = !!item.customization && Object.keys(item.customization).length > 0;"),
    "butonul nu se uita daca linia are ceva de editat",
  );
  assert.ok(v.includes("if (!areValori || !adresa || !item.slug) return null;"), "butonul se deseneaza oricum");
});

test("⚠ pagina refuza o cheie care arata catre ALT produs", () => {
  /*
   * ⚠ CHEIA VINE DIN `sessionStorage`, adica dintr-un loc pe care il poate scrie orice cod din
   * fila. Necontrolata, o cheie ramasa de la alt produs ar fi facut ca „Salveaza modificarile" de
   * pe pagina cănii sa INLOCUIASCA fototapetul din cos: linia veche disparea, si in locul ei
   * aparea alt produs, la alt pret.
   */
  const v = sursa("src/components/storefront/sections/product/_shared/useEditareLinie.ts");
  assert.ok(
    v.includes("gasita && gasita.productId === productId ? gasita : null"),
    "cheia nu se verifica impotriva produsului paginii",
  );
});

test("⚠ starea adusa din cos se toarna O SINGURA DATA", () => {
  /*
   * `editare.linie` se schimba la fiecare scriere in cos. Fara steag, efectul ar fi turnat
   * valorile vechi peste ce tocmai tasta omul — la propriu: fiecare litera scrisa in campul de
   * gravura ar fi fost inghitita inapoi.
   */
  for (const f of [
    "src/components/storefront/sections/product/ProductPageClassic.tsx",
    "src/components/storefront/sections/product/ProductPageDetailed.tsx",
  ]) {
    const v = sursa(f);
    assert.ok(v.includes("const turnata = useRef(false);"), `${f} n-are steagul de turnare`);
    assert.ok(v.includes("if (turnata.current || !linie) return;"), `${f} toarna la fiecare schimbare`);
  }
});
