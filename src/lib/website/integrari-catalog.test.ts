import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATEGORII,
  INTEGRARI,
  NUMAR_ACTIVE,
  NUMAR_IN_CURAND,
  faraDiacritice,
  numarPeCategorie,
  numele,
  ordonate,
  potrivire,
  textDeCautare,
  SINONIME,
  SINONIME_CATEGORIE,
} from "./integrari-catalog";
import { PROVIDER_LOGOS, logoSize, type LogoKey } from "./logos";

const AICI = dirname(fileURLToPath(import.meta.url));
const PANOU = join(AICI, "..", "..", "app", "(dashboard)", "dashboard", "features", "page.tsx");

test("fiecare integrare are o siglă adevărată și o rubrică știută", () => {
  const rubrici = new Set(CATEGORII.map((c) => c.id));
  const vazute = new Set<string>();

  for (const integrare of INTEGRARI) {
    assert.ok(
      integrare.cheie in PROVIDER_LOGOS,
      `${integrare.cheie} nu există în biblioteca de sigle`,
    );
    assert.ok(rubrici.has(integrare.categorie), `${integrare.cheie}: rubrică necunoscută`);
    assert.equal(vazute.has(integrare.cheie), false, `${integrare.cheie} apare de două ori`);
    vazute.add(integrare.cheie);
  }
});

test("nicio rubrică nu rămâne goală", () => {
  const numar = numarPeCategorie();
  for (const c of CATEGORII) {
    assert.ok(numar[c.id] > 0, `rubrica „${c.eticheta}" n-are nicio integrare`);
  }
});

test("descrierile sunt o propoziție, nu un paragraf", () => {
  for (const integrare of INTEGRARI) {
    const d = integrare.descriere;
    assert.ok(d.length >= 30, `${integrare.cheie}: descriere prea scurtă`);
    /*
      Peste ~110 semne descrierea trece de patru rânduri pe un card de 280px.
      Masurat pe grila de trei coloane, la 13px.

      ⚠ 09.09.2026: aici scria si ca „cardurile din acelasi rand nu mai au
      aceeasi inaltime". E FALS pe codul de azi: cardurile stau in `<li>`-uri de
      grila, iar `<article>` are `h-full` (`BibliotecaIntegrari.tsx`), deci se
      egalizeaza singure. Ce creste in realitate e INALTIMEA RANDULUI si golul
      de sub cardurile scurte. Pragul ramane bun, motivul era gresit.
    */
    assert.ok(d.length <= 110, `${integrare.cheie}: ${d.length} semne, prea lungă`);
    assert.ok(d.endsWith("."), `${integrare.cheie}: descrierea nu se termină cu punct`);
    /*
      Diacritice peste tot in textele de fatada: e o regula a site-ului, si e
      usor de scapat, fiind saizeci si cinci de texte scrise pe rand.

      ⚠ Lista de mai jos are DOAR cuvinte care nu exista in romana fara semne.
      Prima forma continea si „comanda", „facturi", „magazin" — toate trei sunt
      scrieri CORECTE („comanda e platita" e articulat), deci proba cadea pe un
      text bun. O regula care da alarme false pe text corect se scoate din drum
      dupa a doua oara si nu mai pazeste nimic.

      Nu e o dovada, e o plasa: prinde scaparile obisnuite, nu orice greseala.
    */
    assert.ok(
      !/\b(plati|platit|platesti|pana|cand|dupa|catre|inainte|tara|primesti)\b/.test(d),
      `${integrare.cheie}: pare scrisă fără diacritice — „${d}"`,
    );
  }
});

