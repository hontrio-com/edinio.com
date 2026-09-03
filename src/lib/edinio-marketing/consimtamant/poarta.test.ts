import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { faraUrmarire } from "../fara-urmarire";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  NIMIC NU PORNESTE, SI NIMIC NU PLEACA, INAINTE DE ALEGERE
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ PROBELE DE AICI CITESC SURSA, cu marginile stiute: pot arata ca poarta e
  SCRISA, nu ca ea chiar se executa. De aceea cer forme pe care o paza pusa
  alaturi le strica — si de aceea drumul intreg a fost probat separat, cu codul
  adevarat, impotriva bazei adevarate.
*/

const RAND = String.fromCharCode(10);
const citeste = (p: string) => readFileSync(p, "utf8");

function faraComentarii(cod: string): string {
  const faraBlocuri = cod.split("/*").map((b, i) => {
    if (i === 0) return b;
    const k = b.indexOf("*/");
    return k < 0 ? "" : b.slice(k + 2);
  }).join("");
  return faraBlocuri.split(RAND).map((r) => {
    const k = r.indexOf("//");
    return k < 0 ? r : r.slice(0, k);
  }).join(RAND);
}

function fisiereSursa(rad: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(rad)) {
    const p = join(rad, n);
    if (statSync(p).isDirectory()) out.push(...fisiereSursa(p));
    else if (/\.(ts|tsx)$/.test(n) && !n.endsWith(".test.ts")) out.push(p.split("\\").join("/"));
  }
  return out;
}

/** Cei trei pixeli corporate, si categoria de care atarna fiecare. */
const PIXELI: Array<[string, string]> = [
  ["src/components/edinio-marketing/EtichetaGa4.tsx", "statistici"],
  ["src/components/edinio-marketing/EdinioMetaPixel.tsx", "marketing"],
  ["src/components/edinio-marketing/EdinioTikTokPixel.tsx", "marketing"],
];

test("⚠ fiecare pixel se opreste din RANDARE, nu dinauntrul scriptului", () => {
  /*
    ⚠ DEOSEBIREA E TOT. Un `<Script>` care nu intra in arbore nu e injectat
    niciodata: zero cereri catre furnizor, zero cookie-uri. Un script incarcat si
    „oprit" dinauntru a scris deja pe terminal — adica exact fapta pe care
    bannerul ar trebui s-o impiedice.
  */
  for (const [fisier, categorie] of PIXELI) {
    const linii = faraComentarii(citeste(fisier)).split(RAND).map((l) => l.trim());
    assert.ok(
      linii.includes(`if (!c.mounted || !c.${categorie}) return null;`),
      `${fisier}: poarta pe "${categorie}" lipseste, sau nu mai e o instructiune de sine statatoare`,
    );
  }
});

test("⚠ `!c.mounted` face parte din poarta, altfel se strica hidratarea", () => {
  /*
    Serverul nu stie ce scrie in cookie (si n-are voie sa afle — paginile se
    servesc din cache). Deci prima randare din browser trebuie sa iasa IDENTIC cu
    cea de pe server. Fara `mounted`, prima zi ar aduce erori de hidratare pe
    fiecare pagina a site-ului.
  */
  for (const [fisier] of PIXELI) {
    const cod = faraComentarii(citeste(fisier));
    assert.match(cod, /!c\.mounted \|\|/, `${fisier}: poarta nu asteapta hidratarea`);
  }
});

