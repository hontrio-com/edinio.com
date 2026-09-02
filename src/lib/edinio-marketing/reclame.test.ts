import { strict as assert } from "node:assert";
import { test, beforeEach } from "node:test";
import { urmareste, inregistreazaAdaptor, goleste, resetPentruProbe, type Adaptor } from "./magistrala";
import { NUME_TAXONOMIE, type EvenimentEdinio } from "./evenimente";
import { verificaFaraPii } from "./fara-pii";
import { catreMeta, adaptorMeta } from "./adaptor-meta";
import { catreTikTok, adaptorTikTok } from "./adaptor-tiktok";
import { adaptorGa4 } from "./adaptor-ga4";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE PLEACA SPRE META SI TIKTOK — PROBAT PRIN CHEMARE
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ NICIO PROBA DE AICI NU CITESTE SURSA. Se pune un `fbq` de mana pe `window`,
  se trage un eveniment prin magistrala, si se verifica CE A PRIMIT el.
*/

type Chemare = unknown[];

let laFbq: Chemare[] = [];
let laTtq: Chemare[] = [];

function inBrowser({ meta = true, tiktok = true } = {}) {
  const g = globalThis as unknown as Record<string, unknown>;
  const w: Record<string, unknown> = {
    location: { pathname: "/preturi", hostname: "www.edinio.com", href: "https://www.edinio.com/preturi" },
    localStorage: { getItem: () => null },
  };
  if (meta) w.fbq = (...a: unknown[]) => { laFbq.push(a); };
  if (tiktok) w.ttq = { track: (...a: unknown[]) => { laTtq.push(a); } };
  g.window = w;
  g.document = { title: "Edinio" };
}

beforeEach(() => {
  resetPentruProbe();
  laFbq = [];
  laTtq = [];
  inBrowser();
});

/* ═══ 1. Ce NU pleaca, si de ce e cel mai important lucru de aici ═══ */

test("⚠ `page_view` NU pleaca spre Meta si nici spre TikTok", () => {
  /*
    ═══ MASURAT IN PRODUCTIE PE 01.09.2026, NU PRESUPUS ═══

    Pe `www.edinio.com`, cu doua navigari FARA reincarcare de document
    (`/` catre `/preturi` catre `/integrari`), pixelul Meta a trimis singur cate
    un `PageView` la fiecare. `fbevents.js` isi pune propriul carlig pe schimbarea
    istoricului; la fel face si TikTok.

    Deci un `PageView` trimis SI de noi ar dubla fiecare vizualizare din contul de
    reclame — si nimic n-ar cadea. Costul pe rezultat ar parea la jumatate.

    ⚠ Proba asta e singura care apara masuratoarea aceea. Daca vreodata cineva
    adauga `case "page_view"` intr-un adaptor, cade aici.
  */
  assert.equal(catreMeta({ name: "page_view", page_location: "https://www.edinio.com/" }), null);
  assert.equal(catreTikTok({ name: "page_view", page_location: "https://www.edinio.com/" }), null);
});

test("evenimentele de analiza fina nu ajung in conturile de reclame", () => {
  /*
    ⚠ NU DIN PUDOARE, CI FIINDCA STRICA OPTIMIZAREA. Un cont de reclame plin de
    `scroll_depth` si `section_view` invata mai incet: algoritmul cauta tipare in
    zgomot. Analiza se face in GA4, unde astea chiar folosesc la ceva.
  */
  const deAnaliza: EvenimentEdinio[] = [
    { name: "scroll_depth", percent: 50 },
    { name: "section_view", section_name: "preturi" },
    { name: "cta_click", cta_id: "hero_incepe", cta_location: "hero" },
    { name: "form_start", form_name: "contact" },
    { name: "article_view", article_id: "a1", article_slug: "s" },
    { name: "onboarding_step_view", onboarding_step: "details", onboarding_step_index: 1 },
    { name: "onboarding_step_complete", onboarding_step: "details", onboarding_step_index: 1 },
  ];
  for (const ev of deAnaliza) {
    assert.equal(catreMeta(ev), null, `${ev.name} nu are ce cauta la Meta`);
    assert.equal(catreTikTok(ev), null, `${ev.name} nu are ce cauta la TikTok`);
  }
});

