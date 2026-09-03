import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { verdictulPlatii, conversiaDinPlata, type SesiuneStripe } from "./verdict-plata";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  O PLATA SE CREDE DE LA STRIPE, NU DE LA ADRESA DIN BARA
  ═══════════════════════════════════════════════════════════════════════════════
*/

const OM = "user-123";
const buna: SesiuneStripe = {
  id: "cs_test_abc",
  status: "complete",
  payment_status: "paid",
  amount_total: 24900,
  currency: "ron",
  client_reference_id: OM,
  metadata: { user_id: OM, plan: "pro", interval: "annual" },
};

test("⚠ o sesiune NEPLATITA nu produce nicio conversie", () => {
  /*
    ═══ ⚠ DEFECTUL PE CARE IL INCHIDE ═══

    Pagina socotea plata reusita din `?success=1` plus `sessionStorage`. Cine
    pornea o plata si o abandona avea deja amandoua: intrand apoi pe adresa aia,
    browserul trimitea `purchase` catre GA4, Google Ads, Meta si TikTok pentru bani
    care nu s-au incasat. Nu trebuia rea-vointa — un „inapoi" dupa o plata picata
    ajunge in acelasi loc.

    ⚠ SI DE CE E GRAV TOCMAI LA GOOGLE ADS: licitarea invata pe conversii. O
    conversie falsa nu e o cifra gresita intr-un raport, e bani cheltuiti aiurea de
    acolo inainte.
  */
  const cazuri: Array<[string, SesiuneStripe]> = [
    ["formularul nu s-a incheiat", { ...buna, status: "open" }],
    ["banii n-au plecat", { ...buna, payment_status: "unpaid" }],
    ["plata amanata", { ...buna, payment_status: "no_payment_required" }],
    ["suma zero", { ...buna, amount_total: 0 }],
    ["fara suma", { ...buna, amount_total: null }],
  ];
  for (const [de_ce, s] of cazuri) {
    const v = verdictulPlatii(s, OM);
    assert.equal(v.ok, false, `s-a raportat o conversie desi ${de_ce}`);
    if (!v.ok) assert.equal(v.motiv, "neplatita");
  }
});

test("⚠ sesiunea altcuiva nu e conversia mea", () => {
  /*
    ⚠ CE APARA. Id-ul sesiunii vine din adresa, deci il poate scrie oricine. Fara
    verificarea proprietarului, cineva ar putea raporta drept a lui o plata
    adevarata a altui om — si ar dubla conversia aceluia.
  */
  const v = verdictulPlatii(buna, "alt-user");
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.motiv, "alt-om");

  /*
    ═══ ⚠ RANDURILE ASTEA CEREAU PANA AZI EXACT PE DOS ═══

    Scriau ca „daca unul lipseste, celalalt tine" — adica probau un `||`, sub un
    comentariu de productie care spunea „se cer AMANDOUA". Comentariul avea
    dreptate, codul nu, iar proba apara codul.

    ⚠ CE STRICA `SAU`. O sesiune cu `client_reference_id` si `metadata.user_id`
    DEOSEBITE ar fi fost socotita „a mea" de amandoi oamenii — deci aceeasi plata
    numarata de doua ori. Nu exista azi o cale prin care sa se desparta, si tocmai
    de aceea despartirea trebuie sa cada zgomotos.
  */
  assert.equal(verdictulPlatii({ ...buna, client_reference_id: null }, OM).ok, false,
    "lipsa unui semn de proprietate a trecut");
  assert.equal(verdictulPlatii({ ...buna, metadata: { plan: "pro" } }, OM).ok, false,
    "lipsa celuilalt semn a trecut");

  /* ⚠ Si cazul care conteaza: cele doua semne arata catre oameni DEOSEBITI. */
  const despartita = { ...buna, client_reference_id: "user-A", metadata: { user_id: "user-B" } };
  assert.equal(verdictulPlatii(despartita, "user-A").ok, false, "o sesiune despartita a trecut pentru A");
  assert.equal(verdictulPlatii(despartita, "user-B").ok, false, "o sesiune despartita a trecut pentru B");
});

test("⚠ fara moneda nu se raporteaza nimic", () => {
  /*
    ⚠ CE APARA. `moneda` se turna „ron" cand Stripe tacea, iar apelantul verifica
    apoi `moneda === "RON"` si trecea — deci paza lui se sprijinea pe o presupunere
    a NOASTRA, nu pe un raspuns al lui Stripe. O sesiune platita are intotdeauna
    moneda; lipsa ei inseamna ca ceva e in neregula.
  */
  const v = verdictulPlatii({ ...buna, currency: null }, OM);
  assert.equal(v.ok, false, "o sesiune fara moneda a produs o conversie");
});

test("⚠ suma vine din INCASARE, nu din tabelul de preturi", () => {
  /*
    ⚠ CE APARA. Browserul isi calcula suma din `PLAN_PRICES`. Webhook-ul o ia din
    `amount_total`, si comentariul lui spune apasat ca asa trebuie. Cele doua ar fi
    raportat acelasi abonament cu doua sume la prima reducere sau la primul pret
    schimbat in Stripe si uitat in cod.
  */
  const v = verdictulPlatii({ ...buna, amount_total: 19900 }, OM);
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.equal(v.suma, 199, "suma nu s-a adus din subunitati in unitati intregi");
    assert.equal(v.moneda, "RON");
    assert.equal(v.sesiune, "cs_test_abc", "id-ul trimis nu e cel al sesiunii — perechea cu webhook-ul se rupe");
  }
});

