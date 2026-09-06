import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { verificaPersonalizarea } from "./comanda";

/**
 * Poarta personalizarii pe drumul comenzii.
 *
 * ⚠ CE APARA: pana acum serverul scria blobul clientului VERBATIM in `orders.items[].customization`
 * — fara sa verifice ca produsul are personalizare pornita, ca id-urile campurilor exista, ca un
 * camp obligatoriu a fost completat, sau ca adresa unui fisier arata catre depozitul nostru.
 *
 * Adica „Camp obligatoriu" era o regula a BROWSERULUI: cine trimitea cererea de mana o ocolea.
 * Acum e si o poarta de BANI, fiindca personalizarea poate schimba pretul.
 */

const BIZ = "11111111-1111-4111-8111-111111111111";
const ALT_BIZ = "22222222-2222-4222-8222-222222222222";

/*
 * ⚠ GAZDELE NOASTRE SE DECLARA, si proba trebuie sa le declare la fel ca productia.
 *
 * `esteFisierulNostru` cere ca gazda adresei sa fie EXACT una dintre cele configurate. Intr-un
 * mediu fara `R2_PUBLIC_URL` multimea e GOALA si se refuza tot — purtare corecta (fara depozit
 * configurat nu exista incarcari), dar proba trebuie sa puna variabila, altfel ar fi trecut din
 * motivul gresit: ar fi vazut „refuzat" peste tot, inclusiv peste adresa buna.
 *
 * ⚠ Chiar asa a picat prima data, si de-aia scrie aici: fara linia de mai jos, randul care
 * cere `ok` pe `NOSTRU` a dat `eroare`. Perechea „una trece, restul cad" e ce face proba sa
 * insemne ceva; una singura din ele, oricare, se poate satisface si cu o poarta stricata.
 *
 * Variabila se citeste la FIECARE apel (vezi `gazdeleNoastre`), deci o atribuire aici, dupa
 * importuri, ajunge.
 */
process.env.R2_PUBLIC_URL = "https://pub-alnostru.r2.dev";

const NOSTRU = `https://pub-alnostru.r2.dev/products/customizations/${BIZ}/poza.jpg`;

const FOTOTAPET = {
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
      { id: "prot", type: "comutator", label: "Protectie impermeabila", required: false,
        impact: { fel: "pe_m2", suma: 15 } },
    ],
    pret: { fel: "suprafata", campDimensiuni: "dim", tarif: 69, campTarif: "mat", includePretulProdusului: false },
  },
};

test("ACCEPTANTA: serverul socoteste 910 lei, si scrie instantaneul LUI", () => {
  const r = verificaPersonalizarea(
    FOTOTAPET,
    { dim: { latime: 350, inaltime: 250 }, mat: "prm", prot: true },
    BIZ,
  );
  assert.equal(r.fel, "ok");
  if (r.fel !== "ok") return;
  assert.equal(r.date.supliment, 910);
  assert.equal(r.date.bazaInclusa, false);
  assert.equal(r.date.detaliu.aria, 8.75);
  assert.equal(r.date.detaliu.tarifM2, 89);

  /* ⚠ Etichetele sunt cele ale SERVERULUI, si valorile citibile de om. */
  assert.equal(r.date.instantaneu.dim.label, "Dimensiuni");
  assert.equal(r.date.instantaneu.dim.value, "350 x 250 cm");
  assert.deepEqual(r.date.instantaneu.dim.dim, { latime: 350, inaltime: 250, unitate: "cm" });
  assert.equal(r.date.instantaneu.mat.value, "Premium", "in comanda scrie id-ul, nu eticheta");
  assert.equal(r.date.instantaneu.mat.optiuneId, "prm");
  assert.equal(r.date.instantaneu.prot.value, "Da");
});

test("⚠ un camp OBLIGATORIU lipsa REFUZA comanda, nu doar butonul", () => {
  /*
   * Mutantul care o dovedeste: se scoate chemarea `normalizeazaValorile` din poarta. Atunci o
   * cerere trimisa de mana, fara dimensiuni, ar fi trecut — iar comerciantul ar fi primit o
   * comanda de fototapet fara sa stie cat de mare.
   */
  const r = verificaPersonalizarea(FOTOTAPET, { mat: "prm" }, BIZ);
  assert.equal(r.fel, "eroare");
  if (r.fel !== "eroare") return;
  assert.match(r.mesaj, /Dimensiuni/);
});