test("descrierile nu se laudă: fără superlative nesusținute", () => {
  /*
    Publicitate comparativa, reglementata: fiecare afirmatie trebuie sa fie
    verificabila. „Cel mai bun procesator" nu e.

    ⚠ 09.09.2026: exista o exceptie, `emag`, fiindca vechea lui descriere zicea
    „cel mai mare marketplace din Romania". Textul nou al clientului n-o mai
    zice, si NICIUNA din cele 65 nu mai atinge tiparul. Deci exceptia a fost
    SCOASA: lasata acolo, era o gaura in plasa exact pe cheia unde superlativul
    e cel mai tentant. Daca se vrea inapoi, proba cade si cere o hotarare.
  */
  for (const integrare of INTEGRARI) {
    const d = faraDiacritice(integrare.descriere);
    assert.ok(
      !/\bcel mai\b|\bcea mai\b|\bcele mai\b|\bnr\.? ?1\b|\blider\b/.test(d),
      `${integrare.cheie}: superlativ nesusținut — „${integrare.descriere}"`,
    );
  }
});

test("căutarea găsește și fără diacritice, și după rubrică", () => {
  assert.equal(faraDiacritice("Plăți online"), "plati online");
  assert.equal(faraDiacritice("Poșta Română"), "posta romana");
  /* ⚠ Se taie DOAR semnele combinatorii. Varianta lacomă (tot ce nu e ASCII) ar
     mânca și cifrele scrise altfel, si a costat deja o data la cautarea din
     magazine. */
  assert.equal(faraDiacritice("Cel.ro 2024"), "cel.ro 2024");

  const fan = INTEGRARI.find((i) => i.cheie === "fanCourier");
  assert.ok(fan);
  /* Cine scrie „curier" se așteaptă să vadă toți curierii, chiar dacă niciunul
     n-are cuvântul în nume. */
  assert.ok(textDeCautare(fan).includes("curieri"));
  assert.ok(textDeCautare(fan).includes("fan courier"));

  const posta = INTEGRARI.find((i) => i.cheie === "postaRomana");
  assert.ok(posta);
  assert.ok(textDeCautare(posta).includes("posta romana"));
});

test("se potrivesc CUVINTELE, nu fraza", () => {
  /*
    ⚠ Defectul a ieșit din chiar exemplul scris în bara de căutare: „plăți în
    rate" întorcea ZERO. Cuvintele există toate — „plăți" e rubrica, „rate" e în
    descrierea lui Netopia și a lui Klarna, dar nu una lângă alta, în ordinea
    aia, în același text. Un om nu scrie un citat, scrie cuvintele care îi vin.

    ⚠ 09.09.2026: aici scria TBI. Clientul a dat texte noi pentru toate cele 65,
    iar DOUĂ integrări de rate au rămas fără cuvântul „rate": TBI („finanțarea
    tbi ... la cumpărare") și EuPlătesc („plata online prin procesatorul
    românesc EuPlătesc"). Deci niciuna nu mai iese la căutarea „plăți în rate",
    care e chiar exemplul scris în bara de căutare. Se repară adăugând cuvântul
    în descriere, nu aici: proba păzește REGULA (cuvintele, oriunde, în orice
    ordine), deci se poate rezema pe oricare două integrări care o arată.
  */
  const gaseste = (q: string) => INTEGRARI.filter((i) => potrivire(i, q)).map((i) => i.cheie);

  assert.ok(gaseste("plăți în rate").includes("netopia"));
  assert.ok(gaseste("plati in rate").includes("klarna"));
  /* Ordinea cuvintelor nu contează. */
  assert.deepEqual(gaseste("rate plati").sort(), gaseste("plati rate").sort());

  /* Un cuvânt care chiar nu există nu găsește nimic, oricâte altele ar fi bune. */
  assert.deepEqual(gaseste("plati qwerty"), []);

  /* Rubrica trage după ea toată familia. */
  assert.equal(gaseste("curieri").length, 17);
  /* Căutarea goală nu filtrează nimic. */
  assert.equal(gaseste("   ").length, INTEGRARI.length);
  /* Iar exemplele din placeholder trebuie să funcționeze toate trei. */
  for (const exemplu of ["Sameday", "facturare", "plăți în rate"]) {
    assert.ok(gaseste(exemplu).length > 0, `„${exemplu}" din bara de căutare nu găsește nimic`);
  }
});

