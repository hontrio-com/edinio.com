import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import {
  CONSENT_ALL, CONSENT_NONE, CONSENT_VERSION, acordaFunctional, bannerDecis, readConsent, writeConsent,
  type ConsentCategory,
} from "@/lib/cookie-consent";

/*
 * CINE N-A FOST INTREBAT NU A REFUZAT (25.11.2026).
 *
 * Google Ads a devenit categoria „Marketing” a bannerului. Pana atunci, un magazin care avea numai Google Ads
 * arata bannerul fara alegeri, cu un singur buton, „Am inteles”, care scrie un refuz intreg; unul cu Analytics si
 * Google Ads arata numai „Analiza”. Vizitatorii lor au un `marketing: false` scris fara sa fi fost intrebati
 * vreodata de marketing. Bannerul, socotindu-i raspunsi, nu i-ar mai fi intrebat niciodata, deci magazinul n-ar
 * fi primit nicio conversie cu acord de la clientii lui vechi.
 *
 * Probele ruleaza `bannerDecis` pe un „browser” fals (o stocare), cu raspunsuri vechi si noi.
 */

const g = globalThis as unknown as Record<string, unknown>;
const MAGAZIN = "magazin";
const CHEIE = `edinio_cc_${MAGAZIN}`;

function stocare() {
  const m = new Map<string, string>();
  return {
    getItem: (c: string) => m.get(c) ?? null,
    setItem: (c: string, v: string) => { m.set(c, v); },
    removeItem: (c: string) => { m.delete(c); },
  };
}
let depozit: ReturnType<typeof stocare>;

beforeEach(() => {
  g.window = globalThis;
  depozit = stocare();
  g.localStorage = depozit;
  g.dispatchEvent = () => true;
  if (typeof g.CustomEvent !== "function") {
    g.CustomEvent = class { type: string; detail: unknown; constructor(type: string, init?: { detail?: unknown }) { this.type = type; this.detail = init?.detail; } };
  }
});

/** Un raspuns scris INAINTE de 25.11.2026: fara lista categoriilor aratate. */
const vechi = (analytics: boolean, marketing: boolean, peste: Record<string, unknown> = {}) => {
  depozit.setItem(CHEIE, JSON.stringify({ necessary: true, analytics, marketing, functional: false, v: CONSENT_VERSION, ts: 1, ...peste }));
};
const scris = () => JSON.parse(depozit.getItem(CHEIE) ?? "null") as Record<string, unknown> | null;

/* Ce arata bannerul acum, in cele trei feluri de magazin. */
const DOAR_ADS = { categorii: ["marketing"] as ConsentCategory[], marketingDoarGoogleAds: true };
const ADS_SI_ANALYTICS = { categorii: ["analytics", "marketing"] as ConsentCategory[], marketingDoarGoogleAds: true };
const ADS_SI_FACEBOOK = { categorii: ["analytics", "marketing"] as ConsentCategory[], marketingDoarGoogleAds: false };

describe("raspunsul vechi, de dinainte ca Google Ads sa fie „Marketing”", () => {
  test("⚠⚠ „Am inteles” dintr-un magazin numai cu Google Ads: omul e intrebat, o data", () => {
    /* Butonul bannerului fara alegeri scria un refuz intreg. */
    vechi(false, false);
    assert.equal(bannerDecis(MAGAZIN), true, "fara sa stie ce arata bannerul, intrebarea ramane cea veche");
    assert.equal(bannerDecis(MAGAZIN, DOAR_ADS), false, "omul n-a fost intrebat niciodata de marketing si nici nu mai e");
    /* Raspunde acum, la bannerul care arata „Marketing”: de aici nu mai e intrebat, orice ar fi raspuns. */
    writeConsent(MAGAZIN, CONSENT_NONE, DOAR_ADS.categorii);
    assert.equal(bannerDecis(MAGAZIN, DOAR_ADS), true, "omul a refuzat ce i s-a aratat si e intrebat din nou");
    assert.deepEqual(scris()?.oferite, ["marketing"]);
  });

  test("⚠⚠ magazin cu Analytics si Google Ads: cine a raspuns cand se arata numai „Analiza” e intrebat de marketing", () => {
    for (const analiza of [true, false]) {
      vechi(analiza, false);
      assert.equal(bannerDecis(MAGAZIN, ADS_SI_ANALYTICS), false, `analiza: ${analiza}`);
      /* Pana raspunde, alegerea lui de dinainte ramane in picioare. */
      assert.equal(readConsent(MAGAZIN)?.analytics, analiza);
      assert.equal(readConsent(MAGAZIN)?.marketing, false);
    }
  });

  test("⚠ cine are marketingul ACORDAT nu mai e intrebat de nimic", () => {
    vechi(true, true);
    assert.equal(bannerDecis(MAGAZIN, ADS_SI_ANALYTICS), true);
    vechi(false, true);
    assert.equal(bannerDecis(MAGAZIN, ADS_SI_ANALYTICS), true);
  });

  test("⚠⚠ magazinul care avea si Facebook sau TikTok: marketingul i-a fost aratat, deci refuzul lui ramane refuz", () => {
    /* A intreba din nou pe cine a refuzat ce i s-a aratat e pisalogeala, nu consimtamant. */
    vechi(false, false);
    assert.equal(bannerDecis(MAGAZIN, ADS_SI_FACEBOOK), true);
    vechi(true, false);
    assert.equal(bannerDecis(MAGAZIN, ADS_SI_FACEBOOK), true);
    /* La fel cand nu se spune de unde vine marketingul. */
    assert.equal(bannerDecis(MAGAZIN, { categorii: ["analytics", "marketing"] }), true);
  });

  test("un raspuns vechi nu redeschide bannerul pentru analiza: nu stim ce i s-a aratat", () => {
    vechi(false, true);
    assert.equal(bannerDecis(MAGAZIN, ADS_SI_ANALYTICS), true);
    vechi(false, false);
    assert.equal(bannerDecis(MAGAZIN, { categorii: ["analytics"] }), true);
  });

  test("magazinul fara marketing in banner nu intreaba pe nimeni din nou", () => {
    vechi(false, false);
    assert.equal(bannerDecis(MAGAZIN, { categorii: ["analytics"], marketingDoarGoogleAds: true }), true);
    assert.equal(bannerDecis(MAGAZIN, { categorii: [], marketingDoarGoogleAds: true }), true);
  });
});