test("⚠ o optiune care NU EXISTA refuza comanda", () => {
  /*
   * Fara verificarea asta, un client putea cere „Premium" la pretul lui „Standard" trimitand un id
   * inventat: optiunea nu s-ar fi gasit, tariful ar fi cazut pe cel de baza, si marfa Premium ar
   * fi plecat la 69 lei/m² in loc de 89.
   */
  const r = verificaPersonalizarea(
    FOTOTAPET, { dim: { latime: 100, inaltime: 100 }, mat: "aur-masiv" }, BIZ,
  );
  assert.equal(r.fel, "eroare");
});

test("⚠ dimensiunile in afara marginilor refuza comanda", () => {
  const r = verificaPersonalizarea(
    FOTOTAPET, { dim: { latime: 5000, inaltime: 250 }, mat: "std" }, BIZ,
  );
  assert.equal(r.fel, "eroare");
});

test("⚠ PRETUL TRIMIS DE CLIENT E IGNORAT CU TOTUL", () => {
  /*
   * ⚠ CEA MAI IMPORTANTA. Clientul trimite ce a ALES, niciodata cat costa. Chiar daca inventeaza
   * campuri de pret in payload, ele nu ajung nicaieri: serverul citeste definitia lui si pune el
   * suma. Acelasi tipar ca `validateExtras`.
   */
  const cinstit = verificaPersonalizarea(
    FOTOTAPET, { dim: { latime: 350, inaltime: 250 }, mat: "prm", prot: true }, BIZ,
  );
  const mincinos = verificaPersonalizarea(
    FOTOTAPET,
    {
      dim: { latime: 350, inaltime: 250 }, mat: "prm", prot: true,
      supliment: 1, pret: 1, price: 1, tarif: 0.01,
    },
    BIZ,
  );
  assert.equal(cinstit.fel, "ok");
  assert.equal(mincinos.fel, "ok");
  if (cinstit.fel !== "ok" || mincinos.fel !== "ok") return;
  assert.equal(mincinos.date.supliment, 910, "un pret trimis de client a schimbat suma");
  assert.equal(mincinos.date.supliment, cinstit.date.supliment);
  /* Si cheile inventate nu ajung in comanda. */
  assert.deepEqual(Object.keys(mincinos.date.instantaneu).sort(), ["dim", "mat", "prot"]);
});

test("⚠ FISIERUL trebuie sa fie al NOSTRU, si al MAGAZINULUI ASTA", () => {
  /*
   * ⚠ Doua verificari, amandoua cu pret.
   *
   * 1. Sa fie o adresa din depozitul nostru. Fara ea, `value` era un sir liber care ajungea direct
   *    intr-un `<a href>` din panoul comerciantului (`OrderDetailClient.tsx:1041`) — iar un
   *    `javascript:` acolo ruleaza in sesiunea lui autentificata. XSS stocat, trimis prin
   *    formularul public de comanda.
   * 2. Sa fie sub prefixul de incarcari AL MAGAZINULUI, altfel un client putea trimite adresa unei
   *    poze a altui magazin si ea aparea in comanda ca „fisierul incarcat de client".
   */
  const cuPoza = {
    customization: {
      enabled: true,
      fields: [{ id: "p", type: "image", label: "Poza", required: true }],
    },
  };

  assert.equal(verificaPersonalizarea(cuPoza, { p: [NOSTRU] }, BIZ).fel, "ok");

  for (const rea of [
    "javascript:alert(document.cookie)",
    "https://evil.example.com/poza.jpg",
    "data:text/html;base64,PHNjcmlwdD4=",
    `https://pub-alnostru.r2.dev/products/customizations/${ALT_BIZ}/poza.jpg`,
    "https://pub-alnostru.r2.dev/products/alt-produs/poza.jpg",
    /*
     * ⚠ GALEATA STRAINA, CU PREFIXUL SI ID-UL NOASTRE. Asta a fost defectul, si el n-avea
     * nimic de-a face cu prefixul: `r2KeyFromUrl` accepta ORICE `*.r2.dev` — dinadins, fiindca
     * sase alte locuri din proiect se bazeaza pe asta — deci oricine isi facea o galeata R2 in
     * cinci minute, urca ce voia in ea si trimitea adresa. Cheia incepea cu
     * `products/customizations/<id-ul-magazinului>/`, poarta zicea „e a noastra", si fisierul
     * se deschidea din panoul comerciantului ca „incarcat de client".
     */
    `https://galeata-straina.r2.dev/products/customizations/${BIZ}/poza.jpg`,
    /*
     * ⚠ Si gazda se PARSEAZA, nu se cauta ca subsir: `.r2.dev/` poate sta oriunde intr-un sir,
     * inclusiv in calea unui domeniu strain. O poarta scrisa cu `includes(".r2.dev/")` ar fi
     * lasat adresa asta sa treaca.
     */
    `https://evil.example.com/.r2.dev/products/customizations/${BIZ}/poza.jpg`,
    /* ⚠ Gazda buna, dar `http`: legatura se poate schimba pe drum, deci nu e a noastra. */
    `http://pub-alnostru.r2.dev/products/customizations/${BIZ}/poza.jpg`,
  ]) {
    const r = verificaPersonalizarea(cuPoza, { p: [rea] }, BIZ);
    assert.equal(r.fel, "eroare", `a trecut adresa: ${rea}`);
  }
});

