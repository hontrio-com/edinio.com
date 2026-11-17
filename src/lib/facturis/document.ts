/**
 * Documentele Facturis, compuse din comanda: factura si stornarea ei.
 *
 * Modul PUR: nu stie de baza, de retea sau de sesiune. Asa se poate proba pe valori, iar actiunile
 * (`facturis.actions.ts`, „use server") doar aduc datele si trimit ce iese de aici.
 *
 * ═══ CUM SE SCRIE O LINIE, si de ce asa ═══
 *
 * Facturis cere pretul unitar FARA TVA (`facturi_prod_pretftva`, obligatoriu) si primeste si restul:
 * pretul cu TVA, valoarea, TVA-ul si totalul liniei. Documentatia nu spune care castiga cand nu se
 * potrivesc, deci le trimitem pe TOATE, socotite din acelasi numar, ca sa nu aiba ce sa nu se
 * potriveasca:
 *
 *   - la preturi CU TVA (aproape toate magazinele), numarul de baza e pretul cu TVA al comenzii,
 *     taiat la doi bani: totalul liniei e chiar ce a platit clientul, iar baza si TVA-ul se scot
 *     din el. Pretul fara TVA pleaca cu patru zecimale, ca o refacere `pret x cantitate x cota`
 *     facuta de ei sa dea acelasi total;
 *   - la preturi FARA TVA, pe dos: baza e pretul net, TVA-ul se adauga pe linie.
 *
 * ⚠ REDUCERILE SUNT LINII CU CANTITATE -1 SI PRET POZITIV, nu cu pret negativ (cum face modulul
 * lor de WordPress). Regula europeana BR-27 din e-Factura spune ca pretul net al unui articol NU
 * poate fi negativ; o linie cu cantitate negativa e permisa. Factura trebuie sa poata pleca in SPV.
 *
 * ⚠ Totalul se verifica INAINTE de emitere cu garda comuna celor patru case (`reconcile.ts`): o
 * comanda ale carei linii nu dau `orders.total` nu se factureaza, iar diferenta de rotunjire
 * legitima se absoarbe intr-o linie de ajustare.
 */

import { invoiceParty } from "@/lib/billing/invoice-party";
import { invoiceVat, type MagazinTva, type RegimTva } from "@/lib/billing/invoice-vat";
import { planulCotelor } from "@/lib/billing/cote-pe-linii";
import { codSiNatura } from "@/lib/billing/invoice-lines";
import { mentiuneRefacturare, type SlotFacturare } from "@/lib/billing/refacturare";
import { mesajRefuz, pretDeDocument, reconciliazaComanda, type LinieDocument } from "@/lib/billing/reconcile";
import { liniaAdresei } from "@/lib/orders/adresa";
import type { FacturisConfig } from "./config";
import type { FacturaCitita } from "./client";

/* ═══════════════════════════════════════════════════════════════════════════
   DATELE, in ora Romaniei
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Bucatile unei clipe in ora Romaniei, oricare ar fi ceasul serverului (Vercel ruleaza in UTC).
 *
 * ⚠ Fara asta, o factura emisa la 01:30 noaptea, ora Romaniei, ar purta data de IERI: in UTC e
 * inca ziua precedenta. Iar data facturii e data fiscala a vanzarii.
 */
function bucati(d: Date): Record<"an" | "luna" | "zi" | "ora" | "minut" | "secunda", string> {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bucharest",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const v = (t: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === t)?.value ?? "00";
  return { an: v("year"), luna: v("month"), zi: v("day"), ora: v("hour"), minut: v("minute"), secunda: v("second") };
}

/** `facturi_data`: „YYYY-MM-DD HH:MM:SS". */
export function dataFacturii(d: Date): string {
  const b = bucati(d);
  return `${b.an}-${b.luna}-${b.zi} ${b.ora}:${b.minut}:${b.secunda}`;
}