test("⚠ Consent Mode v2 se declara INAINTEA oricarei alte comenzi gtag", () => {
  /*
    ⚠ ORDINEA NU E UN MOFT. Google citeste starea implicita la prima comanda care
    ar trimite ceva. Pusa dupa `config`, primul eveniment pleaca deja sub starea
    gresita, si nimic nu arata ca s-a intamplat.

    ⚠ SI DE CE SE CITESTE `corp-gtag.ts`, nu componentele. Din 02.09.2026 sunt
    DOUA etichete Google — GA4 (statistici) si Ads (marketing) — care pot porni
    separat si n-au niciun contract de ordine intre ele. Declaratia s-a mutat
    intr-un temei comun, pus o singura data de oricare ajunge primul.

    Scrisa in fiecare componenta, ar fi fost chemata de doua ori — iar
    `gtag('consent','default')` chemat a doua oara nu e o repetare nevinovata.
  */
  const baza = citeste("src/lib/edinio-marketing/corp-gtag.ts");

  const iDefault = baza.indexOf("gtag('consent', 'default'");
  const iUpdate = baza.indexOf("gtag('consent', 'update'");
  const iJs = baza.indexOf("gtag('js'");
  assert.ok(iDefault > 0, "nu se mai declara starea implicita de consimtamant");
  assert.ok(iJs > 0, "temeiul nu mai porneste ceasul gtag");
  assert.ok(iDefault < iJs, "`consent default` vine dupa `gtag('js')`");

  /*
    ═══ ⚠ SI SECVENTA INTREAGA: default -> update -> js ═══

    ⚠ CE APARA, si de ce n-a fost destul „default inaintea lui js". Pana pe
    03.09.2026 `default` purta direct starea adevarata si nu exista niciun
    `update`. Proba trecea verde — ordinea ceruta era respectata — dar doua
    lucruri erau gresite dedesubt:

      1. `wait_for_update: 500` astepta un `update` care nu venea NICIODATA, deci
         primul hit se retinea o jumatate de secunda la fiecare incarcare.
      2. Uneltele Google de diagnostic raportau „consimtamantul nu se
         actualizeaza", si nimeni n-avea cum sa stie daca e o scapare.

    O proba care cere doar „A inaintea lui B" nu vede ca C lipseste cu totul.
  */
  assert.ok(iUpdate > 0, "temeiul nu mai trimite `consent update` — `wait_for_update` asteapta degeaba");
  assert.ok(iDefault < iUpdate, "`update` vine INAINTEA lui `default`");
  assert.ok(iUpdate < iJs, "`update` vine dupa `gtag('js')`, deci prea tarziu");

  /*
    ⚠ SI CA `default` CHIAR PLEACA DE LA REFUZ. Scris cu starea adevarata, secventa
    ar arata la fel din afara si n-ar mai insemna nimic: „default" ar fi deja
    raspunsul, iar `update` o repetare.
  */
  const blocDefault = baza.slice(iDefault, iUpdate);
  assert.ok(!blocDefault.includes("granted"),
    "`consent default` porneste de la ceva acordat; secventa isi pierde intelesul");

  for (const semnal of ["analytics_storage", "ad_storage", "ad_user_data", "ad_personalization"]) {
    assert.ok(baza.includes(semnal), `semnalul "${semnal}" din Consent Mode v2 lipseste`);
    /* ⚠ Fiecare semnal trebuie sa fie si in `update`, altfel ramane pe refuz. */
    assert.ok(baza.slice(iUpdate, iJs).includes(semnal),
      `semnalul "${semnal}" lipseste din \`consent update\`, deci ramane refuzat`);
  }

  /*
    ⚠ SI NICIUNA DIN CELE DOUA ETICHETE nu poate chema `config` inaintea
    temeiului. Aici se vede ordinea adevarata din pagina: temeiul e interpolat ca
    `${baza}` la inceputul corpului, si `config` vine dupa.
  */
  for (const f of [
    "src/components/edinio-marketing/EtichetaGa4.tsx",
    "src/components/edinio-marketing/EtichetaGoogleAds.tsx",
  ]) {
    const cod = citeste(f);
    const iBaza = cod.indexOf("${baza}");
    const iConfig = cod.indexOf("gtag('config'");
    assert.ok(iBaza > 0, `${f}: nu mai include temeiul comun`);
    assert.ok(iConfig > 0, `${f}: nu mai configureaza nimic`);
    assert.ok(iBaza < iConfig, `${f}: cheama config INAINTEA temeiului`);

    /* ⚠ Si ca nu si-a facut al doilea temei pe ascuns. */
    assert.ok(
      !cod.includes("gtag('consent'"),
      `${f}: declara singur starea de consimtamant — a doua declaratie e ignorata de Google`,
    );
  }
});