test("⚠ si invers: `landing_view` NU intra in GA4", () => {
  /*
    ═══ CEALALTA JUMATATE A ACELEIASI REGULI ═══

    `landing_view` exista NUMAI pentru audientele de retargetare din Meta si
    TikTok, care se construiesc din `ViewContent`. In GA4 pagina e deja numarata
    de `page_view`, cu `page_type` si `page_group`.

    Trimis si acolo, ar fi un al doilea nume pentru acelasi lucru — iar cine ar
    face un raport pe el ar numara vizitele de doua ori.

    ⚠ PROBA ASTA LIPSEA. Am gasit-o punand mutantul: am facut `numeGa4` sa
    intoarca `"landing_view"` in loc de `null`, si TOATA suita a trecut verde. Un
    defect pe care nimic nu-l apara nu e pazit fiindca e scris intr-un comentariu.
  */
  const laGtag: unknown[][] = [];
  (globalThis as unknown as { window: Record<string, unknown> }).window.gtag =
    (...a: unknown[]) => { laGtag.push(a); };
  inregistreazaAdaptor(adaptorGa4);
  inregistreazaAdaptor(adaptorMeta);

  urmareste({ name: "landing_view", content_name: "Homepage", content_category: "landing" });
  assert.deepEqual(laGtag, [], "`landing_view` a ajuns in GA4 — pagina se numara de doua ori");

  /*
    ═══ ⚠ MARTORUL, SI DE CE E EL JUMATATEA IMPORTANTA A PROBEI ═══

    Prima forma cerea doar „GA4 n-a primit nimic", si trecea VERDE peste chiar
    mutantul pe care era scrisa sa-l prinda. Motivul: evenimentul nu ajungea
    NICAIERI. `content_name` se termina in `_name`, deci paza anti-PII il oprea in
    magistrala, inaintea oricarui adaptor — iar in productie paza nu arunca, lasa
    balta in tacere.

    Adica proba dovedea tacerea, si tacerea avea alta cauza decat regula. Exact
    defectul viu pe care l-a scos la iveala: catre Meta si TikTok nu pleca niciun
    `ViewContent`, deci audientele de retargetare nu mai cresteau deloc.

    Deci se cere si opusul: acelasi eveniment CHIAR ajunge la Meta. Fara randurile
    astea, proba de sus nu dovedeste nimic.
  */
  const vc = laFbq.find(c => c[1] === "ViewContent");
  assert.ok(vc, "`landing_view` n-a ajuns nici la Meta — e oprit undeva mai devreme, nu de regula");

  urmareste({ name: "page_view", page_location: "https://www.edinio.com/" });
  assert.equal(laGtag.length, 1, "adaptorul GA4 nu trimite nimic — proba de sus nu dovedeste nimic");
  assert.equal(laGtag[0][1], "page_view");
});

