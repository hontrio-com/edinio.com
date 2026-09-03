import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE PLEACA SI DE PE SERVER, SI CE NUMAI DIN BROWSER
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE EXISTA PROBA ASTA. Pe 02.09.2026 coada de conversii era gata, probata
  pana la serverele Meta si TikTok, si totusi INCOMPLETA: purtau `sign_up` cu
  email si `generate_lead`, dar nu si inscrierea prin Google, nici `trial_start`,
  nici `purchase`. Nimic n-o arata — fiecare bucata in parte era corecta, si
  numai socoteala intregului lipsea.

  Un eveniment care pleaca DOAR din browser se pierde la fiecare blocant de
  reclame. Pentru evenimentele de intentie (`begin_checkout`)
  asta e primit: sunt semnale, nu conversii. Pentru o conversie implinita, nu.

  ⚠ LISTA DE MAI JOS E O DECLARATIE, NU O OGLINDA. Daca o cale de server dispare,
  proba cade. Daca se adauga una noua, proba cade si ea — si atunci se scrie aici,
  dinadins, ce s-a schimbat.
*/

/** Conversii implinite: trebuie sa plece si de pe server. */
const DE_PE_SERVER = ["generate_lead", "sign_up", "trial_start", "purchase"];

/*
  ⚠ LISTA GOLURILOR E GOALA, SI ASA A AJUNS SA FIE.

  Pana pe 02.09.2026 scria aici `purchase`, cu motivul: suma adevarata o stie doar
  webhook-ul Stripe, iar `event_id`-ul browserului era id-ul magazinului, pe care
  webhook-ul nu-l are — la ora lui magazinul inca nu exista.

  S-a legat mutand martorul: `success_url` poarta inapoi `{CHECKOUT_SESSION_ID}`,
  deci amandoua drumurile numesc aceeasi sesiune. Proba de mai jos a CAZUT cand
  s-a intamplat, exact cum a fost scrisa sa cada — ca nota sa fie mutata, nu
  stearsa in tacere.
*/
const NELEGAT_INCA: string[] = [];

function fisiereSursa(rad: string): string[] {
  const iesire: string[] = [];
  for (const n of readdirSync(rad)) {
    const p = join(rad, n);
    if (statSync(p).isDirectory()) iesire.push(...fisiereSursa(p));
    else if (/\.(ts|tsx)$/.test(n) && !n.endsWith(".test.ts")) iesire.push(p);
  }
  return iesire;
}

/**
 * Numele evenimentelor din fiecare `puneLaCoada(...)` AJUNS din sursa.
 *
 * ⚠ SE CERE O INSTRUCTIUNE DE SINE STATATOARE, nu doar sirul undeva in fisier.
 * Prima forma cauta `puneLaCoada(` oriunde, si a trecut verde peste mutantul
 * `if (false) await puneLaCoada(...)`: apelul era scris, ramura era moarta, si
 * socoteala acoperirii spunea ca totul e legat.
 *
 * Ramane o proba de sursa, cu marginile ei — nu poate dovedi ca ramura chiar se
 * executa, doar ca nimeni n-a pus o paza pe acelasi rand.
 */
function evenimentePuseLaCoada(): Set<string> {
  const gasite = new Set<string>();
  const RAND = String.fromCharCode(10);
  for (const f of fisiereSursa("src")) {
    const linii = readFileSync(f, "utf8").split(RAND);
    for (let i = 0; i < linii.length; i++) {
      if (linii[i].trim() !== "await puneLaCoada(") continue;
      const m = linii.slice(i, i + 6).join(RAND).match(/name: "([a-z_]+)"/);
      if (m) gasite.add(m[1]);
    }
  }
  return gasite;
}

test("⚠ fiecare conversie implinita pleaca SI de pe server", () => {
  const puse = evenimentePuseLaCoada();
  const lipsa = DE_PE_SERVER.filter((e) => !puse.has(e));
  assert.deepEqual(
    lipsa, [],
    `evenimente care pleaca doar din browser, deci pierdute la blocantele de reclame: ${lipsa.join(", ")}`,
  );
});

