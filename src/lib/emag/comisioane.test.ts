import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  adunaPeCategorii, facturileLorPentruEcran, numeleCategoriilor, totalulSemnat,
  LINII_PE_FACTURA,
} from "./comisioane";

/*
 * Probele facturilor pe care ni le emite eMAG (§89).
 *
 * La bani, greseala care doare cel mai tare nu e o cadere — e un numar care arata
 * exact ca adevarul si nu e. Toate probele de aici pazesc asta.
 */

const RASPUNS = {
  total_results: 3,
  invoices: [
    {
      category: "FC", name: "Commission", number: "EMG-1001", date: "2026-08-01",
      is_storno: 0, total_without_vat: 1200, total_vat_value: 228, total_with_vat: 1428,
      currency: "RON",
      lines: [{ product_name: "Comision marketplace", quantity: 1, value: 1200 }],
    },
    {
      category: "FC", name: "Commission", number: "EMG-1002", date: "2026-08-15",
      is_storno: 1, total_without_vat: 300, total_with_vat: 357, currency: "RON",
      lines: [],
    },
    {
      category: "FT", name: "Transport", number: "EMG-2001", date: "2026-08-20",
      is_storno: 0, total_without_vat: 450, total_with_vat: 535.5, currency: "RON",
      lines: [],
    },
  ],
};

/* ── Stornarea ─────────────────────────────────────────────────────────────── */

test("eMAG facturi: o STORNARE se scade, nu se aduna", () => {
  /*
   * ═══ GRESEALA CARE AR FI DUBLAT CHELTUIALA ═══
   *
   * `is_storno: 1` inseamna ca factura ANULEAZA alta. eMAG o trimite cu totalul
   * POZITIV — deci adunata ca oricare alta, ar fi crescut comisionul in loc sa-l
   * scada.
   *
   * Un comerciant cu doua stornari intr-o luna ar fi vazut un comision cu mult peste
   * ce i-a luat eMAG de fapt, si ar fi ridicat preturile degeaba. Numarul ar fi aratat
   * perfect credibil: e chiar suma de pe factura.
   */
  assert.equal(totalulSemnat({ storno: false, faraTva: 300 }), 300);
  assert.equal(totalulSemnat({ storno: true, faraTva: 300 }), -300);
  assert.equal(totalulSemnat({ storno: true, faraTva: -300 }), -300, "si daca vine deja negativ");
});

test("eMAG facturi: comisionul lunii iese cu stornarea SCAZUTA", () => {
  const t = adunaPeCategorii(facturileLorPentruEcran(RASPUNS));
  const comision = t.find((x) => x.categorie === "FC");
  assert.equal(comision?.total, 900, "1200 facturat minus 300 stornat");
  assert.equal(comision?.cate, 2);
});

/* ── Citirea ───────────────────────────────────────────────────────────────── */

test("eMAG facturi: se citesc din `invoices`, si direct dintr-un tablou", () => {
  assert.equal(facturileLorPentruEcran(RASPUNS).length, 3);
  assert.equal(facturileLorPentruEcran(RASPUNS.invoices).length, 3);
});

test("eMAG facturi: o forma nerecunoscuta da o lista goala, NU numere inventate", () => {
  /* ⚠ La bani, un zero ghicit arata identic cu un zero adevarat. */
  assert.deepEqual(facturileLorPentruEcran(null), []);
  assert.deepEqual(facturileLorPentruEcran({}), []);
  assert.deepEqual(facturileLorPentruEcran("nu e un raspuns"), []);
  assert.deepEqual(facturileLorPentruEcran({ invoices: "nu e un tablou" }), []);
});

test("eMAG facturi: cele mai noi primele", () => {
  /* Intrebarea e „cat m-a costat luna asta", nu „acum un an". */
  const f = facturileLorPentruEcran(RASPUNS);
  assert.equal(f[0].data, "2026-08-20");
  assert.equal(f[2].data, "2026-08-01");
});

test("eMAG facturi: se aduna FARA TVA", () => {
  /* ⚠ TVA-ul se deduce, deci nu e un cost. Adunat, cifra ar fi aratat cu o cincime
     mai mare decat ce l-a costat cu adevarat pe comerciant. */
  const t = adunaPeCategorii(facturileLorPentruEcran(RASPUNS));
  assert.equal(t.find((x) => x.categorie === "FT")?.total, 450, "fara TVA, nu 535,50");
});

