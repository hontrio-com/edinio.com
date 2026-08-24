import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  alegeSupplyLeadTime, bandaDePret, construiesteOferte, imaginiEmag, masuratoriEmag,
  normalizeazaPartNumber, partNumberCombinatie, pretFaraTva,
  type ContextCategorie, type ContextMagazin, type ProdusDeCartografiat, oferteUsoare, stocuriDeTrimis} from "./mapping";

/*
 * Cartografierea produs Edinio → oferta eMAG.
 *
 * Fisier separat de `emag.test.ts` fiindca aici se probeaza singura parte in care
 * doua modele diferite se lovesc unul de altul: noi tinem UN produs cu combinatii
 * intr-un JSON, eMAG vrea N OFERTE separate legate printr-o familie.
 *
 * Toate functiile probate sunt pure. Niciun apel de retea, nicio citire din baza.
 */

const MAGAZIN: ContextMagazin = {
  vat_rate: 21,
  prices_include_vat: true,
  vat_id: 1,
  handling_time: 1,
  warehouse_id: 1,
  warranty: 24,
  price_band_pct: 30,
  source_language: "ro_RO",
  brand: "Edinio",
};

const CATEGORIE: ContextCategorie = { category_id: 506, characteristics: [], family_type_id: 95 };

function produs(peste: Partial<ProdusDeCartografiat> = {}): ProdusDeCartografiat {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Tricou bumbac",
    description: "<p>Descriere</p>",
    price: 121,
    compare_at_price: null,
    images: ["https://edinio-cdn.com/a.jpg", "https://edinio-cdn.com/b.jpg"],
    category: "Tricouri",
    sku: "TRI 001;",
    weight_grams: 250,
    stock_quantity: 10,
    is_active: true,
    page_sections: {},
    ...peste,
  };
}

function cuVariante(combinatii: { title: string; sku: string; stoc: string; pret: string }[]): ProdusDeCartografiat {
  return produs({
    page_sections: {
      variants: {
        enabled: true,
        options: [{ id: "o1", name: "Marime", values: combinatii.map((c) => c.title) }],
        combinations: combinatii.map((c) => ({
          id: c.title.toLowerCase(),
          title: c.title,
          price: c.pret,
          compare_at_price: "",
          sku: c.sku,
          stock_quantity: c.stoc,
          image: "",
          enabled: true,
        })),
      },
    },
  });
}

/* ── Pretul ───────────────────────────────────────────────────────────────── */

test("eMAG: pretul pleaca FARA TVA, in amandoua sensurile lui `prices_include_vat`", () => {
  /*
   * ⚠ Toate cele patru preturi ale lor sunt „without VAT". Trimis gresit, nu da
   * nicio eroare: oferta se publica si se vinde cu pretul umflat sau subtiat cu
   * cota de TVA. La 21%, o cincime din pret.
   */
  assert.equal(pretFaraTva(121, 21, true), 100, "121 cu TVA 21% inseamna 100 fara");
  assert.equal(pretFaraTva(100, 21, false), 100, "cand pretul e deja fara TVA, ramane");
  assert.equal(pretFaraTva(0, 21, true), 0);
  assert.equal(pretFaraTva(-5, 21, true), 0);
});

test("eMAG: pretul se rotunjeste la PATRU zecimale, nu la doua", () => {
  /*
   * Rotunjit la doua, 99,99 cu TVA ar iesi 82,64 in loc de 82,6364, iar inapoi cu
   * TVA ar da 99,9944 — comerciantul vede pe eMAG alt pret decat in magazin si
   * crede ca s-a stricat ceva.
   */
  assert.equal(pretFaraTva(99.99, 21, true), 82.6364);
});

test("eMAG: banda min/max nu poate fi de latime zero", () => {
  /*
   * ⚠ Amandoua sunt obligatorii la PRIMA salvare, si eMAG cere `max > min`. Cu
   * procent zero ar iesi min = max = pret si FIECARE produs nou al magazinului ar
   * fi respins, cu un mesaj care nu pomeneste procentul.
   */
  const b0 = bandaDePret(100, 0);
  assert.ok(b0.max_sale_price > b0.min_sale_price, "zero se ridica la 1%");

  const b30 = bandaDePret(100, 30);
  assert.equal(b30.min_sale_price, 70);
  assert.equal(b30.max_sale_price, 130);
});

/* ── Identificatorii ──────────────────────────────────────────────────────── */

