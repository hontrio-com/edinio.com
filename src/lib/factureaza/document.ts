/**
 * Documentele Factureaza.ro, compuse din comanda: factura si stornarea ei.
 *
 * Modul PUR: nu stie de baza, de retea sau de sesiune. Asa se poate proba pe valori, iar actiunile
 * (`factureaza.actions.ts`, „use server”) doar aduc datele si trimit ce iese de aici.
 *
 * ═══ CUM SE SCRIE O LINIE, si de ce asa ═══
 *
 * Factureaza.ro primeste pe fiecare linie FIE pretul unitar fara TVA, FIE totalul liniei cu TVA.
 * ⚠ MASURAT pe sandbox (17.11.2026): totalul e AUTORITAR. 1000 de bucati cu totalul 1234,57 au
 * ramas 1234,57, desi pretul pe care l-au scos din el (1,0203) da inapoi 1234,56. Iar documentul
 * insumeaza exact totalurile liniilor.
 *
 * De aceea aici fiecare linie pleaca prin TOTALUL EI CU TVA, socotit din comanda, si documentul iese
 * pe suma lui `orders.total` pana la ban, si la preturi cu TVA, si la preturi fara TVA. (Prin pret
 * unitar, ca la fGO, vreo sesime din totalurile brute nici nu s-ar fi putut scrie; vezi
 * `reconcile.ts`.) Baza si TVA-ul fiecarei linii le scot ei din total, cu rotunjirea lor: 100,00 la
 * 21% da 82,64 + 17,36, la fel ca la noi.
 *
 * ⚠ REDUCERILE SUNT LINII CU CANTITATE -1 SI TOTAL NEGATIV, deci cu pret unitar POZITIV (masurat:
 * -1 x 8,2645 = -10,00). Regula europeana BR-27 din e-Factura spune ca pretul net al unui articol
 * NU poate fi negativ; o cantitate negativa e permisa. XML-ul lor pentru SPV pastreaza exact asa
 * linia (`InvoicedQuantity -1`, `PriceAmount 8.26`), masurat.
 *
 * ⚠ Totalul se verifica INAINTE de emitere cu garda comuna a caselor (`reconcile.ts`): o comanda ale
 * carei linii nu dau `orders.total` nu se factureaza, iar diferenta de rotunjire legitima se
 * absoarbe intr-o linie de ajustare.
 */

import { invoiceParty } from "@/lib/billing/invoice-party";
import { invoiceVat, type MagazinTva, type RegimTva } from "@/lib/billing/invoice-vat";
import { planulCotelor } from "@/lib/billing/cote-pe-linii";
import { codSiNatura } from "@/lib/billing/invoice-lines";
import { mentiuneRefacturare, type SlotFacturare } from "@/lib/billing/refacturare";
import { mesajRefuz, reconciliazaComanda, type LinieDocument } from "@/lib/billing/reconcile";
import { liniaAdresei } from "@/lib/orders/adresa";
import type { MediuFactureaza, SerieFactura } from "./config";
import type { ClientCitit, ClientNou, DocumentCitit, PozitieNoua } from "./client";

/* ═══════════════════════════════════════════════════════════════════════════
   DATELE, in ora Romaniei
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ziua unei clipe in ora Romaniei, oricare ar fi ceasul serverului (Vercel ruleaza in UTC).
 *
 * ⚠ Fara asta, o factura emisa la 01:30 noaptea, ora Romaniei, ar purta data de IERI. Iar data
 * facturii e data fiscala a vanzarii, si tot ea alege seria (seriile lor sunt pe an).
 */
function bucati(d: Date): { an: string; luna: string; zi: string } {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const v = (t: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === t)?.value ?? "00";
  return { an: v("year"), luna: v("month"), zi: v("day") };
}

/** `documentDate`, `paymentDate`: „AAAA-LL-ZZ”, formatul lor. */
export function dataDocumentului(acum: Date): string {
  const b = bucati(acum);
  return `${b.an}-${b.luna}-${b.zi}`;
}

