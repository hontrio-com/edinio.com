/*
  O comanda, asa cum o deseneaza listele panoului (Comenzi, si comanda din spatele unei cereri de
  retur): un rand din `orders` adus la o forma simpla, cu tot ce se citeste dintr-o privire. Cine
  e clientul, ce a cumparat, cum plateste, unde pleaca si cu cine, ce document are.

  ⚠ Modul PUR: nimic de aici nu citeste si nu scrie in baza. Il cheama paginile de pe server
  (care trimit in browser forma simpla, nu randul intreg de 264 de coloane) si probele.
*/

import { awburiDinRand, coloanelePortii, deCeNuSePoateAwbPropriu, type CurierPropriu } from "@/lib/orders/awb-propriu";
import { deriveOrigin, livrareaEDusaDeMarketplace, MARKETPLACE_ORIGINI, monedaComenzii } from "@/lib/orders/origin";
import { orderStatus } from "@/lib/orders/status";
import { areFacturaEmisa, COLOANE_FACTURA_EMISA } from "@/lib/billing/factura-pe-comanda";
import {
  CHEI_CASE_FACTURARE, cheiaCurierului, CURIERI, SIGLE_MARKETPLACE, siglaCurierului, type CasaFacturare,
} from "@/lib/integrari/parteneri";
import { siglaMica, type Sigla } from "@/lib/integrari/sigle";
import type { TonEticheta } from "@/components/ui/eticheta-stare";

/** Siglele canalelor de reclama din care a venit vizita, cand le avem. */
const SIGLE_CANAL: [RegExp, string][] = [
  [/google/i, "/integrations/google-ads.svg"],
  [/facebook|instagram/i, "/integrations/facebook-pixel.svg"],
  [/tiktok/i, "/integrations/tiktok-pixel.svg"],
];

export interface ProdusComanda {
  nume: string;
  cantitate: number;
  pret: number;
  poza: string | null;
}

/** Documentul unei comenzi: factura, stornarea ei sau proforma, la ce casa si cu ce numar. */
export interface DocumentComanda {
  fel: "factura" | "proforma" | "storno";
  casa: CasaFacturare;
  /** Seria si numarul; gol cat timp casa n-a intors inca numarul (casele care dau intai doar cheia). */
  numar: string;
}

/** Ce integrari are pornite magazinul: curierii si casele de facturare, cu siglele lor de panou. */
export interface Integrari {
  curieri: Sigla[];
  case_: Sigla[];
}

/** Fara nicio integrare: cand comanda se citeste doar pentru bani si document (lista de retururi). */
export const FARA_INTEGRARI: Integrari = { curieri: [], case_: [] };

export interface ComandaLista {
  id: string;
  numar: string;
  creataLa: string;
  client: { nume: string; firma: string | null; telefon: string | null; email: string | null };
  produse: ProdusComanda[];
  bucati: number;
  total: number;
  transport: number | null;
  /** „lei" sau codul monedei marketplace-ului. */
  moneda: string;
  plata: { eticheta: string; stare: "platita" | "neplatita" | "rambursata"; laLivrare: boolean };
  status: { cheie: string; eticheta: string; ton: TonEticheta };
  sursa: { eticheta: string; logo: string | null; marketplace: boolean };
  livrare: {
    /** Cum pleaca: la adresa, in punct, ridicare, cu curierul marketplace-ului. */
    fel: "adresa" | "punct" | "ridicare" | "proprie" | "marketplace" | "necunoscut";
    /** Unde: numele punctului sau localitatea. */
    detaliu: string | null;
    /** Curierul cu care se emite AWB-ul: cel ales de client, daca e conectat. */
    curier: Sigla | null;
    /** Adevarat cand curierul e chiar cel ales de client la comanda. */
    alesDeClient: boolean;
    /**
     * Ceilalti curieri conectati, pentru meniul „alt curier".
     * ⚠ De pe server pleaca GOALA si o umple browserul (`cuCeilaltiCurieri`): e aceeasi lista
     * la fiecare comanda, iar scrisa de 50 de ori intr-un magazin cu 18 curieri insemna 850 de
     * obiecte in plus in pagina.
     */
    altii: Sigla[];
    awb: { curier: Sigla; numar: string; stare: string | null } | null;
    /** De ce nu se poate emite AWB aici, sau `null` daca se poate. */
    refuz: string | null;
  };
  factura: {
    /** Casa la care se emite: prima pornita pe magazin. */
    casa: Sigla | null;
    document: DocumentComanda | null;
  };
}

type Rand = Record<string, unknown>;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const numar = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || !Number.isFinite(n) ? null : n;
};
const plin = (v: unknown): boolean => (typeof v === "string" ? v.trim() !== "" : v !== null && v !== undefined && v !== false);

