import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { ADRESA_BIBLIOTECII, corpEticheteiGoogle, iduriCurate } from "./corp";
import { leagaEtichetaGoogle, type FereastraEtichetei } from "./legatura";
import {
  CONSENT_EVENT, CONSENT_VERSION, DEFAULT_COOKIE_BANNER_CONFIG, GOOGLE_ADS_INAINTE_DE_ACORD_IMPLICIT,
  detectConsentCategories, magazinulAreGoogleAds, parseCookieBannerConfig,
} from "@/lib/cookie-consent";
import { eZonaDeCont } from "@/lib/cont/zona";

/*
 * Eticheta Google a magazinului (25.11.2026): cand porneste si ce spune.
 *
 * Scriptul de pornire nu se citeste ca text: se RULEAZA, intr-o fereastra falsa, si se priveste ce a ajuns in
 * `dataLayer` si in ce ordine. O proba pe text ar fi trecut si cu `consent default` pus dupa `config`, adica
 * exact greseala care nu se vede nicaieri: primul semnal pleaca fara stare.
 */

const SLUG = "casa-lumen";
const CHEIE = `edinio_cc_${SLUG}`;
const ADS = "AW-18567923104";
const GA = "G-LGF04ZMDCH";
const REFUZAT = { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };
const ACORDAT = { analytics_storage: "granted", ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted" };

interface ScriptPus { async?: boolean; src?: string; text?: string; onload?: () => void }
interface Fereastra {
  addEventListener: (tip: string, ascultator: () => void) => void;
  removeEventListener: (tip: string, ascultator: () => void) => void;
  dataLayer?: ArrayLike<unknown>[];
  gtag?: (...a: unknown[]) => void;
  __edinioAcordGoogle?: { analytics: boolean; marketing: boolean };
  __edinioGoogleAds?: { id: string };
  __edinioEtichetaGoogle?: boolean;
  __edinioGoogleRaspuns?: (analiza: boolean, marketing: boolean) => void;
  __edinioFlushQueue?: (v: string) => void;
  localStorage: { getItem: (cheie: string) => string | null };
  location: { search: string; pathname: string; origin: string };
  document: { referrer: string; createElement: (fel: string) => ScriptPus; head: { appendChild: (s: ScriptPus) => void } };
}

const ORIGINE = "https://magazin.test";

/**
 * O fereastra falsa. `deUnde` e pagina de unde vine omul (`document.referrer`).
 *
 * Biblioteca Google ceruta de script „soseste” pe loc (i se cheama `onload`), ca in cele mai multe probe sa se
 * vada purtarea intreaga. Cu `bibliotecaIntarzie` soseste abia la `sosesteBiblioteca()`: asa se vede ce pleaca
 * inainte de ea si ce se intampla daca adresa se schimba intre timp.
 */
function fereastra(p: { stocat?: unknown; stocareBlocata?: boolean; cale?: string; cautare?: string; deUnde?: string; bibliotecaIntarzie?: boolean } = {}) {
  const stare = { stocat: p.stocat };
  const citite: string[] = [];
  const golite: string[] = [];
  const biblioteci: ScriptPus[] = [];
  const cerute: ScriptPus[] = [];
  /* Scripturile cu text puse in pagina de jumatatea din browser (`legatura.ts`); ca in browser, ruleaza pe loc. */
  const puseInPagina: string[] = [];
  const ascultatori: [string, () => void][] = [];
  /*
   * Ce gaseste coada de evenimente in clipa in care e golita. `lib/marketing.ts` trimite numai cu `gtag` la
   * vedere si cu acordul scris; iar evenimentele trebuie sa intre in `dataLayer` DUPA `update` si `config`.
   */
  const laGolire: { comenzi: unknown[][]; acord: unknown; gtag: string; analiticeOprite: unknown }[] = [];
  /* Comenzile ajunse in `dataLayer`, in ordine. */
  function comenzi(): unknown[][] {
    return (w.dataLayer ?? []).map((a) => {
      /* Biblioteca Google ia din `dataLayer` numai obiecte `arguments`: un tablou obisnuit e ignorat, fara nicio eroare. */
      assert.equal(Object.prototype.toString.call(a), "[object Arguments]", "in `dataLayer` a ajuns altceva decat `arguments`");
      return Array.from(a);
    }).map((c) => (c[0] === "js" ? ["js"] : c));
  }
  const w: Fereastra = {
    addEventListener: (tip, ascultator) => { ascultatori.push([tip, ascultator]); },
    removeEventListener: (tip, ascultator) => {
      const i = ascultatori.findIndex(([t, a]) => t === tip && a === ascultator);
      if (i >= 0) ascultatori.splice(i, 1);
    },
    localStorage: {
      getItem(cheie) {
        citite.push(cheie);
        if (p.stocareBlocata) throw new Error("stocarea e blocata");
        return cheie === CHEIE && stare.stocat !== undefined ? JSON.stringify(stare.stocat) : null;
      },
    },
    location: { search: p.cautare ?? "", pathname: p.cale ?? "/", origin: ORIGINE },
    document: {
      referrer: p.deUnde ?? "",
      createElement: (fel) => { assert.equal(fel, "script"); return {}; },
      head: {
        appendChild: (s) => {
          if (typeof s.text === "string") { puseInPagina.push(s.text); new Function("window", s.text)(w); return; }
          cerute.push(s);
          biblioteci.push({ async: s.async, src: s.src });
          if (!p.bibliotecaIntarzie) s.onload?.();
        },
      },
    },
    __edinioFlushQueue: (v) => {
      golite.push(v);
      laGolire.push({
        comenzi: comenzi(), acord: w.__edinioAcordGoogle ? { ...w.__edinioAcordGoogle } : undefined, gtag: typeof w.gtag,
        /* Comutatorul de Analytics, in aceeasi clipa: ridicat dupa golire, evenimentele din coada ar fi fost aruncate. */
        analiticeOprite: (w as unknown as Record<string, unknown>)[`ga-disable-${GA}`],
      });
    },
  };
  return {
    w, stare, citite, golite, laGolire, biblioteci, puseInPagina, ascultatori, comenzi,
    ruleaza: (script: string) => { new Function("window", script)(w); },
    /** Ca `window.dispatchEvent`: cheama ascultatorii evenimentului. */
    anunta: (tip: string) => { for (const [t, a] of [...ascultatori]) if (t === tip) a(); },
    /** Biblioteca Google ceruta de script a sosit si a rulat (numai cu `bibliotecaIntarzie`). */
    sosesteBiblioteca: () => { for (const s of cerute) s.onload?.(); },
  };
}

/** Comutatorul din documentatia Google care opreste Analytics sa trimita orice: `window['ga-disable-<ID>']`. */
const oprit = (w: Fereastra, id: string) => (w as unknown as Record<string, unknown>)[`ga-disable-${id}`];

/** Ruleaza scriptul o data, intr-o fereastra noua. */
function ruleaza(script: string, p: Parameters<typeof fereastra>[0] = {}) {
  const f = fereastra(p);
  f.ruleaza(script);
  return { ...f, comenzi: f.comenzi() };
}

type Intrare = Parameters<typeof corpEticheteiGoogle>[0];
/** Magazin cu reclame Google si Analytics, cu banner, cu optiunea „inainte de acord” pornita: cazul eSAFE. */
const corp = (p: Partial<Intrare> = {}) => {
  const c = corpEticheteiGoogle({ tagIds: [ADS, GA], slug: SLUG, cuBanner: true, adsId: ADS, adsInainteDeAcord: true, ...p });
  assert.ok(c, "magazinul are ID-uri, deci are si script");
  return c;
};
const acord = (analytics: boolean, marketing: boolean, peste: Record<string, unknown> = {}) =>
  ({ necessary: true, analytics, marketing, functional: false, v: CONSENT_VERSION, ts: 1, ...peste });
const nuAPornit = (r: ReturnType<typeof ruleaza>, unde: string) => {
  assert.deepEqual(r.comenzi, [], `${unde}: au plecat comenzi spre eticheta`);
  assert.deepEqual(r.biblioteci, [], `${unde}: s-a cerut biblioteca Google`);
  assert.equal(r.w.gtag, undefined, `${unde}: s-a definit gtag`);
  assert.equal(r.w.__edinioEtichetaGoogle, undefined, `${unde}: pagina e insemnata ca pornita`);
  assert.equal(r.w.__edinioAcordGoogle, undefined, `${unde}: s-a scris o stare de acord`);
  assert.equal(oprit(r.w, GA), undefined, `${unde}: s-a atins comutatorul de Analytics`);
};

describe("magazinul cu reclame Google, la cine n-a raspuns bannerului", () => {
  test("⚠⚠ eticheta de reclame porneste cu tot refuzat, INAINTEA oricarui `config`, si isi cere biblioteca", () => {
    const r = ruleaza(corp().script);
    assert.deepEqual(r.comenzi, [
      ["consent", "default", REFUZAT],
      ["set", "ads_data_redaction", true],
      ["js"],
      ["config", ADS],
    ]);
    /* Biblioteca Google, ceruta chiar de script: asa o gaseste Google Ads pe site si fara acceptarea bannerului. */
    assert.deepEqual(r.biblioteci, [{ async: true, src: `https://www.googletagmanager.com/gtag/js?id=${ADS}` }]);
    assert.equal(r.w.__edinioEtichetaGoogle, true);
    assert.deepEqual(r.citite, [CHEIE], "raspunsul se citeste de sub cheia magazinului, o data");
  });

  test("⚠⚠ pana la acord pleaca NUMAI atat: fara Analytics, fara evenimente, fara acord scris", () => {
    const r = ruleaza(corp().script);
    assert.equal(r.comenzi.some((c) => c[0] === "config" && c[1] === GA), false, "Analytics s-a configurat fara acord");
    assert.equal(r.comenzi.some((c) => c[0] === "consent" && c[1] === "update"), false);
    /* Coada de evenimente NU se goleste: produsul vazut, cosul si comanda asteapta acordul, ca inainte. */
    assert.deepEqual(r.golite, [], "evenimentele din coada au plecat fara acord");
    /* Asta citeste coada (`lib/marketing.ts`) ca sa stie ca n-are voie sa trimita. */
    assert.deepEqual(r.w.__edinioAcordGoogle, { analytics: false, marketing: false });
  });

  test("⚠⚠ `window.gtag` nu e la vedere pana la acord: un script strain nu are pe unde trimite pe langa coada", () => {
    /*
     * Gasit la recenzie. Chatul magazinului porneste sub alta categorie („Functionale”) si, cu integrarea lui de
     * Analytics, isi trimite evenimentele prin `gtag`-ul paginii. Pus la vedere inainte de acord, l-ar fi folosit
     * si la cine a refuzat. Biblioteca Google citeste `dataLayer`, deci eticheta se gaseste si fara el.
     */
    for (const stocat of [undefined, acord(false, false), acord(false, false, { functional: true, partial: true })]) {
      const r = ruleaza(corp().script, { stocat });
      assert.equal(r.w.gtag, undefined, `\`window.gtag\` e la vedere inainte de acord (${JSON.stringify(stocat)})`);
      assert.equal(r.comenzi.length, 4, "eticheta n-a mai pornit");
    }
  });

  test("⚠⚠ Analytics e oprit de tot pana la acord, si pentru cine si-a combinat etichetele in contul Google", () => {
    /*
     * Cu etichetele combinate, `config AW-…` ar trimite semnale si spre destinatia de Analytics, fara niciun
     * `config G-…` de la noi. `window['ga-disable-<ID>']` e comutatorul din documentatia Google.
     */
    const r = ruleaza(corp().script);
    assert.equal(oprit(r.w, GA), true, "Analytics nu e oprit inainte de acord");
    assert.equal(oprit(r.w, ADS), undefined, "comutatorul de Analytics s-a pus si pe eticheta de reclame");
    /* ⚠ INAINTEA primei comenzi: asa cere documentatia („before any calls to gtag() are made”). */
    const f = fereastra();
    const laFiecareComanda: unknown[] = [];
    const strat: ArrayLike<unknown>[] = [];
    strat.push = function (this: ArrayLike<unknown>[], ...a: ArrayLike<unknown>[]) { laFiecareComanda.push(oprit(f.w, GA)); return Array.prototype.push.apply(this, a); };
    f.w.dataLayer = strat;
    f.ruleaza(corp().script);
    assert.deepEqual(laFiecareComanda, [true, true, true, true], "o comanda a plecat inainte ca Analytics sa fie oprit");
    /* Un ID de eticheta Google (`GT-`) pus in campul de tag e tot al masuratorii. */
    assert.equal(oprit(ruleaza(corp({ tagIds: ["GT-ABCDEF1"] }).script).w, "GT-ABCDEF1"), true);
    /* Magazinul numai cu reclame n-are ce opri: scriptul lui nu pomeneste comutatorul. */
    assert.equal(corp({ tagIds: [ADS] }).script.includes("ga-disable"), false);
    assert.equal(corp().script.includes("ga-disable"), true);
  });

  test("⚠⚠ `config` pleaca abia cand soseste biblioteca, iar adresa se judeca din nou atunci", () => {
    /*
     * Gasit la recenzie. Biblioteca isi citeste adresa cand construieste semnalul, nu cand primeste comanda. Pusa
     * in `dataLayer` de la inceput, comanda ar fi dus cu ea si ce s-a schimbat intre timp in adresa, fara
     * reincarcare: un cuvant scris in cautarea din catalog, un filtru. Biblioteca incarcata fara `config` nu trimite nimic.
     */
    const PANA_LA_SOSIRE = [["consent", "default", REFUZAT], ["set", "ads_data_redaction", true], ["js"]];
    const f = fereastra({ bibliotecaIntarzie: true });
    f.ruleaza(corp().script);
    assert.deepEqual(f.comenzi(), PANA_LA_SOSIRE, "comanda `config` a plecat inainte de sosirea bibliotecii");
    assert.equal(f.biblioteci.length, 1, "biblioteca nu a fost ceruta");
    f.sosesteBiblioteca();
    assert.deepEqual(f.comenzi(), [...PANA_LA_SOSIRE, ["config", ADS]]);
    /* O a doua sosire (n-are de unde, dar nici n-are voie sa strice) nu mai configureaza nimic. */
    f.sosesteBiblioteca();
    assert.equal(f.comenzi().length, 4);

    /* Adresa s-a schimbat pana la sosire: omul a scris in cautarea din catalog. Nu mai pleaca nimic pana la acord. */
    for (const [cale, cautare] of [["/magazin", "?q=aspirator"], ["/magazin", "?pret=10-50"], ["/cont/comenzi/8a1f", ""], ["/confirm", "?orderId=8a1f"]]) {
      const g = fereastra({ bibliotecaIntarzie: true, cale: "/magazin" });
      g.ruleaza(corp().script);
      g.w.location.pathname = cale;
      g.w.location.search = cautare;
      g.sosesteBiblioteca();
      assert.deepEqual(g.comenzi(), PANA_LA_SOSIRE, `${cale}${cautare}: semnalul a plecat cu o adresa care nu mai era curata`);
      /* La acord porneste intreaga, ca oriunde. */
      g.w.__edinioGoogleRaspuns?.(false, true);
      assert.deepEqual(g.comenzi().slice(3), [["consent", "update", { ...ACORDAT, analytics_storage: "denied" }], ["config", ADS], ["config", GA]]);
    }
    /* O schimbare care lasa adresa curata (un parametru de campanie, alta pagina obisnuita) nu opreste nimic. */
    const h = fereastra({ bibliotecaIntarzie: true });
    h.ruleaza(corp().script);
    h.w.location.pathname = "/product/vaza-verde";
    h.w.location.search = "?utm_source=google";
    h.sosesteBiblioteca();
    assert.deepEqual(h.comenzi().slice(-1), [["config", ADS]]);
  });

  test("⚠ raspunsul venit inainte de biblioteca: ID-ul de reclame nu se configureaza de doua ori", () => {
    const accepta = fereastra({ bibliotecaIntarzie: true });
    accepta.ruleaza(corp().script);
    accepta.w.__edinioGoogleRaspuns?.(true, true);
    assert.deepEqual(accepta.comenzi().slice(3), [["consent", "update", ACORDAT], ["config", ADS], ["config", GA]]);
    accepta.sosesteBiblioteca();
    assert.equal(accepta.comenzi().length, 6, "la sosirea bibliotecii, ID-ul de reclame s-a configurat a doua oara");
    /* Refuzul nu configureaza nimic; eticheta de reclame se configureaza la sosire, cu semnalele refuzate. */
    const refuza = fereastra({ bibliotecaIntarzie: true });
    refuza.ruleaza(corp().script);
    refuza.w.__edinioGoogleRaspuns?.(false, false);
    refuza.sosesteBiblioteca();
    assert.deepEqual(refuza.comenzi().slice(3), [["consent", "update", REFUZAT], ["config", ADS]]);
  });

  test("cu acord, `config` pleaca pe loc, ca in fragmentul oficial, fara sa astepte biblioteca", () => {
    for (const c of [corp(), corp({ adsInainteDeAcord: false }), corp({ cuBanner: false })]) {
      const f = fereastra({ bibliotecaIntarzie: true, stocat: acord(true, true) });
      f.ruleaza(c.script);
      assert.deepEqual(f.comenzi().slice(-2), [["config", ADS], ["config", GA]]);
      const inainte = f.comenzi().length;
      f.sosesteBiblioteca();
      assert.equal(f.comenzi().length, inainte);
    }
  });

  test("⚠ un raspuns dat doar chatului nu e un raspuns la banner", () => {
    const r = ruleaza(corp().script, { stocat: acord(false, false, { functional: true, partial: true }) });
    assert.deepEqual(r.comenzi, [["consent", "default", REFUZAT], ["set", "ads_data_redaction", true], ["js"], ["config", ADS]]);
    assert.deepEqual(r.golite, []);
  });

  test("⚠ un raspuns scris sub alta versiune a bannerului nu se mai ia in seama", () => {
    const r = ruleaza(corp().script, { stocat: acord(true, true, { v: CONSENT_VERSION + 1 }) });
    assert.deepEqual(r.comenzi.filter((c) => c[0] === "consent"), [["consent", "default", REFUZAT]]);
    assert.deepEqual(r.w.__edinioAcordGoogle, { analytics: false, marketing: false });
  });

  test("⚠ stocarea blocata sau stricata nu opreste eticheta si nu acorda nimic", () => {
    const r = ruleaza(corp().script, { stocareBlocata: true });
    assert.deepEqual(r.comenzi, [["consent", "default", REFUZAT], ["set", "ads_data_redaction", true], ["js"], ["config", ADS]]);
    assert.deepEqual(r.w.__edinioAcordGoogle, { analytics: false, marketing: false });
    assert.equal(r.biblioteci.length, 1);
  });

  test("a refuzat tot la o vizita de dinainte: aceeasi purtare, fara `update`", () => {
    const r = ruleaza(corp().script, { stocat: acord(false, false) });
    assert.deepEqual(r.comenzi, [["consent", "default", REFUZAT], ["set", "ads_data_redaction", true], ["js"], ["config", ADS]]);
    assert.deepEqual(r.golite, []);
  });
});

describe("raspunsul din banner ajunge la eticheta pornita, pe loc", () => {
  test("⚠ omul accepta: `update`, apoi Analytics, apoi evenimentele din coada", () => {
    const f = fereastra();
    f.ruleaza(corp().script);
    const inainte = f.comenzi().length;
    assert.equal(typeof f.w.__edinioGoogleRaspuns, "function");
    f.w.__edinioGoogleRaspuns?.(true, true);
    assert.deepEqual(f.comenzi().slice(inainte), [["consent", "update", ACORDAT], ["config", GA]]);
    assert.deepEqual(f.w.__edinioAcordGoogle, { analytics: true, marketing: true });
    assert.deepEqual(f.golite, ["ga"], "evenimentele asteptate in coada n-au plecat dupa acord");
    assert.equal(f.biblioteci.length, 1, "biblioteca s-a cerut a doua oara");
    /*
     * ⚠⚠ ORDINEA, privita din clipa in care coada e golita (gasit la recenzie: titlul probei o spunea, proba nu).
     * Coada trimite numai cu acordul scris si cu `gtag` la vedere; golita mai devreme, evenimentele asteptate ori
     * nu pleaca deloc, ori intra in `dataLayer` inaintea lui `update` si a lui `config` si sunt tratate ca refuzate.
     */
    assert.deepEqual(f.laGolire, [{ comenzi: f.comenzi(), acord: { analytics: true, marketing: true }, gtag: "function", analiticeOprite: false }]);
    assert.equal(typeof f.w.gtag, "function", "dupa acord, `gtag` nu e la vedere: coada nu are prin ce trimite");
    assert.equal(oprit(f.w, GA), false, "Analytics a ramas oprit dupa acord");
  });

  test("⚠⚠ omul REFUZA la prima vizita: `update` refuzat si atat; Analytics nu se configureaza", () => {
    /* De la o fereastra fara raspuns: pornind de la una cu acord, ID-urile sunt deja configurate si proba nu vede nimic. */
    const f = fereastra();
    f.ruleaza(corp().script);
    const inainte = f.comenzi().length;
    f.w.__edinioGoogleRaspuns?.(false, false);
    assert.deepEqual(f.comenzi().slice(inainte), [["consent", "update", REFUZAT]]);
    assert.deepEqual(f.golite, [], "coada s-a golit la un refuz");
    assert.deepEqual(f.w.__edinioAcordGoogle, { analytics: false, marketing: false });
    assert.equal(f.w.gtag, undefined);
    assert.equal(oprit(f.w, GA), true);
  });

  test("⚠ numai analiza, la prima vizita: `update`, apoi Analytics", () => {
    const f = fereastra();
    f.ruleaza(corp().script);
    const inainte = f.comenzi().length;
    f.w.__edinioGoogleRaspuns?.(true, false);
    assert.deepEqual(f.comenzi().slice(inainte), [["consent", "update", { ...REFUZAT, analytics_storage: "granted" }], ["config", GA]]);
    assert.deepEqual(f.laGolire, [{ comenzi: f.comenzi(), acord: { analytics: true, marketing: false }, gtag: "function", analiticeOprite: false }]);
    assert.equal(oprit(f.w, GA), false);
  });

  test("⚠ numai marketing: semnalele de reclame acordate, analiza refuzata; ID-urile nu se configureaza de doua ori", () => {
    const f = fereastra();
    f.ruleaza(corp().script);
    f.w.__edinioGoogleRaspuns?.(false, true);
    f.w.__edinioGoogleRaspuns?.(false, true);
    const c = f.comenzi();
    assert.deepEqual(c.filter((x) => x[0] === "consent" && x[1] === "update")[0], ["consent", "update", { ...ACORDAT, analytics_storage: "denied" }]);
    assert.equal(c.filter((x) => x[0] === "config" && x[1] === ADS).length, 1);
    assert.equal(c.filter((x) => x[0] === "config" && x[1] === GA).length, 1);
    assert.deepEqual(f.w.__edinioAcordGoogle, { analytics: false, marketing: true });
  });

  test("⚠ omul refuza (sau isi retrage acordul): `update` refuzat, nimic altceva", () => {
    const f = fereastra({ stocat: acord(true, true) });
    f.ruleaza(corp().script);
    const inainte = f.comenzi().length;
    const goliteInainte = f.golite.length;
    assert.equal(typeof f.w.gtag, "function");
    assert.equal(oprit(f.w, GA), undefined, "comutatorul de Analytics s-a pus desi omul acceptase");
    f.w.__edinioGoogleRaspuns?.(false, false);
    assert.deepEqual(f.comenzi().slice(inainte), [["consent", "update", REFUZAT]]);
    /* De aici coada nu mai trimite: starea asta o citeste `lib/marketing.ts`. */
    assert.deepEqual(f.w.__edinioAcordGoogle, { analytics: false, marketing: false });
    assert.equal(f.golite.length, goliteInainte, "coada s-a golit la un refuz");
    /* `gtag` dispare iar din vedere, iar Analytics e oprit pe loc, nu abia la pagina urmatoare. */
    assert.equal(f.w.gtag, undefined, "dupa retragere, `gtag` a ramas la vedere");
    assert.equal(oprit(f.w, GA), true, "dupa retragere, Analytics a ramas pornit");
  });

  test("accepta, se razgandeste, accepta iar: fiecare raspuns ajunge, iar ID-urile nu se configureaza de doua ori", () => {
    const f = fereastra();
    f.ruleaza(corp().script);
    f.w.__edinioGoogleRaspuns?.(true, true);
    f.w.__edinioGoogleRaspuns?.(false, false);
    f.w.__edinioGoogleRaspuns?.(true, true);
    const c = f.comenzi();
    assert.deepEqual(c.filter((x) => x[0] === "consent").map((x) => [x[1], (x[2] as { ad_storage: string }).ad_storage]),
      [["default", "denied"], ["update", "granted"], ["update", "denied"], ["update", "granted"]]);
    assert.equal(c.filter((x) => x[0] === "config").length, 2);
    assert.equal(typeof f.w.gtag, "function");
    assert.equal(oprit(f.w, GA), false);
    assert.deepEqual(f.golite, ["ga", "ga"]);
  });

  test("⚠ un comutator de Analytics pus de altcineva nu se ridica la acord", () => {
    /* Poate fi refuzul omului, tinut de alt cod. Ridicam numai ce am pus noi. */
    const f = fereastra();
    (f.w as unknown as Record<string, unknown>)[`ga-disable-${GA}`] = true;
    f.ruleaza(corp().script);
    f.w.__edinioGoogleRaspuns?.(true, true);
    assert.equal(oprit(f.w, GA), true, "s-a ridicat un comutator pe care nu l-am pus noi");
  });
});

describe("cine a acceptat la o vizita de dinainte", () => {
  test("a acceptat tot: se pleaca de la refuz si se corecteaza pe loc, inaintea lui `config`; apoi tot ce e al magazinului", () => {
    const r = ruleaza(corp().script, { stocat: acord(true, true) });
    assert.deepEqual(r.comenzi, [
      ["consent", "default", REFUZAT],
      ["consent", "update", ACORDAT],
      ["set", "ads_data_redaction", true],
      ["js"],
      ["config", ADS],
      ["config", GA],
    ]);
    assert.deepEqual(r.w.__edinioAcordGoogle, { analytics: true, marketing: true });
    assert.deepEqual(r.golite, ["ga"]);
    /* Coada se goleste la sfarsit, cu acordul scris si cu `gtag` la vedere; Analytics n-a fost oprit nicio clipa. */
    assert.deepEqual(r.laGolire, [{ comenzi: r.comenzi, acord: { analytics: true, marketing: true }, gtag: "function", analiticeOprite: undefined }]);
    assert.equal(typeof r.w.gtag, "function");
    assert.equal(oprit(r.w, GA), undefined);
  });

  test("⚠ fiecare semnal isi citeste categoria: marketing fara analiza", () => {
    const r = ruleaza(corp().script, { stocat: acord(false, true) });
    assert.deepEqual(r.comenzi[1], ["consent", "update", { ...ACORDAT, analytics_storage: "denied" }]);
    assert.deepEqual(r.w.__edinioAcordGoogle, { analytics: false, marketing: true });
  });

  test("⚠ fiecare semnal isi citeste categoria: analiza fara marketing", () => {
    const r = ruleaza(corp().script, { stocat: acord(true, false) });
    assert.deepEqual(r.comenzi[1], ["consent", "update", { ...REFUZAT, analytics_storage: "granted" }]);
    assert.deepEqual(r.w.__edinioAcordGoogle, { analytics: true, marketing: false });
  });
});

describe("nimic pana la acord: magazinul fara reclame Google sau cu optiunea oprita", () => {
  const cazuri: [string, Partial<Intrare>][] = [
    ["numai Analytics", { tagIds: [GA], adsId: null }],
    ["reclame Google, dar optiunea oprita de comerciant", { adsInainteDeAcord: false }],
    ["optiunea lipsa", { adsInainteDeAcord: undefined }],
    ["optiunea pornita, dar fara ID de reclame", { tagIds: [GA], adsId: "" }],
  ];

  test("⚠⚠ fara raspuns la banner, eticheta nu porneste deloc, ca inainte", () => {
    for (const [nume, p] of cazuri) {
      const c = corp(p);
      assert.equal(c.inainteDeAcord, false, nume);
      nuAPornit(ruleaza(c.script), nume);
      nuAPornit(ruleaza(c.script, { stocat: acord(false, false) }), `${nume}, dupa un refuz`);
    }
    assert.equal(corp().inainteDeAcord, true);
  });

  test("⚠ dupa acord porneste intreaga, cu acelasi script rulat din nou", () => {
    for (const [nume, p] of cazuri) {
      const c = corp(p);
      const f = fereastra();
      f.ruleaza(c.script);
      assert.equal(f.w.__edinioEtichetaGoogle, undefined, nume);
      /* Omul accepta: bannerul scrie raspunsul, iar `GoogleTag` ruleaza scriptul inca o data. */
      f.stare.stocat = acord(true, false);
      f.ruleaza(c.script);
      const comenzi = f.comenzi();
      assert.deepEqual(comenzi.slice(0, 4), [
        ["consent", "default", REFUZAT],
        ["consent", "update", { ...REFUZAT, analytics_storage: "granted" }],
        ["set", "ads_data_redaction", true],
        ["js"],
      ], nume);
      assert.deepEqual(comenzi.slice(4).map((x) => x[0]), comenzi.slice(4).map(() => "config"), nume);
      assert.equal(f.biblioteci.length, 1, nume);
      assert.deepEqual(f.golite, ["ga"], nume);
      assert.deepEqual(f.laGolire, [{ comenzi, acord: { analytics: true, marketing: false }, gtag: "function", analiticeOprite: undefined }], nume);
    }
  });

  test("⚠ la retragere Analytics se opreste pe loc si aici, iar la un nou acord porneste iar", () => {
    const f = fereastra({ stocat: acord(true, true) });
    f.ruleaza(corp({ tagIds: [GA], adsId: null }).script);
    assert.equal(oprit(f.w, GA), undefined);
    f.w.__edinioGoogleRaspuns?.(false, false);
    assert.equal(oprit(f.w, GA), true);
    assert.equal(f.w.gtag, undefined);
    f.w.__edinioGoogleRaspuns?.(true, false);
    assert.equal(oprit(f.w, GA), false);
    assert.equal(typeof f.w.gtag, "function");
  });

  test("magazinul numai cu Analytics isi cere biblioteca cu ID-ul lui", () => {
    const c = corp({ tagIds: [GA], adsId: null });
    assert.equal(c.idIncarcare, GA);
    const r = ruleaza(c.script, { stocat: acord(true, true) });
    assert.deepEqual(r.biblioteci, [{ async: true, src: `https://www.googletagmanager.com/gtag/js?id=${GA}` }]);
    assert.deepEqual(r.comenzi.slice(-1), [["config", GA]]);
    assert.equal(r.w.__edinioGoogleAds, undefined);
  });
});

describe("inainte de acord, numai pe o adresa curata", () => {
  /*
   * Gasit la recenzie, inainte de publicare. Semnalul de dinainte de acord poarta adresa paginii si pe cea a
   * paginii de unde vine omul. Pagina de confirmare are in adresa numarul comenzii, numele clientului si totalul.
   */
  const COMANDA = "?orderId=8a1f0c2e-1111-4222-8333-444455556666&name=Ion%20Popescu&total=163.98";

  test("⚠⚠ nu pe paginile de comanda: adresa lor poarta numarul comenzii, numele clientului si totalul", () => {
    for (const [cale, cautare] of [
      ["/confirm", COMANDA], [`/${SLUG}/confirm`, COMANDA], ["/confirm", "?status=esuat&motiv=refuzat&orderId=8a1f"], ["/confirm", ""],
      ["/retur", "?order=1356"], [`/${SLUG}/retur`, "?order=1356"], ["/retur", ""],
    ]) {
      nuAPornit(ruleaza(corp().script, { cale, cautare }), cale + cautare);
      nuAPornit(ruleaza(corp().script, { cale, cautare, stocat: acord(false, false) }), `${cale}${cautare}, dupa un refuz`);
    }
  });

  test("⚠⚠ nici pe o adresa cu alti parametri decat cei de campanie", () => {
    for (const cautare of [
      "?q=ciorapi", "?cos=1", "?email=ion%40exemplu.ro", "?token=abc123", "?orderId=8a1f", "?fbclid=IwAR0abc", "?msclkid=abc",
      "?utm_source=google&email=ion%40exemplu.ro", "?gclid=abc&order=1356", "?_gl=1*abc", "?mc_eid=abc123",
    ]) {
      nuAPornit(ruleaza(corp().script, { cautare }), cautare);
    }
  });

  test("porneste pe o adresa fara parametri sau numai cu parametri de campanie (si cu `gtm_debug`, al lui Tag Assistant)", () => {
    for (const cautare of [
      "", "?utm_source=google&utm_medium=cpc&utm_campaign=iarna_2026", "?gclid=Cj0abc", "?gad_source=1&gclid=Cj0abc&gbraid=0AAA",
      "?gtm_debug=1764092000000", "?utm_id=7&wbraid=abc&gclsrc=aw.ds&dclid=abc&gad_campaignid=9",
    ]) {
      const r = ruleaza(corp().script, { cautare });
      assert.equal(r.biblioteci.length, 1, `${cautare}: eticheta n-a pornit`);
      assert.deepEqual(r.comenzi.slice(-1), [["config", ADS]]);
    }
    /* Si pe paginile obisnuite ale magazinului, oricat de adanci. */
    for (const cale of ["/", "/product/vaza-verde", `/${SLUG}/magazin/decoratiuni`, "/checkout", "/cos", "/confirmare-inscriere", "/retururi-si-garantii"]) {
      assert.equal(ruleaza(corp().script, { cale }).biblioteci.length, 1, `${cale}: eticheta n-a pornit`);
    }
  });

  test("⚠⚠ nici cand omul VINE de pe o pagina de comanda a magazinului: adresa ei ar pleca drept pagina de unde vine", () => {
    /* Dupa comanda, `Inapoi la magazin` e o incarcare completa: `document.referrer` e adresa de confirmare. */
    for (const deUnde of [`${ORIGINE}/confirm${COMANDA}`, `${ORIGINE}/${SLUG}/confirm${COMANDA}`, `${ORIGINE}/retur?order=1356`, `${ORIGINE}/cautare?q=ciorapi`]) {
      nuAPornit(ruleaza(corp().script, { deUnde }), deUnde);
    }
    /*
     * ⚠⚠ Si din ZONA DE CONT (gasit la recenzie): din `/cont/comenzi/<id>` se iese printr-o incarcare completa
     * (sigla din antet e un `<a>`), deci adresa cu identificatorul comenzii ar fi plecat drept pagina de
     * provenienta. Adresele astea n-au niciun parametru: le opreste numai DRUMUL.
     */
    for (const deUnde of [`${ORIGINE}/cont/comenzi/8a1f0c2e-1111-4222-8333-444455556666`, `${ORIGINE}/${SLUG}/cont/comenzi/8a1f0c2e`, `${ORIGINE}/cont`, `${ORIGINE}/cont/date`, `${ORIGINE}/confirm`, `${ORIGINE}/retur`]) {
      nuAPornit(ruleaza(corp().script, { deUnde }), deUnde);
      /* Cu acord, pagina de provenienta nu opreste nimic. */
      assert.equal(ruleaza(corp().script, { deUnde, stocat: acord(false, true) }).biblioteci.length, 1, `${deUnde}, cu acord`);
    }
    /* O pagina obisnuita a magazinului (si una care doar incepe cu „cont”), un alt site sau nicio pagina nu opresc nimic. */
    for (const deUnde of ["", `${ORIGINE}/product/vaza-verde`, `${ORIGINE}/?utm_source=google`, `${ORIGINE}/contact`, "https://www.google.com/", "https://alt-site.test/confirm?orderId=1", "https://alt-site.test/cont/comenzi/1"]) {
      assert.equal(ruleaza(corp().script, { deUnde }).biblioteci.length, 1, `${deUnde}: eticheta n-a pornit`);
    }
    /* O adresa de provenienta care nu se poate citi opreste pornirea de dinainte de acord. */
    nuAPornit(ruleaza(corp().script, { deUnde: "nu e o adresa" }), "referrer stricat");
  });

  test("⚠ cu acord, eticheta porneste si pe pagina de confirmare: conversia cumparatorului care a acceptat nu se pierde", () => {
    const r = ruleaza(corp().script, { cale: "/confirm", cautare: COMANDA, stocat: acord(true, true) });
    assert.deepEqual(r.comenzi.slice(-2), [["config", ADS], ["config", GA]]);
    assert.deepEqual(r.golite, ["ga"], "achizitia si conversia din coada n-au plecat");
    /* Si cand accepta chiar pe pagina de confirmare: a doua rulare, pornita de `GoogleTag` la raspuns. */
    const f = fereastra({ cale: "/confirm", cautare: COMANDA });
    f.ruleaza(corp().script);
    assert.equal(f.w.__edinioEtichetaGoogle, undefined);
    f.stare.stocat = acord(false, true);
    f.ruleaza(corp().script);
    assert.equal(f.w.__edinioEtichetaGoogle, true);
    assert.deepEqual(f.golite, ["ga"]);
  });

  test("magazinul fara banner si cel cu optiunea oprita nu sunt atinse de regula", () => {
    /* Fara banner totul e acordat, ca inainte: porneste si pe pagina de confirmare. */
    assert.equal(ruleaza(corp({ cuBanner: false }).script, { cale: "/confirm", cautare: COMANDA }).biblioteci.length, 1);
    /* Cu optiunea oprita nu porneste nicaieri fara acord, deci nici aici. */
    nuAPornit(ruleaza(corp({ adsInainteDeAcord: false }).script, { cale: "/confirm", cautare: COMANDA }), "optiunea oprita");
    assert.equal(corp({ adsInainteDeAcord: false }).script.includes("adresaCurata"), false, "regula e scrisa si unde n-are ce face");
  });
});

describe("unde NU porneste eticheta, si o singura pornire pe pagina", () => {
  test("⚠⚠ nu in previzualizarea din editor: fiecare salvare ar trimite o vizita care n-a existat", () => {
    nuAPornit(ruleaza(corp().script, { cautare: "?preview=1", stocat: acord(true, true) }), "?preview=1");
    nuAPornit(ruleaza(corp().script, { cautare: "?tema=marte&preview=1" }), "?tema=marte&preview=1");
    /* Numai valoarea „1”, ca in `DoarInMagazinReal`. (Cu acord: fara el, un parametru necunoscut opreste oricum pornirea.) */
    assert.equal(ruleaza(corp().script, { cautare: "?preview=0", stocat: acord(true, true) }).biblioteci.length, 1);
    assert.equal(ruleaza(corp().script, { cautare: "?altpreview=1", stocat: acord(true, true) }).biblioteci.length, 1);
  });

  test("⚠⚠ nu in zona de cont a cumparatorului: adresa de acolo poarta identificatorul comenzii", () => {
    for (const cale of ["/cont", "/cont/", "/cont/comenzi/8a1f", "/cont/intra", `/${SLUG}/cont`, `/${SLUG}/cont/comenzi/8a1f`]) {
      const r = ruleaza(corp().script, { cale, stocat: acord(true, true) });
      nuAPornit(r, cale);
      assert.deepEqual(r.citite, [], `${cale}: s-a citit raspunsul la banner`);
      assert.equal(eZonaDeCont(cale, SLUG), true, `${cale}: proba si regula din aplicatie nu mai spun acelasi lucru`);
    }
  });

  test("⚠ o pagina sau un produs care doar incep cu „cont” nu e zona de cont", () => {
    for (const cale of ["/", "/contact", "/conturi", "/produs/cont-de-economii", `/${SLUG}`, `/${SLUG}/contact`, "/magazin/cont", "/alt-magazin/cont"]) {
      assert.equal(ruleaza(corp().script, { cale }).biblioteci.length, 1, `${cale}: eticheta n-a pornit`);
      assert.equal(eZonaDeCont(cale, SLUG), false, `${cale}: regula din aplicatie o socoteste zona de cont`);
    }
  });

  test("⚠ o singura pornire: a doua rulare pe aceeasi pagina nu mai face nimic", () => {
    /* Scriptul scris de server ruleaza la citirea paginii; `GoogleTag` il ruleaza din nou, de rezerva. */
    const f = fereastra({ stocat: acord(true, true) });
    f.ruleaza(corp().script);
    const inainte = f.comenzi().length;
    f.ruleaza(corp().script);
    assert.equal(f.comenzi().length, inainte, "a doua rulare a mai trimis comenzi");
    assert.equal(f.biblioteci.length, 1, "biblioteca s-a cerut de doua ori");
    assert.deepEqual(f.golite, ["ga"]);
  });

  test("o adresa care nu se poate citi opreste pornirea, nu o lasa sa treaca de paza", () => {
    /*
     * ⚠ Si cu un ACORD scris (gasit la recenzie): fara el, regula adresei curate se impiedica de aceeasi adresa
     * si opreste singura scriptul, deci proba trecea si cu paza de previzualizare si de zona de cont scoasa.
     */
    for (const stocat of [null, JSON.stringify(acord(true, true))]) {
      const w = {
        localStorage: { getItem: () => stocat },
        get location(): never { throw new Error("adresa nu se poate citi"); },
        document: { createElement: () => ({}), head: { appendChild: () => { throw new Error("nu trebuia sa ajunga aici"); } } },
      } as unknown as Fereastra;
      new Function("window", corp().script)(w);
      assert.equal(w.dataLayer, undefined, `stocat: ${stocat}`);
      assert.equal(w.__edinioEtichetaGoogle, undefined, `stocat: ${stocat}`);
    }
  });
});

describe("magazinul fara banner si cazurile de margine", () => {
  test("bannerul oprit din panou: nu raspunde nimeni, deci totul pleaca acordat, ca inainte", () => {
    for (const adsInainteDeAcord of [true, false]) {
      const r = ruleaza(corp({ cuBanner: false, adsInainteDeAcord }).script, { stocat: acord(false, false) });
      assert.deepEqual(r.comenzi, [["consent", "default", ACORDAT], ["js"], ["config", ADS], ["config", GA]]);
      assert.deepEqual(r.w.__edinioAcordGoogle, { analytics: true, marketing: true });
      assert.deepEqual(r.citite, [], "fara banner nu e nimic de citit");
      assert.deepEqual(r.golite, ["ga"]);
    }
    assert.equal(corp({ cuBanner: false }).inainteDeAcord, false, "fara banner nu exista „inainte de acord”");
  });

  test("⚠⚠ cu banner si fara numele magazinului nu se acorda nimic", () => {
    /*
     * Fara nume nu se poate citi raspunsul omului. O eticheta fara stare implicita se poarta ca si cum ar avea
     * acordul, iar una care poate porni inainte de raspuns nu are voie sa cada pe „acordat”.
     */
    for (const slug of [undefined, null, "", "   "]) {
      const r = ruleaza(corp({ slug }).script, { stocat: acord(true, true) });
      assert.deepEqual(r.comenzi, [["consent", "default", REFUZAT], ["set", "ads_data_redaction", true], ["js"], ["config", ADS]], `slug: ${JSON.stringify(slug)}`);
      assert.deepEqual(r.w.__edinioAcordGoogle, { analytics: false, marketing: false });
      /* Si fara nume, zona de cont de pe domeniul propriu ramane pazita. */
      assert.deepEqual(ruleaza(corp({ slug }).script, { cale: "/cont/comenzi/1" }).comenzi, []);
    }
  });

  test("ID-ul de conversie ajunge in runtime numai cand magazinul il are", () => {
    assert.deepEqual(ruleaza(corp().script).w.__edinioGoogleAds, { id: ADS });
    assert.equal(ruleaza(corp({ adsId: null, tagIds: [GA] }).script, { stocat: acord(true, true) }).w.__edinioGoogleAds, undefined);
  });

  test("un `gtag` pus in pagina de altcineva ramane al lui: nu e inlocuit si nu e sters; comenzile noastre merg in `dataLayer`", () => {
    const dinainte: unknown[][] = [];
    const strain = (...a: unknown[]) => { dinainte.push(a); };
    const f = fereastra({ stocat: acord(true, true) });
    f.w.gtag = strain;
    f.ruleaza(corp().script);
    assert.equal(f.w.gtag, strain, "un `gtag` gasit in pagina a fost inlocuit");
    assert.equal(dinainte.length, 0, "comenzile etichetei au trecut prin functia altcuiva");
    assert.equal(f.comenzi().length, 6);
    f.w.__edinioGoogleRaspuns?.(false, false);
    assert.equal(f.w.gtag, strain, "la retragere s-a sters un `gtag` care nu era al nostru");
  });

  test("un `dataLayer` gasit in pagina se pastreaza, cu ce avea in el", () => {
    const f = fereastra();
    const alAltcuiva = { event: "ceva-de-dinainte" } as unknown as ArrayLike<unknown>;
    f.w.dataLayer = [alAltcuiva];
    f.ruleaza(corp().script);
    assert.equal(f.w.dataLayer[0], alAltcuiva, "ce era in `dataLayer` s-a pierdut");
    assert.equal(f.w.dataLayer.length, 5);
  });

  test("fara niciun ID nu exista script; dublurile si golurile cad; ID-ul de reclame e primul", () => {
    assert.equal(corpEticheteiGoogle({ tagIds: [], slug: SLUG, cuBanner: true }), null);
    assert.equal(corpEticheteiGoogle({ tagIds: [null, "", "  "], slug: SLUG, cuBanner: true, adsId: " " }), null);
    assert.deepEqual(iduriCurate(["G-ABC12345", null, "AW-123456789", "G-ABC12345", " AW-123456789 "]), ["G-ABC12345", "AW-123456789"]);
    assert.equal(ADRESA_BIBLIOTECII, "https://www.googletagmanager.com/gtag/js");
    /* Biblioteca se cere cu ID-ul de reclame, oricum ar veni lista: el e cel configurat inainte de acord. */
    const c = corp({ tagIds: ["G-ABC12345", "AW-123456789"], adsId: "AW-123456789" });
    assert.equal(c.idIncarcare, "AW-123456789");
    assert.deepEqual(ruleaza(c.script, { stocat: acord(true, true) }).comenzi.slice(-2), [["config", "AW-123456789"], ["config", "G-ABC12345"]]);
  });

  test("⚠ valorile ajung intr-un script scris in pagina: tot ce nu e caracter de ID se taie", () => {
    const murdar = corpEticheteiGoogle({
      tagIds: ["G-123');window.spart=1;//"], slug: "magazin');window.spart=2;//</script><script>", cuBanner: true,
      adsId: "AW-9'};window.spart=3;//", adsInainteDeAcord: true,
    });
    assert.ok(murdar);
    const r = ruleaza(murdar.script, { stocat: undefined });
    assert.equal((r.w as unknown as { spart?: number }).spart, undefined, "o valoare din baza a ajuns sa ruleze ca script");
    assert.deepEqual(r.comenzi.slice(-1), [["config", "AW-9windowspart3"]]);
    assert.deepEqual(r.citite, ["edinio_cc_magazinwindowspart2scriptscript"]);
    assert.equal(murdar.idIncarcare, "AW-9windowspart3");
    /* Scriptul e pus intre `<script>` si `</script>` de server: nimic din el nu are voie sa inchida eticheta. */
    assert.equal(murdar.script.includes("</"), false);
    assert.equal(corp().script.includes("</"), false);
  });
});

describe("categoriile bannerului si optiunea comerciantului", () => {
  test("⚠ Google Ads aprinde categoria „Marketing” din banner, nu „Analiza”", () => {
    /*
     * Pana pe 25.11.2026 un magazin care avea NUMAI Google Ads nu arata „Marketing”: vizitatorul care isi
     * alegea preferintele nu avea unde sa dea acordul pentru reclame, deci semnalele `ad_*` ramaneau refuzate.
     */
    const cat = (mc: Record<string, string>, ga: string | null = null) => detectConsentCategories(mc as never, ga, false, false);
    assert.deepEqual(cat({ google_ads_conversion_id: ADS }), ["marketing"]);
    assert.deepEqual(cat({ google_tag_id: ADS }), ["marketing"], "un tag `AW-` e de reclame, nu de analiza");
    assert.deepEqual(cat({ google_tag_id: ADS.toLowerCase() }), ["marketing"]);
    assert.deepEqual(cat({ google_tag_id: GA }), ["analytics"]);
    assert.deepEqual(cat({ google_tag_id: "GT-ABCDEF1" }), ["analytics"]);
    assert.deepEqual(cat({ google_tag_id: GA, google_ads_conversion_id: ADS }), ["analytics", "marketing"]);
    assert.deepEqual(cat({ google_tag_id: ADS }, GA), ["analytics", "marketing"]);
    assert.deepEqual(cat({}, GA), ["analytics"]);
    /* Un ID care nu e de Google Ads, pus in campul de conversie, nu aprinde nimic. */
    assert.deepEqual(cat({ google_ads_conversion_id: GA }), []);
    assert.deepEqual(cat({}), []);
    assert.equal(magazinulAreGoogleAds({ google_ads_conversion_id: ADS } as never), true);
    assert.equal(magazinulAreGoogleAds({ google_tag_id: ADS } as never), true);
    assert.equal(magazinulAreGoogleAds({ google_tag_id: GA } as never), false);
    assert.equal(magazinulAreGoogleAds(null), false);
  });

  test("⚠ optiunea comerciantului: numai un `true` sau un `false` scris de el conteaza", () => {
    assert.equal(GOOGLE_ADS_INAINTE_DE_ACORD_IMPLICIT, true, "valoarea din oficiu s-a schimbat: proprietarul a ales „Pornită la toți” (25.11.2026), nu se muta fara el");
    assert.equal(DEFAULT_COOKIE_BANNER_CONFIG.google_ads_inainte_de_acord, GOOGLE_ADS_INAINTE_DE_ACORD_IMPLICIT);
    /* Magazinele de dinainte nu au cheia: primesc valoarea din oficiu. */
    assert.equal(parseCookieBannerConfig({ enabled: true, position: "center" }).google_ads_inainte_de_acord, true);
    assert.equal(parseCookieBannerConfig(null).google_ads_inainte_de_acord, true);
    assert.equal(parseCookieBannerConfig({ google_ads_inainte_de_acord: false }).google_ads_inainte_de_acord, false);
    assert.equal(parseCookieBannerConfig({ google_ads_inainte_de_acord: true }).google_ads_inainte_de_acord, true);
    for (const ciudat of ["false", 0, null, "nu", {}]) {
      assert.equal(parseCookieBannerConfig({ google_ads_inainte_de_acord: ciudat }).google_ads_inainte_de_acord, true, JSON.stringify(ciudat));
    }
    /* Restul configuratiei ramane cum era. */
    assert.deepEqual(parseCookieBannerConfig({ enabled: false, position: "bottom-left", google_ads_inainte_de_acord: false }),
      { enabled: false, position: "bottom-left", google_ads_inainte_de_acord: false });
  });
});

describe("cablarea din vitrina si din panou", () => {
  const layout = readFileSync("src/app/(public)/[slug]/layout.tsx", "utf8");
  const componenta = readFileSync("src/components/public/GoogleTag.tsx", "utf8");
  const banner = readFileSync("src/components/public/CookieConsent.tsx", "utf8");

  test("⚠⚠ scriptul etichetei e scris de server in pagina, cu optiunea comerciantului", () => {
    assert.ok(layout.includes("adsInainteDeAcord: cookieConfig.google_ads_inainte_de_acord,"));
    assert.match(layout, /const etichetaGoogle = corpEticheteiGoogle\(\{\s+tagIds: googleTagIds, slug, cuBanner: requireConsent, adsId: adsConversionId,/);
    const scris = layout.indexOf('{etichetaGoogle && <script id="eticheta-google" dangerouslySetInnerHTML={{ __html: etichetaGoogle.script }} />}');
    assert.ok(scris > 0, "scriptul etichetei nu mai e scris in pagina de server");
    /*
     * ⚠⚠ In afara ORICAREI componente: intre inceputul paginii si script nu se deschide nimic. Sub o componenta de
     * client (`ConsentGate`, `DoarInMagazinReal`) scriptul n-ar mai ajunge in pagina trimisa de server, iar
     * eticheta ar porni abia dupa hidratare: exact starea in care Google Ads spunea ca lipseste. (Gasit la
     * recenzie: proba veche se uita numai dupa prima `DoarInAfaraContului` si trecea cu scriptul pus sub poarta.)
     */
    /* Copil direct al radacinii, imediat dupa primul ei element: si un invelis deschis INAINTEA lui l-ar scoate din pagina. */
    const panaLaScript = layout.slice(layout.lastIndexOf("return (", scris), scris).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\s+/g, " ");
    assert.equal(panaLaScript, "return ( <> <FeteRomanesti /> ", "intre radacina paginii si scriptul etichetei a aparut o componenta");
    assert.ok(scris < layout.indexOf("<DoarInAfaraContului slug={slug} niciDupaIesire>"), "scriptul a ajuns sub o componenta care pe server nu deseneaza");
    /* De unde vin cele doua hotarari ale scriptului: bannerul pornit sau nu, si optiunea comerciantului. */
    assert.match(layout, /^ {4}cookieRaw = settings\?\.cookie_banner_config \?\? null;$/m, "configuratia bannerului nu mai vine din randul magazinului");
    assert.match(layout, /^ {2}const cookieConfig = parseCookieBannerConfig\(cookieRaw\);$/m);
    assert.match(layout, /^ {2}const requireConsent = cookieConfig\.enabled;$/m, "fara asta, toate magazinele ar porni cu semnalele acordate");
    /* Pixelii raman dupa poarta de consimtamant: ei nu au un mod in care sa porneasca refuzati. */
    for (const pixel of ["FacebookPixel", "TikTokPixel", "TheMarketerTracking"]) {
      assert.match(layout, new RegExp(`<ConsentGate slug=\\{slug\\} category="marketing" bypass=\\{!requireConsent\\}><${pixel} `), `${pixel} a iesit de dupa poarta`);
    }
  });

  test("jumatatea din browser primeste aceeasi optiune si ramane in afara previzualizarii si a zonei de cont", () => {
    const linie = "<GoogleTag tagIds={googleTagIds} slug={slug} requireConsent={requireConsent} adsId={adsConversionId} adsInainteDeAcord={cookieConfig.google_ads_inainte_de_acord} />";
    assert.ok(layout.includes(linie));
    const eticheta = layout.indexOf(linie);
    assert.ok(eticheta > layout.indexOf("<DoarInMagazinReal>") && eticheta < layout.indexOf("</DoarInMagazinReal>"));
    /* ⚠ Cu `niciDupaIesire`: un document incarcat in zona de cont nu mai primeste pixeli nici dupa iesirea din ea. */
    assert.ok(eticheta > layout.indexOf("<DoarInAfaraContului slug={slug} niciDupaIesire>") && eticheta < layout.indexOf("</DoarInAfaraContului>"));
    /* Acelasi script ca serverul, ca a doua rulare sa nu faca altceva decat prima. */
    assert.ok(componenta.includes("corpEticheteiGoogle({ tagIds, slug, cuBanner: requireConsent, adsId, adsInainteDeAcord })?.script ?? null;"));
    assert.equal(componenta.includes("next/script"), false, "eticheta se mai incarca si pe alt drum");
    /*
     * Purtarea din browser sta in `legatura.ts` si se probeaza RULAND-O (blocul de mai jos). Aici ramane doar
     * cablarea: componenta o cheama cu fereastra adevarata, cu scriptul ei, cu bannerul si cu cititorul acordului,
     * si intoarce functia care desface legatura.
     */
    assert.match(componenta, /if \(!script\) return;\s+return leagaEtichetaGoogle\(\{\s+fereastra: window as unknown as FereastraEtichetei,\s+script,\s+slug: safeSlug,\s+cuBanner: requireConsent,\s+citesteAcord: readConsent,\s+\}\);\s+\}, \[script, safeSlug, requireConsent\]\);/);
  });

  test("⚠ bannerul spune ca eticheta Google Ads porneste si fara acord, acolo unde chiar porneste", () => {
    assert.ok(layout.includes("googleAdsInainteDeAcord={etichetaGoogle?.inainteDeAcord === true}"));
    assert.ok(layout.includes('const furnizoriMarketing = [adsConversionId && "Google Ads", fbPixelId && "Facebook", ttPixelId && "TikTok", tm && "theMarketer"]'));
    assert.ok(banner.includes("desc={descriereMarketing(furnizoriMarketing, googleAdsInainteDeAcord)}"));
    assert.ok(banner.includes("return googleAdsInainteDeAcord ? `${baza} ${NOTA_GOOGLE_ADS}` : baza;"));
    /* ⚠ Si in bara de la primul nivel: cine apasa „Refuza” direct de acolo nu deschide panoul cu categorii. */
    const bara = banner.slice(banner.indexOf("if (isBar) {"), banner.indexOf("// ── Card / details view"));
    assert.ok(bara.includes("{googleAdsInainteDeAcord && <>{NOTA_GOOGLE_ADS}{\" \"}</>}"), "bara de la primul nivel nu spune ca eticheta Google Ads se incarca si la refuz");
    assert.ok(bara.indexOf("NOTA_GOOGLE_ADS") < bara.indexOf("onClick={rejectAll}"), "nota vine dupa butonul de refuz");
    /* Text de vitrina: fara diacritice, si fara sa promita ca refuzul opreste orice legatura cu Google. */
    const nota = /export const NOTA_GOOGLE_ADS =\s+"([^"]+)";/.exec(banner)?.[1] ?? "";
    assert.ok(nota.includes("si daca refuzi"), "nota nu mai spune ca eticheta lucreaza si la refuz");
    assert.ok(nota.includes("fara cookie-uri"));
    assert.equal(/[ăâîșțĂÂÎȘȚ]/.test(nota), false, "textul din vitrina are diacritice");
  });

  test("⚠ cine n-a fost intrebat de marketing e intrebat o data: bannerul primeste ce arata magazinul acum", () => {
    /* Regula e in `bannerDecis` si se probeaza ruland-o (`cookie-consent-neintrebate.test.ts`); aici, cablarea. */
    assert.ok(layout.includes("const marketingDoarGoogleAds = Boolean(adsConversionId) && !fbPixelId && !ttPixelId && tm === null;"));
    assert.ok(layout.includes("marketingDoarGoogleAds={marketingDoarGoogleAds}"));
    assert.ok(banner.includes("if (bannerDecis(slug, { categorii: aratate, marketingDoarGoogleAds: marketingDoarGoogleAds === true })) {"));
    assert.ok(banner.includes("const aratate = cheieCategorii.split(\",\").filter(Boolean) as ConsentCategory[];"));
    /* Raspunsul se scrie cu lista categoriilor aratate: altfel o categorie aparuta mai tarziu ar trece drept refuzata. */
    assert.ok(banner.includes("writeConsent(slug, state, categories);"));
  });

  test("comerciantul are optiunea in Setari > Banner Cookies, numai cand are reclame Google", () => {
    const setari = readFileSync("src/components/dashboard/SettingsClient.tsx", "utf8");
    assert.ok(setari.includes("{areGoogleAds && cookieCfg.enabled && ("));
    assert.ok(setari.includes("checked={cookieCfg.google_ads_inainte_de_acord}"));
    assert.ok(setari.includes("onCheckedChange={(v) => setCookieCfg(c => ({ ...c, google_ads_inainte_de_acord: v }))}"));
    const pagina = readFileSync("src/app/(dashboard)/dashboard/settings/page.tsx", "utf8");
    assert.ok(pagina.includes("areGoogleAds={magazinulAreGoogleAds(storeSettings?.marketing_config as MarketingConfig | null)}"));
    /* Salvarea trece prin acelasi curatator, deci cheia noua se pastreaza. */
    assert.ok(readFileSync("src/lib/actions/store.actions.ts", "utf8").includes("const sanitized = parseCookieBannerConfig(config);"));
  });
});

