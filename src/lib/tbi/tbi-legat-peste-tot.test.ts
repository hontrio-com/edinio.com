import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { faraComentarii } from "@/lib/edinio-marketing/fara-comentarii";
import { apiFaraPoarta } from "@/lib/auth/poarta-mfa";
import { CAMPURI_SECRETE } from "@/lib/integrari/secrete";
import { PLATI_ONLINE } from "@/lib/orders/vanzare-confirmata";
import { PAYMENT_METHOD_DEFAULT_LABELS, PAYMENT_PROCESSOR_TYPES } from "@/lib/payment-methods";
import { tipIncasareOblio } from "@/lib/billing/incasare";
import { modulDePlata } from "@/lib/easysales/mapare-comanda";
import { FORME_BANNER_TBI } from "@/lib/tbi/config";
import { EXTENSII_STATICE } from "@/lib/segmente-rezervate";

/*
 * ═══ tbi bank: LEGATA PESTE TOT, SI IN ORDINEA BUNA ═══
 *
 * Un procesator nou se leaga in ~20 de locuri (lista e in `docs/plati/TBI.md`). Fiecare uitare de
 * aici a existat deja la altcineva: Netopia fara ruta de intoarcere a raportat venit pentru plati
 * refuzate, Klarna lipsa din selectul Setarilor arata „neconfigurat" desi era gata, iar iPay pe ramura
 * „altfel" ar fi inghitit orice procesator uitat. Proba asta cade la prima uitare.
 */

const viu = (f: string) => faraComentarii(readFileSync(f, "utf8"));

describe("modelul comun si regulile despre bani", () => {
  test("tbi e procesator, are eticheta de vitrina (fara diacritice) si e plata online", () => {
    assert.ok((PAYMENT_PROCESSOR_TYPES as readonly string[]).includes("tbi"));
    assert.equal(PAYMENT_METHOD_DEFAULT_LABELS.tbi, "Plata in rate prin tbi bank");
    assert.ok((PLATI_ONLINE as readonly string[]).includes("tbi"), "o cerere respinsa ar raporta venit");
  });
  test("tbi NU e card: fara reducerea de card si fara „Card online” pe factura", () => {
    const pm = viu("src/lib/payment-methods.ts");
    const set = /CARD_DISCOUNT_METHODS = new Set<PaymentMethodType>\(\[([^\]]*)\]\)/.exec(pm);
    assert.ok(set, "nu mai gasesc multimea metodelor de card");
    assert.ok(!set[1].includes('"tbi"'), "tbi a intrat la reducerea de card / „Card online” pe factura");
    assert.equal(tipIncasareOblio("tbi"), "Alta incasare banca");
  });
  test("easySales: comanda tbi pleaca drept platita online, nu drept ramburs", () => {
    assert.equal(modulDePlata("tbi"), 1);
  });
});

describe("rutele publice si secretele", () => {
  test("poarta MFA lasa sa treaca pornirea si vestile (vin de la cumparator si de la banca)", () => {
    assert.equal(apiFaraPoarta("/api/tbi/start"), true);
    assert.equal(apiFaraPoarta("/api/tbi/notificare/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ"), true);
  });
  test("⚠ secretele: aceleasi nume in cod si in migratie (Fusion Pay), iar cele vechi ies din lista", () => {
    assert.deepEqual([...CAMPURI_SECRETE.tbi_config].sort(), ["cheie_criptare", "reseller_key"]);
    const migratie = readFileSync("migrations/2027-02-04-tbi-fusion-pay.sql", "utf8");
    for (const camp of CAMPURI_SECRETE.tbi_config) {
      assert.ok(migratie.includes(`('tbi_config', '${camp}')`), `${camp} nu se cripteaza in baza`);
    }
    assert.match(migratie, /delete from privat\.campuri_secrete\s+where coloana = 'tbi_config' and cale in \('password', 'cheie_privata'\)/);
    assert.match(migratie, /select privat\.reconstruieste_store_settings\(\);\s*select privat\.reconstruieste_store_settings_upd\(\);/,
      "vederea si declansatorul nu se refac dupa schimbarea secretelor");
  });
  test("⚠ jetonul tbi (`tbi_token`) si amprentele nu se citesc din browser", () => {
    const migratie = viu("migrations/2027-02-04-tbi-fusion-pay.sql");
    assert.match(migratie, /revoke select on table public\.tbi_cereri from anon, authenticated;/);
    const grant = /grant select \(([^)]*)\) on table public\.tbi_cereri to authenticated/.exec(migratie)?.[1] ?? "";
    assert.ok(grant, "nu mai gasesc privilegiul pe coloane");
    for (const ascuns of ["tbi_token", "jeton_hash", "jetoane_rambursare"]) assert.ok(!grant.includes(ascuns), `${ascuns} se poate citi din browser`);
  });
});

