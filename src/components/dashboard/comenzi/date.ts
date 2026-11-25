/*
  O comanda, asa cum o deseneaza listele panoului (Comenzi, si comanda din spatele unei cereri de
  retur): un rand din `orders` adus la o forma simpla, cu tot ce se citeste dintr-o privire. Cine
  e clientul, ce a cumparat, cum plateste, unde pleaca si cu cine, ce document are.

  ⚠ Modul PUR: nimic de aici nu citeste si nu scrie in baza. Il cheama paginile de pe server,
  lista din browser (care are randurile intregi, fiindca ferestrele de AWB le cer) si probele.
*/

import { awburiDinRand, COLOANA_AWB, coloanelePortii, deCeNuSePoateAwbPropriu, type CurierPropriu } from "@/lib/orders/awb-propriu";
import {
  deriveOrigin, livrareaEDusaDeMarketplace, MARKETPLACE_ORIGINI, marketplaceCareTineComanda, monedaComenzii, procesataInEasySales,
} from "@/lib/orders/origin";
import { ORDER_STATUS, orderStatus, type OrderStatus } from "@/lib/orders/status";
import { areFacturaEmisa, COLOANE_FACTURA_EMISA } from "@/lib/billing/factura-pe-comanda";
import { NUME_CURIER_EPACKET } from "@/lib/epacket/client";
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

/** AWB-ul unei comenzi, sau expedierea pornita care inca nu are numar. */
export interface AwbComanda {
  curier: Sigla;
  /** Numarul AWB-ului; gol cat timp expedierea e pornita, dar curierul n-a dat inca numarul. */
  numar: string;
  /** Ultima stare citita de la curier, cand exista una scrisa ca text. */
  stare: string | null;
  /** Expedierea e pornita, dar numarul inca nu exista (eColet emite pe rand). */
  inCurs: boolean;
  /** Cine duce de fapt coletul, cand curierul e un broker: „DPD 80512345" la Curiera, „Sameday" la e-packet. */
  partener: string | null;
}

export interface ComandaLista {
  id: string;
  numar: string;
  creataLa: string;
  client: { nume: string; firma: string | null; telefon: string | null; email: string | null };
  /**
   * Contul din care s-a plasat comanda (un client cu cont poate comanda pentru mai multe persoane).
   * ⚠ Il pune lista (`cuContul`): vine dintr-o citire separata, nu din randul comenzii.
   */
  cont: { id: string; nume: string; indiciu: string } | null;
  produse: ProdusComanda[];
  bucati: number;
  total: number;
  transport: number | null;
  /** „lei", codul monedei marketplace-ului, sau „?" cand moneda n-a putut fi citita. */
  moneda: string;
  /** Marketplace-ul a trimis o moneda pe care n-am inteles-o: rambursul si factura automata refuza comanda. */
  monedaNecitita: boolean;
  plata: { eticheta: string; stare: "platita" | "neplatita" | "rambursata"; laLivrare: boolean };
  status: { cheie: string; eticheta: string; ton: TonEticheta };
  sursa: {
    eticheta: string;
    logo: string | null;
    marketplace: boolean;
    /**
     * Marketplace-ul isi tine singur ciclul comenzii (eMAG, Trendyol): expedierea prin el se face
     * din pagina comenzii, unde sta panoul lui.
     */
    cuFluxPropriu: boolean;
    /** Comanda magazinului, procesata in easySales: factura si AWB-ul se fac acolo. */
    easySales: boolean;
  };
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
     * ⚠ Din `comandaDinRand` pleaca GOALA si o umple lista (`cuCeilaltiCurieri`): e aceeasi la
     * fiecare comanda, iar scrisa de 50 de ori intr-un magazin cu 18 curieri insemna 850 de
     * obiecte in plus.
     */
    altii: Sigla[];
    awb: AwbComanda | null;
    /** De ce nu se poate emite AWB aici, sau `null` daca se poate. */
    refuz: string | null;
  };
  factura: {
    /** Casa la care se emite: prima pornita pe magazin. */
    casa: Sigla | null;
    /** Celelalte case pornite, pentru meniul „altă casă". Goala din `comandaDinRand`, ca `altii`. */
    alteCase: Sigla[];
    document: DocumentComanda | null;
  };
}

/** Cele sapte stari, in ordinea drumului unei comenzi: pentru meniul din care se schimba starea. */
export const STARI_COMANDA: readonly { cheie: OrderStatus; eticheta: string; ton: TonEticheta }[] =
  (Object.keys(ORDER_STATUS) as OrderStatus[]).map((cheie) => ({ cheie, eticheta: ORDER_STATUS[cheie].nume, ton: ORDER_STATUS[cheie].ton }));

type Rand = Record<string, unknown>;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const numar = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || !Number.isFinite(n) ? null : n;
};
const plin = (v: unknown): boolean => (typeof v === "string" ? v.trim() !== "" : v !== null && v !== undefined && v !== false);

