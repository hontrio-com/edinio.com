import { test } from "node:test";
import assert from "node:assert/strict";
import { depozitFals, serverFals } from "./fals-easysales";
import { adresaAbonarii, asiguraAbonarile, eAdresaMagazinului, jetonulAdresei, secretNou, stergeAbonarile } from "./abonari";
import { contractulLivrarilor, contulDin, cuiComparabil, depozitFaraScriere, stareaWebsiteului, testeazaConexiunea } from "./sanatate";
import { amprentaWebsiteToken, verificaForma, verificaMagazinul } from "./conectare";
import { canaleleNative, conflicteCanale } from "./exclusivitate";
import { SLUGURI_ABONATE, CALE_TOKEN } from "./constante";
import { hashJeton } from "./semnatura";
import type { ContextEasySales } from "./client";

const B = "44444444-4444-4444-8444-444444444444";
const ALT = "55555555-5555-4555-8555-555555555555";

function context(srv: ReturnType<typeof serverFals>, extra: Record<string, unknown> = {}): ContextEasySales {
  const dep = depozitFals({ [B]: {
    connected: true, client_id: srv.optiuni.clientId, client_secret: srv.optiuni.clientSecret,
    website_token: srv.optiuni.websiteToken, website_nume: srv.optiuni.websiteNume, token_versiune: 0, ...extra,
  } });
  return { dep, businessId: B, cfg: dep.configuri.get(B)! };
}

test("adresa abonarii: pe www, cu businessId si jeton; a ALTUI magazin nu e a noastra", () => {
  const delete_ = process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  const u = adresaAbonarii(B, "j1");
  assert.equal(u, `https://www.edinio.com/api/easysales/webhook?businessId=${B}&t=j1`);
  assert.equal(eAdresaMagazinului(u, B), true);
  assert.equal(eAdresaMagazinului(u, ALT), false);
  assert.equal(eAdresaMagazinului("https://www.edinio.com/api/aboutyou/webhook?businessId=" + B, B), false);
  assert.equal(eAdresaMagazinului("nu e adresa", B), false);
  if (delete_ !== undefined) process.env.NEXT_PUBLIC_APP_URL = delete_;
  assert.match(secretNou(), /^[A-Za-z0-9]{48}$/);
  assert.notEqual(secretNou(), secretNou());
  assert.equal(jetonulAdresei("s", B, 1), jetonulAdresei("s", B, 1), "derivat: acelasi la refacere");
  assert.notEqual(jetonulAdresei("s", B, 1), jetonulAdresei("s", B, 2), "rotirea il schimba");
  assert.notEqual(jetonulAdresei("s", B, 1), jetonulAdresei("s", ALT, 1));
});

test("abonarile: toate slugurile, cu secretul si hash-ul jetonului scrise INAINTE; a doua trecere nu mai creeaza", async () => {
  process.env.EASYSALES_API_URL = "https://easysales.fals";
  const srv = serverFals();
  const ctx = context(srv);
  const r = await srv.cuFetch(() => asiguraAbonarile(ctx));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(srv.stare.abonari.size, SLUGURI_ABONATE.length);
  const cfg = ctx.dep as ReturnType<typeof depozitFals>;
  const salvat = cfg.configuri.get(B)!;
  assert.match(salvat.webhook_secret ?? "", /^[A-Za-z0-9]{48}$/);
  const jeton = jetonulAdresei(salvat.webhook_secret!, B, 1);
  assert.equal(salvat.webhook_jeton_hash, hashJeton(jeton));
  for (const a of srv.stare.abonari.values()) {
    assert.equal(a.url, adresaAbonarii(B, jeton));
    assert.equal(a.secret, salvat.webhook_secret, "secretul a ajuns la ei sub numele trimis");
  }
  const posturi = srv.stare.cereri.filter((c) => c.metoda === "POST" && c.cale.startsWith("/api/v2/webhooks/")).length;
  const r2 = await srv.cuFetch(() => asiguraAbonarile(ctx));
  assert.ok(Object.values(r2.sluguri).every((s) => s?.rezultat === "exista"));
  assert.equal(srv.stare.cereri.filter((c) => c.metoda === "POST" && c.cale.startsWith("/api/v2/webhooks/")).length, posturi);
  delete process.env.EASYSALES_API_URL;
});