test("⚠ amandoua etichetele Google atarna de categoria lor", () => {
  /*
    ⚠ CE APARA. GA4 masoara comportament (statistici); Google Ads numara conversii
    si face remarketing (marketing). Cineva poate accepta una si refuza cealalta.

    Pusa langa GA4, eticheta de reclame ar fi pornit odata cu ea — adica pentru
    cineva care tocmai refuzase marketingul.
  */
  const perechi: Array<[string, string]> = [
    ["src/components/edinio-marketing/EtichetaGa4.tsx", "statistici"],
    ["src/components/edinio-marketing/EtichetaGoogleAds.tsx", "marketing"],
  ];
  for (const [f, categorie] of perechi) {
    const linii = faraComentarii(citeste(f)).split(RAND).map((l) => l.trim());
    assert.ok(
      linii.includes(`if (!c.mounted || !c.${categorie}) return null;`),
      `${f}: poarta pe "${categorie}" lipseste, sau nu mai e o instructiune de sine statatoare`,
    );
  }
});

test("⚠ ORICE punere la coada spune de unde stie ca are voie", () => {
  /*
    ⚠ CE APARA. `puneLaCoada` cere un `Temei` — o uniune, nu un boolean — tocmai
    ca fiecare loc sa fie nevoit sa spuna DE UNDE stie. Proba asta cere ca
    temeiul sa fie chiar acolo, in apel.
  */
  const apeluri: Array<[string, string]> = [];
  for (const f of fisiereSursa("src")) {
    const cod = faraComentarii(citeste(f));
    let i = cod.indexOf("await puneLaCoada(");
    while (i >= 0) {
      apeluri.push([f, cod.slice(i, i + 900)]);
      i = cod.indexOf("await puneLaCoada(", i + 1);
    }
  }

  assert.ok(apeluri.length >= 6, `s-au gasit doar ${apeluri.length} puneri la coada — cautarea s-a stricat?`);
  for (const [f, bucata] of apeluri) {
    assert.match(
      bucata, /fel: "(cookie|carat)"/,
      `${f}: se pune la coada fara sa spuna pe ce temei — poate trimite pentru cine a refuzat`,
    );
  }
});

test("⚠ webhook-ul Stripe nu poate pretinde acord: n-are cookie-urile omului", () => {
  const cod = faraComentarii(citeste("src/app/api/stripe/webhook/route.ts"));
  const i = cod.indexOf('fel: "carat"');
  assert.ok(i > 0, "webhook-ul nu mai declara ca temeiul e carat de altundeva");
  const bucata = cod.slice(i, i + 300);
  assert.match(bucata, /marketing: session\.metadata\?\.cs === "1"/,
    "acordul nu mai vine din metadata sesiunii — de unde ar veni?");
  assert.ok(!bucata.includes("marketing: true"), "webhook-ul pretinde acord fara sa-l fi primit");
});

test("⚠ hotararea se citeste din cookie, niciodata dintr-un layout", () => {
  /*
    ⚠ CE APARA, MASURAT. Paginile din (website) se servesc din cache — pe
    02.09.2026 pagina de start avea `Age: 838`. O citire de cookie intr-un layout
    le-ar face pe TOATE dinamice: as fi reparat confidentialitatea stingand
    viteza intregului site.
  */
  const vinovate = fisiereSursa("src/app")
    .filter((f) => f.endsWith("layout.tsx"))
    .filter((f) => faraComentarii(citeste(f)).includes("consimtamantulCererii"));
  assert.deepEqual(vinovate, [], "un layout citeste consimtamantul, deci paginile lui devin dinamice");
});