/* ── Ce pune lista peste comanda, in browser ──────────────────────────────── */

/** Pune pe comanda ceilalti curieri conectati si celelalte case de facturare. O data pe lista primita. */
export function cuCeilaltiCurieri(c: ComandaLista, pornite: Integrari): ComandaLista {
  return {
    ...c,
    livrare: { ...c.livrare, altii: pornite.curieri.filter((x) => x.cheie !== c.livrare.curier?.cheie) },
    factura: { ...c.factura, alteCase: pornite.case_.filter((x) => x.cheie !== c.factura.casa?.cheie) },
  };
}

/**
 * Pune pe comanda contul din care a fost plasata. Se arata NUMELE titularului (cerut de un
 * magazin, 23.11.2026: omul isi recunoaste clientii dupa nume); contul fara nume ramane cu
 * e-mailul, iar e-mailul si id-ul stau in indiciu.
 */
export function cuContul(c: ComandaLista, cont: { contId: string; nume: string | null; email: string | null } | undefined): ComandaLista {
  if (!cont) return c;
  return {
    ...c,
    cont: {
      id: cont.contId,
      nume: text(cont.nume) ?? text(cont.email) ?? "Cont client",
      indiciu: [cont.email, `ID cont: ${cont.contId}`].filter(Boolean).join(" · "),
    },
  };
}

/* ── Sursele din filtru ───────────────────────────────────────────────────── */

export interface SursaFiltru {
  /** „store" sau cheia marketplace-ului, exact ce se scrie in `?source=`. */
  cheie: string;
  eticheta: string;
  logo: string | null;
  numar: number;
}

/**
 * Sursele din filtru: doar cele care chiar au comenzi, ca un magazin care n-a vandut pe
 * Trendyol sa nu vada „Trendyol". „Magazinul tau" intra doar daca exista si un marketplace
 * de deosebit de el.
 */
export function surseleFiltrului(numarari: Record<string, number>): SursaFiltru[] {
  const prezente = Object.keys(MARKETPLACE_ORIGINI).filter((k) => (numarari[k] ?? 0) > 0);
  if (prezente.length === 0) return [];
  return [
    { cheie: "store", eticheta: "Magazinul tău", logo: null, numar: numarari.store ?? 0 },
    ...prezente.map((k) => ({
      cheie: k,
      eticheta: MARKETPLACE_ORIGINI[k].label,
      logo: SIGLE_MARKETPLACE[k] ? siglaMica(SIGLE_MARKETPLACE[k]) : null,
      numar: numarari[k] ?? 0,
    })),
  ];
}

/* ── Plata si documentul ──────────────────────────────────────────────────── */

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

/** Unde se deschide documentul unei comenzi: o adresa a casei, sau PDF-ul adus prin ruta noastra. */
export type LegaturaDocument =
  | { fel: "adresa"; adresa: string }
  | { fel: "pdf"; ruta: string; casa: string; tip: "invoice" | "storno" };

const NUME_CASA: Record<CasaFacturare, string> = {
  smartbill: "SmartBill", oblio: "Oblio", fgo: "fGO", facturis: "Facturis", factureaza: "Factureaza.ro", easybill: "easybill",
};

/** Coloana cu adresa documentului, la casele care dau una: dupa casa si dupa felul documentului. */
const COLOANA_ADRESEI: Partial<Record<CasaFacturare, Partial<Record<DocumentComanda["fel"], string>>>> = {
  smartbill: { factura: "smartbill_invoice_url", proforma: "smartbill_estimate_url" },
  oblio: { factura: "oblio_invoice_link", proforma: "oblio_proforma_link", storno: "oblio_storno_link" },
  fgo: { factura: "fgo_invoice_link" },
};

/**
 * De unde se deschide documentul comenzii, sau `null` cand lista n-are de unde (atunci se
 * deschide pagina comenzii). Casele cu cheie dau PDF-ul numai pe API, prin `/api/<casa>/pdf`.
 *
 * ⚠ Doar adrese `https://`: coloana vine de la casa de facturare, dar o valoare stricata n-are
 * ce cauta intr-un `window.open`.
 */
export function legaturaDocumentului(r: Rand, d: DocumentComanda): LegaturaDocument | null {
  if (CASE_CU_CHEIE.has(d.casa)) {
    if (d.fel === "proforma") return null;
    return { fel: "pdf", ruta: `/api/${d.casa}/pdf`, casa: NUME_CASA[d.casa], tip: d.fel === "storno" ? "storno" : "invoice" };
  }
  const coloana = COLOANA_ADRESEI[d.casa]?.[d.fel];
  const adresa = coloana ? text(r[coloana]) : null;
  return adresa && /^https:\/\//i.test(adresa) ? { fel: "adresa", adresa } : null;
}