test("eMAG: `part_number` pleaca fara spatii, virgula si punct-virgula", () => {
  /*
   * ⚠ eMAG le sterge SINGUR: documentatia da chiar exemplul „part number;" salvat
   * ca „partnumber". Daca am tine local forma cu spatii, `ext_part_number` de pe
   * liniile comenzii nu s-ar mai potrivi cu nimic la noi — si comanda ar sosi
   * fara sa stim ce produs s-a vandut.
   */
  assert.equal(normalizeazaPartNumber("part number;"), "partnumber");
  assert.equal(normalizeazaPartNumber("A B,C;D"), "ABCD");
  assert.equal(normalizeazaPartNumber(null), "");
  assert.equal(normalizeazaPartNumber(undefined), "");
});

test("eMAG: fiecare combinatie are `part_number` PROPRIU, fara bara din separator", () => {
  /*
   * SKU-ul combinatiei castiga cand exista. Cand nu, se compune.
   *
   * ⚠ Proba asta a prins un defect adevarat: eMAG sterge doar spatiile, virgula si
   * punctul-virgula, deci „S / Rosu" iesea „S/Rosu" si bara ramanea in cod. Nu e
   * interzis la ei, dar o bara intr-un identificator care ajunge in adrese si in
   * exporturi e o problema care se descopera tarziu si in alta parte.
   */
  assert.equal(partNumberCombinatie("TRI 001", null, "S / Rosu"), "TRI001-S-Rosu");
  assert.equal(partNumberCombinatie("TRI 001", "SKU-S-R", "S / Rosu"), "SKU-S-R");
  assert.equal(partNumberCombinatie(null, null, "S / Rosu"), "S-Rosu");
  assert.equal(partNumberCombinatie("TRI001", null, "42 / Albastru închis"), "TRI001-42-Albastru-nchis");
});

/* ── Produsul simplu ──────────────────────────────────────────────────────── */

test("eMAG: un produs simplu da O oferta, cu prima imagine marcata principala", () => {
  const r = construiesteOferte(produs(), MAGAZIN, CATEGORIE, [{ variant_title: null, emag_id: 500 }], null);

  assert.deepEqual(r.probleme, []);
  assert.equal(r.oferte.length, 1);

  const o = r.oferte[0];
  assert.equal(o.id, 500);
  assert.equal(o.sale_price, 100);
  assert.equal(o.part_number, "TRI001", "fara spatiu si fara punct-virgula");
  assert.equal(o.stock[0].value, 10);
  assert.equal(o.stock[0].warehouse_id, 1);
  assert.equal(o.status, 1);
  assert.equal(o.vat_id, 1);
  assert.equal(o.images?.[0].display_type, 1, "prima e principala");
  assert.equal(o.images?.[1].display_type, 2);
  assert.equal(o.family, undefined, "un produs simplu n-are familie");
  assert.ok(o.min_sale_price! < o.sale_price, "min sub pret");
  assert.ok(o.sale_price < o.max_sale_price!, "max peste pret");
});

test("eMAG: un produs ascuns in magazin pleaca INACTIV, nu deloc", () => {
  /* `status: 0` il opreste din vanzare la ei, dar pastreaza oferta si documentatia
     aprobata. Nedus deloc, ar fi ramas activ pe eMAG cu magazinul inchis. */
  const r = construiesteOferte(produs({ is_active: false }), MAGAZIN, CATEGORIE, [{ variant_title: null, emag_id: 1 }], null);
  assert.equal(r.oferte[0].status, 0);
});

/* ── Produsul cu variante ─────────────────────────────────────────────────── */

test("eMAG: un produs cu patru combinatii da PATRU oferte, in aceeasi familie", () => {
  /*
   * ⚠ Cea mai mare deosebire de model din toata integrarea. eMAG nu are variante
   * imbricate: fiecare marime e o oferta cu id propriu, iar singura legatura
   * dintre ele e familia.
   */
  const p = cuVariante([
    { title: "S", sku: "T-S", stoc: "3", pret: "121" },
    { title: "M", sku: "T-M", stoc: "5", pret: "121" },
    { title: "L", sku: "T-L", stoc: "0", pret: "133.1" },
    { title: "XL", sku: "T-XL", stoc: "7", pret: "133.1" },
  ]);
  const identitati = [
    { variant_title: "S", emag_id: 601 }, { variant_title: "M", emag_id: 602 },
    { variant_title: "L", emag_id: 603 }, { variant_title: "XL", emag_id: 604 },
  ];

  const r = construiesteOferte(p, MAGAZIN, CATEGORIE, identitati, 900);

  assert.deepEqual(r.probleme, []);
  assert.equal(r.oferte.length, 4);

  const familii = new Set(r.oferte.map((o) => o.family?.id));
  assert.deepEqual([...familii], [900], "toate patru in aceeasi familie");
  assert.equal(r.oferte[0].family?.family_type_id, 95);
  assert.deepEqual(r.oferte.map((o) => o.id), [601, 602, 603, 604]);
});