/** `facturi_data_scadenta`: „YYYY-MM-DD". */
export function ziuaFacturii(d: Date): string {
  const b = bucati(d);
  return `${b.an}-${b.luna}-${b.zi}`;
}

/** `incasari_data`: „DD-MM-YYYY HH:MM:SS". ⚠ Alta ordine decat la facturi, asa le cere API-ul. */
export function dataIncasarii(d: Date): string {
  const b = bucati(d);
  return `${b.zi}-${b.luna}-${b.an} ${b.ora}:${b.minut}:${b.secunda}`;
}

/**
 * Scadenta: ziua emiterii plus `zile`, in calendarul Romaniei.
 *
 * ⚠ Se aduna pe ZIUA din Romania, nu pe clipa UTC: altfel, emisa la 01:30 ora noastra, scadenta
 * „peste 0 zile" ar fi iesit ziua de dinainte facturii.
 */
export function scadenta(acum: Date, zile: number): string {
  const n = Math.max(0, Math.floor(Number(zile) || 0));
  const b = bucati(acum);
  const d = new Date(Date.UTC(Number(b.an), Number(b.luna) - 1, Number(b.zi) + n));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   LINIILE
   ═══════════════════════════════════════════════════════════════════════════ */

/** O linie, inainte de a fi scrisa in forma Facturis. */
export interface LinieDeFacturat {
  nume: string;
  /** Poate fi negativa: reducerile si liniile de stornare. */
  cantitate: number;
  /** Pretul unitar POZITIV, in unitatea regimului: cu TVA daca sumele comenzii il contin. */
  pret: number;
  /** Cota, ca numar: 21, 11, 0. */
  cota: number;
  /** Codul de articol (SKU), cand exista. */
  cod?: string;
}

/** Linia asa cum pleaca la Facturis (`dataProd[]`). Valorile sunt text, ca in exemplele lor. */
export type LinieFacturisApi = Record<string, string>;

const doi = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const patru = (n: number) => (Math.round(n * 10_000) / 10_000).toFixed(4);
const trei = (n: number) => (Math.round(n * 1_000) / 1_000).toFixed(3);
const rotunjit = (n: number) => Math.round(n * 100) / 100;

/** Numele cotei, ca in Facturis: „21%", „11%", „0%". */
export function numeleCotei(cota: number): string {
  return `${Number(cota) || 0}%`;
}

/** Textele unei linii: fara randuri noi si fara spatii in plus. Cele de dinauntru raman. */
function curat(s: string): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Linia in forma Facturis.
 *
 * ⚠ SE SOCOTESTE PE MARIMEA CANTITATII si semnul se pune la sfarsit. Asa o linie si stornarea ei
 * dau exact aceleasi cifre cu semn schimbat: rotunjirea „jumatate in sus" pe numere negative ar fi
 * mutat un ban spre zero, iar nota de credit n-ar mai fi anulat factura pana la ban.
 */
export function linieFacturis(l: LinieDeFacturat, cuTva: boolean): LinieFacturisApi {
  const semn = l.cantitate < 0 ? -1 : 1;
  const q = Math.abs(Number(l.cantitate) || 0);
  const r = (Number(l.cota) || 0) / 100;
  const p = pretDeDocument(Math.abs(Number(l.pret) || 0));

  let pretFara: number, pretCu: number, valoare: number, tva: number, total: number;
  if (cuTva) {
    pretCu = p;
    pretFara = p / (1 + r);
    total = rotunjit(p * q);
    valoare = rotunjit(total / (1 + r));
    tva = rotunjit(total - valoare);
  } else {
    pretFara = p;
    pretCu = p * (1 + r);
    valoare = rotunjit(p * q);
    tva = rotunjit(valoare * r);
    total = rotunjit(valoare + tva);
  }

  const linie: LinieFacturisApi = {
    facturi_prod_nume: curat(l.nume),
    facturi_prod_moneda: "RON",
    facturi_prod_pretftva: patru(pretFara),
    facturi_prod_pretctva: patru(pretCu),
    facturi_prod_cant: trei(semn * q),
    facturi_prod_val: doi(semn * valoare),
    facturi_prod_val_tva: doi(semn * tva),
    facturi_prod_val_tot: doi(semn * total),
    facturi_prod_tva: numeleCotei(l.cota),
  };
  const cod = curat(l.cod ?? "");
  if (cod) {
    linie.prod_sku = cod;
    linie.prod_cod_cautare = "prod_sku";
  }
  return linie;
}

/** Totalul cu TVA al liniilor, cum il va aduna documentul. */
export function totalulLiniilor(linii: LinieFacturisApi[]): number {
  return rotunjit(linii.reduce((s, l) => s + (Number(l.facturi_prod_val_tot) || 0), 0));
}

/* ═══════════════════════════════════════════════════════════════════════════
   FACTURA COMENZII
   ═══════════════════════════════════════════════════════════════════════════ */

type ItemComanda = { name: string; price: number; quantity: number; product_id?: string | null };

export interface ComandaDeFacturat {
  order_number?: string | number | null;
  customer_name: string;
  customer_phone?: string | null;
  billing_company?: unknown;
  shipping_address?: unknown;
  items: unknown;
  shipping_cost?: unknown;
  discount_amount?: unknown;
  discount_code?: string | null;
  card_discount_amount?: unknown;
  cod_discount_amount?: unknown;
  cod_fee_amount?: unknown;
  total?: unknown;
  vat_rate?: unknown;
  vat_amount?: unknown;
  prices_include_vat?: unknown;
  payment_status?: string | null;
}

/**
 * Codul fiscal al unei persoane fizice fara CNP: treisprezece zerouri.
 *
 * Asa il cere ANAF in e-Factura pentru cumparatorul persoana fizica al carui CNP nu se stie, si
 * asa trimite si SmartBill de la noi. Lipsa lui ar cadea pe conturile Facturis care cer codul
 * fiscal obligatoriu (eroarea 1005, „camp necesar").
 */
export const CNP_NECUNOSCUT = "0000000000000";

/**
 * Numele tarii, cum il scrie Facturis: „Romania", fara diacritice (asa apare in exemplele si in
 * raspunsurile lor). Codul ISO-2 al comenzilor internationale devine numele romanesc, tot fara
 * diacritice, ca sa ramana in acelasi fel de scriere.
 */
export function numeleTarii(cod: string | null | undefined): string {
  const c = (cod ?? "").trim();
  if (!c || c.toUpperCase() === "RO") return "Romania";
  if (c.length !== 2) return c;
  try {
    const nume = new Intl.DisplayNames(["ro"], { type: "region" }).of(c.toUpperCase()) ?? c;
    return nume.normalize("NFD").replace(/[̀-ͯ]/g, "");
  } catch {
    return c;
  }
}

export type FacturaCompusa = {
  dataFact: Record<string, string>;
  dataProd: LinieFacturisApi[];
  /** Totalul cu TVA pe care il va avea documentul, socotit din linii. */
  total: number;
  regim: RegimTva;
};

/**
 * Factura unei comenzi, gata de trimis (`Facturi` / `Ins`), sau motivul pentru care nu pleaca.
 */
export function compuneFactura(p: {
  comanda: ComandaDeFacturat;
  magazin: MagazinTva;
  /** `products.sku` dupa `product_id`. */
  skus: Map<string, string>;
  config: Pick<FacturisConfig, "serie" | "due_days" | "gestiune" | "punct_de_lucru">;
  slot: SlotFacturare;
  /** Eticheta metodei de plata, pentru observatiile de pe document. */
  etichetaPlata: string;
  acum: Date;
}): FacturaCompusa | { error: string } {
  const { comanda, config, slot } = p;
  const vat = invoiceVat(comanda, p.magazin);
  const plan = planulCotelor(comanda.items, vat.rate);
  const items = (Array.isArray(comanda.items) ? comanda.items : []) as ItemComanda[];

  const linii: LinieDeFacturat[] = items.map((item) => {
    const { code } = codSiNatura(item, p.skus);
    return {
      nume: item.name,
      cantitate: Number(item.quantity) || 0,
      pret: Number(item.price) || 0,
      cota: plan.cotaLiniei(item),
      ...(code ? { cod: code } : {}),
    };
  });

  /* Sumele fara cota proprie (transport, reduceri, taxa de ramburs) se impart pe grupele de cota,
     proportional cu marfa. La o singura cota, `peGrupe` intoarce suma intreaga. */
  const adauga = (nume: string, suma: unknown, semn: 1 | -1) => {
    const s = Number(suma) || 0;
    if (s <= 0) return;
    for (const [cota, valoare] of plan.peGrupe(s)) {
      linii.push({ nume: plan.numeCuCota(nume, cota), cantitate: semn, pret: valoare, cota });
    }
  };
  adauga("Transport", comanda.shipping_cost, 1);
  adauga(`Discount${comanda.discount_code ? ` (${comanda.discount_code})` : ""}`, comanda.discount_amount, -1);
  /* Reducerea la plata online e deja scazuta din `orders.total` la plasare: fara linia ei, factura
     ar iesi mai mare decat suma platita. */
  adauga("Reducere plata online", comanda.card_discount_amount, -1);
  adauga("Reducere plata ramburs", comanda.cod_discount_amount, -1);
  adauga("Taxa plata ramburs", comanda.cod_fee_amount, 1);

  /* Garda comuna: liniile, in unitatea regimului, trebuie sa dea chiar `orders.total`. */
  const deVerificat: LinieDocument[] = linii.map((l) => ({ cantitate: l.cantitate, pretUnitar: l.pret }));
  const rec = reconciliazaComanda(deVerificat, comanda, vat);
  if (rec.fel === "refuz") {
    return { error: mesajRefuz(rec, comanda.order_number ?? "", comanda.payment_status === "paid") };
  }
  if (rec.fel === "ajustare") {
    /* Pe cota cu valoarea cea mai mare: ajustarea e de cativa bani, iar acolo mustra cel mai putin. */
    const cotaAjustarii = plan.grupe.reduce(
      (a, g) => (g.valoare > a.valoare ? g : a),
      plan.grupe[0] ?? { cota: vat.rate, valoare: 0 },
    ).cota;
    linii.push({
      nume: "Ajustare rotunjire",
      cantitate: rec.delta > 0 ? 1 : -1,
      pret: Math.abs(rec.delta),
      cota: cotaAjustarii,
    });
  }

  const dataProd = linii.map((l) => linieFacturis(l, vat.taxIncluded));

  const adresa = (comanda.shipping_address ?? null) as {
    address?: string | null; street?: string | null; street_no?: string | null;
    city?: string | null; county?: string | null; country?: string | null;
  } | null;
  const linieAdresa = liniaAdresei(adresa) || null;
  const parte = invoiceParty(comanda, { ...adresa, address: linieAdresa });

  const cotaDocumentului = plan.grupe.length
    ? plan.grupe.reduce((a, g) => (g.valoare > a.valoare ? g : a)).cota
    : vat.rate;

  const nr = comanda.order_number ?? "";
  const dataFact: Record<string, string> = {
    facturi_data: dataFacturii(p.acum),
    facturi_data_scadenta: scadenta(p.acum, Number(config.due_days) || 0),
    facturi_serie: config.serie.trim(),
    /* Gol: numarul il da Facturis, din seria aleasa. */
    facturi_numar: "",
    facturi_cota_tva: numeleCotei(cotaDocumentului),
    facturi_moneda: "RON",
    facturi_status: "Emisa",
    facturi_nume_client: curat(parte.name),
    facturi_tip_persoana: parte.isCompany ? "juridica" : "fizica",
    facturi_codf_client: parte.isCompany ? curat(parte.vatCode ?? "") : CNP_NECUNOSCUT,
    facturi_sediu_client: curat(parte.address ?? "") || "-",
    facturi_oras_client: curat(parte.city ?? "") || "-",
    facturi_judet_client: curat(parte.county ?? ""),
    facturi_tara_client: numeleTarii(parte.country),
    /* Leaga documentul de comanda, pe hartie. La reemiterea dupa storno e si singura urma a
       documentului desfiintat: randul comenzii pastreaza doar documentul viu. */
    facturi_obs_up: mentiuneRefacturare(
      `Comanda #${nr}${p.etichetaPlata ? ` - plata: ${p.etichetaPlata}` : ""}`,
      slot,
    ),
  };
  if (parte.isCompany && parte.regCom) dataFact.facturi_nrreg_client = curat(parte.regCom);
  const telefon = curat(comanda.customer_phone ?? "");
  if (telefon) dataFact.facturi_clienti_tel = telefon;
  if (linieAdresa) {
    dataFact.facturi_clienti_adresa_livrare = curat(linieAdresa);
    if (adresa?.city) dataFact.facturi_clienti_oras_livrare = curat(adresa.city);
    if (adresa?.county) dataFact.facturi_clienti_judet_livrare = curat(adresa.county);
  }
  const gestiune = curat(config.gestiune ?? "");
  if (gestiune) dataFact.facturi_gestiune = gestiune;
  const punct = curat(config.punct_de_lucru ?? "");
  if (punct) dataFact.facturi_punct_de_lucru = punct;

  return { dataFact, dataProd, total: totalulLiniilor(dataProd), regim: vat };
}

/* ═══════════════════════════════════════════════════════════════════════════
   STORNAREA
   ═══════════════════════════════════════════════════════════════════════════ */

const numarDinText = (s: string): number | null => {
  const t = (s ?? "").trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Ce cod de cautare poarta linia, ca stornarea sa gaseasca acelasi produs in nomenclatorul lor. */
function coduriLinie(l: FacturaCitita["linii"][number]): Record<string, string> {
  const out: Record<string, string> = {};
  if (l.codEan) out.prod_cod = l.codEan;
  if (l.codSku) out.prod_sku = l.codSku;
  if (l.codAlt) out.prod_cod1 = l.codAlt;
  const dupaCautare: Record<string, string> = { prod_cod: l.codEan, prod_sku: l.codSku, prod_cod1: l.codAlt };
  if (l.codCautare && dupaCautare[l.codCautare]) out.prod_cod_cautare = l.codCautare;
  else if (l.codSku) out.prod_cod_cautare = "prod_sku";
  else if (l.codEan) out.prod_cod_cautare = "prod_cod";
  else if (l.codAlt) out.prod_cod_cautare = "prod_cod1";
  return out;
}

/**
 * Stornarea unei facturi Facturis: o factura noua, cu liniile celei ORIGINALE si cantitatile cu
 * semn schimbat.
 *
 * ═══ ⚠ SE COPIAZA DIN FACTURA LOR, NU SE RECOMPUNE DIN COMANDA ═══
 *
 * Comanda se poate schimba dupa facturare (un telefon corectat, o adresa). Recompusa din ea,
 * stornarea ar fi anulat ALTCEVA decat documentul emis. Copiata din ce a citit Facturis, anuleaza
 * exact factura, pana la ban.
 *
 * Facturis n-are o actiune de stornare in API; ghidul easySales o descrie la fel: o factura
 * negativa, in aceeasi serie (sau in seria de stornari aleasa de comerciant).
 */
export function compuneStornarea(p: {
  original: FacturaCitita;
  serie: string;
  orderNumber: string | number | null | undefined;
  /** Numele de pe comanda, daca raspunsul lor n-ar purta clientul facturii. */
  numeClientRezerva: string;
  config: Pick<FacturisConfig, "gestiune" | "punct_de_lucru">;
  acum: Date;
}): { dataFact: Record<string, string>; dataProd: LinieFacturisApi[]; total: number } | { error: string } {
  const { original: o } = p;
  const numeClient = o.client.nume || curat(p.numeClientRezerva);
  if (!numeClient) {
    return { error: `Factura ${o.serie} ${o.numar} nu are clientul în răspunsul Facturis. Stornează-o din contul Facturis.` };
  }
  if (o.linii.length === 0) {
    return { error: `Factura ${o.serie} ${o.numar} nu are linii în răspunsul Facturis, deci n-avem ce stornare compune. Stornează-o din contul Facturis.` };
  }

  const dataProd: LinieFacturisApi[] = [];
  for (const l of o.linii) {
    const cantitate = numarDinText(l.cantitate);
    const valoare = numarDinText(l.valoare);
    const tva = numarDinText(l.valoareTva);
    const total = numarDinText(l.valoareTotala);
    const pretFara = numarDinText(l.pretFaraTva);
    if (cantitate === null || total === null || pretFara === null) {
      return { error: `Linia „${l.nume}” a facturii ${o.serie} ${o.numar} nu are cantitatea sau valorile citibile. Stornează factura din contul Facturis.` };
    }
    const pretCu = numarDinText(l.pretCuTva);
    dataProd.push({
      facturi_prod_nume: curat(l.nume),
      facturi_prod_moneda: l.moneda || o.moneda || "RON",
      facturi_prod_pretftva: patru(pretFara),
      ...(pretCu !== null ? { facturi_prod_pretctva: patru(pretCu) } : {}),
      facturi_prod_cant: trei(-cantitate),
      ...(valoare !== null ? { facturi_prod_val: doi(-valoare) } : {}),
      ...(tva !== null ? { facturi_prod_val_tva: doi(-tva) } : {}),
      facturi_prod_val_tot: doi(-total),
      ...(l.cota ? { facturi_prod_tva: l.cota } : {}),
      ...coduriLinie(l),
    });
  }

  const c = o.client;
  const dataFact: Record<string, string> = {
    facturi_data: dataFacturii(p.acum),
    facturi_data_scadenta: ziuaFacturii(p.acum),
    facturi_serie: p.serie.trim(),
    facturi_numar: "",
    facturi_moneda: o.moneda || "RON",
    facturi_status: "Emisa",
    facturi_nume_client: numeClient,
    facturi_obs_up: `Stornare factura ${[o.serie, o.numar].filter(Boolean).join(" ")}${o.data ? ` din ${o.data.split(" ")[0]}` : ""}${p.orderNumber ? ` (comanda #${p.orderNumber})` : ""}`,
  };
  if (o.cotaDocument) dataFact.facturi_cota_tva = o.cotaDocument;
  const copiaza: [string, string][] = [
    ["facturi_tip_persoana", c.tipPersoana],
    ["facturi_codf_client", c.codFiscal],
    ["facturi_nrreg_client", c.nrReg],
    ["facturi_sediu_client", c.sediu],
    ["facturi_judet_client", c.judet],
    ["facturi_oras_client", c.oras],
    ["facturi_tara_client", c.tara],
    ["facturi_cont_client", c.cont],
    ["facturi_banca_client", c.banca],
    ["facturi_clienti_tel", c.telefon],
    ["facturi_clienti_adresa_livrare", c.adresaLivrare],
  ];
  for (const [camp, v] of copiaza) if (v) dataFact[camp] = v;
  const gestiune = curat(p.config.gestiune ?? "");
  if (gestiune) dataFact.facturi_gestiune = gestiune;
  const punct = curat(p.config.punct_de_lucru ?? "");
  if (punct) dataFact.facturi_punct_de_lucru = punct;

  return { dataFact, dataProd, total: totalulLiniilor(dataProd) };
}