/** Anul documentului, in Romania: din el se alege seria. */
export function anulDocumentului(acum: Date): string {
  return bucati(acum).an;
}

/** „17.11.2026”, pentru mentiunile de pe document. */
function dataRo(aaaaLlZz: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(aaaaLlZz);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : aaaaLlZz;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CIFRELE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * La doi bani, fara capcana virgulei mobile: `1,005 x 100` e `100,49999…` in JavaScript, iar
 * `Math.round` simplu ar fi dat 1,00 in loc de 1,01.
 */
export function rotunjit(n: number): number {
  const x = Number(n) || 0;
  const semn = x < 0 ? -1 : 1;
  return (semn * Math.round(Number((Math.abs(x) * 100).toPrecision(12)))) / 100;
}

const doi = (n: number) => rotunjit(n).toFixed(2);

/** Cantitatea ca text: „3”, „2.5”, „-1”. Trei zecimale cel mult. */
export function cantitateText(q: number): string {
  return String(Number((Number(q) || 0).toFixed(3)));
}

/** Cota ca text, cum o vrea schema lor (`vat: String`): „21”, „11”, „0”. */
function cotaText(c: number): string {
  return String(Number(c) || 0);
}

/** Textele: fara randuri noi si fara spatii in plus. Taiate la o lungime rezonabila. */
function curat(s: unknown, max = 500): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/* ═══════════════════════════════════════════════════════════════════════════
   CLIENTUL
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Codul fiscal al unei persoane fizice fara CNP: treisprezece zerouri. Asa il cere ANAF in
 * e-Factura pentru cumparatorul al carui CNP nu se stie (si asa trimit SmartBill si Facturis de la
 * noi). Masurat: XML-ul lor pentru SPV il pune in `PartyIdentification`.
 */
export const CNP_NECUNOSCUT = "0000000000000";

/**
 * ⚠⚠ IN MODUL DE TEST NU PLEACA NICIO DATA A CUMPARATORULUI.
 *
 * Sandbox-ul Factureaza.ro e UN SINGUR cont, PUBLIC: cheia lui e tiparita in documentatie, deci
 * oricine il poate citi (si sterge). Numele, adresa si CIF-ul unui cumparator adevarat, trimise
 * acolo, ar fi date personale publicate. Documentul de test poarta deci un client inventat; liniile,
 * preturile si totalul raman ale comenzii, fiindca pe ele le probeaza omul.
 */
export const CLIENT_DE_TEST: ClientNou = {
  nume: "Client de test Edinio",
  adresa: "Strada Exemplu 1",
  oras: "Brasov",
  judet: "Brasov",
  tara: "RO",
  cif: CNP_NECUNOSCUT,
  esteFirma: false,
  regCom: "",
  codTva: "",
  platitorTva: null,
};

/** Codul ISO-2 al tarii, cum il cere `createClient` („RO”). Lipsa = Romania. */
export function codTara(cod: string | null | undefined): string {
  const c = (cod ?? "").trim();
  if (!c) return "RO";
  return /^[a-z]{2}$/i.test(c) ? c.toUpperCase() : c;
}

type AdresaComenzii = {
  address?: string | null; street?: string | null; street_no?: string | null;
  city?: string | null; county?: string | null; country?: string | null;
};

/**
 * Clientul documentului, din comanda: firma (dupa `billing_company`) sau persoana fizica.
 *
 * ⚠ La firma, CIF-ul pleaca FARA „RO”, iar „RO” merge in `taxId`: asa le tin ei, si asa tiparesc
 * „CIF: RO 24335356” (masurat pe PDF-ul lor).
 */
export function clientulFacturii(
  comanda: { customer_name: string; billing_company?: unknown; shipping_address?: unknown },
  mediu: MediuFactureaza,
): ClientNou {
  if (mediu === "test") return CLIENT_DE_TEST;
  const adresa = (comanda.shipping_address ?? null) as AdresaComenzii | null;
  const linieAdresa = liniaAdresei(adresa) || null;
  const parte = invoiceParty(comanda, { ...adresa, address: linieAdresa });
  if (parte.isCompany) {
    return {
      nume: curat(parte.name, 200),
      adresa: curat(parte.address, 300) || "-",
      oras: curat(parte.city, 100) || "-",
      judet: curat(parte.county, 100),
      tara: codTara(parte.country),
      cif: curat(parte.vatCode, 40).replace(/^RO\s*/i, ""),
      esteFirma: true,
      regCom: curat(parte.regCom, 60),
      codTva: parte.vatPayer ? "RO" : "",
      platitorTva: parte.vatPayer ? "vat_payer" : "no_vat_payer",
    };
  }
  return {
    nume: curat(parte.name, 200) || "Client",
    adresa: curat(parte.address, 300) || "-",
    oras: curat(parte.city, 100) || "-",
    judet: curat(parte.county, 100),
    tara: codTara(parte.country),
    cif: CNP_NECUNOSCUT,
    esteFirma: false,
    regCom: "",
    codTva: "",
    platitorTva: null,
  };
}

const egal = (a: string, b: string) =>
  a.normalize("NFC").replace(/\s+/g, " ").trim() === b.normalize("NFC").replace(/\s+/g, " ").trim();

/**
 * Un client din nomenclatorul lor care are EXACT datele de pe comanda, sau `null`.
 *
 * ═══ ⚠ DE CE „EXACT”, si nu „acelasi nume” ═══
 *
 * La Factureaza.ro datele clientului de pe factura se COPIAZA din fisa lui; ce se trimite pe factura
 * se ignora (masurat: adresa trimisa pe `createInvoice` langa `clientId` n-a ajuns pe document;
 * documentatia REST o spune: „la scriere se preiau automat din client”). Deci o fisa refolosita cu
 * alta adresa ar fi tiparit pe factura ADRESA VECHE. Iar o fisa nu se rescrie de aici: ar schimba
 * datele pe care comerciantul le foloseste si la facturile lui facute de mana.
 *
 * Regula: se refoloseste doar fisa care spune deja tot ce trebuie sa scrie pe factura; altfel se
 * creeaza una noua. Cumparatorul care revine cu aceleasi date isi regaseste fisa.
 */
export function clientPotrivit(clienti: ClientCitit[], dorit: ClientNou): string | null {
  for (const c of clienti) {
    if (c.esteFirma !== dorit.esteFirma) continue;
    if (!egal(c.nume, dorit.nume) || !egal(c.cif, dorit.cif)) continue;
    if (!egal(c.adresa, dorit.adresa) || !egal(c.oras, dorit.oras) || !egal(c.judet, dorit.judet)) continue;
    if (c.tara.toUpperCase() !== dorit.tara.toUpperCase()) continue;
    if (dorit.esteFirma && (!egal(c.regCom, dorit.regCom) || c.codTva.toUpperCase() !== dorit.codTva.toUpperCase())) continue;
    return c.id;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SERIA SI MARCAJUL
   ═══════════════════════════════════════════════════════════════════════════ */

/** Id-ul seriei cu prefixul ales pe anul documentului (seriile lor sunt pe an; vezi `config.ts`). */
export function alegeSeria(serii: SerieFactura[], prefix: string, an: string): { id: string } | { error: string } {
  const p = prefix.trim();
  const potrivite = serii.filter((s) => s.prefix === p && s.an === an);
  if (potrivite.length === 1) return { id: potrivite[0].id };
  if (potrivite.length === 0) {
    return { error: `Factureaza.ro nu are seria „${p}” pe anul ${an}. Creeaz-o în Factureaza.ro (Setări, Serii documente), cu același prefix, apoi emite din nou.` };
  }
  return { error: `Factureaza.ro are mai multe serii „${p}” pe anul ${an}. Păstrează una singură sau alege în Edinio alt prefix.` };
}

/**
 * Nota interna a documentului (`note`, nevazuta pe PDF): urma emiterii, dupa cheia ei din registru.
 *
 * ═══ ⚠ DE CE E DETERMINISTA ═══
 *
 * Factureaza.ro n-are cheie de idempotenta. Registrul nostru opreste a doua apasare cat timp prima e
 * nelamurita; dar dupa ce omul deblocheaza operatia, reincercarea ar emite iar. Cu nota asta, fiecare
 * emitere intreaba INTAI daca documentul ei exista deja (filtrul `where` pe `note`, intr-o cerere pe
 * care o face oricum) si il adopta in loc sa faca altul. Cheia registrului cuprinde comanda si
 * slotul, deci si nota e aceeasi la orice reincercare si alta la o reemitere dupa storno.
 */
export function marcajEmitere(cheieRegistru: string): string {
  return `Emis din Edinio. Referinta: ${cheieRegistru}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   FACTURA COMENZII
   ═══════════════════════════════════════════════════════════════════════════ */

type ItemComanda = { name?: unknown; price?: unknown; quantity?: unknown; product_id?: string | null; vat_rate?: unknown };

export interface ComandaDeFacturat {
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
}

/** O linie inainte de forma lor: totalul CU TVA, cu semn. */
interface Linie {
  nume: string;
  cantitate: number;
  total: number;
  cota: number;
  cod?: string;
}

function pozitie(l: Linie, i: number): PozitieNoua {
  const p: PozitieNoua = {
    description: curat(l.nume) || "Produs",
    unit: "buc",
    unitCount: cantitateText(l.cantitate),
    total: doi(l.total),
    vat: cotaText(l.cota),
    position: String(i),
  };
  const cod = curat(l.cod ?? "", 100);
  if (cod) p.productCode = cod;
  return p;
}

/** Totalul cu TVA pe care il va avea documentul: suma totalurilor liniilor. */
export function totalulPozitiilor(pozitii: PozitieNoua[]): number {
  return rotunjit(pozitii.reduce((s, p) => s + (Number(p.total) || 0), 0));
}

/** Mentiunea documentelor emise in sandbox: se vede pe PDF, ca nimeni sa nu-l ia drept fiscal. */
export const MENTIUNE_TEST = "DOCUMENT DE TEST, FARA VALOARE FISCALA.";

export type FacturaCompusa = {
  pozitii: PozitieNoua[];
  /** Totalul cu TVA al documentului: chiar `orders.total`. */
  total: number;
  regim: RegimTva;
  client: ClientNou;
  /** Observatiile de sub tabel (`lowerAnnotation`). */
  mentiune: string;
  /** AAAA-LL-ZZ, in ora Romaniei. */
  data: string;
  /** Anul documentului: din el se alege seria. */
  an: string;
};

/** Factura unei comenzi, gata de trimis, sau motivul pentru care nu pleaca. */
export function compuneFactura(p: {
  comanda: ComandaDeFacturat;
  magazin: MagazinTva;
  /** `products.sku` dupa `product_id`. */
  skus: Map<string, string>;
  slot: SlotFacturare;
  /** Eticheta metodei de plata, pentru observatiile de pe document. */
  etichetaPlata: string;
  acum: Date;
  mediu: MediuFactureaza;
}): FacturaCompusa | { error: string } {
  const { comanda, slot } = p;
  const nr = comanda.order_number ?? "";
  const vat = invoiceVat(comanda, p.magazin);
  const plan = planulCotelor(comanda.items, vat.rate);
  const items = (Array.isArray(comanda.items) ? comanda.items : []) as ItemComanda[];

  /*
   * Totalul CU TVA al unei sume a comenzii. La preturi cu TVA (aproape toate magazinele) suma e deja
   * bruta. La preturi fara TVA se adauga cota pe linie: `net + rotunjit(net x cota)`, adica TVA-ul
   * linie cu linie, ca la ei.
   */
  const brut = (suma: number, cota: number) => (vat.taxIncluded
    ? rotunjit(suma)
    : rotunjit(rotunjit(suma) * (1 + cota / 100)));

  const linii: Linie[] = [];
  for (const item of items) {
    const q = Number(item.quantity) || 0;
    const pret = Number(item.price) || 0;
    if (pret < 0) {
      return { error: `Comanda #${nr} are un produs cu preț negativ („${curat(item.name, 80)}”), iar o factură nu poate avea preț negativ pe o linie. Corectează comanda înainte de facturare.` };
    }
    if (q <= 0) continue;
    const cota = plan.cotaLiniei(item);
    const { code } = codSiNatura(item, p.skus);
    linii.push({ nume: curat(item.name), cantitate: q, total: brut(pret * q, cota), cota, ...(code ? { cod: code } : {}) });
  }

  /* Sumele fara cota proprie (transport, reduceri, taxa de ramburs) se impart pe grupele de cota,
     proportional cu marfa. La o singura cota, `peGrupe` intoarce suma intreaga. */
  const adauga = (nume: string, suma: unknown, semn: 1 | -1) => {
    const s = Number(suma) || 0;
    if (s <= 0) return;
    for (const [cota, valoare] of plan.peGrupe(s)) {
      linii.push({ nume: plan.numeCuCota(nume, cota), cantitate: semn, total: semn * brut(valoare, cota), cota });
    }
  };
  adauga("Transport", comanda.shipping_cost, 1);
  adauga(`Discount${comanda.discount_code ? ` (${curat(comanda.discount_code, 60)})` : ""}`, comanda.discount_amount, -1);
  /* Reducerea la plata online e deja scazuta din `orders.total` la plasare: fara linia ei, factura
     ar iesi mai mare decat suma platita. */
  adauga("Reducere plată online", comanda.card_discount_amount, -1);
  adauga("Reducere plată ramburs", comanda.cod_discount_amount, -1);
  adauga("Taxă plată ramburs", comanda.cod_fee_amount, 1);

  if (linii.length === 0) {
    return { error: `Comanda #${nr} nu are nicio linie de facturat.` };
  }

  /*
   * Garda comuna: liniile trebuie sa dea chiar `orders.total`. Documentul e scris in TOTALURI DE
   * LINIE CU TVA, deci asa se si verifica: fiecare linie e o singura „bucata” cu valoarea ei, iar
   * regimul e cel brut (`orders.total` e mereu suma platita, cu TVA cu tot). Singura rotunjire
   * legitima ramane a fiecarei linii la doi bani; o diferenta peste ea e o comanda stricata.
   */
  const deVerificat: LinieDocument[] = linii.map((l) => ({ cantitate: l.total < 0 ? -1 : 1, pretUnitar: Math.abs(l.total) }));
  const rec = reconciliazaComanda(deVerificat, comanda, { ...vat, taxIncluded: true });
  if (rec.fel === "refuz") {
    return { error: mesajRefuz(rec, nr, comanda.payment_status === "paid") };
  }
  if (rec.fel === "ajustare") {
    /* Pe cota cu valoarea cea mai mare: ajustarea e de cativa bani, iar acolo mustra cel mai putin. */
    const cotaAjustarii = plan.grupe.reduce(
      (a, g) => (g.valoare > a.valoare ? g : a),
      plan.grupe[0] ?? { cota: vat.rate, valoare: 0 },
    ).cota;
    linii.push({ nume: "Ajustare rotunjire", cantitate: rec.delta > 0 ? 1 : -1, total: rec.delta, cota: cotaAjustarii });
  }

  const pozitii = linii.map(pozitie);
  const baza = mentiuneRefacturare(`Comanda #${nr}${p.etichetaPlata ? ` - plata: ${p.etichetaPlata}` : ""}`, slot);
  return {
    pozitii,
    total: totalulPozitiilor(pozitii),
    regim: vat,
    client: clientulFacturii(comanda, p.mediu),
    mentiune: p.mediu === "test" ? `${MENTIUNE_TEST} ${baza}` : baza,
    data: dataDocumentului(p.acum),
    an: anulDocumentului(p.acum),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   STORNAREA
   ═══════════════════════════════════════════════════════════════════════════ */

const STARI = { ciorna: "draft", anulata: "cancelled" } as const;

/** Eticheta unui document pentru mesaje: „SRV-1027”, sau id-ul cand eticheta lipseste. */
export function numeleDocumentului(d: Pick<DocumentCitit, "eticheta" | "id">): string {
  return d.eticheta || `(id ${d.id})`;
}

/** Starile in care un document e EMIS: „open” (emisa) si „closed” (inchisa, platita). */
const EMISE = new Set(["open", "closed"]);

/** Ce s-a gasit la ei inainte de a emite: un document de adoptat, un motiv de oprire, sau nimic. */
export type DocumentGasit =
  | { fel: "adopta"; doc: DocumentCitit }
  | { fel: "refuz"; mesaj: string }
  | { fel: "niciunul" };

/**
 * Stornarile deja emise ale facturii: se adopta una COMPLETA si EMISA, sau se opreste stornarea.
 *
 * ⚠⚠ SE ADOPTA DOAR CE E EMIS („open”/„closed”). O stornare CIORNA are numar, dar nu e un document
 * emis: legata de comanda drept stornarea facturii, ar fi deschis drumul reemiterii peste o factura
 * care fiscal NU e stornata. Ciorna opreste, si omul o emite sau o sterge din contul lor.
 *
 * Una partiala nu anuleaza factura, deci opreste si ea (se continua din contul lor); una anulata nu
 * mai anuleaza nimic si se ignora. O stare pe care n-o cunoastem opreste: nu se ghiceste.
 */
export function stornareExistenta(original: DocumentCitit, stornari: DocumentCitit[]): DocumentGasit {
  const ale = stornari.filter((s) => s.stornataId === original.id && s.stare !== STARI.anulata);
  const t = original.total;
  const completa = (s: DocumentCitit) => t !== null
    && ((s.valoareStornata !== null && Math.abs(s.valoareStornata - t) < 0.005)
      || (s.total !== null && Math.abs(s.total + t) < 0.005));
  const deAdoptat = ale.find((s) => EMISE.has(s.stare) && completa(s));
  if (deAdoptat) return { fel: "adopta", doc: deAdoptat };
  const nume = numeleDocumentului(original);
  const ciorna = ale.find((s) => s.stare === STARI.ciorna);
  if (ciorna) {
    return { fel: "refuz", mesaj: `Factura ${nume} are deja stornarea ${numeleDocumentului(ciorna)} în Factureaza.ro, dar ca ciornă. Emite-o sau șterge-o din contul Factureaza.ro, apoi revino.` };
  }
  const necunoscuta = ale.find((s) => !EMISE.has(s.stare));
  if (necunoscuta) {
    return { fel: "refuz", mesaj: `Factura ${nume} are deja stornarea ${numeleDocumentului(necunoscuta)} în Factureaza.ro, într-o stare pe care n-o recunoaștem („${necunoscuta.stare}”). Verifică în contul Factureaza.ro.` };
  }
  const partiala = ale[0];
  if (partiala) {
    return { fel: "refuz", mesaj: `Factura ${nume} are deja stornarea parțială ${numeleDocumentului(partiala)} în Factureaza.ro. Continuă din contul Factureaza.ro.` };
  }
  return { fel: "niciunul" };
}

/**
 * Factura care poarta deja marcajul acestei emiteri (un raspuns pierdut, apoi deblocarea): se
 * adopta in loc sa se emita a doua. Aceeasi regula ca la stornare: se adopta doar ce e EMIS.
 *
 * ⚠ Nota se compara si aici, exact: filtrul lor poate compara fara diacritice si fara litere mari.
 */
export function facturaExistenta(existente: DocumentCitit[], marcaj: string): DocumentGasit {
  const ale = existente.filter((d) => d.nota === marcaj && !d.stornataId && d.stare !== STARI.anulata);
  const emisa = ale.find((d) => EMISE.has(d.stare));
  if (emisa) return { fel: "adopta", doc: emisa };
  const alta = ale[0];
  if (alta) {
    return {
      fel: "refuz",
      mesaj: alta.stare === STARI.ciorna
        ? `Factura acestei comenzi există deja în Factureaza.ro ca ciornă (${numeleDocumentului(alta)}). Emite-o sau șterge-o din contul Factureaza.ro, apoi revino.`
        : `Factura acestei comenzi există deja în Factureaza.ro (${numeleDocumentului(alta)}), într-o stare pe care n-o recunoaștem („${alta.stare}”). Verifică în contul Factureaza.ro.`,
    };
  }
  return { fel: "niciunul" };
}

/**
 * Cat se inregistreaza ca incasat: RESTUL de plata al facturii, nu totalul ei.
 *
 * ⚠ O factura adoptata (emisa la o incercare anterioara) poate avea deja o plata partiala; cu totalul,
 * evidenta comerciantului ar fi aratat mai mult incasat decat a platit clientul. Restul de plata
 * necunoscut se accepta doar pe o factura emisa CHIAR ACUM (nimic platit pe ea inca); pe una adoptata,
 * nu se ghiceste. `null` = nu se inregistreaza nimic.
 */
export function sumaDeIncasat(doc: Pick<DocumentCitit, "total" | "dePlata">, emisaAcum: boolean): number | null {
  const rest = doc.dePlata !== null ? rotunjit(Math.min(doc.dePlata, doc.total ?? doc.dePlata)) : null;
  const suma = rest ?? (emisaAcum ? doc.total : null);
  return suma !== null && Number.isFinite(suma) && suma > 0 ? rotunjit(suma) : null;
}

/** Data documentului („AAAA-LL-ZZ”), doar daca chiar are forma asta. Pentru registru (SAGA). */
export function dataValida(s: string | null | undefined): string | null {
  const d = (s ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

/**
 * Seria aleasa, la SALVARE: refuz doar pentru un prefix care nu exista deloc in cont.
 *
 * ⚠ IN IANUARIE, pana se creeaza seria noului an, prefixul exista doar pe anul trecut. Un refuz ar fi
 * blocat ORICE salvare (si oprirea facturarii automate), deci atunci se salveaza cu avertisment; tot
 * asa la doua serii cu acelasi prefix pe acelasi an. Emiterea refuza oricum, cu acelasi mesaj.
 */
export function verificaSeriaLaSalvare(
  serii: SerieFactura[],
  prefix: string,
  an: string,
): { fel: "ok" } | { fel: "avertisment"; mesaj: string } | { fel: "refuz"; mesaj: string } {
  const r = alegeSeria(serii, prefix, an);
  if (!("error" in r)) return { fel: "ok" };
  const p = prefix.trim();
  if (!serii.some((s) => s.prefix === p)) {
    return { fel: "refuz", mesaj: `Factureaza.ro nu are nicio serie „${p}”. Alege o serie din listă (Testează conexiunea o aduce).` };
  }
  return { fel: "avertisment", mesaj: `${r.error} Setările s-au salvat; până atunci, emiterea e refuzată.` };
}

export type StornareCompusa = {
  pozitii: PozitieNoua[];
  /** Totalul stornarii: minus totalul facturii. */
  total: number;
  /** „Total stornat”, cerut de ei la orice stornare (masurat: fara el, refuz). Pozitiv. */
  valoare: string;
  mentiune: string;
  data: string;
  an: string;
};

/**
 * Stornarea unei facturi: o factura noua, legata de cea stornata (`reversedDocumentId`), cu liniile
 * ei si cantitatile si totalurile cu semn schimbat.
 *
 * ═══ ⚠ SE COPIAZA DIN FACTURA LOR, NU SE RECOMPUNE DIN COMANDA ═══
 *
 * Comanda se poate schimba dupa facturare. Recompusa din ea, stornarea ar fi anulat ALTCEVA decat
 * documentul emis. Copiata din ce a citit Factureaza.ro, cu totalurile autoritare ale liniilor,
 * anuleaza factura pana la ban (masurat: -1274,57 pe o factura de 1274,57, linie cu linie).
 *
 * ⚠ Factureaza.ro cere la stornare si „Total stornat” (`inputCurrencyReversing`) nenul; fara el, ca
 * si fara linii, refuza (masurat).
 */
export function compuneStornarea(p: {
  original: DocumentCitit;
  orderNumber: string | number | null | undefined;
  acum: Date;
  mediu: MediuFactureaza;
}): StornareCompusa | { error: string } {
  const o = p.original;
  const nume = numeleDocumentului(o);
  const deMana = "Stornează-o din contul Factureaza.ro.";
  if (o.stare === STARI.anulata) return { error: `Factura ${nume} e anulată în Factureaza.ro, deci nu se mai stornează.` };
  if (o.stare === STARI.ciorna) {
    return { error: `Factura ${nume} e ciornă în Factureaza.ro, deci nu e un document emis. Emite-o sau șterge-o din contul Factureaza.ro.` };
  }
  if (o.stornataId) return { error: `Documentul ${nume} e el însuși o stornare, deci nu se stornează.` };
  if (o.total === null || o.total <= 0) return { error: `Factura ${nume} nu are un total pozitiv în răspunsul Factureaza.ro. ${deMana}` };
  if (o.pozitii.length === 0) return { error: `Factura ${nume} nu are linii în răspunsul Factureaza.ro, deci n-avem ce stornare compune. ${deMana}` };

  const linii: Linie[] = [];
  for (const l of o.pozitii) {
    if (l.tip && l.tip !== "InvoicePosition") {
      return { error: `Factura ${nume} are o linie de alt fel („${l.descriere}”, ${l.tip}), pe care nu o putem storna corect de aici. ${deMana}` };
    }
    if (l.reducere !== null && l.reducere !== 0) {
      return { error: `Factura ${nume} are o reducere procentuală pe linia „${l.descriere}”, pe care nu o putem storna corect de aici. ${deMana}` };
    }
    if (l.cantitate === null || l.cantitate === 0 || l.total === null) {
      return { error: `Linia „${l.descriere}” a facturii ${nume} nu are cantitatea sau totalul citibile. ${deMana}` };
    }
    /* ⚠ Cota necitita NU e 0%: stornarea ar fi anulat linia cu alt TVA decat factura, deci
       defalcarea TVA a celor doua documente nu s-ar mai fi anulat intre ele. */
    if (l.cota === null) {
      return { error: `Linia „${l.descriere}” a facturii ${nume} nu are cota TVA citibilă. ${deMana}` };
    }
    linii.push({ nume: l.descriere, cantitate: -l.cantitate, total: -l.total, cota: l.cota, ...(l.cod ? { cod: l.cod } : {}) });
  }
  const pozitii = linii.map((l, i) => ({ ...pozitie(l, i), unit: o.pozitii[i].unitate || "buc" }));
  const total = totalulPozitiilor(pozitii);
  /* ⚠ Liniile citite trebuie sa dea chiar totalul facturii. Altfel ceva de pe document nu se vede in
     raspuns (o reducere pe document, de pilda), iar stornarea ar anula doar o parte din factura. */
  if (Math.abs(total + o.total) >= 0.01) {
    return { error: `Liniile facturii ${nume} dau ${doi(-total)} lei, iar factura are ${doi(o.total)} lei. ${deMana}` };
  }

  const baza = `Stornare factura ${nume}${o.data ? ` din ${dataRo(o.data)}` : ""}${p.orderNumber ? ` (comanda #${p.orderNumber})` : ""}`;
  return {
    pozitii,
    total,
    valoare: doi(o.total),
    mentiune: p.mediu === "test" ? `${MENTIUNE_TEST} ${baza}` : baza,
    data: dataDocumentului(p.acum),
    an: anulDocumentului(p.acum),
  };
}
