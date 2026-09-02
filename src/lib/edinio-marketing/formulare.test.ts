import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verificaFaraPii, EroarePii } from "./fara-pii";
import { felEroare } from "./fel-eroare";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CONVERSIA E CE A CONFIRMAT SERVERUL, NU CE A APASAT OMUL
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CEA MAI FRECVENTA MINCIUNA DINTR-UN SISTEM DE MASURARE. Un `generate_lead`
  tras la apasarea butonului numara si incercarile care au picat la validare, la
  captcha, la plafoanele de rata sau la trimiterea emailului. Raportul arata mai
  multe cereri decat au ajuns vreodata la noi — si nimeni nu-l pune la indoiala,
  fiindca numarul e mai mare, nu mai mic.

  Aici conversia se trage NUMAI pe ramura in care serverul a raspuns `ok`.

  ⚠ SI `event_id` VINE DE PE SERVER. Cand se adauga Meta CAPI si celelalte,
  browserul si serverul trebuie sa trimita ACELASI id ca sa se deduplice. Nascut
  in browser, ar exista si pentru incercarile cazute; nascut in doua locuri, ar da
  doua conversii pentru un singur om.
*/

const RAD = process.cwd();
const citeste = (c: string) => readFileSync(join(RAD, c), "utf8").replace(/\r\n/g, "\n");
const faraComentarii = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const FORMULARE = [
  { nume: "contact", comp: "src/components/website/ContactForm.tsx", actiune: "src/lib/actions/contact.actions.ts" },
  { nume: "migration", comp: "src/components/website/sections/migrare/FormularMigrare.tsx", actiune: "src/lib/actions/migration.actions.ts" },
] as const;

for (const f of FORMULARE) {
  test(`${f.nume}: conversia se trage DOAR dupa raspunsul bun al serverului`, () => {
    const cod = faraComentarii(citeste(f.comp));

    /*
      ⚠ CERUT CA UN INTREG. O aserttiune care ar cauta doar `generate_lead` ar
      trece verde si daca evenimentul ar sta pe ramura de eroare, sau in afara
      oricarei ramuri. Se cere ca el sa fie INAUNTRUL lui `if (res.ok)`.
    */
    const iOk = cod.indexOf("if (res.ok)");
    assert.ok(iOk > 0, `${f.nume}: n-am gasit ramura de succes`);
    const iEroare = cod.indexOf("} else {", iOk);
    const ramuraBuna = cod.slice(iOk, iEroare > 0 ? iEroare : iOk + 900);

    assert.match(ramuraBuna, /name: "generate_lead"/,
      `${f.nume}: conversia nu mai e pe ramura de succes`);
    assert.match(ramuraBuna, /event_id: res\.eventId/,
      `${f.nume}: id-ul conversiei nu mai vine de pe server`);

    /* Si ca NU e si in alta parte. */
    const cateTotal = (cod.match(/name: "generate_lead"/g) ?? []).length;
    assert.equal(cateTotal, 1, `${f.nume}: conversia se trage din ${cateTotal} locuri`);
  });

  test(`${f.nume}: apasarea butonului NU e conversie`, () => {
    const cod = faraComentarii(citeste(f.comp));
    const iSubmit = cod.indexOf('urmareste({ name: "form_submit"');
    assert.ok(iSubmit > 0, `${f.nume}: nu se mai masoara apasarea butonului`);
    /* Intre apasare si chemarea serverului n-are voie sa existe o conversie. */
    const iServer = cod.indexOf("startTransition", iSubmit);
    assert.doesNotMatch(
      cod.slice(iSubmit, iServer > 0 ? iServer : iSubmit + 400),
      /generate_lead/,
      `${f.nume}: conversia se trage la apasare, inainte ca serverul sa raspunda`,
    );
  });

  test(`${f.nume}: serverul naste id-ul, si numai la succes`, () => {
    const cod = faraComentarii(citeste(f.actiune));
    assert.match(cod, /ok: true; eventId: string/, `${f.nume}: actiunea nu mai intoarce un id`);
    assert.match(cod, /return \{ ok: true, eventId: randomUUID\(\) \}/,
      `${f.nume}: id-ul nu mai e nascut pe calea de succes`);
    /* ⚠ Si ca ramurile de eroare NU poarta id: un id acolo ar fi o conversie. */
    const cateId = (cod.match(/eventId/g) ?? []).length;
    assert.ok(cateId <= 3, `${f.nume}: eventId apare de ${cateId} ori — verifica sa nu fie si pe erori`);
  });

  test(`${f.nume}: „a inceput sa completeze" se masoara o SINGURA data`, () => {
    /*
      ⚠ Fara paza, fiecare intrare intr-un camp ar trage un eveniment. Rata de
      finalizare ar iesi de cateva ori mai mica decat adevarul, si un formular
      perfect ar parea stricat.
    */
    const cod = faraComentarii(citeste(f.comp));
    assert.match(cod, /if \(inceput\.current\) return;/, `${f.nume}: form_start se poate trage de mai multe ori`);
    assert.match(cod, /inceput\.current = true;/, `${f.nume}: paza nu mai tine minte nimic`);
  });
}