test("eMAG facturi: „1.200,50” e o mie doua sute, nu zero", () => {
  /*
   * ═══ PROBA ASTA A PRINS UN DEFECT ADEVARAT ═══
   *
   * Prima forma facea `Number(v.replace(",", "."))`, adica `Number("1.200.50")` — care
   * da `NaN`, cazut apoi pe `0`. Un comision de 1200 de lei ar fi aparut pe ecran ca
   * ZERO. Fara nicio eroare, fiindca zero e o suma perfect valida, si tocmai una care
   * nu trezeste pe nimeni.
   *
   * ⚠ Si prima forma a PROBEI trecea, fiindca verifica doar `Number.isFinite` — iar
   * zero e finit. O proba care se uita la forma, nu la valoare, apara exact nimic.
   */
  const cazuri: [string, number][] = [
    ["1.200,50", 1200.5],
    ["1200,50", 1200.5],
    ["1200.50", 1200.5],
    ["1,200.50", 1200.5],
    ["450", 450],
  ];
  for (const [scris, asteptat] of cazuri) {
    const f = facturileLorPentruEcran({
      invoices: [{ category: "FC", number: "X", date: "2026-08-01", total_without_vat: scris as never }],
    });
    assert.equal(f[0].faraTva, asteptat, `„${scris}”`);
  }
});

test("eMAG facturi: un text care nu e numar da zero, nu `NaN`", () => {
  /* `NaN` s-ar fi raspandit prin toate adunarile si ar fi scris „NaN" pe tot ecranul. */
  const f = facturileLorPentruEcran({
    invoices: [{ category: "FC", number: "X", date: "2026-08-01", total_without_vat: "n/a" as never }],
  });
  assert.equal(f[0].faraTva, 0);
});

/* ── Etichetele ────────────────────────────────────────────────────────────── */

test("eMAG facturi: numele categoriei vine de la EI, iar necunoscutul se arata ca atare", () => {
  /*
   * ⚠ Un cod nou de-al lor ascuns sub „Altele" ar fi ramas acolo pentru totdeauna,
   * si tocmai el ar fi meritat citit: e o cheltuiala noua pe care n-o stie nimeni.
   */
  const nume = numeleCategoriilor([{ category: "FC", name: "Commission" }]);
  assert.equal(nume.FC, "Commission");

  const f = facturileLorPentruEcran(
    { invoices: [{ category: "XYZ", number: "1", date: "2026-08-01", total_without_vat: 10 }] },
    nume,
  );
  assert.equal(f[0].categorieEticheta, "XYZ", "codul lor, nu «Altele»");
});

test("eMAG facturi: categoriile de forma necunoscuta nu darama citirea", () => {
  assert.deepEqual(numeleCategoriilor(null), {});
  assert.deepEqual(numeleCategoriilor([{ nimic: 1 }]), {});
  assert.deepEqual(numeleCategoriilor([{ category: "FC" }]), {}, "fara nume, nu se inventeaza unul");
});

test("eMAG facturi: liniile se margineste cate se tin", () => {
  const multe = {
    invoices: [{
      category: "FC", number: "1", date: "2026-08-01", total_without_vat: 10,
      lines: Array.from({ length: 200 }, (_, i) => ({ product_name: `Linia ${i}`, quantity: 1, value: 1 })),
    }],
  };
  assert.equal(facturileLorPentruEcran(multe)[0].linii.length, LINII_PE_FACTURA);
});

/* ── Costurile se aduna din TOATE facturile (24.08.2026) ───────────────────── */

test("facturile se cer paginat, pana la `total_results`", async () => {
  /*
   * ═══ SE CEREA O SINGURA PAGINA DE 100 ═══
   *
   * Fara `currentPage`, fara sa se uite la `total_results`. Pe „Ultimul an", tot ce
   * trecea de a 100-a factura nu se aduna — iar rezultatul arata identic cu unul corect.
   *
   * ⚠ E chiar ecranul „cat te costa eMAG", scris ca sa dea fapte, nu estimari. Un cost
   * subestimat impinge preturile in jos. Toate celelalte rute paginate din integrare se
   * parcurg pana la capat; facturile erau singura exceptie.
   */
  const { readFileSync } = await import("node:fs");
  const sursa = readFileSync("src/lib/actions/emag.actions.ts", "utf8");

  const i = sursa.indexOf("export async function facturileEmag(");
  assert.notEqual(i, -1, "n-am gasit citirea facturilor");
  const corp = sursa.slice(i, i + 4200);

  assert.ok(corp.includes("total_results"), "nu se uita la cate sunt de fapt");
  assert.ok(corp.includes("currentPage: p"), "nu cere paginile urmatoare");
  assert.ok(corp.includes("PAGINI_FACTURI_MAXIM"), "bucla n-are plafon");
});

test("un total incomplet se SPUNE, nu se arata ca intreg", async () => {
  /* ⚠ Fara steag, cifra taiata arata la fel de credibila ca una corecta. */
  const { readFileSync } = await import("node:fs");
  assert.ok(
    readFileSync("src/lib/actions/emag.actions.ts", "utf8").includes("const partial ="),
    "actiunea nu spune niciodata ca n-a putut aduna tot",
  );
  assert.ok(
    readFileSync("src/components/dashboard/EmagFacturiLor.tsx", "utf8").includes("date.partial &&"),
    "ecranul nu arata niciodata ca totalul e partial",
  );
});