test("⚠ MATURA: niciun eveniment din taxonomie nu e oprit de paza anti-PII", () => {
  /*
    ═══ PLASA GENERALA, scrisa dupa ce acelasi defect a aparut A DOUA OARA ═══

    Paza anti-PII opreste orice cheie care SE TERMINA in `_name` — asa prinde
    `first_name` si `last_name`. Dar prinde si `form_name`, si `section_name`, si
    `content_name`, care poarta cuvinte scrise de NOI.

    De fiecare data urmarea a fost aceeasi: in productie evenimentul se lasa
    balta in tacere, si un raport intreg ramanea gol fara ca nimic sa cada.

    ⚠ PROBA ASTA NU VERIFICA UN CAZ, CI TOATE. Fiecare eveniment din taxonomie
    trece prin paza cu valori curate. Un nume nou care se loveste de o cheie
    oprita cade AICI, nu peste trei saptamani cand cineva se intreaba de ce
    raportul lui e gol.

    ⚠ Iar daca se adauga un eveniment nou in taxonomie si nu se adauga aici,
    martorul de la sfarsit cade: numarul lor trebuie sa se potriveasca.
  */
  const toate: EvenimentEdinio[] = [
    { name: "page_view", page_location: "https://www.edinio.com/", page_title: "Edinio" },
    { name: "section_view", section_name: "preturi" },
    { name: "scroll_depth", percent: 50 },
    { name: "cta_click", cta_id: "hero_incepe", cta_location: "hero", cta_destination: "/register" },
    { name: "navigation_click", nav_item: "preturi", nav_location: "header", destination_path: "/preturi" },
    { name: "outbound_click", outbound_host: "tel", outbound_kind: "phone" },
    { name: "billing_period_change", billing_period: "annual" },
    { name: "plan_select", plan_id: "premium", billing_period: "monthly" },
    { name: "faq_open", faq_id: "f1", faq_group: "preturi" },
    { name: "integration_filter", integration_category: "curieri" },
    { name: "integration_view", integration_id: "fan", integration_category: "curieri" },
    { name: "form_start", form_name: "contact" },
    { name: "form_submit", form_name: "contact" },
    { name: "form_error", form_name: "contact", error_type: "validare", field_name: "email" },
    { name: "generate_lead", lead_type: "contact", form_name: "contact", event_id: "e1" },
    { name: "article_view", article_id: "a1", article_slug: "s1", article_category: "ghid", article_author: "Edinio" },
    { name: "article_read_progress", article_id: "a1", read_depth: 50 },
    { name: "article_read_complete", article_id: "a1" },
    { name: "article_cta_click", article_id: "a1", cta_id: "c1", cta_position: "middle" },
    { name: "article_share", article_id: "a1", share_method: "link" },
    { name: "view_search_results", search_term: "magazin online", search_scope: "blog" },
    { name: "newsletter_subscribe_request" },
    { name: "newsletter_subscribe_confirmed" },
    { name: "registration_view" },
    { name: "registration_start" },
    { name: "sign_up", signup_origin: "email", event_id: "e2" },
    { name: "onboarding_step_view", onboarding_step: "details", onboarding_step_index: 1 },
    { name: "onboarding_step_complete", onboarding_step: "details", onboarding_step_index: 1 },
    { name: "onboarding_complete" },
    { name: "begin_checkout", plan_id: "premium", billing_period: "monthly" },
    { name: "add_payment_info", plan_id: "premium", billing_period: "monthly" },
    { name: "trial_start", plan_id: "free", event_id: "e3" },
    { name: "purchase", plan_id: "ultra", billing_period: "annual", value: 999, currency: "RON", event_id: "e4" },
    { name: "landing_view", content_name: "Homepage", content_category: "landing" },
  ];

  for (const ev of toate) {
    const { name, ...parametri } = ev;
    assert.doesNotThrow(
      () => verificaFaraPii(name, parametri as Record<string, unknown>),
      `evenimentul "${name}" e oprit de paza anti-PII: in productie s-ar lasa balta in TACERE`,
    );
  }

  /*
    ⚠ MARTORUL LISTEI. Fara el, cineva adauga un eveniment in taxonomie, uita
    sa-l puna aici, si proba trece verde pe o lista invechita — adica pazeste
    trecutul.
  */
  const numeAcoperite = new Set(toate.map(e => e.name));
  assert.equal(
    numeAcoperite.size, toate.length,
    "lista de mai sus are acelasi eveniment de doua ori",
  );
  assert.equal(
    numeAcoperite.size, NUME_TAXONOMIE.length,
    `taxonomia are ${NUME_TAXONOMIE.length} evenimente, iar proba matura doar ${numeAcoperite.size}. ` +
    "Adauga-l pe cel nou in lista de mai sus.",
  );
});

