import assert from "node:assert/strict";
import { before, beforeEach, describe, test } from "node:test";
import { corpEticheteiGoogle } from "./corp";

/*
 * SCRIPTUL ADEVARAT AL ETICHETEI SI COADA ADEVARATA DE EVENIMENTE, IN ACEEASI FEREASTRA (25.11.2026).
 *
 * ⚠ De ce exista. `corp.test.ts` ruleaza scriptul langa o coada falsa, iar `google-ads-runtime.test.ts` ruleaza
 * coada langa un script jucat de mana. Fiecare jumatate era probata fata de o DUBLURA a celeilalte, scrisa de
 * mana: la recenzie, patru mutari de randuri in script (starea de acord scrisa dupa golirea cozii, coada golita
 * inaintea lui `update`) treceau prin toate probele. Aici cele doua se intalnesc de-adevaratelea: evenimentul
 * pleaca din `gtagEvent`, asteapta in coada din `lib/marketing.ts` si ajunge in `dataLayer` numai cand si cum
 * il lasa scriptul.
 */

const SLUG = "casa-lumen";
const ADS = "AW-18567923104";
const GA = "G-LGF04ZMDCH";

type Fereastra = Record<string, unknown> & {
  dataLayer?: ArrayLike<unknown>[];
  gtag?: (...a: unknown[]) => void;
  __edinioQ?: unknown[];
  __edinioGoogleRaspuns?: (analiza: boolean, marketing: boolean) => void;
};

const stare: { stocat?: unknown } = {};
const w: Fereastra = {
  localStorage: { getItem: (cheie: string) => (cheie === `edinio_cc_${SLUG}` && stare.stocat !== undefined ? JSON.stringify(stare.stocat) : null) },
  location: { search: "", pathname: "/", origin: "https://magazin.test", href: "https://magazin.test/" },
  /* Biblioteca Google „soseste” pe loc: scriptul isi trimite `config`-ul de dinainte de acord abia la sosirea ei. */
  document: { referrer: "", createElement: () => ({}), head: { appendChild: (s: { onload?: () => void }) => { s.onload?.(); } } },
};

type Marketing = typeof import("@/lib/marketing");
let gtagEvent: Marketing["gtagEvent"];
let gtagRaw: Marketing["gtagRaw"];
let gtagDateleClientului: Marketing["gtagDateleClientului"];

before(async () => {
  /* Inaintea importului: `lib/marketing.ts` isi pune golitorul de coada pe `window` chiar cand e incarcat. */
  (globalThis as unknown as { window: unknown }).window = w;
  ({ gtagEvent, gtagRaw, gtagDateleClientului } = await import("@/lib/marketing"));
});

beforeEach(() => {
  for (const cheie of Object.keys(w)) {
    if (["dataLayer", "gtag", "__edinioAcordGoogle", "__edinioGoogleAds", "__edinioEtichetaGoogle", "__edinioGoogleRaspuns", "__edinioQ"].includes(cheie) || cheie.startsWith("ga-disable-")) delete w[cheie];
  }
  stare.stocat = undefined;
});

const ruleaza = (script: string) => { new Function("window", script)(w); };
/* Primele doua bucati ale fiecarei comenzi: felul ei si numele (sau ID-ul). */
const comenzi = () => (w.dataLayer ?? []).map((a) => Array.from(a)).map((c) => (c[0] === "js" ? ["js"] : c.slice(0, 2)));
const acord = (analytics: boolean, marketing: boolean) => ({ necessary: true, analytics, marketing, functional: false, v: 1, ts: 1 });
const corp = (p: Partial<Parameters<typeof corpEticheteiGoogle>[0]> = {}) => {
  const c = corpEticheteiGoogle({ tagIds: [ADS, GA], slug: SLUG, cuBanner: true, adsId: ADS, adsInainteDeAcord: true, ...p });
  assert.ok(c);
  return c.script;
};
const INAINTE_DE_ACORD = [["consent", "default"], ["set", "ads_data_redaction"], ["js"], ["config", ADS]];