test("golul cunoscut e chiar gol — altfel lista de mai sus minte", () => {
  /*
    ⚠ CAND `purchase` SE LEAGA, PROBA ASTA CADE. E dinadins: cade ca sa fie mutat
    in lista de sus, nu ca sa fie sters de aici in tacere. O nota care spune „nu e
    legat inca" despre ceva legat e mai rea decat lipsa notei.
  */
  const puse = evenimentePuseLaCoada();
  for (const e of NELEGAT_INCA) {
    assert.ok(!puse.has(e), `"${e}" s-a legat — muta-l in DE_PE_SERVER si scoate-l din NELEGAT_INCA`);
  }
});

test("inscrierea prin Google are propria cale de server, nu doar cea cu email", () => {
  /*
    ⚠ MASURAT: 28 din 168 de conturi vin prin Google (01.09.2026). `register()`
    poarta doar `signup_origin: "email"`, deci fara calea din `auth/callback`
    inscrierile prin Google n-ar ajunge NICIODATA pe server — 17% din conversii
    lipsa, si nimic care s-o arate.
  */
  /*
    ⚠ SI AICI SE CERE O INSTRUCTIUNE DE SINE STATATOARE, din acelasi motiv. In
    plus, socoteala de mai sus NU poate prinde disparitia asta: `sign_up` ramane
    acoperit de calea cu email, deci lista ar arata complet in timp ce Google ar
    fi tacut. De aceea calea prin Google are proba ei.
  */
  const RAND = String.fromCharCode(10);
  const linii = readFileSync("src/app/auth/callback/route.ts", "utf8").split(RAND);
  const i = linii.findIndex((l) => l.trim() === "await puneLaCoada(");
  assert.ok(i > 0, "callback-ul OAuth nu mai pune inscrierea la coada, sau apelul e sub o paza");
  assert.match(
    linii.slice(i, i + 4).join(RAND), /name: "sign_up", signup_origin: origine/,
    "originea nu mai vine de la server — inscrierile prin Google s-ar numara ca email",
  );
});