test("cele care merg azi vin înaintea celor anunțate, fără să se amestece rubricile", () => {
  const lista = ordonate(INTEGRARI);

  /* Nicio „în curând" înaintea unei active. */
  const primaAnuntata = lista.findIndex((i) => i.stare === "in-curand");
  assert.ok(primaAnuntata > 0);
  assert.ok(lista.slice(primaAnuntata).every((i) => i.stare === "in-curand"));

  /*
    Iar înăuntrul fiecărei grupe, ordinea pe rubrici rămâne cea din catalog —
    asta cere ca sortarea să fie STABILĂ. O sortare instabilă ar fi amestecat
    rubricile fără ca nimic să se plângă, iar pe pagină s-ar fi văzut ca o listă
    la întâmplare.
  */
  const rubriciDinCatalog = (stare: string) =>
    INTEGRARI.filter((i) => i.stare === stare).map((i) => i.categorie);
  const rubriciDinListă = (stare: string) =>
    lista.filter((i) => i.stare === stare).map((i) => i.categorie);
  assert.deepEqual(rubriciDinListă("activa"), rubriciDinCatalog("activa"));
  assert.deepEqual(rubriciDinListă("in-curand"), rubriciDinCatalog("in-curand"));

  /* Și nu pierde și nu inventează nimic. */
  assert.equal(lista.length, INTEGRARI.length);
});

test("numărătoarea de active și de anunțate e cea din panou", () => {
  assert.equal(NUMAR_ACTIVE + NUMAR_IN_CURAND, INTEGRARI.length);
  /*
    ⚠ NUMERELE ASTEA AU FOST GRESITE DOUAZECI DE ZILE, si nota de aici spunea
    chiar ce urma sa se intample: „daca se livreaza una, numarul de aici trebuie
    sa scada odata cu ea — altfel site-ul spune «In curand» despre ceva ce merge
    deja". S-au livrat NOUA: sapte curieri, Posta Romana si eMAG. Prin eMAG
    intrau deja comenzi in timp ce pagina de prezentare il anunta.

    ⚠ DE CE N-A PRINS-O NIMIC. Numerele se derivau din CATALOG, deci se schimbau
    ODATA cu greseala — un numar care se muta singur nu pazeste nimic. Iar proba
    de mai jos verifica doar PREZENTA („e in panou si lipseste de aici?"), nu
    starea: eMAG era in amandoua listele, deci trecea. De aceea exista acum si
    proba `starile din catalog sunt cele din panou`.
  */
  /* ⚠ 08.09.2026: Pepita a trecut din „in curand" in „activa". Numerele se mișcă ODATĂ cu
     livrarea, de mână: asta e chiar rostul lor. */
  assert.equal(NUMAR_IN_CURAND, 24);
  assert.equal(NUMAR_ACTIVE, 41);
});

test("siglele intră în locașul cardului fără să iasă mâzgălituri", () => {
  /*
    Egalizarea e pe SUPRAFATA, deci o sigla foarte lata iese scunda. Pana la un
    punct e in regula — asa arata un wordmark. Sub 11px insa nu se mai citeste
    nimic, iar reparatia nu e alt numar, e alt FISIER: semnul patrat al marcii in
    loc de wordmark. Proba spune care sunt.
  */
  const ARIE = 1200;
  const LATIME = 120;
  const mici: string[] = [];
  for (const integrare of INTEGRARI) {
    const marime = logoSize(PROVIDER_LOGOS[integrare.cheie], ARIE, LATIME);
    const inaltimeReala = Math.min(
      marime.height,
      marime.maxWidth / PROVIDER_LOGOS[integrare.cheie].ratio,
    );
    if (inaltimeReala < 11) mici.push(`${numele(integrare)} ${inaltimeReala.toFixed(1)}px`);
  }
  assert.deepEqual(mici, [], `sigle prea scunde pe card: ${mici.join(", ")}`);
});

