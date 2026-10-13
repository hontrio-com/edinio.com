import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { impingeStoculPeCeleLalteCanale } from "@/lib/marketplace/stoc-pe-canale";
import { EroareCitireBaza } from "@/lib/supabase/rand-citit";
import { citesteComanda } from "./api";
import type { ContextEasySales } from "./client";
import { cheiaArticolului } from "./identitate";
import { anunta, anuntaRar } from "./notificari";
import { idText, suma } from "./numere";
import { aplicaComandaLor, citesteLegaturaPentruRecitire } from "./oglinda";
import { codulStarii } from "./stari";
import type { ComandaEasySales } from "./tipuri";

/**
 * Vanzarile din celelalte canale scad stocul Edinio (E4; planul, §5.6).
 *
 * ═══ CLASIFICAREA, IN ORDINE ═══
 *
 *   canal conectat nativ    canalul (eMAG, Trendyol...) e legat si direct la Edinio: o vanzare de acolo
 *                           e deja consumata pe drumul nativ. NU se consuma niciodata a doua oara, iar
 *                           omul primeste notificarea urgenta „canal pe doua drumuri";
 *   onorata de ei           FBE/FBA: marfa e deja la marketplace, deci stocul Edinio nu scade (regula
 *                           eMAG, `onoratDeEmag`);
 *   anulata la prima vedere o comanda vazuta prima oara deja anulata sau returnata nu consuma
 *                           (`seConsumaLaIntrare`, eMAG);
 *   fara linii legate       nicio linie a ei nu e a noastra (alt website al contului, oferte nelegate de
 *                           produsele Edinio): nu se consuma; raportul „nelegate" o arata (D32);
 *   vanzare                 liniile legate pe DOI martori: `product_data.id` = id-ul lor al articolului
 *                           nostru (`es_product_id`) SI `sku` egal. Un singur martor ar lega o vanzare
 *                           de pe alt website, cu acelasi SKU.
 *
 * ═══ CE SE SCRIE ═══
 *
 * O comanda `ES-<internal_id>` in `orders`, cu `order_source.marketplace = "easysales"` (deci fara
 * stampila, fara Meta, TikTok, email marketing si conturi) si cu date personale MINIME (D6: numele,
 * orasul, judetul), apoi `consuma_stoc_comanda_marketplace`, neschimbata, ca la eMAG si Pepita.
 * Legatura (`easysales_comenzi`, `directie = 'intrare'`) tine liniile consumate, fara date personale.
 *
 * ═══ UMBRA SI CANARUL ═══
 *
 *   `umbra`  se clasifica si se noteaza „ce as consuma" (`efect = 'umbra'`), fara comanda si fara
 *            consum: proba citirii si a potrivirii, inaintea oricarui efect;
 *   `canar`  se consuma numai liniile SKU-urilor alese de om (5-20); restul ramane in umbra;
 *   `efect`  tot.
 *
 * Idempotenta are trei paze: unicitatea `(business_id, 'intrare', es_order_id)`, unicitatea
 * `order_number` si marcajul `stoc_marketplace_la` din functia de consum.
 */

type Admin = SupabaseClient<Database>;

/* ═══════════════════════════════════════════════════════════════════════════
   PARTEA PURA
   ═══════════════════════════════════════════════════════════════════════════ */

export interface CanalNativ {
  canal: string;
  tara: string;
}

function curat(s: unknown): string {
  return typeof s === "string" ? s.toLowerCase().replace(/[^a-z]/g, "") : "";
}

/**
 * Canalul nativ Edinio din numele lor („Emag", „EmagHU", „TrendyolBG", „PepitaHU"...).
 * ⚠ Numele vin din exemplele `GET /marketplaces/list` [A] si din aplicatia lor; harta exacta e
 * M-MKT-1. Un nume necunoscut nu e un canal nativ.
 */