describe("⚠⚠ vestea: trei lacate, in ordinea buna", () => {
  const ruta = viu("src/app/api/tbi/notificare/[jeton]/route.ts");
  const i = (s: string) => {
    const k = ruta.indexOf(s);
    assert.ok(k >= 0, `nu mai gasesc „${s}” in ruta vestilor`);
    return k;
  };
  test("jetonul se verifica INAINTE de corp si de descifrare", () => {
    assert.ok(i("JETON.test(") < i("hashJeton(jeton)"));
    assert.ok(i("hashJeton(jeton)") < i("valoareaVestii(request)"));
    assert.ok(i("if (!cerere)") < i("descifreazaDeLaTbi("));
  });
  test("`order_id` din veste trebuie sa fie chiar cererea de pe jeton, inainte de orice aplicare", () => {
    assert.ok(i("veste.orderId !== String(cerere.id)") < i("aplicaVesteaTbi("));
  });
  test("⚠ vestile rambursarilor gasesc cererea si pe jetoanele lor, fara sa-l inlocuiasca pe al cererii", () => {
    assert.match(ruta, /jeton_hash\.eq\.\$\{amprenta\},jetoane_rambursare\.cs\.\{\$\{amprenta\}\}/);
    const server = viu("src/lib/tbi/server.ts");
    assert.match(server, /jetoane_rambursare: \[\.\.\.\(inainte\.jetoane_rambursare \?\? \[\]\), hashJeton\(jeton\)\]/);
    assert.ok(!/jeton_hash: hashJeton\(jeton\) \}/.test(server.slice(server.indexOf("export async function ramburseazaCerereaTbi"))),
      "rambursarea inlocuieste amprenta cererii: vestile despre credit n-ar mai gasi cererea");
  });
  test("o veste care nu se poate descifra striga (jurnal + comerciant), nu tace", () => {
    assert.match(ruta, /strigaCheia/);
    assert.match(ruta, /semnaleazaExpedierea\(/);
  });
});

describe("plasarea comenzii", () => {
  test("⚠ refuzul tbi (suma, firma) vine INAINTEA cuponului si a stocului, pe AMBELE drumuri", () => {
    const o = viu("src/lib/actions/order.actions.ts");
    /* Corpul fiecarei cai de creare, de la antet pana la urmatorul export. */
    const corp = (nume: string) => {
      const start = o.indexOf(`export async function ${nume}(`);
      assert.ok(start >= 0, `nu mai gasesc ${nume}`);
      const sfarsit = o.indexOf("\nexport ", start + 10);
      return o.slice(start, sfarsit < 0 ? undefined : sfarsit);
    };
    for (const nume of ["placeOrder", "placeCartOrder"]) {
      const c = corp(nume);
      const refuz = c.indexOf("refuzulSumeiTbi(");
      assert.ok(refuz > 0, `${nume} nu mai verifica tbi`);
      assert.ok(refuz < c.indexOf('rpc("claim_discount_use"'), `${nume}: refuzul tbi vine dupa revendicarea cuponului`);
      assert.ok(refuz < c.indexOf("await revendicaStocul("), `${nume}: refuzul tbi vine dupa revendicarea stocului`);
      assert.ok(refuz < c.indexOf('from("orders").insert('), `${nume}: refuzul tbi vine dupa scrierea comenzii`);
    }
    assert.equal((o.match(/klarna_config, revolut_config, tbi_config/g) ?? []).length, 2,
      "selectul de configurare nu mai aduce `tbi_config`: `verificaMetodaPlata` ar refuza orice comanda tbi");
  });
  test("Setarile, vitrina si paginile citesc `tbi_config` (altfel tbi pare „neconfigurat”)", () => {
    for (const f of [
      "src/app/(dashboard)/dashboard/settings/page.tsx",
      "src/lib/actions/store.actions.ts",
      "src/lib/pages/integrari-pagini.ts",
    ]) {
      assert.match(readFileSync(f, "utf8"), /tbi_config/, f);
    }
  });
});