test("catalogul nu rămâne în urma panoului", () => {
  /*
    Panoul e sursa: acolo `id` inseamna „se poate activa azi" si `soon` inseamna
    „anuntata". Aici e o A DOUA lista a aceluiasi lucru, iar a doua integrare
    livrata le desparte fara sa se planga nimic.

    Proba intreaba chiar fisierul panoului. Potrivirea se face pe NUMELE
    FISIERULUI de sigla, nu pe numele afisat: acolo scrie „Fan Courier", aici
    „FAN Courier", iar sufixul `-mic` deosebeste doar copia taiata a aceleiasi
    marci.

    ⚠ Pazeste o singura directie — ce e in panou si lipseste de aici. Invers nu
    se poate: ramura asta are un `page.tsx` mai vechi decat `main`, deci aici
    sunt dinadins mai multe.
  */
  const sursa = readFileSync(PANOU, "utf8");
  const alePanoului = new Set(
    [...sursa.matchAll(/logo:\s*"\/integrations\/([^"]+)"/g)].map((m) => radacina(m[1])),
  );
  const aleNoastre = new Set(
    INTEGRARI.map((i) => radacina(PROVIDER_LOGOS[i.cheie].src.split("/").pop() ?? "")),
  );

  const lipsa = [...alePanoului].filter((r) => !aleNoastre.has(r));
  assert.deepEqual(
    lipsa,
    [],
    `panoul are integrări care lipsesc din catalogul site-ului: ${lipsa.join(", ")}`,
  );
});

test("stările din catalog sunt cele din panou", () => {
  /*
    ⚠ PROBA DE DEASUPRA PAZESTE PREZENTA; ASTA PAZESTE STAREA.

    Si de aceea aceea n-a prins nimic douazeci de zile: ea intreaba „e in panou
    si lipseste de aici?". eMAG era in AMANDOUA listele, deci trecea — dar panoul
    il activa, iar site-ul il anunta ca fiind „in curand". Prezenta se potrivea;
    starea, nu.

    In panou, `id:` inseamna „se poate activa azi"; lipsa lui inseamna anuntata.

    ⚠ SE PAZESTE O SINGURA DIRECTIE, ANUME CEA CARE MINTE CLIENTUL: panoul
    activeaza, catalogul inca spune „in curand". Invers — catalog „activa", panou
    fara `id` — s-ar plange pe integrarile pe care ramura asta le are inainte, si
    care nu sunt o greseala. Aceeasi alegere ca la proba de deasupra, si din
    acelasi motiv scris acolo.

    ⚠ SE CITESTE PE RANDURI, fiindca in panou fiecare integrare sta pe un rand:
        { name: "FedEx", logo: "/integrations/fedex.svg", id: "fedex" },
    Am incercat intai un regex peste toata acolada. Rulat de mana pe acelasi
    fisier dadea 65 de potriviri; rulat aici, prin incarcatorul care dezbraca
    tipurile, dadea ZERO. N-am aflat de ce si n-am ghicit: tiparul de mai jos e
    chiar cel folosit cu succes de proba de deasupra.
  */
  const sursa = readFileSync(PANOU, "utf8");

  const activabileInPanou = new Set<string>();
  for (const rand of sursa.split("\n")) {
    const sigla = /logo:\s*"\/integrations\/([^"]+)"/.exec(rand);
    if (sigla && rand.includes("id:")) activabileInPanou.add(radacina(sigla[1]));
  }

  /* ⚠ Fara randul asta, o citire picata ar arata ca „nicio nepotrivire". */
  assert.ok(
    activabileInPanou.size > 0,
    "n-am citit nicio integrare activabilă din panou — s-a mutat fișierul sau i s-a schimbat forma?",
  );

  const mint: string[] = [];
  for (const i of INTEGRARI) {
    if (i.stare !== "in-curand") continue;
    const sigla = radacina(PROVIDER_LOGOS[i.cheie].src.split("/").pop() ?? "");
    if (activabileInPanou.has(sigla)) mint.push(i.cheie);
  }

  assert.deepEqual(
    mint,
    [],
    `site-ul spune „În curând" despre integrări pe care panoul le activează: ${mint.join(", ")}`,
  );
});