describe("jumatatea din browser: raspunsul din banner ajunge la eticheta (`legatura.ts`)", () => {
  /*
   * Functia pe care o cheama `GoogleTag`, RULATA in aceeasi fereastra falsa ca scriptul. Cat a stat in componenta,
   * probele ii citeau doar textul: ascultatorul scos, raspunsul aplicat pe dos sau scriptul nepus in pagina
   * treceau neobservate (11 din 13 stricaciuni incercate la recenzie).
   */
  type Cadru = ReturnType<typeof fereastra>;
  /* Cititorul acordului, ca `readConsent`: ce a scris bannerul sub versiunea de acum, sau nimic. */
  const cititor = (f: Cadru) => () => {
    const s = f.stare.stocat as { analytics?: boolean; marketing?: boolean; v?: number } | undefined;
    return s && s.v === CONSENT_VERSION ? { analytics: !!s.analytics, marketing: !!s.marketing } : null;
  };
  const leaga = (f: Cadru, c = corp(), p: { slug?: string; cuBanner?: boolean } = {}) => leagaEtichetaGoogle({
    fereastra: f.w as unknown as FereastraEtichetei, script: c.script, slug: p.slug ?? SLUG, cuBanner: p.cuBanner ?? true, citesteAcord: cititor(f),
  });
  const actualizari = (f: Cadru) => f.comenzi().filter((c) => c[0] === "consent" && c[1] === "update").map((c) => c[2]);

  test("⚠ la legare pune scriptul in pagina: daca cel scris de server n-a rulat, eticheta porneste de aici", () => {
    const f = fereastra();
    leaga(f);
    assert.deepEqual(f.puseInPagina, [corp().script], "scriptul etichetei n-a fost pus in pagina, sau a fost pus altul");
    assert.deepEqual(f.comenzi(), [["consent", "default", REFUZAT], ["set", "ads_data_redaction", true], ["js"], ["config", ADS]]);
    assert.equal(f.biblioteci.length, 1);
  });

  test("cand scriptul a rulat deja din pagina, legarea nu mai porneste nimic", () => {
    const f = fereastra();
    f.ruleaza(corp().script);
    const inainte = f.comenzi().length;
    leaga(f);
    assert.equal(f.comenzi().length, inainte);
    assert.equal(f.biblioteci.length, 1, "biblioteca s-a cerut a doua oara");
  });

  test("⚠⚠ omul raspunde in banner: raspunsul SCRIS ajunge la eticheta pornita, categorie cu categorie", () => {
    const f = fereastra();
    f.ruleaza(corp().script);
    leaga(f);
    assert.deepEqual(f.ascultatori.map(([tip]) => tip), [CONSENT_EVENT], "legatura nu asculta evenimentul bannerului");
    /* Numai marketing: daca argumentele ar fi puse pe dos, s-ar acorda analiza. */
    f.stare.stocat = acord(false, true);
    f.anunta(CONSENT_EVENT);
    assert.deepEqual(actualizari(f), [{ ...ACORDAT, analytics_storage: "denied" }]);
    assert.deepEqual(f.w.__edinioAcordGoogle, { analytics: false, marketing: true });
    /* Numai analiza. */
    f.stare.stocat = acord(true, false);
    f.anunta(CONSENT_EVENT);
    assert.deepEqual(actualizari(f).slice(-1), [{ ...REFUZAT, analytics_storage: "granted" }]);
    /* Retragerea. */
    f.stare.stocat = acord(false, false);
    f.anunta(CONSENT_EVENT);
    assert.deepEqual(actualizari(f).slice(-1), [REFUZAT]);
    assert.deepEqual(f.w.__edinioAcordGoogle, { analytics: false, marketing: false });
    assert.equal(f.puseInPagina.length, 1, "scriptul s-a pus din nou in pagina desi eticheta era pornita");
  });

  test("⚠⚠ la magazinul unde eticheta n-are voie inainte de acord, raspunsul o porneste", () => {
    for (const c of [corp({ tagIds: [GA], adsId: null }), corp({ adsInainteDeAcord: false })]) {
      const f = fereastra();
      leaga(f, c);
      assert.equal(f.w.__edinioEtichetaGoogle, undefined);
      /* Un anunt fara raspuns scris nu porneste nimic. */
      f.anunta(CONSENT_EVENT);
      assert.equal(f.puseInPagina.length, 1);
      assert.equal(f.w.__edinioEtichetaGoogle, undefined);
      /* Omul accepta: scriptul se pune inca o data in pagina si porneste cu raspunsul abia scris. */
      f.stare.stocat = acord(true, true);
      f.anunta(CONSENT_EVENT);
      assert.equal(f.puseInPagina.length, 2);
      assert.equal(f.w.__edinioEtichetaGoogle, true);
      assert.deepEqual(f.comenzi().slice(0, 2), [["consent", "default", REFUZAT], ["consent", "update", ACORDAT]]);
      assert.deepEqual(f.golite, ["ga"]);
    }
  });

  test("⚠ raspunsul dat cat legatura nu exista se aplica la legare, o singura data, cu valorile scrise", () => {
    /* Eticheta a pornit pe refuz; intre timp omul a acceptat numai analiza (bannerul traieste si fara legatura). */
    const f = fereastra();
    f.ruleaza(corp().script);
    f.stare.stocat = acord(true, false);
    const desfa = leaga(f);
    assert.deepEqual(actualizari(f), [{ ...REFUZAT, analytics_storage: "granted" }]);
    assert.deepEqual(f.w.__edinioAcordGoogle, { analytics: true, marketing: false });
    assert.deepEqual(f.golite, ["ga"]);
    /* A doua legare gaseste eticheta la zi: nu mai spune nimic. */
    desfa();
    leaga(f);
    assert.equal(actualizari(f).length, 1, "acelasi raspuns s-a aplicat de doua ori la legare");
    /* Si pe dos: eticheta a pornit cu acord, iar omul si l-a retras intre timp. */
    const g = fereastra({ stocat: acord(true, true) });
    g.ruleaza(corp().script);
    g.stare.stocat = acord(false, false);
    leaga(g);
    assert.deepEqual(actualizari(g).slice(-1), [REFUZAT], "retragerea facuta intre timp nu a ajuns la eticheta");
    /* Fara raspuns scris, legarea nu inventeaza unul. */
    const h = fereastra();
    h.ruleaza(corp().script);
    leaga(h);
    assert.deepEqual(actualizari(h), []);
  });

  test("⚠ desfacerea legaturii scoate ascultatorul", () => {
    const f = fereastra();
    f.ruleaza(corp().script);
    const desfa = leaga(f);
    assert.equal(f.ascultatori.length, 1);
    desfa();
    assert.equal(f.ascultatori.length, 0, "ascultatorul a ramas dupa desfacere");
    f.stare.stocat = acord(true, true);
    f.anunta(CONSENT_EVENT);
    assert.deepEqual(actualizari(f), []);
  });

  test("fara banner, sau fara numele magazinului, eticheta porneste si nu se asculta nimic", () => {
    const faraBanner = fereastra();
    leaga(faraBanner, corp({ cuBanner: false }), { cuBanner: false });
    assert.deepEqual(faraBanner.comenzi()[0], ["consent", "default", ACORDAT]);
    assert.equal(faraBanner.ascultatori.length, 0);
    const faraNume = fereastra();
    leaga(faraNume, corp({ slug: "" }), { slug: "" });
    assert.equal(faraNume.puseInPagina.length, 1);
    assert.equal(faraNume.ascultatori.length, 0);
  });
});