test("⚠ un interval necunoscut nu se toarna in lunar", () => {
  /*
    Turnat „monthly", un abonament anual s-ar raporta lunar si nimic n-ar arata de
    ce. `null` il lasa pe apelant sa cada pe ce a ales omul.
  */
  assert.equal((verdictulPlatii({ ...buna, metadata: { user_id: OM } }, OM) as { interval: unknown }).interval, null);
  assert.equal((verdictulPlatii(buna, OM) as { interval: unknown }).interval, "annual");
});

test("⚠ si pagina CHIAR nu mai trimite fara confirmare", () => {
  /*
    ⚠ CUTITUL TAIE IN AMANDOUA PARTILE. Regulile de mai sus sunt ale unei functii
    pure; ce conteaza e ca `purchase` sa stea sub verdictul ei.
  */
  const cod = readFileSync("src/app/(onboarding)/onboarding/plan/page.tsx", "utf8");
  const iPurchase = cod.indexOf('name: "purchase"');
  assert.ok(iPurchase > 0, "pagina nu mai trage purchase");

  /*
    ═══════════════════════════════════════════════════════════════════════════
    ⚠ NU O FEREASTRA DE 900 DE CARACTERE, CI CHIAR CONDITIA CARE IL INCONJOARA
    ═══════════════════════════════════════════════════════════════════════════

    Forma dinainte taia `cod.slice(iPurchase - 900, iPurchase)` si cerea
    `if (plata.ok`. A cazut pe 03.09.2026 din DOUA motive, si niciunul nu era o
    schimbare de purtare:
      - conditia a crescut si s-a rupt pe mai multe randuri, deci sirul cerut nu
        se mai potrivea desi regula era mai stricta ca inainte;
      - comentariul de deasupra ei a crescut si el, impingand `if`-ul afara din
        fereastra.

    O fereastra de lungime fixa masoara distanta in caractere, nu structura. Aici
    se citeste chiar conditia care inchide `purchase`, oricat de lunga ar fi si
    oricat text ar sta deasupra.
  */
  /*
    ⚠ REGULA S-A MUTAT INTR-O FUNCTIE PURA, deci aici nu se mai citeste conditia.
    Randurile astea au cerut o vreme forma ei — si un mutant cu `|| true` a trecut
    verde, fiindca sirurile cerute erau tot acolo. Ce ramane de aparat aici e
    LEGATURA: `purchase` sta sub raspunsul functiei, si nimic nu-l ocoleste.
    Regula insasi e probata mai jos, chemand-o.
  */
  const i = cod.lastIndexOf("if (", iPurchase);
  assert.ok(i > 0, "`purchase` nu mai sta sub nicio conditie");
  assert.match(cod.slice(i, iPurchase), /conversia/,
    "`purchase` nu mai sta sub raspunsul lui `conversiaDinPlata`");
  assert.match(cod, /conversiaDinPlata\(plata\)/, "pagina nu mai cheama regula");
  assert.match(cod, /verificaPlataOnboarding\(/, "pagina nu mai confirma plata la server");
  assert.ok(!/\|\| plan|\?\? paidInterval/.test(cod),
    "s-a intors caderea pe ce a ales omul in browser");
});


test("⚠ daca Stripe nu stie planul sau intervalul, browserul NU inventeaza", () => {
  /*
    ════════════════════════════════════════════════════════════════════════
    ⚠ SI DE CE PROBA ASTA CHEAMA, IN LOC SA CITEASCA SURSA
    ════════════════════════════════════════════════════════════════════════

    Regula a stat o vreme intr-o conditie lunga dintr-o componenta React. Proba ei
    era o scanare a sursei, si cerea ca „monthly" si „annual" sa APARA in conditie.

    Mutantul `(... === "monthly" || ... === "annual" || true)` a trecut VERDE:
    sirurile erau tot acolo, iar poarta nu mai oprea nimic. De aia hotararea a fost
    scoasa intr-o functie pura — ca sa se poata cere REGULA, nu forma.

    ⚠ CE APARA. `plan_id` si `billing_period` sunt dimensiunile dupa care se
    citeste ce se vinde. Umplute din `sessionStorage`, un raport pe planuri arata ce
    si-au DORIT oamenii amestecat cu ce au CUMPARAT.
  */
  const bun = {
    ok: true as const, sesiune: "cs_1", plan: "pro",
    interval: "annual" as const, suma: 249, moneda: "RON",
  };

  const c = conversiaDinPlata(bun);
  assert.ok(c, "martorul: o plata intreaga chiar produce o conversie");
  assert.deepEqual(c, {
    plan_id: "pro", billing_period: "annual", value: 249, currency: "RON", event_id: "cs_1",
  });

  assert.equal(conversiaDinPlata({ ...bun, interval: null }), null,
    "interval necunoscut: conversia a plecat oricum, deci browserul l-ar fi inventat");
  assert.equal(conversiaDinPlata({ ...bun, plan: "" }), null,
    "plan necunoscut: conversia a plecat oricum");
  assert.equal(conversiaDinPlata({ ...bun, moneda: "EUR" }), null,
    "moneda straina a trecut drept lei");
  assert.equal(conversiaDinPlata({ ok: false, motiv: "indisponibil" }), null,
    "o plata neconfirmata a produs o conversie");
});
