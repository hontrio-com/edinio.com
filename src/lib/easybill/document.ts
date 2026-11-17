/**
 * Factura easybill, compusa din comanda: clientul, antetul si liniile.
 *
 * Modul PUR: nu stie de baza, de retea sau de sesiune. Asa se poate proba pe valori, iar actiunile
 * (`easybill.actions.ts`, „use server”) doar aduc datele si trimit ce iese de aici.
 *
 * ═══ CUM SE EMITE LA EI, si de ce conteaza aici ═══
 *
 * easybill nu primeste factura dintr-o bucata. Se creeaza clientul (`addClient_fct`), apoi o factura
 * GOALA (`createInvoice_fct`), apoi liniile, CATE UNA (`addProductToInvoice_fct`). De aceea compunerea
 * da trei lucruri separate (clientul, antetul, liniile), iar fiecare linie isi poarta totalul
 * asteptat: clientul il compara cu ce a socotit easybill, linie cu linie, si se opreste la prima
 * care nu se potriveste, in loc sa umple o factura gresita pana la capat.
 *
 * ═══ CUM SE SCRIE O LINIE ═══
 *
 *   - la preturi CU TVA (aproape toate magazinele): pretul unitar cu TVA, taiat la doi bani, cu
 *     `productPriceIncludesVat=1`. Totalul liniei e chiar ce a platit clientul;
 *   - la preturi FARA TVA: pretul net, cu `productPriceIncludesVat=0`, iar TVA-ul il pune easybill.
 *
 * ⚠ `productPriceIncludesVat` e in tabelul lor de parametri, dar nu si in exemplul de cerere (iar
 * descrierea are o greseala de tipar: „1 = retur”). Daca l-ar ignora, linia ar iesi cu TVA-ul pus a
 * doua oara, si exact asta prinde verificarea pe linie din client, la PRIMA linie.
 *
 * ⚠ REDUCERILE SUNT LINII CU CANTITATE -1 SI PRET POZITIV, ca la Facturis: regula europeana BR-27
 * din e-Factura spune ca pretul net al unui articol NU poate fi negativ; cantitatea negativa e
 * permisa. Factura trebuie sa poata pleca in SPV.
 *
 * ⚠ Totalul se verifica INAINTE de emitere cu garda comuna (`reconcile.ts`): o comanda ale carei
 * linii nu dau `orders.total` nu se factureaza, iar diferenta de rotunjire legitima se absoarbe intr-o
 * linie de ajustare.
 */

import { invoiceParty } from "@/lib/billing/invoice-party";
import { invoiceVat, type MagazinTva, type RegimTva } from "@/lib/billing/invoice-vat";
import { planulCotelor } from "@/lib/billing/cote-pe-linii";
import { codSiNatura } from "@/lib/billing/invoice-lines";
import { mentiuneRefacturare, type SlotFacturare } from "@/lib/billing/refacturare";
import { mesajRefuz, pretDeDocument, reconciliazaComanda, type LinieDocument } from "@/lib/billing/reconcile";
import { liniaAdresei } from "@/lib/orders/adresa";
import { codAutoAlJudetului } from "@/lib/ro/judete";
import { normalizeCountyName, sectorBucuresti, stripDiacritics } from "@/lib/utils/ro-address";
import type { EasybillConfig } from "./config";

/* ═══════════════════════════════════════════════════════════════════════════
   DATELE, in ora Romaniei
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Bucatile unei clipe in ora Romaniei, oricare ar fi ceasul serverului (Vercel ruleaza in UTC).
 *
 * ⚠ Fara asta, o factura emisa la 01:30 noaptea, ora Romaniei, ar purta data de IERI: in UTC e inca
 * ziua precedenta. Iar data facturii e data fiscala a vanzarii.
 */
function bucati(d: Date): Record<"an" | "luna" | "zi", string> {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bucharest",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const v = (t: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === t)?.value ?? "00";
  return { an: v("year"), luna: v("month"), zi: v("day") };
}

/** `invoiceDate` si data incasarii: „YYYY-MM-DD”, ziua din Romania. */
export function dataFacturii(d: Date): string {
  const b = bucati(d);
  return `${b.an}-${b.luna}-${b.zi}`;
}

