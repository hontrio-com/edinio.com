import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { curataLivrarea, jetonulWebsiteuluiSePotriveste, primesteLivrarea, type DepsPrimire, type RandInbox } from "./webhook";
import { hashJeton, livrareaDovedesteFormula, subsirulValorii, verificaSemnatura } from "./semnatura";
import type { EasySalesConfig } from "./tipuri";

const B = "33333333-3333-4333-8333-333333333333";
const SECRET = "s".repeat(48);
const JETON = "jeton-de-proba";

/** Corpul brut, scris ca de PHP: `\/` si `\uXXXX`, fara spatii. */
const CORP_COMANDA = '{"payload":{"order":{"id":"1000000001","internal_id":5,"order_display_id":"1000000001","status":"New","customer":{"name":"Ion Popescu","phone":"0712345678","email":"ion@example.com"},"billing_address":{"street":"Str. Florilor 1"},"shipping_address":{"street":"Str. Florilor 1"},"products":[{"sku":"FD-3002","name":"Co\\u0219"}],"url":"https:\\/\\/x.ro"}},"webhook":{"id":2,"slug":"order-updated"}}';

/** Forma curatata, cat citesc probele din ea. */
type Curat = { payload: { order?: unknown; website?: { token_ok?: boolean } } };

function hmac(cheie: string, date: string): string {
  return createHmac("sha256", cheie).update(date, "utf8").digest("hex");
}

function deps(cfg: EasySalesConfig | null, opt: { citireaCade?: boolean; inboxCade?: boolean } = {}) {
  const inbox: RandInbox[] = [];
  const petice: Partial<EasySalesConfig>[] = [];
  const alarme: string[] = [];
  const programate: string[] = [];
  const d: DepsPrimire = {
    async citesteConfig() { if (opt.citireaCade) throw new Error("baza"); return cfg; },
    async scrieInbox(r) { if (opt.inboxCade) return null; inbox.push(r); return `rand-${inbox.length}`; },
    async peticConfig(_b, p) { petice.push(p); return true; },
    async poateSemnala() { return true; },
    async alarma(p) { alarme.push(p.mesaj); },
    dupaRaspuns(_b, id) { programate.push(id); },
  };
  return { d, inbox, petice, alarme, programate };
}

const CFG: EasySalesConfig = { connected: true, webhook_jeton_hash: hashJeton(JETON), webhook_secret: SECRET, website_token: "wt-al-nostru" };

test("curatarea pe lista alba: niciun client, nicio adresa, niciun nume; SKU-urile raman", () => {
  const { slug, curat } = curataLivrarea(JSON.parse(CORP_COMANDA));
  assert.equal(slug, "order-updated");
  const text = JSON.stringify(curat);
  for (const interzis of ["Ion Popescu", "0712345678", "ion@example.com", "Florilor", "customer", "billing_address", "shipping_address"]) {
    assert.ok(!text.includes(interzis), `a scapat ${interzis}`);
  }
  assert.deepEqual((curat as unknown as Curat).payload.order, { internal_id: 5, id: "1000000001", order_display_id: "1000000001", status: "New", skus: ["FD-3002"] });
});

test("reimprospatarile: `website.token` NU intra in inbox, numai verdictul comparatiei", () => {
  const corp = { payload: { website: { name: "Edinio", url: "https://x.ro", token: "wt-al-nostru" } }, webhook: { slug: "stock-refresh-requested" } };
  const bun = curataLivrarea(corp, "wt-al-nostru").curat as unknown as Curat;
  assert.equal(bun.payload.website?.token_ok, true);
  assert.ok(!JSON.stringify(bun).includes("wt-al-nostru"));
  const strain = curataLivrarea(corp, "alt-token").curat as unknown as Curat;
  assert.equal(strain.payload.website?.token_ok, false);
  assert.equal(jetonulWebsiteuluiSePotriveste("x", null), false);
  assert.equal(jetonulWebsiteuluiSePotriveste(undefined, "x"), false);
});

test("semnatura: corpul brut sau subsirul `payload`; cheia goala inseamna „secret nepreluat”, nu semnatura buna", () => {
  assert.deepEqual(verificaSemnatura(CORP_COMANDA, hmac(SECRET, CORP_COMANDA), SECRET), { varianta: "corp", potrivita: true });
  const p = subsirulValorii(CORP_COMANDA, "payload")!;
  assert.ok(p.startsWith('{"order":') && p.endsWith("}}"));
  assert.deepEqual(verificaSemnatura(CORP_COMANDA, hmac(SECRET, p), SECRET), { varianta: "payload", potrivita: true });
  assert.deepEqual(verificaSemnatura(CORP_COMANDA, hmac("", CORP_COMANDA), SECRET), { varianta: "cheie_goala", potrivita: false });
  assert.deepEqual(verificaSemnatura(CORP_COMANDA, null, SECRET), { varianta: "lipsa", potrivita: false });
  assert.deepEqual(verificaSemnatura(CORP_COMANDA, "ab".repeat(32), SECRET), { varianta: "nepotrivita", potrivita: false });
  /* ⚠ o reserializare JavaScript NU potriveste: PHP scrie `\/` si `ș` */
  const reserializat = JSON.stringify(JSON.parse(CORP_COMANDA));
  assert.notEqual(reserializat, CORP_COMANDA);
  assert.equal(verificaSemnatura(CORP_COMANDA, hmac(SECRET, reserializat), SECRET).potrivita, false);
  assert.equal(livrareaDovedesteFormula(CORP_COMANDA), true);
  assert.equal(livrareaDovedesteFormula('{"a":1}'), false);
});

