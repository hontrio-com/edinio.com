/**
 * ⚠ NUMAI PENTRU PROBE. Nimic din aplicatie nu importa fisierul asta (o cere proba
 * „fals-easysales.ts e NUMAI pentru probe" din `secretele-sunt-aceleasi.test.ts`).
 *
 * Un easySales fals, MAI STRICT decat cel real acolo unde documentatia e neclara, si un depozit
 * de configurare in memorie cu aceeasi semantica de zavor ca SQL-ul din migratia fundatiei.
 *
 * ═══ DE CE MAI STRICT ═══
 *
 * Colectia nu pomeneste niciun sandbox, iar un cont de proba nu exista inca. Deci falsul e
 * singurul loc in care codul se loveste de reguli inainte de un comerciant real. Acolo unde
 * documentatia tace, purtarea e CONFIGURABILA, iar probele trec prin toate variantele:
 *
 *   - fiecare emitere revoca tokenul precedent [A]; tokenul revocat primeste 401 (dedus) sau 403;
 *   - `/oauth/token` primeste cel mult 60 de cereri pe minut (ghidul, proba curl);
 *   - scrierile cu `website_token` in colectie il CER la radacina; fara el, 403 „Invalid website token";
 *   - raspunsul Save Order vine cu sau fara `data.internal_id` (exemplul lui e copiat de la Add);
 *   - `?website=` strict, partial sau ignorat; `?order_display_id=` exact sau partial;
 *   - campul secretului la abonare: `secret` sau `seccret` (M-WH-1);
 *   - CATALOGUL: o categorie sau o caracteristica necunoscuta pe produs da 422 („you must first create
 *     that category or characteristic" [A]); `product_website_id` e unic pe website [A]; un lot cu un
 *     element invalid da 422 pe tot sau trece partial, TACUT (M-PROD-2); potrivirea SKU-ului la Save e
 *     cu sau fara majuscule (M-PROD-1); produsele arhivate nu apar in lista, iar un Save pe un SKU
 *     arhivat face un produs NOU (ghidul „Arhivează și restaurează produse"; ES-25).
 */

import type { DepozitEasySales, RandJurnal } from "./depozit";
import type { EasySalesConfig } from "./tipuri";

// ═════════════════════════════════════════════════════════════════════════════
// Depozitul in memorie
// ═════════════════════════════════════════════════════════════════════════════

export interface DepozitFals extends DepozitEasySales {
  configuri: Map<string, EasySalesConfig>;
  jurnal: RandJurnal[];
  /** Cate petice s-au scris (pentru probele care cer „nu scrie nimic"). */
  scrieri: { fel: string; businessId: string; petic?: Partial<EasySalesConfig> }[];
  /** Citirea configurarii cade (simuleaza o pana a bazei). */
  citireaCade: boolean;
}

export function depozitFals(init: Record<string, EasySalesConfig> = {}): DepozitFals {
  const configuri = new Map<string, EasySalesConfig>(Object.entries(init).map(([k, v]) => [k, { ...v }]));
  const dep: DepozitFals = {
    configuri,
    jurnal: [],
    scrieri: [],
    citireaCade: false,

    async citesteConfig(businessId) {
      await Promise.resolve();
      if (dep.citireaCade) throw new Error("baza nu raspunde");
      return { ...(configuri.get(businessId) ?? {}) };
    },

    async peticConfig(businessId, petic) {
      await Promise.resolve();
      dep.scrieri.push({ fel: "petic", businessId, petic });
      const vechi = configuri.get(businessId);
      if (!vechi) return true; // ca `jsonb_merge_config`: fara rand, nu face nimic
      const nou: EasySalesConfig = { ...vechi };
      for (const [k, v] of Object.entries(petic)) {
        if (v === undefined) continue;
        (nou as Record<string, unknown>)[k] = v;
      }
      configuri.set(businessId, nou);
      return true;
    },

    async iaEmiterea(businessId, versiuneVazuta, leaseSec) {
      await Promise.resolve();
      dep.scrieri.push({ fel: "iaEmiterea", businessId });
      const cfg = configuri.get(businessId);
      if (!cfg) return null;
      if ((Number(cfg.token_versiune) || 0) !== versiuneVazuta) return null;
      const pana = cfg.emitere_pana ? Date.parse(cfg.emitere_pana) : NaN;
      if (Number.isFinite(pana) && pana > Date.now()) return null;
      const zavor = `zavor-${Math.random().toString(36).slice(2)}`;
      configuri.set(businessId, {
        ...cfg,
        emitere_pana: new Date(Date.now() + leaseSec * 1000).toISOString(),
        emitere_id: zavor,
        emitere_incercata_la: new Date().toISOString(),
      });
      return zavor;
    },

    async scrieTokenul(businessId, zavor, petic) {
      await Promise.resolve();
      dep.scrieri.push({ fel: "scrieTokenul", businessId, petic });
      const cfg = configuri.get(businessId);
      if (!cfg || cfg.emitere_id !== zavor) return false;
      configuri.set(businessId, {
        ...cfg, ...petic,
        token_versiune: (Number(cfg.token_versiune) || 0) + 1,
        emitere_pana: null, emitere_id: null,
      });
      return true;
    },

    async elibereazaEmiterea(businessId, zavor) {
      await Promise.resolve();
      const cfg = configuri.get(businessId);
      if (cfg && cfg.emitere_id === zavor) configuri.set(businessId, { ...cfg, emitere_pana: null, emitere_id: null });
    },

    async scrieJurnal(rand) {
      dep.jurnal.push(rand);
    },
  };
  return dep;
}