/* ═══ 2. Vocabularele celor doi NU sunt acelasi ═══ */

test("⚠ o cerere de oferta e `Lead` la Meta si `SubmitForm` la TikTok", () => {
  /*
    ⚠ ASTA E MOTIVUL PENTRU CARE NU EXISTA O LISTA COMUNA de nume voie sa plece.
    A existat una (`CATRE_RECLAME`) si am scos-o: o lista de NUME nu poate descrie
    doua vocabulare deosebite. TikTok n-are `Lead`.
  */
  const ev: EvenimentEdinio = { name: "generate_lead", lead_type: "contact", form_name: "contact", event_id: "x1" };
  assert.equal(catreMeta(ev)?.nume, "Lead");
  assert.equal(catreTikTok(ev)?.nume, "SubmitForm");
});

test("un trial gratuit NU pleaca ca abonare", () => {
  /*
    ⚠ Trimis ca `Subscribe`, ar invata licitatia sa caute oameni care nu platesc,
    si ar aduce venit inventat in raportul de reclame.
  */
  const trial: EvenimentEdinio = { name: "trial_start", plan_id: "free", event_id: "b1" };
  assert.equal(catreMeta(trial)?.nume, "StartTrial");
  assert.equal(catreTikTok(trial)?.nume, "StartTrial");
  assert.equal(catreMeta(trial)?.date.value, 0, "un trial are valoarea zero, nu pretul planului");

  const platit: EvenimentEdinio = {
    name: "purchase", plan_id: "premium", billing_period: "monthly",
    value: 199, currency: "RON", event_id: "b2",
  };
  assert.equal(catreMeta(platit)?.nume, "Subscribe");
  assert.equal(catreMeta(platit)?.date.value, 199);
});

/* ═══ 3. `event_id` — fara el, deduplicarea cu serverul nu exista ═══ */

test("⚠ fiecare conversie duce mai departe `event_id`-ul ei, la amandoi", () => {
  /*
    ⚠ CE SE STRICA FARA EL. Cand se adauga trimiterea de pe server (Meta CAPI,
    TikTok Events API), acelasi abonament soseste pe doua drumuri. Furnizorii le
    unesc DOAR daca poarta acelasi id. Fara, o singura vanzare apare ca doua
    conversii — iar costul pe achizitie raportat se injumatateste. In favoarea
    noastra, deci nimeni nu-l pune la indoiala.

    ⚠ SI CHEILE SE NUMESC ALTFEL: `eventID` la Meta, `event_id` la TikTok. O
    greseala aici nu cade nicaieri: furnizorul primeste evenimentul si ignora
    cheia pe care n-o cunoaste.
  */
  const conversii: EvenimentEdinio[] = [
    { name: "generate_lead", lead_type: "contact", form_name: "contact", event_id: "id-lead" },
    { name: "sign_up", signup_origin: "email", event_id: "id-cont" },
    { name: "trial_start", plan_id: "free", event_id: "id-trial" },
    { name: "purchase", plan_id: "ultra", billing_period: "annual", value: 999, currency: "RON", event_id: "id-plata" },
  ];

  for (const ev of conversii) {
    const m = catreMeta(ev);
    const t = catreTikTok(ev);
    assert.ok(m, `${ev.name}: nicio cartografiere Meta`);
    assert.ok(t, `${ev.name}: nicio cartografiere TikTok`);
    assert.ok(m.eventID, `${ev.name}: pleaca spre Meta FARA event_id`);
    assert.ok(t.eventId, `${ev.name}: pleaca spre TikTok FARA event_id`);
    assert.equal(m.eventID, t.eventId, `${ev.name}: cei doi primesc id-uri DEOSEBITE`);
  }
});