/** Pune pe comanda ceilalti curieri conectati. Se cheama in browser, o data pe lista primita. */
export function cuCeilaltiCurieri(c: ComandaLista, curieri: Sigla[]): ComandaLista {
  return { ...c, livrare: { ...c.livrare, altii: curieri.filter((x) => x.cheie !== c.livrare.curier?.cheie) } };
}

/**
 * Cum s-a platit comanda, pe scurt: lista are loc de un cuvant, nu de numele intreg al metodei
 * („Card online (Netopia)" se citeste in pagina comenzii). La o comanda de marketplace metoda
 * e chiar marketplace-ul, deci se scrie cu numele lui.
 */
export function plataComenzii(r: Rand): ComandaLista["plata"] {
  const fel = text(r.payment_method) ?? "";
  const stareBruta = text(r.payment_status);
  const stare = stareBruta === "refunded" ? "rambursata" : stareBruta === "paid" ? "platita" : "neplatita";
  const eticheta =
    fel === "cash_on_delivery" ? "Ramburs"
      : fel === "bank_transfer" ? "Transfer bancar"
        : fel === "klarna" ? "Klarna"
          : fel === "tbi" ? "Rate tbi"
            : Object.hasOwn(MARKETPLACE_ORIGINI, fel) ? `Prin ${MARKETPLACE_ORIGINI[fel].label}`
              : "Card";
  return { eticheta, stare, laLivrare: fel === "cash_on_delivery" };
}

/** Casele care intorc la emitere doar cheia documentului; numarul se citeste dupa. */
const CASE_CU_CHEIE: ReadonlySet<CasaFacturare> = new Set(["facturis", "factureaza", "easybill"]);

const lipit = (serie: unknown, nr: unknown): string =>
  [text(serie), text(nr) ?? (typeof nr === "number" ? String(nr) : null)].filter(Boolean).join(" ");

/**
 * Documentul comenzii, in ordinea in care conteaza: o stornare (factura nu mai e in picioare),
 * apoi factura, apoi proforma. `null` cand nu s-a emis nimic.
 *
 * ⚠ „Are factura" e regula din `factura-pe-comanda.ts`, nu una scrisa aici: la casele cu cheie,
 * o factura cu cheie si fara numar EXISTA, iar documentul din sandbox-ul Factureaza.ro nu e
 * factura. Scrisa de mana pe coloana de numar, lista spunea „Nicio factură emisă" peste o
 * factura abia emisa.
 */
export function documentulComenzii(r: Rand): DocumentComanda | null {
  for (const casa of CHEI_CASE_FACTURARE) {
    if (plin(r[`${casa}_storno_number`]) || (CASE_CU_CHEIE.has(casa) && plin(r[`${casa}_storno_key`]))) {
      return { fel: "storno", casa, numar: lipit(r[`${casa}_storno_series`], r[`${casa}_storno_number`]) };
    }
  }
  for (const coloana of COLOANE_FACTURA_EMISA) {
    if (!areFacturaEmisa({ [coloana]: r[coloana] })) continue;
    const casa = coloana.slice(0, coloana.indexOf("_")) as CasaFacturare;
    return { fel: "factura", casa, numar: lipit(r[`${casa}_invoice_series`], r[`${casa}_invoice_number`]) };
  }
  if (plin(r.smartbill_estimate_number)) return { fel: "proforma", casa: "smartbill", numar: lipit(r.smartbill_estimate_series, r.smartbill_estimate_number) };
  if (plin(r.oblio_proforma_number)) return { fel: "proforma", casa: "oblio", numar: lipit(r.oblio_proforma_series, r.oblio_proforma_number) };
  return null;
}

/**
 * Coloanele din `orders` pe care le citeste `comandaDinRand`, si doar ele.
 *
 * ⚠ De ce nu `select("*")`: tabelul are 264 de coloane (una de AWB si cateva de stare pentru
 * fiecare curier, cate patru-sase pentru fiecare casa de facturare), iar o comanda intreaga
 * inseamna 8,7 KB de JSON, mai tot `"coloana": null`. Lista are nevoie de vreo 75 dintre ele:
 * sub 3 KB pe comanda (masurat pe magazinul de proba: 140 KB in loc de 434 KB la o pagina de 50).
 *
 * Lista se CONSTRUIESTE din aceleasi locuri din care citeste `comandaDinRand` (coloanele de AWB,
 * cele de stare ale curierilor, casele de facturare), ca un curier nou sa-si aduca singur
 * coloanele. ⚠ O coloana care nu exista in baza face PostgREST sa refuze toata cererea: cine
 * cheama lista asta reia cererea cu `*` daca prima cade.
 */
