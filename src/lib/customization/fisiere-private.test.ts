import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  areFormaCheii, cheieIncarcare, esteCheiaNoastra,
} from "@/lib/customization/fisiere-private";
/*
 * ⚠ Terminatia se citeste din modulul PUR, nu de aici: `fisiere-private` importa `node:crypto`,
 * iar regula terminatiei o cer si doua componente de browser. Erau doua copii, si s-au departat.
 */
import { PREFIX_INCARCARI, terminatia } from "@/lib/customization/adresa";

/**
 * CHEIA UNUI FISIER INCARCAT DE CUMPARATOR NU SE POATE COMPUNE.
 *
 * ═══ ⚠ CE APARA, in cuvinte simple ═══
 *
 * `business_id` e PUBLIC: sta in fiecare pagina de magazin. Daca cheia ar fi doar
 * `<prefix>/<business_id>/<uuid>.jpg`, singurul lucru necunoscut ar fi UUID-ul — iar depozitul
 * raspunde direct, fara sa treaca pe la noi. Semnatura HMAC face ca nici cine stie tot ce e
 * public sa nu poata SCRIE o adresa valida.
 *
 * ⚠ E prima din cele doua paze. A doua — sesiune, magazin, comanda — se probeaza acolo unde
 * traieste, in `app/api/customization-file/poarta-fisierului.test.ts`, rulandu-se chiar ruta.
 *
 * ═══ ⚠ DE CE UNELE PROBE DE AICI PAR SA SE REPETE ═══
 *
 * Nu se repeta: fiecare izoleaza ALT strat. Prefixul leaga cheia de magazin, si semnatura o leaga
 * A DOUA OARA. O proba care schimba amandoua deodata ar fi trecut si peste o semnatura care nu mai
 * tine cont de magazin — masurat cu un mutant, exact asta s-a intamplat prima data.
 */

const BIZ = "11111111-1111-4111-8111-111111111111";
const ALT_BIZ = "22222222-2222-4222-8222-222222222222";
const NUME = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

/** ⚠ Secretul se pune AICI, nu se presupune: `secret()` il citeste la fiecare chemare. */
process.env.SHIPPING_QUOTE_SECRET = "secret-de-proba-pentru-semnatura";
/* Si cel dedicat se stinge, ca proba sa masoare chiar lantul, nu ce s-a nimerit in mediu. */
delete process.env.CUSTOMIZATION_FILE_SECRET;

/* ═══════════════════════════════════════════════════════════════════════════
   1. DUS-INTORS: ce scriem noi, recunoastem noi
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ cheia scrisa de noi se recunoaste de noi", () => {
  /*
   * ⚠ Pare o formalitate si nu e: lungimea semnaturii e scrisa in DOUA locuri — feliata la
   * generare, ceruta ca `{24}` la verificare. Cine schimba unul fara celalalt rupe TOATE
   * incarcarile, si le rupe la COMANDA, unde `verificaPersonalizarea` refuza fisierul.
   */
  const cheie = cheieIncarcare(BIZ, NUME, "jpg");
  assert.ok(cheie.startsWith(`${PREFIX_INCARCARI}${BIZ}/`), cheie);
  assert.ok(esteCheiaNoastra(cheie, BIZ), `cheia noastra nu se recunoaste: ${cheie}`);
});

test("terminatia se normalizeaza, si ce nu e terminatie devine `bin`", () => {
  assert.ok(cheieIncarcare(BIZ, NUME, "JPG").endsWith(".jpg"));
  assert.ok(cheieIncarcare(BIZ, NUME, "pdf").endsWith(".pdf"));
  /* ⚠ Nimic din ce vine ca terminatie nu ajunge in cheie neverificat: altfel ar fi cale de iesire. */
  assert.ok(cheieIncarcare(BIZ, NUME, "../../etc").endsWith(".bin"));
  assert.ok(cheieIncarcare(BIZ, NUME, "").endsWith(".bin"));
  assert.ok(esteCheiaNoastra(cheieIncarcare(BIZ, NUME, "../../etc"), BIZ), "cheia cazuta pe `bin` nu se mai recunoaste");
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. SEMNATURA: fiecare bucata a ei apara ceva, si se arata SEPARAT
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ o cheie compusa de mana se refuza, oricat de bine ar arata", () => {
  const compusa = `${PREFIX_INCARCARI}${BIZ}/${NUME}-000000000000000000000000.jpg`;
  assert.equal(esteCheiaNoastra(compusa, BIZ), false, "cine stie `business_id` isi poate scrie adresa");
});

