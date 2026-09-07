import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  areFormaCheii, cheieIncarcare, cheieMiniatura, esteCheiaNoastra,
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

/**
 * ⚠ Secretul se pune AICI, nu se presupune: `secret()` il citeste la fiecare chemare.
 *
 * ⚠ SI E CEL DEDICAT, din 07.09.2026. Pana atunci proba folosea dinadins `SHIPPING_QUOTE_SECRET`,
 * ca sa masoare LANTUL de rezerve. Lantul a fost scos: lega cheile fisierelor personale de
 * cotatiile de transport si de cheia de serviciu a bazei, iar urmarea era ca secretul asta nu se
 * putea roti fara sa opreasca altceva.
 */
process.env.CUSTOMIZATION_FILE_SECRET = "secret-de-proba-pentru-semnatura";
/* Si celelalte doua se sting, ca proba sa cada daca lantul se intoarce. */
delete process.env.SHIPPING_QUOTE_SECRET;

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

test("⚠ CHEIA MINIATURII NU E O CHEIE DE COMANDA, si asta e dinadins", () => {
  /*
   * ═══ ⚠ MINIATURA NU ARE VOIE SA INTRE INTR-O COMANDA ═══
   *
   * Ea se deriva la servire din cheia originalului, nu se semneaza si nu se scrie nicaieri. Daca
   * ar fi trecut de porti, ar fi fost o A DOUA cheie catre acelasi fisier: una pe care poarta
   * comenzii ar fi primit-o, si atunci comerciantul ar fi ajuns sa tipareasca dintr-o poza de 160
   * de pixeli fara sa stie. Se cere aici sa CADA la amandoua portile.
   *
   * ⚠ SI SA RAMANA SUB ACELASI PREFIX, altfel cronul de retentie n-ar fi maturat-o niciodata si
   * miniaturile s-ar fi adunat in depozit pe veci.
   */
  const cheie = cheieIncarcare(BIZ, NUME, "jpg");
  const mica = cheieMiniatura(cheie);

  assert.ok(mica.startsWith(`${cheie}`), `miniatura nu porneste de la original: ${mica}`);
  assert.ok(mica.startsWith(`${PREFIX_INCARCARI}${BIZ}/`), `miniatura a iesit din prefix: ${mica}`);
  assert.equal(esteCheiaNoastra(mica, BIZ), false, "miniatura trece drept cheie semnata de noi");
  assert.equal(areFormaCheii(mica, BIZ), false, "miniatura are forma unei chei de comanda");
  /* ⚠ Si nu se poate compune de doua ori: derivata din ea insasi tot nu devine cheie buna. */
  assert.equal(esteCheiaNoastra(cheieMiniatura(mica), BIZ), false);
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
  const vechi = process.env.CUSTOMIZATION_FILE_SECRET;
  try {
    process.env.CUSTOMIZATION_FILE_SECRET = "cu-totul-alt-secret";
    assert.equal(esteCheiaNoastra(cheie, BIZ), false, "cheia trece si cu alt secret: semnatura nu e o semnatura");
  } finally {
    process.env.CUSTOMIZATION_FILE_SECRET = vechi;
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

test("⚠ LANTUL DE REZERVE A DISPARUT: numai secretul dedicat semneaza", () => {
  /*
   * ═══ ⚠ DE CE CONTEAZA CA E SINGUR ═══
   *
   * `secret()` cadea pe `SHIPPING_QUOTE_SECRET`, apoi pe `SUPABASE_SERVICE_ROLE_KEY`. Criptografic
   * mergea. Dar lega trei lucruri fara nicio legatura intre ele, iar urmarea practica era ca
   * secretul fisierelor personale NU SE PUTEA ROTI: schimbat, ar fi oprit transportul sau baza. Un
   * secret care nu se poate roti nu e o masura de securitate, e o speranta.
   *
   * ⚠ SE MASOARA PRIN PURTARE, nu prin citirea sursei: se sterge cel dedicat si se lasa celelalte
   * doua pline. Daca lantul se intoarce vreodata, semnarea va merge mai departe si proba cade.
   */
  const dedicat = process.env.CUSTOMIZATION_FILE_SECRET;
  const transport = process.env.SHIPPING_QUOTE_SECRET;
  const serviciu = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    delete process.env.CUSTOMIZATION_FILE_SECRET;
    process.env.SHIPPING_QUOTE_SECRET = "secretul-transportului";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "cheia-de-serviciu";

    assert.throws(
      () => cheieIncarcare(BIZ, NUME, "jpg"), /CUSTOMIZATION_FILE_SECRET/,
      "semnarea cade iar pe secretul altui subsistem",
    );
  } finally {
    if (dedicat === undefined) delete process.env.CUSTOMIZATION_FILE_SECRET;
    else process.env.CUSTOMIZATION_FILE_SECRET = dedicat;
    if (transport === undefined) delete process.env.SHIPPING_QUOTE_SECRET;
    else process.env.SHIPPING_QUOTE_SECRET = transport;
    if (serviciu === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = serviciu;
  }

  /* ⚠ Si e OBLIGATORIU in productie: fara el, desfasurarea se opreste cu numele cheii in jurnal. */
  const cfg = readFileSync(path.resolve(process.cwd(), "next.config.ts"), "utf8");
  const obligatorii = cfg.slice(cfg.indexOf("const CHEI_OBLIGATORII"), cfg.indexOf("const CHEI_ASTEPTATE"));
  assert.match(obligatorii, /"CUSTOMIZATION_FILE_SECRET"/, "secretul nu opreste o desfasurare fara el");
});
