import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { signState } from "@/lib/google-analytics/oauth";
import { semneazaStareAdmin, eStareDeAdmin, SUBIECT_ADMIN } from "./stare-oauth";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  O SINGURA ATERIZARE, DOUA DRUMURI CARE NU AU VOIE SA SE AMESTECE
  ═══════════════════════════════════════════════════════════════════════════════

  `/api/google-analytics/oauth/callback` primeste si intoarcerea comerciantului
  care isi leaga GA4-ul de magazinul lui, si intoarcerea NOASTRA cand legam
  proprietatea Edinio pentru rapoartele din admin.

  E un singur `redirect_uri` dinadins: al doilea ar fi cerut inregistrare in
  Google Cloud si inca o trecere prin ecranul de consimtamant.
*/

const citeste = (p: string) => readFileSync(p, "utf8");

test("starea platformei se recunoaste, si numai ea", () => {
  assert.equal(eStareDeAdmin(semneazaStareAdmin()), true);

  /* ⚠ Starea unui MAGAZIN nu deschide drumul platformei. */
  const alMagazinului = signState("7c9e6679-7425-40de-944b-e07fc1f90ae7");
  assert.equal(eStareDeAdmin(alMagazinului), false, "starea unui magazin a trecut ca a platformei");
});

test("o stare nesemnata sau stricata nu trece", () => {
  /*
    ⚠ CE APARA. Cine ar putea trimite o stare inventata ar face aterizarea sa lege
    contul LUI Google de platforma — iar rapoartele noastre ar arata traficul
    altcuiva, fara ca nimic sa para stricat.
  */
  assert.equal(eStareDeAdmin(null), false);
  assert.equal(eStareDeAdmin(""), false);
  assert.equal(eStareDeAdmin(SUBIECT_ADMIN), false, "cuvantul gol, fara semnatura, a trecut");
  assert.equal(
    eStareDeAdmin(Buffer.from(`${SUBIECT_ADMIN}.${Date.now()}.0000`).toString("base64url")),
    false,
    "o semnatura inventata a trecut",
  );
});

test("⚠ subiectul platformei nu se poate ciocni de un id de magazin", () => {
  /*
    `verifyState` desface sirul dupa PUNCT, in trei bucati. Un subiect care ar
    contine un punct ar rupe desfacerea; unul care ar arata a uuid s-ar putea
    ciocni de un magazin adevarat.
  */
  assert.ok(!SUBIECT_ADMIN.includes("."), "subiectul are punct — rupe desfacerea starii");
  assert.doesNotMatch(SUBIECT_ADMIN, /^[0-9a-f-]{36}$/i, "subiectul arata a uuid de magazin");
});