/** Ziua cu `n` zile inainte, in calendarul Romaniei (nu pe clipa UTC). */
function ziuaDinainte(acum: Date, n: number): string {
  const b = bucati(acum);
  const d = new Date(Date.UTC(Number(b.an), Number(b.luna) - 1, Number(b.zi) - n));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Cate zile cuprinde, cel mult, fereastra in care se cauta dupa marcaj o factura ramasa FARA id in
 * registru. Peste ea nu se cauta si nu se creeaza nimic: se refuza (vezi `emiteFactura`).
 */
export const ZILE_CAUTARE_ORFANA = 31;

/**
 * Zilele in care se cauta, dupa marcaj, o factura ramasa de la o incercare al carei proces a fost
 * TAIAT inainte de orice `catch` (deci fara id pe randul registrului): de la ziua primei incercari
 * MINUS o zi pana azi, in ora Romaniei, de la azi inapoi.
 *
 * ⚠ ZIUA IN MINUS: `creat_la` e o clipa UTC, iar factura poarta ziua din Romania; marja acopera orice
 * nepotrivire de zi.
 *
 * ⚠ `null` = fereastra ar trece de `ZILE_CAUTARE_ORFANA`, sau prima incercare nu are o data citibila.
 * Atunci NU se cauta pe bucati si NU se creeaza: o fereastra taiata a fost chiar defectul care emitea a
 * doua factura dupa o deblocare de luni, peste o incercare de vineri.
 */
export function zileDeCautat(acum: Date, dela: string | null | undefined): string[] | null {
  const inceput = dela ? new Date(dela) : null;
  if (!inceput || !Number.isFinite(inceput.getTime())) return null;
  const primaZi = Date.parse(`${ziuaDinainte(inceput, 1)}T00:00:00Z`);
  const azi = Date.parse(`${dataFacturii(acum)}T00:00:00Z`);
  const lungime = Math.round((azi - primaZi) / 86_400_000) + 1;
  if (lungime > ZILE_CAUTARE_ORFANA) return null;
  if (lungime < 1) return [dataFacturii(acum)];
  return Array.from({ length: lungime }, (_, n) => ziuaDinainte(acum, n));
}

/* ═══════════════════════════════════════════════════════════════════════════
   MARCAJUL documentului
   ═══════════════════════════════════════════════════════════════════════════ */

/** FNV-1a pe 32 de biti, cu baza data. Determinist si fara dependinte: modulul ramane pur. */
function fnv1a(s: string, baza: number): string {
  let h = baza >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Semnul dupa care se recunoaste in easybill factura unei incercari: „EDN-” si 12 caractere.
 *
 * ⚠ SE FACE DIN CHEIA REGISTRULUI, nu din numarul comenzii. Dupa o stornare, factura veche (care NU e
 * anulata) poarta acelasi numar de comanda in observatii; cheia reemiterii are insa sufixul `-R…`,
 * deci si alt marcaj, iar factura veche nu poate fi luata drept „factura ramasa” a reemiterii.
 * Si doua magazine legate de acelasi cont easybill pot avea aceleasi numere de comanda.
 *
 * Pleaca in `invoiceExternalId` si in observatiile facturii: lista lor de facturi le intoarce pe
 * cele din urma (`invoiceComments`), nu si pe primul.
 */
export function marcaj(cheieRegistru: string): string {
  const s = String(cheieRegistru ?? "");
  return `EDN-${(fnv1a(s, 0x811c9dc5) + fnv1a(s, 0x9e3779b9)).slice(0, 12).toUpperCase()}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CLIENTUL
   ═══════════════════════════════════════════════════════════════════════════ */

/** Textele: fara randuri noi si fara spatii in plus. Cele de dinauntru raman. */
function curat(s: string | null | undefined, max = 500): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Judetul, cum il cere easybill: codul ANAF („BV”, „AG”), iar Bucurestiul cu sectorul („B-SECTOR1”,
 * exact forma din exemplul lor si din `clientCountyCode` al listei de clienti).
 *
 * ⚠ SECTORUL NU SE GHICESTE. Fara el in oras, judet sau strada, pleaca „B”: un sector inventat ar
 * pune pe factura alta adresa decat a clientului.
 * Un judet necunoscut pleaca asa cum l-a scris omul: e mai bun decat un cod ghicit. Un judet LIPSA
 * intoarce sirul gol, iar `compuneFactura` refuza atunci factura (e-Factura il cere).
 */
export function codulJudetului(judet: string | null | undefined, oras?: string | null, strada?: string | null): string {
  /* „Judetul Iasi”: prefixul il scoate `normalizeCountyName`; „Jud. Cluj”, „Mun. Bucuresti”:
     prescurtarile le scoate `faraPrefixDeJudet`. Potrivirea comuna nu le stie pe niciunele. */
  const cod = codAutoAlJudetului(judet)
    ?? codAutoAlJudetului(normalizeCountyName(judet ?? ""))
    ?? codAutoAlJudetului(faraPrefixDeJudet(judet ?? ""))
    ?? (sectorBucuresti(oras) !== null || /bucuresti|bucharest/i.test(stripDiacritics(oras ?? "")) ? "B" : null);
  if (cod === "B") {
    const sector = sectorBucuresti(oras) ?? sectorBucuresti(judet) ?? sectorBucuresti(strada);
    return sector ? `B-SECTOR${sector}` : "B";
  }
  return cod ?? curat(judet, 100);
}

/** „Jud. Cluj”, „Judetul Iasi”, „Mun. Bucuresti” → numele, fara prefix (si fara diacritice). */
function faraPrefixDeJudet(s: string): string {
  return stripDiacritics(s).replace(/^\s*(jud(?:etul)?|mun(?:icipiul)?)\.?\s+/i, "").trim();
}

/** Codul tarii, cum il cere easybill: ISO cu doua litere. Lipsa = Romania. */
export function codulTarii(tara: string | null | undefined): string {
  const t = curat(tara, 60);
  if (!t) return "RO";
  return /^[A-Za-z]{2}$/.test(t) ? t.toUpperCase() : t;
}

export interface ClientDeFacturat {
  /** Campurile pentru `addClient_fct`, gata de trimis. */
  campuri: Record<string, string>;
  /**
   * CUI-ul dupa care se cauta un client EXISTENT, numai la firme. La persoane fizice nu se cauta:
   * dupa nume s-ar fi putut lua alt om, cu alta adresa, si pe factura ar fi iesit adresa lui.
   */
  cuiDeCautat: string | null;
}

/** CUI-ul fara „RO” si fara spatii, pentru comparatie. */
export function cuiCurat(v: string | null | undefined): string {
  return String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^RO/, "");
}

/* ═══════════════════════════════════════════════════════════════════════════
   LINIILE
   ═══════════════════════════════════════════════════════════════════════════ */

/** O linie, inainte de a fi scrisa in forma easybill. */
export interface LinieDeFacturat {
  nume: string;
  /** Poate fi negativa: reducerile. */
  cantitate: number;
  /** Pretul unitar POZITIV, in unitatea regimului: cu TVA daca sumele comenzii il contin. */
  pret: number;
  /** Cota, ca numar: 21, 11, 0. */
  cota: number;
  /** Codul de articol (SKU), cand exista. */
  cod?: string;
  /** Serviciu (transport, taxe, reduceri, extraoptiuni), nu marfa. */
  serviciu?: boolean;
}

/**
 * O linie gata de trimis, cu ce trebuie sa socoteasca easybill pentru ea, toate cu semn: valoarea
 * fara TVA, TVA-ul si totalul. Clientul le compara cu raspunsul lor la adaugare si cu liniile citite
 * de pe o factura ramasa.
 */
export interface LiniePlan {
  campuri: Record<string, string>;
  total: number;
  valoare: number;
  tva: number;
}

const rotunjit = (n: number) => Math.round(n * 100) / 100;
const doi = (n: number) => rotunjit(n).toFixed(2);

/** Cantitatea ca text: fara zerouri de prisos („2”, „-1”, „1.5”). */
function cantitateText(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/**
 * Unitatea de masura: codurile ANAF din lista lor („trebuie folosite la `addProductToInvoice_fct`”).
 * H87 = bucata, pentru marfa; C62 = unitate, pentru transport, taxe si reduceri.
 */
export const UM_MARFA = "H87";
export const UM_SERVICIU = "C62";

/**
 * Linia in forma easybill.
 *
 * ⚠ SE SOCOTESTE PE MARIMEA CANTITATII si semnul se pune la sfarsit: rotunjirea „jumatate in sus”
 * pe numere negative ar fi mutat un ban spre zero.
 */
export function linieEasybill(l: LinieDeFacturat, cuTva: boolean): LiniePlan {
  const semn = l.cantitate < 0 ? -1 : 1;
  const q = Math.abs(Number(l.cantitate) || 0);
  const r = (Number(l.cota) || 0) / 100;
  const p = pretDeDocument(Math.abs(Number(l.pret) || 0));

  /* TVA-ul CONTINUT se scoate cu `c / (100 + c)`; cel ADAUGAT se pune cu `c / 100`. */
  let total: number, valoare: number, tva: number;
  if (cuTva) {
    total = rotunjit(p * q);
    tva = rotunjit((total * r) / (1 + r));
    valoare = rotunjit(total - tva);
  } else {
    valoare = rotunjit(p * q);
    tva = rotunjit(valoare * r);
    total = rotunjit(valoare + tva);
  }

  const campuri: Record<string, string> = {
    productName: curat(l.nume) || "Produs",
    productPrice: doi(p),
    productCurrency: "RON",
    productType: l.serviciu ? "s" : "p",
    productUM: l.serviciu ? UM_SERVICIU : UM_MARFA,
    productQuantity: cantitateText(semn * q),
    productVAT: String(Number(l.cota) || 0),
    productPriceIncludesVat: cuTva ? "1" : "0",
    productIsReturned: "0",
    simpleProduct: "1",
    invoiceIdType: "id",
  };
  const cod = curat(l.cod ?? "", 100);
  /* easybill n-are camp de cod pe produsul simplu; observatia liniei e singurul loc in care
     comerciantul il regaseste pe factura. */
  if (cod) campuri.productComments = `Cod: ${cod}`;
  return { campuri, total: rotunjit(semn * total), valoare: rotunjit(semn * valoare), tva: rotunjit(semn * tva) };
}

/** Totalul cu TVA al liniilor, cum il va aduna documentul. */
export function totalulLiniilor(linii: LiniePlan[]): number {
  return rotunjit(linii.reduce((s, l) => s + (Number(l.total) || 0), 0));
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

export type FacturaCompusa = {
  client: ClientDeFacturat;
  /** Campurile pentru `createInvoice_fct`, fara `clientId` (vine din pasul clientului). */
  antet: Record<string, string>;
  linii: LiniePlan[];
  /** Totalul cu TVA pe care il va avea documentul, socotit din linii. */
  total: number;
  /** Semnul documentului in easybill (`marcaj`). */
  marcaj: string;
  regim: RegimTva;
};

/**
 * Factura unei comenzi, gata de trimis, sau motivul pentru care nu pleaca.
 */
export function compuneFactura(p: {
  comanda: ComandaDeFacturat;
  magazin: MagazinTva;
  /** `products.sku` dupa `product_id`. */
  skus: Map<string, string>;
  config: Pick<EasybillConfig, "serie" | "due_days">;
  slot: SlotFacturare;
  /** Eticheta metodei de plata, pentru observatiile de pe document. */
  etichetaPlata: string;
  /** Cheia registrului sub care pleaca emiterea: din ea se face marcajul documentului. */
  cheieRegistru: string;
  acum: Date;
}): FacturaCompusa | { error: string } {
  const { comanda, config, slot } = p;
  const vat = invoiceVat(comanda, p.magazin);
  const plan = planulCotelor(comanda.items, vat.rate);
  const items = (Array.isArray(comanda.items) ? comanda.items : []) as ItemComanda[];

  const linii: LinieDeFacturat[] = items.map((item) => {
    const { code, esteServiciu } = codSiNatura(item, p.skus);
    return {
      nume: item.name,
      cantitate: Number(item.quantity) || 0,
      pret: Number(item.price) || 0,
      cota: plan.cotaLiniei(item),
      serviciu: esteServiciu,
      ...(code ? { cod: code } : {}),
    };
  });

  /* Sumele fara cota proprie (transport, reduceri, taxa de ramburs) se impart pe grupele de cota,
     proportional cu marfa. La o singura cota, `peGrupe` intoarce suma intreaga. */
  const adauga = (nume: string, suma: unknown, semn: 1 | -1) => {
    const s = Number(suma) || 0;
    if (s <= 0) return;
    for (const [cota, valoare] of plan.peGrupe(s)) {
      linii.push({ nume: plan.numeCuCota(nume, cota), cantitate: semn, pret: valoare, cota, serviciu: true });
    }
  };
  adauga("Transport", comanda.shipping_cost, 1);
  adauga(`Discount${comanda.discount_code ? ` (${comanda.discount_code})` : ""}`, comanda.discount_amount, -1);
  /* Reducerea la plata online e deja scazuta din `orders.total` la plasare: fara linia ei, factura
     ar iesi mai mare decat suma platita. */
  adauga("Reducere plata online", comanda.card_discount_amount, -1);
  adauga("Reducere plata ramburs", comanda.cod_discount_amount, -1);
  adauga("Taxa plata ramburs", comanda.cod_fee_amount, 1);

  if (linii.length === 0) {
    return { error: `Comanda #${comanda.order_number ?? ""} nu are produse, deci n-are ce factura.` };
  }

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
      serviciu: true,
    });
  }

  const liniiApi = linii.map((l) => linieEasybill(l, vat.taxIncluded));

  /* ─── Clientul ─── */
  const adresa = (comanda.shipping_address ?? null) as {
    address?: string | null; street?: string | null; street_no?: string | null;
    city?: string | null; county?: string | null; country?: string | null;
  } | null;
  const linieAdresa = liniaAdresei(adresa) || null;
  const parte = invoiceParty(comanda, { ...adresa, address: linieAdresa });
  const tara = codulTarii(parte.country);
  const campuriClient: Record<string, string> = {
    clientName: curat(parte.name, 200),
    xType: parte.isCompany ? "LE" : "PF",
    clientAddressLine: curat(parte.address, 300) || "-",
    clientCity: curat(parte.city, 100) || "-",
    clientCounty: tara === "RO" ? codulJudetului(parte.county, parte.city, parte.address) : curat(parte.county, 100),
    clientCountry: tara,
    xPaymentTerms: String(Math.min(365, Math.max(0, Math.floor(Number(config.due_days) || 0)))),
    /* ⚠ Fara trimiteri automate catre client: easybill le-ar putea face la crearea facturii, adica
       inainte sa aiba liniile. Documentul il trimite comerciantul, cand vrea. */
    xSendInvoiceByEmail: "0",
    xSendInvoiceBySms: "0",
  };
  if (parte.isCompany) {
    campuriClient.clientCIF = curat(parte.vatCode, 40);
    if (parte.regCom) campuriClient.clientNrRegCom = curat(parte.regCom, 60);
    const contact = curat(comanda.customer_name, 200);
    if (contact) campuriClient.clientContactPerson = contact;
  }
  /* ⚠ La persoana fizica NU se trimite cod fiscal. „0000000000000” (cum cere ANAF cand CNP-ul nu se
     stie) ar fi acelasi la TOTI cumparatorii; daca easybill isi potriveste clientii dupa cod, a doua
     comanda ar fi primit clientul primei. Tipul `PF` ii spune lui easybill ce fel de client e. */
  const telefon = curat(comanda.customer_phone, 40);
  if (telefon) campuriClient.clientPhone = telefon;
  /* ⚠ Judetul lipsa nu pleaca gol, in tacere: e-Factura il cere la o adresa din Romania, iar SPV-ul ar
     respinge documentul dupa ce e deja emis. Se opreste aici, cand inca se poate corecta comanda. */
  if (tara === "RO" && !campuriClient.clientCounty) {
    return {
      error: `Comanda #${comanda.order_number ?? ""} n-are județul ${parte.isCompany ? "sediului firmei" : "clientului"}, iar e-Factura îl cere. Completează județul în comandă, apoi emite factura.`,
    };
  }
  const cui = parte.isCompany ? cuiCurat(parte.vatCode) : "";

  /* ─── Antetul ─── */
  const m = marcaj(p.cheieRegistru);
  const nr = comanda.order_number ?? "";
  const antet: Record<string, string> = {
    invoiceDate: dataFacturii(p.acum),
    /* 1 = finala: numarul il da easybill la creare, din seria aleasa. */
    invoiceStatus: "1",
    invoiceCurrency: "RON",
    invoiceExternalId: m,
    /* Leaga documentul de comanda, pe hartie. La reemiterea dupa storno e si singura urma a
       documentului desfiintat. Marcajul e cel dupa care se regaseste factura; sta INAINTEA
       mentiunii de refacturare, ca un camp de observatii taiat la ei sa nu-l piarda. */
    invoiceComments: mentiuneRefacturare(
      `Comanda #${nr}${p.etichetaPlata ? ` - plata: ${curat(p.etichetaPlata, 100)}` : ""} - ref. ${m}`,
      slot,
    ),
  };
  const serie = curat(config.serie, 40);
  if (serie) antet.invoiceSeries = serie;

  return {
    client: { campuri: campuriClient, cuiDeCautat: cui || null },
    antet,
    linii: liniiApi,
    total: totalulLiniilor(liniiApi),
    marcaj: m,
    regim: vat,
  };
}
