import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Paza citirilor de credentiale, scrisa dupa incidentul din 15.08.2026.
 *
 * CE S-A INTAMPLAT. Migratia `2026-08-05-DUPA-DEPLOY-credentiale-doar-service-role`
 * a facut `privat.decripteaza_config` sa iasa pe prima linie pentru `anon` si
 * `authenticated`. Din acel moment, orice citire de `store_settings` facuta cu
 * clientul UTILIZATORULUI (inclusiv in „use server") intoarce campul secret ca
 * sirul `enc.v1.…` in loc de credentiala. Migratia e numita „DUPA DEPLOY" tocmai
 * fiindca cerea ca tot codul care foloseste secrete sa treaca INTAI pe
 * `createAdminClient()`. Commit-ul de cod insotitor a ratat sapte integrari:
 * Google Analytics, Google Merchant, OLX, SMSO, notice.ro, Trendyol si SMTP-ul
 * propriu. Zece zile, comerciantii au vazut „Sesiunea Google a expirat.
 * Reconecteaza-te." — iar reconectarea nu repara nimic, fiindca defectul era la
 * citire, nu la token.
 *
 * DE CE PROBA ARATA ASA. Defectul nu arunca si nu intoarce null: intoarce un sir
 * plauzibil, iar actiunea raspunde cu un `{ error }` linistit. Deci o proba de
 * tipul „`listGaProperties` nu arunca" TRECE si cu defectul prezent — exact cum
 * au trecut verde tsc, testele si build-ul in tot acest timp. Singurul lucru care
 * distinge cele doua stari, fara o baza de date la indemana, e CU CE CLIENT se
 * face citirea. De aceea proba se uita in sursa.
 *
 * Daca adaugi o citire noua de camp secret, citeste-o cu `createAdminClient()`
 * dupa o garda de proprietate, sau treci prin `secretDinConfig`.
 */

const RADACINA = join(process.cwd(), "src", "lib", "actions");

/** Ajutoarele care incarca un config cu secrete: fiecare TREBUIE sa citeasca cu service role. */
const AJUTOARE = [
  { fisier: "google-analytics.actions.ts", nume: "loadConfig", coloana: "google_analytics_config" },
  { fisier: "google-merchant.actions.ts", nume: "loadConfig", coloana: "google_merchant_config" },
  { fisier: "trendyol.actions.ts", nume: "loadConfig", coloana: "trendyol_config" },
  { fisier: "olx.actions.ts", nume: "loadConfig", coloana: "olx_config" },
  { fisier: "email-settings.actions.ts", nume: "loadConfig", coloana: "email_config" },
];

/** Citiri punctuale de coloane cu secrete, in afara unui ajutor dedicat. */
const CITIRI_PUNCTUALE = [
  { fisier: "sms.actions.ts", coloana: "smso_config", cate: 2 },
  { fisier: "order.actions.ts", coloana: "smso_config", cate: 2 },
  { fisier: "abandoned-cart.actions.ts", coloana: "smso_config, notice_config", cate: 1 },
];

function corpulFunctiei(sursa: string, nume: string): string {
  const start = sursa.indexOf(`async function ${nume}(`);
  assert.notEqual(start, -1, `functia ${nume} nu mai exista — actualizeaza proba`);
  const deschis = sursa.indexOf("{", start);
  let adancime = 0;
  for (let i = deschis; i < sursa.length; i++) {
    if (sursa[i] === "{") adancime++;
    else if (sursa[i] === "}") {
      adancime--;
      if (adancime === 0) return sursa.slice(deschis, i + 1);
    }
  }
  throw new Error(`nu am putut delimita corpul lui ${nume}`);
}

for (const { fisier, nume, coloana } of AJUTOARE) {
  test(`${fisier}: ${nume} citeste ${coloana} cu service role`, () => {
    const sursa = readFileSync(join(RADACINA, fisier), "utf8");
    const corp = corpulFunctiei(sursa, nume);

    assert.ok(
      corp.includes(`select("${coloana}")`),
      `${nume} nu mai citeste ${coloana} — actualizeaza proba`,
    );
    assert.ok(
      corp.includes("createAdminClient()"),
      `${nume} citeste ${coloana} FARA service role: campul secret va veni ca "enc.v1.…" si va pleca asa la furnizor`,
    );
    // Nu e de ajuns sa EXISTE `createAdminClient` in corp: clientul utilizatorului
    // nu are ce cauta aici deloc. In `withToken` din olx.actions.ts defectul a fost
    // exact asta — `admin` creat pe o linie, si citirea facuta tot cu `g.supabase`.
    assert.ok(
      !/\b(supabase|g\.supabase|db)\s*\n?\s*\.from\("store_settings"\)/.test(corp),
      `${nume} inca are o citire de store_settings pe clientul utilizatorului`,
    );
  });
}

for (const { fisier, coloana, cate } of CITIRI_PUNCTUALE) {
  test(`${fisier}: citirile de ${coloana} se fac cu service role`, () => {
    const sursa = readFileSync(join(RADACINA, fisier), "utf8");
    const tinta = `select("${coloana}")`;
    const gasite = sursa.split(tinta).length - 1;
    assert.equal(gasite, cate, `numarul citirilor de ${coloana} s-a schimbat — actualizeaza proba`);

    // Pentru fiecare aparitie, clientul e ce sta inaintea lui `.from("store_settings")`.
    let de = 0;
    for (let i = 0; i < cate; i++) {
      const idx = sursa.indexOf(tinta, de);
      de = idx + tinta.length;
      const inainte = sursa.slice(Math.max(0, idx - 220), idx);
      const client = inainte.slice(inainte.lastIndexOf("await "));
      assert.ok(
        client.includes("createAdminClient()"),
        `citirea ${i + 1} a lui ${coloana} din ${fisier} nu foloseste service role:\n${client.trim()}`,
      );
    }
  });
}

/**
 * Proba care ar fi prins defectul la sursa lui: ajutorul central `secretDinConfig`
 * e singurul drum permis pentru pasii porniti din formular, si el citeste cu
 * service role DUPA ce dovedeste proprietatea cu clientul utilizatorului.
 */
test("secretDinConfig: proprietatea cu clientul userului, citirea cu service role", () => {
  const sursa = readFileSync(join(process.cwd(), "src", "lib", "integrari", "secret-server.ts"), "utf8");
  const pozitieGarda = sursa.indexOf('.from("businesses")');
  const pozitieCitire = sursa.indexOf('.from("store_settings")');
  assert.ok(pozitieGarda !== -1 && pozitieCitire !== -1, "secret-server.ts si-a schimbat forma");
  assert.ok(
    pozitieGarda < pozitieCitire,
    "proprietatea trebuie dovedita INAINTE de citirea cu service role, altfel oricine cere secretul altui magazin",
  );
  assert.ok(
    sursa.slice(pozitieCitire - 200, pozitieCitire).includes("createAdminClient()"),
    "secretDinConfig nu mai citeste cu service role",
  );
});