/* ═══════════════════ SINONIMELE DE CĂUTARE ═══════════════════ */

test("sinonimele stau pe integrări care există, și pe niciuna anunțată", () => {
  const dinCatalog = new Map(INTEGRARI.map((i) => [i.cheie, i]));

  for (const cheie of Object.keys(SINONIME) as LogoKey[]) {
    const integrare = dinCatalog.get(cheie);
    assert.ok(integrare, `sinonime pe „${cheie}", care nu e în catalog`);
    /*
      ⚠ NIMIC PE „ÎN CURÂND". O integrare nelivrată n-are cod, deci un sinonim
      n-are cum să aibă dovadă: ar descrie o promisiune. Iar cine caută „ramburs"
      și vede un card crede că poate încasa la livrare prin el.
    */
    assert.equal(
      integrare.stare,
      "activa",
      `„${cheie}" e anunțată, nu livrată, și n-are ce căuta în sinonime`,
    );
    assert.ok((SINONIME[cheie] ?? []).length > 0, `„${cheie}": listă goală, se scoate cheia`);
  }
});

test("niciun sinonim nu repetă ce se găsește deja", () => {
  /*
    Un sinonim care se găsea și fără el nu apără nimic și minte pe cel care
    citește tabelul: pare că acolo s-a luat o hotărâre, când de fapt cuvântul era
    deja în nume, în descriere sau în eticheta rubricii. Prima formă a tabelului
    avea patru așa („international" la DPD, DHL, FedEx, UPS), toate adevărate și
    toate degeaba.
  */
  const degeaba: string[] = [];
  for (const integrare of INTEGRARI) {
    const proprii = SINONIME[integrare.cheie] ?? [];
    if (proprii.length === 0) continue;
    const categorie = CATEGORII.find((c) => c.id === integrare.categorie);
    const faraSinonimeProprii = faraDiacritice(
      `${numele(integrare)} ${integrare.descriere} ${categorie?.eticheta ?? ""} ${SINONIME_CATEGORIE[integrare.categorie].join(" ")}`,
    );
    for (const s of proprii) {
      if (faraSinonimeProprii.includes(faraDiacritice(s))) {
        degeaba.push(`${integrare.cheie}/${s}`);
      }
    }
  }
  assert.deepEqual(degeaba, [], `sinonime care se găseau și fără ele: ${degeaba.join(", ")}`);
});

test("un cuvânt de rubrică e adevărat la TOȚI membrii ei, deci nu se repetă pe integrare", () => {
  /*
    Rostul deosebirii: „curierat" e adevărat despre toți cei 17, deci stă pe
    rubrică. „awb" e adevărat la 16 din 17 (Pall-Ex scoate borderou de paleți),
    deci stă pe integrare. Dacă cineva urcă un cuvânt de pe integrări pe rubrică
    fără să verifice, îl dă și celui care nu-l merită.
  */
  for (const c of CATEGORII) {
    const aleRubricii = SINONIME_CATEGORIE[c.id];
    const membri = INTEGRARI.filter((i) => i.categorie === c.id);
    for (const s of aleRubricii) {
      const peIntegrare = membri.filter((i) => (SINONIME[i.cheie] ?? []).includes(s));
      assert.deepEqual(
        peIntegrare.map((i) => i.cheie),
        [],
        `„${s}" e și pe rubrica ${c.id}, și pe integrare: unul din două e de prisos`,
      );
    }
  }
});