test("eMAG: fiecare marime pleaca cu STOCUL EI, nu cu totalul produsului", () => {
  /*
   * Exact defectul reparat retroactiv la Trendyol si About You prin
   * `migrations/2026-08-19-stoc-marketplace.sql`. Produsul are `stock_quantity`
   * 10; niciuna dintre marimi nu trebuie sa plece cu 10.
   */
  const p = cuVariante([
    { title: "S", sku: "T-S", stoc: "3", pret: "121" },
    { title: "M", sku: "T-M", stoc: "5", pret: "121" },
    { title: "L", sku: "T-L", stoc: "0", pret: "121" },
  ]);
  const r = construiesteOferte(p, MAGAZIN, CATEGORIE, [
    { variant_title: "S", emag_id: 1 }, { variant_title: "M", emag_id: 2 }, { variant_title: "L", emag_id: 3 },
  ], 900);

  assert.deepEqual(r.oferte.map((o) => o.stock[0].value), [3, 5, 0]);
});

test("eMAG: fiecare marime pleaca cu PRETUL EI, tot fara TVA", () => {
  const p = cuVariante([
    { title: "S", sku: "T-S", stoc: "1", pret: "121" },
    { title: "L", sku: "T-L", stoc: "1", pret: "133.1" },
  ]);
  const r = construiesteOferte(p, MAGAZIN, CATEGORIE, [
    { variant_title: "S", emag_id: 1 }, { variant_title: "L", emag_id: 2 },
  ], 900);

  assert.equal(r.oferte[0].sale_price, 100);
  assert.equal(r.oferte[1].sale_price, 110);
});

test("eMAG: fara tip de familie, ofertele NU pleaca", () => {
  /*
   * ⚠ Fara `family_type_id`, eMAG PRIMESTE ofertele dar nu le grupeaza: pe site
   * apar ca produse fara legatura intre ele, iar clientul nu poate schimba
   * marimea. Nu da nicio eroare — de aia se opreste la noi, cu un mesaj care spune
   * ce trebuie ales.
   */
  const p = cuVariante([{ title: "S", sku: "T-S", stoc: "3", pret: "121" }]);
  const r = construiesteOferte(
    p, MAGAZIN, { ...CATEGORIE, family_type_id: undefined }, [{ variant_title: "S", emag_id: 601 }], 900,
  );
  assert.equal(r.oferte.length, 0);
  assert.match(r.probleme[0], /familie/i);
});

test("eMAG: o combinatie fara id alocat nu opreste surorile ei", () => {
  /* Un id lipsa e o problema de o singura varianta. Oprita toata publicarea, un
     produs cu zece marimi ar fi ramas nelistat din cauza uneia. */
  const p = cuVariante([
    { title: "S", sku: "T-S", stoc: "3", pret: "121" },
    { title: "M", sku: "T-M", stoc: "5", pret: "121" },
  ]);
  const r = construiesteOferte(p, MAGAZIN, CATEGORIE, [{ variant_title: "S", emag_id: 1 }], 900);
  assert.equal(r.oferte.length, 1);
  assert.equal(r.probleme.length, 1);
  assert.match(r.probleme[0], /M/);
});

/* ── Ce nu pleaca, si de ce ───────────────────────────────────────────────── */

test("eMAG: un produs fara imagini sau fara SKU NU pleaca, si se spune de ce", () => {
  const faraPoze = construiesteOferte(
    produs({ images: [] }), MAGAZIN, CATEGORIE, [{ variant_title: null, emag_id: 1 }], null,
  );
  assert.equal(faraPoze.oferte.length, 0);
  assert.match(faraPoze.probleme[0], /imagine/i);

  const faraSku = construiesteOferte(
    produs({ sku: null, id: "" }), MAGAZIN, CATEGORIE, [{ variant_title: null, emag_id: 1 }], null,
  );
  assert.equal(faraSku.oferte.length, 0);
  assert.match(faraSku.probleme[0], /SKU/i);
});

