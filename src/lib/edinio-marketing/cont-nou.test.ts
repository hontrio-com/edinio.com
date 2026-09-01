import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { ePrimaAutentificare, idConversieCont } from "./cont-nou";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  INSCRIEREA PRIN GOOGLE — CEA CARE NU SE NUMARA DELOC
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ MASURAT IN BAZA pe 01.09.2026: din 168 de conturi, 28 sunt prin Google (26 din
  cele 147 din ultimele 90 de zile). Ele nu treceau prin `register()`, deci nu
  lasau niciun jeton, deci nu existau nici in GA4, nici in Meta, nici in TikTok.

  Valorile de mai jos nu sunt inventate: sunt luate din distributia adevarata a
  campurilor `created_at` si `last_sign_in_at` din `auth.users`.
*/

const citeste = (p: string) => readFileSync(p, "utf8");

/* ═══ 1. Cand e contul cu adevarat nou ═══ */

test("o inscriere adevarata prin Google se recunoaste", () => {
  /*
    ⚠ 0.39 SECUNDE E MINIMUL MASURAT pe conturile prin Google — atat dureaza dusul
    si intorsul pe la ei. Cel mai lung drum adevarat vazut a fost sub 5 secunde.
  */
  assert.equal(ePrimaAutentificare({
    created_at: "2026-09-01T10:00:00.000Z",
    last_sign_in_at: "2026-09-01T10:00:00.390Z",
  }), true, "0.39s — exact minimul masurat in baza");

  assert.equal(ePrimaAutentificare({
    created_at: "2026-09-01T10:00:00.000Z",
    last_sign_in_at: "2026-09-01T10:00:04.800Z",
  }), true, "4.8s — sub pragul de 5s peste care n-a trecut nicio inscriere adevarata");
});

test("⚠ cine REVINE la un cont vechi nu se numara ca inscriere", () => {
  /*
    ═══ ASTA E DEFECTUL PE CARE-L APARA PROBA ═══

    Ruta de aterizare e aceeasi pentru inscriere, pentru confirmarea contului,
    pentru resetarea parolei si pentru impersonare. Iar ramura pe care se scrie
    jetonul e „onboardingul nu s-a terminat" — pe care intra, la FIECARE
    autentificare, oricine si-a facut cont acum trei saptamani si s-a oprit.

    Fara paza asta, un singur om ar aparea ca zeci de conturi noi. Si ar creste
    frumos in rapoarte, deci nimeni nu l-ar pune la indoiala.

    ⚠ 8613592 de secunde (99 de zile) E MAXIMUL MASURAT in baza.
  */
  assert.equal(ePrimaAutentificare({
    created_at: "2026-09-01T10:00:00.000Z",
    last_sign_in_at: "2026-09-01T10:01:30.000Z",
  }), false, "90 de secunde — deja peste fereastra");

  assert.equal(ePrimaAutentificare({
    created_at: "2026-05-25T10:00:00.000Z",
    last_sign_in_at: "2026-09-01T10:00:00.000Z",
  }), false, "99 de zile — maximul masurat in baza");
});

test("cele doua date pot veni pe dos cu cateva milisecunde", () => {
  /*
    ⚠ NU E O IPOTEZA TEORETICA. Campurile se scriu de servicii deosebite ale
    Supabase. O scadere fara valoare absoluta ar da un numar negativ, iar
    `negativ < 60000` ar fi fost adevarat oricum — deci ar fi mers din intamplare.
    Aici se cere sa mearga DINADINS, si sa nu treaca un cont vechi.
  */
  assert.equal(ePrimaAutentificare({
    created_at: "2026-09-01T10:00:00.120Z",
    last_sign_in_at: "2026-09-01T10:00:00.000Z",
  }), true, "120 ms pe dos: tot o inscriere");

  assert.equal(ePrimaAutentificare({
    created_at: "2026-09-01T10:00:00.000Z",
    last_sign_in_at: "2026-05-25T10:00:00.000Z",
  }), false, "trei luni pe dos nu e o inscriere, e o data stricata");
});

test("date lipsa sau stricate nu produc o conversie inventata", () => {
  /*
    ⚠ SE INTOARCE `false`, nu `true`. O inscriere nenumarata e o pierdere mica si
    tacuta; una inventata intra in optimizarea campaniilor si costa bani.
  */
  assert.equal(ePrimaAutentificare(null), false);
  assert.equal(ePrimaAutentificare(undefined), false);
  assert.equal(ePrimaAutentificare({}), false);
  assert.equal(ePrimaAutentificare({ created_at: "2026-09-01T10:00:00.000Z" }), false);
  assert.equal(ePrimaAutentificare({ created_at: "nu e o data", last_sign_in_at: "nici asta" }), false);
});