test("o abonare disparuta se reface O DATA; a doua disparitie in 7 zile inseamna ca o inlocuieste altcineva", async () => {
  process.env.EASYSALES_API_URL = "https://easysales.fals";
  const srv = serverFals();
  const ctx = context(srv);
  await srv.cuFetch(() => asiguraAbonarile(ctx));
  const idDisparut = Number(ctx.cfg.abonari!["order-updated"]);
  srv.stare.abonari.delete(idDisparut);
  const r1 = await srv.cuFetch(() => asiguraAbonarile(ctx));
  assert.equal(r1.sluguri["order-updated"]?.rezultat, "creata");
  srv.stare.abonari.delete(Number(ctx.cfg.abonari!["order-updated"]));
  const r2 = await srv.cuFetch(() => asiguraAbonarile(ctx));
  assert.equal(r2.sluguri["order-updated"]?.rezultat, "inlocuita_de_altul");
  delete process.env.EASYSALES_API_URL;
});

test("la deconectare se sterg NUMAI abonarile acestui magazin", async () => {
  process.env.EASYSALES_API_URL = "https://easysales.fals";
  const srv = serverFals();
  const ctx = context(srv);
  await srv.cuFetch(() => asiguraAbonarile(ctx));
  /* alt magazin Edinio de pe acelasi cont, si o alta integrare */
  srv.stare.abonari.set(900, { id: 900, slug: "order-updated", url: adresaAbonarii(ALT, "x"), secret: "y" });
  srv.stare.abonari.set(901, { id: 901, slug: "order-updated", url: "https://altcineva.ro/hook", secret: "z" });
  const r = await srv.cuFetch(() => stergeAbonarile(ctx));
  assert.equal(r.ramase, 0);
  assert.deepEqual([...srv.stare.abonari.keys()].sort(), [900, 901]);
  delete process.env.EASYSALES_API_URL;
});

test("⚠ „Testeaza conexiunea” nu emite token si nu scrie NIMIC, nici la un token revocat", async () => {
  process.env.EASYSALES_API_URL = "https://easysales.fals";
  const srv = serverFals();
  const dep = depozitFals({ [B]: {
    connected: true, client_id: srv.optiuni.clientId, client_secret: srv.optiuni.clientSecret,
    website_token: srv.optiuni.websiteToken, website_nume: srv.optiuni.websiteNume, access_token: "token-revocat",
  } });
  const ctx: ContextEasySales = { dep: depozitFaraScriere(dep), businessId: B, cfg: dep.configuri.get(B)! };
  const r = await srv.cuFetch(() => testeazaConexiunea(ctx, "RO123456"));
  assert.equal(r.token, "refuzat");
  assert.equal(srv.stare.cereri.filter((c) => c.cale === CALE_TOKEN).length, 0, "nicio emitere");
  assert.deepEqual(dep.scrieri, [], "nicio scriere de configurare");
  assert.deepEqual(dep.jurnal, [], "niciun rand de jurnal");
  delete process.env.EASYSALES_API_URL;
});

test("contul: CUI-ul comparat fara RO si fara spatii; trei forme de avertisment", () => {
  assert.equal(cuiComparabil(" ro 123456 "), "123456");
  assert.equal(cuiComparabil("RO12A"), null);
  assert.equal(contulDin({ vat_id: "RO123456" }, "123456").potrivire_cui, "da");
  assert.equal(contulDin({ vat_id: "RO123456" }, "RO654321").potrivire_cui, "nu");
  assert.equal(contulDin({ vat_id: "RO123456" }, null).potrivire_cui, "cui_lipsa");
  assert.equal(contulDin({}, "123456").potrivire_cui, "necunoscut");
  const c = contulDin({ has_active_subscription: true, is_trial: true, max_orders: "300", current_orders: 3 }, "1");
  assert.deepEqual([c.abonament_activ, c.proba, c.max_comenzi, c.comenzi_curente], [true, true, 300, 3]);
});

