/**
 * Fisierul XML de import SAGA („Facturi"), compus din comanda cu regulile comune ale caselor de
 * facturare.
 *
 * Modul PUR: nu stie de baza, de retea sau de sesiune. Asa se poate proba pe valori, iar serverul
 * (`server.ts`) doar aduce datele si trimite ce iese de aici.
 *
 * ═══ FORMA, din documentatia lor (https://web.sagasoft.ro/DocumentatieAPI, citita 17.11.2026) ═══
 *
 *   <Facturi><Factura><Antet>…</Antet><Detalii><Continut><Linie>…</Linie></Continut></Detalii>
 *   <GUID_factura>…</GUID_factura></Factura></Facturi>
 *
 * Fisierul se cheama `F_<cod-fiscal>_<numar-factura>_<data-factura>.xml`. Cand `<FurnizorCIF>` e
 * codul firmei, SAGA pune factura la „Iesiri". Documentatia NU spune formatul datei si nici al
 * numerelor; vezi `dataSaga` si `docs/facturare/SAGA.md`, la „Ce asteapta dovada pe fir".
 *
 * ═══ LINIILE: ACELEASI CIFRE CA FACTURA EMISA ═══
 *
 * Factura a fost emisa de casa ei din aceeasi comanda, cu aceleasi reguli comune: cota pe linie
 * (`planulCotelor`), regimul inghetat (`invoiceVat`), transportul si reducerile impartite pe cote,
 * garda de total (`reconciliazaComanda`) cu linia de ajustare. Le folosim pe toate, in aceeasi
 * ordine, ca totalul si TVA-ul pe cote din SAGA sa fie ale documentului emis (`orders.total`).
 *
 * In SAGA o linie poarta pretul unitar FARA TVA, valoarea fara TVA si TVA-ul. La preturi cu TVA
 * (aproape toate magazinele), numarul de baza e totalul liniei, cat a platit clientul; valoarea si
 * TVA-ul se scot din el, ca suma lor sa dea fix totalul. Pretul net pleaca cu patru zecimale.
 *
 * ⚠ REDUCERILE SUNT LINII CU CANTITATE -1 SI PRET POZITIV, ca la Facturis (regula BR-27 din
 * e-Factura: pretul net al unui articol nu poate fi negativ; cantitatea poate).
 *
 * ⚠ STORNAREA E FACTURA CU SEMN SCHIMBAT: aceleasi linii, cantitatile, valorile si TVA-ul cu minus,
 * pretul tot pozitiv. Calculul se face pe MARIMI si semnul se pune la sfarsit, ca stornarea sa anuleze
 * factura pana la ban (rotunjirea pe numere negative ar fi mutat un ban spre zero).
 */

import { invoiceParty } from "@/lib/billing/invoice-party";
import { invoiceVat, type MagazinTva, type RegimTva } from "@/lib/billing/invoice-vat";
import { planulCotelor } from "@/lib/billing/cote-pe-linii";
import { codSiNatura } from "@/lib/billing/invoice-lines";
import { pretDeDocument, reconciliazaComanda, type LinieDocument } from "@/lib/billing/reconcile";
import { liniaAdresei } from "@/lib/orders/adresa";
import { codAutoAlJudetului } from "@/lib/ro/judete";
import { NUME_CASA, NUME_CLIENT_GENERIC, type CasaFacturare, type SagaConfig, type TipDocumentSaga } from "./config";

/* ═══════════════════════════════════════════════════════════════════════════
   TEXTE SI NUMERE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Textul unui camp: fara caracterele pe care XML 1.0 nu le primeste deloc, fara randuri noi si fara
 * spatii in plus.
 *
 * ⚠ CARACTERELE DE CONTROL NU SE ESCAPEAZA, SE SCOT. `&#1;` nu e permis nici scris ca entitate in
 * XML 1.0: un singur caracter de control lipit dintr-un tabel in numele unui produs ar fi facut tot
 * fisierul nevalid, iar SAGA l-ar fi refuzat intreg. La fel jumatatile de surogat ramase singure.
 */
