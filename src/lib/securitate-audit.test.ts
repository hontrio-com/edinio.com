import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  PLASELE PENTRU AUDITUL DE SECURITATE DIN 01.09.2026
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CE PAZESC PROBELE ASTEA, si ce NU.

  Auditul primit avea dreptate pe faptele brute aproape peste tot, si gresea la
  urmare de patru ori. Probele de aici pazesc REPARATIILE care s-au dovedit
  intemeiate — si, la fel de important, pazesc si cateva lucruri pe care auditul
  cerea sa le STRICAM.

  Verificarea a fost facuta de 74 de agenti, fiecare constatare atacata apoi de un
  sceptic cu sarcina s-o doboare. Ce a supravietuit e mai jos.
*/

const RAD = process.cwd();
const citeste = (c: string) => readFileSync(join(RAD, c), "utf8").replace(/\r\n/g, "\n");
const faraComentarii = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/* ═══ 1. libheif — SINGURA proba de aici care se executa ═══ */

test("⚠ libheif din sharp e cel reparat (>= 1.23.2)", async () => {
  /*
    ⚠ ASTA E MIEZUL. Pe 25.08.2026 libheif a primit un release de securitate cu
    doua defecte Critical pe calea de DECODARE (heap buffer overflow in
    `scale_nearest_neighbor` prin plane alfa duplicate din itemi `iden`/`auxl`).
    Afectate: <= 1.23.1. Reparat in 1.23.2.

    `/api/img` da octeti bruti lui `sharp`, care ii DECODEAZA — masurat pe un AVIF
    adevarat din depozitul nostru: 38.799 octeti in, webp 64/384/1024 afara.
    Deci calea vulnerabila e chiar calea noastra.

    ⚠ SE CHEAMA, NU SE CITESTE. `npm audit` da zero aici, si asta nu inseamna
    nimic: libheif e o biblioteca C++ compilata in binarul preconstruit, nu un
    pachet npm cu advisory. Un audit curat inseamna doar ca unealta nu se uita
    acolo. Singurul adevar e ce raporteaza binarul incarcat.

    ⚠ SI PAZESTE SI COBORAREA, nu doar urcarea: un `npm install` care ar readuce
    sharp 0.35.3 (libvips 1.3.2 = heif 1.23.1) pica aici.
  */
  const sharp = (await import("sharp")).default as unknown as {
    versions: Record<string, string>;
  };
  const heif = sharp.versions.heif;
  assert.ok(heif, "sharp nu mai raporteaza versiunea libheif — nu se mai poate verifica nimic");

  const [ma, mi, pa] = heif.split(".").map(Number);
  const eCelPutin = ma > 1 || (ma === 1 && (mi > 23 || (mi === 23 && pa >= 2)));
  assert.ok(
    eCelPutin,
    `libheif ${heif} e sub 1.23.2, adica in intervalul advisory-ului din 25.08.2026. ` +
      `/api/img decodeaza AVIF/HEIF cu el. Repara cu: npm i sharp@0.35.4`,
  );
});

/* ═══ 2. Drumul catre decodor — reparatia care tine si dupa urmatorul CVE ═══ */

test("extensia obiectului din R2 vine din OCTETI, nu din numele dat de client", () => {
  /*
    ⚠ FARA ASTA, urcarea lui sharp repara doar defectele de AZI. Randul vechi era
    `file.name.split(".").pop()`, iar cheia se construia INAINTE de verificarea pe
    octeti. Deci un cont oarecare putea incarca octeti HEIF sub numele `poza.avif`:
    `detectImageMime` ii spunea `image/heic` (acceptat), cheia primea `.avif` din
    NUME, iar `/api/img` accepta `.avif` si il dadea lui libheif.

    Adica atacatorul alegea ce decodor al nostru atinge, doar redenumind fisierul.
  */
  const cod = faraComentarii(citeste("src/app/api/upload/route.ts"));
  assert.doesNotMatch(
    cod,
    /file\.name\.split\("\."\)\.pop\(\)/,
    "extensia cheii R2 s-a intors la numele dat de client",
  );
  assert.match(cod, /EXT_DUPA_TIP\[tipReal\]/, "extensia nu mai vine din tipul detectat pe octeti");
  /* Cheia trebuie construita DUPA ce se stie `tipReal`, altfel ordinea o face inutila. */
  const iTip = cod.indexOf("const tipReal");
  const iCheie = cod.indexOf("const key =");
  assert.ok(iTip > 0 && iCheie > iTip, "cheia se construieste inaintea verificarii pe octeti");
});