test("⚠ felul erorii vine dintr-o multime INCHISA, nu din text transformat", () => {
  /*
    ⚠ PROBA ASTA A PRINS UN DEFECT DE PROIECTARE AL MEU, inainte de productie.

    Prima forma lua mesajul erorii si il facea snake_case. Pare curatat, dar nu e:
    `"Adresa ion@exemplu.ro e deja folosita"` devenea
    `adresa_ion_exemplu_ro_e_deja_folosita` — `@` si `.` au disparut, CUVINTELE au
    ramas. Iar paza anti-PII n-ar mai fi prins-o tocmai fiindca nu mai arata a email.

    Acum nu se curata, se CLASIFICA. Nimic din mesaj nu iese.
  */
  assert.equal(felEroare("Nu am putut confirma ca esti o persoana."), "captcha");
  assert.equal(felEroare("Ai trimis deja cateva mesaje. Te rugam sa astepti un minut."), "limita");
  assert.equal(felEroare("Completeaza toate campurile obligatorii."), "validare");

  /* ⚠ Cazul care a doborat prima forma: nimic din adresa nu supravietuieste. */
  const fel = felEroare("Adresa ion@exemplu.ro e deja folosita");
  assert.doesNotMatch(fel, /ion|exemplu/, "textul erorii inca razbate in raport");
  assert.ok(["captcha", "validare", "limita", "trimitere", "altul"].includes(fel));

  assert.doesNotThrow(() => verificaFaraPii("form_error", { form_name: "contact", error_type: fel }));
});

test("un mesaj necunoscut devine `altul`, nu o bucata din el", () => {
  /*
    Un `altul` care creste in rapoarte inseamna ca a aparut un fel de eroare nou
    si ca lista din `fel-eroare.ts` trebuie recitita. Asta e informatia utila —
    nu textul.
  */
  assert.equal(felEroare("ceva ce nu s-a mai intamplat niciodata"), "altul");
  assert.equal(felEroare(""), "altul");
  assert.equal(felEroare(null), "altul");
});