// ═════════════════════════════════════════════════════════════════════════════
// Serverul fals
// ═════════════════════════════════════════════════════════════════════════════

export interface CerereInregistrata {
  metoda: string;
  cale: string;
  interogare: Record<string, string>;
  antete: Record<string, string>;
  corp: unknown;
}

export interface ComandaFalsa {
  internal_id: number;
  order_id: string;
  website: string;
  status: number;
  awb: string[];
  facturi: { series: string; number: string; type: string }[];
  metadate: { key: string; value: string }[];
  corp: Record<string, unknown>;
  updated_at: string;
  marketplace: string | null;
  cancel_request: string | null;
  livrare: number | null;
  curier: { id: number; name: string } | null;
  /**
   * Liniile, in forma Get Order [A: `sku`, `quantity`, `price` net, `tax` fractie, `product_data`,
   * `offer`]: numai la comenzile ALTOR canale (bucla de stoc, E4). Comenzile trimise de noi nu le au.
   */
  linii?: Record<string, unknown>[];
  /** Starea platii, ca in lista lor („Paid"). */
  plata?: string | null;
  client?: { name?: string } | null;
  adresa?: { city?: string; county?: string; country?: string } | null;
}

export interface ProdusFalsInit {
  sku: string;
  website: string;
  product_website_id?: number | string | null;
}

/** Un produs la ei: ce s-a trimis ultima oara, plus id-ul lor si arhivarea. */
export interface ProdusFals extends ProdusFalsInit {
  id: number;
  corp: Record<string, unknown>;
  arhivat: boolean;
  stock: number;
  reserved_stock: number;
  /** De cate ori a primit un Save (ca proba sa vada retrimiterile). */
  salvari: number;
}

export interface OptiuniFals {
  clientId?: string;
  clientSecret?: string;
  websiteToken?: string;
  websiteNume?: string;
  /** Codul primit de un token revocat. Nedocumentat: 401 dedus din tabelul generic, sau 403. */
  tokenRevocatRaspunde?: 401 | 403;
  /** Scope-uri pe care grantul website nu le primeste (raspunde `invalid_scope` cu indiciu). */
  scopuriRefuzate?: string[];
  /** `invalid_scope` FARA indiciu. */
  scopuriRefuzateFaraIndiciu?: boolean;
  /** Raspunsul la Save Order vine fara `internal_id` (exemplul lor e copiat de la Add). */
  saveFaraInternalId?: boolean;
  /** Purtarea filtrului `?website=` la produse. */
  filtruWebsite?: "strict" | "partial" | "ignorat";
  /** Purtarea filtrului `?order_display_id=`. */
  filtruDisplayId?: "exact" | "partial";
  /** Ce nume de camp citeste serverul ca secret la abonare. */
  campSecretPreluat?: "secret" | "seccret";
  /** Website-urile contului. */
  websiteuri?: { name: string; url: string | null; status: string }[];
  /** Produsele existente pe website (pentru poarta „website gol"). */
  produse?: ProdusFalsInit[];
  /** Un lot de produse cu un element invalid: 422 pe tot (implicit) sau prelucrare partiala tacuta (M-PROD-2). */
  lotInvalid?: "422" | "partial";
  /** Potrivirea SKU-ului la Save: fara majuscule (implicit, ca la arhivare [A]) sau exacta (M-PROD-1). */
  skuExact?: boolean;
  /** SKU-urile pe care arhivarea le raspunde `blocked` (comenzi active). */
  arhivareBlocata?: string[];
  /** Intarzierea fiecarui raspuns, ca o latenta reala (proba incarcarii mari). */
  intarziereMs?: number;
  /** `GET /account` raspunde 403 (grantul website nu-l poate citi). */
  contInterzis?: boolean;
}

type Raspunzator = (c: CerereInregistrata) => Response | null | Promise<Response | null>;

function json(status: number, corp: unknown, antete: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corp), {
    status,
    headers: { "content-type": "application/json", "x-ratelimit-limit": "500", "x-ratelimit-remaining": "499", ...antete },
  });
}

function jwtFals(sub: string, scopuri: string[], numar: number): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const acum = Math.floor(Date.now() / 1000);
  return `${b64({ typ: "JWT", alg: "RS256" })}.${b64({ aud: "client", jti: `t${numar}`, iat: acum, nbf: acum, exp: acum + 31536000, sub, scopes: scopuri })}.semnatura${numar}`;
}