export function canalulNativ(nume: unknown): CanalNativ | null {
  const n = curat(nume).replace(/fb[ea]$/, "");
  const tara = (implicit: string) => (/(hu)$/.test(n) ? "hu" : /(bg)$/.test(n) ? "bg" : /(gr)$/.test(n) ? "gr" : /(ro)$/.test(n) ? "ro" : implicit);
  if (n.startsWith("emag")) return { canal: "emag", tara: tara("ro") };
  if (n.startsWith("trendyol")) return { canal: "trendyol", tara: tara("ro") };
  if (n.startsWith("aboutyou")) return { canal: "aboutyou", tara: tara("ro") };
  if (n.startsWith("olx")) return { canal: "olx", tara: "ro" };
  if (n.startsWith("pepita")) return { canal: "pepita", tara: tara("hu") };
  return null;
}

/** Comanda onorata de marketplace sau de un 3PL (FBE la eMAG, FBA la Amazon): marfa e deja la ei. */
export function onorataDeEi(nume: unknown): boolean {
  return /fb[ea]$/.test(curat(nume));
}

export interface LinieExterna {
  sku: string;
  nume: string;
  cantitate: number;
  /** `product_data.id`: id-ul LOR al produsului [A: numai in Get Order]. */
  esProductId: string | null;
  /** Pretul NET pe bucata [A: „price" e net in raspunsuri], cota in procente. */
  pretNet: number;
  cota: number;
  canal: string | null;
}

/** Liniile unei comenzi citite cu Get Order, tolerant. */
export function liniileComenzii(c: Pick<ComandaEasySales, "products">): LinieExterna[] {
  return (Array.isArray(c.products) ? c.products : []).map((l) => {
    const tax = suma(l?.tax);
    return {
      sku: typeof l?.sku === "string" ? l.sku.trim() : "",
      nume: typeof l?.name === "string" ? l.name.trim().slice(0, 300) : "",
      cantitate: Math.max(0, Math.floor(Number(l?.quantity) || 0)),
      esProductId: idText(l?.product_data?.id),
      pretNet: suma(l?.price) ?? 0,
      /* `tax` e fractie („0.19") [A]; o valoare peste 1 e deja procent. */
      cota: tax == null ? 0 : tax <= 1 ? Math.round(tax * 10000) / 100 : tax,
      canal: typeof l?.offer?.marketplace_name === "string" ? l.offer.marketplace_name : null,
    };
  }).filter((l) => l.cantitate > 0);
}

/** Articolul nostru, cum il stie `easysales_produse` (numai cele aflate la ei, cu id-ul lor). */
export interface ArticolLaEi {
  productUuid: string;
  identitate: string;
  sku: string;
  esProductId: string;
}

export interface LinieLegata {
  linie: LinieExterna;
  articol: ArticolLaEi;
}

export type ClasaComenzii =
  | { fel: "canal-nativ"; canal: CanalNativ }
  | { fel: "onorata-de-ei"; canal: string | null }
  | { fel: "anulata-la-prima-vedere" }
  | { fel: "fara-linii-legate"; nelegate: LinieExterna[] }
  | { fel: "vanzare"; legate: LinieLegata[]; nelegate: LinieExterna[] };

/** Canalul comenzii: al comenzii, altfel al primei linii cu oferta. */
export function canalulComenzii(c: Pick<ComandaEasySales, "marketplace" | "products">): string | null {
  if (typeof c.marketplace === "string" && c.marketplace.trim()) return c.marketplace.trim();
  return liniileComenzii(c).find((l) => l.canal)?.canal ?? null;
}

