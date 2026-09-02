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

test("`form-action` lasa Meta sa posteze, si NIMIC mai mult", () => {
  /*
    ═══ ⚠ DE CE NU MAI E `'self'` GOL ═══

    A fost, si a blocat pixelul Meta. Masurat in consola productiei pe 02.09.2026:
    „Sending form data to 'https://www.facebook.com/tr/' violates … form-action
    'self'. The request has been blocked."

    Meta trimite prin GET cat timp incape in adresa si trece pe POST cand nu mai
    incape. A doua cale era taiata, deci evenimentele mai incarcate se pierdeau
    tacut. Stramtarea verificase formularele NOASTRE; formularul era al lor.

    ⚠ PROBA CERE SI CE NU E ACOLO. Fara al doilea rand, un `form-action 'self'
    https:` (adica orice gazda) ar trece verde — si atunci directiva n-ar mai
    insemna nimic, exact starea de dinaintea stramtarii.
  */
  const cod = citeste("next.config.ts");
  assert.match(
    cod, /"form-action 'self' https:\/\/www\.facebook\.com"/,
    "form-action nu mai lasa Meta sa posteze — evenimentele incarcate se pierd tacut",
  );
  assert.doesNotMatch(
    cod, /"form-action[^"]*\shttps:\s*[";]/,
    "form-action s-a largit inapoi la `https:` (orice gazda), nu doar la Meta",
  );
});

/* ═══ 8. Politica de cookies nu are voie sa se departeze de cod ═══ */

test("politica NU mai promite o poarta de consimtamant pe edinio.com", () => {
  /*
    ⚠ CE ERA GRESIT. Sectiunea 20 se numea „Meta Pixel este activat numai după
    consimțământ", iar pixelul se aprindea chiar pe pagina aceea. Masurat:
    `curl https://www.edinio.com/cookies` -> o aparitie `facebook.com/tr`, zero
    urme de banner.

    ⚠ NU E UN DEFECT DE COD, e o declaratie inexacta catre utilizatori si catre
    autoritate. Proprietarul a ales sa aduca TEXTUL la ce face codul — o poarta ar
    fi scos conversiile din onboarding din raportarea Meta/TikTok.

    ⚠ PROBA ASTA PAZESTE POTRIVIREA IN AMANDOUA SENSURILE. Daca maine se pune
    poarta pe edinio.com, ea cade — si atunci textul trebuie dus inapoi, nu proba
    stearsa. Un document care descrie o poarta inexistenta e la fel de gresit ca
    unul care tace despre una existenta.
  */
  const cod = citeste("src/lib/website/cookies.ts");

  assert.doesNotMatch(
    cod,
    /titlu: "Meta Pixel este activat numai după consimțământ"/,
    "titlul care promitea poarta s-a intors, dar poarta nu exista pe edinio.com",
  );
  assert.match(
    cod,
    /Pe edinio\.com și în Platforma Edinio/,
    "s-a pierdut sectiunea care spune limpede ce se intampla pe propriile noastre pagini",
  );
  assert.match(
    cod,
    /se încarcă odată cu pagina, fără un banner de consimțământ prealabil/,
    "textul nu mai descrie purtarea adevarata a pixelilor pe edinio.com",
  );

  /* Afirmatiile de fapt despre banner trebuie sa spuna PE CE il arata. */
  assert.match(
    cod,
    /Pe magazinele create prin Edinio, la prima accesare/,
    "sectiunea 24 a revenit la formularea care spune ca mecanismul se arata oricui — fals pentru edinio.com",
  );
});

test("consimtamantul e legat de magazine, nu de platforma — si asa scrie", () => {
  /*
    Martorul celeilalte jumatati: daca `ConsentGate` ajunge vreodata si pe
    layouturile platformei, textul de mai sus devine el insusi mincinos, in
    sens invers. Proba pica atunci si trimite pe cine o citeste inapoi la nota.
  */
  const cai = [
    "src/app/(website)/layout.tsx",
    "src/app/(ajutor)/layout.tsx",
    "src/app/(dashboard)/layout.tsx",
  ];
  for (const c of cai) {
    const cod = faraComentarii(citeste(c));
    assert.doesNotMatch(
      cod, /ConsentGate|CookieConsent/,
      `${c} a capatat poarta de consimtamant — atunci politica de cookies trebuie dusa inapoi ` +
      "la forma care o descrie (sectiunile 20, 24, 25, 28)",
    );
  }
});