describe("raspunsul nou, scris cu lista categoriilor aratate", () => {
  test("⚠ bannerul scrie lista categoriilor aratate, o copie a ei", () => {
    const aratate: ConsentCategory[] = ["analytics", "marketing"];
    writeConsent(MAGAZIN, CONSENT_ALL, aratate);
    aratate.push("functional");
    assert.deepEqual(scris()?.oferite, ["analytics", "marketing"]);
    /* Fara lista (apelurile vechi) raspunsul se scrie ca inainte. */
    writeConsent(MAGAZIN, CONSENT_ALL);
    assert.equal("oferite" in (scris() ?? {}), false);
  });

  test("⚠⚠ o categorie aparuta DUPA raspuns se intreaba o data; una care era pe lista, niciodata", () => {
    /* Magazinul avea numai Analytics; omul a refuzat. Apoi comerciantul isi pune Google Ads. */
    writeConsent(MAGAZIN, CONSENT_NONE, ["analytics"]);
    assert.equal(bannerDecis(MAGAZIN, { categorii: ["analytics"] }), true, "refuzul a ce i s-a aratat nu se mai intreaba");
    assert.equal(bannerDecis(MAGAZIN, ADS_SI_ANALYTICS), false, "marketingul nu era pe lista: n-a fost refuzat, n-a fost intrebat");
    assert.equal(bannerDecis(MAGAZIN, ADS_SI_FACEBOOK), false, "la un raspuns nou lista hotaraste, nu felul magazinului");
    /* Raspunde din nou, cu amandoua pe lista. */
    writeConsent(MAGAZIN, CONSENT_NONE, ["analytics", "marketing"]);
    assert.equal(bannerDecis(MAGAZIN, ADS_SI_ANALYTICS), true);
    assert.equal(bannerDecis(MAGAZIN, DOAR_ADS), true);
  });

  test("⚠ „Am inteles” de la bannerul fara alegeri, apoi magazinul isi pune o unealta: omul e intrebat", () => {
    writeConsent(MAGAZIN, CONSENT_NONE, []);
    assert.equal(bannerDecis(MAGAZIN, { categorii: [] }), true);
    assert.equal(bannerDecis(MAGAZIN, { categorii: ["analytics"] }), false);
    assert.equal(bannerDecis(MAGAZIN, DOAR_ADS), false);
  });

  test("un acord dat nu se atinge, nici pentru o categorie aparuta mai tarziu", () => {
    writeConsent(MAGAZIN, CONSENT_ALL, ["analytics"]);
    assert.equal(bannerDecis(MAGAZIN, ADS_SI_ANALYTICS), true);
  });

  test("⚠ „Functionale” nu redeschide bannerul: pe ea o cere cartonasul de la butonul de chat", () => {
    writeConsent(MAGAZIN, CONSENT_NONE, ["marketing"]);
    assert.equal(bannerDecis(MAGAZIN, { categorii: ["marketing", "functional"] }), true);
  });
});

describe("acordul dat doar chatului", () => {
  test("ramane un raspuns partial, ca inainte: bannerul nu e socotit raspuns", () => {
    acordaFunctional(MAGAZIN);
    assert.equal(bannerDecis(MAGAZIN), false);
    assert.equal(bannerDecis(MAGAZIN, DOAR_ADS), false);
  });

  test("⚠ pastreaza lista categoriilor aratate: altfel raspunsul ar parea unul vechi si omul ar fi intrebat din nou", () => {
    writeConsent(MAGAZIN, CONSENT_NONE, ["marketing"]);
    acordaFunctional(MAGAZIN);
    assert.deepEqual(scris()?.oferite, ["marketing"]);
    assert.equal(scris()?.functional, true);
    assert.equal(bannerDecis(MAGAZIN, DOAR_ADS), true, "dupa acordul dat chatului, omul care refuzase marketingul e intrebat din nou");
    /* Un raspuns vechi ramane vechi si dupa chat: nu i se inventeaza o lista. */
    vechi(false, false);
    acordaFunctional(MAGAZIN);
    assert.equal("oferite" in (scris() ?? {}), false);
    assert.equal(bannerDecis(MAGAZIN, DOAR_ADS), false);
  });
});

describe("cazurile de margine", () => {
  test("fara niciun raspuns, sau cu unul scris sub alta versiune, bannerul nu e socotit raspuns", () => {
    assert.equal(bannerDecis(MAGAZIN, DOAR_ADS), false);
    vechi(true, true, { v: CONSENT_VERSION + 1 });
    assert.equal(bannerDecis(MAGAZIN, DOAR_ADS), false);
  });

  test("o lista stricata in stocare e citita ca raspuns vechi, nu arunca", () => {
    vechi(false, false, { oferite: "marketing" });
    assert.equal(bannerDecis(MAGAZIN, ADS_SI_FACEBOOK), true);
    assert.equal(bannerDecis(MAGAZIN, DOAR_ADS), false);
  });
});
