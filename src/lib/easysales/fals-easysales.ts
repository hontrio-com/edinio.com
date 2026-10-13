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
 *   - campul secretului la abonare: `secret` sau `seccret` (M-WH-1).
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
  produse?: { sku: string; website: string; product_website_id?: number }[];
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
    produse: o.produse ?? [],
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
    };
  }

  async function raspunde(c: CerereInregistrata): Promise<Response> {
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

    // ── produse (citire) ──
    if (cale === "/products" && c.metoda === "GET") {
      const w = c.interogare.website;
      let lista = stare.produse;
      if (w && o.filtruWebsite === "strict") lista = lista.filter((p) => p.website === w);
      if (w && o.filtruWebsite === "partial") lista = lista.filter((p) => p.website.toLowerCase().includes(w.toLowerCase()));
      const s = c.interogare.sku;
      if (s) lista = lista.filter((p) => p.sku === s);
      return json(200, {
        data: lista.map((p) => ({ sku: p.sku, product_website_id: p.product_website_id ?? null, website: { name: p.website } })),
        meta: { current_page: 1, last_page: 1, total: lista.length, per_page: 50 },
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

  /** Comanda lor, ca s-o poata schimba o proba (AWB, factura, stare). */
  function comanda(internalId: number): ComandaFalsa | undefined {
    return stare.comenzi.get(internalId);
  }

  return { stare, optiuni: o, fetch: fetchFals, cuFetch, forteaza, comanda };
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
