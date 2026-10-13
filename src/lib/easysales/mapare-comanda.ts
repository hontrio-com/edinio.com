import { invoiceVat, type RegimTva } from "@/lib/billing/invoice-vat";
import { planulCotelor } from "@/lib/billing/cote-pe-linii";
import { reconciliazaComanda, type LinieDocument, type Reconciliere } from "@/lib/billing/reconcile";
import { readBillingCompany } from "@/lib/billing/company";
import { detaliileDeLaCheckout } from "@/lib/cont/detalii-checkout";
import { randurileInstantaneului } from "@/lib/customization/comanda";
import { liniaAdresei, type AdresaLivrare } from "@/lib/orders/adresa";
import { esteIdExtra } from "@/lib/orders/extras";
import { codAutoAlJudetului } from "@/lib/ro/judete";
import { normalizePhone } from "@/lib/utils/phone";
import { rotunjeste } from "./numere";

/**
 * O comanda din vitrina, adusa la corpul lui `POST /api/v2/orders/save` [A: Save Order].
 *
 * Pura: nu citeste baza si nu cheama reteaua. Primeste comanda, regimul de TVA al magazinului si
 * articolul la ei al fiecarei linii (aflat de `identitate.ts`), si intoarce corpul sau refuzul.
 *
 * ═══ BANII (planul, §5.1.4) ═══
 *
 *   - regimul se ia cu `invoiceVat`, de pe COMANDA, niciodata din setarea de azi: 247 de comenzi au
 *     `prices_include_vat` NULL, iar 137 din 146 de magazine au `vat_enabled = false` cu 19 ramas;
 *   - cota liniei vine din `planulCotelor(...).cotaLiniei`, care pune 0 pe toate liniile la un
 *     neplatitor;
 *   - o comanda cu cote AMESTECATE nu pleaca: transportul lor e un singur obiect [A];
 *   - `price` si `total` pe linie sunt NETE [A: „The price without VAT", „tax excluded"], cu sase
 *     zecimale, ca in exemplul Save (`230.578512`): netul se socoteste din pretul nerotunjit al
 *     liniei, deci brutul se reface la ei fara sa se piarda un ban;
 *   - `offer_discount_amount` NU devine voucher: e deja scazut din pretul liniilor;
 *   - taxa de ramburs si extraoptiunile merg in `fees[]`, reducerile in `vouchers[]` (negative).
 *
 * ═══ ⚠ GARDA SUMELOR E A FACTURILOR, NU UNA NOUA ═══
 *
 * `reconciliazaComanda`, cu care se apara deja SmartBill, Oblio si fGO, pe liniile NETE pe care le
 * trimitem: un refuz inseamna ca liniile, transportul, taxele si reducerile nu dau `orders.total`,
 * deci comanda nu pleaca (`respinsa_local`). O „ajustare" e rotunjirea pe care garda o modeleaza
 * pe doi bani; noi trimitem sase zecimale, deci nu se adauga nicio linie de ajustare.
 *
 * ═══ ⚠ CE E IPOTEZA (M-COM-2, M-COM-4) ═══
 *
 * `order_total`: documentatia il defineste „products values + shipment tax" [A], fara taxe si
 * reduceri; `orders.total` le are. Pana la masuratoare se alege din setare (varianta `incasat`
 * implicit). Judetul pleaca drept cod ISO („B", „CL"), ca in exemplul Save; sectorul Bucurestiului
 * se pune in strada.
 */

/* ─── Intrarile ───────────────────────────────────────────────────────────── */

/** Coloanele comenzii de care are nevoie maparea. Citite intr-un singur loc (`comenzi.ts`). */
export const COLOANE_COMANDA =
  "id, business_id, order_number, created_at, status, payment_status, payment_method, customer_name, "
  + "customer_email, customer_phone, billing_company, items, shipping_address, shipping_cost, "
  + "discount_amount, discount_code, card_discount_amount, cod_discount_amount, cod_fee_amount, "
  + "vat_rate, vat_amount, prices_include_vat, total, notes, stoc_rezervat, order_source";