describe("adresa paginii de confirmare", () => {
  test("⚠ poarta numai identificatorul comenzii: numele clientului si totalul nu se mai pun in adresa", () => {
    /*
     * Pagina de confirmare isi citeste numele si totalul din comanda. Puse in adresa, ajungeau in
     * `page_location`-ul fiecarui pixel incarcat acolo (cu acord), in istoricul browserului si in pagina de
     * provenienta a paginii urmatoare. Drumul nou de comanda le scosese; la recenzie s-au gasit inca cinci.
     */
    const DRUMURI = [
      "src/components/ministore/OrderModal.tsx", "src/components/storefront/sections/checkout/checkout-core.ts",
      "src/app/api/netopia/start/route.ts", "src/app/api/ipay/return/route.ts",
      "src/app/api/klarna/return/route.ts", "src/app/api/revolut/return/route.ts",
    ];
    for (const f of DRUMURI) {
      const cod = readFileSync(f, "utf8");
      const adrese = cod.match(/\/confirm\?[^`"']*/g) ?? [];
      assert.ok(adrese.some((a) => a.includes("orderId=")), `${f}: nu mai construieste adresa de confirmare a comenzii (proba trebuie adusa la zi)`);
      for (const a of adrese) {
        assert.equal(/[?&](name|total)=/.test(a), false, `${f}: adresa de confirmare poarta numele sau totalul: ${a}`);
      }
    }
    /* Pagina le ia din comanda; parametrii din adresa au ramas doar refugiu pentru legaturile vechi. */
    const pagina = readFileSync("src/app/(public)/[slug]/confirm/page.tsx", "utf8");
    assert.ok(pagina.includes("Multumim{customerName || name ? `, ${customerName ?? name}` : \"\"}!"));
    assert.ok(pagina.includes("totalComanda = order.total != null ? Number(order.total) : null;"));
  });
});

describe("numai ID-uri de eticheta Google ajung in script", () => {
  test("⚠⚠ un ID de container (`GTM-…`) scris direct in baza nu incarca nimic", () => {
    /*
     * Salvarea din panou refuza un `GTM-`, dar comerciantul isi poate scrie randul direct in baza. Biblioteca
     * incarcata cu un ID `GTM-` e un container intreg, in care ruleaza orice script, pe fiecare pagina.
     */
    assert.deepEqual(iduriCurate(["GTM-ABC1234", "gtm-abc1234", "DC-1234567", "UA-123456-1", "AW-123456789", "G-ABC12345", "GT-ABCDEF1"]),
      ["AW-123456789", "G-ABC12345", "GT-ABCDEF1"]);
    assert.equal(corpEticheteiGoogle({ tagIds: ["GTM-ABC1234"], slug: SLUG, cuBanner: true, adsId: "GTM-ABC1234", adsInainteDeAcord: true }), null);
    const amestec = corp({ tagIds: ["GTM-ABC1234", GA], adsId: ADS });
    assert.equal(amestec.script.includes("GTM-"), false);
    assert.deepEqual(ruleaza(amestec.script, { stocat: acord(true, true) }).comenzi.slice(-2), [["config", ADS], ["config", GA]]);
  });

  test("⚠ eticheta care poate porni inainte de acord e numai una de reclame (`AW-`)", () => {
    /* Un ID de Analytics pus, direct in baza, in campul de conversie nu are voie sa porneasca fara acord. */
    for (const adsId of [GA, "GT-ABCDEF1", "GTM-ABC1234", "AW-1"]) {
      const c = corp({ tagIds: [GA], adsId });
      assert.equal(c.inainteDeAcord, false, adsId);
      nuAPornit(ruleaza(c.script), adsId);
    }
  });
});
