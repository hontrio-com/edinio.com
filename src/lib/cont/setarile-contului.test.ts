import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONT_STINS,
  ETICHETA_IMPLICITA,
  IMPLICIT,
  LIMITE,
  MESAJ_CONT_NECESAR,
  contulMagazinului,
  curataContClientConfig,
} from "./config";
import { adresaContului } from "./origine";

/*
 * Setarile conturilor (Setari > Conturi de client), butonul din antet si contul
 * OBLIGATORIU la comanda (hotararea proprietarului, 23.09.2026). Regulile care
 * tin de mai multe fisiere se apara PE SURSA, ca in `regulile-contului.test.ts`:
 * un al doilea drum scris maine ar ocoli o proba care masoara doar apelantul.
 */

const RAD = process.cwd();
const citeste = (p: string) => readFileSync(join(RAD, p), "utf8").replace(/\r\n/g, "\n");

/* ═══ Setarea, curatata la fiecare citire ═══ */

test("orice JSON din baza iese in forma cunoscuta", () => {
  /* Comerciantul isi poate scrie randul direct din browser (RLS), deci coloana poate tine orice. */
  for (const brut of [null, undefined, 7, "da", [], [{ enabled: true }]]) {
    assert.deepEqual(curataContClientConfig(brut), IMPLICIT);
  }
  const c = curataContClientConfig({
    enabled: "true",
    obligatoriu: true,
    buton_iconita: "craniu",
    buton_afisare: "neon",
    buget_email_zilnic: -5,
    buget_sms_zilnic: 999999,
    intrare_titlu: "x".repeat(500),
    strain: { a: 1 },
  });
  assert.equal(c.enabled, false, "sirul nu aprinde nimic, numai `true`");
  assert.equal(c.obligatoriu, false, "obligatoriu fara conturi pornite nu ramane scris");
  assert.equal(c.buton_iconita, IMPLICIT.buton_iconita);
  assert.equal(c.buton_afisare, IMPLICIT.buton_afisare);
  assert.equal(c.buget_email_zilnic, 0);
  assert.equal(c.buget_sms_zilnic, LIMITE.buget);
  assert.equal(c.intrare_titlu.length, LIMITE.intrare_titlu);
  assert.equal("strain" in c, false);
});

test("textul butonului: fara caractere de control, taiat la limita, implicit cand e gol", () => {
  const c = curataContClientConfig({ enabled: true, buton_text: "  Contul\n\tmeu  " + "z".repeat(40) });
  assert.equal(/[\n\t]/.test(c.buton_text), false);
  assert.ok(c.buton_text.length <= LIMITE.buton_text);
  assert.ok(c.buton_text.startsWith("Contul meu"));
  assert.equal(curataContClientConfig({ enabled: true, buton_text: "   " }).buton_text, ETICHETA_IMPLICITA);
});

test("curatarea e idempotenta, cu ordinea cheilor fixa", () => {
  /* Salvarea compara obiectul recitit cu cel trimis prin `JSON.stringify`. */
  const brut = { buton_text: "Cont", enabled: true, intrare_avantaje: false, obligatoriu: true, buget_email_zilnic: "80" };
  const o = curataContClientConfig(brut);
  assert.equal(JSON.stringify(curataContClientConfig(o)), JSON.stringify(o));
  assert.deepEqual(Object.keys(o), Object.keys(IMPLICIT));
  assert.equal(o.buget_email_zilnic, 80);
});

/* ═══ Ce afla vitrina, pe cerere ═══ */

const PORNIT = {
  enabled: true,
  obligatoriu: true,
  buton_antet: true,
  buton_afisare: "text",
  buton_iconita: "log-in",
  buton_text: "Intra",
};
const ACUM = Date.parse("2026-09-24T12:00:00Z");

test("zona de cont se stinge in afara domeniului propriu si cu conturile stinse", () => {
  assert.deepEqual(
    contulMagazinului({ config: PORNIT, peOrigineaMagazinului: false, suspendatPana: null, acum: ACUM }),
    CONT_STINS,
  );
  assert.deepEqual(
    contulMagazinului({ config: { ...PORNIT, enabled: false }, peOrigineaMagazinului: true, suspendatPana: null, acum: ACUM }),
    CONT_STINS,
  );
  assert.deepEqual(
    contulMagazinului({ config: PORNIT, peOrigineaMagazinului: true, suspendatPana: null, acum: ACUM }),
    { aprins: true, obligatoriu: true, buton: { afisare: "text", iconita: "log-in", eticheta: "Intra" } },
  );
});