test("eMAG: un pret taiat mai mic decat pretul de vanzare se LASA AFARA, nu respinge oferta", () => {
  /*
   * eMAG cere `recommended_price > sale_price`. Un `compare_at_price` gresit e o
   * greseala a comerciantului, nu un motiv sa nu se publice nimic.
   */
  const gresit = construiesteOferte(
    produs({ compare_at_price: 50 }), MAGAZIN, CATEGORIE, [{ variant_title: null, emag_id: 1 }], null,
  );
  assert.equal(gresit.oferte.length, 1);
  assert.equal(gresit.oferte[0].recommended_price, undefined);

  const bun = construiesteOferte(
    produs({ compare_at_price: 200 }), MAGAZIN, CATEGORIE, [{ variant_title: null, emag_id: 1 }], null,
  );
  assert.ok(bun.oferte[0].recommended_price! > bun.oferte[0].sale_price);
});

/* ── Imaginile ────────────────────────────────────────────────────────────── */

test("eMAG: imaginile de pe domeniul vechi se rescriu, iar `http` se arunca", () => {
  /* 1466 de imagini pe 855 de produse mai stau pe `pub-*.r2.dev`. eMAG isi aduce
     singur imaginile si respinge produsul cand nu le poate lua. */
  const im = imaginiEmag([
    "https://pub-abc123.r2.dev/x.jpg",
    "http://exemplu.ro/nesigur.jpg",
    "https://edinio-cdn.com/y.jpg",
  ]);
  assert.equal(im.length, 2, "cea pe http a cazut");
  assert.equal(im[0].url, "https://edinio-cdn.com/x.jpg");
  assert.equal(im[0].display_type, 1);
  assert.equal(im[1].display_type, 2);
});

test("eMAG: poza combinatiei devine principala", () => {
  /* Clientul care alege „Rosu" trebuie sa vada rosu, nu prima poza a produsului. */
  const im = imaginiEmag(["https://edinio-cdn.com/a.jpg"], "https://edinio-cdn.com/rosu.jpg");
  assert.equal(im[0].url, "https://edinio-cdn.com/rosu.jpg");
  assert.equal(im[0].display_type, 1);
  assert.equal(im.length, 2, "fara duplicate");
});

/* ── Masuratorile ─────────────────────────────────────────────────────────── */

test("eMAG: masuratorile pleaca in MILIMETRI si GRAME", () => {
  /*
   * ⚠ Noi tinem centimetri si grame. Trimis in centimetri, un colet de 30 cm ar fi
   * declarat 30 mm — de treizeci de ori mai mic — iar tariful de livrare calculat
   * de eMAG ar fi gresit fara ca nimic sa semnaleze.
   */
  assert.deepEqual(
    masuratoriEmag(7, { length: 30, width: 20, height: 10 }, 250),
    { id: 7, length: 300, width: 200, height: 100, weight: 250 },
  );
});

test("eMAG: masuratorile partiale nu se trimit deloc", () => {
  /* eMAG le cere impreuna; o masuratoare partiala ar fi fost respinsa oricum. */
  assert.equal(masuratoriEmag(7, { length: 30, width: 20 }, 250), null);
  assert.equal(masuratoriEmag(7, null, 250), null);
  assert.equal(masuratoriEmag(7, { length: 30, width: 20, height: 10 }, null), null);
  assert.equal(masuratoriEmag(7, { length: 0, width: 20, height: 10 }, 250), null);
});

/* ── §15. Reaprovizionarea ──────────────────────────────────────── */

test("eMAG supply_lead_time: se rotunjeste IN SUS pe valorile lor", () => {
  /*
   * ⚠ Enumul din schema lor: 2, 3, 5, 7, 14, 30, 60, 90, 120. Zece zile nu e valid.
   *
   * Rotunjit la cel mai APROPIAT, un magazin care se reaprovizioneaza in zece zile ar
   * fi primit 7 — si ar fi promis mai repede decat poate. La eMAG promisiunea
   * neonorata se numara si scade nota vanzatorului. Aceeasi regula ca la
   * `alegeTimpPregatire`.
   */
  assert.equal(alegeSupplyLeadTime(10), 14);
  assert.equal(alegeSupplyLeadTime(1), 2);
  assert.equal(alegeSupplyLeadTime(7), 7, "o valoare exacta ramane ea insasi");
  assert.equal(alegeSupplyLeadTime(45), 60);
});