test("⚠ SEMNATURA singura leaga cheia de magazin — nu doar prefixul", () => {
  /*
   * ⚠ PROBA ASTA EXISTA DINTR-UN MUTANT. Scoaterea lui `businessId` din ce se semneaza NU doborase
   * nimic, fiindca toate probele schimbau si prefixul odata cu magazinul — iar prefixul refuza
   * singur. Aici prefixul e al magazinului BUN si numai semnatura e a celuilalt: daca semnatura
   * n-ar tine cont de magazin, cheia altui magazin s-ar putea muta la noi taind-o si lipind-o.
   */
  const aAltuia = cheieIncarcare(ALT_BIZ, NUME, "jpg");
  const semnaturaAltuia = /-([0-9a-f]{24})\.jpg$/.exec(aAltuia)?.[1];
  assert.ok(semnaturaAltuia, `nu s-a putut citi semnatura din ${aAltuia}`);

  const mutata = `${PREFIX_INCARCARI}${BIZ}/${NUME}-${semnaturaAltuia}.jpg`;
  assert.equal(esteCheiaNoastra(mutata, BIZ), false, "semnatura nu tine cont de magazin");
});

test("⚠ semnatura tine cont si de NUME si de TERMINATIE", () => {
  const cheie = cheieIncarcare(BIZ, NUME, "jpg");
  const semn = /-([0-9a-f]{24})\.jpg$/.exec(cheie)![1];

  assert.equal(
    esteCheiaNoastra(`${PREFIX_INCARCARI}${BIZ}/ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee-${semn}.jpg`, BIZ),
    false, "aceeasi semnatura merge pe orice nume",
  );
  /*
   * ⚠ Terminatia HOTARASTE `Content-Type`-ul cu care ruta serveste octetii. Nesemnata, cine are o
   * cheie de `.jpg` ar putea cere acelasi fisier ca `.pdf` — sau invers.
   */
  assert.equal(
    esteCheiaNoastra(`${PREFIX_INCARCARI}${BIZ}/${NUME}-${semn}.pdf`, BIZ),
    false, "terminatia nu e semnata",
  );
});

test("⚠ semnatura depinde CHIAR de secret", () => {
  const cheie = cheieIncarcare(BIZ, NUME, "jpg");
  const vechi = process.env.SHIPPING_QUOTE_SECRET;
  try {
    process.env.SHIPPING_QUOTE_SECRET = "cu-totul-alt-secret";
    assert.equal(esteCheiaNoastra(cheie, BIZ), false, "cheia trece si cu alt secret: semnatura nu e o semnatura");
  } finally {
    process.env.SHIPPING_QUOTE_SECRET = vechi;
  }
});

test("⚠ nicio cheie nu poate cobori intr-alt dosar, nici semnata de noi", () => {
  /*
   * ⚠ SI PROBA ASTA EXISTA DINTR-UN MUTANT. Scoaterea opririi pe `/` nu doborase nimic, fiindca
   * cheia stricata din proba pica oricum la forma semnaturii — adica proba trecea din alt motiv
   * decat cel scris pe ea.
   *
   * ⚠ Azi `nume` e mereu un `randomUUID()` pus de ruta noastra, deci cazul nu se poate produce.
   * Ce apara oprirea e URMATORUL apelant: o cheie cu `/` in coada ar arata catre alt dosar din
   * depozit, iar prefixul n-ar mai spune nimic despre unde ajunge cererea.
   */
  const cuDosar = cheieIncarcare(BIZ, `sub/${NUME}`, "jpg");
  assert.ok(cuDosar.includes(`${BIZ}/sub/`), `mutantul cere o cheie cu dosar: ${cuDosar}`);
  assert.equal(esteCheiaNoastra(cuDosar, BIZ), false, "o cheie semnata poate arata in alt dosar");
});

test("nimic nu arunca: se cheama pe drumul comenzii, unde o exceptie opreste o vanzare", () => {
  const gunoaie = ["", "x", "products/customizations/", `${PREFIX_INCARCARI}${BIZ}/`,
    `${PREFIX_INCARCARI}${BIZ}/-.jpg`, "https://cdn.exemplu.ro/a.jpg",
    null as unknown as string, undefined as unknown as string, 42 as unknown as string];
  for (const g of gunoaie) {
    assert.equal(esteCheiaNoastra(g, BIZ), false, `a trecut: ${String(g)}`);
    assert.doesNotThrow(() => terminatia(g));
  }
});

test("terminatia cheii se citeste, sau iese `null`", () => {
  assert.equal(terminatia(cheieIncarcare(BIZ, NUME, "PNG")), "png");
  assert.equal(terminatia("fara-punct"), null);
  assert.equal(terminatia("a.terminatie-prea-lunga"), null);
});