test("⚠⚠ `suspended_until` e termen de GRATIE: magazinul vinde pana atunci si se opreste dupa", () => {
  /* Prima scriere citea invers: butonul disparea in zilele de gratie si aparea dupa oprire. */
  const inGratie = contulMagazinului({ config: PORNIT, peOrigineaMagazinului: true, suspendatPana: "2026-10-01T00:00:00Z", acum: ACUM });
  assert.equal(inGratie.aprins, true);
  const oprit = contulMagazinului({ config: PORNIT, peOrigineaMagazinului: true, suspendatPana: "2026-09-20T00:00:00Z", acum: ACUM });
  assert.deepEqual(oprit, CONT_STINS);
  /* Aceeasi citire ca la `/cos`, unde e scrisa de mana. */
  assert.ok(citeste("src/app/(public)/[slug]/cos/page.tsx").includes("new Date(business.suspended_until) < new Date()"));
});

test("butonul ascuns din Setari nu stinge zona de cont si nici obligativitatea", () => {
  const c = contulMagazinului({ config: { ...PORNIT, buton_antet: false }, peOrigineaMagazinului: true, suspendatPana: null, acum: ACUM });
  assert.equal(c.aprins, true);
  assert.equal(c.buton, null);
  assert.equal(c.obligatoriu, true);
});

/* ═══ Emailul de confirmare ═══ */

test("emailul primeste adresa contului numai unde `/cont` exista", () => {
  const sanatos = { custom_domain: "magazin.ro", custom_domain_healthy: true };
  assert.equal(adresaContului({ enabled: true }, sanatos), "https://magazin.ro/cont");
  /* Nemasurat inca: aceeasi regula ca in Setari, unde comutatorul se deschide. */
  assert.equal(adresaContului({ enabled: true }, { ...sanatos, custom_domain_healthy: null }), "https://magazin.ro/cont");
  assert.equal(adresaContului({ enabled: true }, { ...sanatos, custom_domain_healthy: false }), undefined);
  assert.equal(adresaContului({ enabled: true }, { custom_domain: null, custom_domain_healthy: null }), undefined);
  assert.equal(adresaContului({ enabled: "true" }, sanatos), undefined);
  assert.equal(adresaContului(null, sanatos), undefined);
  assert.equal(adresaContului({ enabled: true }, null), undefined);
});

/* ═══ Contul obligatoriu la comanda ═══ */

function corpulFunctiei(sursa: string, antet: string): string {
  const i = sursa.indexOf(antet);
  assert.ok(i >= 0, `nu am gasit ${antet}`);
  const j = sursa.indexOf("\nexport async function ", i + antet.length);
  return sursa.slice(i, j < 0 ? undefined : j);
}

test("⚠⚠ poarta contului sta inaintea ORICAREI scrieri, in ambele actiuni de comanda", () => {
  /*
    Pusa dupa, o comanda refuzata ar fi lasat cupon si stoc blocate si gauri in
    numerotare. Iar pusa numai in formular s-ar fi ocolit: actiunile sunt
    endpointuri publice.
  */
  const s = citeste("src/lib/actions/order.actions.ts");
  for (const antet of ["export async function placeOrder(", "export async function placeCartOrder("]) {
    const corp = corpulFunctiei(s, antet);
    const poarta = corp.indexOf("await poartaContuluiLaComanda(");
    assert.ok(poarta > 0, `${antet}: fara poarta`);
    const scrieri = ["buildOrderNumber(", 'rpc("claim_discount_use"', "revendicaStocul(", ".insert(", ".upsert(", ".update(", ".rpc("];
    let vazute = 0;
    for (const scriere of scrieri) {
      const k = corp.indexOf(scriere);
      if (k < 0) continue;
      vazute++;
      assert.ok(poarta < k, `${antet}: ${scriere} sta inaintea portii`);
    }
    assert.ok(vazute >= 4, `${antet}: prea putine scrieri gasite, proba nu masoara nimic`);
    assert.ok(corp.includes("contNecesar: poartaCont.contNecesar"), `${antet}: refuzul nu spune formularului ca lipseste contul`);

    const insert = corp.indexOf('admin.from("orders").insert(');
    const legare = corp.indexOf("await leagaComandaPlasata(");
    assert.ok(insert > 0 && legare > insert, `${antet}: comanda se leaga de cont DUPA insert`);
  }
});

