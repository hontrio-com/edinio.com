import { createHash, timingSafeEqual } from "node:crypto";
import { PLAFON_CORP_WEBHOOK } from "./constante";
import { jetonulSePotriveste, livrareaDovedesteFormula, verificaSemnatura, type VariantaSemnatura } from "./semnatura";
import type { EasySalesConfig } from "./tipuri";

/**
 * Primirea unei livrari easySales: autentificare, curatare, inbox. Fara prelucrare.
 *
 * ═══ ⚠ IN SUB TREI SECUNDE ═══
 *
 * O livrare e socotita esuata la un raspuns non-2xx sau mai lent de 3 secunde; urmeaza inca doua
 * incercari, dupa 10 s si dupa 100 s [A]. Prelucrarea noastra e o recitire prin API (termen 20 s),
 * deci se face DUPA raspuns (`after`), iar ce ramane neprelucrat reia cronul.
 *
 * ═══ RASPUNSURILE, SI DE CE NU SE CONFUNDA ═══
 *
 *   magazin neformat / inexistent    200, fara rand (o reincercare n-ar schimba nimic)
 *   citirea configurarii a picat     503: ei reincearca, iar evenimentul nu s-a pierdut
 *   jeton gresit                     200, fara rand, cu jurnal strangulat
 *   scrierea in inbox a picat        503, singurul alt caz
 *   orice alta livrare               200, scrisa in inbox, INCLUSIV cea oprita in modul `impune`
 *
 * ═══ ⚠ DOUA INCUIETORI ═══
 *
 *   1. jetonul din adresa, comparat in timp constant cu hash-ul pastrat;
 *   2. antetul `Signature` (vezi `semnatura.ts`), in modul `masoara` pana se dovedeste formula,
 *      apoi `impune`: o livrare cu jeton bun si semnatura nepotrivita se PASTREAZA cu
 *      `semnatura_ok = false`, nu se prelucreaza, si porneste alarma. Aruncata, un secret gresit
 *      sau o formula schimbata la ei ar pierde tacut toate evenimentele.
 *
 * ⚠ Payload-ul nu schimba niciodata direct starea comenzilor, stocul sau banii: fiecare eveniment
 * duce la o RECITIRE prin API, cu tokenul nostru. Singura exceptie sunt datele de storno, pastrate
 * numai ca informatie afisata (planul, §6.6).
 */

/** Ce scrie ruta in inbox. */
export interface RandInbox {
  business_id: string;
  slug: string | null;
  amprenta: string;
  corp: Record<string, unknown> | null;
  semnatura_ok: boolean | null;
  semnatura_varianta: VariantaSemnatura | null;
  motiv: string | null;
}

export interface DepsPrimire {
  /** `null` = magazinul nu exista sau n-are configurare; arunca la o citire cazuta. */
  citesteConfig(businessId: string): Promise<EasySalesConfig | null>;
  /** Id-ul randului, sau `null` cand scrierea a picat. */
  scrieInbox(rand: RandInbox): Promise<string | null>;
  peticConfig(businessId: string, petic: Partial<EasySalesConfig>): Promise<unknown>;
  /** Strangularea alarmelor pentru jetoanele gresite (pe magazin). `true` = se poate scrie. */
  poateSemnala(cheie: string): Promise<boolean>;
  alarma(p: { businessId: string; mesaj: string; severitate: "warning" | "error" | "critical"; detalii?: Record<string, unknown> }): Promise<void>;
  /** Prelucrarea, programata DUPA raspuns. */
  dupaRaspuns(businessId: string, inboxId: string): void;
}

export interface IntrarePrimire {
  businessId: string | null;
  jeton: string | null;
  corpBrut: string;
  antetSemnatura: string | null;
}