/* ═══════════════════════════════════════════════════════════════════════════
   3. CE NU SE VEDE DIN PURTARE: comparatia in timp constant
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ semnatura se compara in timp CONSTANT", () => {
  /*
   * ⚠ ASTA NU SE POATE PROBA PRIN PURTARE, si de-aia se citeste sursa. `semn === asteptat` da
   * exact aceleasi raspunsuri — masurat cu un mutant, nu doboara nicio proba — dar se opreste la
   * primul caracter diferit. Diferenta de timp e masurabila de cine incearca de destule ori, si
   * asa se ghiceste semnatura caracter cu caracter, fara sa stii secretul.
   */
  const sursa = readFileSync(
    path.join(process.cwd(), "src/lib/customization/fisiere-private.ts"), "utf8",
  ).replace(/\r\n/g, "\n");
  const start = sursa.indexOf("export function esteCheiaNoastra(");
  assert.notEqual(start, -1, "nu s-a gasit `esteCheiaNoastra`");
  const corp = sursa.slice(start, sursa.indexOf("\n}", start));

  assert.ok(corp.includes("timingSafeEqual(a, b)"), "comparatia semnaturii nu mai e in timp constant");
  assert.ok(!/return\s+semn\s*===/.test(corp), "semnatura se compara cu `===`");
});

test("⚠ fara secret nu se semneaza nimic, si nimic nu se recunoaste", () => {
  /*
   * ⚠ PROBA ASTA ERA O AFIRMATIE DESPRE SURSA, si afirma ceva neadevarat: ca lantul de secrete
   * nu poate fi gol fiindca aplicatia n-ar porni. Acum e o proba de PURTARE, care poate si sa
   * treaca, si sa pica.
   *
   * ⚠ CE APARA: cu secretul gol, HMAC merge mai departe — cheie vida e o cheie valida — deci
   * semnatura ar fi devenit calculabila de oricine, in tacere. Se arunca la SEMNARE (o incarcare
   * cazuta, vizibila) si se cade in `false` la VERIFICARE (pe drumul comenzii, unde o exceptie ar
   * opri o vanzare). Niciodata intr-un „da" nemeritat.
   */
  const cheie = cheieIncarcare(BIZ, NUME, "jpg");
  const secrete = ["CUSTOMIZATION_FILE_SECRET", "SHIPPING_QUOTE_SECRET", "SUPABASE_SERVICE_ROLE_KEY"];
  const vechi = secrete.map((n) => process.env[n]);
  try {
    for (const n of secrete) delete process.env[n];
    assert.throws(() => cheieIncarcare(BIZ, NUME, "jpg"), /secret/i, "s-a semnat cu secretul gol");
    assert.equal(esteCheiaNoastra(cheie, BIZ), false, "o cheie s-a recunoscut fara niciun secret");
    assert.doesNotThrow(() => esteCheiaNoastra(cheie, BIZ), "poarta comenzii ar fi aruncat");
  } finally {
    secrete.forEach((n, i) => { if (vechi[i] === undefined) delete process.env[n]; else process.env[n] = vechi[i]; });
  }
});

test("⚠ forma cheii se poate verifica SI fara secret, pentru cand el s-a rotit", () => {
  /*
   * ⚠ DE CE EXISTA A DOUA VERIFICARE. Semnatura atarna de un secret care se poate schimba. La
   * INTRARE (poarta comenzii) asta e in regula: se semneaza si se verifica in aceeasi clipa. La
   * SERVIRE insa cheia se verifica luni mai tarziu — iar un secret rotit ar fi ascuns
   * comerciantului tocmai fisierele unor comenzi pe care le-a incasat, cu octetii nevatamati in
   * depozit. Acolo dreptul e dovedit oricum mai tare: sesiune, magazin, si cheia sa fie chiar pe
   * comanda ceruta.
   */
  const cheie = cheieIncarcare(BIZ, NUME, "jpg");
  assert.equal(areFormaCheii(cheie, BIZ), true);

  const secrete = ["CUSTOMIZATION_FILE_SECRET", "SHIPPING_QUOTE_SECRET", "SUPABASE_SERVICE_ROLE_KEY"];
  const vechi = secrete.map((n) => process.env[n]);
  try {
    for (const n of secrete) delete process.env[n];
    assert.equal(areFormaCheii(cheie, BIZ), true, "cheia devine de negasit dupa o rotatie de secret");
  } finally {
    secrete.forEach((n, i) => { if (vechi[i] === undefined) delete process.env[n]; else process.env[n] = vechi[i]; });
  }

  /* ⚠ Perechea, si ea e cea care apara: forma NU tine loc de semnatura acolo unde ea se cere. */
  assert.equal(areFormaCheii(cheieIncarcare(ALT_BIZ, NUME, "jpg"), BIZ), false, "cheia altui magazin");
  assert.equal(areFormaCheii(`${PREFIX_INCARCARI}${BIZ}/../alt/x-000000000000000000000000.jpg`, BIZ), false);
  assert.equal(areFormaCheii(`${PREFIX_INCARCARI}${BIZ}/${NUME}.jpg`, BIZ), false, "fara semnatura deloc");
});