test("⚠ formularele opresc trimiterea INAINTEA pixelilor cand pasul de intrare e deschis", () => {
  for (const p of ["src/components/storefront/sections/checkout/checkout-core.ts", "src/components/ministore/OrderModal.tsx"]) {
    const s = citeste(p);
    const opreste = s.indexOf("contLaComanda.necesar && (await contLaComanda.maiECerut())");
    const pixel = s.indexOf('fbTrack("AddPaymentInfo"');
    const server = Math.max(s.indexOf("await placeCartOrder(payload)"), s.indexOf("await placeOrder(payload)"));
    assert.ok(opreste > 0, `${p}: pasul deschis nu opreste trimiterea`);
    assert.ok(pixel > opreste && server > opreste, `${p}: pixelii sau serverul pleaca inaintea pasului`);
    assert.ok(s.includes("contLaComanda.ceruDeServer()"), `${p}: refuzul serverului nu aprinde pasul`);
  }
});

test("⚠ pasul de intrare se deseneaza IN AFARA formularului comenzii", () => {
  /* Un <form> in alt <form> nu e HTML valid: Enter in campul de cod ar fi trimis comanda. */
  const cazuri: [string, string][] = [
    ["src/components/storefront/sections/checkout/CheckoutForm.tsx", "<form onSubmit={preview"],
    ["src/components/ministore/OrderModal.tsx", "<form onSubmit={handleSubmit}"],
  ];
  for (const [p, formular] of cazuri) {
    const s = citeste(p);
    const pas = s.indexOf("<IntrareLaComanda");
    assert.ok(pas > 0, `${p}: lipseste pasul`);
    assert.ok(s.indexOf(formular) > pas, `${p}: pasul sta dupa inceputul formularului`);
    const inainte = s.slice(0, pas);
    assert.ok(inainte.lastIndexOf("<form ") <= inainte.lastIndexOf("</form>"), `${p}: pasul e intr-un <form>`);
  }
});

test("starea pentru formular vine din ACEEASI poarta, fara jurnal si fara cache", () => {
  const s = citeste("src/app/api/cont/stare/route.ts");
  assert.ok(s.includes("poartaContuluiLaComanda("), "a doua copie a regulii ar fi cerut intrarea unde serverul primeste comanda");
  assert.ok(s.includes("jurnal: false"));
  assert.ok(s.includes("private, no-store"));
  assert.equal(/export async function (POST|PUT|PATCH|DELETE)/.test(s), false, "ruta de stare nu scrie nimic");
});

test("mesajul refuzului are o singura sursa", () => {
  for (const p of [
    "src/lib/cont/poarta-comenzii.ts",
    "src/components/storefront/sections/checkout/checkout-core.ts",
    "src/components/ministore/OrderModal.tsx",
  ]) {
    assert.equal(citeste(p).includes(MESAJ_CONT_NECESAR), false, `${p} scrie mesajul de mana`);
    assert.ok(citeste(p).includes("MESAJ_CONT_NECESAR"), `${p} nu foloseste mesajul comun`);
  }
});

test("⚠⚠ cont obligatoriu fara domeniu propriu: comanda merge ca vizitator, nu se opreste", () => {
  /*
    Deconectarea domeniului lasa setarea pe „obligatoriu", iar vitrina merge atunci
    pe www.edinio.com, unde formularul nu arata niciun pas de intrare. Un refuz
    acolo ar fi oprit TOATE vanzarile magazinului.
  */
  const s = citeste("src/lib/cont/poarta-comenzii.ts");
  assert.ok(s.includes("if (!domeniu || biz?.custom_domain_healthy === false) {"));
  /* Contul optional, fara cookie de cont: iese inainte de orice cerere. */
  const scurt = s.indexOf("if (!cfg.obligatoriu && !(await cookies()).get(COOKIE_CONT)?.value) {");
  assert.ok(scurt > 0 && scurt < s.indexOf("createAdminClient()"), "contul optional face o cerere in plus pe fiecare comanda");
});

test("⚠⚠ antetul vitrinei nu devine 404 la toate magazinele daca pica citirea", () => {
  /* O coloana ceruta si inca inexistenta rupe TOATA interogarea. */
  const s = citeste("src/lib/storefront/antet-magazin.ts");
  assert.ok(s.includes("if (!error) return data;"), "eroarea citirii se inghite din nou");
  const rezerva = s.slice(s.indexOf("const { data: rezerva }"));
  assert.ok(rezerva.length > 0 && !rezerva.slice(0, 700).includes("cont_client_config"), "citirea de rezerva cere tot coloana conturilor");
});