export interface IesirePrimire {
  status: number;
  /** Ce s-a intamplat, pentru probe si jurnal. Nu pleaca la ei. */
  urma: "magazin_invalid" | "jeton_gresit" | "config_cazuta" | "inbox_cazut" | "scris" | "oprit_impune";
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function obiect(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function alege(sursa: unknown, chei: readonly string[]): Record<string, unknown> | null {
  const o = obiect(sursa);
  if (!o) return null;
  const out: Record<string, unknown> = {};
  for (const k of chei) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

/**
 * Curatarea, pe LISTA ALBA, inainte de orice scriere (planul, §6.6).
 *
 * ⚠ Un camp nou adaugat de ei se PIERDE, nu se scurge. Datele personale (`customer`, adresele,
 * numele, telefoanele) si `website.token` nu ajung niciodata in inbox.
 */
/** `website.token` din payload e chiar al nostru? In timp constant, pe amprente; lipsa da `false`. */
export function jetonulWebsiteuluiSePotriveste(primit: unknown, alNostru: string | null | undefined): boolean {
  if (typeof primit !== "string" || !primit || !alNostru) return false;
  const a = createHash("sha256").update(primit, "utf8").digest();
  const b = createHash("sha256").update(alNostru, "utf8").digest();
  return timingSafeEqual(a, b);
}

/**
 * @param websiteTokenNostru numai pentru reimprospatari: tokenul lor se compara aici, iar in inbox
 *                           intra doar verdictul (`token_ok`), niciodata tokenul.
 */
export function curataLivrarea(corp: unknown, websiteTokenNostru?: string | null): { slug: string | null; curat: Record<string, unknown> | null } {
  const c = obiect(corp);
  if (!c) return { slug: null, curat: null };
  const webhook = alege(c.webhook, ["id", "slug"]);
  const slug = typeof webhook?.slug === "string" ? webhook.slug : null;
  const p = obiect(c.payload);
  const curat: Record<string, unknown> = { webhook };
  if (!p) return { slug, curat };

  switch (slug) {
    case "order-created":
    case "order-updated": {
      const o = obiect(p.order);
      const comanda = alege(o, ["internal_id", "id", "order_display_id", "marketplace", "status"]);
      if (comanda && Array.isArray(o?.products)) {
        comanda.skus = o!.products.map((x) => (obiect(x) && typeof obiect(x)!.sku === "string" ? obiect(x)!.sku : null)).filter(Boolean);
      }
      curat.payload = { order: comanda };
      break;
    }
    case "awb-created":
      curat.payload = { awb: alege(p.awb, ["id", "order_id", "order_display_id"]) };
      break;
    case "invoice-created":
      curat.payload = { invoice: alege(p.invoice, ["id", "order_id", "order_display_id"]) };
      break;
    case "storno-invoice-created": {
      const s = alege(p.storno_invoice, [
        "id", "invoice_nr", "invoice_series", "date", "value", "correction_kind", "url",
        "order_id", "order_display_id", "order_return_id", "order_return_display_id",
      ]);
      if (s) s.corrected_invoice = alege(obiect(p.storno_invoice)?.corrected_invoice, ["id", "invoice_nr", "invoice_series", "url"]);
      curat.payload = { storno_invoice: s };
      break;
    }
    case "delivery-status-updated": {
      const sh = alege(p.shipment, ["id", "awb_id", "courier"]);
      if (sh) sh.delivery_status = alege(obiect(p.shipment)?.delivery_status, ["value", "description"]);
      curat.payload = { order: alege(p.order, ["id", "order_display_id"]), shipment: sh };
      break;
    }
    case "products-refresh-requested":
    case "stock-refresh-requested":
      /* ⚠ `website.token` NU intra in inbox: se compara aici cu al nostru, in timp constant, si ramane numai verdictul. */
      curat.payload = {
        website: {
          ...(alege(p.website, ["name", "url"]) ?? {}),
          token_ok: jetonulWebsiteuluiSePotriveste(obiect(p.website)?.token, websiteTokenNostru),
        },
      };
      break;
    case "product-stock-updated":
      curat.payload = { product: alege(p.product, ["id", "sku", "stock", "product_website_id"]) };
      break;
    default:
      /* Evenimentele de cont n-au exemplu de payload [A]; un slug neasteptat se pastreaza gol. */
      break;
  }
  return { slug, curat };
}

/** Logica rutei, separata ca sa se poata rula in probe cu dependinte false. */
export async function primesteLivrarea(deps: DepsPrimire, intrare: IntrarePrimire): Promise<IesirePrimire> {
  const businessId = intrare.businessId ?? "";
  if (!RE_UUID.test(businessId)) return { status: 200, urma: "magazin_invalid" };

  let cfg: EasySalesConfig | null;
  try {
    cfg = await deps.citesteConfig(businessId);
  } catch {
    return { status: 503, urma: "config_cazuta" };
  }
  if (!cfg || !cfg.webhook_jeton_hash) return { status: 200, urma: "magazin_invalid" };

  if (!jetonulSePotriveste(intrare.jeton, cfg.webhook_jeton_hash)) {
    if (cfg.connected && (await deps.poateSemnala(`easysales-webhook-jeton:${businessId}`))) {
      /* ⚠ Adresa intreaga nu intra in jurnal: jetonul sta in query string. */
      await deps.alarma({ businessId, severitate: "warning", mesaj: "livrare easySales cu jeton gresit (o abonare veche sau o incercare din afara)" });
    }
    return { status: 200, urma: "jeton_gresit" };
  }

  const amprenta = createHash("sha256").update(intrare.corpBrut, "utf8").digest("hex");
  let parsat: unknown = null;
  let corpCitibil = true;
  try { parsat = JSON.parse(intrare.corpBrut); } catch { corpCitibil = false; }

  const sem = verificaSemnatura(intrare.corpBrut, intrare.antetSemnatura, cfg.webhook_secret);
  const mod = cfg.semnatura_mod ?? "masoara";
  const potrivitaPeVarianta = sem.potrivita && (!cfg.semnatura_varianta || cfg.semnatura_varianta === sem.varianta);
  const oprita = mod === "impune" && !potrivitaPeVarianta;
  const { slug, curat } = corpCitibil ? curataLivrarea(parsat, cfg.website_token ?? null) : { slug: null, curat: null };

  const id = await deps.scrieInbox({
    business_id: businessId,
    slug,
    amprenta,
    corp: curat,
    semnatura_ok: sem.potrivita,
    semnatura_varianta: sem.varianta,
    motiv: !corpCitibil ? "corp_necitibil" : oprita ? "oprita_impune" : null,
  });
  if (!id) return { status: 503, urma: "inbox_cazut" };

  /* Prima potrivire se noteaza o data, fara secret; o livrare care dovedeste formula muta in `impune`. */
  if (sem.potrivita) {
    const petic: Partial<EasySalesConfig> = { ultima_livrare_la: new Date().toISOString() };
    if (!cfg.semnatura_varianta) petic.semnatura_varianta = sem.varianta as "corp" | "payload";
    if (mod === "masoara" && livrareaDovedesteFormula(intrare.corpBrut)) petic.semnatura_mod = "impune";
    await deps.peticConfig(businessId, petic);
  } else {
    await deps.peticConfig(businessId, { ultima_livrare_la: new Date().toISOString() });
    const mesaj = sem.varianta === "cheie_goala" || sem.varianta === "lipsa"
      ? "livrare easySales fara semnatura cu secretul nostru: secretul n-a fost preluat la abonare"
      : "livrare easySales cu semnatura nepotrivita";
    await deps.alarma({ businessId, severitate: oprita ? "error" : "warning", mesaj, detalii: { varianta: sem.varianta, mod, slug } });
  }

  if (!corpCitibil) {
    await deps.alarma({ businessId, severitate: "warning", mesaj: "livrare easySales cu corp care nu e JSON", detalii: { lungime: intrare.corpBrut.length } });
  }

  if (oprita) return { status: 200, urma: "oprit_impune" };
  if (corpCitibil) deps.dupaRaspuns(businessId, id);
  return { status: 200, urma: "scris" };
}

/**
 * Corpul raspunsului catre easySales, pe fiecare drum al rutei.
 *
 * ⚠ MASURAT pe 14.10.2026, pe contul primului comerciant: un 200 cu `{"received": true}`, dat in
 * sub 0,3 secunde, e notat la ei ca livrare ESUATA (`success: false` cu `status_code: 200`), deci
 * reincearca dupa 10 s, 100 s si 1000 s, iar acelasi eveniment soseste de patru ori. Documentatia
 * spune numai „2xx in sub 3 secunde”, dar exemplul lor de livrare reusita are raspunsul exact
 * `{"success":true}`. La orice 200 (si la livrarile ignorate anume, unde o reincercare n-ar schimba
 * nimic) raspundem deci `{"success": true}` si nimic altceva; la 503, `{"success": false}`.
 */
export function corpulRaspunsului(status: number): { success: boolean } {
  return { success: status >= 200 && status < 300 };
}

/** Citeste corpul cel mult pana la plafon. Peste plafon, intoarce `null` (livrarea nu e a lor). */
export async function citesteCorpulMarginit(req: Request): Promise<string | null> {
  const lungime = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(lungime) && lungime > PLAFON_CORP_WEBHOOK) return null;
  const text = await req.text();
  return text.length > PLAFON_CORP_WEBHOOK ? null : text;
}
