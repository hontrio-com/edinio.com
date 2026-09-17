import { isIP } from "node:net";
import { ttclidValid, ttpValid, type EvenimentTikTok } from "./capi";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  UN EVENIMENT PRIMIT DIN BROWSER, VERIFICAT SI TRANSFORMAT IN EVENIMENT EVENTS API
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CAPATUL E PUBLIC SI FARA SESIUNE, ca cel al Meta. Deci se primeste DOAR ce are voie sa ajunga in pixel:
    - numai evenimentele de palnie (`Purchase` NU: achizitia pleaca de pe server, din comanda);
    - numai campurile din documentatia lor, cu tipurile si marimile lor;
    - `page.url` trebuie sa fie o pagina a ACESTUI magazin (vezi `adresaEAMagazinului`).
  Datele omului nu vin din corp: IP-ul, agentul si cookie-urile (`ttclid`, `_ttp`) se citesc din cerere.

  ⚠ `page.url` E OBLIGATORIU la TikTok pentru evenimentele web („Required for web events”), spre deosebire
  de Meta, unde `event_source_url` e doar cerut de bunele practici. Fara el nu se trimite nimic.
*/

export const EVENIMENTE_PERMISE = new Set(["ViewContent", "AddToCart", "InitiateCheckout", "AddPaymentInfo", "Search"]);

export interface CerereEvenimentTikTok {
  magazin: string;
  event: string;
  event_id: string;
  url: string;
  referrer?: string;
  properties: Record<string, unknown>;
}

export type Refuz = { refuz: string };

const sir = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const numar = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e9 ? Math.round(v * 100) / 100 : undefined);

/** Corpul cererii, citit fara sa presupunem forma. */
export function citesteCerereaTikTok(corp: unknown): CerereEvenimentTikTok | Refuz {
  const c = (corp && typeof corp === "object" ? corp : {}) as Record<string, unknown>;
  const magazin = typeof c.magazin === "string" && /^[a-z0-9-]{1,100}$/i.test(c.magazin) ? c.magazin : null;
  if (!magazin) return { refuz: "magazin" };
  if (typeof c.event !== "string" || !EVENIMENTE_PERMISE.has(c.event)) return { refuz: "eveniment" };
  if (typeof c.event_id !== "string" || !/^[\w-]{8,100}$/.test(c.event_id)) return { refuz: "event_id" };
  if (typeof c.url !== "string" || c.url.length > 2000) return { refuz: "adresa" };
  return {
    magazin, event: c.event, event_id: c.event_id, url: c.url,
    ...(typeof c.referrer === "string" && c.referrer.length <= 2000 ? { referrer: c.referrer } : {}),
    properties: (c.properties && typeof c.properties === "object" && !Array.isArray(c.properties) ? c.properties : {}) as Record<string, unknown>,
  };
}

/** Doar campurile din „properties parameters”, cu tipurile lor. Restul se arunca. */
export function curataProprietatile(d: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const value = numar(d.value);
  if (value !== undefined) out.value = value;
  if (d.currency === "RON") out.currency = "RON";
  if (d.content_type === "product" || d.content_type === "product_group") out.content_type = d.content_type;
  if (Array.isArray(d.content_ids)) {
    const ids = d.content_ids.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 100).slice(0, 50);
    if (ids.length) out.content_ids = ids;
  }
  if (Array.isArray(d.contents)) {
    const contents = d.contents.flatMap((x) => {
      const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      if (typeof o.content_id !== "string" || !o.content_id || o.content_id.length > 100) return [];
      const q = typeof o.quantity === "number" && Number.isInteger(o.quantity) && o.quantity > 0 && o.quantity < 10_000 ? o.quantity : 1;
      const pret = numar(o.price);
      const nume = sir(o.content_name, 200);
      return [{ content_id: o.content_id, quantity: q, ...(pret !== undefined ? { price: pret } : {}), ...(nume ? { content_name: nume } : {}) }];
    }).slice(0, 50);
    if (contents.length) out.contents = contents;
  }
  if (typeof d.num_items === "number" && Number.isInteger(d.num_items) && d.num_items > 0 && d.num_items < 10_000) out.num_items = d.num_items;
  const cautare = sir(d.search_string, 200);
  if (cautare) out.search_string = cautare;
  const descriere = sir(d.description, 200);
  if (descriere) out.description = descriere;
  return out;
}

export function evenimentTikTokDinBrowser(
  cerere: CerereEvenimentTikTok,
  vizitator: { ip: string | null; userAgent: string | null; ttclid: string | undefined; ttp: string | undefined },
  acum: number = Date.now(),
): EvenimentTikTok | Refuz {
  const user: Record<string, unknown> = {};
  const ua = vizitator.userAgent?.trim();
  if (ua) user.user_agent = ua.slice(0, 500);
  if (vizitator.ip && isIP(vizitator.ip)) user.ip = vizitator.ip;
  const ttclid = ttclidValid(vizitator.ttclid);
  if (ttclid) user.ttclid = ttclid;
  const ttp = ttpValid(vizitator.ttp);
  if (ttp) user.ttp = ttp;
  /*
   * ⚠ Fara niciun semn despre om, evenimentul nu se poate lega de nimeni: „it is highly recommended to
   * include multiple types of matching data”. Unul singur (agentul) nu ajunge, deci nu se trimite.
   */
  if (!ttclid && !ttp && !user.ip) return { refuz: "fara-potrivire" };

  return {
    event: cerere.event,
    /* ⚠ Secunde, UTC. In milisecunde, evenimentele cad in viitor si nu se raporteaza. */
    event_time: Math.floor(acum / 1000),
    event_id: cerere.event_id,
    user,
    page: { url: cerere.url, ...(cerere.referrer ? { referrer: cerere.referrer } : {}) },
    properties: curataProprietatile(cerere.properties),
  };
}