test("eMAG supply_lead_time: peste maxim se ia maximul, nu se inventeaza o valoare", () => {
  assert.equal(alegeSupplyLeadTime(365), 120);
});

test("eMAG supply_lead_time: nedeclarat da `null`", () => {
  assert.equal(alegeSupplyLeadTime(null), null);
  assert.equal(alegeSupplyLeadTime(undefined), null);
  assert.equal(alegeSupplyLeadTime(0), null);
  assert.equal(alegeSupplyLeadTime(-5), null);
  assert.equal(alegeSupplyLeadTime(Number.NaN), null);
});

test("eMAG supply_lead_time: NEDECLARAT nu pleaca deloc in incarcatura", () => {
  /*
   * ═══ CHIAR GRESEALA `handling_time ?? 1`, IN ALTA DEGHIZARE ═══
   *
   * Schema lor spune `default: 14`. Trimis din obisnuinta cu o valoare de rezerva,
   * campul ar fi rescris la FIECARE republicare timpul de reaprovizionare pus de
   * comerciant in panoul LOR — fara nicio eroare, fiindca 14 e o valoare valida.
   */
  const r = construiesteOferte(produs(), MAGAZIN, CATEGORIE, [{ variant_title: null, emag_id: 500 }], null);
  assert.equal("supply_lead_time" in r.oferte[0], false);
});

test("eMAG supply_lead_time: o valoare NEINGADUITA din setari se potriveste, nu pleaca asa cum e", () => {
  /*
   * ⚠ Incarcatura se inchide cu un `as EmagProdusOferta`, deci tipul ingust
   * `2 | 3 | 5 | ...` NU e verificat de compilator aici. O valoare scrisa din alta
   * parte in config — o consola, o versiune mai veche — ar fi plecat asa cum e, iar
   * eMAG ar fi respins oferta cu un mesaj despre numele campului.
   */
  const r = construiesteOferte(
    produs(),
    { ...MAGAZIN, supply_lead_time: 10 },
    CATEGORIE, [{ variant_title: null, emag_id: 500 }], null,
  );
  assert.equal(r.oferte[0].supply_lead_time, 14, "10 nu e ingaduit; se urca la 14");
});

/* ── O varianta care nu mai exista ───────────────────────────────── */

function cuMarimi(): ProdusDeCartografiat {
  return produs({
    stock_quantity: 40,
    page_sections: {
      variants: {
        enabled: true,
        options: [{ name: "Marime", values: ["S", "M"] }],
        combinations: [
          { title: "S", sku: "T-S", stock_quantity: 2, enabled: true },
          { title: "M", sku: "T-M", stock_quantity: 5, enabled: true },
        ],
      },
    },
  });
}

test("eMAG stoc: o varianta DISPARUTA primeste ZERO, nu stocul intregului produs", () => {
  /*
   * ═══ DEFECT GASIT DE PROBA DE SCARA, 24.08.2026 ═══
   *
   * `emag_offers` tine `variant_title` — numele combinatiei, asa cum era la publicare.
   * Comerciantul poate redenumi „M" in „Marime M", sau o poate sterge; randul de oferta
   * ramane, fiindca oferta EXISTA in continuare la eMAG (ei n-au stergere de oferte).
   *
   * Prima forma cadea inapoi pe `produs.stock_quantity` de fiecare data cand nu gasea
   * combinatia. Deci oferta pentru „M" — care se vinde in continuare acolo — primea
   * dintr-o data stocul INTREG al produsului: patruzeci de bucati, adica toate marimile
   * la un loc.
   *
   * eMAG ar fi vandut mai departe o marime care nu mai exista, si inca din stocul
   * altora. Fara nicio eroare: numarul e valid, cererea reuseste, panoul scrie „trimis".
   *
   * ⚠ Zero opreste vanzarea, si asta e chiar ce a vrut comerciantul cand a scos varianta.
   */
  const oferte = oferteUsoare(cuMarimi(), MAGAZIN, [
    { variant_title: "M", emag_id: 501 },
    { variant_title: "XL care nu mai exista", emag_id: 502 },
  ]);

  assert.equal(oferte[0].stock?.[0]?.value, 5, "„M” exista: stocul ei");
  assert.equal(oferte[1].stock?.[0]?.value, 0, "⚠ disparuta: ZERO, nu 40");
});