test("octetii HEIF nu pot capata o extensie pe care /api/img o decodeaza", () => {
  // `image/heic` -> `.heic`, iar `.heic` NU e in KEY_RE. Daca cineva pune acolo
  // `avif`, usa se redeschide fara sa cada nimic altceva.
  const cod = citeste("src/app/api/upload/route.ts");
  assert.match(cod, /"image\/heic":\s*"heic"/, "HEIC nu mai primeste extensia .heic");
  assert.match(cod, /"image\/heif":\s*"heic"/, "HEIF nu mai primeste extensia .heic");
  assert.doesNotMatch(cod, /:\s*"avif"/, "ceva primeste extensia .avif la incarcare");
});

/* ═══ 3. Limitele durabile pe formularele care trimit emailuri ═══ */

for (const [nume, cale, cheie] of [
  ["contact", "src/lib/actions/contact.actions.ts", "contact"],
  ["migrare", "src/lib/actions/migration.actions.ts", "migrare"],
] as const) {
  test(`${nume}: are SI plafon durabil, pe IP si pe adresa`, () => {
    /*
      ⚠ AMANDOUA IN ACEEASI TRECERE, dinadins. Reparat doar unul, spamul se muta
      pe celalalt — de aceea proba le cere pe amandoua, nu pe rand.

      Regula casei (limita-durabila.ts) cere stratul din baza pentru orice actiune
      care costa bani. Amandoua trimit doua emailuri, unul catre o adresa aleasa
      de cel care apasa.
    */
    const cod = faraComentarii(citeste(cale));
    assert.match(cod, /rateLimit\(/, "s-a pierdut stratul din memorie");
    assert.match(
      cod, new RegExp(`consumaLimita\\(\`${cheie}:ip:`),
      "lipseste plafonul durabil pe IP — cel din memorie se sterge la fiecare desfasurare",
    );
    assert.match(
      cod, new RegExp(`consumaLimita\\(\`${cheie}:email:`),
      "lipseste plafonul durabil pe adresa — fara el, multi pot inunda cutia aceleiasi victime",
    );
    /* Adresa se normalizeaza, altfel `Ion@X.ro` si `ion@x.ro` sunt doua contoare. */
    assert.match(cod, /\.trim\(\)\.toLowerCase\(\)/, "adresa nu se mai normalizeaza inainte de cheie");
  });
}

test("plafonul pe adresa NU e 3/zi — asta e limita de newsletter, nu de asistenta", () => {
  /*
    ⚠ IMPOTRIVA UNEI REPARATII PROPUSE DE AUDIT. Cerea 3/zi/adresa, cifra luata de
    la abonarea la blog. Dar astea sunt formulare de ASISTENTA: omul cu o problema
    urgenta scrie de mai multe ori, si a patra oara ar fi taiat in tacere — chiar
    defectul impotriva caruia sunt scrise mesajele de eroare de acolo.
  */
  for (const cale of ["src/lib/actions/contact.actions.ts", "src/lib/actions/migration.actions.ts"]) {
    const cod = faraComentarii(citeste(cale));
    const m = cod.match(/consumaLimita\(`[a-z]+:email:[^`]+`,\s*(\d+),/);
    assert.ok(m, `${cale}: n-am gasit plafonul pe adresa`);
    assert.ok(
      Number(m![1]) >= 5,
      `${cale}: plafonul pe adresa e ${m![1]}/zi — prea strans pentru un formular de asistenta`,
    );
  }
});

/* ═══ 4. MFA: plasa de sub contorul care cade deschis ═══ */

test("MFA are plasa din memorie SUB plafonul durabil", () => {
  /*
    ⚠ `consumaLimita` cade DESCHIS (vezi `esecTacut`): la orice eroare de baza
    intoarce `permis: true`. E o alegere buna aproape peste tot — o baza care
    clipeste n-are voie sa incuie oamenii afara din conturi.

    ⚠ DAR AICI NU RAMANEA NIMIC DEDESUBT, iar obiectul pazit e un cod de SASE
    CIFRE. Cat timp RPC-ul nu raspunde, ghicirea devine nelimitata.
  */
  const cod = faraComentarii(citeste("src/lib/auth/flux-mfa.ts"));
  assert.match(cod, /rateLimit\(`mfa-memorie:/, "lipseste plasa din memorie pe incercarile de cod");
  assert.match(cod, /rateLimit\(`mfa-trimite-memorie:/, "lipseste plasa din memorie pe trimiterea de coduri");

  /* Plasa trebuie sa fie INAINTEA celei durabile, altfel n-o mai apara cand aia cade. */
  const iMem = cod.indexOf("rateLimit(`mfa-memorie:");
  const iDur = cod.indexOf("consumaLimita(");
  assert.ok(iMem > 0 && iMem < iDur, "plasa din memorie a ajuns dupa plafonul durabil");
});

/* ═══ 5. reCAPTCHA: actiunea nu mai e optionala ═══ */

test("un token reCAPTCHA fara `action` e respins, nu acceptat", () => {
  const cod = faraComentarii(citeste("src/lib/recaptcha.ts"));
  assert.doesNotMatch(
    cod, /date\.action &&/,
    "paza de falsy s-a intors: un token care nu spune pentru ce a fost emis trece",
  );
  assert.match(cod, /if \(!date\.action\) return/, "lipseste refuzul pentru actiune lipsa");
});

/* ═══ 6. Ce auditul cerea sa STRICAM — probele care spun NU ═══ */

test("⚠ sanitize-html RAMANE zavorat la 2.17.5", () => {
  /*
    ⚠ PROBA ASTA APARA O DECIZIE, NU UN DEFECT.

    Auditul cere (a doua oara) urcarea la 2.17.7. Prima oara am facut-o, pe
    31.08.2026, commit `03fae112`. Rezultatul: `ERR_REQUIRE_ESM` in productie, 56
    de erori, 21 de oameni loviti — si nu doar blogul: vitrine, pagini de produs,
    panou, proxy, cronul eMAG. Build-ul a fost VERDE tot timpul.

    Cauza: pachetul e in `serverExternalPackages`, iar 2.17.6+ cere htmlparser2 ^12,
    care e numai ESM. Lipsa lui `^` din package.json e un ZAVOR PUS DINADINS.

    Se poate urca doar dupa ce pachetul iese din `serverExternalPackages` sau trece
    pe import dinamic — si abia atunci, cu proba pe un preview atins de mana.
  */
  const pj = JSON.parse(citeste("package.json"));
  const v = pj.dependencies?.["sanitize-html"];
  assert.equal(v, "2.17.5", `sanitize-html a fost urcat la ${v} — vezi incidentul din 31.08`);
  assert.doesNotMatch(String(v), /[\^~]/, "zavorul (versiune exacta, fara ^) a fost slabit");
});

test("⚠ bodySizeLimit RAMANE 8mb", () => {
  /*
    Auditul cere coborarea, „prea mare pentru formularele publice". Adevarat ca
    fapt, gresit ca reparatie: Next n-are plafon PE ACTIUNE, deci coborarea l-ar
    cobori si pentru importul de produse — pus la 8mb tocmai fiindca un CSV de 500
    de produse (~1,2MB) era respins tacut de implicitul de 1MB.

    Ordinea corecta e inversa: intai incarcare semnata direct in R2, apoi coborare.
  */
  const cod = citeste("next.config.ts");
  assert.match(cod, /bodySizeLimit:\s*"8mb"/, "s-a coborat bodySizeLimit — vezi de ce e 8mb");
});

test("⚠ HSTS NU capata includeSubDomains", () => {
  /*
    `headers()` e pe `source: "/(.*)"`, fara conditie de gazda, deci antetul pleaca
    si pe cele 17 domenii proprii ale clientilor. Cu `includeSubDomains`, fiecare
    vizitator ar primi o hotarare HTTPS-only pe doi ani peste `mail.`, `webmail.`,
    `cpanel.` — gazde pe care nu le servim, nu le detinem, si al caror certificat
    nu-l putem repara. NU se poate anula scotand antetul.
  */
  const cod = citeste("next.config.ts");
  assert.doesNotMatch(cod, /includeSubDomains/, "s-a adaugat includeSubDomains — e ireversibil si atinge domenii straine");
});

/* ═══ 7. Igiena adevarata ═══ */

test("nicio pagina nu mai pune JSON-LD brut in dangerouslySetInnerHTML", () => {
  const cod = citeste("src/app/(website)/mentenanta-gratuita/page.tsx");
  assert.match(cod, /jsonLdSafe\(jsonLd\)/, "a ramas `JSON.stringify` brut");
  assert.doesNotMatch(faraComentarii(cod), /__html:\s*JSON\.stringify/, "a ramas `JSON.stringify` brut");
});

test("`form-action` din CSP spune ce spune si comentariul", () => {
  /* Nu cumpara aproape nimic cat timp `script-src` are `unsafe-inline` si `https:`.
     S-a schimbat fiindca o nota mincinoasa e mai scumpa decat o directiva larga. */
  const cod = citeste("next.config.ts");
  assert.match(cod, /"form-action 'self'"/, "form-action nu mai e 'self'");
});