/* ═══ 9. Gazda reCAPTCHA: se masoara acum, se refuza cand stim ce apare ═══ */

test("gazda din reCAPTCHA se citeste si se scrie in jurnal, dar NU respinge inca", () => {
  /*
    ⚠ PROBA ASTA PAZESTE O ETAPA, NU O STARE FINALA.

    Auditul cere respingerea tokenurilor emise de pe alt domeniu. Are dreptate ca
    principiu. Dar o lista de gazde scrisa din birou, pusa direct pe calea prin
    care intra clientii, e o cadere de serviciu care asteapta un domeniu nou —
    si n-am putut vedea consola Google ca sa stiu daca bifa „Verify the origin of
    reCAPTCHA solutions" o face oricum de prisos.

    Deci: se masoara intai. Aceeasi purtare pe care auditul o cere pentru CSP —
    Report-Only inainte de aplicare.

    ⚠ CAND SE FACE PASUL catre refuz, proba asta trebuie MUTATA, nu stearsa:
    cerinta devine `return { ok: false }` in loc de `console.warn`.
  */
  const cod = faraComentarii(citeste("src/lib/recaptcha.ts"));

  assert.match(cod, /hostname\?: string;/, "raspunsul Google nu mai poarta gazda, deci nu se poate masura nimic");
  assert.match(cod, /GAZDE_CUNOSCUTE/, "s-a pierdut lista de gazde asteptate");
  assert.match(
    cod, /console\.warn\("\[recaptcha\] token emis de pe o gazda neasteptata"/,
    "nu se mai scrie nimic cand apare o gazda straina — atunci masurarea nu produce nicio dovada",
  );
  /* ⚠ Si ca inca NU respinge: daca cineva face pasul, sa vina si sa mute proba. */
  const iGazda = cod.indexOf("GAZDE_CUNOSCUTE");
  const bucata = cod.slice(iGazda, iGazda + 700);
  assert.doesNotMatch(
    bucata, /ok: false, motiv: `?gazda/,
    "s-a trecut la respingere pe gazda — bine, dar atunci proba asta trebuie rescrisa " +
    "ca sa ceara refuzul, si trebuie stiut ce gazde au aparut in jurnal intre timp",
  );
});

/* ═══ 10. Reclamele nu intra pe ecranele autentificate cu continut nepublicat ═══ */

test("previzualizarea de articol NU incarca pixeli de publicitate", async () => {
  /*
    ⚠ ARGUMENTUL NU E DE CONFIDENTIALITATE, E DE INCREDERE. Pagina de
    previzualizare are o sesiune Supabase, iar cookie-ul ei nu e `httpOnly` —
    nu din scaparea noastra, ci fiindca modelul Supabase pentru clienti de browser
    cere ca tokenurile sa fie citibile din JavaScript.

    Un script tert incarcat acolo ruleaza cu drepturile paginii. Daca lantul de
    livrare al furnizorului e vreodata compromis, paguba nu mai e „s-a stricat o
    pagina de marketing": e o sesiune de admin, cu un articol nepublicat pe ecran.

    ⚠ SE INTOARCE `null` INAINTE DE RANDARE. Un `<Script>` care nu intra in arbore
    nu se injecteaza niciodata; unul scos dupa montare a apucat deja sa se incarce
    si sa trimita `PageView`. Proba cere ordinea, nu doar prezenta.
  */
  const { faraUrmarire } = await import("./edinio-marketing/fara-urmarire");

  assert.equal(faraUrmarire("/blog/previzualizare/abc-123"), true, "draftul nu mai e ferit");
  assert.equal(faraUrmarire("/blog/previzualizare/"), true);

  /* ⚠ Si NU peste tot: o regula prea lata ar stinge masuratoarea intregului site. */
  assert.equal(faraUrmarire("/blog/un-articol-public"), false, "regula s-a intins peste blogul public");
  assert.equal(faraUrmarire("/"), false, "regula s-a intins peste pagina principala");
  assert.equal(faraUrmarire("/preturi"), false);

  /*
    ⚠ `null` DA FALS, dinadins. Pe drumul obisnuit calea e gata la prima randare;
    un adevarat aici ar stinge pixelii pe tot site-ul, in tacere.
  */
  assert.equal(faraUrmarire(null), false, "o cale nestiuta stinge urmarirea peste tot");
  assert.equal(faraUrmarire(undefined), false);
});

test("amandoi pixelii intreaba aceeasi regula, si o intreaba INAINTE de randare", () => {
  /*
    ⚠ IMPOTRIVA DERIVEI. Doua liste de cai, cate una in fiecare componenta, s-ar
    despartii la prima cale adaugata — si cea uitata ar continua sa incarce
    scriptul fara ca nimic sa cada.
  */
  for (const f of [
    "src/components/edinio-marketing/EdinioMetaPixel.tsx",
    "src/components/edinio-marketing/EdinioTikTokPixel.tsx",
  ]) {
    const cod = faraComentarii(citeste(f));
    /*
      ⚠ CERUTA CA UN INTREG, nu doar chemarea. Prima forma a randului asta era
      `assert.match(cod, /faraUrmarire\(cale\)/)` — si a lasat sa treaca VERDE un
      mutant care punea `void faraUrmarire(cale);`: regula se chema, raspunsul se
      arunca, scriptul se incarca oricum. Textul exista, purtarea nu.

      A treia oara azi cand fac aceeasi greseala in aceeasi zi in care o repar.
    */
    assert.match(
      cod, /if \(faraUrmarire\(cale\)\) return null;/,
      `${f} cheama regula dar nu se opreste din ea — scriptul se incarca oricum`,
    );
    assert.doesNotMatch(
      cod, /previzualizare/,
      `${f} si-a scris propria lista de cai pe langa cea comuna`,
    );

    /*
      Hook-ul inaintea oricarei iesiri — altfel cade la prima randare fara id.

      ⚠ SE UITA LA PRIMA IESIRE, ORICARE AR FI EA. Prima forma cauta un nume
      anume (`if (!PIXEL_ID)`) si a cazut cand variabila s-a redenumit la
      migrarea in `edinio-marketing` — `indexOf` a dat -1, iar mesajul spunea
      „hook-ul e chemat dupa o iesire timpurie", ceea ce era FALS. Proba avea
      dreptate sa cada, dar din alt motiv decat spunea.

      Regula adevarata n-are nimic de-a face cu numele variabilei: niciun `return`
      nu are voie inaintea hook-ului.
    */
    const iHook = cod.indexOf("usePathname()");
    const iPrimaIesire = cod.indexOf("return null;");
    assert.ok(iHook > 0, `${f}: lipseste usePathname`);
    assert.ok(iPrimaIesire > 0, `${f}: nicio iesire timpurie — s-a pierdut paza?`);
    assert.ok(iHook < iPrimaIesire, `${f}: hook-ul e chemat dupa o iesire timpurie — incalca regulile hook-urilor`);

    /*
      ═══ ⚠ SI GAZDA SE VERIFICA IN SCRIPT ═══

      Defectul reparat pe 01.09.2026: niciunul din cei doi pixeli nu se uita la
      gazda, deci porneau si pe `localhost`, si pe fiecare desfasurare de
      previzualizare, trimitand evenimente in pixelul ADEVARAT. Datele acelea nu
      se mai pot scoate dintr-un cont de reclame, iar audientele de retargetare
      se construiesc din ele.

      Verificarea trebuie sa fie IN SCRIPT, nu la randare: `window` nu exista pe
      server, iar o randare deosebita ar strica hidratarea.
    */
    assert.match(
      cod, /GAZDE_PRODUCTIE/,
      `${f}: nu mai stie de gazdele de productie — pixelul porneste in previzualizari`,
    );
    assert.match(
      cod, /indexOf\(location\.hostname\) === -1\) return;/,
      `${f}: paza pe gazda nu mai OPRESTE scriptul; textul poate exista, purtarea nu`,
    );
  }
});

test("`.env.example` numeste cheile reCAPTCHA, chiar daca le lasa goale", () => {
  /*
    ⚠ CE ERA GRESIT: lipseau. Iar CI face `cp .env.example .env.local`, deci ce
    dovedea el era ca site-ul se CONSTRUIESTE fara CAPTCHA, nu ca o configuratie
    de productie o contine. Nimic nu striga, fiindca verificarea e scrisa dinadins
    sa treaca fara cheie.

    ⚠ GOALE, NU COMPLETATE: goale se poarta ca lipsa, adica exact ce vrem la probe.
  */
  const ex = citeste(".env.example");
  assert.match(ex, /^NEXT_PUBLIC_RECAPTCHA_SITE_KEY=/m, "cheia publica nu e numita in .env.example");
  assert.match(ex, /^RECAPTCHA_SECRET_KEY=/m, "cheia secreta nu e numita in .env.example");
});

/* ═══ 11. Desfasurarea de productie se opreste daca lipsesc cheile ═══ */

test("paza de chei se aprinde DOAR pe build-ul de productie de la Vercel", () => {
  /*
    ⚠ PRIMA VARIANTA A ACESTEI PAZE A STRICAT `npm run build` PE MASINA DE LUCRU,
    si merita scris de ce, fiindca e o capcana care se intinde peste tot:

    `vercel env pull` scrie in `.env.local` si `VERCEL_ENV="production"`. Deci
    conditia „suntem in productie" era adevarata si local. Discriminatorul adevarat
    e `CI`, pe care Vercel il pune la fiecare build si care NU e nici in
    `.env.local`, nici in `.env.example` (verificate amandoua).

    Probat in trei situatii, nu doua:
      local, fara CI                          compileaza
      CI + VERCEL_ENV + cheile puse           compileaza, striga pentru RESEND
      CI + VERCEL_ENV + o cheie obligatorie   OPRESTE
  */
  const cod = faraComentarii(citeste("next.config.ts"));

  /* Toate trei portile, ca UNITATI — nu doar cuvintele risipite prin fisier. */
  assert.match(cod, /if \(!process\.env\.CI\) return;/, "s-a pierdut discriminatorul `CI` — paza s-ar aprinde si local");
  assert.match(cod, /if \(process\.env\.VERCEL_ENV !== "production"\) return;/, "paza s-ar aprinde si pe preview");
  assert.match(
    cod, /if \(faza !== "phase-production-build"\) return;/,
    "paza nu mai e legata de faza de BUILD — asa ar putea opri pornirea serverului, " +
    "adica ar transforma o captcha stinsa intr-o platforma cazuta",
  );

  /* Si ca e chiar chemata din configul exportat, nu doar definita. */
  assert.match(cod, /verificaCheileDeProductie\(faza\)/, "paza e definita, dar n-o cheama nimeni");
  assert.match(cod, /export default function config\(faza: string\)/,
    "configul nu mai e o functie, deci Next nu mai da `faza` si paza nu poate sti unde e");
});

test("toate trei cheile opresc desfasurarea, si niciuna n-a ajuns acolo pe ghicite", () => {
  /*
    ⚠ PROBA ASTA SI-A FACUT TREABA SI A FOST APOI MUTATA, dinadins.

    In prima ei forma cerea ca `RESEND_API_KEY` sa NU fie intre cele care opresc:
    n-o vazusem in panou, iar in `.env.local` e goala. O oprire de desfasurare pe o
    cheie a carei stare n-o cunosti e chiar paguba impotriva careia e scrisa paza.

    Pe 01.09.2026 proprietarul a confirmat: „in Production am toate cheile cum
    trebuie". Atunci s-a mutat cheia, si odata cu ea proba — nu s-a sters.

    ⚠ DE CE O CONFIRMARE PE CUVANT A FOST DESTUL TOCMAI AICI: daca totusi lipseste,
    desfasurarea se opreste cu numele cheii in jurnal, si nu se strica nimic din ce
    ruleaza deja. Greseala e ieftina si reversibila. Pentru ceva care ar fi doborat
    productia n-as fi acceptat-o.
  */
  const cod = faraComentarii(citeste("next.config.ts"));
  const obligatorii = cod.slice(cod.indexOf("CHEI_OBLIGATORII"), cod.indexOf("CHEI_ASTEPTATE"));

  for (const c of ["RECAPTCHA_SECRET_KEY", "NEXT_PUBLIC_RECAPTCHA_SITE_KEY", "RESEND_API_KEY"]) {
    assert.match(
      obligatorii, new RegExp(`"${c}"`),
      `${c} nu mai opreste desfasurarea. Daca a fost scoasa dinadins, scrie de ce ` +
      "aici — altfel lipsa ei stinge in tacere o aparare sau o cale intreaga.",
    );
  }

  /* Lista a doua ramane, goala, ca loc pentru urmatoarea cheie neconfirmata. */
  assert.match(cod, /CHEI_ASTEPTATE/, "s-a pierdut lista pentru cheile inca neconfirmate");
});


/* ═══ 12. Textele legale nu revendica unelte pe care nu le avem ═══ */

test("politicile NU sustin ca folosim GA4 sau Tag Manager cat timp nu le avem", () => {
  /*
    ⚠ CE ERA FALS PE 01.09.2026, in doua documente publice:
      - `confidentialitate.ts:817` — „Edinio utilizeaza Google Tag Manager"
      - `confidentialitate.ts:776` si `cookies.ts:490` — „Edinio utilizeaza GA4"
    Masurat: zero cod, zero variabila de mediu, zero eticheta Google in HTML-ul
    livrat de productie. Niciunul din cele doua nu exista.

    ⚠ SI CEL MAI USOR DE RATAT: tabelele de cookie-uri ne atribuiau `_ga`,
    `_ga_<id>` si `_gcl_*`. Alea chiar apar pe `www.edinio.com` — dar sunt ale
    MAGAZINELOR gazduite pe aceeasi origine, nu ale noastre. Un cookie prezent pe
    domeniu nu e neaparat pus de tine.

    ⚠ PROBA ASTA E IN AMANDOUA SENSURILE, ca si cea despre consimtamant. Cand GA4
    corporate va porni cu adevarat, ea CADE si cere ca textul sa fie adus la loc —
    nu sa fie stearsa proba. Un document care spune „nu folosim" despre ceva
    pornit e la fel de gresit ca unul care spune invers.
  */
  const conf = citeste("src/lib/website/confidentialitate.ts");
  const ck = citeste("src/lib/website/cookies.ts");

  /* Tag Manager: hotarat sa nu existe niciodata (implementare directa in cod). */
  assert.match(conf, /Edinio NU utilizează Google Tag Manager/,
    "s-a intors afirmatia ca folosim Tag Manager — nu-l folosim si nu e in plan");

  /*
    ⚠ SEMNALUL BUN NU E „EXISTA COD". Prima forma a probei se uita daca exista cod
    GA4 in depozit — si a cazut in aceeasi zi in care l-am scris, cerandu-mi sa
    spun in politici ca folosim GA4 cand el inca nu rula nicaieri. Codul poate
    exista si variabila sa lipseasca din Vercel; atunci eticheta nu se randeaza
    deloc, si textul ar fi minciuna.

    Semnalul adevarat e: POATE PORNI O DESFASURARE DE PRODUCTIE FARA GA4?
      cheia in `CHEI_OBLIGATORII`  ->  nu poate. GA4 ruleaza sigur. Text la prezent.
      cheia lipsa de acolo        ->  poate. Textul ramane cumpatat.

    Asa, verificarea de la desfasurare (`next.config.ts`) face afirmatia din
    politici adevarata prin CONSTRUCTIE, nu prin speranta.
  */
  const config = citeste("next.config.ts");
  const obligatorii = config.slice(config.indexOf("CHEI_OBLIGATORII"), config.indexOf("CHEI_ASTEPTATE"));
  const ga4ESigur = /NEXT_PUBLIC_EDINIO_GA4_MEASUREMENT_ID/.test(obligatorii);

  if (!ga4ESigur) {
    for (const [nume, text] of [["confidentialitate", conf], ["cookies", ck]] as const) {
      assert.doesNotMatch(
        text, /Edinio utilizează Google Analytics 4/,
        `${nume}: textul spune ca folosim GA4, dar nu exista in cod`,
      );
      assert.match(text, /NU este încă activ pe edinio\.com/,
        `${nume}: lipseste precizarea ca serviciul nu e pornit`);
    }
  } else {
    /*
      Cheia e obligatorie la desfasurare, deci nicio productie nu poate rula fara
      GA4. Acum textele TREBUIE sa spuna ca-l folosim, la prezent.
    */
    for (const [nume, text] of [["confidentialitate", conf], ["cookies", ck]] as const) {
      assert.match(
        text, /Edinio utilizează Google Analytics 4/,
        `${nume}: GA4 e obligatoriu la desfasurare, dar textul inca spune ca nu e activ. ` +
        "Scoate formularea cu „pregătește” si precizarea ca nu e pornit.",
      );
      assert.doesNotMatch(text, /NU este încă activ/, `${nume}: a ramas precizarea veche`);
    }
  }
});

