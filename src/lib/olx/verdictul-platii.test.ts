import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verdictulPlatii } from "./verdictul-platii";

/* ══════════════════════════════════════════════════════════════════════════
   VERDICTUL UNEI PLATI, PROBAT CU MESAJE ADEVARATE (02.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   Proba de pana acum verifica doar ca lista alba EXISTA si ca nu contine „unknown". Nu i-a dat
   niciodata un mesaj real — iar daca i-ar fi dat, ar fi aflat ca cel mai obisnuit refuz al lor,
   soldul insuficient, nu se potrivea cu niciun tipar, fiindca il traduceam in romana INAINTE de
   confruntare.

   ⚠ Ce se joaca aici: `esuat` elibereaza cheia, `necunoscut` o tine. Gresit intr-un sens, omul
   ramane blocat cu un mesaj care nu-l ajuta; gresit in celalalt, plateste a doua oara.
*/

const actiuni = readFileSync("src/lib/actions/olx.actions.ts", "utf8");

test("⚠ refuzurile LOR limpezi elibereaza cheia", () => {
  /*
   * ⚠ Toate mesajele de mai jos sunt cele pe care le TRADUCEM in `mapPaymentError` — adica exact
   * cele pe care traducerea le ascundea de lista alba. Soldul insuficient e refuzul obisnuit.
   */
  for (const brut of [
    "not enough credits",
    "Not enough credits on account balance",
    "insufficient funds",
    "invalid payment method",
    "postpaid not activated",
  ]) {
    assert.equal(verdictulPlatii({ brut, status: 400 }), "esuat", brut);
    /* ⚠ Si fara cod: textul singur trebuie sa ajunga, ca sa nu depinda totul de un `status`. */
    assert.equal(verdictulPlatii({ brut, status: 0 }), "esuat", `${brut} (fara cod)`);
  }
});

test("⚠ un `4xx` de refuz inseamna ca cererea a fost respinsa, orice ar scrie in ea", () => {
  /*
   * ⚠ Textul lor se schimba cand vor ei; codul nu. Un refuz cu un mesaj pe care nu-l recunoastem
   * lasa altfel cheia blocata degeaba.
   */
  for (const status of [400, 401, 402, 403, 404, 422]) {
    assert.equal(verdictulPlatii({ brut: "ceva ce n-am mai vazut", status }), "esuat", String(status));
  }
});

test("⚠ indoiala NU elibereaza cheia", () => {
  /*
   * ⚠ „Unknown error" spune ca SERVERUL nu stie ce s-a intamplat — exact pe dos fata de „n-am
   * facut nimic". Prima varianta a listei il prindea, si atunci a doua apasare trecea peste o
   * plata care putea sa fi intrat.
   *
   * ⚠ `408` si `429`: cererea poate sa fi ajuns si sa se fi executat, doar raspunsul s-a pierdut.
   * `409`: un conflict inseamna adesea ca lucrul EXISTA deja. `0`: n-am ajuns la ei, dar `call`
   * intoarce `0` si cand cererea a plecat si a expirat asteptarea.
   */
  for (const [brut, status] of [
    ["Unknown error", 500],
    ["Internal server error", 500],
    ["", 502],
    ["Too many requests", 429],
    ["timeout", 408],
    ["conflict", 409],
    ["Eroare de retea catre OLX.", 0],
    ["service temporarily unavailable", 503],
  ] as const) {
    assert.equal(verdictulPlatii({ brut, status }), "necunoscut", `${status} ${brut}`);
  }
});

test("⚠ verdictul primeste ce ne-au spus EI, nu traducerea noastra", () => {
  /*
   * ⚠ Asta e chiar defectul de la care a pornit fisierul. `mapPaymentError` face din „not enough
   * credits" un „Sold insuficient pe contul OLX…", iar lista alba cauta engleza. Aruncarea trebuie
   * sa poarte AMANDOUA fetele: cea romaneasca pentru ecran, cea bruta pentru verdict.
   */
  const traduse = [
    "Sold insuficient pe contul OLX. Alimenteaza portofelul pe olx.ro",
    "Metoda de plata selectata nu este disponibila pe contul tau OLX.",
    "Plata pe factura (postpaid) nu este activata pe contul tau OLX.",
  ];
  for (const t of traduse) {
    assert.equal(verdictulPlatii({ brut: t, status: 0 }), "necunoscut",
      "traducerea noastra NU se potriveste cu lista alba, si de-aia nu ea trebuie confruntata");
  }

  /* ⚠ Si in actiuni nu se mai arunca textul tradus, ci amandoua fetele. */
  assert.doesNotMatch(actiuni, /throw new Error\(mapPaymentError\(/,
    "aruncarea cu textul tradus ascunde refuzul de lista alba");
  assert.match(actiuni, /new EroareDePlataOlx\(mapPaymentError\(e\.error\), e\.error, e\.status\)/,
    "aruncarea trebuie sa poarte si textul LOR, si codul");
  assert.match(actiuni, /verdictulPlatii\(\{ brut: e\.brut, status: e\.status \}\)/,
    "verdictul trebuie sa se ia din raspunsul LOR");
});

test("⚠ apelul ireversibil sta SINGUR inauntrul registrului", () => {
  /*
   * ⚠ `withToken` face trei lucruri care pot cadea: `guard`, `loadConfig` (care ARUNCA la o pana de
   * baza) si `ensureMerchantToken` (o cerere HTTP la ei, plus o scriere de config). Chemat
   * dinauntrul lui `executa`, oricare dintre ele bloca cheia unei plati pe care OLX n-o vazuse
   * niciodata: „Sesiunea OLX a expirat" ajungea sa opreasca urmatoarea cumparare.
   */
  for (const fn of ["buyOlxCategoryPacket", "buyOlxAdvertPacket", "buyOlxPaidFeature"]) {
    const i = actiuni.indexOf(`export async function ${fn}(`);
    assert.ok(i > 0, `${fn} a disparut`);
    const corp = actiuni.slice(i, actiuni.indexOf("\nexport ", i + 10));
    const iReg = corp.indexOf("await cuRegistru(");
    assert.ok(iReg > 0, `${fn} nu trece prin registru`);
    const inauntru = corp.slice(corp.indexOf("async () => {", iReg), corp.indexOf("verdictOlxPlata", iReg));
    assert.doesNotMatch(inauntru, /withToken\(/,
      `${fn}: ${"`withToken`"} inauntrul registrului poate bloca o cheie pentru un apel nefacut`);
    assert.match(corp.slice(0, iReg), /jetonulPentruPlata\(businessId\)/,
      `${fn} nu ia jetonul inaintea rezervarii`);
  }
});