export function serverFals(opt: OptiuniFals = {}) {
  const o = {
    clientId: "client-1", clientSecret: "secret-1", websiteToken: "wt-".padEnd(60, "x"), websiteNume: "Edinio Test",
    tokenRevocatRaspunde: 401 as 401 | 403,
    filtruWebsite: "strict" as const, filtruDisplayId: "exact" as const, campSecretPreluat: "secret" as const,
    ...opt,
  };
  const stare = {
    cereri: [] as CerereInregistrata[],
    emiteri: 0,
    emiteriPeMinut: [] as number[],
    tokenViu: null as string | null,
    tokenuriEmise: [] as string[],
    comenzi: new Map<number, ComandaFalsa>(),
    urmatorulInternalId: 500,
    abonari: new Map<number, { id: number; slug: string; url: string; secret: string | null }>(),
    urmatorulIdAbonare: 1,
    declansari: [] as number[],
    websiteuri: o.websiteuri ?? [{ name: o.websiteNume, url: null, status: "active" }],
    produse: (o.produse ?? []).map((p, i) => ({
      ...p, id: 9000 + i, corp: {}, arhivat: false, stock: 0, reserved_stock: 0, salvari: 0,
    })) as ProdusFals[],
    urmatorulIdProdus: 20_000,
    categorii: new Map<number, { id: number; category_website_id: number; name: string }>(),
    caracteristici: new Map<number, { id: number; characteristic_website_id: number; name: string }>(),
    urmatorulIdCatalog: 500,
    /** Raspunsuri fortate, in ordine, pentru cererile care se potrivesc. */
    fortate: [] as { potrivire: (c: CerereInregistrata) => boolean; raspunde: Raspunzator; ramase: number }[],
  };

  /** Forteaza urmatoarele `ori` raspunsuri pe o ruta (ex. un 429, un 500, o cadere de retea). */
  function forteaza(potrivire: (c: CerereInregistrata) => boolean, raspunde: Raspunzator, ori = 1) {
    stare.fortate.push({ potrivire, raspunde, ramase: ori });
  }

  function autorizat(c: CerereInregistrata): Response | null {
    const t = (c.antete.authorization ?? "").replace(/^Bearer /, "");
    if (!t) return json(401, { message: "Unauthenticated." });
    if (t === stare.tokenViu) return null;
    if (stare.tokenuriEmise.includes(t)) {
      return o.tokenRevocatRaspunde === 403 ? json(403, { message: "This action is unauthorized." }) : json(401, { message: "Unauthenticated." });
    }
    return json(401, { message: "Unauthenticated." });
  }

  function ceraWebsiteToken(c: CerereInregistrata): Response | null {
    const corp = (c.corp ?? {}) as Record<string, unknown>;
    if (corp.website_token !== o.websiteToken) return json(403, { success: false, message: "Invalid website token" });
    return null;
  }

  function comandaPublica(x: ComandaFalsa) {
    return {
      id: x.order_id, order_display_id: x.order_id, internal_id: x.internal_id,
      status: ["Canceled", "New", "Received", "Completed", "Processing", "Incomplete", "Return"][x.status] ?? "New",
      website: x.website, marketplace: x.marketplace, cancel_request: x.cancel_request,
      awb_id: x.awb.length ? [...x.awb] : null,
      shipments: x.awb.length ? [{
        awb_id: [...x.awb], awb_url: `https://easy-sales.com/shipments/u/awb`,
        awb_tracking_page: `https://easy-sales.com/shipments/u/awb-tracking`,
        delivery_status: x.livrare ? { description: "x", value: x.livrare } : null,
        courier: x.curier,
      }] : [],
      invoices: x.facturi.map((f) => ({ ...f, URL: "https://easy-sales.com/orders/u/invoice" })),
      total_value: String((x.corp.order_total as number) ?? 0),
      updated_at: x.updated_at,
      ...(x.linii ? { products: x.linii, payment_status: x.plata ?? null, customer: x.client ?? null, shipping_address: x.adresa ?? null } : {}),
    };
  }

  function websiteulTokenului(): string {
    return o.websiteNume;
  }

  /** Produsul viu al website-ului, dupa SKU. Arhivarea potriveste mereu fara majuscule [A]. */
  function gasesteProdus(sku: string, faraMajuscule: boolean): ProdusFals | undefined {
    const w = websiteulTokenului();
    const exact = !faraMajuscule && !!o.skuExact;
    return stare.produse.find((p) => !p.arhivat && p.website === w
      && (exact ? p.sku === sku : p.sku.toLowerCase() === sku.toLowerCase()));
  }

  /** Erorile unui produs, in forma lor (`{"product.sku": ["..."]}`), sau `null` cand e bun. */
  function valideazaProdus(brut: unknown, prefix: string): Record<string, string[]> | null {
    const p = (brut ?? {}) as Record<string, unknown>;
    const erori: Record<string, string[]> = {};
    const plin = (v: unknown) => v !== null && v !== undefined && v !== "";
    const cere = (camp: string, bun: boolean) => {
      if (!bun) erori[`${prefix}.${camp}`] = [`The ${prefix}.${camp.replace(/_/g, " ")} field is required.`];
    };
    cere("product_website_id", plin(p.product_website_id) && Number.isFinite(Number(p.product_website_id)));
    cere("name", typeof p.name === "string" && p.name.trim() !== "");
    cere("sku", typeof p.sku === "string" && p.sku.trim() !== "");
    cere("description", typeof p.description === "string" && p.description.trim() !== "");
    cere("sale_price", plin(p.sale_price) && Number.isFinite(Number(p.sale_price)));
    cere("stock", plin(p.stock) && Number.isFinite(Number(p.stock)));
    cere("tax_rate", plin(p.tax_rate) && Number.isFinite(Number(p.tax_rate)));
    if (p.type !== "simple" && p.type !== "complex") erori[`${prefix}.type`] = [`The selected ${prefix}.type is invalid.`];
    for (const [i, id] of (Array.isArray(p.categories) ? p.categories : []).entries()) {
      if (!stare.categorii.has(Number(id))) erori[`${prefix}.categories.${i}`] = [`The selected ${prefix}.categories.${i} is invalid.`];
    }
    for (const [i, x] of (Array.isArray(p.characteristics) ? p.characteristics : []).entries()) {
      if (!stare.caracteristici.has(Number((x as { id?: unknown })?.id))) {
        erori[`${prefix}.characteristics.${i}.id`] = [`The selected ${prefix}.characteristics.${i}.id is invalid.`];
      }
    }
    if (Object.keys(erori).length === 0 && typeof p.sku === "string") {
      const w = websiteulTokenului();
      const sku = p.sku;
      const altul = stare.produse.find((x) => !x.arhivat && x.website === w
        && String(x.product_website_id) === String(p.product_website_id)
        && (o.skuExact ? x.sku !== sku : x.sku.toLowerCase() !== sku.toLowerCase()));
      if (altul) erori[`${prefix}.product_website_id`] = [`The ${prefix}.product website id has already been taken.`];
    }
    return Object.keys(erori).length ? erori : null;
  }

  function salveazaProdusFals(brut: unknown, prefix: string): { produs: ProdusFals } | { erori: Record<string, string[]> } {
    const erori = valideazaProdus(brut, prefix);
    if (erori) return { erori };
    const p = brut as Record<string, unknown>;
    const sku = String(p.sku);
    const existent = gasesteProdus(sku, false);
    if (existent) {
      existent.corp = { ...p };
      existent.product_website_id = p.product_website_id as number;
      existent.stock = Number(p.stock);
      existent.salvari += 1;
      return { produs: existent };
    }
    const nou: ProdusFals = {
      id: stare.urmatorulIdProdus++, sku, website: websiteulTokenului(), product_website_id: p.product_website_id as number,
      corp: { ...p }, arhivat: false, stock: Number(p.stock), reserved_stock: 0, salvari: 1,
    };
    stare.produse.push(nou);
    return { produs: nou };
  }

  /** Produsul cum il arata lista lor: id-urile ca siruri, preturile NETE cu patru zecimale [A: exemplele]. */
  function produsPublic(p: ProdusFals) {
    const cota = Number(p.corp.tax_rate) || 0;
    const net = (v: unknown) => (plinNumar(v) ? (Number(v) / (1 + cota / 100)).toFixed(4) : null);
    return {
      id: p.id, name: p.corp.name ?? null, sku: p.sku,
      product_website_id: p.product_website_id == null ? null : String(p.product_website_id),
      stock: p.stock, reserved_stock: p.reserved_stock, sale_price: net(p.corp.sale_price), full_price: net(p.corp.full_price),
      tax_rate: cota.toFixed(2), type: p.corp.type ?? "simple", status: "active", website: { name: p.website, url: null },
    };
  }

  function plinNumar(v: unknown): boolean {
    return v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
  }

  async function raspunde(c: CerereInregistrata): Promise<Response> {
    if (o.intarziereMs) await new Promise((r) => setTimeout(r, o.intarziereMs));
    for (const f of stare.fortate) {
      if (f.ramase > 0 && f.potrivire(c)) {
        f.ramase -= 1;
        const r = await f.raspunde(c);
        if (r) return r;
      }
    }

    // ── /oauth/token ──
    if (c.cale === "/oauth/token" && c.metoda === "POST") {
      const acum = Date.now();
      stare.emiteriPeMinut = stare.emiteriPeMinut.filter((t) => acum - t < 60_000);
      if (stare.emiteriPeMinut.length >= 60) return json(429, { message: "Too Many Attempts." }, { "retry-after": "60" });
      stare.emiteriPeMinut.push(acum);
      const b = (c.corp ?? {}) as Record<string, unknown>;
      if (b.grant_type !== "website") return json(400, { success: false, error: "unsupported_grant_type", message: "The authorization grant type is not supported." });
      if (!b.client_id) return json(400, { success: false, error: "invalid_request", hint: "Check the `client_id` parameter", message: "The request is missing a required parameter." });
      if (b.client_id !== o.clientId || b.client_secret !== o.clientSecret) {
        return json(401, { success: false, error: "invalid_client", message: "Client authentication failed" });
      }
      if (!b.website_token) return json(400, { success: false, error: "invalid_request", hint: "Check the `website_token` parameter", message: "The request is missing a required parameter." });
      if (b.website_token !== o.websiteToken) return json(400, { success: false, error: "invalid_grant", message: "The provided authorization grant is invalid." });
      const scopuri = String(b.scope ?? "").split(" ").filter(Boolean);
      const refuzat = scopuri.find((s) => (o.scopuriRefuzate ?? []).includes(s));
      if (refuzat) {
        return json(400, {
          success: false, error: "invalid_scope", message: "The requested scope is invalid, unknown, or malformed",
          ...(o.scopuriRefuzateFaraIndiciu ? {} : { hint: `Check the \`${refuzat}\` scope` }),
        });
      }
      stare.emiteri += 1;
      const token = jwtFals("42", scopuri, stare.emiteri);
      if (stare.tokenViu) stare.tokenuriEmise.push(stare.tokenViu);
      stare.tokenViu = token;
      return json(200, { token_type: "Bearer", expires_in: 31536000, access_token: token, refresh_token: `def${stare.emiteri}` });
    }

    if (!c.cale.startsWith("/api/v2/")) return json(404, { message: "Not Found" });
    const neautorizat = autorizat(c);
    if (neautorizat) return neautorizat;
    const cale = c.cale.slice("/api/v2".length);

    // ── cont, website-uri, nomenclatoare ──
    if (cale === "/account" && c.metoda === "GET") {
      if (o.contInterzis) return json(403, { message: "This action is unauthorized." });
      return json(200, { success: true, message: "Account details retrieved successfully", data: {
        company_name: "Firma Test SRL", vat_id: "RO123456", has_active_subscription: true, is_trial: true,
        expire_date: "2026-10-27T10:00:00.000000Z", max_orders: 300, current_orders: 3, preferred_currency: "RON",
      } });
    }
    if (cale === "/websites/list" && c.metoda === "GET") return json(200, { data: stare.websiteuri });
    if (cale === "/delivery-statuses" && c.metoda === "GET") {
      return json(200, { data: ["Ready", "On Route", "Delayed", "Delivered", "Return", "Unknown", "Canceled"].map((d, i) => ({ description: d, value: i + 1 })) });
    }
    if (cale === "/marketplaces/list" && c.metoda === "GET") return json(200, { data: [{ id: 1, name: "Emag" }, { id: 6, name: "EmagHU" }] });

    // ── webhook-uri ──
    if (cale === "/webhooks" && c.metoda === "GET") {
      return json(200, { success: true, message: "Success", data: [...stare.abonari.values()].map((a) => ({
        id: a.id, url: a.url, http_method: "post", webhook: { slug: a.slug, name: a.slug, group: "orders" },
        details: { result: { success: true, status_code: 200, attempt_nr: 1, final: true, total_nr_of_attempts: 3 }, triggered_at: null },
      })) });
    }
    let m = /^\/webhooks\/([a-z-]+)$/.exec(cale);
    if (m && c.metoda === "POST") {
      const b = (c.corp ?? {}) as Record<string, unknown>;
      const id = stare.urmatorulIdAbonare++;
      const secret = typeof b[o.campSecretPreluat] === "string" ? String(b[o.campSecretPreluat]) : null;
      stare.abonari.set(id, { id, slug: m[1], url: String(b.url ?? ""), secret });
      return json(200, { success: true, message: "Success", data: { id, url: b.url } });
    }
    m = /^\/webhooks\/(\d+)$/.exec(cale);
    if (m && c.metoda === "PUT") {
      const a = stare.abonari.get(Number(m[1]));
      if (!a) return json(404, { success: false, message: "Not found" });
      a.url = String(((c.corp ?? {}) as Record<string, unknown>).url ?? a.url);
      return json(200, { success: true, message: "Success", data: { id: a.id, url: a.url } });
    }
    if (m && c.metoda === "DELETE") {
      if (!stare.abonari.delete(Number(m[1]))) return json(404, { success: false, message: "Not found" });
      return json(200, { success: true, message: "Success", data: [] });
    }
    m = /^\/webhooks\/(\d+)\/trigger$/.exec(cale);
    if (m && c.metoda === "POST") {
      stare.declansari.push(Number(m[1]));
      return json(200, { success: true, message: "Success", data: [] });
    }

    // ── comenzi ──
    if (cale === "/orders/save" && c.metoda === "POST") {
      const lipsa = ceraWebsiteToken(c);
      if (lipsa) return lipsa;
      const b = (c.corp ?? {}) as { order?: Record<string, unknown> };
      const order = b.order ?? {};
      const orderId = order.order_id == null ? "" : String(order.order_id);
      if (!orderId) return json(422, { message: "The given data was invalid.", errors: { "order.order_id": ["The order.order id field is required."] } });
      let x = [...stare.comenzi.values()].find((k) => k.order_id === orderId && k.website === o.websiteNume);
      if (!x) {
        x = {
          internal_id: stare.urmatorulInternalId++, order_id: orderId, website: o.websiteNume, status: Number(order.status ?? 1),
          awb: [], facturi: [], metadate: [], corp: order, updated_at: new Date().toISOString(),
          marketplace: null, cancel_request: null, livrare: null, curier: null,
        };
        stare.comenzi.set(x.internal_id, x);
      } else {
        x.corp = order;
        x.updated_at = new Date().toISOString();
      }
      const data: Record<string, unknown> = { id: x.order_id, order_display_id: x.order_id, status: "New", website: "API" };
      if (!o.saveFaraInternalId) data.internal_id = x.internal_id;
      return json(200, { success: true, message: "Success", data });
    }
    if (cale === "/orders" && c.metoda === "GET") {
      let lista = [...stare.comenzi.values()];
      const d = c.interogare.order_display_id;
      if (d) lista = lista.filter((k) => (o.filtruDisplayId === "exact" ? k.order_id === d : k.order_id.includes(d)));
      const w = c.interogare.website;
      if (w) lista = lista.filter((k) => k.website === w);
      const dupa = c.interogare.modified_after;
      if (dupa) lista = lista.filter((k) => k.updated_at.replace("T", " ").slice(0, 19) >= dupa);
      const sku = c.interogare.product_sku;
      if (sku) lista = lista.filter((k) => (k.linii ?? []).some((l) => String(l.sku ?? "").toLowerCase() === sku.toLowerCase()));
      const pe = Math.min(100, Math.max(1, Number(c.interogare.per_page ?? 100)));
      const pagina = Math.max(1, Number(c.interogare.page ?? 1));
      const felie = lista.slice((pagina - 1) * pe, pagina * pe);
      return json(200, {
        data: felie.map(comandaPublica),
        meta: { current_page: pagina, last_page: Math.max(1, Math.ceil(lista.length / pe)), total: lista.length, per_page: pe },
      });
    }
    m = /^\/orders\/(\d+)$/.exec(cale);
    if (m && c.metoda === "GET") {
      const x = stare.comenzi.get(Number(m[1]));
      if (!x) return json(404, { success: false, message: "Order not found" });
      return json(200, { success: true, message: "Success", data: comandaPublica(x) });
    }
    m = /^\/orders\/(\d+)\/cancel$/.exec(cale);
    if (m && c.metoda === "PATCH") {
      const x = stare.comenzi.get(Number(m[1]));
      if (!x) return json(404, { success: false, message: "Order not found" });
      if (x.awb.length || ![1, 2].includes(x.status)) return json(422, { success: false, message: "Order cannot be canceled", data: null });
      x.status = 0;
      x.updated_at = new Date().toISOString();
      return json(200, { success: true, message: "Success", data: { ...comandaPublica(x), status: "Canceled" } });
    }
    m = /^\/orders\/(\d+)\/metadata$/.exec(cale);
    if (m && c.metoda === "POST") {
      const x = stare.comenzi.get(Number(m[1]));
      if (!x) return json(404, { success: false, message: "Order not found" });
      const lista = (((c.corp ?? {}) as Record<string, unknown>).metadata ?? []) as { key: string; value: string }[];
      for (const md of lista) {
        if (String(md.key).length > 191 || String(md.value).length > 191) {
          return json(422, { message: "The given data was invalid.", errors: { "metadata.0.value": ["The metadata.0.value may not be greater than 191 characters."] } });
        }
        x.metadate.push({ key: md.key, value: md.value });
      }
      return json(200, { success: true, message: "Success", data: [] });
    }

    // ── catalog (E3) ──
    if ((cale === "/categories/save/bulk" || cale === "/characteristics/save/bulk") && c.metoda === "POST") {
      const lipsaToken = ceraWebsiteToken(c);
      if (lipsaToken) return lipsaToken;
      const categorii = cale.startsWith("/categories");
      const cheieLista = categorii ? "categories" : "characteristics";
      const cheieId = categorii ? "category_website_id" : "characteristic_website_id";
      const lista = ((c.corp ?? {}) as Record<string, unknown>)[cheieLista];
      if (!Array.isArray(lista) || lista.length === 0) {
        return json(422, { message: "The given data was invalid.", errors: { [cheieLista]: [`The ${cheieLista} field is required.`] } });
      }
      for (const [i, x] of (lista as Record<string, unknown>[]).entries()) {
        if (!Number.isFinite(Number(x?.[cheieId])) || typeof x?.name !== "string" || !x.name.trim()) {
          return json(422, { message: "The given data was invalid.", errors: { [`${cheieLista}.${i}.name`]: ["The name field is required."] } });
        }
      }
      for (const x of lista as Record<string, unknown>[]) {
        const id = Number(x[cheieId]);
        if (categorii) {
          const existent = stare.categorii.get(id);
          stare.categorii.set(id, { id: existent?.id ?? stare.urmatorulIdCatalog++, category_website_id: id, name: String(x.name) });
        } else {
          const existent = stare.caracteristici.get(id);
          stare.caracteristici.set(id, { id: existent?.id ?? stare.urmatorulIdCatalog++, characteristic_website_id: id, name: String(x.name) });
        }
      }
      return json(200, { success: true, message: "Success", data: null });
    }

    if ((cale === "/products/save" || cale === "/products/save/bulk") && c.metoda === "POST") {
      const lipsaToken = ceraWebsiteToken(c);
      if (lipsaToken) return lipsaToken;
      const corp = (c.corp ?? {}) as Record<string, unknown>;
      if (cale === "/products/save") {
        const r = salveazaProdusFals(corp.product, "product");
        if ("erori" in r) return json(422, { message: "The given data was invalid.", errors: r.erori });
        return json(200, { success: true, data: produsPublic(r.produs) });
      }
      const lista = corp.products;
      if (!Array.isArray(lista) || lista.length === 0) {
        return json(422, { message: "The given data was invalid.", errors: { products: ["The products field is required."] } });
      }
      if (o.lotInvalid !== "partial") {
        for (const [i, p] of lista.entries()) {
          const erori = valideazaProdus(p, `products.${i}`);
          if (erori) return json(422, { message: "The given data was invalid.", errors: erori });
        }
      }
      for (const [i, p] of lista.entries()) salveazaProdusFals(p, `products.${i}`);
      return json(200, { success: true, message: "Success", data: null });
    }

    if (cale === "/products/prices/bulk" && c.metoda === "PATCH") {
      const lipsaToken = ceraWebsiteToken(c);
      if (lipsaToken) return lipsaToken;
      const lista = ((c.corp ?? {}) as Record<string, unknown>).data;
      if (!Array.isArray(lista) || lista.length === 0 || lista.length > 100) {
        return json(422, { message: "The given data was invalid.", errors: { data: ["The data must have between 1 and 100 items."] } });
      }
      const success: string[] = [];
      const errors: string[] = [];
      const products: unknown[] = [];
      for (const x of lista as { sku?: unknown; prices?: { sale_price?: unknown; full_price?: unknown } }[]) {
        const sku = String(x?.sku ?? "");
        const p = gasesteProdus(sku, false);
        const v = Number(x?.prices?.sale_price);
        const f = Number(x?.prices?.full_price);
        if (!p || !Number.isFinite(v) || !Number.isFinite(f)) { errors.push(sku); continue; }
        p.corp = { ...p.corp, sale_price: v, full_price: f };
        success.push(sku);
        const cota = Number(p.corp.tax_rate) || 0;
        products.push({ id: p.id, sku: p.sku, ean: null, sale_price: (v / (1 + cota / 100)).toFixed(4), full_price: (f / (1 + cota / 100)).toFixed(4), tax_rate: cota.toFixed(2) });
      }
      return json(200, { success: true, message: "Success", data: { result: { errors, success }, products } });
    }

    if (cale === "/products/archive/bulk" && c.metoda === "PATCH") {
      const lipsaToken = ceraWebsiteToken(c);
      if (lipsaToken) return lipsaToken;
      const skus = ((c.corp ?? {}) as Record<string, unknown>).skus;
      if (!Array.isArray(skus) || skus.length === 0 || skus.length > 50) {
        return json(422, { success: false, message: "The given data was invalid.", errors: { skus: ["The skus field is required."] } });
      }
      const archived: string[] = [];
      const not_found: string[] = [];
      const blocked: string[] = [];
      for (const s of skus.map(String)) {
        if ((o.arhivareBlocata ?? []).some((x) => x.toLowerCase() === s.toLowerCase())) { blocked.push(s); continue; }
        const p = gasesteProdus(s, true);
        if (!p) { not_found.push(s); continue; }
        p.arhivat = true;
        archived.push(s);
      }
      return json(200, { success: true, message: "Archive processed", data: { archived, not_found, blocked } });
    }

    if (cale === "/stocks/bulk" && c.metoda === "PATCH") {
      const lipsaToken = ceraWebsiteToken(c);
      if (lipsaToken) return lipsaToken;
      const lista = ((c.corp ?? {}) as Record<string, unknown>).data;
      if (!Array.isArray(lista) || lista.length === 0 || lista.length > 100) {
        return json(422, { message: "The given data was invalid.", errors: { data: ["The data must have between 1 and 100 items."] } });
      }
      const success: string[] = [];
      const errors: string[] = [];
      const error_messages: unknown[] = [];
      const products: unknown[] = [];
      for (const x of lista as { sku?: unknown; stock?: unknown }[]) {
        const sku = String(x?.sku ?? "");
        const p = gasesteProdus(sku, false);
        const s = Number(x?.stock);
        if (!p) { errors.push(sku); error_messages.push({ sku, message: "Product not found" }); continue; }
        if (!Number.isFinite(s)) { errors.push(sku); error_messages.push({ sku, message: "The stock must be a number." }); continue; }
        p.stock = s;
        success.push(sku);
        products.push({ id: p.id, sku: p.sku, ean: null, stock: p.stock, reserved_stock: p.reserved_stock, handling_time: null });
      }
      return json(200, { success: true, message: "Success", data: { result: { success, errors, error_messages }, products } });
    }

    // ── produse (citire) ──
    if (cale === "/products" && c.metoda === "GET") {
      const w = c.interogare.website;
      let lista = stare.produse.filter((p) => !p.arhivat);
      if (w && o.filtruWebsite === "strict") lista = lista.filter((p) => p.website === w);
      if (w && o.filtruWebsite === "partial") lista = lista.filter((p) => p.website.toLowerCase().includes(w.toLowerCase()));
      const s = c.interogare.sku;
      if (s) lista = lista.filter((p) => p.sku === s);
      const pagina = Math.max(1, Number(c.interogare.page) || 1);
      const total = lista.length;
      const ultima = Math.max(1, Math.ceil(total / 50));
      const felie = lista.slice((pagina - 1) * 50, pagina * 50);
      return json(200, {
        data: felie.map((p) => produsPublic(p)),
        meta: { current_page: pagina, last_page: ultima, total, per_page: 50 },
      });
    }

    return json(405, { message: "Method Not Allowed" });
  }

  const fetchFals = (async (intrare: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const u = new URL(typeof intrare === "string" ? intrare : intrare instanceof URL ? intrare.href : intrare.url);
    const antete: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => { antete[k.toLowerCase()] = v; });
    let corp: unknown = null;
    if (typeof init?.body === "string") {
      try { corp = JSON.parse(init.body); } catch { corp = init.body; }
    }
    const c: CerereInregistrata = {
      metoda: (init?.method ?? "GET").toUpperCase(),
      cale: u.pathname,
      interogare: Object.fromEntries(u.searchParams.entries()),
      antete,
      corp,
    };
    stare.cereri.push(c);
    return raspunde(c);
  }) as typeof fetch;

  /** Inlocuieste `globalThis.fetch` pe durata lui `fn` si il pune la loc oricum s-ar termina. */
  async function cuFetch<T>(fn: () => Promise<T>): Promise<T> {
    const vechi = globalThis.fetch;
    globalThis.fetch = fetchFals;
    try { return await fn(); } finally { globalThis.fetch = vechi; }
  }

  /**
   * O comanda a ALTUI canal (marketplace sau manuala), cum ar aparea in contul lor: liniile in forma
   * Get Order, cu `product_data.id` = id-ul lor al produsului (`ProdusFals.id`). Intoarce `internal_id`.
   */
  function comandaAltuiCanal(x: {
    canal: string | null; linii: { sku: string; cantitate: number; pretNet: number; cota?: number; idLor?: number | null }[];
    status?: number; plata?: string | null; website?: string;
  }): number {
    const internalId = stare.urmatorulInternalId++;
    stare.comenzi.set(internalId, {
      internal_id: internalId, order_id: `M-${internalId}`, website: x.website ?? "Emag", status: x.status ?? 1, awb: [], facturi: [],
      metadate: [], corp: { order_total: x.linii.reduce((s, l) => s + l.pretNet * (1 + (l.cota ?? 21) / 100) * l.cantitate, 0) },
      updated_at: new Date().toISOString(), marketplace: x.canal, cancel_request: null, livrare: null, curier: null,
      plata: x.plata ?? null, client: { name: "Cumpărător Marketplace" }, adresa: { city: "Cluj-Napoca", county: "Cluj", country: "RO" },
      linii: x.linii.map((l) => ({
        sku: l.sku, name: `Produs ${l.sku}`, quantity: l.cantitate, price: l.pretNet.toFixed(4), total: (l.pretNet * l.cantitate).toFixed(4),
        tax: ((l.cota ?? 21) / 100).toFixed(2),
        product_data: l.idLor === null ? null : { id: l.idLor ?? stare.produse.find((p) => p.sku.toLowerCase() === l.sku.toLowerCase())?.id ?? null, sku: l.sku },
        offer: x.canal ? { id: 1, marketplace_id: 1, marketplace_name: x.canal } : null,
      })),
    });
    return internalId;
  }

  /** Comanda lor, ca s-o poata schimba o proba (AWB, factura, stare). */
  function comanda(internalId: number): ComandaFalsa | undefined {
    return stare.comenzi.get(internalId);
  }

  return { stare, optiuni: o, fetch: fetchFals, cuFetch, forteaza, comanda, comandaAltuiCanal };
}

/** O cadere de retea, cum o arunca `fetch`. */
export function caderePeRetea(): never {
  throw new TypeError("fetch failed");
}

/** Un timp expirat, cum il arunca `AbortSignal.timeout`. */
export function timpExpirat(): never {
  const e = new Error("The operation was aborted due to timeout");
  e.name = "TimeoutError";
  throw e;
}