test("eMAG stoc: aceeasi regula si pe ruta cea mai usoara, batuta la fiecare vanzare", () => {
  /* ⚠ Drumul asta se bate de zeci de ori pe zi. O varianta disparuta ar fi retrimis
     stocul intregului produs la fiecare miscare de stoc. */
  const stocuri = stocuriDeTrimis(cuMarimi(), [
    { variant_title: "S", emag_id: 501 },
    { variant_title: "disparuta", emag_id: 502 },
  ]);
  assert.deepEqual(stocuri, [
    { emagId: 501, cantitate: 2 },
    { emagId: 502, cantitate: 0 },
  ]);
});

test("eMAG stoc: produsul SIMPLU foloseste stocul produsului, si e corect", () => {
  /* ⚠ `variant_title: null` inseamna „produs fara variante" — acolo nu e nicio
     combinatie de gasit, iar stocul produsului e chiar cel bun. Confundate, fiecare
     produs simplu ar fi plecat cu stoc zero si magazinul n-ar mai fi vandut nimic. */
  const oferte = oferteUsoare(produs({ stock_quantity: 10 }), MAGAZIN, [
    { variant_title: null, emag_id: 500 },
  ]);
  assert.equal(oferte[0].stock?.[0]?.value, 10);
});

/* ── Codul de bare: din fisa produsului, nu din randul nostru (24.08.2026) ─── */

test("eMAG: EAN-ul pleaca din fisa produsului la PRIMA trimitere", () => {
  /*
   * ═══ CE A COSTAT LIPSA LUI ═══
   *
   * `emag_offers.ean` se umple din raspunsul LOR, deci e gol la o oferta pe care n-am
   * trimis-o inca. Prima trimitere — chiar cea care creeaza produsul — pleca mereu
   * fara cod de bare, iar eMAG raspundea „saved as a draft … you need: EAN".
   *
   * Masurat pe 24.08.2026: 40 de produse ramase ciorne care nu se vand, fiecare cu un
   * `gtin` bun scris in fisa lui la noi. Comerciantul a spus-o direct: „la produsele
   * alea care spunea ca nu au cod EAN, au in magazinul nostru".
   */
  const p = produs({ page_sections: { google: { gtin: "8595602520183" } } });
  const r = construiesteOferte(p, MAGAZIN, CATEGORIE, [{ variant_title: null, emag_id: 500 }], null);
  assert.deepEqual(r.oferte[0]?.ean, ["8595602520183"]);
});

test("eMAG: un cod stricat de Excel NU pleaca", () => {
  /* ⚠ `5.9483E+12` chiar exista in datele lor. Curatat de non-cifre ar fi dat un cod
     scurt si valid la prima vedere, iar `find_by_eans` ar fi putut lega oferta de
     produsul ALTCUIVA. `codDeBareCurat` il refuza intreg. */
  const p = produs({ page_sections: { google: { gtin: "5.9483E+12" } } });
  const r = construiesteOferte(p, MAGAZIN, CATEGORIE, [{ variant_title: null, emag_id: 500 }], null);
  assert.equal(r.oferte[0]?.ean, undefined);
});

test("eMAG: fiecare marime pleaca cu codul EI, nu cu al produsului", () => {
  /*
   * ⚠ Un cod de bare identifica un AMBALAJ, nu un articol. Cazuta pe codul produsului,
   * fiecare marime ar fi plecat cu ACELASI EAN — iar eMAG le-ar fi legat pe toate de
   * aceeasi pagina din catalogul lor, sau le-ar fi respins ca duplicate.
   */
  const p = cuVariante([
    { title: "S", sku: "T-S", stoc: "3", pret: "121" },
    { title: "M", sku: "T-M", stoc: "4", pret: "121" },
  ]);
  const ps = p.page_sections as { variants: { combinations: Record<string, unknown>[] }; google?: unknown };
  ps.variants.combinations[0].gtin = "5941234567890";
  ps.google = { gtin: "8595602520183" };

  const r = construiesteOferte(p, MAGAZIN, CATEGORIE, [
    { variant_title: "S", emag_id: 1 }, { variant_title: "M", emag_id: 2 },
  ], 77);
  assert.deepEqual(r.oferte[0]?.ean, ["5941234567890"], "S are codul ei");
  assert.equal(r.oferte[1]?.ean, undefined, "M n-are cod al ei: pleaca FARA, nu cu al produsului");
});