test("⚠ trialul se acorda ATOMIC, si se raporteaza doar daca s-a schimbat un rand", () => {
  /*
    ═══════════════════════════════════════════════════════════════════════════
    ⚠ PROBA ASTA CEREA PANA AZI O PAZA CARE NU PAZEA
    ═══════════════════════════════════════════════════════════════════════════

    Cerea sa existe `if (!areDejaPlan && !profileError)`. Numai ca `areDejaPlan`
    venea dintr-un SELECT facut INAINTE de scriere — deci proba dovedea ca
    raportarea atarna de o CITIRE, nu de ce s-a intamplat chiar.

    ⚠ CE INCAPEA INTRE ELE. Webhook-ul Stripe, care se aprinde exact atunci:

        T0  citim: plan=free, expira=null  ->  hotaram sa dam trial
        T1  webhook-ul scrie: plan=premium, expira=peste un an
        T2  scriem noi ce hotarasem la T0: plan=free, expira=peste 15 zile

    Abonamentul platit al omului, suprascris cu un trial. Iar comentariul de
    deasupra codului sustinea ca operatia e aparata de o conditie pe
    `plan_expires_at is null` — conditie care nu exista in scriere.

    Acum se cer trei lucruri, si toate trei sunt insusiri ale codului, nu forme:
      1. conditia sta CHIAR IN SCRIERE, nu intr-o citire de mai devreme;
      2. raportarea atarna de cate randuri s-au schimbat;
      3. cand omul a platit, trialul nici nu se incearca.
  */
  const cod = readFileSync("src/lib/actions/business.actions.ts", "utf8");

  /* 1 — conditia in scriere, nu intr-un `if` de deasupra. */
  const iTrial = cod.lastIndexOf("const { data: randuri", cod.indexOf('plan_expires_at: new Date(Date.now() + 15'));
  assert.ok(iTrial > 0, "nu mai gasesc acordarea trialului");

  /*
    ⚠ SE TAIE CHIAR INSTRUCTIUNEA, nu o fereastra. Prima forma taia „de la trial
    pana la primul `.select(`" — iar cand am scos `.select(`-ul ca mutant, cautarea
    a gasit unul de mai jos si felia a crescut peste el. Proba a trecut verde peste
    exact mutantul pentru care fusese scrisa.
  */
  const scrierea = (() => {
    let adanc = 0;
    for (let i = iTrial; i < cod.length; i++) {
      const c = cod[i];
      if (c === "(" || c === "[" || c === "{") adanc++;
      else if (c === ")" || c === "]" || c === "}") adanc--;
      else if (c === ";" && adanc <= 0) return cod.slice(iTrial, i + 1);
    }
    return cod.slice(iTrial);
  })();
  assert.match(scrierea, /\.is\("plan_expires_at", null\)/,
    "acordarea trialului nu mai e conditionata in scriere — un webhook care ajunge intre citire si scriere ii suprascrie abonamentul platit");
  assert.match(scrierea, /\.select\(/,
    "scrierea nu mai spune cate randuri a schimbat, deci nu se poate sti daca trialul s-a acordat chiar");

  /* 2 — raportarea atarna de randurile schimbate. */
  assert.match(cod, /trialAcordat = \(randuri\?\.length \?\? 0\) > 0/,
    "acordarea nu se mai citeste din randurile schimbate");
  const iGarda = cod.indexOf("if (trialRaportat) {");
  assert.ok(iGarda > 0, "raportarea nu mai atarna de acordarea reala");

  const iCoada = cod.indexOf("await puneLaCoada(", iGarda);
  assert.ok(iCoada > iGarda, "punerea la coada nu mai vine dupa paza");
  assert.ok(
    cod.slice(iGarda, iCoada).indexOf("}") < 0,
    "punerea la coada a iesit din ramura pazita — se raporteaza si cand trialul nu s-a acordat",
  );

  /* 3 — cand s-a platit, trialul nici nu se incearca. */
  assert.match(cod, /aduSiVerificaPlata\(data\.sesiuneStripe, user\.id\)/,
    "serverul nu mai intreaba Stripe daca omul a platit");
  const iPlata = cod.indexOf("if (!plata.ok) {");
  assert.ok(iPlata > 0 && iPlata < iTrial,
    "acordarea trialului nu mai sta sub verdictul platii — cine tocmai a cumparat ar primi si un trial, si un `trial_start`");
});

/* ═══ Abonamentul: cele doua drumuri trebuie sa numeasca aceeasi sesiune ═══ */

test("⚠ `success_url` de onboarding poarta inapoi id-ul sesiunii Stripe", () => {
  /*
    ⚠ AICI STA TOT. Fara sablonul asta, browserul n-are cu ce numi plata, si ar
    cadea inapoi pe id-ul magazinului — pe care webhook-ul nu-l are. Atunci
    acelasi abonament ar pleca sub doua nume si s-ar numara de DOUA ori.
  */
  const cod = readFileSync("src/app/api/stripe/checkout/route.ts", "utf8");
  const iOnboarding = cod.indexOf('return_to === "onboarding" ?');
  assert.ok(iOnboarding > 0, "ramura de onboarding a disparut din checkout");
  assert.ok(
    cod.slice(iOnboarding, iOnboarding + 200).includes("{CHECKOUT_SESSION_ID}"),
    "success_url nu mai poarta id-ul sesiunii — abonamentul s-ar numara de doua ori",
  );
});

test("⚠ browserul foloseste id-ul sesiunii pentru abonament, nu pe cel al magazinului", () => {
  const cod = readFileSync("src/app/(onboarding)/onboarding/plan/page.tsx", "utf8");

  /*
    ⚠ CE SE CERE ACUM, si de ce s-a schimbat. Pana pe 03.09.2026 pagina citea `sid`
    intr-o variabila si il trimitea direct. Proba asta cerea chiar forma aia.

    De cand plata se confirma la Stripe, `sid`-ul nu mai e crezut pe cuvant: se
    duce la server, iar `event_id` vine INAPOI de acolo, ca id al sesiunii pe care
    Stripe a recunoscut-o. Insusirea aparata ramane aceeasi — abonamentul poarta
    id-ul SESIUNII, nu al magazinului — dar drumul e altul.
  */
  /*
    ⚠ SE CERE REGULA, NU FORMA APELULUI. Prima varianta cerea chiar
    `verificaPlataOnboarding(searchParams.get("sid"))` si a cazut cand am scos
    `sid` intr-o variabila, ca sa-l pot reincerca — desi purtarea ramasese aceeasi.
    A doua oara in aceeasi zi cand o proba se rupe de la o rearanjare.

    Ce conteaza: id-ul din adresa ajunge la verificare, si verificarea e chemata.
  */
  assert.match(cod, /searchParams\.get\("sid"\)/, "pagina nu mai citeste id-ul sesiunii din adresa");
  assert.match(cod, /verificaPlataOnboarding\(/, "pagina nu mai confirma plata la server");

  const iPurchase = cod.indexOf('name: "purchase"');
  assert.ok(iPurchase > 0, "pagina nu mai trage purchase");

  /*
    {W} A TREIA OARA CAND O FELIE DE LUNGIME FIXA SE RUPE DE LA O REARANJARE.

    Randurile astea taiau `cod.slice(iPurchase, iPurchase + 400)` si cereau acolo
    `event_id: plata.sesiune` si `value: plata.suma`. Au cazut pe 03.09.2026 fiindca
    regula a fost SCOASA din pagina intr-o functie pura (`conversiaDinPlata`) — deci
    campurile nu mai sunt scrise aici, ci intr-un loc care se poate chema din proba.

    Purtarea nu s-a slabit, s-a intarit. Dar felia masura distanta in caractere.

    {W} CE SE CERE ACUM: legatura (pagina imprastie chiar raspunsul regulii) si
    campurile, cerute acolo unde sunt scrise. Regula insasi e probata prin CHEMARE
    in `verdict-plata.test.ts`.
  */
  const iSpread = cod.indexOf("...conversia", iPurchase);
  assert.ok(iSpread > iPurchase && iSpread - iPurchase < 80,
    "purchase nu mai e construit din raspunsul lui `conversiaDinPlata` — pagina isi scrie iar campurile");

  const regula = readFileSync("src/lib/edinio-marketing/verdict-plata.ts", "utf8");
  assert.match(regula, /event_id: p\.sesiune/,
    "purchase nu mai poarta id-ul sesiunii confirmate de Stripe");

  /*
    {W} SI CA SUMA VINE DE LA STRIPE, nu din tabelul de preturi. Webhook-ul o ia din
    `amount_total`; daca browserul si-o calculeaza singur, acelasi abonament pleaca
    cu doua sume la prima reducere sau la primul pret schimbat in Stripe.
  */
  assert.match(regula, /value: p\.suma/, "suma conversiei nu mai vine de la Stripe");
  assert.ok(!regula.includes("PLAN_PRICES"), "suma se calculeaza iar din tabelul de preturi");

  /*
    {W} SI CA PRETURILE DIN PAGINA NU AJUNG LA `purchase`. Ele sunt folosite chiar
    in fisierul asta, dar numai pentru `begin_checkout` — unde numarul e pretul
    DORIT, nu unul incasat. Se cere ca intre cele doua sa nu se amestece.
  */
  const bucataPurchase = cod.slice(iPurchase, cod.indexOf("}", iSpread) + 1);
  assert.ok(!bucataPurchase.includes("PLAN_PRICES") && !bucataPurchase.includes("getAnnualPrice"),
    "pretul din tabel a ajuns in `purchase` — venitul raportat nu mai e cel incasat");

  /* ⚠ Trialul RAMANE pe id-ul magazinului: perechea lui de server e `createBusiness`. */
  const iTrial = cod.indexOf('name: "trial_start"');
  assert.ok(iTrial > 0 && cod.slice(iTrial, iTrial + 160).includes("event_id: idConversie"),
    "trialul nu mai poarta id-ul magazinului — s-ar despartii de perechea lui de server");
});

/**
 * Chemarea `puneLaCoada(...)` care duce `name: "purchase"`, INTREAGA.
 *
 * ⚠ AICI STATEA `cod.slice(i, i + 400)`. Pe 03.09.2026 a cazut fara ca purtarea
 * sa se fi schimbat: am adaugat un comentariu inauntrul chemarii, si `ctx: {}` a
 * iesit din fereastra. Adica proba masura lungimea comentariilor, nu codul.
 *
 * O fereastra de marime fixa peste sursa e o proba care imbatraneste singura. Se
 * taie chemarea dupa PARANTEZE, cat tine ea.
 */
function chemareaDeCoada(cod: string): string {
  const nume = cod.indexOf('name: "purchase"');
  assert.ok(nume > 0, "webhook-ul nu mai pune abonamentul la coada");
  const start = cod.lastIndexOf("puneLaCoada(", nume);
  assert.ok(start > 0, "nu mai gasesc chemarea care duce abonamentul la coada");

  let adanc = 0;
  for (let i = start; i < cod.length; i++) {
    if (cod[i] === "(") adanc++;
    else if (cod[i] === ")") { adanc--; if (adanc === 0) return cod.slice(start, i + 1); }
  }
  assert.fail("chemarea `puneLaCoada` nu se inchide");
}

test("⚠ webhook-ul numeste ACEEASI sesiune, si raporteaza banii incasati", () => {
  const cod = readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");
  const bucata = chemareaDeCoada(cod);

  assert.match(bucata, /event_id: session\.id/,
    "webhook-ul foloseste alt id decat browserul — abonamentul s-ar numara de doua ori");
  assert.match(bucata, /value: session\.amount_total \/ 100/,
    "suma nu mai vine din incasare — un pret citit din cod e o presupunere raportata ca venit");
});

test("⚠ webhook-ul NU trimite ip-ul si browserul — ar fi ale lui Stripe", () => {
  /*
    ⚠ CE APARA. Un webhook vine de la serverele Stripe. Trimise ca ale omului,
    ip-ul l-ar aseza in tara lor, iar `user_agent` ar fi al unui robot — deci
    potrivirea la Meta si TikTok ar fi stricata, nu ajutata. Ce nu stim lipseste.
  */
  const bucata = chemareaDeCoada(readFileSync("src/app/api/stripe/webhook/route.ts", "utf8"));
  assert.match(bucata, /ctx: \{\}/, "webhook-ul a inceput sa trimita un context");
  for (const camp of ["x-forwarded-for", "user-agent", "userAgent"]) {
    assert.ok(!bucata.includes(camp), `webhook-ul trimite "${camp}" — ar fi al lui Stripe, nu al omului`);
  }
});


test("⚠ cand Stripe TACE, trialul nu se raporteaza: necunoscutul nu e o plata lipsa", () => {
  /*
    ═══════════════════════════════════════════════════════════════════════════
    ⚠ DEFECTUL, SI ERA AL MEU, DE O ZI
    ═══════════════════════════════════════════════════════════════════════════

    `aduSiVerificaPlata` intoarce `ok: false` pentru trei lucruri deosebite:

        fara-sesiune / neplatita / alt-om  ->  Stripe a raspuns. STIM ca n-a platit.
        indisponibil                       ->  Stripe n-a raspuns. NU STIM NIMIC.

    Ramura care acorda trialul le trata la fel: `if (!plata.ok)`.

    ⚠ CE SE INTAMPLA ATUNCI. Omul chiar plateste, se intoarce cu un `cs_...` bun,
    si exact in clipa aia Stripe are o pana. Noi citim „ok: false", acordam trialul
    si RAPORTAM `trial_start`. Webhook-ul aseaza pe urma planul platit — deci omul
    primeste ce a cumparat — dar la Meta si TikTok raman DOUA fapte pentru una:
    „a inceput un trial" si „s-a abonat". Optimizarea invata pe conversia ieftina
    in locul celei scumpe, si nimic nu cade.

    ⚠ SI DE CE NU SE TAIE SI DREPTUL, ci doar raportarea. Webhook-ul scrie planul
    neconditionat, deci un trial asezat acum nu poate rapi un abonament. In schimb,
    taiat de tot, cineva care N-A platit si a nimerit pana ar ramane fara niciun
    plan. Se taie ce minte, nu ce ajuta.
  */
  const cod = readFileSync("src/lib/actions/business.actions.ts", "utf8");

  assert.match(cod, /motiv !== "indisponibil"/,
    "serverul nu mai deosebeste o pana la Stripe de o plata inexistenta — raporteaza un trial pentru cine tocmai a cumparat");

  /* ⚠ SI CA DEOSEBIREA CHIAR PAZESTE RAPORTAREA, nu doar exista undeva. */
  assert.match(cod, /const trialRaportat = trialAcordat && stiuCaNuAPlatit/,
    "raportarea nu mai cere AMANDOUA: si randul schimbat, si certitudinea ca n-a fost plata");

  /*
    ⚠ SI CA DREPTUL A RAMAS NECONDITIONAT DE ASTA: scrierea trialului sta sub
    `!plata.ok`, nu sub `stiuCaNuAPlatit`. Altfel o pana la Stripe ar lasa un om
    fara plan.
  */
  const iScriere = cod.indexOf('plan_expires_at: new Date(Date.now() + 15');
  const iRamura = cod.lastIndexOf("if (!plata.ok) {", iScriere);
  assert.ok(iRamura > 0, "acordarea trialului nu mai sta sub verdictul platii");
  assert.ok(
    cod.lastIndexOf("if (stiuCaNuAPlatit", iScriere) < iRamura,
    "acordarea trialului a ajuns si ea sub certitudine — o pana la Stripe lasa omul fara niciun plan",
  );
});

test("⚠ browserul raporteaza trialul dupa BAZA, nu dupa ce scrie in sessionStorage", () => {
  /*
    ⚠ CE APARA. Pagina intreba `plan === "free"` — adica ce ALESESE omul, citit
    din `sessionStorage`. Serverul stie altceva: cate randuri a schimbat chiar.

    Cele doua se despart mai des decat pare. Omul isi face al DOILEA magazin si are
    deja un trial: baza refuza (conditia `plan_expires_at is null`), serverul nu
    raporteaza nimic — dar browserul vedea tot „free" si trimitea `trial_start`.
    O conversie fara perechea ei de server, deci una pe care Meta o numara singura,
    n-avand cu ce s-o uneasca.

    ⚠ SI DE CE NU E DE AJUNS SA FIE CORECT SERVERUL. Perechea browser+server e
    tot rostul lui `event_id`. Cand una din jumatati pleaca si cealalta nu, nu se
    dubleaza nimic — dar numaratoarea creste cu un om care n-a facut fapta.
  */
  const cod = readFileSync("src/app/(onboarding)/onboarding/plan/page.tsx", "utf8");

  const iTrial = cod.indexOf('name: "trial_start"');
  assert.ok(iTrial > 0, "pagina nu mai trage trial_start");

  const iGarda = cod.lastIndexOf("if (", iTrial);
  const garda = cod.slice(iGarda, iTrial);
  assert.match(garda, /result\.trialRaportat/,
    "`trial_start` din browser nu mai atarna de ce a scris serverul in baza");
  assert.ok(!/plan === "free"/.test(garda),
    "`trial_start` atarna iar de planul ales in browser, nu de trialul acordat");

  /* ⚠ Si serverul chiar il trimite incoace. */
  const server = readFileSync("src/lib/actions/business.actions.ts", "utf8");
  assert.match(server, /return \{ success: true, businessId: business\.id, slug: business\.slug, trialRaportat \}/,
    "serverul nu mai intoarce catre browser daca a acordat trialul");
});

test("⚠ `add_payment_info` nu mai exista pe magistrala noastra", () => {
  /*
    ⚠ DE CE E O PROBA, si nu doar o stergere. Numele e standard la GA4, Meta si
    TikTok, deci tentatia de a-l pune inapoi e mare — arata a lucru corect. Numai
    ca in Stripe-hosted Checkout NU AVEM CUM sa vedem clipa in care omul isi trimite
    datele de plata: formularul e pe domeniul lor. Orice `add_payment_info` tras de
    aici afirma o fapta pe care n-am observat-o.

    ⚠ SI ARGUMENTUL CU CARE L-AM APARAT O ZI ERA FALS. Am scris ca numele
    imprumutat se plateste ca sa ramana optimizarea Meta pe un eveniment standard.
    Numarat pe 03.09.2026: 169 de conturi, 20 platitoare, 5 in ultimele 60 de zile.
    Meta cere zeci de conversii pe SAPTAMANA ca sa invete ceva. Nu era nicio
    optimizare de pastrat.

    ⚠ CE E IN LOCUL LUI: `begin_checkout`, mutat pe aceeasi apasare. Un singur
    eveniment in clipa aia, si acela adevarat.

    ⚠ CE NU ATINGE PROBA ASTA: `add_payment_info` din magazinul comerciantului
    (`checkout/checkout-core.ts`). Acolo formularul e al nostru, metoda de plata se
    alege sub ochii nostri, si evenimentul spune exact ce s-a intamplat.
  */
  const cod = readFileSync("src/lib/edinio-marketing/evenimente.ts", "utf8");
  assert.ok(!/\|\s*\{ name: "add_payment_info"/.test(cod),
    "`add_payment_info` s-a intors in taxonomie — afirma o fapta pe care Stripe-hosted Checkout n-o arata");

  for (const adaptor of ["adaptor-meta.ts", "adaptor-tiktok.ts", "adaptor-ga4.ts"]) {
    const a = readFileSync(`src/lib/edinio-marketing/${adaptor}`, "utf8");
    assert.ok(!/case "add_payment_info"/.test(a), `${adaptor} il cartografiaza din nou`);
  }

  const pagina = readFileSync("src/app/(onboarding)/onboarding/plan/page.tsx", "utf8");
  assert.ok(!/name: "add_payment_info"/.test(pagina),
    "pagina de planuri il trage din nou la predarea catre Stripe");
});


test("⚠ `begin_checkout` pleaca DUPA ce Stripe confirma sesiunea, pe amandoua drumurile", () => {
  /*
    ⚠ CE APARA. Sunt doua drumuri catre plata, si pana pe 03.09.2026 nu aveau
    aceeasi regula:

      - apasarea pe „continua": se verifica `res.ok` si `data.url`, ABIA APOI
        pleca evenimentul. Corect.
      - campania (`?plan=basic`, redirectare neasistata): evenimentul pleca
        INAINTE de `fetch`. Deci daca ruta de checkout cadea — cheie Stripe
        expirata, plan necunoscut, pana de retea — GA4, Meta si TikTok primeau
        „a inceput cumpararea" pentru o sesiune care nu s-a nascut niciodata.

    ⚠ SI DE CE TOCMAI PE DRUMUL ALA CONTEAZA. Acolo ajung oamenii din reclame
    platite. O palnie umflata exact la intrarea din campanie face costul pe
    rezultat sa para mai mic decat este — greseala care se citeste ca succes.

    ⚠ SE CERE REGULA, NU ORDINEA RANDURILOR: evenimentul trebuie sa stea INAUNTRUL
    ramurii care a vazut `data.url`.
  */
  const cod = readFileSync("src/app/(onboarding)/onboarding/plan/page.tsx", "utf8");

  const iRamura = cod.indexOf("if (data.url) {");
  assert.ok(iRamura > 0, "drumul de campanie nu mai verifica `data.url` inainte sa plece");

  /* Ramura, taiata pe acolade — nu o fereastra de N caractere. */
  const ramura = (() => {
    let adanc = 0;
    for (let i = cod.indexOf("{", iRamura); i < cod.length; i++) {
      if (cod[i] === "{") adanc++;
      else if (cod[i] === "}") { adanc--; if (adanc === 0) return cod.slice(iRamura, i + 1); }
    }
    return "";
  })();

  assert.match(ramura, /name: "begin_checkout"/,
    "`begin_checkout` de campanie nu mai sta sub confirmarea sesiunii — pleaca si cand Stripe n-a creat nimic");

  /* ⚠ Si ca nu ramane si o copie inaintea cererii. */
  const inainteDeFetch = cod.slice(0, cod.indexOf('fetch("/api/stripe/checkout"'));
  assert.ok(!/name: "begin_checkout"/.test(inainteDeFetch),
    "a ramas un `begin_checkout` tras inaintea cererii catre Stripe");
});

test("⚠ `plan_id` e obligatoriu IN TIP la `begin_checkout`, nu doar in comentariu", () => {
  /*
    ⚠ CE APARA. O zi comentariul de deasupra tipului a spus „`plan_id` E ACUM
    OBLIGATORIU" iar tipul de dedesubt a scris `plan_id?: string`. Cine citea nota
    credea ca invariantul e aparat de compilator; nu era.

    ⚠ SI DE CE NU E DE AJUNS CA APELANTII SUNT CORECTI AZI. Un apelant nou scris
    peste sase luni e chiar cazul pentru care exista tipul. Fara el, `content_name`
    pleaca `undefined` catre Meta si articolul GA4 iese fara nume — exact defectul
    de care s-a plans pixelul TikTok in productie.

    ⚠ SI TOTUSI REZERVA `?? "abonament"` RAMANE in adaptoare, si nu e cod mort:
    tipul nu supravietuieste unui `as never` si nici unui eveniment reconstruit din
    JSON. Tipul opreste greseala la scriere, rezerva o opreste la rulare.
  */
  const cod = readFileSync("src/lib/edinio-marketing/evenimente.ts", "utf8");

  const i = cod.indexOf('| { name: "begin_checkout"');
  assert.ok(i > 0, "nu mai gasesc forma lui `begin_checkout` in taxonomie");
  const forma = cod.slice(i, cod.indexOf("}", i) + 1);

  assert.ok(!/plan_id\?/.test(forma),
    "`plan_id` a redevenit optional la `begin_checkout` — tipul nu mai apara ce promite comentariul");
  assert.match(forma, /plan_id: string/, "`plan_id` nu mai e cerut");
  assert.match(forma, /value: number/, "`value` nu mai e cerut — evenimentul poate pleca fara suma");
  assert.match(forma, /currency: "RON"/, "`currency` nu mai e cerut");

  /* ⚠ Si ca rezerva de rulare n-a fost stearsa ca „acum inutila". */
  for (const a of ["adaptor-tiktok.ts", "adaptor-ga4.ts"]) {
    const cod2 = readFileSync(`src/lib/edinio-marketing/${a}`, "utf8");
    assert.match(cod2, /plan_id \?\? "abonament"/,
      `${a}: rezerva de rulare a fost stearsa — un \`as never\` trece acum pe langa tip si campul iese gol`);
  }
});