test("rambursul nu ajunge la cei trei curieri care nu-l au", () => {
  /*
    ⚠ ASTA E PROBA CARE APĂRĂ CEL MAI MULT. Un sinonim e o promisiune: cine caută
    „ramburs" și vede cardul unui curier crede că poate încasa la livrare prin el.

    Trei nu pot, și fiecare o spune în codul lui:
      DHL     `dhl/servicii.ts`  „EXISTA CA SI COD, SI NU SE VINDE DIN ROMANIA";
                                 `DateExpediere` n-are deloc câmp de ramburs.
      FedEx   `fedex/client.ts`  `RAMBURS_INDISPONIBIL`; câmpul există DOAR ca să
                                 oprească emiterea (`fedex/expediere.ts`).
      Pall-Ex `pallex/client.ts` „nu exista ramburs. Niciun camp"; integrarea
                                 refuză comanda cu bani de luat.
  */
  const FARA_RAMBURS: LogoKey[] = ["dhl", "fedex", "pallex"];
  const iesLaRamburs = INTEGRARI.filter((i) => potrivire(i, "ramburs")).map((i) => i.cheie);

  for (const cheie of FARA_RAMBURS) {
    assert.equal(
      iesLaRamburs.includes(cheie),
      false,
      `„${cheie}" iese la căutarea „ramburs", dar nu încasează la livrare`,
    );
  }
  /* Și, în sens invers, ceilalți paisprezece chiar ies: altfel proba ar trece și
     pe un tabel golit de tot. */
  const curieri = INTEGRARI.filter((i) => i.categorie === "curieri");
  assert.equal(iesLaRamburs.length, curieri.length - FARA_RAMBURS.length);
});

test("urmărirea iese exact la curierii care au cron de urmărire", () => {
  /*
    Sursa adevărului nu e o listă scrisă de mână aici, e `vercel.json`: un curier
    are urmărire dacă și numai dacă are cron. Așa, când se livrează urmărirea
    pentru al treisprezecelea, proba cade și cere cuvântul, în loc să tacă.

    ⚠ FAN Courier NU e printre ei, deși descrierea clientului spune „de la AWB
    până la tracking". Cuvântul „tracking" îl găsește azi PRIN DESCRIERE, iar
    proba asta se uită doar la ce dăm noi în plus.
  */
  const CRON_LA_CHEIE: Record<string, LogoKey> = {
    dhl: "dhl", ecolet: "ecolet", fedex: "fedex", gls: "gls", innoship: "innoship",
    packeta: "packeta", pallex: "pallex", posta: "postaRomana", sameday: "sameday",
    shipo: "shipo", smartship: "smartship", ups: "ups",
  };
  const vercel = readFileSync(join(AICI, "..", "..", "..", "vercel.json"), "utf8");
  const cuCron = new Set(
    [...vercel.matchAll(/"\/api\/cron\/([a-z-]+)-tracking"/g)].map((m) => CRON_LA_CHEIE[m[1]]),
  );

  assert.ok(cuCron.size > 0, "n-am citit niciun cron de urmărire din vercel.json");
  assert.equal(cuCron.has(undefined as unknown as LogoKey), false, "cron de urmărire fără cheie știută");

  const cuSinonim = new Set(
    INTEGRARI.filter((i) => (SINONIME[i.cheie] ?? []).includes("urmarire")).map((i) => i.cheie),
  );
  assert.deepEqual([...cuSinonim].sort(), [...cuCron].sort());
});

test("punct de ridicare arată exact curierii unde cumpărătorul chiar alege punctul", () => {
  /*
    ⚠ Nu e destul ca API-ul curierului să aibă lista de puncte: trebuie ca omul
    să și poată alege unul LA CHECKOUT. Woot are puncte, dar le alege
    comerciantul după comandă, deci un „locker" pe cardul lui ar promite
    cumpărătorului o alegere pe care n-o are.

    Sursa adevărului e `CURIERI_CU_LOCKERE` din `shipping.actions.ts`, citită de
    aici ca să nu ajungă două liste ale aceluiași lucru.
  */
  const ID_LA_CHEIE: Record<string, LogoKey> = {
    sameday: "sameday", "fan-courier": "fanCourier", dpd: "dpd", cargus: "cargus",
    gls: "gls", posta: "postaRomana", innoship: "innoship", packeta: "packeta",
    smartship: "smartship", shipo: "shipo", ups: "ups",
  };
  const sursa = readFileSync(
    join(AICI, "..", "..", "lib", "actions", "shipping.actions.ts"),
    "utf8",
  );
  const linia = /const CURIERI_CU_LOCKERE = new Set\(\[([^\]]+)\]\)/.exec(sursa);
  assert.ok(linia, "n-am găsit CURIERI_CU_LOCKERE: s-a mutat sau i s-a schimbat forma");
  const cuPuncte = new Set(
    [...linia[1].matchAll(/"([^"]+)"/g)].map((m) => ID_LA_CHEIE[m[1]]),
  );
  assert.equal(cuPuncte.has(undefined as unknown as LogoKey), false, "curier cu lockere fără cheie știută");

  const gasite = INTEGRARI.filter((i) => potrivire(i, "punct de ridicare")).map((i) => i.cheie);
  assert.deepEqual(gasite.sort(), [...cuPuncte].sort());
});