export interface ComandaPentruEasySales {
  id: string;
  order_number: string | number;
  created_at: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  billing_company: unknown;
  items: unknown;
  shipping_address: unknown;
  shipping_cost: unknown;
  discount_amount: unknown;
  discount_code: string | null;
  card_discount_amount: unknown;
  cod_discount_amount: unknown;
  cod_fee_amount: unknown;
  vat_rate: unknown;
  vat_amount: unknown;
  prices_include_vat: unknown;
  total: unknown;
  payment_method: string | null;
  notes: string | null;
}

export interface MagazinPentruEasySales {
  vat_enabled: boolean;
  vat_rate: unknown;
  prices_include_vat: boolean;
  /** Seria aleasa in setari; `""` lasa seria implicita a website-ului (IPOTEZA, ghid). */
  serieFacturi: string | null;
  /** Campurile de checkout, ca `notes` sa se citeasca cu etichetele magazinului. */
  campuriCheckout: ReadonlyArray<{ id: string; label: string }>;
  /** `definitie`: liniile brute + transportul [A]. `incasat`: `orders.total`. M-COM-2 alege. */
  variantaTotal: "definitie" | "incasat";
}

/** Articolul la ei al unei linii de marfa (`easysales_produse`). */
export interface ArticolLinie {
  /** `easysales_produse.id`, adica `product_website_id`. */
  productWebsiteId: number;
  sku: string;
  /** Produsul sau varianta n-au putut fi gasite: linia pleaca pe identitatea produsului. */
  nelegata: boolean;
}

/* ─── Iesirea ─────────────────────────────────────────────────────────────── */

export interface AdresaEasySales {
  name: string;
  phone: string;
  country: string;
  county: string;
  city: string;
  street: string;
  postal_code: string;
}

export interface SumaCuTva {
  name?: string;
  tax: number;
  price_with_tax?: number;
  price_without_tax?: number;
}

export interface ComandaSalvata {
  order_id: number;
  invoice_series: string;
  order_date: string;
  order_total: number;
  currency: "RON";
  status: 1;
  payment_mode: 1 | 2 | 3;
  observations: string;
  delivery_notes: string;
  total_vouchers: number;
  customer: {
    legal_entity: 0 | 1;
    name: string;
    company_name: string;
    phone: string;
    email?: string;
    vat_id: string | null;
    registration_number: string | null;
    vat_payer: 0 | 1 | null;
  };
  shipping_address: AdresaEasySales;
  billing_address: AdresaEasySales;
  order_products: {
    product_website_id: number;
    sku: string;
    name: string;
    quantity: number;
    price: number;
    total: number;
    tax: number;
  }[];
  shipment: SumaCuTva;
  fees: SumaCuTva[];
  vouchers: SumaCuTva[];
}

export type MotivRefuzMapare =
  | "fara_linii" | "cantitate_invalida" | "pret_invalid" | "cote_amestecate"
  | "linie_fara_articol" | "plata_necunoscuta" | "data_invalida" | "sume";

export type RezultatMapare =
  | { fel: "gata"; order: ComandaSalvata; garda: Reconciliere; regim: RegimTva; avertismente: string[] }
  | { fel: "refuz"; motiv: MotivRefuzMapare; mesaj: string; detalii?: Record<string, unknown> };

/* ─── Bucatile ────────────────────────────────────────────────────────────── */

/**
 * Metoda de plata la ei [A: 1 Online, 2 Cash on Delivery, 3 Bank Transfer].
 *
 * `ramburs` e aliasul din `cont_anuleaza_comanda`; `bank_transfer` exista numai in cod. Necunoscuta
 * da `null`, si comanda nu pleaca: ramburs ghicit pe o plata online ar pune curierul sa incaseze
 * a doua oara.
 */
export function modulDePlata(metoda: string | null | undefined): 1 | 2 | 3 | null {
  const m = (metoda ?? "").trim().toLowerCase();
  if (m === "cash_on_delivery" || m === "ramburs") return 2;
  if (m === "bank_transfer") return 3;
  if (m === "stripe" || m === "netopia" || m === "revolut" || m === "ipay" || m === "klarna") return 1;
  return null;
}

const ORA_BUCURESTI = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Bucharest",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

/**
 * `YYYY-mm-dd HH:ii:ss` [A], in ora Romaniei (IPOTEZA, M-COM-5). Prin `Intl`, fiindca `TZ` nu se
 * poate seta pe Vercel.
 */