export function curataText(v: unknown): string {
  const s = String(v ?? "").normalize("NFC");
  let iesire = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const urm = s.charCodeAt(i + 1);
      if (urm >= 0xdc00 && urm <= 0xdfff) { iesire += s[i] + s[i + 1]; i++; }
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) continue;
    if (c === 0xfffe || c === 0xffff) continue;
    if (c < 0x20) { iesire += " "; continue; }
    iesire += s[i];
  }
  return iesire.replace(/\s+/g, " ").trim();
}

/** Escaparea pentru continutul unui element. Toate cinci, ca sa nu conteze unde ajunge textul. */
export function escapeazaXml(v: unknown): string {
  return curataText(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const rotunjit = (n: number) => Math.round(n * 100) / 100;

/** Fara „-0.00": un zero cu minus ar arata in contabilitate ca o stornare a nimicului. */
function faraZeroNegativ(n: number): number {
  return Object.is(n, -0) || Math.abs(n) < 1e-9 ? 0 : n;
}

/** Sume: doua zecimale, punct zecimal. */
export function suma(n: number): string {
  return faraZeroNegativ(rotunjit(n)).toFixed(2);
}

/** Pretul unitar: patru zecimale. */
export function pretUnitar(n: number): string {
  return faraZeroNegativ(Math.round(n * 10_000) / 10_000).toFixed(4);
}

/** Cantitatea: pana la trei zecimale, fara zerourile de la coada („2", „1.5"). */
export function cantitate(n: number): string {
  const s = faraZeroNegativ(Math.round(n * 1000) / 1000).toFixed(3);
  return s.replace(/\.?0+$/, "") || "0";
}

/**
 * Data in forma pentru SAGA: „DD-MM-YYYY", din „YYYY-MM-DD".
 *
 * ⚠ FORMATUL NU E IN DOCUMENTATIA LOR. Capetele de citire cer strict „dd.MM.yyyy", dar despre XML
 * documentatia tace. Ales „DD-MM-YYYY" fiindca e formatul implicit al singurului integrator public
 * care trimite XML prin acest API (modulul Odoo `deltatech_saga`, „XML Date Format, default
 * %d-%m-%Y"). E un singur loc: daca prima trimitere reala il refuza, se schimba aici si in proba.
 */
export function dataSaga(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/**
 * Numele fisierului: `F_<cod-fiscal>_<numar-factura>_<data-factura>.xml`.
 *
 * ⚠ Raman doar litere, cifre si cratima. Un numar de document cu bara („EDN/2026/1") ar fi fost
 * citit drept cale, iar un spatiu sau un punct in plus ar fi putut muta extensia. Integratorul Odoo
 * scoate barele tocmai „ca SAGA sa accepte numele fisierului".
 */
export function numeleFisierului(codFiscal: string, numarDocument: string, dataIso: string): string {
  const curat = (s: string) => (s ?? "").replace(/[^A-Za-z0-9-]/g, "");
  return `F_${curat(codFiscal)}_${curat(numarDocument) || "0"}_${dataSaga(dataIso)}.xml`;
}

/**
 * Un identificator stabil, in forma unui GUID, din orice text.
 *
 * Folosit la `<GUID_factura>` si `<GUID_cod_client>`: SAGA salveaza asocierea cu codul lui intern
 * „pentru identificare ulterioara". Acelasi document trebuie sa dea mereu acelasi GUID (o retrimitere
 * dupa o pana trebuie sa fie recunoscuta), deci nu e aleator: patru FNV-1a pe 32 de biti, cu seminte
 * diferite. Nu e criptografic si nu trebuie sa fie; trebuie doar sa nu se ciocneasca intre documentele
 * unei firme. Forma 8-4-4-4-12, cu versiunea 5 si varianta RFC 4122, ca orice validare de GUID sa treaca.
 */
export function guidDin(text: string): string {
  const fnv = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  const hex = [0x811c9dc5, 0x2f6b0a1d, 0x9e3779b9, 0x5bd1e995].map(fnv).join("").split("");
  hex[12] = "5";
  hex[16] = "89ab"[parseInt(hex[16], 16) % 4];
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   DOCUMENTUL, in forma SAGA
   ═══════════════════════════════════════════════════════════════════════════ */

/** Firma comerciantului, cum pleaca in `<Furnizor…>`. */
export interface FirmaSaga {
  nume: string;
  /** Codul fiscal din configurare: acelasi cu antetul `X-Saga-Cod-Fiscal`. */
  codFiscal: string;
  regCom: string;
  localitate: string;
  /** Numele judetului; pleaca drept cod („CJ"). */
  judet: string;
  adresa: string;
}

export interface ClientSaga {
  nume: string;
  /** Codul fiscal la firme; gol la persoane fizice (CNP-ul nu se stie). */
  cif: string;
  regCom: string;
  /** Codul ISO al tarii („RO"). */
  tara: string;
  /** Codul judetului („AB"), doar pentru Romania. */
  judet: string;
  localitate: string;
  adresa: string;
  /** `<GUID_cod_client>`: la firme si la clientul generic; lipsa la persoanele fizice luate una cate una. */
  guid: string | null;
}

export interface LinieSaga {
  descriere: string;
  /** Cu semn: negativa la reduceri si la stornare. */
  cantitate: number;
  /** Pretul unitar FARA TVA, mereu pozitiv. */
  pret: number;
  /** Valoarea fara TVA, cu semn. */
  valoare: number;
  cota: number;
  /** TVA-ul liniei, cu semn. */
  tva: number;
  /** Codul articolului (SKU), cand exista. */
  cod: string | null;
  /** Linie de marfa: doar ea poarta gestiunea. Transportul, reducerile si ajustarea nu. */
  marfa: boolean;
}

export interface FacturaSaga {
  tip: TipDocumentSaga;
  /** `<FacturaNumar>`: seria lipita de numar. */
  numar: string;
  /** Ziua documentului, „YYYY-MM-DD", in ora Romaniei. */
  data: string;
  furnizor: FirmaSaga;
  client: ClientSaga;
  tvaLaIncasare: boolean;
  mentiuni: string;
  /** Codul gestiunii; gol = fara. */
  gestiune: string;
  linii: LinieSaga[];
  /** `<GUID_factura>`: acelasi pentru acelasi document, la orice retrimitere. */
  guid: string;
  /** Totalul cu TVA, cu semn: negativ la stornare. */
  total: number;
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPUNEREA DIN COMANDA
   ═══════════════════════════════════════════════════════════════════════════ */

type ItemComanda = { name?: unknown; price?: unknown; quantity?: unknown; product_id?: string | null; vat_rate?: unknown };

/** Randul comenzii, cat ii trebuie compunerii. */
export interface ComandaSaga {
  order_number?: string | number | null;
  customer_name: string;
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
  order_source?: unknown;
}

/** Documentul care pleaca: ce l-a identificat `documenteleComenzii`, plus data lui. */
export interface DocumentDeCompus {
  tip: TipDocumentSaga;
  casa: CasaFacturare;
  /** Seria lipita de numar. */
  numarComplet: string;
  /** „YYYY-MM-DD". */
  data: string;
}

/** O linie inainte de forma SAGA, in unitatea regimului (pret cu TVA daca sumele il contin). */
interface LinieDeCalcul {
  nume: string;
  cantitate: number;
  pret: number;
  cota: number;
  cod: string | null;
  marfa: boolean;
}

/**
 * Linia in forma SAGA. Pe MARIMEA cantitatii; semnul (al liniei si al stornarii) se pune la sfarsit.
 */
export function linieSaga(l: LinieDeCalcul, cuTva: boolean, semnDocument: 1 | -1): LinieSaga {
  const semn = (l.cantitate < 0 ? -1 : 1) * semnDocument;
  const q = Math.abs(Number(l.cantitate) || 0);
  const r = (Number(l.cota) || 0) / 100;
  const p = pretDeDocument(Math.abs(Number(l.pret) || 0));

  let pretNet: number, valoare: number, tva: number;
  if (cuTva) {
    const total = rotunjit(p * q);
    valoare = rotunjit(total / (1 + r));
    tva = rotunjit(total - valoare);
    pretNet = p / (1 + r);
  } else {
    valoare = rotunjit(p * q);
    tva = rotunjit(valoare * r);
    pretNet = p;
  }
  return {
    descriere: curataText(l.nume).slice(0, 250),
    cantitate: semn * q,
    pret: pretNet,
    valoare: semn * valoare,
    cota: Number(l.cota) || 0,
    tva: semn * tva,
    cod: l.cod ? curataText(l.cod) || null : null,
    marfa: l.marfa,
  };
}

/** Totalul cu TVA al liniilor, cu semn. */
export function totalulLiniilor(linii: LinieSaga[]): number {
  return rotunjit(linii.reduce((s, l) => s + l.valoare + l.tva, 0));
}

/** Moneda comenzii, cand nu e lei. `"necunoscuta"` cand n-a putut fi citita. */
function monedaStraina(orderSource: unknown): string | null {
  const src = (orderSource ?? null) as { currency?: unknown; moneda_necitita?: unknown } | null;
  if (src?.moneda_necitita === true) return "necunoscuta";
  const m = (typeof src?.currency === "string" ? src.currency : "").trim().toUpperCase();
  return m && m !== "RON" ? m : null;
}

export type FacturaCompusa = { factura: FacturaSaga; regim: RegimTva; avertismente: string[] };

const lei = (n: number) => `${suma(Math.abs(n)).replace(".", ",")} lei`;

/** Numele tarilor care pot sosi in locul codului (marketplace, adrese scrise de mana), fara diacritice. */
const TARI_DUPA_NUME: Record<string, string> = {
  romania: "RO", republicamoldova: "MD", moldova: "MD", bulgaria: "BG", ungaria: "HU", hungary: "HU",
  germania: "DE", germany: "DE", deutschland: "DE", austria: "AT", italia: "IT", italy: "IT", franta: "FR",
  france: "FR", spania: "ES", spain: "ES", polonia: "PL", poland: "PL", cehia: "CZ", czechia: "CZ",
  slovacia: "SK", slovakia: "SK", grecia: "GR", greece: "GR", olanda: "NL", netherlands: "NL", belgia: "BE",
  belgium: "BE", marebritanie: "GB", regatulunit: "GB", unitedkingdom: "GB",
};

/**
 * Codul ISO al tarii clientului, pentru `<ClientTara>`: „Romania" → „RO", „ro" → „RO". Gol = Romania
 * (asa scrie `invoiceParty` adresele din tara). `null` cand nu seamana cu nicio tara: un cod ghicit ar
 * fi mutat clientul in alta tara, iar tara schimba regimul de TVA al vanzarii.
 */
export function codulTarii(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "RO";
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  const cheie = s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^a-z]/g, "");
  return TARI_DUPA_NUME[cheie] ?? null;
}

/**
 * Documentul SAGA al unei comenzi, sau motivul pentru care nu se poate compune.
 *
 * Primeste din configurarea casei care a emis un singur lucru: daca a emis CU TVA (`tvaFurnizor`,
 * vezi `tvaPeCasa`). Restul vine din comanda si din regulile comune, asa ca aceeasi functie da aceleasi
 * cifre ca factura emisa, iar stornarea e exact factura cu minus.
 */
export function compuneDinComanda(p: {
  comanda: ComandaSaga;
  magazin: MagazinTva;
  /** `products.sku` dupa `product_id`. */
  skus: Map<string, string>;
  config: Pick<SagaConfig, "cod_fiscal" | "clienti_pf" | "nume_client_generic" | "tva_la_incasare" | "gestiune">;
  firma: FirmaSaga;
  document: DocumentDeCompus;
  /** La stornare: factura pe care o anuleaza, pentru mentiune. */
  facturaStornata?: { numarComplet: string; data: string | null } | null;
  /**
   * Casa care a emis documentul a emis CU TVA? SmartBill si Oblio emit FARA TVA cand numele cotei e gol
   * in configurarea lor; fara steagul lor, documentul din SAGA ar fi purtat un TVA pe care factura nu-l are.
   */
  tvaFurnizor?: boolean;
}): FacturaCompusa | { error: string } {
  const { comanda, document: doc } = p;
  const nr = comanda.order_number ?? "";

  /* ⚠ Casele emit de aici doar in lei; o comanda in alta moneda n-are document in lei de trimis. */
  const moneda = monedaStraina(comanda.order_source);
  if (moneda) {
    return {
      error: moneda === "necunoscuta"
        ? `Moneda comenzii #${nr} nu s-a putut citi, deci documentul nu pleacă în SAGA. Introdu-l din documentul emis.`
        : `Comanda #${nr} e în ${moneda}, iar exportul în SAGA trimite doar documente în lei. Introdu-l din documentul emis.`,
    };
  }
  if (!doc.numarComplet) return { error: "Documentul n-are număr, deci nu poate pleca în SAGA." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.data)) return { error: "Data documentului nu se cunoaște, deci nu poate pleca în SAGA." };

  const vat = invoiceVat(comanda, p.magazin, p.tvaFurnizor !== false);
  const plan = planulCotelor(comanda.items, vat.rate);
  const items = (Array.isArray(comanda.items) ? comanda.items : []) as ItemComanda[];

  const linii: LinieDeCalcul[] = items.map((item) => {
    const { code, esteServiciu } = codSiNatura(item, p.skus);
    return {
      nume: String(item.name ?? ""),
      cantitate: Number(item.quantity) || 0,
      pret: Number(item.price) || 0,
      cota: plan.cotaLiniei(item),
      cod: code ?? null,
      marfa: !esteServiciu,
    };
  });

  /* Sumele fara cota proprie se impart pe cote, proportional cu marfa (ca la toate casele). */
  const adauga = (nume: string, s: unknown, semn: 1 | -1) => {
    const v = Number(s) || 0;
    if (v <= 0) return;
    for (const [cota, valoare] of plan.peGrupe(v)) {
      linii.push({ nume: plan.numeCuCota(nume, cota), cantitate: semn, pret: valoare, cota, cod: null, marfa: false });
    }
  };
  adauga("Transport", comanda.shipping_cost, 1);
  adauga(`Discount${comanda.discount_code ? ` (${comanda.discount_code})` : ""}`, comanda.discount_amount, -1);
  adauga("Reducere plata online", comanda.card_discount_amount, -1);
  adauga("Reducere plata ramburs", comanda.cod_discount_amount, -1);
  adauga("Taxa plata ramburs", comanda.cod_fee_amount, 1);

  /* Garda comuna: liniile, in unitatea regimului, dau chiar `orders.total`. */
  const deVerificat: LinieDocument[] = linii.map((l) => ({ cantitate: l.cantitate, pretUnitar: l.pret }));
  const rec = reconciliazaComanda(deVerificat, comanda, vat);
  if (rec.fel === "refuz") {
    /*
     * ⚠ Mesaj PROPRIU, nu `mesajRefuz`: acela e al emiterii („nu se poate factura... emite factura") si
     * l-ar fi trimis pe om sa emita o factura care exista deja. Aici documentul e emis; doar nu se poate
     * reconstrui din comanda, deci se introduce in SAGA dupa documentul casei.
     */
    return {
      error: `Documentul comenzii #${nr} nu pleacă în SAGA: liniile reconstruite din comandă dau ${lei(rec.asteptat)}, nu ${lei(rec.gasit)} (totalul comenzii e ${lei(rec.total)}, diferența ${lei(rec.delta)}). Introdu-l în SAGA după documentul emis de casa de facturare.`,
    };
  }
  if (rec.fel === "ajustare") {
    const cotaAjustarii = plan.grupe.reduce(
      (a, g) => (g.valoare > a.valoare ? g : a),
      plan.grupe[0] ?? { cota: vat.rate, valoare: 0 },
    ).cota;
    linii.push({
      nume: "Ajustare rotunjire",
      cantitate: rec.delta > 0 ? 1 : -1,
      pret: Math.abs(rec.delta),
      cota: cotaAjustarii,
      cod: null,
      marfa: false,
    });
  }

  const semnDocument: 1 | -1 = doc.tip === "storno" ? -1 : 1;
  const liniiSaga = linii
    .filter((l) => l.cantitate !== 0)
    .map((l) => linieSaga(l, vat.taxIncluded, semnDocument));
  if (liniiSaga.length === 0) return { error: `Comanda #${nr} n-are nicio linie de trimis în SAGA.` };

  const total = totalulLiniilor(liniiSaga);
  /*
   * ⚠ LA PRETURI FARA TVA, TVA-UL SE ROTUNJESTE PE LINIE, iar comanda il are rotunjit o data, pe tot.
   * Garda de mai sus certifica baza neta; un ban ramas in TVA nu se poate corecta cu o linie neta
   * (aceeasi rezerva ca in `reconcile.ts`). Documentul pleaca, dar se spune.
   */
  const asteptat = rotunjit((Number(comanda.total) || 0) * semnDocument);
  const avertismente: string[] = [];
  if (Math.abs(total - asteptat) >= 0.01) {
    avertismente.push(`Totalul trimis în SAGA (${suma(total)} lei) diferă de totalul comenzii (${suma(asteptat)} lei) din rotunjirea TVA-ului pe linii. Verifică documentul în SAGA.`);
  }

  /* ── clientul ── */
  const adresa = (comanda.shipping_address ?? null) as {
    address?: string | null; street?: string | null; street_no?: string | null;
    city?: string | null; county?: string | null; country?: string | null;
  } | null;
  const parte = invoiceParty(comanda, { ...adresa, address: liniaAdresei(adresa) || null });
  const tara = codulTarii(parte.country);
  if (!tara) {
    return { error: `Țara clientului comenzii #${nr} („${curataText(parte.country)}”) nu e o țară recunoscută, deci documentul nu pleacă în SAGA. Corectează adresa comenzii sau introdu documentul în SAGA de mână.` };
  }
  const codFiscalFirma = p.firma.codFiscal;

  let client: ClientSaga;
  if (!parte.isCompany && p.config.clienti_pf === "generic") {
    /*
     * ⚠ Clientul generic nu poarta adresa nimanui: toate vanzarile catre persoane fizice intra pe
     * acelasi partener, iar o adresa ar fi a primului cumparator, lipita pe toti ceilalti.
     */
    client = {
      nume: curataText(p.config.nume_client_generic) || NUME_CLIENT_GENERIC,
      cif: "", regCom: "", tara: "RO", judet: "", localitate: "", adresa: "",
      guid: guidDin(`edinio-saga-client:${codFiscalFirma}:persoane-fizice`),
    };
  } else {
    client = {
      nume: curataText(parte.name),
      cif: parte.isCompany ? curataText(parte.vatCode ?? "") : "",
      regCom: parte.isCompany ? curataText(parte.regCom ?? "") : "",
      tara,
      /* „Se completeaza codul judetului, doar pentru tertii din Romania." */
      judet: tara === "RO" ? codAutoAlJudetului(parte.county) ?? "" : "",
      localitate: curataText(parte.city ?? ""),
      adresa: curataText(parte.address ?? ""),
      /* La firme, acelasi partener la fiecare comanda: GUID-ul vine din codul fiscal, nu din comanda. */
      guid: parte.isCompany && parte.vatCode
        ? guidDin(`edinio-saga-client:${codFiscalFirma}:${parte.vatCode.replace(/\s+/g, "").toUpperCase()}`)
        : null,
    };
  }
  if (!client.nume) return { error: `Comanda #${nr} n-are numele clientului, deci documentul nu poate pleca în SAGA.` };
  /* ⚠ Judetul lipsa nu pleaca TACUT: SAGA il cere pentru tertii din Romania, iar un client fara judet
     poate fi refuzat sau pus gresit. Documentul pleaca (e emis), dar omul afla de ce lipseste. */
  if (client.tara === "RO" && !client.judet && client.adresa) {
    const brut = curataText(parte.county ?? "");
    avertismente.push(brut
      ? `Județul clientului („${brut}”) nu s-a putut recunoaște, deci documentul pleacă în SAGA fără județ. Verifică partenerul în SAGA.`
      : "Comanda n-are județul clientului, deci documentul pleacă în SAGA fără județ. Verifică partenerul în SAGA.");
  }

  const mentiuni = doc.tip === "storno"
    ? `Stornare ${p.facturaStornata?.numarComplet ?? "factura"}${p.facturaStornata?.data ? ` din ${dataSaga(p.facturaStornata.data).replace(/-/g, ".")}` : ""}, comanda #${nr} (${NUME_CASA[doc.casa]})`
    : `Comanda #${nr} (${NUME_CASA[doc.casa]})`;

  return {
    factura: {
      tip: doc.tip,
      numar: doc.numarComplet,
      data: doc.data,
      furnizor: p.firma,
      client,
      tvaLaIncasare: p.config.tva_la_incasare === true,
      mentiuni,
      gestiune: curataText(p.config.gestiune ?? ""),
      linii: liniiSaga,
      guid: guidDin(`edinio-saga:${codFiscalFirma}:${doc.tip}:${doc.casa}:${doc.numarComplet}`),
      total,
    },
    regim: vat,
    avertismente,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCRIEREA
   ═══════════════════════════════════════════════════════════════════════════ */

const el = (nume: string, valoare: unknown) => `<${nume}>${escapeazaXml(valoare)}</${nume}>`;

/**
 * `<Antet>`, in ordinea din documentatie.
 *
 * ⚠ CAMPURILE NEMARCATE „Optional" PLEACA MEREU, chiar goale; cele marcate „Optional" pleaca doar
 * cand au valoare. Documentatia nu spune ce face SAGA cu un camp lipsa, deci nu lasam sa lipseasca
 * niciunul din cele pe care nu le-a declarat facultative.
 *
 * ⚠ Telefonul si emailul clientului pleaca GOALE: nu sunt pe factura din obligatie si nu-i trebuie
 * contabilitatii. Ce nu trebuie, nu pleaca.
 */
function antet(f: FacturaSaga): string {
  const judetFirma = codAutoAlJudetului(f.furnizor.judet) ?? "";
  const campuri: string[] = [
    el("FurnizorNume", f.furnizor.nume),
    el("FurnizorCIF", f.furnizor.codFiscal),
    el("FurnizorNrRegCom", f.furnizor.regCom),
    el("FurnizorCapital", ""),
    el("FurnizorTara", "RO"),
    el("FurnizorLocalitate", f.furnizor.localitate),
    el("FurnizorJudet", judetFirma),
    el("FurnizorAdresa", f.furnizor.adresa),
    el("FurnizorTelefon", ""),
    el("FurnizorMail", ""),
    el("FurnizorBanca", ""),
    el("FurnizorIBAN", ""),
    el("FurnizorInformatiiSuplimentare", ""),
  ];
  if (f.client.guid) campuri.push(el("GUID_cod_client", f.client.guid));
  campuri.push(
    el("ClientNume", f.client.nume),
    el("ClientInformatiiSuplimentare", ""),
    el("ClientCIF", f.client.cif),
    el("ClientNrRegCom", f.client.regCom),
    el("ClientJudet", f.client.judet),
    el("ClientTara", f.client.tara),
    el("ClientLocalitate", f.client.localitate),
    el("ClientAdresa", f.client.adresa),
    el("ClientBanca", ""),
    el("ClientIBAN", ""),
    el("ClientTelefon", ""),
    el("ClientMail", ""),
    el("FacturaNumar", f.numar),
    el("FacturaData", dataSaga(f.data)),
    /* Scadenta reala o stie casa care a emis; aici ziua documentului, ca sa nu inventam un termen. */
    el("FacturaScadenta", dataSaga(f.data)),
    el("FacturaTaxareInversa", "Nu"),
    el("FacturaTVAIncasare", f.tvaLaIncasare ? "Da" : "Nu"),
    el("FacturaInformatiiSuplimentare", f.mentiuni),
    el("FacturaGreutate", ""),
  );
  return `<Antet>${campuri.join("")}</Antet>`;
}

function linie(l: LinieSaga, nrCrt: number, gestiune: string): string {
  const campuri = [el("LinieNrCrt", nrCrt)];
  if (gestiune && l.marfa) campuri.push(el("Gestiune", gestiune));
  campuri.push(el("Descriere", l.descriere));
  if (l.cod) campuri.push(el("CodArticolClient", l.cod));
  campuri.push(
    el("UM", "buc"),
    el("Cantitate", cantitate(l.cantitate)),
    el("Pret", pretUnitar(l.pret)),
    el("Valoare", suma(l.valoare)),
    el("ProcTVA", Number(l.cota) || 0),
    el("TVA", suma(l.tva)),
  );
  return `<Linie>${campuri.join("")}</Linie>`;
}

/** Fisierul intreg. Mai multe documente = mai multe `<Factura>` in `<Facturi>`. */
export function xmlFacturi(facturi: FacturaSaga[]): string {
  const corp = facturi.map((f) => [
    "<Factura>",
    antet(f),
    "<Detalii><Continut>",
    ...f.linii.map((l, i) => linie(l, i + 1, f.gestiune)),
    "</Continut></Detalii>",
    el("GUID_factura", f.guid),
    "</Factura>",
  ].join("")).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Facturi>${corp}</Facturi>\n`;
}