test("căutările care cădeau la ZERO după textele noi întorc iar ce trebuie", () => {
  /*
    ⚠ Fiecare rând de aici a fost măsurat CĂZUT pe 09.09.2026, după ce clientul a
    înlocuit toate cele 65 de descrieri. Cuvintele stăteau numai în descriere, iar
    descrierea e a lui și se schimbă. Proba e ce ține sinonimele legate de
    întrebările pe care le pune un comerciant.
  */
  const gaseste = (q: string) => INTEGRARI.filter((i) => potrivire(i, q)).map((i) => i.cheie);

  /* Cădeau la zero de tot. */
  assert.equal(gaseste("ramburs").length, 14);
  assert.equal(gaseste("curierat").length, 17);
  assert.equal(gaseste("expediere").length, 17);
  assert.deepEqual(gaseste("whatsapp"), ["notice"]);
  assert.deepEqual(gaseste("shopping"), ["googleMerchant"]);
  assert.equal(gaseste("newsletter").length, 3);

  /*
    ⚠ CEA MAI STRICATĂ CĂUTARE DE PE PAGINĂ, și e mai veche decât textele noi:
    „plata" (singular) nu era în textul niciunuia dintre cele CINCI procesatoare
    care merg. „plata online" întorcea patru carduri, TOATE nelivrate: omul care
    scria cel mai firesc lucru din lume vedea numai promisiuni.
  */
  const laPlataOnline = gaseste("plata online");
  const LIVRATE: LogoKey[] = ["stripe", "netopia", "ipay", "klarna", "revolut"];
  for (const cheie of LIVRATE) {
    assert.ok(laPlataOnline.includes(cheie), `„plata online" nu-l mai găsește pe ${cheie}`);
  }

  /* Se subțiaseră fără să cadă de tot. */
  assert.ok(gaseste("card").includes("netopia"));
  assert.ok(gaseste("awb").includes("ecolet"));
  assert.ok(gaseste("livrare").length === 17);
});

test("cuvintele de legătură nu taie rezultate", () => {
  /*
    ⚠ „punct de ridicare" întorcea UN singur curier din unsprezece, fiindcă doar
    textul lui FAN Courier conținea din întâmplare grupul de litere „de" (în „de
    la AWB"). Ceilalți zece ofereau exact același lucru și cădeau pe o prepoziție.
  */
  const cate = (q: string) => INTEGRARI.filter((i) => potrivire(i, q)).length;

  assert.equal(cate("punct de ridicare"), cate("punct ridicare"));
  assert.equal(cate("plata cu cardul"), cate("plata cardul"));
  assert.equal(cate("plati in rate"), cate("plati rate"));

  /* Scrise DOAR cuvinte de legătură, se poartă ca o căutare goală: altfel „de"
     ar fi scos ecranul „nu găsim nimic" pentru o prepoziție. */
  assert.equal(cate("de"), INTEGRARI.length);
  assert.equal(cate("cu la"), INTEGRARI.length);

  /* Dar un cuvânt care chiar nu există taie tot, chiar lângă unul de legătură. */
  assert.equal(cate("de qwerty"), 0);
});

/** `sameday-mic.webp` și `sameday.webp` sunt aceeași marcă. */
function radacina(numeFisier: string): string {
  return numeFisier.replace(/\.[a-z0-9]+$/i, "").replace(/-mic$/, "");
}
