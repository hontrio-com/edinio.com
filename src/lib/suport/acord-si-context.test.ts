import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  CONSENT_ALL, CONSENT_EVENT, CONSENT_NONE, CONSENT_VERSION, acordaFunctional, areAcordPentru, bannerDecis,
  detectConsentCategories, readConsent, writeConsent,
} from "@/lib/cookie-consent";
import { comandaNotata, cosulDinStocare, noteazaComanda, produsulDinPagina } from "./context-vitrina";

/*
 * Acordul pentru chat si ce afla operatorul despre pagina, pe un „browser” fals (o stocare si un document).
 */

const g = globalThis as unknown as Record<string, unknown>;
let evenimente: string[] = [];

function stocare() {
  const m = new Map<string, string>();
  return {
    getItem: (c: string) => m.get(c) ?? null,
    setItem: (c: string, v: string) => { m.set(c, v); },
    removeItem: (c: string) => { m.delete(c); },
  };
}

beforeEach(() => {
  evenimente = [];
  g.window = globalThis;
  g.localStorage = stocare();
  g.sessionStorage = stocare();
  g.dispatchEvent = (e: { type: string }) => { evenimente.push(e.type); return true; };
  if (typeof g.CustomEvent !== "function") {
    g.CustomEvent = class { type: string; detail: unknown; constructor(type: string, init?: { detail?: unknown }) { this.type = type; this.detail = init?.detail; } };
  }
});

/* ═══ Acordul ═══ */

test("chatul isi aduce categoria „functional” in banner numai cand magazinul il are", () => {
  assert.deepEqual(detectConsentCategories(null, null, false, false), []);
  assert.deepEqual(detectConsentCategories(null, null, false, true), ["functional"]);
  assert.deepEqual(detectConsentCategories({ facebook_pixel_id: "1" } as never, "G-1", false, true), ["analytics", "marketing", "functional"]);
  /* Apelurile vechi, cu trei argumente, raman cum erau. */
  assert.deepEqual(detectConsentCategories({ facebook_pixel_id: "1" } as never, null, false), ["marketing"]);
});

test("„Accepta” da si categoria functionala; „Refuza” nu", () => {
  assert.equal(CONSENT_ALL.functional, true);
  assert.equal(CONSENT_NONE.functional, false);
  assert.equal(areAcordPentru(CONSENT_ALL, ["functional"]), true);
  assert.equal(areAcordPentru(CONSENT_NONE, ["functional"]), false);
  /* Acordul pentru marketing nu deschide chatul, si invers. */
  assert.equal(areAcordPentru({ necessary: true, analytics: true, marketing: true, functional: false }, ["functional"]), false);
  assert.equal(areAcordPentru({ necessary: true, analytics: false, marketing: false, functional: true }, ["marketing"]), false);
});

test("⚠ un acord vechi, dat inainte sa existe chatul, nu il cuprinde", () => {
  (g.localStorage as ReturnType<typeof stocare>).setItem(
    "edinio_cc_magazin",
    JSON.stringify({ necessary: true, analytics: true, marketing: true, v: CONSENT_VERSION, ts: 1 }),
  );
  assert.deepEqual(readConsent("magazin"), { necessary: true, analytics: true, marketing: true, functional: false });
  assert.equal(bannerDecis("magazin"), true, "omul a raspuns bannerului: nu e intrebat din nou acolo");
});

test("⚠ acordul dat de la butonul de chat porneste doar chatul si lasa bannerul de raspuns", () => {
  assert.equal(readConsent("magazin"), null);
  acordaFunctional("magazin");
  assert.deepEqual(readConsent("magazin"), { necessary: true, analytics: false, marketing: false, functional: true });
  assert.equal(bannerDecis("magazin"), false, "nu hotaram noi ca omul a refuzat analiza si marketingul");
  assert.deepEqual(evenimente, [CONSENT_EVENT]);
  /* Raspunsul la banner il inlocuieste, cu ce a ales omul acolo. */
  writeConsent("magazin", CONSENT_ALL);
  assert.equal(bannerDecis("magazin"), true);
  assert.equal(readConsent("magazin")?.functional, true);
});