test("⚠ produs FARA personalizare: datele trimise se REFUZA, nu se ignora", () => {
  /*
   * Ignorate, ele ar fi disparut tacit: clientul crede ca a comandat o gravura, comerciantul
   * produce o cana simpla. Iar in celalalt sens, comerciantul care tocmai a stins personalizarea
   * ar fi continuat sa primeasca cereri de gravura din paginile ramase deschise.
   */
  assert.equal(verificaPersonalizarea({}, undefined, BIZ).fel, "fara");
  assert.equal(verificaPersonalizarea({}, {}, BIZ).fel, "fara");
  assert.equal(verificaPersonalizarea({}, { gravura: "Robert" }, BIZ).fel, "eroare");
  assert.equal(
    verificaPersonalizarea({ customization: { enabled: false, fields: [] } }, { x: "y" }, BIZ).fel,
    "eroare",
  );
});

test("⚠ produsele VECHI trec neatinse, si fara niciun supliment", () => {
  /* Cele 29 din productie: `text`, `textarea`, `image`, fara pret. */
  const vechi = {
    customization: {
      enabled: true,
      fields: [
        { id: "f1", type: "text", label: "Nume gravat", required: true, max_length: 20 },
        { id: "f2", type: "image", label: "Poza", required: false, max_files: 3 },
      ],
    },
  };
  const r = verificaPersonalizarea(vechi, { f1: "Robert", f2: [] }, BIZ);
  assert.equal(r.fel, "ok");
  if (r.fel !== "ok") return;
  assert.equal(r.date.supliment, 0, "un produs vechi a devenit mai scump");
  assert.equal(r.date.bazaInclusa, true);
  assert.equal(r.date.instantaneu.f1.value, "Robert");
  assert.equal(r.date.instantaneu.f1.label, "Nume gravat");
});

/* ══════════════════════════════════════════════════════════════════════════
   Ca poarta e chiar CABLATA in `placeOrder`
   ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ Probele de deasupra tin FUNCTIA. Cele de aici tin LANTUL: o poarta perfecta pe care n-o cheama
 * nimeni apara exact la fel de mult ca una care nu exista. Se citeste sursa, fiindca actiunea de
 * server nu se poate rula intr-o proba.
 */

function sursaComenzii(): string {
  return readFileSync(
    path.resolve(process.cwd(), "src/lib/actions/order.actions.ts"),
    "utf8",
  ).replace(/\r\n/g, "\n");
}