/** Clasificarea. Pura. */
export function clasificaComanda(
  c: ComandaEasySales,
  ctx: { canaleConectate: readonly CanalNativ[]; articole: ReadonlyMap<string, ArticolLaEi>; laPrimaVedere: boolean },
): ClasaComenzii {
  const canal = canalulComenzii(c);
  const nativ = canalulNativ(canal);
  if (nativ && !onorataDeEi(canal) && ctx.canaleConectate.some((x) => x.canal === nativ.canal && x.tara === nativ.tara)) {
    return { fel: "canal-nativ", canal: nativ };
  }
  if (onorataDeEi(canal)) return { fel: "onorata-de-ei", canal };
  const cod = codulStarii(c.status);
  if (ctx.laPrimaVedere && (cod === 0 || cod === 6)) return { fel: "anulata-la-prima-vedere" };
  const legate: LinieLegata[] = [];
  const nelegate: LinieExterna[] = [];
  for (const l of liniileComenzii(c)) {
    const a = l.esProductId ? ctx.articole.get(l.esProductId) : undefined;
    if (a && l.sku && a.sku.toLowerCase() === l.sku.toLowerCase()) legate.push({ linie: l, articol: a });
    else nelegate.push(l);
  }
  if (legate.length === 0) return { fel: "fara-linii-legate", nelegate };
  return { fel: "vanzare", legate, nelegate };
}

/** Starea Edinio a unei comenzi aduse acum, din codul lor [A: filtrul `status`]. */
export function stareaInitiala(cod: number | null): "confirmed" | "processing" | "shipped" {
  if (cod === 4) return "processing";
  if (cod === 3) return "shipped";
  return "confirmed";
}