/*
  ⚠ SINGURA SUPRAFATA CU PIXELI SI FARA BANNER, si de ce.

  Aplicatia autentificata. Hotararea proprietarului, 02.09.2026: o intrebare
  despre cookie-uri peste un ecran in care omul lucreaza e deranjanta, iar el a
  vazut-o oricum pe site inainte sa-si faca cont.

  ⚠ URMAREA, ACCEPTATA: fara banner nu se poate da acord DE ACOLO, iar pixelii
  atarna de acord. Pentru cine n-a ales niciodata pe site — cine intra direct pe
  un semn de carte catre `/dashboard` — ei raman stinsi. Fara acord, a nu masura
  e raspunsul corect; dar retargetarea din aplicatie acopera numai pe cine a
  acceptat pe site.

  ⚠ LISTA ASTA E PAZITA DE PROBA DE MAI JOS. Altfel prima incercare de a face o
  proba sa taca ar fi sa se adauge aici inca un layout.
*/
/*
  ⚠ LISTA ASTA E GOALA DE PE 03.09.2026, si golirea ei e o veste buna.

  Singura intrare era layoutul panoului: avea pixeli si n-avea banner. Pixelii au
  fost scosi de acolo cu totul, deci nu mai exista nicio suprafata cu poarta si
  fara intrebare. Ce era o portita cantarita a devenit o regula fara exceptii.

  ⚠ SE PASTREAZA GOALA, nu se sterge. Mecanismul si proba care il margineste sunt
  ce impiedica pe cineva sa faca maine o proba sa taca adaugand un layout aici.
*/
const FARA_BANNER_DINADINS: string[] = [];

test("⚠ bannerul e montat oriunde e montat un pixel", () => {
  /*
    ⚠ CE APARA. O suprafata cu poarta si fara intrebare nu e mai privata — e doar
    mai oarba: acolo masuratoarea moare fara ca nimeni sa poata alege altfel.
    Layouturile sunt neuniforme intre ele, deci potrivirea se cauta, nu se
    presupune. Pana pe 03.09.2026 panoul era chiar exceptia: avea pixeli si n-avea
    nici GA4, nici banner.
  */
  const cuPixeli = fisiereSursa("src/app")
    .filter((f) => f.endsWith("layout.tsx"))
    /*
      ⚠ SI `EtichetaGoogleAds`. Lipsea din cautare de cand a fost adaugata: un
      layout care ar fi avut NUMAI eticheta de reclame — cea care scrie `_gcl_au`
      si face remarketing — n-ar fi fost socotit „cu pixeli", deci proba n-ar fi
      cerut banner acolo. Adica exact suprafata cea mai sensibila ar fi scapat.
    */
    .filter((f) => /Edinio(Meta|TikTok)Pixel|EtichetaGa4|EtichetaGoogleAds/.test(faraComentarii(citeste(f))));

  assert.ok(cuPixeli.length >= 4, `doar ${cuPixeli.length} layouturi cu pixeli — cautarea s-a stricat?`);
  const faraBanner = cuPixeli
    .filter((f) => !FARA_BANNER_DINADINS.includes(f))
    .filter((f) => !faraComentarii(citeste(f)).includes("<BannerConsimtamant />"));
  assert.deepEqual(faraBanner, [], "layouturi cu pixeli dar fara banner: nimeni n-ar putea alege acolo");
});

