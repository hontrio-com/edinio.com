import test from "node:test";
import assert from "node:assert/strict";
import { apel, type ConfigPacketa } from "./client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CE PLEACA CHIAR PE CABLU CATRE PACKETA                        (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ DE CE PROBA ASTA SE UITA LA `fetch`, SI NU LA CONSTRUCTOR.
 *
 * Existau deja doua probe care scriau `apiPassword`: `xml.test.ts:18` si `expediere.test.ts:178`.
 * Amandoua il dau CU MANA ca argument lui `cerereXml`, deci apara constructorul de documente. Cat
 * timp ele erau verzi, `apel()` trimitea de fapt `api_password` pe TOATE metodele, si nimic nu
 * cadea. Chiar tiparul „proba apara regula, nu cablarea": mutantul trebuie pus pe APELANT.
 *
 * Aici se citeste documentul chiar din cererea plecata, deci singurul rand care poate face proba
 * asta verde e cel din `apel()`.
 *
 * ⚠ CE NU DOVEDESTE: ca Packeta chiar asa il vrea. N-avem cont la ei, deci nimeni n-a vazut un
 * raspuns adevarat. Ce se stie, si e scris si in `client.ts`: exemplele literale din documentatia
 * lor scriu `apiPassword`, iar pe productie sunt ZERO magazine vii pe Packeta (masurat 14.09.2026),
 * deci schimbarea nu poate strica nimic care merge azi.
 */

type CerereVazuta = { url: string; corp: string; redirect: string | undefined };

/** `fetch` inlocuit, ca in `paginare-peste-ultima.test.ts` si `woot.test.ts`. */
function fetchFals() {
  const original = globalThis.fetch;
  const cereri: CerereVazuta[] = [];
  globalThis.fetch = (async (intrare: unknown, init?: RequestInit) => {
    cereri.push({
      url: String(typeof intrare === "string" ? intrare : (intrare as { url?: string })?.url ?? ""),
      corp: String(init?.body ?? ""),
      redirect: init?.redirect,
    });
    return new Response("<response><status>ok</status></response>", {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }) as unknown as typeof globalThis.fetch;
  return { cereri, restaureaza: () => { globalThis.fetch = original; } };
}

/** O cerere dusa pana la capat, cu ce a plecat pe cablu. */
async function ceAPlecat(cfg: ConfigPacketa): Promise<CerereVazuta> {
  const f = fetchFals();
  try {
    /* Raspunsul nu conteaza aici: proba e despre ce s-a TRIMIS. */
    await apel(cfg, "createPacket", { packetAttributes: { number: "CMD-1" } }).catch(() => undefined);
  } finally {
    f.restaureaza();
  }
  assert.equal(f.cereri.length, 1, "n-a plecat exact o cerere, deci proba n-are ce masura");
  return f.cereri[0];
}

const CFG: ConfigPacketa = { api_password: "PAROLA-DE-PROBA", eshop: "MagazinulMeu" };

test("⚠⚠ parola pleaca pe cablu ca `apiPassword`, nu ca `api_password`", async () => {
  const c = await ceAPlecat(CFG);
  assert.match(c.corp, /<apiPassword>PAROLA-DE-PROBA<\/apiPassword>/,
    "documentul nu poarta parola sub numele pe care il cer metodele lor");
  assert.doesNotMatch(c.corp, /<api_password>/,
    "s-a intors numele vechi: atunci TOATE metodele XML pleaca gresit, nu doar unele");
});

test("⚠ campul din configurarea NOASTRA ramane `api_password`", async () => {
  /*
   * Deosebirea nu e un moft: `api_password` e cheia din `packeta_config`, inregistrata in
   * `privat.campuri_secrete` si asteptata de tot panoul. Redenumita si acolo, parolele salvate ar
   * fi devenit dintr-odata „lipsa" pentru fiecare magazin.
   */
  const c = await ceAPlecat({ api_password: "P", eshop: "M" });
  assert.match(c.corp, /<apiPassword>P<\/apiPassword>/, "parola citita din `api_password` n-a ajuns pe cablu");
});

test("⚠⚠ o gazda STRAINA in `bazaRest` nu muta cererea", async () => {
  /* Acolo ar fi plecat parola API, in corpul XML, la fiecare metoda. */
  const c = await ceAPlecat({ ...CFG, bazaRest: "https://atacator.tld/api/rest" });
  assert.equal(c.url, "https://www.zasilkovna.cz/api/rest", "cererea a plecat la gazda din config");
});

test("⚠⚠ nici siretlicul cu `@` nu o muta", async () => {
  const c = await ceAPlecat({ ...CFG, bazaRest: "https://www.zasilkovna.cz@atacator.tld/api/rest" });
  assert.equal(c.url, "https://www.zasilkovna.cz/api/rest", "gazda de dupa `@` a primit cererea");
});

test("o subdomena a lor ramane ingaduita, ca sa se poata arata catre un mediu de test", async () => {
  const c = await ceAPlecat({ ...CFG, bazaRest: "https://test.zasilkovna.cz/api/rest" });
  assert.equal(c.url, "https://test.zasilkovna.cz/api/rest", "mediul de test al furnizorului a fost refuzat");
});

test("⚠ cererea nu urmeaza redirectari", async () => {
  /* Urmat, un 3xx ar RE-TRIMITE corpul, cu parola in el, catre gazda din `Location`. */
  const c = await ceAPlecat(CFG);
  assert.equal(c.redirect, "manual", "un 3xx ar duce parola API in afara domeniului");
});
