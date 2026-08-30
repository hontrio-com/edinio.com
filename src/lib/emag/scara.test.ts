import { strict as assert } from "node:assert";
import { test } from "node:test";
import { oferteUsoare, stocuriDeTrimis, construiesteOferte,
  type ContextCategorie, type ContextMagazin, type ProdusDeCartografiat } from "./mapping";
import { grupeaza, type Necaz } from "./probleme";
import { idurileAtinse, mesajeDeScris, MAXIM_IDURI, MAXIM_MESAJE } from "./jurnal";
import { derivaOfertei, hotarasteDeriva, type MemorieDeriva } from "./deriva";
import { potrivesteCaracteristici } from "./caracteristici";
import { pregatestePropunerile } from "./propuneri";
import { facturileLorPentruEcran, adunaPeCategorii } from "./comisioane";
import { LOT_MAXIM } from "./rute";

/*
 * Probele de SCARA (§79) si de purtare sub avarie (§78).
 *
 * ═══ DE CE UN FISIER SEPARAT ═══
 *
 * Probele obisnuite lucreaza cu doua-trei randuri, fiindca acolo se vede logica. Dar
 * defectele care au costat cel mai mult in depozitul asta n-au fost de logica — au
 * fost de MARIME:
 *
 *   - `.in()` cu 1051 de id-uri, care cade abia peste ~650;
 *   - PostgREST care taie TACUT la 1000 de randuri;
 *   - un lot de scriere peste 50, refuzat de eMAG cu un mesaj despre „input vars";
 *   - o pagina de 100 ceruta ca 500, care intoarce tot 100 si nu spune nimic.
 *
 * Toate arata perfect la doua randuri. De aceea aici totul se probeaza cu mii.
 *
 * ⚠ Nicio proba de aici nu atinge reteaua sau baza de date. Ce se poate proba fara
 * ele, se probeaza fara ele — restul e in probele care citesc fisiere.
 */

/* ── Cartografierea, la mii de variante ────────────────────────────────────── */

const MAGAZIN: ContextMagazin = {
  vat_rate: 21, emag_club: 0 as const, prices_include_vat: true, vat_id: 1, handling_time: 1,
  warehouse_id: 1, warranty: 24, price_band_pct: 30, source_language: "ro_RO",
  brand: "Edinio",
};

const CATEGORIE: ContextCategorie = { category_id: 506, characteristics: [], family_type_id: 95 };

function produsCuVariante(cate: number): ProdusDeCartografiat {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Produs cu multe variante",
    description: "<p>Ceva</p>",
    price: 100,
    compare_at_price: null,
    images: ["https://cdn.edinio.com/a.jpg"],
    category: "Test",
    sku: "SKU1",
    weight_grams: 500,
    stock_quantity: 7,
    is_active: true,
    page_sections: {
      variants: {
        enabled: true,
        /* ⚠ `values` NE-GOALA. `parseVariants` intoarce `null` fara ea, si atunci
           produsul n-are variante deloc — exact cazul reparat de `stoculIdentitatii`. */
        options: [{ name: "Marime", values: Array.from({ length: cate }, (_, i) => `V${i}`) }],
        combinations: Array.from({ length: cate }, (_, i) => ({
          title: `Varianta ${i}`,
          sku: `SKU1-${i}`,
          stock_quantity: i % 5,
          enabled: true,
        })),
      },
    },
  };
}

test("scara: o mie de variante dau o mie de oferte, fiecare cu STOCUL EI", () => {
  /*
   * ⚠ Nu „toate cu stocul produsului". Aceeasi lectie ca la Trendyol: fiecare marime
   * pleaca cu bucatile ei. Trimis stocul produsului pe toate, un magazin ar fi vandut
   * marimea „XXL" din stocul lui „M".
   */
  const produs = produsCuVariante(1000);
  const identitati = Array.from({ length: 1000 }, (_, i) => ({
    variant_title: `Varianta ${i}`, emag_id: 1_000_000_000 + i,
  }));

  const oferte = oferteUsoare(produs, MAGAZIN, identitati);
  assert.equal(oferte.length, 1000);

  /* Combinatia `i` are stocul `i % 5`. */
  assert.equal(oferte[0].stock?.[0]?.value, 0);
  assert.equal(oferte[3].stock?.[0]?.value, 3);
  assert.equal(oferte[999].stock?.[0]?.value, 999 % 5);
});

test("scara: stocurile pentru ruta usoara ies tot o mie, fara sa se piarda niciunul", () => {
  const produs = produsCuVariante(1000);
  const identitati = Array.from({ length: 1000 }, (_, i) => ({
    variant_title: `Varianta ${i}`, emag_id: 1_000_000_000 + i,
  }));
  const stocuri = stocuriDeTrimis(produs, identitati);
  assert.equal(stocuri.length, 1000);
  assert.equal(new Set(stocuri.map((s) => s.emagId)).size, 1000, "niciun id dublat");
});

