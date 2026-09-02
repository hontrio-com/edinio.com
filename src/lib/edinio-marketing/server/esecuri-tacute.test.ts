import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ceiCareAuRetras, aRetras, marcheazaTrimis, scrubLaAbandon } from "./coada-conversii";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CAND BAZA RASPUNDE CU EROARE — SI NU ARUNCA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ FAPTUL DE LA CARE PORNESTE TOT. Masurat pe 03.09.2026 cu supabase-js 2.106.1:
  o scriere sau o citire respinsa de PostgREST NU ARUNCA. Se rezolva linistit cu
  `{ data: null, error: {...} }`, iar la `update` chiar si `count` iese `null`.

  Deci fiecare `try/catch` pus in jurul unei scrieri era decorativ, si fiecare
  „a mers" era de fapt „promisiunea s-a rezolvat".

  ⚠ CAPCANA ERA DEJA CUNOSCUTA AICI: `error-logger.ts` o descrie pe larg, dupa ce
  jurnalul insusi a esuat tacut. A fost reintrodusa in codul de marketing, scris
  mai tarziu. De aceea probele astea EXECUTA drumul de esec, in loc sa se uite in
  sursa dupa `.throwOnError()`.
*/

/** O baza care raspunde exact ca Supabase la eroare: se rezolva, nu arunca. */
function bazaCareEsueaza() {
  let cereri = 0;
  const eroare = { message: "permission denied for table", code: "42501" };
  const lant: Record<string, unknown> = {};
  for (const m of ["from", "select", "update", "eq", "in"]) lant[m] = () => lant;
  lant.maybeSingle = () => Promise.resolve({ data: null, error: eroare });
  lant.throwOnError = () => Promise.reject(new Error(eroare.message));
  lant.then = (r: (v: unknown) => void) => { cereri++; r({ data: null, error: eroare, count: null }); };
  return { baza: lant as never, cate: () => cereri };
}

/** O baza care raspunde bine, si numara chemarile. */
function bazaBuna(randuri: Array<{ vizitator: string }> = []) {
  let scrieri = 0;
  const lant: Record<string, unknown> = {};
  for (const m of ["from", "select", "update", "eq", "in"]) lant[m] = () => lant;
  lant.maybeSingle = () => Promise.resolve({ data: randuri[0] ?? null, error: null });
  lant.throwOnError = () => { scrieri++; return Promise.resolve({ data: null, error: null }); };
  lant.then = (r: (v: unknown) => void) => r({ data: randuri, error: null, count: randuri.length });
  return { baza: lant as never, scrieri: () => scrieri };
}

test("⚠ nu se poate afla cine a retras ⇒ `null`, adica NU TRIMITE", () => {
  /*
    ⚠ AM SUSTINUT CONTRARIUL LA AUDITUL DE IERI si m-am inselat. Argumentul meu:
    interogarea e doar o plasa pentru o fereastra de un minut, poarta adevarata e
    la punere, deci o baza care clipeste n-are voie sa opreasca toate conversiile.

    Ce n-am cantarit: plasa apara EXACT ce poarta de la punere nu poate — retragerea
    de DUPA. Cand interogarea cade, plasa nu mai apara nimic, tocmai cand e singura
    care ar putea. Iar costurile nu se compara: o intarziere de un minut pentru o
    masuratoare, fata de o conversie plecata pentru un om care a spus nu.
  */
  const { baza } = bazaCareEsueaza();
  return ceiCareAuRetras(["017e7d44ff3e4242bdfc51899ef47fa8"], baza).then((r) => {
    assert.equal(r, null, "esecul interogarii a fost citit ca «nimeni n-a retras»");
  });
});

test("verificarea pe lot merge mai departe cand baza raspunde", async () => {
  /* ⚠ Martorul: caderea inchisa n-avea voie sa opreasca si calea buna. */
  const { baza } = bazaBuna([{ vizitator: "aaa" }]);
  const r = await ceiCareAuRetras(["aaa", "bbb"], baza);
  assert.ok(r instanceof Set, "calea buna nu mai intoarce o multime");
  assert.equal(r!.has("aaa"), true);
  assert.equal(r!.has("bbb"), false);
});

test("⚠ verificarea FINALA cade tot inchis, si vede o retragere proaspata", async () => {
  /*
    ⚠ FEREASTRA PE CARE O INCHIDE. Interogarea pe lot se face o data, la inceput;
    lotul se trimite rand cu rand, si intre primul si al douazeci si cincilea pot
    trece zeci de secunde:

        12:00:00  lotul: ABC n-a retras
        12:00:02  ABC apasa „retrage"
        12:00:07  se ajunge la randul lui ABC

    Nimic nu opreste o cerere deja plecata pe fir, dar fereastra se stramteaza
    pana aproape de zero intreband din nou imediat inaintea cererii.
  */
  const rau = bazaCareEsueaza();
  assert.equal(await aRetras("aaa", rau.baza), null, "esecul a fost citit ca «n-a retras»");

  const gasit = bazaBuna([{ vizitator: "aaa" }]);
  assert.equal(await aRetras("aaa", gasit.baza), true, "o retragere scrisa n-a fost vazuta");

  const negasit = bazaBuna([]);
  assert.equal(await aRetras("bbb", negasit.baza), false, "cine n-a retras a fost oprit degeaba");
});

test("⚠ marcajul «trimis» reincearca, apoi STRIGA — dar nu arunca", async () => {
  /*
    ⚠ DE CE NU ARUNCA. Conversia a ajuns DEJA la furnizor; asta nu se ia inapoi.
    In cron, chemarea sta in acelasi `try` cu trimiterea — aruncand, ar cadea in
    `catch`-ul care cheama `marcheazaEsuat`, iar acela ar programa o REINCERCARE
    pentru ceva ce a plecat cu bine. Leacul ar face chiar raul de care ne temem,
    si l-ar face sigur, nu doar posibil.
  */
  const { baza } = bazaCareEsueaza();
  await assert.doesNotReject(
    () => marcheazaTrimis("rand-1", undefined, baza),
    "a aruncat — in cron asta ar programa o retrimitere pentru ceva deja trimis",
  );

  const bun = bazaBuna();
  await marcheazaTrimis("rand-2", undefined, bun.baza);
  assert.equal(bun.scrieri(), 1, "calea buna nu mai scrie o data");
});

test("⚠ randul abandonat nu mai poarta nimic despre om", () => {
  /*
    ⚠ CINE AJUNGE ACOLO. Chiar oamenii care si-au RETRAS acordul: randurile lor se
    abandoneaza pe calea asta. Pana azi ramanea intreg contextul — ip, browser,
    `_fbp`/`_fbc`/`_ttp`, adresa de venire — deci tocmai cui a spus „nu mai vreau"
    ii ramanea urma cea mai bogata, pastrata la nesfarsit.
  */
  const s = scrubLaAbandon();
  assert.equal(s.vizitator, null, "legatura cu omul a ramas pe randul abandonat");
  const text = JSON.stringify(s.sarcina);
  for (const camp of ["ip", "userAgent", "fbp", "fbc", "ttp", "referrer", "amprentaOmului"]) {
    assert.ok(!text.includes(camp), `\`${camp}\` a ramas pe randul abandonat`);
  }
});