export function coloaneleComenzii(): string[] {
  const coloane = new Set<string>([
    "id", "order_number", "created_at", "status", "total", "shipping_cost", "customer_name", "customer_phone",
    "customer_email", "billing_company", "shipping_address", "items", "order_source", "payment_method", "payment_status",
    ...coloanelePortii(),
    ...COLOANE_FACTURA_EMISA,
  ]);
  for (const c of Object.values(CURIERI)) if (c.stare) coloane.add(c.stare);
  for (const casa of CHEI_CASE_FACTURARE) {
    for (const camp of ["invoice_number", "invoice_series", "storno_number", "storno_series"]) coloane.add(`${casa}_${camp}`);
    if (CASE_CU_CHEIE.has(casa)) coloane.add(`${casa}_storno_key`);
  }
  for (const c of ["smartbill_estimate_number", "smartbill_estimate_series", "oblio_proforma_number", "oblio_proforma_series"]) coloane.add(c);
  return [...coloane];
}

/** Aduce un rand din `orders` la forma pe care o deseneaza listele. */
export function comandaDinRand(
  r: Rand,
  pornite: Integrari,
  pozeProduse: Record<string, string>,
): ComandaLista {
  const adresa = (r.shipping_address ?? {}) as Rand;
  const stareBruta = String(r.status ?? "pending");
  const stare = orderStatus(stareBruta);
  const origine = deriveOrigin(r.order_source);
  const moneda = monedaComenzii(r.order_source);

  const produse: ProdusComanda[] = (Array.isArray(r.items) ? (r.items as Rand[]) : []).map((p) => ({
    nume: text(p.name) ?? "Produs",
    cantitate: numar(p.quantity) ?? 1,
    pret: numar(p.price) ?? 0,
    poza: pozeProduse[String(p.product_id ?? "")] ?? null,
  }));

  /* AWB-ul existent, la oricare curier. */
  const awburi = awburiDinRand(r);
  const cuAwb = (Object.entries(awburi) as [CurierPropriu, string | null][]).find(([, n]) => n);
  const siglaAwb = cuAwb ? siglaCurierului(cuAwb[0]) : null;
  const awb = cuAwb && siglaAwb
    ? {
      curier: siglaAwb,
      numar: String(cuAwb[1]),
      stare: CURIERI[cuAwb[0]].stare ? text(r[CURIERI[cuAwb[0]].stare as string]) : null,
    }
    : null;

  /* Curierul ales de client la comanda, daca e si conectat. */
  const ales = text(adresa.courier)?.toLowerCase() ?? null;
  const cheieAleasa = cheiaCurierului(ales);
  const alesConectat = cheieAleasa ? pornite.curieri.find((c) => c.cheie === cheieAleasa) ?? null : null;
  const curier = alesConectat ?? (pornite.curieri.length === 1 ? pornite.curieri[0] : null);

  const marketplaceDuce = livrareaEDusaDeMarketplace(r.order_source);
  const punct = text(adresa.locker_name);
  const fel: ComandaLista["livrare"]["fel"] =
    marketplaceDuce ? "marketplace"
      : ales === "pickup" ? "ridicare"
        : ales === "own" ? "proprie"
          : adresa.delivery_type === "locker" || punct ? "punct"
            : text(adresa.city) ? "adresa" : "necunoscut";
  const localitate = [text(adresa.city), text(adresa.county)].filter(Boolean).join(", ") || null;

  return {
    id: String(r.id),
    numar: String(r.order_number ?? ""),
    creataLa: String(r.created_at),
    client: {
      nume: text(r.customer_name) ?? "Client",
      firma: text((r.billing_company as Rand | null)?.company_name),
      telefon: text(r.customer_phone),
      email: text(r.customer_email),
    },
    produse,
    bucati: produse.reduce((s, p) => s + p.cantitate, 0),
    total: numar(r.total) ?? 0,
    transport: numar(r.shipping_cost),
    moneda: moneda && moneda !== "?" ? moneda : "lei",
    plata: plataComenzii(r),
    status: { cheie: stareBruta, eticheta: stare.nume, ton: stare.ton },
    sursa: {
      eticheta: origine.label,
      logo: origine.marketplace
        ? (SIGLE_MARKETPLACE[origine.marketplace] ? siglaMica(SIGLE_MARKETPLACE[origine.marketplace]) : null)
        : SIGLE_CANAL.find(([tipar]) => tipar.test(origine.label))?.[1] ?? null,
      marketplace: !!origine.marketplace,
    },
    livrare: {
      fel,
      detaliu: fel === "punct" ? punct ?? localitate : localitate,
      curier,
      alesDeClient: !!alesConectat,
      altii: [],
      awb,
      refuz: awb ? null : deCeNuSePoateAwbPropriu({
        order_source: r.order_source ?? null,
        payment_status: text(r.payment_status),
        status: text(r.status),
        awburi,
      }),
    },
    factura: { casa: pornite.case_[0] ?? null, document: documentulComenzii(r) },
  };
}