test("id-ul ajunge sub cheia pe care o asteapta FIECARE furnizor", () => {
  inregistreazaAdaptor(adaptorMeta);
  inregistreazaAdaptor(adaptorTikTok);

  urmareste({ name: "sign_up", signup_origin: "email", event_id: "u-7" });

  const fb = laFbq.find(c => c[0] === "track");
  assert.ok(fb, "Meta n-a primit nimic");
  assert.equal(fb[1], "CompleteRegistration");
  assert.deepEqual(fb[3], { eventID: "u-7" }, "Meta cere `eventID`, cu D mare");

  assert.equal(laTtq.length, 1, "TikTok n-a primit nimic");
  assert.equal(laTtq[0][0], "CompleteRegistration");
  assert.deepEqual(laTtq[0][2], { event_id: "u-7" }, "TikTok cere `event_id`, cu underscore");
});

/* ═══ 4. Nimic personal nu ajunge intr-un cont de reclame ═══ */

test("⚠ o adresa de email strecurata intr-o conversie nu pleaca nicaieri", () => {
  /*
    Paza sta in magistrala, inaintea oricarui adaptor. Proba e aici fiindca aici
    e paguba cea mai mare: datele dintr-un cont de reclame hranesc audiente si nu
    se mai pot scoate.

    ⚠ PRIMA FORMA A PROBEI CEREA O ARUNCARE, si a cazut — pe buna dreptate, dar
    din vina ei, nu a codului. In PRODUCTIE magistrala nu arunca dinadins: o
    masuratoare stricata n-are voie sa doboare pagina omului. Ea lasa balta si
    scrie in jurnal.

    Deci lucrul care conteaza nu e „a aruncat", ci „N-A PLECAT". Se cer
    amandoua purtarile, fiecare pe gazda ei — si asta e si singurul loc unde se
    dovedeste ca deosebirea dintre ele chiar exista.

    ⚠ SI SE CERE SI CA `form_name` CURAT SA TREACA. Cheia se termina in `_name`,
    deci e pe lista celor scutite de paza pe NUME; daca cineva ar scoate-o de
    acolo, raportul de formulare ar tacea in productie fara sa cada nimic.
  */
  inregistreazaAdaptor(adaptorMeta);
  inregistreazaAdaptor(adaptorTikTok);

  const murdar: EvenimentEdinio = {
    name: "generate_lead", lead_type: "contact",
    form_name: "ion@exemplu.ro", event_id: "x",
  };

  /* ── Pe productie: nu arunca, dar nici nu trimite ───────────────────── */
  urmareste(murdar);
  assert.equal(laFbq.length, 0, "Meta a primit un eveniment cu date personale");
  assert.equal(laTtq.length, 0, "TikTok a primit un eveniment cu date personale");

  /* ── Iar `form_name` curat trece, altfel paza ar fi oprit tot ────────── */
  urmareste({ name: "generate_lead", lead_type: "contact", form_name: "contact", event_id: "ok" });
  assert.equal(laFbq.length, 1, "un `form_name` curat a fost oprit de paza");
  assert.equal(laTtq.length, 1);

  /* ── In afara productiei ARUNCA, ca greseala sa fie vazuta de cine o scrie ── */
  inBrowser();
  (globalThis as unknown as { window: { location: { hostname: string } } }).window.location.hostname = "localhost";
  assert.throws(() => urmareste(murdar), /email/i);
});

/* ═══ 5. Coada: ordinea in care se goleste ═══ */

