import { isIP } from "node:net";
import { cookieMetaValid, type EvenimentCapi } from "./capi";
/* ⚠ Regula e comuna cu TikTok: un singur loc hotaraste daca pagina e a magazinului. */
import { adresaEAMagazinului } from "@/lib/pixeli/adresa-magazin";

export { adresaEAMagazinului };

/*
  ═══════════════════════════════════════════════════════════════════════════════
  UN EVENIMENT PRIMIT DIN BROWSER, VERIFICAT SI TRANSFORMAT IN EVENIMENT CONVERSIONS API
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CAPATUL E PUBLIC SI FARA SESIUNE. Oricine poate trimite un POST, la fel cum oricine poate chema `fbq`
  cu pixelul unui magazin din consola. Deci aici se primeste DOAR ce are voie sa ajunga in pixel:
    - numai evenimentele de palnie (`Purchase` NU: achizitia pleaca de pe server, din comanda);
    - numai campurile din referinta pixelului, cu tipurile si marimile lor;
    - `event_source_url` trebuie sa fie o pagina a ACESTUI magazin (domeniul propriu sau edinio.com/<slug>),
      altfel un magazin ar putea primi evenimente pretinse de pe alt site.
  Datele omului NU vin din corp: IP-ul, agentul si cookie-urile `_fbp`/`_fbc` se citesc din cerere, adica
  exact ce ar fi vazut si pixelul.
*/

export const EVENIMENTE_PERMISE = new Set(["ViewContent", "AddToCart", "InitiateCheckout", "AddPaymentInfo", "Search"]);

export interface CerereEveniment {
  magazin: string;
  event_name: string;
  event_id: string;
  event_source_url: string;
  custom_data: Record<string, unknown>;
}

export type Refuz = { refuz: string };

const sir = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const numar = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e9 ? Math.round(v * 100) / 100 : undefined);

/** Corpul cererii, citit fara sa presupunem forma. */
export function citesteCererea(corp: unknown): CerereEveniment | Refuz {
  const c = (corp && typeof corp === "object" ? corp : {}) as Record<string, unknown>;
  const magazin = typeof c.magazin === "string" && /^[a-z0-9-]{1,100}$/i.test(c.magazin) ? c.magazin : null;
  if (!magazin) return { refuz: "magazin" };
  if (typeof c.event_name !== "string" || !EVENIMENTE_PERMISE.has(c.event_name)) return { refuz: "eveniment" };
  if (typeof c.event_id !== "string" || !/^[\w-]{8,100}$/.test(c.event_id)) return { refuz: "event_id" };
  if (typeof c.event_source_url !== "string" || c.event_source_url.length > 2000) return { refuz: "adresa" };
  return {
    magazin, event_name: c.event_name, event_id: c.event_id, event_source_url: c.event_source_url,
    custom_data: (c.custom_data && typeof c.custom_data === "object" && !Array.isArray(c.custom_data) ? c.custom_data : {}) as Record<string, unknown>,
  };
}

/** Doar campurile din referinta pixelului, cu tipurile lor. Restul se arunca. */
export function curataDateleEvenimentului(d: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const value = numar(d.value);
  if (value !== undefined) out.value = value;
  if (d.currency === "RON") out.currency = "RON";
  const nume = sir(d.content_name, 200);
  if (nume) out.content_name = nume;
  if (d.content_type === "product" || d.content_type === "product_group") out.content_type = d.content_type;
  if (Array.isArray(d.content_ids)) {
    const ids = d.content_ids.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 100).slice(0, 50);
    if (ids.length) out.content_ids = ids;
  }
  if (Array.isArray(d.contents)) {
    const contents = d.contents.flatMap((x) => {
      const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      if (typeof o.id !== "string" || !o.id || o.id.length > 100) return [];
      const q = typeof o.quantity === "number" && Number.isInteger(o.quantity) && o.quantity > 0 && o.quantity < 10_000 ? o.quantity : 1;
      const p = numar(o.item_price);
      return [{ id: o.id, quantity: q, ...(p !== undefined ? { item_price: p } : {}) }];
    }).slice(0, 50);
    if (contents.length) out.contents = contents;
  }
  if (typeof d.num_items === "number" && Number.isInteger(d.num_items) && d.num_items > 0 && d.num_items < 10_000) out.num_items = d.num_items;
  const cautare = sir(d.search_string, 200);
  if (cautare) out.search_string = cautare;
  return out;
}


export function evenimentDinBrowser(
  cerere: CerereEveniment,
  vizitator: { ip: string | null; userAgent: string | null; fbp: string | undefined; fbc: string | undefined },
  acum: number = Date.now(),
): EvenimentCapi | Refuz {
  /* „The `client_user_agent` is required for website events shared using the Conversions API.” */
  const ua = vizitator.userAgent?.trim();
  if (!ua) return { refuz: "user-agent" };
  const user_data: Record<string, unknown> = { client_user_agent: ua.slice(0, 500) };
  if (vizitator.ip && isIP(vizitator.ip)) user_data.client_ip_address = vizitator.ip;
  const fbp = cookieMetaValid(vizitator.fbp);
  if (fbp) user_data.fbp = fbp;
  const fbc = cookieMetaValid(vizitator.fbc);
  if (fbc) user_data.fbc = fbc;
  return {
    event_name: cerere.event_name,
    event_time: Math.floor(acum / 1000),
    event_id: cerere.event_id,
    action_source: "website",
    event_source_url: cerere.event_source_url,
    user_data,
    custom_data: curataDateleEvenimentului(cerere.custom_data),
  };
}
