import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { verdictulPlatii, type SesiuneStripe } from "./verdict-plata";

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

  /* ⚠ Si se cer AMANDOUA semnele: daca unul lipseste, celalalt tine. */
  assert.equal(verdictulPlatii({ ...buna, client_reference_id: null }, OM).ok, true);
  assert.equal(verdictulPlatii({ ...buna, metadata: { plan: "pro" } }, OM).ok, true);
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

  const inainte = cod.slice(Math.max(0, iPurchase - 900), iPurchase);
  assert.match(inainte, /if \(plata\.ok/, "`purchase` nu mai sta sub verdictul platii");
  assert.match(inainte, /verificaPlataOnboarding\(/, "pagina nu mai confirma plata la server");
});
