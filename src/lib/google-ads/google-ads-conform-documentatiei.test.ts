import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync } from "node:fs";
import { utilizatorulPentruGoogle, normalizeazaEmailulGoogle, normalizeazaTelefonulGoogle, sha256Hex } from "./date-client";
import { parseIdConversieAds, parseEtichetaAds, conversieCumparare } from "./conversie";
import { offerIdVarianta, idOfertaDupaTitlu } from "@/lib/google-merchant/id-oferta";
import { areAcordPentru } from "@/lib/cookie-consent";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * GOOGLE ADS: CONFORM DOCUMENTATIEI                                (18.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ EXPUNEREA MASURATA: un SINGUR magazin are tag Google in productie, iar acela e un `G-` (GA4), fara
 * eticheta de conversie. Zero magazine cu `AW-`, zero comenzi cu `gclid`. Integrarea n-a masurat niciodata
 * nimic in Google Ads, deci probele sunt singura plasa.
 *
 * ═══ CE A SCOS AUDITUL ═══
 *
 *  1. `send_to` se compunea din `google_tag_id`, care poate fi un ID GA4: conversia pleca intr-un container
 *     care nu stie ce e o conversie Ads. Cu datele de azi, chiar asa ar fi plecat.
 *  2. Nu existau enhanced conversions (datele hash-uite ale clientului).
 *  3. Tagul Google statea sub categoria „analiza”: cine accepta marketingul dar refuza analiza nu trimitea
 *     nicio conversie, iar `analytics_storage` pleca mereu `granted`.
 *  4. Articolele n-aveau nici `id`-ul din Merchant Center, nici `google_business_vertical`, deci
 *     remarketingul dinamic n-avea ce arata.
 */

const viu = (cale: string) => readFileSync(cale, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1. Enhanced conversions: normalizarea si hash-ul, pe exemplele lor ────────────
describe("enhanced conversions: datele omului", () => {
  test("⚠ exact hash-urile din documentatie (email, telefon E.164, prenume, nume)", () => {
    assert.equal(sha256Hex("jdoe@example.com"), "a8af8341993604f29cd4e0e5a5a4b5d48c575436c38b28abbfd7d481f345d5db");
    assert.equal(sha256Hex("+11231234567"), "e9d3eef677f9a3b19820f92696be53d646ac4cea500e5f8fd08b00bc6ac773b1");
    assert.equal(sha256Hex("john"), "96d9632f363564cc3032521409cf22a852f2032eec099ed5967c0d000cec607a");
    assert.equal(sha256Hex("doe"), "799ef92a11af918e3fb741df42934f3b568ed2d93ac1df74f1b8d41a27932a6f");
    const u = utilizatorulPentruGoogle({ email: "  JDoe@Example.com " })!;
    assert.equal(u.sha256_email_address, "a8af8341993604f29cd4e0e5a5a4b5d48c575436c38b28abbfd7d481f345d5db");
  });

  test("⚠ punctele se scot DOAR din gmail.com si googlemail.com", () => {
    assert.equal(normalizeazaEmailulGoogle("j.o.h.n.doe@gmail.com"), "johndoe@gmail.com");
    assert.equal(normalizeazaEmailulGoogle("J.Doe@GoogleMail.com"), "jdoe@googlemail.com");
    assert.equal(normalizeazaEmailulGoogle("j.doe@yahoo.com"), "j.doe@yahoo.com", "punctul e parte din adresa la alt furnizor");
    assert.equal(normalizeazaEmailulGoogle("nu-e-email"), undefined);
    assert.equal(normalizeazaEmailulGoogle("  ION@exemplu.RO "), "ion@exemplu.ro");
  });

  test("telefonul in E.164, cu `+` si prefixul tarii", () => {
    assert.equal(normalizeazaTelefonulGoogle("0722 123 456"), "+40722123456");
    assert.equal(normalizeazaTelefonulGoogle("(+1) 123-123-4567", "US"), "+11231234567");
    assert.equal(normalizeazaTelefonulGoogle("123"), undefined);
    assert.equal(normalizeazaTelefonulGoogle("0722 123 456 789 012 345"), undefined, "peste 15 cifre nu e E.164");
    assert.equal(normalizeazaTelefonulGoogle("0722123456", "romania"), "+40722123456", "o tara fara forma a inlocuit Romania");
    const u = utilizatorulPentruGoogle({ email: "a@b.ro", telefon: "0722123456" })!;
    assert.equal(u.sha256_phone_number, sha256Hex("+40722123456"));
  });

  test("⚠ fara email nu se trimite nimic: telefonul singur nu e o potrivire valida", () => {
    assert.equal(utilizatorulPentruGoogle({ telefon: "0722123456" }), null);
    assert.equal(utilizatorulPentruGoogle({}), null);
    const doarEmail = utilizatorulPentruGoogle({ email: "a@b.ro" })!;
    assert.deepEqual(Object.keys(doarEmail), ["sha256_email_address"]);
    for (const v of Object.values(doarEmail)) assert.match(v, /^[0-9a-f]{64}$/);
  });
});

// ── 2. Conversia: unde pleaca ─────────────────────────────────────────────────────
describe("conversia Google Ads", () => {
  test("⚠⚠ un ID GA4 NU primeste conversii: fara `AW-` nu pleaca nimic", () => {
    assert.equal(conversieCumparare("G-76XBCVV0P2", "abc123XYZ", { orderId: "c1", valoare: 10 }), null);
    assert.equal(conversieCumparare("GT-ABCD123", "abc123XYZ", { orderId: "c1", valoare: 10 }), null);
    assert.equal(parseIdConversieAds("G-76XBCVV0P2"), null);
    assert.equal(parseIdConversieAds("aw-123456789"), "AW-123456789");
    assert.equal(parseIdConversieAds("AW-123456789/abc123XYZ"), "AW-123456789", "forma lipita intreaga");
  });

  test("forma trimisa: `send_to`, valoarea rotunjita, moneda si `transaction_id`", () => {
    const c = conversieCumparare("AW-123456789", "abc123XYZ", { orderId: "11111111-2222", valoare: 189.905 })!;
    assert.deepEqual(c, {
      send_to: "AW-123456789/abc123XYZ",
      value: 189.91,
      currency: "RON",
      transaction_id: "11111111-2222",
    });
  });

  test("fara eticheta, sau fara comanda, nu se trimite nimic", () => {
    assert.equal(conversieCumparare("AW-123456789", null, { orderId: "c1", valoare: 10 }), null);
    assert.equal(conversieCumparare("AW-123456789", "ab", { orderId: "c1", valoare: 10 }), null, "eticheta prea scurta");
    assert.equal(conversieCumparare("AW-123456789", "abc123XYZ", { orderId: "", valoare: 10 }), null);
    assert.equal(parseEtichetaAds("AW-123/abc123XYZ"), "abc123XYZ");
    assert.equal(parseEtichetaAds("are spatii"), null);
  });
});

// ── 3. Remarketingul dinamic: ID-ul din Merchant Center ───────────────────────────
describe("remarketing dinamic", () => {
  const PID = "9fca598b-313b-471f-b365-738b02bef486";
  const cuVariante = {
    variants: {
      enabled: true,
      options: [{ id: "o1", name: "Marime", values: ["S", "M"] }],
      combinations: [
        { id: "s", title: "S", uid: "aaaabbbbccccdddd", enabled: true },
        { id: "m", title: "M", uid: "eeeeffff00001111", enabled: true },
      ],
    },
  };

  test("⚠ ID-ul articolului e CHIAR oferta din Merchant Center", () => {
    assert.equal(idOfertaDupaTitlu(PID, cuVariante, "S"), offerIdVarianta(PID, { id: "s", title: "S", uid: "aaaabbbbccccdddd" }));
    assert.equal(idOfertaDupaTitlu(PID, cuVariante, "S"), `${PID}-s`);
    assert.equal(idOfertaDupaTitlu(PID, {}, null), PID, "produsul simplu are ca oferta chiar ID-ul lui");
    assert.equal(idOfertaDupaTitlu(PID, cuVariante, "o marime stearsa"), PID, "o combinatie negasita nu inventeaza alta oferta");
  });

  test("⚠ combinatia cu slug lung pastreaza forma stabila, nu una taiata", () => {
    const lung = { id: "180x200-cm-alb-cu-model-imprimat", title: "180x200 cm alb", uid: "1234567890abcdef" };
    const id = offerIdVarianta(PID, lung);
    assert.ok(id.length <= 50, `ID-ul are ${id.length} caractere`);
    assert.equal(id, `${PID.replace(/-/g, "")}-1234567890abcdef`);
  });
});

// ── 4. Poarta de consimtamant: regula, nu componenta ─────────────────────────────
describe("ce se incarca sub ce acord", () => {
  const acord = (analytics: boolean, marketing: boolean) => ({ necessary: true as const, analytics, marketing });

  test("⚠ tagul Google se incarca daca omul a acceptat ORICARE dintre analiza si marketing", () => {
    assert.equal(areAcordPentru(acord(true, false), ["analytics", "marketing"]), true);
    assert.equal(areAcordPentru(acord(false, true), ["analytics", "marketing"]), true, "acordul de marketing nu ajungea la Google Ads");
    assert.equal(areAcordPentru(acord(false, false), ["analytics", "marketing"]), false);
    assert.equal(areAcordPentru(null, ["analytics", "marketing"]), false, "fara nicio decizie nu se incarca nimic");
    assert.equal(areAcordPentru(acord(true, true), []), false);
    assert.equal(areAcordPentru(acord(true, false), ["marketing"]), false, "pixelii de marketing nu pleaca pe acordul de analiza");
  });
});

// ── 5. Cablarea care cere un browser ──────────────────────────────────────────────
describe("cablarea din pagini", () => {
  test("⚠ tagul Google se incarca si pentru marketing, iar semnalele urmeaza fiecare categoria lui", () => {
    const invelis = viu("src/app/(public)/[slug]/layout.tsx");
    assert.match(invelis, /<ConsentGate slug=\{slug\} category=\{\["analytics", "marketing"\]\}/);
    const tag = readFileSync("src/components/public/GoogleTag.tsx", "utf8");
    assert.match(tag, /analytics_storage: analyticsGranted \? 'granted' : 'denied'/);
    assert.match(tag, /ad_storage: adGranted \? 'granted' : 'denied'/);
    assert.match(tag, /ad_user_data: adGranted \? 'granted' : 'denied'/);
    assert.match(tag, /ad_personalization: adGranted \? 'granted' : 'denied'/);
    assert.doesNotMatch(viu("src/components/public/GoogleTag.tsx"), /analytics_storage: 'granted',\s*\n\s*ad_storage: adGranted/);
    /* Semnalele pleaca INAINTEA oricarui `config`, altfel tagul apuca sa masoare fara ele. */
    assert.ok(tag.indexOf("${consentDefault}") < tag.indexOf("gtag('config'"), "consimtamantul se declara dupa config");
  });

  test("⚠ ID-ul de conversie e un tag in sine si ajunge in runtime", () => {
    const invelis = viu("src/app/(public)/[slug]/layout.tsx");
    assert.match(invelis, /const adsConversionId = parseIdConversieAds\(mc\?\.google_ads_conversion_id\) \?\? parseIdConversieAds\(googleTagId\);/);
    assert.match(invelis, /\[googleTagId, gaMeasurementId, adsConversionId\]/, "ID-ul Ads nu primeste `config`, deci conversia n-are unde ajunge");
    assert.match(readFileSync("src/components/public/GoogleTag.tsx", "utf8"), /window\.__edinioGoogleAds=\{id:'\$\{safeAds\}'\}/);
  });

  test("⚠ achizitia: datele hash-uite se pun INAINTEA conversiei", () => {
    const eveniment = viu("src/components/public/FbPurchaseEvent.tsx");
    assert.match(eveniment, /gtagRaw\("set", "user_data", utilizatorGoogle\)/);
    assert.match(eveniment, /const conversie = conversieCumparare\(googleAdsConversionId \?\? googleTagId, googleAdsConversionLabel,/);
    assert.ok(
      eveniment.indexOf('gtagRaw("set", "user_data"') < eveniment.indexOf("conversieCumparare("),
      "`user_data` se pune dupa conversie, deci conversia pleaca fara potrivire",
    );
    const confirmare = viu("src/app/(public)/[slug]/confirm/page.tsx");
    assert.match(confirmare, /utilizatorGoogle = utilizatorulPentruGoogle\(\{/);
    assert.match(confirmare, /if \(marketingConfig\?\.google_ads_conversion_id\) \{/, "datele se calculeaza si fara ID de conversie");
  });

  test("⚠ articolele poarta ID-ul de oferta, iar `google_business_vertical` se pune intr-un singur loc", () => {
    const runtime = viu("src/lib/marketing.ts");
    assert.match(runtime, /google_business_vertical: "retail"/);
    assert.match(runtime, /const ads = \(window as unknown as \{ __edinioGoogleAds\?: \{ id\?: string \} \}\)\.__edinioGoogleAds;/);
    assert.match(runtime, /if \(!ads\?\.id \|\| !Array\.isArray\(data\.items\) \|\| data\.items\.length === 0\) return data;/);
    for (const pagina of ["ProductPageClassic", "ProductPageDetailed"]) {
      const cod = viu(`src/components/storefront/sections/product/${pagina}.tsx`);
      assert.match(cod, /idOferta: selectedCombo \? offerIdVarianta\(product\.id, selectedCombo\) : \(variantsData \? null : product\.id\)/, pagina);
      assert.match(cod, /\.\.\.\(produsCuVariante \? \{\} : \{ id: productId \}\)/, `${pagina}: view_item`);
    }
    assert.match(viu("src/lib/storefront/cart/track-add.ts"), /\.\.\.\(idOferta \? \{ id: idOferta \} : \{\}\)/);
    assert.match(viu("src/components/ministore/MiniStoreRenderer.tsx"), /idOfertaDupaTitlu\(line\.productId, quickAddProduct\?\.page_sections, line\.variantTitle\)/);
    const confirmare = viu("src/app/(public)/[slug]/confirm/page.tsx");
    assert.match(confirmare, /idOfertaDupaTitlu\(i\.product_id, ps, i\.variant_title \|\| titluDinNumeleLiniei\(i\.name, ps\)\)/);
    assert.match(confirmare, /const idOferta = iduriOferta\[k\];/, "ID-urile calculate nu ajung in articolele achizitiei");
    assert.match(confirmare, /\.\.\.\(idOferta \? \{ id: idOferta \} : \{\}\)/);
  });

  test("eticheta nu se poate salva fara ID-ul de conversie", () => {
    const actiuni = viu("src/lib/actions/marketing.actions.ts");
    assert.match(actiuni, /const idAds = parseIdConversieAds\(config\.google_ads_conversion_id\);/);
    assert.match(actiuni, /if \(!idAds\) \{\s*return \{ ok: false, error: "Eticheta de conversie are nevoie de ID-ul de conversie Google Ads/);
  });
});