describe("panoul si vitrina", () => {
  test("cardul tbi e livrat in pagina Integrari (nu „in curand”) si duce la configurare", () => {
    const pagina = readFileSync("src/app/(dashboard)/dashboard/features/page.tsx", "utf8");
    assert.match(pagina, /logo: "\/integrations\/tbi\.svg", id: "tbi"/);
    assert.ok(!/tbi\.svg", soon: true/.test(pagina));
    assert.match(pagina, /integration\.id === "tbi" \? "\/dashboard\/features\/tbi"/);
  });
  test("pagina comenzii arata caseta tbi, iar anularea si rambursarea au butoane PROPRII", () => {
    const o = viu("src/components/dashboard/OrderDetailClient.tsx");
    assert.match(o, /<TbiComandaPanel /);
    /* Selectorul de stare nu cheama banca: anularea si rambursarea nu sunt legate de schimbarea starii. */
    const comenzi = viu("src/lib/actions/order.actions.ts");
    assert.ok(!comenzi.includes("anuleazaCerereaTbi") && !comenzi.includes("ramburseazaCerereaTbi"));
    const caseta = viu("src/components/dashboard/tbi/TbiComandaPanel.tsx");
    assert.match(caseta, /anuleazaCerereaTbiDinPanou\(/);
    assert.match(caseta, /ramburseazaTbiDinPanou\(/);
  });
  test("pagina produsului arata randul de rate in ambele machete", () => {
    for (const f of [
      "src/components/storefront/sections/product/ProductPageClassic.tsx",
      "src/components/storefront/sections/product/ProductPageDetailed.tsx",
    ]) {
      assert.match(viu(f), /<RateTbi limite=\{rateTbi\}/, f);
    }
  });
  test("⚠ forma aleasa pentru pagina produsului schimba DOAR pagina produsului, nu si comanda", () => {
    assert.match(viu("src/lib/storefront/product-data.ts"), /publicConfig\.tbi_produs/,
      "pagina produsului nu mai asculta de alegerea din panou");
    const sa = viu("src/lib/actions/store.actions.ts");
    assert.match(sa, /tbi_produs: bannerTbiPePaginaProdusului\(data\.tbi_config\)/);
    assert.match(sa, /tbi: limiteleTbi\(data\.tbi_config\)/, "formularul de comanda trebuie sa primeasca limitele oricare ar fi forma");
    for (const f of [
      "src/components/storefront/sections/checkout/checkout-core.ts",
      "src/components/ministore/OrderModal.tsx",
      "src/lib/actions/order.actions.ts",
    ]) {
      const v = viu(f);
      assert.ok(!v.includes("banner_produs") && !v.includes("tbi_produs"), `${f}: comanda asculta de forma de pe pagina produsului`);
    }
    const piese = viu("src/components/storefront/sections/product/_shared/pieces.tsx");
    assert.match(piese, /forma === "banner"\) return <BannerRateTbi \/>/);
    assert.match(piese, /forma === "video"\) return <VideoRateTbi \/>/);
    const panou = viu("src/components/dashboard/TbiConfigClient.tsx");
    for (const forma of FORME_BANNER_TBI) assert.ok(panou.includes(`forma: "${forma}"`), `panoul nu ofera forma „${forma}”`);
    assert.match(panou, /set\("banner_produs", f\.forma\)/);
    assert.match(viu("src/lib/actions/tbi.actions.ts"), /banner_produs: esteFormaBannerTbi\(input\.banner_produs\)/,
      "salvarea nu mai verifica forma");
  });
  test("⚠ clipul bannerului video exista, e mic, si nu se descarca odata cu pagina", () => {
    const v = viu("src/components/storefront/VideoRateTbi.tsx");
    const mp4 = /mp4: "([^"]+)"/.exec(v)?.[1];
    const afis = /afis: "([^"]+)"/.exec(v)?.[1];
    assert.ok(mp4 && afis, "nu mai gasesc caile clipului");
    for (const cale of [mp4, afis]) {
      assert.ok(existsSync(`public${cale}`), `lipseste public${cale}`);
      /* Altfel, pe un domeniu propriu proxy-ul il rescrie spre `/<slug>/...` si da 404. */
      assert.ok(EXTENSII_STATICE.test(cale), `${cale} nu e fisier static pentru proxy: pe domeniile proprii ar da 404`);
    }
    /* Pagina produsului e pagina care vinde: un clip greu i-ar strica incarcarea pe telefon. */
    const kb = (cale: string) => Math.round(statSync(`public${cale}`).size / 1024);
    assert.ok(kb(mp4) <= 900, `clipul are ${kb(mp4)} KB; plafonul pe pagina produsului e 900 KB`);
    assert.ok(kb(afis) <= 120, `afisul are ${kb(afis)} KB; plafonul e 120 KB`);
    assert.match(v, /preload="none"/, "clipul s-ar descarca odata cu pagina");
    assert.match(v, /\bmuted\b/);
    assert.match(v, /\bplaysInline\b/, "fara playsInline, iPhone-ul il deschide pe tot ecranul");
    assert.match(v, /prefers-reduced-motion: reduce/, "miscarea redusa ceruta de sistem nu mai e respectata");
  });
  test("textele vitrinei (rand, banner, video): fara diacritice si fara nicio cifra de credit", () => {
    for (const f of [
      "src/components/storefront/RandRateTbi.tsx",
      "src/components/storefront/CardTbi.tsx",
      "src/components/storefront/BannerRateTbi.tsx",
      "src/components/storefront/VideoRateTbi.tsx",
    ]) {
      const v = viu(f);
      assert.ok(!/[ăâîșțĂÂÎȘȚ]/.test(v), `${f}: diacritice in vitrina`);
      assert.ok(!/dobanda|\bDAE\b|rata lunara|lei\s*\/\s*luna|\bluni\b/i.test(v), `${f}: o cifra de credit cere informatiile standard`);
    }
  });
  test("cronul de anulare e programat", () => {
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string }[] };
    assert.ok(vercel.crons.some((c) => c.path === "/api/cron/tbi-reconciliere"));
  });
});