test("scara: loturile de scriere nu depasesc maximul LOR", () => {
  /*
   * ⚠ 50 e limita lor la scrieri, si peste ea cererea INTREAGA e refuzata — nu doar
   * partea in plus. Un magazin cu 60 de variante pe produs ar fi vazut fiecare
   * publicare picand, cu un mesaj despre „maximum input vars" pe care nimeni nu-l
   * leaga de numarul de variante.
   */
  for (const [fel, maxim] of Object.entries(LOT_MAXIM)) {
    assert.ok(maxim <= 50, `${fel}: lotul e ${maxim}, peste maximul lor de 50`);
    /* ⚠ `nimic` are lotul ZERO dinadins: inseamna „nu e nicio ruta de urmat". O
       verificare „cel putin 1" ar fi cerut sa se trimita ceva acolo unde nu e nimic
       de trimis. */
    if (fel !== "nimic") assert.ok(maxim >= 1, `${fel}: lot gol`);
  }
});

test("scara: un produs cu 1000 de combinatii nu pierde niciuna la publicare", () => {
  const produs = produsCuVariante(1000);
  const identitati = Array.from({ length: 1000 }, (_, i) => ({
    variant_title: `Varianta ${i}`, emag_id: 1_000_000_000 + i, part_number_key: null, ean: null,
  }));
  const r = construiesteOferte(produs, MAGAZIN, CATEGORIE, identitati, 42);
  assert.equal(r.oferte.length, 1000);
  assert.equal(new Set(r.oferte.map((o) => o.id)).size, 1000, "niciun id dublat");
  assert.ok(r.oferte.every((o) => o.family?.id === 42), "toate in aceeasi familie");
});

/* ── Centrul problemelor, pe un catalog mare ───────────────────────────────── */

test("scara: patruzeci de mii de necazuri se aduna in cateva grupuri", () => {
  /*
   * ⚠ Numarul se POARTA, nu se numara element cu element. Fara campul `cate`, starile
   * de validare — care se afla din `count` exact, fara sa se citeasca niciun rand — ar
   * fi cerut un tablou de patruzeci de mii de elemente identice.
   */
  const necazuri: Necaz[] = [
    { sursa: "emag", cheie: "validare:8", titlu: "Documentatie respinsa", mesaj: "x", cate: 40_000 },
    ...Array.from({ length: 1000 }, (_, i): Necaz => ({
      sursa: "emag", mesaj: `characteristic ${i} (Ceva) is required`, emagId: i,
    })),
  ];

  const g = grupeaza(necazuri);
  assert.equal(g.length, 2, "doua grupuri, nu patruzeci si una de mii de randuri");
  assert.equal(g[0].cate, 40_000);
  assert.equal(g[1].cate, 1000);
  assert.ok(g[0].oferte.length <= 8, "se tin cateva oferte, nu toate");
});

/* ── Jurnalul, la incarcaturi mari ─────────────────────────────────────────── */

test("scara: un rand de jurnal nu creste odata cu cererea", () => {
  /* ⚠ Randul de jurnal n-are voie sa fie mai mare decat cererea pe care o descrie. */
  const incarcatura = { data: Array.from({ length: 5000 }, (_, i) => ({ id: i + 1 })) };
  assert.equal(idurileAtinse(incarcatura).length, MAXIM_IDURI);

  const multe = Array.from({ length: 5000 }, (_, i) => `mesajul ${i}`);
  assert.equal(mesajeDeScris(multe).length, MAXIM_MESAJE);
});

/* ── Deriva, peste un catalog intreg ───────────────────────────────────────── */

test("scara: rotunjirea lor NU produce derivari pe un catalog de zece mii", () => {
  /*
   * ═══ CEA MAI SCUMPA GRESEALA DE SCARA POSIBILA AICI ═══
   *
   * Noi trimitem patru zecimale; ei pot intoarce doua. Comparate cu `!==`, FIECARE
   * oferta din catalog ar fi „derivat" la fiecare trecere: zece mii de reparari puse
   * la rand, cele 3 cereri pe secunda arse degeaba, si niciuna n-ar fi schimbat nimic.
   *
   * La doua randuri nu s-ar fi vazut niciodata.
   */
  let derivate = 0;
  for (let i = 0; i < 10_000; i++) {
    const alNostru = 82.6364 + i * 0.01;
    const alLor = Math.round(alNostru * 100) / 100; /* rotunjit la doi bani, ca ei */
    if (derivaOfertei({ pret: alNostru, stoc: 5 }, { pret: alLor, stoc: 5 }).length > 0) derivate++;
  }
  assert.equal(derivate, 0);
});