export function dataLaEi(iso: string | null | undefined): string | null {
  const d = new Date(iso ?? "");
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(ORA_BUCURESTI.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** „Sector 3", „Sectorul 3", „Bucuresti Sector 3": numarul sectorului, sau `null`. */
function sectorul(...texte: unknown[]): string | null {
  for (const t of texte) {
    if (typeof t !== "string") continue;
    const m = /\bsector(?:ul)?\s*([1-6])\b/i.exec(t);
    if (m) return m[1];
  }
  return null;
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Adresa de livrare, cu judetul ca cod ISO [A: „County ISO Code"].
 *
 * ⚠ La Bucuresti orasul pleaca „Bucuresti", ca in toate exemplele lor, iar sectorul trece in
 * strada: noi il tinem cand in oras, cand in judet, in trei forme (memoria „Bucuresti: TREI forme").
 * Un judet care nu se potriveste pleaca asa cum e scris, cu avertisment: mai bine un nume pe care
 * ei il pot rezolva decat un cod ghicit.
 */
export function adresaDeLivrare(
  sa: unknown, nume: string, telefon: string, avertismente: string[],
): AdresaEasySales {
  const a = (sa && typeof sa === "object" ? sa : {}) as Record<string, unknown>;
  const taraBruta = text(a.country).toUpperCase();
  const country = /^[A-Z]{2}$/.test(taraBruta) ? taraBruta : "RO";
  const judetBrut = text(a.county);
  /* „Sectorul 6" in campul de judet nu e in sinonimele lui `potrivesteJudet` (are numai „Sector 6"). */
  const cod = codAutoAlJudetului(judetBrut) ?? (sectorul(judetBrut) ? "B" : null);
  let city = text(a.city);
  let street = liniaAdresei(a as AdresaLivrare);

  if (cod === "B") {
    const s = sectorul(city, judetBrut, street);
    city = "Bucuresti";
    if (s && !/\bsector/i.test(street)) street = street ? `${street}, Sector ${s}` : `Sector ${s}`;
  }
  if (!cod) avertismente.push(`judetul „${judetBrut.slice(0, 60)}” nu are cod ISO; pleaca scris ca atare`);

  return {
    name: nume,
    phone: telefon,
    country,
    county: cod ?? judetBrut,
    city,
    street,
    postal_code: text(a.postal_code).replace(/\s+/g, ""),
  };
}

/** Observatiile: campurile de checkout, personalizarile pe linie si liniile nelegate. */
export function observatiile(
  notes: string | null | undefined,
  campuri: ReadonlyArray<{ id: string; label: string }>,
  linii: { name: string; customization?: unknown }[],
  nelegate: string[],
): string {
  const randuri: string[] = [];
  for (const d of detaliileDeLaCheckout(notes, campuri)) randuri.push(`${d.eticheta}: ${d.valoare}`);
  for (const l of linii) {
    const pers = randurileInstantaneului(l.customization);
    if (pers.length === 0) continue;
    randuri.push(`${l.name}: ${pers.map((p) => (p.eticheta ? `${p.eticheta} = ${p.text}` : p.text)).join("; ")}`);
  }
  if (nelegate.length) randuri.push(`Linii nelegate de catalog (produs sters sau varianta negasita): ${nelegate.join("; ")}`);
  const tot = randuri.join("\n");
  /* Lungimea maxima nu e documentata: se taie la 2000, ca o comanda sa nu cada pe observatii. */
  return tot.length > 2000 ? `${tot.slice(0, 1997)}...` : tot;
}

interface LinieItem {
  product_id?: unknown;
  name?: unknown;
  price?: unknown;
  quantity?: unknown;
  customization?: unknown;
  vat_rate?: unknown;
}

function pozitiv(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* ─── Constructia ─────────────────────────────────────────────────────────── */

/**
 * Corpul `order` al lui Save, sau refuzul cu motivul lui.
 *
 * @param articole articolul fiecarei linii din `items`, pe ACELASI indice; `null` pe extraoptiuni.
 * @param esOrderId `easysales_comenzi.es_order_id`, inghetat inaintea primului apel.
 */
export function construiesteComanda(
  o: ComandaPentruEasySales,
  magazin: MagazinPentruEasySales,
  articole: ReadonlyArray<ArticolLinie | null>,
  esOrderId: number,
): RezultatMapare {
  const avertismente: string[] = [];
  const items = (Array.isArray(o.items) ? o.items : []) as LinieItem[];

  const plata = modulDePlata(o.payment_method);
  if (plata === null) {
    return { fel: "refuz", motiv: "plata_necunoscuta", mesaj: `metoda de plata „${String(o.payment_method).slice(0, 40)}” nu are pereche la easySales` };
  }
  const data = dataLaEi(o.created_at);
  if (!data) return { fel: "refuz", motiv: "data_invalida", mesaj: "data comenzii nu se poate citi" };

  const regim = invoiceVat(o, {
    vat_enabled: magazin.vat_enabled, vat_rate: magazin.vat_rate, prices_include_vat: magazin.prices_include_vat,
  });
  const plan = planulCotelor(items, regim.rate);
  if (plan.amestecate) {
    return {
      fel: "refuz", motiv: "cote_amestecate",
      mesaj: `comanda are cote de TVA diferite (${plan.grupe.map((g) => `${g.cota}%`).join(", ")}); transportul easySales are o singura cota`,
    };
  }
  /* O singura grupa (sau niciuna, la neplatitor): cota ei e cota tuturor sumelor fara cota proprie. */
  const cota = plan.grupe[0]?.cota ?? regim.rate;
  const brut = regim.taxIncluded;
  const laNet = (x: number) => (brut && cota > 0 ? x / (1 + cota / 100) : x);
  const suma = (x: number): Pick<SumaCuTva, "price_with_tax" | "price_without_tax"> =>
    (brut ? { price_with_tax: rotunjeste(x, 2) } : { price_without_tax: rotunjeste(x, 2) });

  const garda: LinieDocument[] = [];
  const produse: ComandaSalvata["order_products"] = [];
  const fees: SumaCuTva[] = [];
  const nelegate: string[] = [];
  let bruteProduse = 0;

  for (let i = 0; i < items.length; i++) {
    const l = items[i];
    const nume = text(l.name) || "Produs";
    const cantitate = Number(l.quantity);
    const pret = Number(l.price);
    if (!Number.isInteger(cantitate) || cantitate <= 0) {
      return { fel: "refuz", motiv: "cantitate_invalida", mesaj: `linia „${nume.slice(0, 60)}” are cantitatea ${String(l.quantity)}` };
    }
    if (!Number.isFinite(pret) || pret < 0) {
      return { fel: "refuz", motiv: "pret_invalid", mesaj: `linia „${nume.slice(0, 60)}” are pretul ${String(l.price)}` };
    }
    const cotaLiniei = plan.cotaLiniei(l as { price?: unknown; quantity?: unknown; vat_rate?: unknown });

    if (esteIdExtra(l.product_id)) {
      fees.push({ name: cantitate > 1 ? `${nume} x${cantitate}` : nume, tax: cotaLiniei, ...suma(pret * cantitate) });
      garda.push({ cantitate: 1, pretUnitar: laNet(pret * cantitate) });
      continue;
    }

    const art = articole[i];
    if (!art) {
      return { fel: "refuz", motiv: "linie_fara_articol", mesaj: `linia „${nume.slice(0, 60)}” n-are articol easySales` };
    }
    if (art.nelegata) nelegate.push(`${nume} (${art.sku})`);
    const netUnitar = laNet(pret);
    produse.push({
      product_website_id: art.productWebsiteId,
      sku: art.sku,
      name: nume,
      quantity: cantitate,
      price: rotunjeste(netUnitar, 6),
      total: rotunjeste(laNet(pret * cantitate), 6),
      tax: cotaLiniei,
    });
    garda.push({ cantitate, pretUnitar: netUnitar });
    bruteProduse += brut ? pret * cantitate : pret * cantitate * (1 + cotaLiniei / 100);
  }

  if (produse.length === 0) {
    return { fel: "refuz", motiv: "fara_linii", mesaj: "comanda n-are nicio linie de marfa" };
  }

  const transport = pozitiv(o.shipping_cost);
  const shipment: SumaCuTva = { tax: cota, ...suma(transport) };
  if (transport > 0) garda.push({ cantitate: 1, pretUnitar: laNet(transport) });

  const taxaRamburs = pozitiv(o.cod_fee_amount);
  if (taxaRamburs > 0) {
    fees.push({ name: "Taxă ramburs", tax: cota, ...suma(taxaRamburs) });
    garda.push({ cantitate: 1, pretUnitar: laNet(taxaRamburs) });
  }

  const vouchers: SumaCuTva[] = [];
  const reduceri: [string, number][] = [
    [o.discount_code ? `Cupon ${o.discount_code}` : "Reducere", pozitiv(o.discount_amount)],
    ["Reducere plată online", pozitiv(o.card_discount_amount)],
    ["Reducere plată ramburs", pozitiv(o.cod_discount_amount)],
  ];
  let reduceriBrute = 0;
  for (const [nume, valoare] of reduceri) {
    if (valoare <= 0) continue;
    vouchers.push({ name: nume, tax: cota, ...suma(-valoare) });
    garda.push({ cantitate: 1, pretUnitar: -laNet(valoare) });
    reduceriBrute += brut ? valoare : valoare * (1 + cota / 100);
  }

  /*
   * ⚠ Cotele sunt uniforme aici (cele amestecate s-au oprit mai sus), deci TVA-ul continut in total
   * se scoate pe o singura grupa. Se da totusi prin `tvaDinTotal`, ca garda sa nu atarne de
   * presupunerea ca `orders.vat_rate` e chiar cota liniilor.
   */
  const rec = reconciliazaComanda(garda, o, regim, {
    liniiNete: true,
    /* ⚠ Pe `regim.rate`, nu pe `cota`: garda converteste dupa cota DOCUMENTULUI, deci o comanda cu
       liniile pe 0% sub un document de 21% trebuie sa-i dea chiar TVA-ul continut, adica zero. */
    ...(brut && regim.rate > 0
      ? { tvaContinutInTotal: plan.tvaDinTotal({ transport, taxaRamburs, reduceri: reduceri.map(([, v]) => v) }) }
      : {}),
  });
  if (rec.fel === "refuz") {
    return {
      fel: "refuz", motiv: "sume",
      mesaj: `liniile trimise insumeaza ${rec.asteptat.toFixed(2)} in loc de ${rec.gasit.toFixed(2)} (totalul comenzii ${rec.total.toFixed(2)} lei)`,
      detalii: { asteptat: rec.asteptat, gasit: rec.gasit, delta: rec.delta, total: rec.total },
    };
  }

  const telefon = normalizePhone(o.customer_phone);
  const firma = readBillingCompany(o.billing_company);
  const numeClient = text(o.customer_name) || firma?.company_name || "";
  const livrare = adresaDeLivrare(o.shipping_address, numeClient, telefon, avertismente);
  /* Firma: adresa FISCALA din `billing_company` (cea de la ANAF), nu cea de livrare. */
  const facturare: AdresaEasySales = firma
    ? adresaDeLivrare({ county: firma.county, city: firma.city, address: firma.address }, firma.company_name, telefon, avertismente)
    : livrare;
  const email = text(o.customer_email);

  const sa = (o.shipping_address && typeof o.shipping_address === "object" ? o.shipping_address : {}) as Record<string, unknown>;
  const curier = text(sa.courier_label) || text(sa.courier);

  const orderTotal = magazin.variantaTotal === "definitie"
    ? rotunjeste(bruteProduse + (brut ? transport : transport * (1 + cota / 100)), 2)
    : rotunjeste(Number(o.total) || 0, 2);

  return {
    fel: "gata",
    regim,
    garda: rec,
    avertismente,
    order: {
      order_id: esOrderId,
      invoice_series: (magazin.serieFacturi ?? "").trim(),
      order_date: data,
      order_total: orderTotal,
      currency: "RON",
      status: 1,
      payment_mode: plata,
      observations: observatiile(o.notes, magazin.campuriCheckout, items.map((l) => ({ name: text(l.name), customization: l.customization })), nelegate),
      delivery_notes: curier ? `Curier ales de client: ${curier}` : "",
      total_vouchers: vouchers.length ? -rotunjeste(reduceriBrute, 2) : 0,
      customer: {
        legal_entity: firma ? 1 : 0,
        name: numeClient,
        company_name: firma?.company_name ?? "",
        phone: telefon,
        ...(email ? { email } : {}),
        vat_id: firma ? firma.cui : null,
        registration_number: firma?.reg_com || null,
        vat_payer: firma ? (firma.vat_payer ? 1 : 0) : null,
      },
      shipping_address: livrare,
      billing_address: facturare,
      order_products: produse,
      shipment,
      fees,
      vouchers,
    },
  };
}
