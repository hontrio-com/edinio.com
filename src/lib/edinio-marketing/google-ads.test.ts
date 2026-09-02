import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { catreGoogleAds, adaptorGoogleAds } from "./adaptor-google-ads";
import { adaptorGa4 } from "./adaptor-ga4";
import { ID_GOOGLE_ADS, ETICHETE_CONVERSIE, trimiteCatre } from "./pixel-google-ads";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  GOOGLE ADS NUMARA ALTFEL DECAT CEILALTI TREI
  ═══════════════════════════════════════════════════════════════════════════════

  GA4, Meta si TikTok primesc un NUME de eveniment. Google Ads primeste mereu
  acelasi nume — `conversion` — si o ETICHETA care spune care actiune de conversie
  din contul lor e. Nu exista nume standard si nimic de dedus.

  De aceea probele de aici se uita la altceva: nu la cartografierea numelor, ci la
  ce nu pleaca, si la ce nu pleaca gresit.
*/

const ev = (o: Record<string, unknown>) => o as never;

test("⚠ un eveniment FARA eticheta nu pleaca deloc", () => {
  /*
    ⚠ CE APARA. Un cont de reclame numara conversii, nu comportament. Trimis
    acolo, `scroll_depth` ar fi devenit o actiune de conversie inexistenta — si nu
    cade cu eroare, se pierde tacut. Deci n-am fi aflat niciodata ca trimitem
    zgomot.
  */
  for (const nume of ["scroll_depth", "section_view", "faq_open", "page_view", "cta_click"]) {
    assert.equal(catreGoogleAds(ev({ name: nume })), null, `"${nume}" a plecat spre Google Ads`);
  }
});

test("cele trei conversii au eticheta, si adresa e intreaga", () => {
  for (const nume of ["sign_up", "trial_start", "purchase"]) {
    const p = catreGoogleAds(ev({ name: nume, event_id: "e1" }));
    assert.ok(p, `"${nume}" nu mai are eticheta`);
    assert.match(String(p.send_to), /^AW-\d+\/[A-Za-z0-9_-]+$/, `"${nume}": adresa nu are forma AW-.../eticheta`);
  }
});

test("⚠ etichetele sunt DEOSEBITE intre ele", () => {
  /*
    ⚠ CE APARA. Copiata de doua ori din interfata Google, aceeasi eticheta ar fi
    facut doua conversii deosebite sa se numere ca una singura — si raportul ar fi
    aratat cifre credibile, doar gresite.
  */
  const valori = Object.values(ETICHETE_CONVERSIE);
  assert.equal(new Set(valori).size, valori.length, "doua evenimente impart aceeasi eticheta");
  for (const v of valori) assert.match(v, /^[A-Za-z0-9_-]{10,}$/, `eticheta "${v}" nu are forma asteptata`);
  assert.match(ID_GOOGLE_ADS, /^AW-\d{8,}$/, "id-ul contului nu are forma AW- plus cifre");
});

test("⚠ `transaction_id` duce `event_id`-ul nostru", () => {
  /*
    ⚠ AICI STA DEDUPLICAREA LOR. Google numara o conversie o singura data pentru
    acelasi `transaction_id`. Fara el, o pagina reincarcata sau un buton apasat de
    doua ori ar fi aparut ca doua abonamente — si licitatia ar fi invatat pe cifre
    umflate.
  */
  const p = catreGoogleAds(ev({ name: "purchase", event_id: "cs_test_123", value: 99, currency: "RON" }));
  assert.ok(p);
  assert.equal(p.transaction_id, "cs_test_123");
});

test("⚠ valoarea pleaca NUMAI cu moneda ei", () => {
  /*
    ⚠ O cifra fara unitate devine „venit" in rapoartele lor, socotit in moneda
    contului — deci 99 de lei ar putea fi cititi ca 99 de euro. Aceeasi regula ca
    la Meta si TikTok, din acelasi motiv.
  */
  const cuAmandoua = catreGoogleAds(ev({ name: "purchase", event_id: "x", value: 99, currency: "RON" }));
  assert.deepEqual({ v: cuAmandoua?.value, m: cuAmandoua?.currency }, { v: 99, m: "RON" });

  const faraMoneda = catreGoogleAds(ev({ name: "purchase", event_id: "x", value: 99 }));
  assert.ok(faraMoneda, "conversia s-a pierdut cu totul, in loc sa plece fara suma");
  assert.ok(!("value" in faraMoneda), "suma a plecat fara moneda");

  const faraValoare = catreGoogleAds(ev({ name: "sign_up", event_id: "x" }));
  assert.ok(faraValoare && !("value" in faraValoare), "s-a inventat o valoare unde nu exista");
});