test("scara: o oferta care oscileaza nu se repara niciodata, oricat de mult ar tine", () => {
  /* O campanie de-a lor care se aprinde si se stinge ar fi cerut o reparare la fiecare
     trecere — la nesfarsit, pe toata durata campaniei. */
  let m: MemorieDeriva | null = null;
  let reparari = 0;
  for (let i = 0; i < 500; i++) {
    const laEi = i % 2 === 0 ? 89.9 : 79.9;
    const h = hotarasteDeriva(
      derivaOfertei({ pret: 100, stoc: 5 }, { pret: laEi, stoc: 5 }),
      m, { pret: "edinio", stoc: "edinio" }, "2026-08-24T10:00:00.000Z",
    );
    if (h.deReparat.length) reparari++;
    m = h.memorie;
  }
  assert.equal(reparari, 0);
});

/* ── Caracteristicile, pe o categorie mare ─────────────────────────────────── */

test("scara: o categorie cu cinci sute de caracteristici se potriveste corect", () => {
  const aleCategoriei = Array.from({ length: 500 }, (_, i) => ({
    id: 6000 + i, name: `Caracteristica ${i}`,
  }));
  const specificatii = Array.from({ length: 500 }, (_, i) => ({
    label: `caracteristica ${i}`, value: `valoarea ${i}`,
  }));

  const r = potrivesteCaracteristici(specificatii, aleCategoriei);
  assert.equal(r.caracteristici.length, 500);
  assert.deepEqual(r.nepotriviri, []);
  assert.equal(new Set(r.caracteristici.map((c) => c.id)).size, 500, "niciun id dublat");
});

/* ── Campaniile, pe tot catalogul ──────────────────────────────────────────── */

test("scara: o mie de oferte propuse pastreaza fiecare pretul ei de dupa campanie", () => {
  /* ⚠ §57. Un singur `post_campaign_sale_price` gresit inseamna un produs care ramane
     ieftin dupa campanie — sau se scumpeste peste noapte. La o mie de oferte, nimeni
     nu le verifica una cate una. */
  const oferte = Array.from({ length: 1000 }, (_, i) => ({
    emagId: i + 1, pretNet: 10 + i * 0.37, stoc: 5,
  }));
  const r = pregatestePropunerile(oferte, { campaignId: 7, reducere: 25 });
  assert.equal(r.propuneri.length, 1000);
  for (let i = 0; i < 1000; i++) {
    assert.equal(
      r.propuneri[i].post_campaign_sale_price,
      Math.round(oferte[i].pretNet * 10_000) / 10_000,
      `oferta ${i}`,
    );
  }
});

/* ── Facturile lor, pe un an intreg ────────────────────────────────────────── */

test("scara: o mie de facturi, cu stornari, dau totalul corect", () => {
  /* Fiecare a treia e o stornare. Adunate ca oricare alta, totalul ar fi iesit cu
     mult peste realitate — si ar fi aratat perfect credibil. */
  const invoices = Array.from({ length: 999 }, (_, i) => ({
    category: "FC", number: `F${i}`, date: `2026-0${(i % 9) + 1}-01`,
    is_storno: i % 3 === 0 ? 1 : 0, total_without_vat: 100, currency: "RON",
  }));

  const t = adunaPeCategorii(facturileLorPentruEcran({ invoices }));
  /* 333 stornari × (−100) + 666 facturi × 100 = 33.300 */
  assert.equal(t[0].total, 33_300);
  assert.equal(t[0].cate, 999);
});

/* ── Purtarea sub avarie (§78) ─────────────────────────────────────────────── */

test("avarie: raspunsuri stalcite nu darama nicio citire", () => {
  /*
   * ⚠ Fiecare dintre astea a fost vazuta la un furnizor sau altul: HTML in loc de
   * JSON, un tablou unde se astepta un obiect, `null` in mijlocul unei liste.
   *
   * Niciuna n-are voie sa arunce. O exceptie aici opreste TOATA trecerea cronului, deci
   * si magazinele care n-au nicio problema.
   */
  const gunoaie: unknown[] = [
    null, undefined, 0, "", "<html>502 Bad Gateway</html>", [], {},
    { invoices: null }, { invoices: [null, undefined, 7, "text"] },
    { data: [null] }, [{ }], [[]],
  ];

  for (const g of gunoaie) {
    assert.doesNotThrow(() => facturileLorPentruEcran(g), `facturi: ${JSON.stringify(g)}`);
    assert.doesNotThrow(() => idurileAtinse(g), `iduri: ${JSON.stringify(g)}`);
    assert.doesNotThrow(() => grupeaza([]), "grupare goala");
  }
});

test("avarie: numere imposibile nu se strecoara in incarcaturi", () => {
  /* `NaN` si `Infinity` trec prin `JSON.stringify` ca `null`, iar eMAG raspunde cu un
     mesaj despre camp. Se opresc aici, unde se stie ce inseamna. */
  for (const rau of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.deepEqual(
      derivaOfertei({ pret: 100, stoc: 5 }, { pret: rau, stoc: 5 }), [],
      `pret ${rau} nu e o derivare`,
    );
  }
});