function bani(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Liniile comenzii `ES-...` (toate, cele nelegate fara `product_id`) si sumele, din liniile lor nete. */
export function liniileComenziiEdinio(legate: readonly LinieLegata[], nelegate: readonly LinieExterna[], titluri: ReadonlyMap<string, string | null>) {
  const items = [
    ...legate.map(({ linie, articol }) => ({
      product_id: articol.productUuid,
      name: linie.nume || linie.sku,
      price: bani(linie.pretNet * (1 + linie.cota / 100)),
      quantity: linie.cantitate,
      vat_rate: linie.cota,
      sku: linie.sku,
      ...(titluri.get(cheiaArticolului({ product_uuid: articol.productUuid, identitate: articol.identitate }))
        ? { variant_title: titluri.get(cheiaArticolului({ product_uuid: articol.productUuid, identitate: articol.identitate })) as string } : {}),
    })),
    ...nelegate.map((l) => ({
      product_id: null, name: l.nume || l.sku, price: bani(l.pretNet * (1 + l.cota / 100)), quantity: l.cantitate, vat_rate: l.cota, sku: l.sku,
    })),
  ];
  const subtotal = bani(items.reduce((s, x) => s + x.price * x.quantity, 0));
  const cote = new Map<number, number>();
  for (const x of items) cote.set(x.vat_rate, (cote.get(x.vat_rate) ?? 0) + x.price * x.quantity);
  const cotaDominanta = [...cote.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const tva = bani(items.reduce((s, x) => s + (x.price * x.quantity * x.vat_rate) / (100 + x.vat_rate), 0));
  return { items, subtotal, cotaDominanta, tva };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CU BAZA
   ═══════════════════════════════════════════════════════════════════════════ */

export type ModBucla = "umbra" | "canar" | "efect";
export type SoartaExterna = "gata" | "reincearca" | "asteapta_omul";

/** Articolele aflate la ei, dupa id-ul lor, pentru liniile date. */
async function articoleleLaEi(admin: Admin, businessId: string, esIds: string[]): Promise<Map<string, ArticolLaEi>> {
  const out = new Map<string, ArticolLaEi>();
  if (esIds.length === 0) return out;
  const { data, error } = await admin.from("easysales_produse").select("product_uuid, identitate, sku_trimis, es_product_id, stare")
    .eq("business_id", businessId).in("es_product_id", esIds);
  if (error) throw new EroareCitireBaza("easysales.externe", error.message);
  for (const r of (data ?? []) as { product_uuid: string; identitate: string; sku_trimis: string | null; es_product_id: string | null; stare: string }[]) {
    /* ⚠ Arhivatii nu intra in potrivire (planul, §5.4.7): la ei produsul nu mai e al nostru. */
    if (!r.es_product_id || !r.sku_trimis || r.stare === "arhivat") continue;
    out.set(r.es_product_id, { productUuid: r.product_uuid, identitate: r.identitate, sku: r.sku_trimis, esProductId: r.es_product_id });
  }
  return out;
}

/** Titlul combinatiei fiecarui articol legat (pentru `variant_title`, dupa care scade functia de consum). */
async function titlurileCombinatiilor(admin: Admin, businessId: string, legate: readonly LinieLegata[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const uuids = [...new Set(legate.filter((x) => x.articol.identitate !== "").map((x) => x.articol.productUuid))];
  if (uuids.length === 0) return out;
  const { identitateCombinatie } = await import("@/lib/storefront/variante-identitate");
  const { combinatiiActiveUnice, parseVariants } = await import("@/lib/storefront/variants");
  const { data, error } = await admin.from("products").select("id, page_sections").eq("business_id", businessId).in("id", uuids);
  if (error) throw new EroareCitireBaza("easysales.externe", error.message);
  for (const p of (data ?? []) as { id: string; page_sections: unknown }[]) {
    for (const c of combinatiiActiveUnice(parseVariants(p.page_sections))) {
      out.set(cheiaArticolului({ product_uuid: p.id, identitate: identitateCombinatie(c) }), c.title);
    }
  }
  return out;
}

interface DateMinime {
  nume: string;
  oras: string;
  judet: string;
  tara: string;
}

/** Datele personale minime (D6): numele, orasul, judetul. Niciun telefon, email sau strada. */
function dateMinime(c: ComandaEasySales & { customer?: unknown; shipping_address?: unknown }): DateMinime {
  const cl = (c.customer ?? {}) as Record<string, unknown>;
  const ad = (c.shipping_address ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 120) : "");
  const nume = text(cl.name) || [text(cl.first_name), text(cl.last_name)].filter(Boolean).join(" ") || text(ad.name) || "Client easySales";
  return { nume, oras: text(ad.city), judet: text(ad.county) || text(ad.region), tara: text(ad.country) || "RO" };
}

/** Cererea „canal pe doua drumuri", cel mult o data pe zi pe canal. */
async function canalPeDouaDrumuri(admin: Admin, ctx: ContextEasySales, canal: CanalNativ): Promise<void> {
  await anuntaRar(admin, ctx.dep, ctx.businessId, ctx.cfg, `doua-drumuri:${canal.canal}:${canal.tara}`, 24 * 3600_000, {
    titlu: "Un canal vinde pe două drumuri",
    mesaj: `easySales a adus o comandă de pe ${canal.canal} (${canal.tara.toUpperCase()}), canal legat și direct la Edinio. Nu i-am scăzut stocul a doua oară. Alege un singur drum pentru acest canal: direct în Edinio sau prin easySales.`,
    severitate: "critical",
  });
}

async function legaturaIntrare(admin: Admin, businessId: string, internalId: string) {
  const { data, error } = await admin.from("easysales_comenzi").select("id, stare, efect, order_uuid, linii, es_updated_at")
    .eq("business_id", businessId).eq("directie", "intrare").eq("es_order_id", internalId).maybeSingle();
  if (error) throw new EroareCitireBaza("easysales.externe", error.message);
  return data as { id: string; stare: string; efect: string | null; order_uuid: string | null; linii: Json | null; es_updated_at: string | null } | null;
}

/** Liniile consumate, scrise in legatura (fara date personale). */
function liniiConsumate(legate: readonly LinieLegata[], titluri: ReadonlyMap<string, string | null>) {
  return legate.map(({ linie, articol }) => ({
    product_id: articol.productUuid,
    identitate: articol.identitate,
    variant_title: titluri.get(cheiaArticolului({ product_uuid: articol.productUuid, identitate: articol.identitate })) ?? null,
    quantity: linie.cantitate,
    sku: articol.sku,
  }));
}

function consumul(linii: ReturnType<typeof liniiConsumate>) {
  const produse = new Map<string, number>();
  const variante = new Map<string, { product_id: string; variant_title: string; quantity: number }>();
  for (const l of linii) {
    produse.set(l.product_id, (produse.get(l.product_id) ?? 0) + l.quantity);
    if (l.variant_title) {
      const k = `${l.product_id}::${l.variant_title}`;
      const e = variante.get(k);
      if (e) e.quantity += l.quantity;
      else variante.set(k, { product_id: l.product_id, variant_title: l.variant_title, quantity: l.quantity });
    }
  }
  return {
    p_produse: [...produse.entries()].map(([product_id, quantity]) => ({ product_id, quantity })),
    p_variante: [...variante.values()],
  };
}

/**
 * O comanda a altui canal, citita de la ei si dusa la capat: clasificata, notata, si (in `canar` sau
 * `efect`) inregistrata si consumata. Comenzile deja consumate se aduc la zi: starea (anularea
 * elibereaza stocul), iar liniile schimbate dupa consum trec prin `ajusteaza_stoc_comanda_marketplace`.
 *
 * ⚠ Arunca numai erori de programare: o pana a bazei sau a lor da `reincearca`.
 */
export async function prelucreazaComandaExterna(
  admin: Admin, ctx: ContextEasySales, internalId: string, opt: { mod: ModBucla; canar: ReadonlySet<string>; canaleConectate: readonly CanalNativ[] },
): Promise<SoartaExterna> {
  const b = ctx.businessId;
  const r = await citesteComanda(ctx, internalId);
  if (!r.ok) {
    if (r.verdict === "negasit") return "gata";
    if (r.verdict === "neautorizat" || r.verdict === "website_dezactivat" || r.verdict === "website_token_invalid" || r.verdict === "scope_lipsa") return "asteapta_omul";
    return "reincearca";
  }
  const c = (r.date ?? {}) as ComandaEasySales;

  /* A noastra (o comanda a vitrinei): o tine oglinda (F2). */
  const aNoastra = await citesteLegaturaPentruRecitire(admin, b, { internalId });
  if (aNoastra) return "gata";

  const leg = await legaturaIntrare(admin, b, internalId);
  /* Prima vedere: fara rand, sau un rand ramas `externa` fara efect (inregistrarea a cazut, se reia). */
  const primaVedere = !leg || (leg.stare === "externa" && leg.efect == null);
  const esIds = [...new Set(liniileComenzii(c).map((l) => l.esProductId).filter((x): x is string => !!x))];
  const articole = await articoleleLaEi(admin, b, esIds);
  const clasa = clasificaComanda(c, { canaleConectate: opt.canaleConectate, articole, laPrimaVedere: primaVedere });
  const cod = codulStarii(c.status);
  const acum = new Date().toISOString();
  const canal = canalulComenzii(c);
  const comun = {
    es_status_cod: cod, es_status_text: typeof c.status === "string" ? c.status.slice(0, 60) : null,
    es_display_id: idText(c.order_display_id), es_updated_at: typeof c.updated_at === "string" ? c.updated_at : null,
    canal: canal?.slice(0, 60) ?? null, citita_la: acum, ultima_veste_la: acum,
    es_anulata_la: cod === 0 ? acum : null,
  };
  /*
   * ⚠ ACEEASI REGULA A MODULUI la intrare si la recitire: in `canar` se consuma numai liniile
   * SKU-urilor alese. Altfel recitirea unei comenzi consumate pe jumatate ar fi comparat toate
   * liniile legate cu cele consumate si ar fi consumat retroactiv si restul.
   */
  const filtrul = (legate: readonly LinieLegata[]) => (opt.mod === "efect" ? [...legate]
    : opt.mod === "canar" ? legate.filter((x) => opt.canar.has(x.articol.sku.toLowerCase())) : []);

  /* ── comanda deja consumata: starea si liniile ── */
  if (leg && leg.stare === "consumata" && leg.order_uuid) {
    /*
     * ⚠ In umbra nu se ajusteaza nimic: un set gol trimis la ajustare ar ELIBERA tot ce s-a consumat
     * (setul e autoritar). Un produs adaugat sau un storno partial se aplica numai cu efect.
     */
    if (clasa.fel === "vanzare" && opt.mod !== "umbra" && cod !== 0) {
      const titluri = await titlurileCombinatiilor(admin, b, clasa.legate);
      const noi = liniiConsumate(filtrul(clasa.legate), titluri);
      if (noi.length > 0 && JSON.stringify(noi) !== JSON.stringify(leg.linii ?? [])) {
        const { error } = await admin.rpc("ajusteaza_stoc_comanda_marketplace", { p_order_id: leg.order_uuid, p_business_id: b, ...consumul(noi) } as never);
        if (error) return "reincearca";
        await admin.from("easysales_comenzi").update({ linii: noi as unknown as Json }).eq("id", leg.id);
        await impingeStoculPeCeleLalteCanale(b, noi.map((l) => l.product_id), "easysales");
      }
    }
    await admin.from("easysales_comenzi").update(comun).eq("id", leg.id);
    const recitita = await citesteLegaturaPentruRecitire(admin, b, { orderUuid: leg.order_uuid, directie: "intrare" });
    if (recitita) {
      const tr = await aplicaComandaLor(admin, ctx, recitita, c, { updatedAt: typeof c.updated_at === "string" ? c.updated_at : null });
      if (tr === "reincearca") return "reincearca";
    }
    return "gata";
  }

  /* ── vazuta deja, fara efect de luat: umbra sau neconsumata. Numai starea se aduce la zi. ── */
  if (leg && !primaVedere) {
    await admin.from("easysales_comenzi").update(comun).eq("id", leg.id);
    return "gata";
  }

  /* ── prima vedere ── */
  const scrieLegatura = async (petic: Database["public"]["Tables"]["easysales_comenzi"]["Insert"]) => {
    if (leg) {
      const { error } = await admin.from("easysales_comenzi").update(petic).eq("id", leg.id);
      if (error) throw new EroareCitireBaza("easysales.externe", error.message);
      return;
    }
    const { error } = await admin.from("easysales_comenzi").insert(petic);
    if (error && error.code !== "23505") throw new EroareCitireBaza("easysales.externe", error.message);
  };
  const baza = { business_id: b, directie: "intrare", es_order_id: internalId, es_internal_id: internalId, stapan: "easysales", ...comun };

  if (clasa.fel !== "vanzare") {
    const motiv = clasa.fel === "canal-nativ" ? `canal legat si direct la Edinio (${clasa.canal.canal}/${clasa.canal.tara})`
      : clasa.fel === "onorata-de-ei" ? "onorata de marketplace (marfa e deja la ei)"
        : clasa.fel === "anulata-la-prima-vedere" ? "vazuta prima oara deja anulata sau returnata"
          : "nicio linie legata de produsele Edinio";
    await scrieLegatura({ ...baza, stare: "neconsumata", motiv, efect: null, linii: null });
    if (clasa.fel === "canal-nativ" && opt.mod !== "umbra") await canalPeDouaDrumuri(admin, ctx, clasa.canal);
    return "gata";
  }

  const titluri = await titlurileCombinatiilor(admin, b, clasa.legate);
  const deConsumat = filtrul(clasa.legate);
  if (deConsumat.length === 0) {
    /* Umbra (sau canarul fara SKU-uri alese pe comanda): „ce as consuma". */
    await scrieLegatura({ ...baza, stare: "externa", efect: "umbra", linii: liniiConsumate(clasa.legate, titluri) as unknown as Json, motiv: null });
    return "gata";
  }

  /* ── inregistrarea si consumul ── */
  const consumate = liniiConsumate(deConsumat, titluri);
  const ramase = clasa.legate.filter((x) => !deConsumat.includes(x)).map((x) => x.linie);
  const sume = liniileComenziiEdinio(deConsumat, [...clasa.nelegate, ...ramase], titluri);
  const total = suma(c.total_value) ?? sume.subtotal;
  const d = dateMinime(c as ComandaEasySales & { customer?: unknown; shipping_address?: unknown });
  const numar = `ES-${internalId}`;
  const { data: nou, error: eIns } = await admin.from("orders").insert({
    business_id: b,
    order_number: numar,
    customer_name: d.nume,
    customer_phone: "",
    customer_email: null,
    shipping_address: { name: d.nume, city: d.oras, county: d.judet, country: d.tara, delivery_type: "address" } as unknown as Json,
    items: sume.items as unknown as Json,
    subtotal: sume.subtotal,
    shipping_cost: Math.max(0, bani(total - sume.subtotal)),
    total,
    vat_amount: sume.tva,
    vat_rate: sume.cotaDominanta,
    prices_include_vat: true,
    status: stareaInitiala(cod),
    payment_method: "easysales",
    payment_status: c.payment_status === "Paid" ? "paid" : "unpaid",
    internal_notes: `Comandă adusă din easySales${canal ? ` (${canal})` : ""}, #${idText(c.order_display_id) ?? internalId}. Se procesează în easySales.`
      + (clasa.nelegate.length ? ` Linii fără produs Edinio: ${clasa.nelegate.map((l) => l.sku || l.nume).join(", ")}.` : ""),
    order_source: { marketplace: "easysales", canal, easysales_internal_id: internalId } as unknown as Json,
  } as never).select("id").maybeSingle();

  let orderId = (nou as { id?: string } | null)?.id ?? null;
  if (!orderId) {
    const { data: gasita } = await admin.from("orders").select("id").eq("business_id", b).eq("order_number", numar).maybeSingle();
    orderId = (gasita as { id?: string } | null)?.id ?? null;
  }
  if (!orderId) {
    await scrieLegatura({ ...baza, stare: "externa", efect: null, linii: consumate as unknown as Json, motiv: `comanda nu s-a putut scrie: ${eIns?.message ?? "?"}`.slice(0, 500) });
    await anunta(admin, b, {
      titlu: "Vânzare externă neînregistrată: stocul nu s-a scăzut",
      mesaj: `Comanda easySales #${idText(c.order_display_id) ?? internalId} nu s-a putut scrie în Edinio. Reîncercăm; până atunci stocul ei nu e scăzut.`,
      severitate: "critical", detalii: { internalId },
    });
    return "reincearca";
  }

  const { data: rez, error: eCons } = await admin.rpc("consuma_stoc_comanda_marketplace", { p_order_id: orderId, p_business_id: b, ...consumul(consumate) } as never);
  const rc = rez as { gasit?: boolean; deja?: boolean; lipsa?: unknown[] } | null;
  if (eCons || rc?.gasit !== true) {
    await scrieLegatura({ ...baza, order_id: orderId, order_uuid: orderId, stare: "externa", efect: null, linii: consumate as unknown as Json, motiv: "consumul de stoc n-a raspuns" });
    await logError({ action: "easysales.externe", severity: "critical", businessId: b, message: eCons?.message ?? "consumul de stoc n-a raspuns valid", details: { orderId } });
    return "reincearca";
  }
  await scrieLegatura({ ...baza, order_id: orderId, order_uuid: orderId, stare: "consumata", efect: "aplicat", linii: consumate as unknown as Json, motiv: null });
  if (!rc.deja && Array.isArray(rc.lipsa) && rc.lipsa.length > 0) {
    await anunta(admin, b, {
      titlu: `Posibilă supravânzare: comanda #${numar}`,
      mesaj: `Comanda din easySales a cerut mai mult stoc decât era în Edinio; s-a scăzut cât s-a putut. Verifică produsele: ${JSON.stringify(rc.lipsa).slice(0, 300)}`,
      severitate: "error", detalii: { orderId },
    });
  }
  if (!rc.deja) await impingeStoculPeCeleLalteCanale(b, consumate.map((l) => l.product_id), "easysales");
  return "gata";
}