describe("eticheta Google si coada de evenimente, impreuna", () => {
  test("⚠⚠ magazin cu reclame, prima vizita: evenimentul asteapta, iar la ACORD pleaca dupa `update` si dupa `config`", () => {
    ruleaza(corp());
    gtagEvent("view_item", { value: 10 });
    assert.deepEqual(comenzi(), INAINTE_DE_ACORD, "evenimentul a plecat inainte de acord");
    assert.equal(w.__edinioQ?.length, 1);
    w.__edinioGoogleRaspuns?.(true, true);
    assert.deepEqual(comenzi().slice(4), [["consent", "update"], ["config", GA], ["event", "view_item"]]);
    assert.equal(w.__edinioQ?.length, 0, "evenimentul a ramas in coada dupa acord");
    /* De aici evenimentele pleaca pe loc. */
    gtagEvent("add_to_cart", { value: 10 });
    assert.deepEqual(comenzi().slice(-1), [["event", "add_to_cart"]]);
  });

  test("⚠⚠ magazin cu reclame, prima vizita, REFUZ: fara Analytics si fara evenimente", () => {
    ruleaza(corp());
    gtagEvent("view_item", { value: 10 });
    w.__edinioGoogleRaspuns?.(false, false);
    assert.deepEqual(comenzi().slice(4), [["consent", "update"]], "la refuz a mai plecat ceva in afara de `update`");
    assert.equal(w.__edinioQ?.length, 1, "evenimentul a iesit din coada la un refuz");
  });

  test("⚠⚠ inainte de acord `window.gtag` nu exista: un apel direct, pe langa coada, nu are unde ajunge", () => {
    ruleaza(corp());
    assert.equal(w.gtag, undefined);
    /* Asa cheama un script strain (chatul cu integrarea lui de Analytics): direct, fara coada noastra. */
    (w as { gtag?: (...a: unknown[]) => void }).gtag?.("event", "tidio_widget_open", { visitor_id: "v1" });
    assert.deepEqual(comenzi(), INAINTE_DE_ACORD);
    /* Dupa acord functia apare, iar la retragere dispare din nou. */
    w.__edinioGoogleRaspuns?.(false, true);
    assert.equal(typeof w.gtag, "function");
    w.__edinioGoogleRaspuns?.(false, false);
    assert.equal(w.gtag, undefined);
  });

  test("magazin numai cu Analytics: omul accepta pe pagina, scriptul e rulat din nou si evenimentele pleaca la urma", () => {
    const s = corp({ tagIds: [GA], adsId: null });
    ruleaza(s);
    gtagEvent("view_item", { value: 10 });
    assert.deepEqual(comenzi(), []);
    stare.stocat = acord(true, false);
    ruleaza(s);
    assert.deepEqual(comenzi(), [["consent", "default"], ["consent", "update"], ["set", "ads_data_redaction"], ["js"], ["config", GA], ["event", "view_item"]]);
    assert.equal(w.__edinioQ?.length, 0);
  });

  test("⚠ a acceptat la o vizita de dinainte: evenimentele trase inaintea scriptului pleaca dupa `config`", () => {
    /* Nu se intampla in pagina trimisa de server (scriptul ruleaza primul), dar se intampla cand il porneste `GoogleTag`. */
    gtagEvent("view_item", { value: 10 });
    stare.stocat = acord(true, true);
    ruleaza(corp());
    assert.deepEqual(comenzi().slice(-3), [["config", ADS], ["config", GA], ["event", "view_item"]]);
  });

  test("⚠⚠ pagina de confirmare, cu acord numai pentru analiza: conversia pleaca, datele omului nu", () => {
    stare.stocat = acord(true, false);
    ruleaza(corp());
    gtagEvent("purchase", { transaction_id: "c1" });
    gtagDateleClientului({ sha256_email_address: "a".repeat(64) });
    gtagRaw("event", "conversion", { send_to: `${ADS}/abc` });
    assert.deepEqual(comenzi().slice(-2), [["event", "purchase"], ["event", "conversion"]]);
    assert.equal(comenzi().some((c) => c[0] === "set" && c[1] === "user_data"), false, "datele clientului au plecat fara acordul de marketing");
  });

  test("⚠ cu acordul de marketing, datele clientului pleaca INAINTEA conversiei", () => {
    ruleaza(corp());
    gtagEvent("purchase", { transaction_id: "c1" });
    gtagDateleClientului({ sha256_email_address: "a".repeat(64) });
    gtagRaw("event", "conversion", { send_to: `${ADS}/abc` });
    assert.deepEqual(comenzi(), INAINTE_DE_ACORD, "comanda a plecat de la cine n-a raspuns");
    w.__edinioGoogleRaspuns?.(false, true);
    assert.deepEqual(comenzi().slice(4), [["consent", "update"], ["config", GA], ["event", "purchase"], ["set", "user_data"], ["event", "conversion"]]);
  });

  test("⚠ retragerea acordului: evenimentele de dupa asteapta iar", () => {
    ruleaza(corp());
    w.__edinioGoogleRaspuns?.(true, true);
    const inainte = comenzi().length;
    w.__edinioGoogleRaspuns?.(false, false);
    gtagEvent("add_to_cart", { value: 1 });
    assert.deepEqual(comenzi().slice(inainte), [["consent", "update"]]);
    assert.equal(w.__edinioQ?.length, 1);
  });
});