test("eMAG: cheia de produs NU se trimite inapoi", () => {
  /*
   * ⚠ Documentatia lor: `part_number_key` „used for ATTACHING a product offer to an
   * existing product". Nu descrie oferta — o MUTA pe alta pagina din catalog.
   *
   * Verificat pe date reale in ziua importului: din 3 chei luate la intamplare din
   * cele 3.547 citite de la ei, toate trei duceau la produse straine. Trimise inapoi,
   * ar fi mutat marfa comerciantului pe pagina altcuiva.
   */
  const r = construiesteOferte(produs(), MAGAZIN, CATEGORIE, [
    { variant_title: null, emag_id: 500, part_number_key: "D4BJ0JMBM" },
  ], null);
  assert.equal("part_number_key" in (r.oferte[0] ?? {}), false);
});

test("eMAG: datele GPSR se taie la limitele lor si nu trec de 10 seturi", () => {
  /*
   * ⚠ Datele astea se scriu O DATA in setari si pleaca la FIECARE produs. O adresa
   * prea lunga n-ar fi oprit un produs, ci tot catalogul — iar mesajul lor ar fi
   * vorbit despre GPSR, nu despre setarea din care vine.
   */
  const unSet = { name: "N".repeat(300), address: "A".repeat(700), email: "e".repeat(150) };
  const magazin = { ...MAGAZIN, gpsr: { manufacturer: Array.from({ length: 14 }, () => unSet) } };
  const r = construiesteOferte(produs(), magazin, CATEGORIE, [{ variant_title: null, emag_id: 1 }], null);
  const m = (r.oferte[0] as unknown as { manufacturer: { name: string; address: string; email: string }[] }).manufacturer;
  assert.equal(m.length, 10, "cel mult 10 seturi");
  assert.equal(m[0].name.length, 200);
  assert.equal(m[0].address.length, 500);
  assert.equal(m[0].email.length, 100);
});

test("eMAG: un stoc urias nu opreste publicarea, se plafoneaza", () => {
  /* ⚠ `stock[].value` are `maximum=65535`. Un depozit cu mai mult — hrana la sac,
     consumabile — ar fi trimis o valoare in afara intervalului, iar eMAG refuza
     OFERTA INTREAGA. */
  const r = construiesteOferte(produs({ stock_quantity: 90000 }), MAGAZIN, CATEGORIE,
    [{ variant_title: null, emag_id: 1 }], null);
  assert.equal(r.oferte[0]?.stock?.[0]?.value, 65535);
});

test("eMAG: un SKU peste 25 de caractere OPRESTE produsul, cu motiv", () => {
  /* ⚠ Taiat, ar fi fost ALT SKU — legat de alt produs sau duplicat, fara nicio
     eroare. Oprit aici, omul primeste un mesaj in romana. */
  const r = construiesteOferte(produs({ sku: "A".repeat(26) }), MAGAZIN, CATEGORIE,
    [{ variant_title: null, emag_id: 1 }], null);
  assert.equal(r.oferte.length, 0);
  assert.match(r.probleme.join(" "), /25/);
});

test("eMAG: o masuratoare peste intervalul lor NU se trimite plafonata", () => {
  /*
   * ⚠ Aici NU se face ca la stoc, si dinadins. „65535 bucati" e destul de adevarat cat
   * sa se vanda; o cutie taiata la 999999 mm e o MASURATOARE INVENTATA. Trimisa,
   * curierul calculeaza transportul pe ea, iar diferenta o refactureaza peste saptamani.
   *
   * O greutate de un milion de grame nu e o cutie mare, e o cifra gresita in fisa.
   */
  assert.equal(masuratoriEmag(1, { length: 10, width: 10, height: 10 }, 2_000_000), null);
  assert.equal(masuratoriEmag(1, { length: 200_000, width: 10, height: 10 }, 500), null);
  assert.notEqual(masuratoriEmag(1, { length: 10, width: 10, height: 10 }, 500), null);
});

test("eMAG: cm se fac mm, gramele raman grame", () => {
  /* ⚠ `measurements/save` cere mm si g; `AWBSave.packages` cere cm si kg. Aceleasi
     doua marimi, alte unitati, dupa unde pleaca. */
  const m = masuratoriEmag(1, { length: 12.5, width: 3, height: 4 }, 250);
  assert.equal(m?.length, 125);
  assert.equal(m?.weight, 250);
});
