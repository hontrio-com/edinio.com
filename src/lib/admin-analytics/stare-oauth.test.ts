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