test("⚠ aplicatia autentificata nu incarca NICIUN script de reclama", () => {
  /*
    ═══════════════════════════════════════════════════════════════════════════
    ⚠ CE S-A INTAMPLAT PANA PE 03.09.2026, SI DE CE E MAI MULT DECAT SCOP
    ═══════════════════════════════════════════════════════════════════════════

    Layoutul panoului randa `EdinioMetaPixel`, `EdinioTikTokPixel` si
    `EtichetaGoogleAds`. Hotararea era a proprietarului si avea un motiv:
    retargetarea comerciantilor activi.

    ⚠ DAR PANOUL NU MASOARA NIMIC. N-are eticheta GA4, n-are runtime, n-are
    banner, si niciun ecran din el nu trage vreun eveniment. Deci cei trei nu
    aduceau nicio masuratoare — doar incarcau cod tert.

    ⚠ SI `fbevents.js` ISI PUNE SINGUR CARLIGUL pe schimbarea istoricului
    (masurat pe 01.09.2026 — de asta noi nu trimitem `PageView`). Adica FIECARE
    navigare prin panou pleca la Meta, desi `CAI_FARA_PAGE_VIEW` oprea `page_view`-ul
    NOSTRU. Adresele ecranelor de comenzi, clienti si facturi ajungeau in contul de
    reclame, si nici macar in rapoartele noastre.

    ⚠ SI ARGUMENTUL DE INCREDERE, scris deja in `fara-urmarire.ts` pentru
    previzualizarea de articol: cookie-ul de sesiune Supabase nu e `httpOnly`, deci
    un script tert incarcat aici ruleaza cu drepturile paginii. Miza e mai mare in
    panou decat pe un draft de articol.

    ⚠ PROBA CERE AMANDOUA PARTILE: sa nu fie randati, SI sa nu se poata incarca
    daca ii pune cineva la loc.
  */
  const autentificate = fisiereSursa("src/app")
    .filter((f) => f.endsWith("layout.tsx"))
    .filter((f) => f.includes("(dashboard)") || f.includes("(admin)"));
  assert.ok(autentificate.length >= 1, "nu mai gasesc layoutul aplicatiei autentificate");

  for (const f of autentificate) {
    const cod = faraComentarii(citeste(f));
    assert.ok(
      !/Edinio(Meta|TikTok)Pixel|EtichetaGoogleAds|EtichetaGa4/.test(cod),
      `${f}: aplicatia autentificata a primit inapoi un script de reclama`,
    );
  }

  /* ⚠ Si plasa de rulare, pentru cazul in care ajung acolo pe alta usa. */
  const reguli = citeste("src/lib/edinio-marketing/fara-urmarire.ts");
  for (const cale of ["/dashboard", "/admin"]) {
    assert.ok(
      new RegExp(`"${cale}"`).test(reguli),
      `${cale} nu mai e in CAI_FARA_URMARIRE — un pixel pus la loc s-ar incarca`,
    );
  }

  /* ⚠ Si ca lista e chiar cea folosita de componente, nu una decorativa. */
  assert.equal(faraUrmarire("/dashboard/comenzi"), true, "regula nu se aplica pe ecranele panoului");
  assert.equal(faraUrmarire("/admin"), true, "regula nu se aplica pe admin");
  assert.equal(faraUrmarire("/preturi"), false, "regula s-a largit peste site — s-ar stinge masuratoarea vie");
  /*
    ⚠ SI POTRIVIREA E PE SEGMENT INTREG. Cu `startsWith` gol, `/dashboard` ar fi
    stins urmarirea si pe `/dashboard-public` — o cale care azi nu exista, dar care
    ar fi tacut fara ca nimic sa cada.
  */
  assert.equal(faraUrmarire("/dashboard-public"), false, "potrivirea de cale inghite si cai vecine");
  assert.equal(faraUrmarire("/blog/previzualizare/abc"), true, "regula veche s-a pierdut la rescrierea potrivirii");
});