/* ═══ 2. Id-ul conversiei ═══ */

test("⚠ acelasi cont da ACELASI id, oricate drumuri ar avea inscrierea", () => {
  /*
    ═══ DE CE NU UN `randomUUID()`, ASA CUM ERA ═══

    Semnalul pleaca acum din DOUA locuri: `register()` (email si parola) si
    aterizarea OAuth (Google). Cu id-uri aleatoare, un cont care ar trece cumva
    pe amandoua ar fi doua conversii.

    Si mai important: cand se adauga trimiterea de pe server (CAPI), serverul
    trebuie sa poata calcula acelasi id fara sa-l care nimeni prin cookie-uri.
  */
  const a = idConversieCont("3f7c1e00-0000-4000-8000-000000000001");
  const b = idConversieCont("3f7c1e00-0000-4000-8000-000000000001");
  assert.equal(a, b, "acelasi cont a dat doua id-uri deosebite");

  const altul = idConversieCont("3f7c1e00-0000-4000-8000-000000000002");
  assert.notEqual(a, altul, "doua conturi deosebite au primit acelasi id");
});

test("⚠ id-ul din baza nu pleaca la Meta ca atare", () => {
  const idBaza = "3f7c1e00-1111-4000-8000-000000000009";
  const trimis = idConversieCont(idBaza);
  assert.ok(!trimis.includes(idBaza), "id-ul din baza a plecat neschimbat");
  assert.ok(!trimis.includes("3f7c1e00"), "o bucata din id-ul din baza a plecat neschimbata");
  assert.match(trimis, /^[0-9a-f]{32}$/, "id-ul trebuie sa fie o amprenta scurta si stabila");
});

/* ═══ 3. Ca semnalul chiar e legat acolo unde trebuie ═══ */

test("⚠ aterizarea OAuth scrie jetonul, si NUMAI sub paza", () => {
  /*
    ⚠ SE CERE INTREGUL `if`, nu doar chemarea. Lectia de azi, a treia oara:
    `assert.match(cod, /ePrimaAutentificare/)` ar trece verde peste un
    `void ePrimaAutentificare(user);` urmat de scrierea neconditionata a
    jetonului. Textul ar exista, paza nu.
  */
  const cod = citeste("src/app/auth/callback/route.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  const iPaza = cod.indexOf("if (ePrimaAutentificare(user)) {");
  const iScriere = cod.indexOf('res.cookies.set("edinio_signup"');

  assert.ok(iPaza > 0, "paza primei autentificari a disparut de pe aterizarea OAuth");
  assert.ok(iScriere > 0, "jetonul de inscriere nu se mai scrie deloc pe calea Google");
  assert.ok(iPaza < iScriere, "jetonul se scrie INAINTEA pazei — deci si pentru cine revine");

  /*
    ⚠ SI APROAPE UNA DE ALTA. Fara masura asta, paza ar putea sta intr-o cu totul
    alta ramura mai sus in fisier, iar proba ar trece verde pe o vecinatate
    inchipuita. Comentariile sunt deja scoase, deci ce ramane e cod.
  */
  assert.ok(
    iScriere - iPaza < 400,
    "paza si scrierea nu mai sunt in acelasi bloc — verifica daca jetonul chiar e sub ea",
  );
  assert.equal(
    cod.split('res.cookies.set("edinio_signup"').length - 1, 1,
    "jetonul se scrie din mai multe locuri pe aceeasi ruta — unul din ele scapa de paza",
  );
  assert.match(cod, /idConversieCont\(user\.id\)/, "jetonul nu mai poarta amprenta stabila a contului");
});

test("⚠ inscrierea cu email foloseste acelasi id stabil, nu unul aleator", () => {
  const cod = citeste("src/lib/actions/auth.actions.ts");
  assert.match(
    cod, /cookieStore\.set\("edinio_signup", `\$\{idConversieCont\(idCont\)\}\.email`/,
    "`register()` s-a intors la un id aleator — deduplicarea cu serverul se rupe",
  );
  /*
    Martorul: `randomUUID` n-a ramas pe nicaieri pe calea asta. Daca revine,
    inseamna ca cineva a pus la loc id-ul aleator langa cel stabil.
  */
  const faraComentarii = cod.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(
    faraComentarii, /randomUUID/,
    "`randomUUID` a revenit in auth.actions.ts — verifica daca jetonul de inscriere e tot stabil",
  );
});