test("website-ul: numai numele nostru cu `status` exact „active” e activ", () => {
  assert.equal(stareaWebsiteului([{ name: "Edinio", status: "active" }], "Edinio"), "activ");
  assert.equal(stareaWebsiteului([{ name: "Edinio", status: "inactive" }], "Edinio"), "neconfirmat_activ");
  assert.equal(stareaWebsiteului([{ name: "Altul", status: "active" }], "Edinio"), "neconfirmat_activ");
  assert.equal(stareaWebsiteului(null, "Edinio"), "necunoscut");
});

test("contractul starilor de livrare: lista lor fata de enumul cablat", () => {
  const lor = ["Ready", "On Route", "Delayed", "Delivered", "Return", "Unknown", "Canceled"].map((d, i) => ({ description: d, value: i + 1 }));
  assert.deepEqual(contractulLivrarilor(lor), []);
  assert.equal(contractulLivrarilor(lor.slice(0, 6)).length, 1);
  assert.equal(contractulLivrarilor([...lor, { description: "Lost", value: 8 }]).length, 1);
});

test("conectarea: forma campurilor, moneda RON si o cota legala la platitori", () => {
  assert.match(verificaForma({ client_id: "", client_secret: "x", website_token: "y" }).eroare ?? "", /ID Client/);
  const bun = verificaForma({ client_id: "0f1e2d3c-aaaa-4bbb-8ccc-123456789abc", client_secret: "x".repeat(40), website_token: "y".repeat(60) });
  assert.deepEqual(bun, { eroare: null, avertismente: [] });
  assert.equal(verificaForma({ client_id: "scurt", client_secret: "x", website_token: "y" }).avertismente.length, 3);
  assert.equal(verificaMagazinul({ currency: "RON", vat_enabled: true, vat_rate: 21 }), null);
  assert.equal(verificaMagazinul({ currency: null, vat_enabled: false, vat_rate: 19 }), null, "neplatitor cu 19 ramas implicit");
  assert.match(verificaMagazinul({ currency: "EUR" }) ?? "", /RON/);
  assert.match(verificaMagazinul({ currency: "RON", vat_enabled: true, vat_rate: 19 }) ?? "", /nu e o cotă legală/);
  assert.equal(amprentaWebsiteToken(" abc "), amprentaWebsiteToken("abc"));
  assert.equal(amprentaWebsiteToken("abc").length, 32);
});

test("exclusivitatea canalelor: pe canal SI pe tara; Pepita pe pietele active", () => {
  const native = canaleleNative({
    emag_config: { connected: true, tara: "ro" },
    trendyol_config: { connected: true, storefront: "RO", cross_country_storefronts: ["BG"] },
    aboutyou_config: { connected: false },
    olx_config: { connected: true },
    pepita_config: { activ: true, piata: "ro", piete: { hu: { activa: true }, sk: { activa: false } } },
  });
  assert.deepEqual(native.map((n) => `${n.canal}:${n.tara}`).sort(), ["emag:ro", "olx:ro", "pepita:hu", "trendyol:bg", "trendyol:ro"]);
  assert.deepEqual(conflicteCanale([{ canal: "emag", tara: "hu" }], native), [], "eMAG HU nu e eMAG RO");
  assert.deepEqual(conflicteCanale([{ canal: "trendyol", tara: "BG" }], native), [{ canal: "trendyol", tara: "bg" }]);
  assert.deepEqual(conflicteCanale([{ canal: "altul", tara: "ro" }], native), []);
});