test("⚠ niciun layout nu spune despre sine contrariul a ce face", () => {
  /*
    ⚠ CE APARA, SI DE CE E O PROBA SI NU O CONVENTIE.

    Cele patru layouturi de prezentare purtau, pana pe 02.09.2026, randul „NU se
    pune in `(dashboard)`" — despre pixeli care sunt in dashboard din 01.06.2026,
    din alegerea proprietarului. Un audit din afara l-a citit si a raportat o
    incalcare de scop; nu era, era un comentariu ramas in urma.

    Cine citeste un comentariu peste sase luni ia hotarari pe el. Deci afirmatia
    se probeaza ca oricare alta.

    ⚠ SE CAUTA AFIRMATIA, NU SIRUL. Comentariul de acum CITEAZA forma veche, ca
    sa se stie ce s-a schimbat — deci o cautare simpla ar cadea pe propria
    reparatie. Se cere ca randul sa nu INCEAPA cu ea.
  */
  const layouturi = fisiereSursa("src/app").filter((f) => f.endsWith("layout.tsx"));
  assert.ok(layouturi.length >= 5, `doar ${layouturi.length} layouturi — cautarea s-a stricat?`);

  const mincinoase = layouturi.filter((f) => {
    const cod = readFileSync(f, "utf8");
    if (!/Edinio(Meta|TikTok)Pixel/.test(cod)) return false;
    return cod.split(RAND).some((r) => r.trim().startsWith("NU se pune in `(dashboard)`"));
  });

  assert.deepEqual(
    mincinoase, [],
    "un layout sustine ca pixelii nu ajung in dashboard, dar ei sunt acolo: " + mincinoase.join(", "),
  );
});

test("⚠ oriunde exista cookie-urile omului, martorii pleaca odata cu conversia", () => {
  /*
    ═══ ⚠ LIPSEAU TOCMAI DE LA CONVERSIILE SCUMPE ═══

    Pana pe 02.09.2026, `martoriiCererii()` era chemat numai la contact si la
    migrare. `sign_up` (amandoua caile) si `trial_start` plecau fara `_fbp` si
    fara `_fbc` — desi cookie-urile erau chiar in cererea din care se punea la
    coada, la un `await` distanta.

    `_fbc` poarta id-ul clicului pe reclama: fara el, Meta stie ca cineva s-a
    inscris, dar nu de la ce campanie. Adica exact intrebarea pentru care se
    plateste reclama.

    ⚠ REGULA E LEGATA DE TEMEI, nu de o lista de fisiere. Cine pune la coada pe
    temei de COOKIE are, prin definitie, cererea omului in mana — deci si
    cookie-urile lui. Cine pune pe temei CARAT (webhook-ul Stripe) n-are, si e
    scutit. Asa, un al saptelea loc adaugat maine intra singur sub regula.
  */
  const vinovate: string[] = [];
  for (const f of fisiereSursa("src")) {
    const cod = faraComentarii(citeste(f));
    let i = cod.indexOf("await puneLaCoada(");
    while (i >= 0) {
      const bucata = cod.slice(i, i + 900);
      if (bucata.includes('fel: "cookie"') && !bucata.includes("martori:")) vinovate.push(f);
      i = cod.indexOf("await puneLaCoada(", i + 1);
    }
  }
  assert.deepEqual(
    vinovate, [],
    "pun la coada cu cookie-urile omului in mana, dar fara martori: " + vinovate.join(", "),
  );
});

test("⚠ retragerea de pe server stinge si cookie-urile cu PREFIX", () => {
  /*
    ⚠ CE APARA. `_ga_<ID-UL-PROPRIETATII>` si `_gcl_*` poarta id-ul in chiar
    numele lor, deci nicio lista fixa nu-i acopera. Prima forma a rutei parcurgea
    doar numele intregi — si atunci `_gcl_au`, cookie-ul care poarta `gclid`,
    supravietuia unei retrageri facute de pe server.
  */
  const cod = faraComentarii(citeste("src/app/api/consimtamant/route.ts"));
  assert.match(cod, /eCookieDeMaturat\(/,
    "ruta nu mai foloseste aceeasi regula ca browserul — prefixele scapa");
  assert.match(cod, /req\.cookies\.getAll\(\)/,
    "ruta nu mai parcurge cookie-urile cererii, deci nu poate sti ce prefixe exista");
  assert.doesNotMatch(cod, /for \(const nume of COOKIE_FURNIZORI_EXACTE\)/,
    "a revenit lista fixa de nume intregi");
});