test("⚠ coada se goleste IN ORDINEA in care s-au intamplat lucrurile", () => {
  /*
    ═══ DEFECT REPARAT PE 01.09.2026 ═══

    `goleste` parcurgea coada de la coada spre cap, fiindca asa e simplu sa scoti
    elemente cu `splice` fara sa strici indicii. Efectul: evenimentele plecau
    EXACT PE DOS.

    Pe pagina de intrare asta insemna ca `landing_view` ajungea INAINTEA
    `page_view`-ului paginii lui. Nu cadea nimic si nu lipsea nimic — dar in
    rapoartele de parcurs pagina aparea vizitata dupa ce omul o derulase deja.

    ⚠ PROBA CERE ORDINEA, nu doar numarul. `assert.equal(primite.length, 3)` ar fi
    trecut verde peste chiar defectul asta.
  */
  const primite: string[] = [];
  let gata = false;
  const lent: Adaptor = {
    nume: "lent",
    gata: () => gata,
    trimite: (ev) => { primite.push(ev.name); },
  };
  inregistreazaAdaptor(lent);

  urmareste({ name: "page_view", page_location: "https://www.edinio.com/" });
  urmareste({ name: "section_view", section_name: "hero" });
  urmareste({ name: "scroll_depth", percent: 25 });
  assert.deepEqual(primite, [], "adaptorul nu era gata; n-avea ce primi");

  gata = true;
  goleste("lent");

  assert.deepEqual(
    primite, ["page_view", "section_view", "scroll_depth"],
    "coada s-a golit in alta ordine decat s-au intamplat lucrurile",
  );
});

test("un adaptor care arunca la golire nu-si tine evenimentele blocate in coada", () => {
  /*
    ⚠ Scoase din coada INAINTE de trimitere. Altfel un adaptor care arunca ar
    incerca aceleasi evenimente la fiecare golire, la nesfarsit, si coada n-ar
    scadea niciodata sub plafon — adica evenimentele NOI ar fi cele aruncate.
  */
  let gata = false;
  let incercari = 0;
  inregistreazaAdaptor({
    nume: "stricat",
    gata: () => gata,
    trimite: () => { incercari++; throw new Error("cade"); },
  });

  urmareste({ name: "section_view", section_name: "hero" });
  gata = true;
  goleste("stricat");
  goleste("stricat");

  assert.equal(incercari, 1, "acelasi eveniment a fost incercat de mai multe ori");
});

/* ═══ 6. Furnizorul lipsa nu doboara nimic ═══ */

test("fara `fbq` pe pagina, evenimentul asteapta si nu strica nimic", () => {
  /*
    Asa arata orice pagina in afara productiei: scriptul se opreste singur la
    verificarea gazdei, deci `window.fbq` nu exista niciodata.
  */
  inBrowser({ meta: false, tiktok: true });
  inregistreazaAdaptor(adaptorMeta);
  inregistreazaAdaptor(adaptorTikTok);

  urmareste({ name: "sign_up", signup_origin: "email", event_id: "u-9" });

  assert.equal(laFbq.length, 0);
  assert.equal(laTtq.length, 1, "TikTok trebuia sa primeasca; nu depinde de Meta");
});

/* ═══ 7. Depanarea, care trebuie sa mearga TOCMAI pe productie ═══ */

test("⚠ jurnalul si `debug_mode` se aprind numai cu cheia pusa de mana — dar si pe productie", () => {
  /*
    ═══ CE ERA STRICAT, SI CUM L-AM GASIT ═══

    `eDepanare()` avea un `if (eProductieMarketing()) return false;`. Motivul
    scris alaturi era ca altfel s-ar scrie in consola FIECARUI vizitator — ceea ce
    era fals: se scrie numai la cine si-a pus el insusi cheia in `localStorage`.

    Pretul era ca tocmai pe productie nu puteai vedea ce pleaca. Iar documentul de
    configurare spunea „aprinde cheia pe edinio.com si uita-te" — o instructiune
    care nu functiona. L-am prins scriind documentul, nu citind codul.

    ⚠ `debug_mode` E JUMATATEA CEALALTA. Fara el, DebugView-ul din GA4 nu arata
    nimic, oricat de aprins ar fi jurnalul din consola.
  */
  const laGtag: unknown[][] = [];
  const w = (globalThis as unknown as { window: Record<string, unknown> }).window;
  w.gtag = (...a: unknown[]) => { laGtag.push(a); };
  inregistreazaAdaptor(adaptorGa4);

  /* Cheia stinsa: nimic in plus, pe gazda de productie. */
  (w.location as { hostname: string }).hostname = "www.edinio.com";
  w.localStorage = { getItem: () => null };
  urmareste({ name: "page_view", page_location: "https://www.edinio.com/" });
  const faraCheie = laGtag[0][2] as Record<string, unknown>;
  assert.equal(faraCheie.debug_mode, undefined, "`debug_mode` pleaca la orice vizitator");

  /* Cheia aprinsa, ACEEASI gazda de productie: acum se vede. */
  w.localStorage = { getItem: (k: string) => (k === "edinio_marketing_debug" ? "1" : null) };
  urmareste({ name: "page_view", page_location: "https://www.edinio.com/" });
  const cuCheie = laGtag[1][2] as Record<string, unknown>;
  assert.equal(cuCheie.debug_mode, true, "cu cheia pusa, DebugView tot nu vede nimic pe productie");
});