test("martor: formularele chiar folosesc clasificarea, nu o transformare de text", () => {
  for (const f of FORMULARE) {
    const cod = faraComentarii(citeste(f.comp));
    assert.match(cod, /error_type: felEroare\(res\.error\)/,
      `${f.nume}: felul erorii nu mai vine din multimea inchisa`);
    assert.doesNotMatch(cod, /replace\(\/\[\^a-z\]/,
      `${f.nume}: s-a intors transformarea de text liber — vezi de ce e o poarta care pare inchisa`);
  }
});

test("un `error_type` netransformat ar fi oprit de paza anti-PII", () => {
  /* Martorul celeilalte jumatati: daca cineva scoate transformarea, magistrala
     opreste evenimentul in loc sa duca adresa in rapoarte. */
  assert.throws(
    () => verificaFaraPii("form_error", { error_type: "Adresa ion@exemplu.ro e deja folosita" }),
    EroarePii,
  );
});

test("⚠ lista de nume socotite curate nu poate fi folosita ca portita", () => {
  /*
    ⚠ GAURA PRINSA DE MUTANTI, nu de mine. Am adaugat `NUME_CUNOSCUTE_CURATE` ca
    sa nu mai fie oprit `form_name` — legitim. Dar am lasat astfel o lista in care
    cineva poate strecura `email` sau `phone`, iar paza s-ar stinge FARA ca vreo
    proba sa cada. O mutatie care punea `"email"` acolo a trecut verde.

    Deci nu se probeaza lista, se probeaza PURTAREA: cheile cu adevarat
    periculoase trebuie sa fie respinse, oricum ar arata listele dinauntru.
  */
  const NEIERTATE = [
    "email", "user_email", "phone", "telefon", "mesaj", "message",
    "token", "parola", "password", "cnp", "iban", "user_id",
    "first_name", "last_name", "full_name",
  ];
  for (const cheie of NEIERTATE) {
    assert.throws(
      () => verificaFaraPii("orice", { [cheie]: "valoare" }),
      EroarePii,
      `cheia "${cheie}" a trecut de paza anti-PII — verifica NUME_CUNOSCUTE_CURATE`,
    );
  }
});

test("si numele legitime raman permise", () => {
  /* Martorul celeilalte jumatati: o paza care respinge tot e la fel de inutila. */
  for (const cheie of ["form_name", "section_name", "cta_id", "plan_id", "article_slug"]) {
    assert.doesNotThrow(
      () => verificaFaraPii("orice", { [cheie]: "contact" }),
      `cheia "${cheie}" e legitima, dar a fost oprita`,
    );
  }
});

/* ═══ Apasarea care nu ajunge nicaieri ═══ */

test("⚠ o chemare cazuta ARATA omului o eroare SI lasa urma", () => {
  /*
    ═══ DEFECTUL, GASIT DIN MASURATOARE PE 02.09.2026 ═══

    GA4 arata `form_submit` de doua ori. Contorul durabil de pe server arata o
    singura cerere primita. Iar `form_error` era ZERO.

    Adica o apasare se pierduse intre browser si server, si nu figura nicaieri:
    nici ca reusita, nici ca esec. Explicatia era ca blocul asincron n-avea
    `try/catch`. Cand chemarea actiunii pica — retea, sau o pagina veche care
    cheama o actiune disparuta dupa desfasurare — functia se rupea si:

      `setEroare` nu se chema  -> omul nu vedea nimic si credea ca n-a apasat
      niciun eveniment          -> noi nu aflam ca l-am pierdut

    ⚠ PROBA CERE AMANDOUA, si de-asta nu e o potrivire simpla pe `catch`. Un
    `catch` care doar arata eroarea repara omul si ne lasa pe noi orbi; unul care
    doar masoara ne repara noua raportul si lasa omul in fata unui formular mut.
  */
  for (const [cale, nume] of [
    ["src/components/website/ContactForm.tsx", "contact"],
    ["src/components/website/sections/migrare/FormularMigrare.tsx", "migration"],
  ] as const) {
    const cod = faraComentarii(citeste(cale));

    const iTransition = cod.indexOf("startTransition(async () => {");
    const iTry = cod.indexOf("try {", iTransition);
    const iCatch = cod.indexOf("} catch", iTry);

    assert.ok(iTransition > 0, `${cale}: n-am gasit blocul asincron`);
    assert.ok(iTry > iTransition, `${cale}: chemarea serverului nu mai e sub try`);
    assert.ok(iCatch > iTry, `${cale}: s-a pierdut catch-ul — o chemare cazuta dispare fara urma`);

    /*
      ⚠ SI TRY-UL SA FIE INAINTEA CHEMARII, nu dupa. Un `try` pus dupa `await`
      arata la fel intr-o cautare pe text si nu apara nimic.
    */
    const iChemare = cod.indexOf("await tokenRecaptcha", iTransition);
    assert.ok(iChemare > iTry, `${cale}: chemarea captcha e INAINTEA lui try`);

    const bloc = cod.slice(iCatch, cod.indexOf("});", iCatch));
    assert.match(bloc, /setEroare\(/, `${cale}: catch-ul nu arata nimic omului`);
    /*
      ⚠ POTRIVIRE DE SIR SIMPLU, nu regex construit dintr-un sablon. Prima forma
      era `new RegExp(\`…[\s\S]*…\`)`, si intr-un template literal `\s`
      ajunge `s`: clasa devenea „s sau S", nu „orice caracter". Proba cadea pe un
      cod care era corect. A doua oara acelasi tipar in proiectul asta.
    */
    assert.ok(bloc.includes('name: "form_error"'), `${cale}: catch-ul nu lasa urma`);
    assert.ok(
      bloc.includes(`form_name: "${nume}"`),
      `${cale}: urma nu spune despre CARE formular e vorba`,
    );
    assert.match(bloc, /error_type: "retea"/, `${cale}: pierderea nu se deosebeste de un esec al serverului`);
  }
});

test("`retea` nu poate veni dintr-un mesaj al serverului", () => {
  /*
    Toate celelalte feluri descriu ce a RASPUNS serverul. `retea` inseamna ca n-a
    raspuns deloc. Daca vreun tipar l-ar putea intoarce, cele doua s-ar amesteca
    si raportul n-ar mai putea deosebi „am refuzat" de „n-am ajuns".
  */
  for (const m of [
    "Nu am putut trimite mesajul. Incearca din nou.",
    "Prea multe mesaje trimise de aici.",
    "Nu am putut confirma ca esti o persoana.",
    "Completeaza toate campurile obligatorii.",
    "ceva cu totul necunoscut",
    "",
  ]) {
    assert.notEqual(felEroare(m), "retea", `mesajul "${m}" a fost clasificat drept cadere de retea`);
  }
});