test("⚠ aterizarea desparte drumurile INAINTE sa caute un magazin", () => {
  /*
    Ordinea conteaza. Daca despartirea ar veni dupa citirea din `businesses`,
    cuvantul platformei ar fi cautat acolo ca id de magazin: interogarea n-ar
    gasi nimic si legarea noastra ar esua mereu, cu o eroare care nu spune nimic.
  */
  const cod = citeste("src/app/api/google-analytics/oauth/callback/route.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  const iDespartire = cod.indexOf("eStareDeAdmin(");
  const iMagazin = cod.indexOf('.from("businesses")');
  const iVerify = cod.indexOf("verifyState(");

  assert.ok(iDespartire > 0, "aterizarea nu mai desparte drumul platformei");
  assert.ok(iMagazin > 0, "nu mai gasesc citirea magazinului — s-a schimbat ruta?");
  assert.ok(iDespartire < iMagazin, "despartirea vine DUPA citirea magazinului");
  assert.ok(iDespartire < iVerify, "despartirea vine dupa ce starea e citita ca id de magazin");
});

test("⚠ plecarea si aterizarea platformei cer amandoua garda de administrator", () => {
  /*
    ═══ DE CE DE DOUA ORI ═══

    Starea semnata leaga intoarcerea de plecare, dar nu spune CINE se intoarce.
    Cine ar apuca un link de aterizare in cele 15 minute de viata ale lui si-ar
    lega propriul cont Google de platforma.

    Costul verificarii e o interogare. Costul lipsei ei e un cont strain in
    rapoartele noastre, aratand cifre adevarate despre altcineva.
  */
  const plecare = citeste("src/lib/actions/admin-analytics.actions.ts");
  assert.match(plecare, /const admin = await requireAdminApi\(\);/, "plecarea nu mai cere garda");
  assert.match(
    plecare, /if \(!admin\) return \{ error: "Nu esti administrator\." \};/g,
    "garda se cheama dar nu opreste",
  );
  /*
    ⚠ SI DECONECTAREA. E tot o actiune care schimba starea platformei; fara
    garda, oricine ar putea rupe legatura din afara.
  */
  assert.equal(
    (plecare.match(/if \(!admin\) return \{ error:/g) ?? []).length, 2,
    "una din actiuni (pornire / deconectare) nu mai e pazita",
  );

  const aterizare = citeste("src/lib/admin-analytics/aterizare-oauth.ts");
  assert.match(aterizare, /const admin = await requireAdminApi\(\);/, "aterizarea nu mai cere garda");
  assert.match(aterizare, /if \(!admin\) return inapoi\(/, "garda se cheama dar nu opreste");
});

test("⚠ o legatura fara `refresh_token` nu se salveaza", () => {
  /*
    Google da jetonul de reimprospatare doar la primul consimtamant (de aceea
    `buildAuthUrl` cere mereu `prompt=consent`). Daca lipseste, legatura traieste
    o ora: rapoartele ar merge azi si ar tacea maine, fara sa cada nimic.
  */
  const cod = citeste("src/lib/admin-analytics/aterizare-oauth.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const iPaza = cod.indexOf("if (!tok.refreshToken) return");
  const iScriere = cod.indexOf("await scrieConexiune(");
  assert.ok(iPaza > 0, "s-a pierdut paza pe jetonul de reimprospatare");
  assert.ok(iPaza < iScriere, "legatura se scrie inainte de a verifica jetonul");
});

/* ═══ Creditele fluxului de admin ═══ */

test("⚠ poarta cantareste creditele pe care fluxul le FOLOSESTE, nu altele", async () => {
  /*
    ⚠ DEFECTUL VIU, gasit pe 03.09.2026. `porneste()` intreba
    `googleAnalyticsConfigured()` — care cantareste creditele COMERCIANTILOR
    (`GOOGLE_ANALYTICS_*`, cu `GOOGLE_MERCHANT_*` pe post de rezerva). Dar
    plecarea se face cu `credentialeCorporate()`.

    Deci cine punea NUMAI perechea corporate — exact ce cere despartirea celor
    doua aplicatii Google, facuta chiar de noi — primea „Aplicatia Google nu e
    configurata". Configurarea corecta era refuzata de poarta.
  */
  const inainte = { ...process.env };
  try {
    const { credentialeAdminGata, VARIABILE_CREDITE } = await import("@/lib/google-analytics/oauth");

    for (const v of ["EDINIO_ANALYTICS_GOOGLE_CLIENT_ID", "EDINIO_ANALYTICS_GOOGLE_CLIENT_SECRET",
                     "GOOGLE_ANALYTICS_CLIENT_ID", "GOOGLE_ANALYTICS_CLIENT_SECRET",
                     "GOOGLE_MERCHANT_CLIENT_ID", "GOOGLE_MERCHANT_CLIENT_SECRET"]) {
      delete process.env[v];
    }
    assert.equal(credentialeAdminGata(), false, "fara nimic pus, poarta se deschide");

    process.env.EDINIO_ANALYTICS_GOOGLE_CLIENT_ID = "corp-id";
    process.env.EDINIO_ANALYTICS_GOOGLE_CLIENT_SECRET = "corp-secret";
    assert.equal(credentialeAdminGata(), true,
      "numai perechea corporate pusa — chiar configurarea ceruta — si poarta refuza");

    /* Si pe dos: numai cele comune, fara corporate. Se cade inapoi pe ele, deci merge. */
    delete process.env.EDINIO_ANALYTICS_GOOGLE_CLIENT_ID;
    delete process.env.EDINIO_ANALYTICS_GOOGLE_CLIENT_SECRET;
    process.env.GOOGLE_MERCHANT_CLIENT_ID = "comun-id";
    process.env.GOOGLE_MERCHANT_CLIENT_SECRET = "comun-secret";
    assert.equal(credentialeAdminGata(), true, "creditele comune sunt rezerva, si ele merg");

    /*
      ⚠ JUMATATE DE CONFIGURARE NU E CONFIGURARE. Cu id nou si secret vechi Google
      raspunde `invalid_client` fara sa spuna de ce, iar cine a pus doar una crede
      ca a terminat.
    */
    process.env.EDINIO_ANALYTICS_GOOGLE_CLIENT_ID = "corp-id";
    assert.equal(credentialeAdminGata(), true, "jumatatea de configurare n-a cazut pe rezerva");

    assert.ok(VARIABILE_CREDITE.length >= 3, "lista de variabile din mesaj s-a scurtat");
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in inainte)) delete process.env[k];
    Object.assign(process.env, inainte);
  }
});

test("⚠ mesajul de eroare numeste TOATE variabilele din care se pot lua creditele", async () => {
  /*
    ⚠ CE APARA, si e a treia oara in doua zile. Mesajul numea o singura pereche
    (`GOOGLE_MERCHANT_CLIENT_ID / _SECRET`) desi codul incearca trei. Cine il
    citea configura ce nu trebuie si nu afla niciodata de ce nu merge.

    Proba leaga textul de cod in AMANDOUA directiile: fiecare variabila citita de
    `oauth.ts` trebuie sa fie in lista, si fiecare din lista sa fie chiar citita.
  */
  const { VARIABILE_CREDITE } = await import("@/lib/google-analytics/oauth");
  const sursaOauth = readFileSync("src/lib/google-analytics/oauth.ts", "utf8");
  const sursaActiune = readFileSync("src/lib/actions/admin-analytics.actions.ts", "utf8");

  const citite = new Set(
    [...sursaOauth.matchAll(/process\.env\.([A-Z_]*CLIENT_(?:ID|SECRET))/g)].map((m) => m[1]),
  );
  assert.ok(citite.size >= 4, `s-au gasit doar ${citite.size} variabile — cautarea s-a stricat?`);

  const numite = new Set(
    VARIABILE_CREDITE.flatMap((v) => {
      const radacina = v.replace(/_(ID|SECRET).*$/, "").replace(/_CLIENT$/, "");
      return [`${radacina}_CLIENT_ID`, `${radacina}_CLIENT_SECRET`];
    }),
  );

  for (const v of citite) {
    assert.ok(numite.has(v), `\`oauth.ts\` citeste ${v}, dar mesajul nu-l pomeneste`);
  }
  for (const v of numite) {
    assert.ok(citite.has(v), `mesajul trimite omul sa puna ${v}, pe care nimeni nu-l citeste`);
  }

  /*
    ⚠ SI CA MESAJUL NU-SI SCRIE VARIABILELE DE MANA. Prima forma a randului asta
    cerea doar ca `VARIABILE_CREDITE` sa apara undeva in fisier — si trecea verde
    peste chiar mutantul pe care era scrisa: numele ramanea in randul de `import`,
    iar mesajul era iar scris de mana. „E pomenit undeva in fisier" nu e acelasi
    lucru cu „e folosit unde trebuie".
  */
  const numeInMesaj = [...sursaActiune.matchAll(/error:[^;]*?"([^"]*CLIENT_[^"]*)"/g)];
  assert.deepEqual(
    numeInMesaj.map((m) => m[1]), [],
    "un mesaj isi scrie iar numele variabilelor de mana: " + numeInMesaj.map((m) => m[1]).join(", "),
  );
});