test("subsirul valorii nu se pierde in siruri cu acolade si ghilimele scapate", () => {
  const corp = '{"webhook":{"slug":"x"},"payload":{"t":"a \\"}\\" b","n":[1,{"k":"}"}]}}';
  assert.equal(subsirulValorii(corp, "payload"), '{"t":"a \\"}\\" b","n":[1,{"k":"}"}]}');
  assert.equal(subsirulValorii(corp, "lipsa"), null);
  assert.equal(subsirulValorii("[1,2]", "payload"), null);
});

test("raspunsurile: magazin invalid 200, citire cazuta 503, jeton gresit 200, inbox cazut 503", async () => {
  assert.deepEqual(await primesteLivrarea(deps(CFG).d, { businessId: "nu-e-uuid", jeton: JETON, corpBrut: "{}", antetSemnatura: null }), { status: 200, urma: "magazin_invalid" });
  assert.deepEqual(await primesteLivrarea(deps(null).d, { businessId: B, jeton: JETON, corpBrut: "{}", antetSemnatura: null }), { status: 200, urma: "magazin_invalid" });
  assert.deepEqual(await primesteLivrarea(deps(CFG, { citireaCade: true }).d, { businessId: B, jeton: JETON, corpBrut: "{}", antetSemnatura: null }), { status: 503, urma: "config_cazuta" });
  const gresit = deps(CFG);
  assert.deepEqual(await primesteLivrarea(gresit.d, { businessId: B, jeton: "alt-jeton", corpBrut: CORP_COMANDA, antetSemnatura: null }), { status: 200, urma: "jeton_gresit" });
  assert.equal(gresit.inbox.length, 0, "fara rand la jeton gresit");
  assert.equal(gresit.alarme.length, 1);
  assert.deepEqual(await primesteLivrarea(deps(CFG, { inboxCade: true }).d, { businessId: B, jeton: JETON, corpBrut: CORP_COMANDA, antetSemnatura: hmac(SECRET, CORP_COMANDA) }), { status: 503, urma: "inbox_cazut" });
});

test("modul `masoara`: o livrare buna se scrie, se programeaza si, dovedind formula, trece in `impune`", async () => {
  const x = deps({ ...CFG, semnatura_mod: "masoara" });
  const r = await primesteLivrarea(x.d, { businessId: B, jeton: JETON, corpBrut: CORP_COMANDA, antetSemnatura: hmac(SECRET, CORP_COMANDA) });
  assert.deepEqual(r, { status: 200, urma: "scris" });
  assert.equal(x.inbox[0].semnatura_ok, true);
  assert.equal(x.inbox[0].semnatura_varianta, "corp");
  assert.deepEqual(x.programate, ["rand-1"]);
  const p = Object.assign({}, ...x.petice) as Partial<EasySalesConfig>;
  assert.equal(p.semnatura_varianta, "corp");
  assert.equal(p.semnatura_mod, "impune", "corpul are \\/ si \\u: potrivirea nu poate fi intamplatoare");
});

test("modul `masoara`: semnatura nepotrivita tot se prelucreaza (duce doar la o recitire), dar cu alarma", async () => {
  const x = deps({ ...CFG, semnatura_mod: "masoara" });
  const r = await primesteLivrarea(x.d, { businessId: B, jeton: JETON, corpBrut: CORP_COMANDA, antetSemnatura: "ab".repeat(32) });
  assert.equal(r.urma, "scris");
  assert.equal(x.inbox[0].semnatura_ok, false);
  assert.equal(x.programate.length, 1);
  assert.equal(x.alarme.length, 1);
});

test("modul `impune`: semnatura nepotrivita se PASTREAZA, nu se prelucreaza, raspunsul ramane 200", async () => {
  const x = deps({ ...CFG, semnatura_mod: "impune", semnatura_varianta: "corp" });
  const r = await primesteLivrarea(x.d, { businessId: B, jeton: JETON, corpBrut: CORP_COMANDA, antetSemnatura: hmac("", CORP_COMANDA) });
  assert.deepEqual(r, { status: 200, urma: "oprit_impune" });
  assert.equal(x.inbox.length, 1);
  assert.equal(x.inbox[0].motiv, "oprita_impune");
  assert.equal(x.programate.length, 0);
  assert.match(x.alarme[0], /secretul n-a fost preluat/);
});

test("un corp care nu e JSON nu se arunca: rand fara corp, cu motivul, si alarma", async () => {
  const x = deps(CFG);
  const r = await primesteLivrarea(x.d, { businessId: B, jeton: JETON, corpBrut: "nu e json", antetSemnatura: null });
  assert.equal(r.urma, "scris");
  assert.equal(x.inbox[0].corp, null);
  assert.equal(x.inbox[0].motiv, "corp_necitibil");
  assert.equal(x.programate.length, 0);
  assert.ok(x.alarme.some((a) => /nu e JSON/.test(a)));
});
