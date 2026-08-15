import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
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
 * A doua familie: configul VECHI care alimenteaza `pastreazaSecretele`.
 *
 * Aici defectul nu strica nimic in baza — `privat.cripteaza` sare peste sirurile
 * marcate `enc.v1.`, deci rescrierea e no-op. Se strica tot ce FOLOSESTE rezultatul:
 * un apel catre furnizor facut imediat dupa salvare, un `return { config }` catre
 * formular, sau un URL de webhook inregistrat cu secretul cifrat in el. Adica o
 * mina care se armeaza singura la prima linie adaugata dupa salvare.
 *
 * Proba e GENERICA dinadins: se uita la fiecare apel `pastreazaSecretele` din
 * `src/lib/actions`, nu la o lista fixa. Un fisier nou care greseste pica din prima,
 * fara sa mai fie nevoie ca cineva sa-si aminteasca de proba asta.
 */
test("pastreazaSecretele: configul vechi vine intotdeauna de pe service role", () => {
  const dosar = join(process.cwd(), "src", "lib", "actions");
  const fisiere = readdirSync(dosar).filter((f) => f.endsWith(".actions.ts"));

  let verificate = 0;
  const gresite: string[] = [];

  for (const nume of fisiere) {
    const sursa = readFileSync(join(dosar, nume), "utf8");
    let de = 0;
    for (;;) {
      const idx = sursa.indexOf("pastreazaSecretele(", de);
      if (idx === -1) break;
      de = idx + 1;

      // Al treilea argument arata mereu ca `<variabila>?.<coloana>_config`.
      const apel = sursa.slice(idx, idx + 400);
      const m = apel.match(/(\w+)\?\.(\w+_config)/);
      assert.ok(m, `${nume}: nu recunosc forma apelului pastreazaSecretele — actualizeaza proba`);
      const [, variabila, coloana] = m!;

      // Unde se atribuie variabila, si cu ce client. Se cauta ULTIMA atribuire de
      // dinaintea apelului, nu prima din fisier: `store.actions.ts` are mai multe
      // functii care folosesc acelasi nume (`existing`), iar prima varianta a probei
      // raporta fals pozitiv tocmai fiindca lua atribuirea altei functii.
      const inainte = sursa.slice(0, idx);
      const toate = [...inainte.matchAll(new RegExp(`const \\{ data: ${variabila}[ ,}][^=]*=\\s*await ([^\\n\\r;]+)`, "g"))];
      assert.ok(toate.length > 0, `${nume}: nu gasesc de unde vine \`${variabila}\` inainte de apel`);
      let client = toate[toate.length - 1][1].trim();

      // Un nivel de alias: `const admin = createAdminClient()` apoi `await admin`.
      if (!client.includes("createAdminClient()")) {
        const alias = sursa.match(new RegExp(`const ${client.replace(/\W/g, "")}\\s*=\\s*createAdminClient\\(\\)`));
        if (alias) client = "createAdminClient()";
      }

      verificate++;
      if (!client.includes("createAdminClient()")) {
        gresite.push(`${nume}: ${coloana} citit cu \`${client}\``);
      }
    }
  }

  assert.ok(verificate >= 20, `am verificat doar ${verificate} apeluri — cautarea s-a stricat`);
  assert.deepEqual(
    gresite,
    [],
    "configul vechi citit FARA service role: campurile secrete raman `enc.v1.…` in " +
      "configul imbinat, si primul apel catre furnizor de dupa salvare esueaza tacut",
  );
});

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