/* ── Coloanele cerute bazei ───────────────────────────────────────────────── */

/** Coloanele din care se citeste cine duce de fapt coletul, la curierii care sunt brokeri. */
const COLOANE_PARTENER = ["curiera_partener", "curiera_partener_awb", "epacket_curier", "epacket_test"] as const;

/**
 * Coloanele din `orders` pe care le citeste `comandaDinRand`, si doar ele.
 *
 * ⚠ De ce nu `select("*")`: tabelul are 264 de coloane (una de AWB si cateva de stare pentru
 * fiecare curier, cate patru-sase pentru fiecare casa de facturare), iar o comanda intreaga
 * inseamna 8,7 KB de JSON, mai tot `"coloana": null`. Lista are nevoie de vreo 85 dintre ele.
 * Asa citeste pagina de Retururi comenzile din spatele cererilor; pagina de Comenzi aduce
 * randurile intregi, fiindca ferestrele de AWB le cer.
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
    ...COLOANE_PARTENER,
  ]);
  for (const c of Object.values(CURIERI)) if (c.stare) coloane.add(c.stare);
  for (const casa of CHEI_CASE_FACTURARE) {
    for (const camp of ["invoice_number", "invoice_series", "storno_number", "storno_series"]) coloane.add(`${casa}_${camp}`);
    if (CASE_CU_CHEIE.has(casa)) coloane.add(`${casa}_storno_key`);
  }
  for (const c of ["smartbill_estimate_number", "smartbill_estimate_series", "oblio_proforma_number", "oblio_proforma_series"]) coloane.add(c);
  for (const felurile of Object.values(COLOANA_ADRESEI)) for (const c of Object.values(felurile ?? {})) coloane.add(c);
  return [...coloane];
}

/* ── Randul din baza, adus la forma listei ────────────────────────────────── */

/** Cine duce de fapt coletul, cand curierul comenzii e un broker. */
function partenerulAwb(curier: CurierPropriu, r: Rand): string | null {
  if (curier === "curiera") {
    const awb = text(r.curiera_partener_awb);
    return awb ? `${text(r.curiera_partener) ?? "partener"} ${awb}` : null;
  }
  if (curier === "epacket") {
    const cod = text(r.epacket_curier);
    if (!cod) return null;
    const nume = Object.hasOwn(NUME_CURIER_EPACKET, cod) ? NUME_CURIER_EPACKET[cod as keyof typeof NUME_CURIER_EPACKET] : cod;
    return r.epacket_test === true ? `${nume}, test` : nume;
  }
  return null;
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

  /*
    Coletul viu al comenzii, la oricare curier. ⚠ `awburiDinRand` intoarce si MARTORUL unei
    expedieri pornite (la eColet, `ecolet_order_to_send_id`), nu doar numarul: numarul aratat
    omului se ia din coloana de AWB, iar cat ea e goala coletul e „in curs", fara numar.
  */
  const awburi = awburiDinRand(r);
  const cuAwb = (Object.entries(awburi) as [CurierPropriu, string | null][]).find(([, n]) => n);
  const siglaAwb = cuAwb ? siglaCurierului(cuAwb[0]) : null;
  const numarAwb = cuAwb ? text(r[COLOANA_AWB[cuAwb[0]]]) ?? (typeof r[COLOANA_AWB[cuAwb[0]]] === "number" ? String(r[COLOANA_AWB[cuAwb[0]]]) : null) : null;
  const awb: AwbComanda | null = cuAwb && siglaAwb
    ? {
      curier: siglaAwb,
      numar: numarAwb ?? "",
      stare: CURIERI[cuAwb[0]].stare ? text(r[CURIERI[cuAwb[0]].stare as string]) : null,
      inCurs: numarAwb === null,
      partener: partenerulAwb(cuAwb[0], r),
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
    cont: null,
    produse,
    bucati: produse.reduce((s, p) => s + p.cantitate, 0),
    total: numar(r.total) ?? 0,
    transport: numar(r.shipping_cost),
    moneda: moneda ?? "lei",
    monedaNecitita: moneda === "?",
    plata: plataComenzii(r),
    status: { cheie: stareBruta, eticheta: stare.nume, ton: stare.ton },
    sursa: {
      eticheta: origine.label,
      logo: origine.marketplace
        ? (SIGLE_MARKETPLACE[origine.marketplace] ? siglaMica(SIGLE_MARKETPLACE[origine.marketplace]) : null)
        : SIGLE_CANAL.find(([tipar]) => tipar.test(origine.label))?.[1] ?? null,
      marketplace: !!origine.marketplace,
      cuFluxPropriu: marketplaceCareTineComanda(r.order_source) !== null,
      easySales: procesataInEasySales(r.order_source),
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
    factura: { casa: pornite.case_[0] ?? null, alteCase: [], document: documentulComenzii(r) },
  };
}