test("⚠ `placeOrder` CHEAMA poarta, si se opreste la refuz", () => {
  const s = sursaComenzii();
  assert.match(s, /import \{ verificaPersonalizarea \} from "@\/lib\/customization\/comanda";/);
  assert.match(s, /const pers = personalizareaLiniei\(product\.page_sections, data\.customization, data\.business_id\);/);
  assert.match(s, /if \("eroare" in pers\) \{[\s\S]{0,400}?return \{ error: pers\.eroare \};/);
  assert.match(s, /action: "placeOrder\.customizationRejected"/);
});

test("⚠ suplimentul intra in SUBTOTALUL liniei, nu doar in pretul afisat", () => {
  /*
   * Lipit doar pe `unitPrice`, invariantul `suma(price x quantity) == subtotal` s-ar fi rupt —
   * chiar cel pentru care pretul unitar se lasa nerotunjit. Iar pragul de transport gratuit, TVA-ul
   * si factura ar fi socotit mai departe pretul de catalog.
   */
  const s = sursaComenzii();
  assert.match(s, /const subtotalLinie = round2\(\s*\n?\s*\(pers\.bazaInclusa \? mainSubtotal : 0\) \+ pers\.supliment \* cantitate,/);
  assert.match(s, /const subtotal = round2\(subtotalLinie \+ cartSubtotal\);/);
  assert.match(s, /const unitPrice = subtotalLinie \/ cantitate;/);
  /* ⚠ Si ca vechea forma NU mai exista nicaieri: o ramasita ar fi facut cele doua sa divergheze. */
  assert.equal(
    /const subtotal = round2\(mainSubtotal \+ cartSubtotal\);/.test(s),
    false,
    "subtotalul se mai socoteste inca din pretul de catalog",
  );
});

test("⚠ in comanda se scrie INSTANTANEUL SERVERULUI, nu blobul clientului", () => {
  const s = sursaComenzii();
  assert.equal(
    /\.\.\.\(data\.customization && \{ customization: data\.customization \}\)/.test(s),
    false,
    "blobul clientului se scrie inca verbatim in comanda",
  );
  assert.match(s, /\{ customization: pers\.instantaneu, personalizare: pers\.detaliu \}/);
});

test("⚠ un supliment pe m² fara dimensiuni OPRESTE comanda, nu o lasa pe gratis", () => {
  /*
   * ⚠ MASURAT INAINTE DE REPARATIE, pe „Protectie impermeabila +15 lei/m²" peste un produs de
   * 100 de lei, cu campul de dimensiuni OPTIONAL si necompletat:
   *
   *     valori ok: true | constatari: [] | supliment: 0 | PRET 100
   *
   * Comanda pleaca, e „valida", si comerciantul incaseaza ZERO pentru o protectie pe care clientul
   * a cerut-o si o primeste. Nimeni nu afla pana la inventar.
   *
   * ⚠ `pretulPersonalizarii` sare suplimentul dinadins — „nu incasez nimic" e mai putin rau
   * decat „inventez un numar". Greseala n-a fost saritura, ci ca nimeni nu intreba daca ea s-a
   * intamplat.
   *
   * ⚠ Refuzul spune si CE camp cere metrii, ca omul sa stie ce sa completeze.
   */
  const produs = {
    customization: { enabled: true, fields: [
      { id: "dim", type: "dimensiuni", label: "Dimensiuni", required: false, unitate: "cm",
        latime: { min: 100, max: 500 }, inaltime: { min: 70, max: 350 } },
      { id: "prot", type: "comutator", label: "Protectie impermeabila", required: false,
        impact: { fel: "pe_m2", suma: 15 } },
    ] },
  };

  const fara = verificaPersonalizarea(produs, { prot: true }, BIZ);
  assert.equal(fara.fel, "eroare", "comanda a plecat cu protectia pe gratis");
  assert.match(String((fara as { mesaj: string }).mesaj), /Protectie impermeabila/);
  assert.match(String((fara as { mesaj: string }).mesaj), /dimensiunile/i);

  /*
   * ⚠ DOUA PERECHI, si amandoua sunt necesare.
   *
   * Prima: cu dimensiunile completate se incaseaza 8,75 m² x 15 = 131,25 peste catalog.
   * A doua, si cea care apara hotararea de proiectare: cine NU bifeaza protectia nu e obligat sa
   * dea masuri. Fortand campul obligatoriu ori de cate ori exista un pret pe m², fiecare cumparator
   * ar fi platit cu timpul lui o alegere pe care o fac putini.
   */
  const cu = verificaPersonalizarea(produs, { dim: { latime: 350, inaltime: 250 }, prot: true }, BIZ);
  assert.equal(cu.fel, "ok");
  if (cu.fel !== "ok") return;
  assert.equal(cu.date.supliment, 131.25);

  const nimic = verificaPersonalizarea(produs, {}, BIZ);
  assert.equal(nimic.fel, "ok", "cine nu cere nimic pe metru a fost oprit degeaba");
  if (nimic.fel !== "ok") return;
  assert.equal(nimic.date.supliment, 0);
});