/* ═══ 8. Vocabularul inchis al TikTok ═══ */

test("⚠ niciun eveniment nu trimite la TikTok un `content_type` inventat", () => {
  /*
    ═══ DEFECT GASIT IN CONSOLA PRODUCTIEI, 02.09.2026 ═══

    `landing_view` trimitea `content_type: ev.content_category`, adica „landing" si
    „pricing". TikTok raspundea in consola:

      [TikTok Pixel] - Invalid content type
      Content type must be either "product", "product_group", "destination",
      "hotel", "flight" or "vehicle".

    Nimic nu cadea. Evenimentul pleca, ei il primeau, si campul era gunoi — deci
    orice audienta construita pe el ar fi fost construita pe nimic.

    ⚠ PROBA CERE REGULA, NU CAZUL. N-are rost sa verific `landing_view`: peste o
    luna cineva adauga alt eveniment si pune acolo alt text liber. Aici trece TOATA
    taxonomia, si orice `content_type` din afara multimii inchise cade.
  */
  const INGADUITE = ["product", "product_group", "destination", "hotel", "flight", "vehicle"];

  const toate: EvenimentEdinio[] = [
    { name: "landing_view", content_name: "Homepage", content_category: "landing" },
    { name: "generate_lead", lead_type: "contact", form_name: "contact", event_id: "e1" },
    { name: "sign_up", signup_origin: "google", event_id: "e2" },
    { name: "begin_checkout", plan_id: "premium", billing_period: "monthly" },
    { name: "add_payment_info", plan_id: "premium", billing_period: "monthly" },
    { name: "trial_start", plan_id: "free", event_id: "e3" },
    { name: "purchase", plan_id: "ultra", billing_period: "annual", value: 999, currency: "RON", event_id: "e4" },
  ];

  let cuCartografiere = 0;
  for (const ev of toate) {
    const t = catreTikTok(ev);
    if (!t) continue;
    cuCartografiere++;
    const tip = t.date.content_type;
    if (tip !== undefined) {
      assert.ok(
        typeof tip === "string" && INGADUITE.includes(tip),
        `"${ev.name}" trimite content_type="${String(tip)}" — TikTok primeste doar: ${INGADUITE.join(", ")}`,
      );
    }
  }

  /* Martorul: lista chiar a trecut prin cartografiere, altfel proba n-a verificat nimic. */
  assert.ok(cuCartografiere >= 6, `doar ${cuCartografiere} evenimente au ajuns la TikTok — lista e gresita`);
});

test("`landing_view` duce spre TikTok un `content_id` stabil", () => {
  /*
    A doua plangere din aceeasi consola: „Missing 'content_id' parameter". Fara el,
    TikTok n-are pe ce lega audientele de retargetare — adica evenimentul pleaca si
    nu foloseste la nimic.

    ⚠ ID-UL E NUMELE PAGINII, nu un numar aleator: trebuie sa fie ACELASI maine,
    altfel audienta de azi nu se mai regaseste.
  */
  const t = catreTikTok({ name: "landing_view", content_name: "Homepage", content_category: "landing" });
  assert.equal(t?.date.content_id, "Homepage");
  assert.equal(t?.date.content_category, "landing", "categoria s-a pierdut cu totul");
});