test("⚠ o eticheta necunoscuta nu se poate inventa", () => {
  assert.equal(trimiteCatre("un_eveniment_inexistent"), null);
  assert.equal(trimiteCatre(""), null);
});

/* ═══ Si legaturile cu restul sistemului ═══ */

const citeste = (p: string) => readFileSync(p, "utf8");

test("⚠ Google Ads e declarat ca furnizor in consimtamant", () => {
  /*
    ⚠ CE APARA, SI DE CE E MAI MULT DECAT O FORMALITATE. `FURNIZORI` intra in
    amprenta hotararii: cine a acceptat cand erau trei furnizori n-a stiut de al
    patrulea. Adaugat acolo, acordurile vechi se invalideaza singure si omul e
    intrebat din nou.

    Lasat pe dinafara, Google Ads ar fi pornit sub un acord dat pentru altceva.
  */
  const stare = citeste("src/lib/edinio-marketing/consimtamant/stare.ts");
  assert.match(stare, /FURNIZORI = \[[^\]]*"google-ads"/, "Google Ads nu e in lista de furnizori");

  /* Si ca panoul il NUMESTE, altfel omul bifeaza fara sa stie pe cine acopera. */
  assert.match(
    citeste("src/components/edinio-marketing/PanouConsimtamant.tsx"), /Google Ads/,
    "panoul de consimtamant nu-l numeste pe Google Ads",
  );
});

test("⚠ politica nu mai spune ca nu rulam Google Ads", () => {
  /*
    ⚠ Textul spunea, pana la aceasta livrare: „Edinio nu ruleaza Google Ads pe
    edinio.com". Adevarat dimineata, fals de acum. Un document si un cod se tin
    lipite doar printr-o proba care cade cand se despart.
  */
  const politica = citeste("src/lib/website/cookies.ts");
  assert.doesNotMatch(politica, /nu rulează Google Ads pe edinio\.com/,
    "politica sustine iar ca nu rulam Google Ads");
  assert.match(politica, /Edinio utilizează Google Ads/,
    "politica nu spune ca folosim Google Ads");
});

test("⚠ adaptorul e inregistrat pe magistrala", () => {
  const runtime = citeste("src/components/edinio-marketing/RuntimeMarketing.tsx");
  assert.match(runtime, /inregistreazaAdaptor\(adaptorGoogleAds\)/,
    "adaptorul exista dar nu e inregistrat — n-ar primi niciun eveniment");
});

test("⚠ `gata` NU se ia dupa `window.gtag`, care e al tuturor Google-urilor", () => {
  /*
    ⚠ CE APARA, si de ce nu se vede cu ochiul liber.

    GA4 si Google Ads folosesc aceeasi functie `gtag`. Amandoi raspundeau
    `gata: () => gtag() !== null` — deci indata ce eticheta GA4 punea `gtag` in
    pagina, adaptorul de RECLAME se credea si el gata. Numai ca `gtag('config',
    'AW-…')` nu rulase inca: conversia pleca fara cont in spate, si se pierdea
    tacut. Nimic nu cade, nimeni nu raspunde cu eroare.

    Aici se pune exact lumea aceea: `gtag` exista, steagul GA4 e ridicat, al
    reclamelor nu.
  */
  const g = globalThis as unknown as Record<string, unknown>;
  const inainte = g.window;
  try {
    g.window = { gtag: () => {}, __edinioGa4Pornit: true };
    assert.equal(adaptorGa4.gata(), true, "martorul: GA4 e chiar gata");
    assert.equal(adaptorGoogleAds.gata(), false, "reclamele se cred gata pe steagul altuia");

    (g.window as Record<string, unknown>).__edinioAdsPornit = true;
    assert.equal(adaptorGoogleAds.gata(), true, "cu `config` facut, tot nu se considera gata");
  } finally {
    if (inainte === undefined) delete g.window; else g.window = inainte;
  }
});