test("cine a raspuns deja bannerului isi pastreaza alegerile cand accepta chatul", () => {
  writeConsent("magazin", { necessary: true, analytics: true, marketing: false, functional: false });
  acordaFunctional("magazin");
  assert.deepEqual(readConsent("magazin"), { necessary: true, analytics: true, marketing: false, functional: true });
  assert.equal(bannerDecis("magazin"), true);
  /* Fiecare magazin isi tine acordul lui. */
  assert.equal(readConsent("alt-magazin"), null);
});

test("o stocare stricata sau o versiune veche inseamna „fara acord”, nu o eroare", () => {
  const s = g.localStorage as ReturnType<typeof stocare>;
  s.setItem("edinio_cc_a", "{stricat");
  s.setItem("edinio_cc_b", JSON.stringify({ necessary: true, analytics: true, marketing: true, functional: true, v: CONSENT_VERSION + 1, ts: 1 }));
  assert.equal(readConsent("a"), null);
  assert.equal(readConsent("b"), null);
  assert.equal(bannerDecis("a"), false);
});

/* ═══ Pagina ═══ */

function documentCu(...scripturi: string[]): Document {
  return {
    querySelectorAll: (selector: string) => {
      assert.equal(selector, 'script[type="application/ld+json"]');
      return scripturi.map((textContent) => ({ textContent }));
    },
  } as unknown as Document;
}

test("produsul privit se ia din datele structurate ale paginii", () => {
  const produs = { "@context": "https://schema.org", "@type": "Product", name: "  Inel   argint ", sku: "IN-1", offers: { "@type": "Offer", price: "139.00", priceCurrency: "RON" } };
  assert.deepEqual(produsulDinPagina(documentCu(JSON.stringify(produs))), { nume: "Inel argint", cod: "IN-1", pret: "139 RON" });
  /* Intr-un `@graph`, langa firma si firimituri. */
  const graf = { "@graph": [{ "@type": "Organization", name: "Magazin" }, { "@type": ["Product"], name: "Cercei", offers: [{ price: 89.5, priceCurrency: "EUR" }] }] };
  assert.deepEqual(produsulDinPagina(documentCu("{stricat", JSON.stringify(graf))), { nume: "Cercei", pret: "89.50 EUR" });
  /* O pagina fara produs. */
  assert.equal(produsulDinPagina(documentCu(JSON.stringify({ "@type": "BreadcrumbList" }))), undefined);
  assert.equal(produsulDinPagina(documentCu()), undefined);
});

test("numele produsului e taiat: pleaca intr-un atribut scurt", () => {
  const p = produsulDinPagina(documentCu(JSON.stringify({ "@type": "Product", name: "x".repeat(400) })));
  assert.equal(p?.nume.length, 120);
});

test("cosul se socoteste din stocarea lui; gol, stricat sau lipsa inseamna „fara cos”", () => {
  const s = stocare();
  assert.equal(cosulDinStocare("magazin", s), undefined);
  s.setItem("cart_magazin", JSON.stringify([{ quantity: 2, price: 139 }, { quantity: 1, price: 20.5 }, { quantity: -3, price: 10 }, null]));
  assert.deepEqual(cosulDinStocare("magazin", s), { produse: 3, valoare: "298.50 RON" });
  s.setItem("cart_magazin", "[]");
  assert.equal(cosulDinStocare("magazin", s), undefined);
  s.setItem("cart_magazin", "{stricat");
  assert.equal(cosulDinStocare("magazin", s), undefined);
  assert.equal(cosulDinStocare("magazin", null), undefined);
});

test("comanda se noteaza pe magazin si pe fila, cu numarul si valoarea ei", () => {
  assert.equal(comandaNotata("magazin"), null);
  noteazaComanda("magazin", { numar: " #0281 ", total: "139,00 lei" });
  assert.deepEqual(comandaNotata("magazin"), { numar: "#0281", total: "139,00 lei" });
  assert.equal(comandaNotata("alt-magazin"), null);
  assert.deepEqual(evenimente, ["edinio-chat-comanda"]);
  /* Fara numar nu exista comanda de notat. */
  noteazaComanda("alt-magazin", { numar: "  ", total: "5" });
  assert.equal(comandaNotata("alt-magazin"), null);
});
