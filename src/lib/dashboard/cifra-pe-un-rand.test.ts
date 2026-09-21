import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { marimeaCifrei, marimeaRandului } from "./cifra-pe-un-rand";
import { formatPriceValue } from "@/lib/utils/format";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CIFRA NU TRECE PE DOUA RANDURI, ORICAT AR FI SUMA         (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ TREI CERERI ALE LUI, UNA DUPA ALTA, si fiecare a scos la iveala cate o
 * jumatate de masura din cea de dinainte:
 *
 *   1. „textele din carduri trec pe urmatorul rand daca sunt sume mari" —
 *      `15.831,80 lei` la 44px cere 246px, iar cardul avea 197px de scris.
 *   2. „tipografia pare diferita intre carduri, textele alea 2 sunt groase si
 *      celelalte subtiri" — marimea aleasa PE CARD facea ca „6" sa ramana urias
 *      langa o suma micsorata, deci cutiile nu mai aratau ca un set.
 *   3. „parca mi se pare ca sunt cam mici cifrele pentru chenarul asta mare" +
 *      „vreau sa incapa si 1 milion de lei, 10 milioane de lei" — pragurile erau
 *      socotite dintr-o regula din burta (0,6 din font pe semn), mult prea
 *      aspra, iar unitatea era numarata ca o cifra uriasa.
 *
 * Probele de aici tin toate trei deodata: sa incapa, sa fie la fel pe tot randul,
 * si sa NU fie mai mica decat trebuie.
 */

/** Cat loc are cifra intr-un card dintr-o grila de patru. Masurat pe ecran. */
const LATIME = 231;
/** Cat tine, din marimea fontului, un semn. Masurat in fontul adevarat. */
const PE_SEMN = 0.45;
/** Marimea la care cardul scrie unitatea. */
const UNITATE_PX = 20;

const TREPTE = [44, 40, 36, 32, 28, 24, 20];

function px(cls: string): number {
  const laLg = /lg:text-\[(\d+)px\]/.exec(cls);
  return Number(laLg ? laLg[1] : /text-\[(\d+)px\]/.exec(cls)![1]);
}

function locPentruCifra(unitate?: string): number {
  return unitate ? LATIME - (unitate.length + 1) * UNITATE_PX * PE_SEMN : LATIME;
}

/* ── 1. Sa incapa ───────────────────────────────────────────────────────── */

test("⚠⚠ chiar cele mai mari sume incap pe un rand", () => {
  /*
   * ⚠ Cerute de el pe nume: „vreau sa incapa si 1 milion de lei, 10 milioane de
   * lei". `formatPriceValue` taie „,00" la sumele rotunde, deci un milion se
   * scrie „1.000.000" — noua semne, nu treisprezece.
   */
  const sume = [2224.6, 15831.8, 118875.72, 1_000_000, 10_000_000, 100_000_000, 1_234_567.89];
  for (const n of sume) {
    const v = formatPriceValue(n);
    const p = px(marimeaCifrei(v, "lei"));
    assert.ok(v.length * p * PE_SEMN <= locPentruCifra("lei"),
      `„${v} lei" la ${p}px cere ~${Math.round(v.length * p * PE_SEMN)}px, dar cifra are ${Math.round(locPentruCifra("lei"))}px`);
  }
});

test("⚠ si o cifra fara unitate, oricat de lunga", () => {
  for (const v of ["6", "1.234", "1.234.567", "123.456.789.012"]) {
    const p = px(marimeaCifrei(v));
    assert.ok(v.length * p * PE_SEMN <= LATIME, `„${v}" la ${p}px nu incape`);
  }
});

/* ── 2. Sa NU fie mai mica decat trebuie ────────────────────────────────── */

test("⚠⚠ nu se micsoreaza mai mult decat e nevoie", () => {
  /*
   * Cealalta jumatate a cererii lui, si cea pe care prima reparatie a calcat-o:
   * o cifra scrisa mult sub cat ar incapea arata pierduta in cutie. Se cere ca
   * treapta urmatoare, mai mare, sa NU mai incapa.
   */
  for (const [v, u] of [["6", undefined], ["54", undefined], ["2.224,60", "lei"],
    ["15.831,80", "lei"], ["1.000.000", "lei"], ["100.000.000", "lei"]] as const) {
    const p = px(marimeaCifrei(v, u));
    const maiMare = TREPTE.filter((t) => t > p).at(-1);
    if (maiMare === undefined) continue;
    assert.ok(v.length * maiMare * PE_SEMN > locPentruCifra(u),
      `„${v}${u ? " " + u : ""}" e scrisa la ${p}px, desi ar fi incaput si la ${maiMare}px`);
  }
});

test("⚠⚠ sumele de azi au revenit la marimea INTREAGA", () => {
  /*
   * Cifrele chiar de pe ecranul lui, la 21.09.2026. Daca vreuna dintre ele mai
   * scade vreodata sub 44px, inseamna ca s-a stricat ceva la socoteala — si
   * exact de acolo a pornit sesizarea.
   */
  for (const n of [2224.6, 15831.8]) {
    assert.equal(marimeaCifrei(formatPriceValue(n), "lei"), "text-[44px]",
      `${n} nu mai e scris la marime intreaga`);
  }
});

/* ── 3. Un rand, o singura marime ───────────────────────────────────────── */

test("⚠⚠ toate cardurile unui rand poarta ACEEASI marime", () => {
  const rand = marimeaRandului([
    "6", "54",
    { valoare: formatPriceValue(2224.6), unitate: "lei" },
    { valoare: formatPriceValue(15831.8), unitate: "lei" },
  ]);
  assert.equal(rand, "text-[44px]");

  const cuMilioane = marimeaRandului([
    "6", "54",
    { valoare: formatPriceValue(2224.6), unitate: "lei" },
    { valoare: formatPriceValue(10_000_000), unitate: "lei" },
  ]);
  assert.equal(px(cuMilioane), px(marimeaCifrei(formatPriceValue(10_000_000), "lei")),
    "randul nu s-a asezat dupa cifra care cere cel mai mult loc");
});

test("⚠ se ia cea care cere cel mai mult LOC, nu cea mai LUNGA", () => {
  /*
   * O cifra scurta cu o unitate lunga poate cere mai mult loc decat una lunga
   * fara unitate. Luata „cea mai lunga", randul ar fi iesit prea mare si cardul
   * cu unitatea s-ar fi rupt — adica taman defectul de la care am plecat.
   */
  const r = marimeaRandului([
    { valoare: "1.234.567", unitate: undefined },
    { valoare: "123.456", unitate: "de produse" },
  ]);
  assert.ok(px(r) <= px(marimeaCifrei("123.456", "de produse")));
});

test("⚠ un rand gol nu arunca", () => {
  assert.equal(marimeaRandului([]), marimeaCifrei("0"));
});

/* ── 4. Capcanele tacute ────────────────────────────────────────────────── */

test("⚠⚠ clasele sunt SIRURI LITERALE, nu compuse la rulare", () => {
  /*
   * ⚠⚠ CAPCANA TACUTA. Tailwind isi strange clasele citind SURSA, ca text. O
   * marime compusa la rulare, prin interpolare din marimea in pixeli, n-ar fi
   * generata niciodata,
   * iar cifra ar cadea pe marimea implicita: nicio eroare, nicaieri, doar un
   * ecran care arata altfel decat scrie codul.
   */
  const sursa = readFileSync("src/lib/dashboard/cifra-pe-un-rand.ts", "utf8");
  assert.ok(!/text-\[\$\{/.test(sursa), "o marime se compune la rulare: Tailwind n-o va genera");

  for (const e of ["6", "1.234.567,89", "x".repeat(40)]) {
    for (const cls of marimeaCifrei(e, "lei").split(" ")) {
      assert.ok(sursa.includes(`"${cls}"`), `clasa \`${cls}\` nu e scrisa literal in sursa`);
    }
  }
});

test("⚠⚠ unitatea NU se numara ca o cifra uriasa", () => {
  /*
   * Ea se scrie la 20px, orice marime ar avea cifra. Numarata la fel ca restul,
   * „lei" costa cat trei cifre mari si impingea totul in jos degeaba.
   */
  const cuUnitate = px(marimeaCifrei("15.831,80", "lei"));
  const caUnSirLipit = px(marimeaCifrei("15.831,80 lei"));
  assert.ok(cuUnitate >= caUnSirLipit, "unitatea data separat n-ar trebui sa coste mai mult");
  assert.equal(cuUnitate, 44);
});

test("⚠⚠ toate cele cinci pagini cu carduri cer marimea randului", () => {
  /*
   * ⚠ Proba de CABLARE. „Si problema asta e in mai multe locuri unde avem
   * chenarele astea cu statistici" — cuvintele lui. O pagina uitata ar fi ramas
   * cu tipografia amestecata, si n-ar fi cazut nimic.
   */
  const pagini = [
    "src/components/dashboard/DiscountsClient.tsx",
    "src/components/dashboard/CustomersClient.tsx",
    "src/components/dashboard/AbandonedCartsClient.tsx",
    "src/components/dashboard/StatisticiClient.tsx",
    "src/app/(dashboard)/dashboard/page.tsx",
  ];
  for (const f of pagini) {
    const sursa = readFileSync(f, "utf8");
    assert.match(sursa, /marimeaRandului\(/, `${f} nu socoteste marimea randului`);
    const carduri = sursa.split("<CardStatistica").length - 1;
    const cuMarime = sursa.split("<CardStatistica marime=").length - 1;
    assert.equal(cuMarime, carduri, `${f}: ${carduri - cuMarime} carduri fara marimea randului`);
  }
});

test("⚠⚠ paginile cu bani dau unitatea SEPARAT, nu lipita de suma", () => {
  /*
   * `formatPrice(1e6)` da „1.000.000 lei" — treisprezece semne, dintre care
   * patru sunt scrise oricum la 20px. `formatPriceValue` da „1.000.000", noua.
   * Panoul si Statisticile o faceau de mult asa; Discounturile si Clientii nu,
   * si de-aia acolo s-au si vazut cifrele mici.
   */
  for (const f of ["src/components/dashboard/DiscountsClient.tsx",
    "src/components/dashboard/CustomersClient.tsx"]) {
    const sursa = readFileSync(f, "utf8");
    const carduri = sursa.slice(sursa.indexOf("<CardStatistica"));
    const pana = carduri.lastIndexOf("</div>");
    assert.ok(!/value=\{formatPrice\(/.test(carduri.slice(0, pana)),
      `${f}: un card inca trimite suma cu „lei" lipit de ea`);
  }
});

test("⚠ si cardul cere marimea de aici, nu scrie una fixa", () => {
  const sursa = readFileSync("src/components/dashboard/CardStatistica.tsx", "utf8");
  assert.match(sursa, /marime \?\? marimeaCifrei\(value, unit\)/);
  assert.match(sursa, /whitespace-nowrap/);
  assert.ok(!/"text-\[44px\] leading-none/.test(sursa), "a ramas o marime fixa in componenta");
});

/* ── 5. Cifrele scurte raman mari ───────────────────────────────────────── */

test("cifrele scurte raman la marimea intreaga, ca pana acum", () => {
  for (const s of ["6", "54", "0", "1.234", "12,5", "1.234.567"]) {
    assert.equal(marimeaCifrei(s), "text-[44px]", s);
  }
});

test("⚠ un numar, nu doar un sir", () => {
  assert.equal(marimeaCifrei(54), "text-[44px]");
  assert.equal(marimeaCifrei(1234567.89), marimeaCifrei("1234567.89"));
});
