/**
 * Comenzile eMAG, aduse in magazin.
 *
 * ═══ CE E ALTFEL FATA DE CELELALTE MARKETPLACE-URI ═══
 *
 * Un lucru bun si trei capcane.
 *
 * BUN: `products[].product_id` din comanda e ID-UL NOSTRU — chiar `emag_id`-ul pe
 * care l-am trimis noi. Deci linia comenzii se leaga de produs EXACT, fara sa
 * ghicim dupa cod de bare sau dupa nume. La Trendyol, potrivirea pe barcode a fost
 * sursa a jumatate din incidentele de stoc.
 *
 * ⚠ CAPCANA 1: `customer.email` E UN HASH, nu o adresa. Documentatia lor o spune
 * limpede. Scrisa in `orders.customer_email` si folosita apoi de automatizarile de
 * e-mail, fiecare comanda eMAG ar fi produs o trimitere catre o adresa inexistenta
 * — si, mai rau, ar fi stricat reputatia domeniului magazinului cu respingeri.
 *
 * ⚠ CAPCANA 2: PRETURILE VIN FARA TVA. `sale_price` pe linie si `shipping_tax` sunt
 * amandoua nete. Insumate de-a gata in `orders.total`, comanda ar fi aparut in
 * magazin cu o cincime mai ieftina decat a incasat comerciantul — iar rapoartele si
 * facturile ar fi plecat de la numarul mic.
 *
 * ⚠ CAPCANA 3: VOUCHERELE SUNT PE DOUA NIVELURI, cu cote de TVA diferite. Un voucher
 * poate cadea pe comanda intreaga (`vouchers[]`) sau pe o linie anume
 * (`product_voucher_split[]`), iar documentatia cere explicit sa se citeasca TOTI
 * parametrii, nu doar primul. Citit numai unul, totalul nu se potriveste cu ce a
 * platit clientul, si nimeni nu-si da seama de ce.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { intregDeLaEi } from "./numere";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import { citesteComenzi, confirmaComanda, isEmagError } from "./client";
import type { ContextEmag } from "./sync";
import type { EmagComanda, EmagImpartireVoucher, EmagLinieComanda, EmagGarantieReciclare} from "./types";

type Db = SupabaseClient<Database>;

/* ═══════════════════════════════════════════════════════════════════════════
   STATUSURILE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Statusul eMAG, tradus in cel al magazinului.
 *
 * ⚠ PUR SI EXPORTAT, ca sa poata fi probat fara retea. Traducerea unui status e
 * exact felul de cod care arata evident si se strica tacut: o comanda anulata
 * ramasa „in procesare" tine stocul rezervat pe veci.
 *
 *   0 anulata · 1 noua · 2 in procesare · 3 pregatita · 4 finalizata · 5 returnata
 */
export function statusEdinio(statusEmag: number): string {
  if (statusEmag === 0) return "cancelled";
  /*
   * ═══ ⚠ 5 DEVINE „refunded", NU „returned" (24.08.2026) ═══
   *
   * „returned" NU EXISTĂ în baza noastră. `orders_status_check` permite exact:
   * pending · confirmed · processing · shipped · delivered · cancelled · refunded.
   * Valoarea pleca neatinsă spre `aplica_tranzitia_comenzii`, care o scria în `orders`
   * — și primea 23514, fără prindere de excepție.
   *
   * ⚠ CE COSTA, în două feluri:
   *
   *   1. O comandă returnată RĂMÂNEA „livrată" pe veci. Comerciantul o vedea ca
   *      vândută, factura ei stătea ca bună, iar jurnalul primea un „critical" la
   *      fiecare trecere a cronului.
   *   2. Mai rău: o comandă DEJA returnată la prima conectare nu intra deloc.
   *      Insertul cădea pe același 23514, cod trecut anume în lista „permanent" — deci
   *      comanda era sărită DEFINITIV, nu reîncercată.
   *
   * ⚠ Și „refunded" nu e doar valoarea care încape: e și cea cu înțelesul potrivit.
   * `c_intoarse` din `aplica_tranzitia_comenzii` = `['refunded','cancelled']`, deci
   * trecerea aici ELIBEREAZĂ stocul — exact ce trebuie când marfa s-a întors pe raft.
   * About You mapează același eveniment la fel (`aboutyou/orders.ts:36`); eMAG era
   * singura care ieșea din tabel.
   */
  if (statusEmag === 5) return "refunded";
  if (statusEmag === 4) return "delivered";
  if (statusEmag === 3) return "shipped";
  if (statusEmag === 2) return "processing";
  return "pending";
}

/**
 * Se scade stocul pentru o comandă VĂZUTĂ ACUM ÎNTÂIA OARĂ, în starea asta?
 *
 * ═══ ⚠ O COMANDĂ DEJA ANULATĂ NU-ȘI MAI POATE ELIBERA STOCUL ═══
 *
 * Consumul era chemat necondiționat la prima vedere. Iar eliberarea stă în
 * `aplica_tranzitia_comenzii`, sub `if v_status_schimbat` — deci se face numai când
 * statusul SE SCHIMBĂ, și numai la trecerea ÎNSPRE „cancelled" dinspre altceva
 * (`v_intoarce`).
 *
 * O comandă intrată direct ca „cancelled" nu mai are de unde să se schimbe. Stocul
 * scăzut acum nu se mai întoarce NICIODATĂ — nici la a doua trecere, fiindcă
 * `stoc_marketplace_la` e deja pus și RPC-ul răspunde `deja: true`. Marfa e pe raft,
 * dar magazinul o socotește vândută, și așa rămâne.
 *
 * ⚠ CÂND SE ÎNTÂMPLĂ: o comandă anulată între două treceri ale cronului, sau la prima
 * citire după conectarea contului, când fereastra aduce și comenzi deja închise.
 *
 * ⚠ ACELAȘI lucru pentru 5 (returnată la ei, „refunded" la noi), și din același motiv:
 * `c_intoarse` din tranziție e chiar `['refunded','cancelled']`. O comandă intrată direct
 * returnată n-are de unde să se mai schimbe, deci stocul scăzut acum ar rămâne scăzut
 * pentru marfă care e pe raft.
 *
 * Regula se citește din mulțimea aceea, nu din două valori scrise de mână: dacă cineva
 * mai adaugă o stare care întoarce stocul, aici trebuie să se afle.
 *
 * ⚠ PUR ȘI EXPORTAT: e o decizie care se strică tăcut și trebuie probată fără rețea.
 */
export function seConsumaLaIntrare(statusEmag: number): boolean {
  const st = statusEdinio(statusEmag);
  return st !== "cancelled" && st !== "refunded";
}

/* ═══════════════════════════════════════════════════════════════════════════
   BANII
   ═══════════════════════════════════════════════════════════════════════════ */

function nr(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function douaZecimale(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Cat face un voucher, cu tot cu TVA-ul lui.
 *
 * ⚠ SE ADUNA TOATE BUCATILE, NU SE IA PRIMA. Documentatia lor cere explicit sa se
 * citeasca toti parametrii: pe acelasi produs pot cadea mai multe vouchere, cu cote
 * diferite. Luata prima, o comanda cu doua reduceri ar fi iesit mai scumpa decat a
 * platit clientul — si diferenta ar fi ajuns pe factura.
 */
export function valoareVouchere(bucati: EmagImpartireVoucher[] | undefined): { fara: number; tva: number } {
  let fara = 0, tva = 0;
  for (const b of bucati ?? []) {
    fara += nr(b?.value);
    tva += nr(b?.vat_value);
  }
  return { fara: douaZecimale(fara), tva: douaZecimale(tva) };
}

export interface BaniiComenzii {
  /** Transportul, CU TVA. Fara el nu se poate emite factura — vezi `shipping_cost`. */
  transport: number;
  subtotal: number;
  vat_amount: number;
  total: number;
}

/**
 * Cati bani are comanda, cu TVA adaugat inapoi.
 *
 * ⚠ EMAG DA TOT FARA TVA. Cota nu vine pe linie, ci se afla din `vat` -ul bucatilor
 * de voucher — si cand nu exista niciun voucher, nu se afla deloc. De aceea cota
 * magazinului intra ca argument: e cea cu care si publicam, deci aceeasi cu care
 * eMAG a calculat pretul afisat.
 *
 * ⚠ Vouchere le scad, si le scad la amandoua nivelurile. Valorile lor sunt NEGATIVE
 * la ei (documentatia: „reducerea fara TVA, negativa"), deci se ADUNA, nu se scad —
 * scazute, reducerea s-ar fi transformat in adaos.
 */
/**
 * Cat fac taxele de garantie-returnare de pe o linie, cu tot cu TVA-ul lor.
 *
 * ═══ ⚠ SGR-UL E BANI, SI NU-L NUMARA NIMENI PANA AZI (audit 24.08.2026) ═══
 *
 * `recycle_warranties` era declarat `unknown[]` in tipuri si nu se citea nicaieri.
 * Adica totalul comenzii iesea mai mic decat cat a facturat eMAG clientului.
 *
 * Ce costa: la plata ramburs, `rambursDeIncasat` trimite curierul sa incaseze totalul
 * NOSTRU. Cu SGR-ul lipsa, curierul cere mai putin decat trebuie, iar diferenta o
 * pierde comerciantul — cate 0,50 lei pe ambalaj, pe fiecare comanda, la nesfarsit.
 * Si factura pe care o emitem iese fara linia aia, deci nu se potriveste cu decontul lor.
 *
 * ⚠ FIECARE GARANTIE ARE COTA EI DE TVA. Trecuta prin cota magazinului, o taxa cu alta
 * cota ar fi iesit cu cativa bani gresit — o suma prea mica pentru a fi observata si
 * exact de aceea nereparata niciodata.
 *
 * ⚠ Si ele pot avea vouchere, la nivelul lor. Valorile sunt NEGATIVE, ca peste tot la ei.
 */
export function valoareGarantiilor(
  garantii: EmagGarantieReciclare[] | undefined,
): { fara: number; tva: number } {
  let fara = 0, tva = 0;
  for (const g of garantii ?? []) {
    const bucati = nr(g?.quantity) || 1;
    const net = nr(g?.sale_price) * bucati;
    const cota = nr(g?.vat_rate);
    fara += net;
    tva += net * (cota / 100);
    const v = valoareVouchere(g?.recycle_warranty_voucher_split);
    fara += v.fara;
    tva += v.tva;
  }
  return { fara, tva };
}

export function baniiComenzii(c: EmagComanda, cotaProcente: number): BaniiComenzii {
  const cota = Number.isFinite(cotaProcente) ? cotaProcente : 0;
  const cuTva = (net: number) => net * (1 + cota / 100);

  let netProduse = 0;
  let voucherFara = 0, voucherTva = 0;
  /* ⚠ Tinute SEPARAT de produse: au cota lor de TVA, deci nu pot trece prin `cuTva`. */
  let garantiiFara = 0, garantiiTva = 0;

  for (const l of c.products ?? []) {
    if (l?.status === 0) continue; /* linie stornata */
    netProduse += nr(l?.sale_price) * nr(l?.quantity);
    const v = valoareVouchere(l?.product_voucher_split);
    voucherFara += v.fara;
    voucherTva += v.tva;
    /* ⚠ SGR-ul urmeaza soarta liniei: pe o linie stornata nu se mai incaseaza. */
    const g = valoareGarantiilor(l?.recycle_warranties);
    garantiiFara += g.fara;
    garantiiTva += g.tva;
  }

  /*
   * ═══ ⚠ `shipping_tax` VINE CU TVA INCLUS, spre deosebire de tot restul ═══
   *
   * Masurat la ban pe comanda 500822531: produse 345,3329 fara TVA × 1,21 = 417,85;
   * `shipping_tax` = 25; iar `cashed_co` — cat s-a luat efectiv de pe cardul clientului
   * — = 442,85. Adica 417,85 + 25, nu 417,85 + 25×1,21.
   *
   * Noi scriam 448,10. Diferenta de 5,25 lei e chiar 25 × 21%: TVA-ul transportului,
   * socotit de doua ori.
   *
   * ⚠ CE COSTA: `rambursDeIncasat` trimite curierul sa ceara totalul NOSTRU. Clientul
   * ar fi fost taxat peste ce a comandat, iar decontul comerciantului nu s-ar fi
   * potrivit niciodata cu al lor. Cinci lei pe comanda — exact cat sa nu se observe.
   *
   * ⚠ Documentatia lor confirma directia: la `RMASave.return_tax_value` scrie explicit
   * „Shipping tax for returned products (VAT included)", in timp ce la fiecare camp de
   * pret al produsului scrie „without VAT".
   */
  const brutLivrare = nr(c.shipping_tax);
  const netLivrare = cota > 0 ? brutLivrare / (1 + cota / 100) : brutLivrare;
  const vLivrare = valoareVouchere(c.shipping_tax_voucher_split);
  voucherFara += vLivrare.fara;
  voucherTva += vLivrare.tva;

  /* Vouchere la nivel de comanda. ⚠ `sale_price` si `sale_price_vat` sunt NEGATIVE. */
  for (const v of c.vouchers ?? []) {
    voucherFara += nr(v?.sale_price);
    voucherTva += nr(v?.sale_price_vat);
  }

  const net = netProduse + netLivrare + voucherFara + garantiiFara;
  /*
   * ⚠ Transportul intra la brut ASA CUM L-AU TRIMIT, nu trecut prin `cuTva`: el vine
   * deja cu TVA. Garantiile la fel — TVA-ul lor s-a socotit cu cota lor.
   */
  const brut = cuTva(netProduse) + brutLivrare + voucherFara + voucherTva
    + garantiiFara + garantiiTva;

  return {
    subtotal: douaZecimale(net),
    vat_amount: douaZecimale(brut - net),
    total: douaZecimale(brut),
    /* ⚠ CU TVA, cum il tine magazinul si cum ni-l dau si ei. Vezi `shipping_cost`. */
    transport: douaZecimale(brutLivrare),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   LINIILE
   ═══════════════════════════════════════════════════════════════════════════ */

export interface LinieEdinio {
  product_id: string | null;
  variant_title: string | null;
  name: string;
  quantity: number;
  price: number;
  emag_product_id: number | null;
}

/**
 * Liniile comenzii, legate de produsele noastre.
 *
 * ⚠ LEGATURA E EXACTA, PRIN `emag_id`. Nu se ghiceste nimic: `product_id` din linie
 * e chiar id-ul pe care l-am trimis noi la publicare. O linie care nu se leaga
 * ramane in comanda cu `product_id: null` — se vede, se poate factura, dar NU scade
 * stoc, fiindca nu stim al cui.
 */
export function liniiEdinio(
  linii: EmagLinieComanda[] | undefined,
  dupaEmagId: Map<number, { product_id: string | null; variant_title: string | null }>,
  cotaProcente: number,
): LinieEdinio[] {
  const cota = Number.isFinite(cotaProcente) ? cotaProcente : 0;
  const out: LinieEdinio[] = [];
  for (const l of linii ?? []) {
    if (!l || l.status === 0) continue;
    /* ⚠ Prin aceeasi poarta ca la `hartaOfertelor`: ei trimit sirul `"433"`, iar cheia
       hartii e numarul 433. Vezi nota de acolo pentru ce a costat. */
    const idLor = intregDeLaEi(l.product_id);
    const legat = idLor != null ? dupaEmagId.get(idLor) : undefined;
    out.push({
      product_id: legat?.product_id ?? null,
      variant_title: legat?.variant_title ?? null,
      name: (l.name ?? "").trim() || `Produs eMAG ${idLor ?? "?"}`,
      quantity: nr(l.quantity),
      /* ⚠ Pretul liniei se scrie CU TVA: asa il tine magazinul peste tot. */
      price: douaZecimale(nr(l.sale_price) * (1 + cota / 100)),
      emag_product_id: idLor,
    });
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CLIENTUL
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ClientComanda {
  name: string;
  phone: string | null;
  /** ⚠ Mereu `null`. Vezi nota de mai jos. */
  email: null;
  address: Record<string, unknown>;
}

/**
 * Datele clientului.
 *
 * ═══ ⚠ E-MAILUL NU SE SCRIE NICIODATA ═══
 *
 * `customer.email` de la eMAG e un HASH, nu o adresa — documentatia lor o spune
 * limpede. Scris in `orders.customer_email`, ar fi ajuns pe mana automatizarilor de
 * e-mail ale magazinului: confirmari de comanda, cereri de recenzie, cosuri
 * abandonate. Fiecare ar fi plecat catre o adresa inexistenta.
 *
 * Iar respingerile n-ar fi cazut pe eMAG, ci pe domeniul comerciantului. Cateva sute
 * de comenzi si e-mailurile lui adevarate incep sa ajunga in spam — un rau care se
 * repara greu si care n-are nicio legatura vizibila cu integrarea.
 *
 * Deci `null`, si cine are nevoie de client il gaseste in panoul eMAG.
 */
export function clientComenzii(c: EmagComanda): ClientComanda {
  const cl = c.customer ?? {};
  const nume = (cl.name ?? "").trim() || (cl.billing_name ?? "").trim() || "Client eMAG";
  const telefon = (cl.shipping_phone ?? cl.phone_1 ?? cl.billing_phone ?? "").trim() || null;

  return {
    name: nume,
    phone: telefon,
    email: null,
    address: {
      street: (cl.shipping_street ?? "").trim(),
      city: (cl.shipping_city ?? "").trim(),
      county: (cl.shipping_suburb ?? "").trim(),
      postal_code: (cl.shipping_postal_code ?? "").trim(),
      country: (cl.shipping_country ?? "").trim(),
      contact: (cl.shipping_contact ?? "").trim(),
      phone: telefon ?? "",
      source: "emag",
      /* Ridicare din easybox: adresa de mai sus e a lockerului, nu a omului. */
      locker_id: c.details?.locker_id ?? null,
      locker_name: c.details?.locker_name ?? null,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADUCEREA
   ═══════════════════════════════════════════════════════════════════════════ */

/** ⚠ Maximul lor la citire. */
const PE_PAGINA = 100;

/** Cate pagini de comenzi se citesc intr-o trecere. */
const PAGINI_PE_TRECERE = 5;

export interface RezultatComenzi {
  /**
   * S-a citit TOT ce era de citit in fereastra?
   *
   * ⚠ CAND E `false`, MARCAJUL NU SARE LA „ACUM". `marcajUrmator` se bazeaza chiar
   * pe campul asta: trunchiat si raportat `ok`, fereastra urmatoare ar fi inceput
   * dupa comenzile necitite, si ele s-ar fi pierdut DEFINITIV — fara nicio eroare,
   * fiindca fiecare trecere in parte a reusit.
   */
  ok: boolean;
  /** Cea mai noua comanda vazuta, in milisecunde. Din ea se compune marcajul. */
  cursorMs?: number;
  noi: number;
  actualizate: number;
  esuate: number;
}

/**
 * Comenzile schimbate de la marcajul trecut incoace.
 *
 * ═══ ⚠ SE CITESTE CRESCATOR, NU DESCRESCATOR ═══
 *
 * Descrescator, cand pagina se termina inainte de fereastra, comenzile RAMASE
 * NECITITE sunt tocmai cele mai vechi — adica exact cele de langa marcaj, care ar fi
 * sarite la trecerea urmatoare. Crescator, ce ramane necitit e in fata marcajului si
 * se prinde data viitoare.
 */
export async function aduComenzile(
  admin: Db, ctx: ContextEmag, deLa: Date,
): Promise<RezultatComenzi> {
  const r: RezultatComenzi = { ok: true, noi: 0, actualizate: 0, esuate: 0 };

  /*
   * ═══ ⚠ AMÂNDOUĂ TIPURILE, ȘI DE ACEEA E O REPARAȚIE, NU O ÎMBUNĂTĂȚIRE ═══
   *
   * `order/read` are `type` cu IMPLICITUL 3 — comenzi onorate de vânzător. Necerut
   * anume, filtrul e pus de EI, iar comenzile FBE (`type: 2`, onorate de eMAG) nu vin
   * NICIODATĂ. Fără nicio eroare: răspunsul e 200 și pare complet.
   *
   * Un magazin cu eMAG Fulfilment ar fi văzut jumătate din vânzări lipsă din Edinio,
   * și n-ar fi avut ce să raporteze. Se vedea deja în cod: `pregatireAwbEmag` are o
   * ramură anume pentru `order_type === 2` — cod care nu se putea atinge, fiindcă
   * comenzile acelea nu ajungeau niciodată aici.
   *
   * ⚠ Două treceri, nu o listă: schema lor dă `type` ca `enum [2, 3]`, valoare
   * singură, nu tablou.
   *
   * ⚠ Comenzile au 12 cereri pe secundă, nu 3 ca restul. Dublarea încape.
   */
  for (const tip of TIPURI_DE_CITIT) {
    await aduPeTip(admin, ctx, deLa, tip, r);
  }

  return r;
}

/** 3 = onorate de vânzător · 2 = onorate de eMAG (FBE). ⚠ Amândouă, vezi `aduComenzile`. */
const TIPURI_DE_CITIT = [3, 2] as const;

/**
 * O trecere pentru un singur tip de comandă.
 *
 * ⚠ Scrie în ACELAȘI `r`. Cursorul se ia ca maxim peste amândouă tipurile, iar `ok`
 * se stinge dacă oricare dintre ele n-a citit tot — altfel marcajul ar fi sărit peste
 * comenzile tipului care s-a trunchiat.
 */
async function aduPeTip(
  admin: Db, ctx: ContextEmag, deLa: Date, tip: 2 | 3, r: RezultatComenzi,
): Promise<void> {
  for (let pagina = 1; pagina <= PAGINI_PE_TRECERE; pagina++) {
    const raspuns = await citesteComenzi(ctx.auth, {
      modifiedAfter: iso(deLa),
      type: tip,
      currentPage: pagina,
      itemsPerPage: PE_PAGINA,
    });
    if (isEmagError(raspuns)) {
      /* ⚠ `ok: false`: nu s-a citit tot, deci marcajul NU are voie sa avanseze. */
      r.ok = false;
      return;
    }

    const comenzi = (Array.isArray(raspuns.data) ? raspuns.data : []) as EmagComanda[];
    for (const c of comenzi) {
      const t = Date.parse(c.modified ?? c.date ?? "");
      if (Number.isFinite(t)) r.cursorMs = Math.max(r.cursorMs ?? 0, t);

      const rez = await ingereazaComanda(admin, ctx, c);
      if (rez === "noua") r.noi++;
      else if (rez === "actualizata") r.actualizate++;
      else if (rez === "esuata") {
        r.esuate++;
        /* ⚠ O comanda care n-a intrat opreste avansarea marcajului. Altfel ar fi
           iesit din fereastra la trecerea urmatoare si nimeni n-ar mai fi incercat. */
        r.ok = false;
      }
    }

    if (comenzi.length < PE_PAGINA) return;
    if (pagina === PAGINI_PE_TRECERE) {
      /* Mai sunt pagini, dar trecerea s-a terminat. ⚠ Nu e o reusita deplina. */
      r.ok = false;
    }
  }
}

function iso(d: Date): string {
  /* eMAG cere `Y-m-d H:i:s`, nu ISO cu `T` si `Z`. */
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/* ═══════════════════════════════════════════════════════════════════════════
   IMPORTUL DE COMENZI VECHI (§87)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ FEREASTRA LOR E DE CEL MULT O LUNĂ, SI E SCRISĂ ÎN SCHEMA LOR.
 *
 * `createdBefore`: „Can only be set if createdAfter is present. Maximum 1 month
 * difference." Cerute nouăzeci de zile dintr-o dată, eMAG refuză — iar mesajul
 * vorbește despre un câmp, nu despre limită.
 *
 * Douăzeci și opt de zile, nu treizeci: „o lună" nu e definită nicăieri, iar
 * februarie face diferența între o fereastră care merge și una care cade o dată pe an,
 * fără ca nimeni să lege căderea de dată.
 */
export const ZILE_PE_FEREASTRA = 28;

/** Cel mult cât se poate cere înapoi. Peste, se citește degeaba: nu ține nimeni. */
export const ZILE_ISTORIC_MAXIM = 365;

export interface RezultatIstoric {
  noi: number;
  actualizate: number;
  esuate: number;
  /** ⚠ `false` = nu s-a adus tot. Se spune, nu se ascunde sub un număr frumos. */
  complet: boolean;
}

/**
 * Aduce comenzile vechi, marcate ca istoric.
 *
 * ═══ ⚠ NU ATINGE MARCAJUL SINCRONIZĂRII ═══
 *
 * `orders_synced_at` e cursorul care spune „de aici înainte n-am mai citit". Importul
 * ăsta merge ÎNAPOI. Mutat de el, cursorul ar fi sărit cu trei luni în urmă, iar
 * cronul ar fi recitit un trimestru întreg la fiecare minut — sau, dacă se scria data
 * cea mai nouă găsită, ar fi sărit peste comenzile dintre timp.
 *
 * Nu se scrie nimic în `emag_config` de aici. Dinadins.
 */
export async function aduIstoricul(
  admin: Db,
  ctx: ContextEmag,
  zile: number,
  /** Cât timp are voie să dureze. ⚠ Funcțiile fără stare sunt oprite de platformă. */
  pana: number = Date.now() + 50_000,
): Promise<RezultatIstoric> {
  const r: RezultatIstoric = { noi: 0, actualizate: 0, esuate: 0, complet: true };

  const zileCerute = Math.max(1, Math.min(Math.floor(zile) || 0, ZILE_ISTORIC_MAXIM));
  const acum = Date.now();
  const inceput = acum - zileCerute * 24 * 60 * 60 * 1000;

  /*
   * ⚠ SE MERGE DINSPRE VECHI SPRE NOU. Invers, o oprire la jumătate ar fi lăsat
   * negăsită tocmai partea veche — iar o reluare ar fi trebuit să înceapă de la capăt,
   * fiindcă nimeni n-ar fi știut până unde s-a ajuns. Așa, ce s-a adus rămâne adus.
   */
  for (let de = inceput; de < acum; de += ZILE_PE_FEREASTRA * 24 * 60 * 60 * 1000) {
    const pana_la = Math.min(de + ZILE_PE_FEREASTRA * 24 * 60 * 60 * 1000, acum);

    for (const tip of TIPURI_DE_CITIT) {
      for (let pagina = 1; pagina <= PAGINI_ISTORIC; pagina++) {
        if (Date.now() > pana) {
          /* ⚠ Timpul s-a terminat. NU e o reușită: se spune, iar omul reia. */
          r.complet = false;
          return r;
        }

        const raspuns = await citesteComenzi(ctx.auth, {
          createdAfter: iso(new Date(de)),
          createdBefore: iso(new Date(pana_la)),
          type: tip,
          currentPage: pagina,
          itemsPerPage: PE_PAGINA,
        });
        if (isEmagError(raspuns)) {
          r.complet = false;
          return r;
        }

        const comenzi = (Array.isArray(raspuns.data) ? raspuns.data : []) as EmagComanda[];
        for (const c of comenzi) {
          /* ⚠ `istoric: true` oprește stocul, factura și confirmarea. Vezi
             `OptiuniIngest`: fiecare dintre ele ar fi făcut rău, iar factura duplicată
             e cel mai greu de desfăcut din toate. */
          const rez = await ingereazaComanda(admin, ctx, c, { istoric: true });
          if (rez === "noua") r.noi++;
          else if (rez === "actualizata") r.actualizate++;
          else if (rez === "esuata") r.esuate++;
        }

        if (comenzi.length < PE_PAGINA) break;
        if (pagina === PAGINI_ISTORIC) r.complet = false;
      }
    }
  }

  return r;
}

/**
 * Câte pagini pe fereastră și pe tip.
 *
 * ⚠ O sută de comenzi pe pagină × douăzeci = două mii pe lună și pe tip. Peste atât,
 * se spune `complet: false` și se reia — mai bine un import în două apăsări decât unul
 * care se oprește la jumătate și raportează succes.
 */
const PAGINI_ISTORIC = 20;

/* ═══════════════════════════════════════════════════════════════════════════
   O COMANDA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Onorata de eMAG, din depozitul lor (FBE).
 *
 * ═══ ⚠ CE NU SE FACE PENTRU ELE, SI DE CE ═══
 *
 * `type: 2` inseamna ca marfa e DEJA la eMAG: comerciantul a trimis-o acolo, cu
 * saptamani inainte de vanzare. Deci vanzarea nu misca nimic din depozitul lui.
 *
 * ⚠ STOCUL NU SE CONSUMA. Bucatile au plecat din Edinio atunci cand au fost trimise
 * la ei, nu acum. Scazute a doua oara, magazinul propriu ar fi ramas fara stoc pentru
 * marfa pe care o are pe raft — si ar fi refuzat comenzi adevarate.
 *
 * ⚠ NU SE CONFIRMA. `order/acknowledge` e semnalul „am preluat comanda, ma ocup de
 * livrare". La FBE se ocupa ei. Iar documentatia lor spune limpede ca doar `type: 3`
 * se editeaza.
 *
 * ⚠ FACTURA SE EMITE TOTUSI. Vanzatorul ramane comerciantul, chiar daca livrarea o
 * face eMAG; clientul are nevoie de factura lui, nu a lor.
 */
export const TIP_ONORAT_DE_EMAG = 2;

export function onoratDeEmag(tip: number | null | undefined): boolean {
  return Number(tip) === TIP_ONORAT_DE_EMAG;
}

/**
 * eMAG status: 1 = noua · 2 = in procesare · 3 = pregatita · 4 = finalizata ·
 * 0 = anulata · 5 = returnata.
 */
export const STATUS_NOUA = 1;

/**
 * Are rost sa mai chemam `order/acknowledge` pentru comanda asta?
 *
 * ═══ ⚠ DEFECT VAZUT IN PRODUCTIE LA PRIMA CONECTARE, 24.08.2026 ═══
 *
 * O comanda deja „in procesare" la ei — fiindca o confirmase alta integrare, sau
 * comerciantul din panoul lor — raspunde la `acknowledge` cu:
 *
 *   400  ERROR: Order is already in progress.
 *
 * Forma dinainte trata orice 400 ca esec: scria un warning si NU punea
 * `acknowledged_at`. Iar `ingereazaComanda` reincearca confirmarea la FIECARE
 * actualizare, tocmai fiindca `acknowledged_at` e gol.
 *
 * Deci: cerere arsa -> 400 -> warning -> campul ramane gol -> se repeta. La nesfarsit,
 * pentru fiecare comanda ajunsa asa. Masurat la prima conectare: 1 comanda din 2.
 *
 * ⚠ RASPUNSUL NU E SA CITIM MESAJUL LOR, ci sa nu mai punem intrebarea. `acknowledge`
 * muta comanda din „noua" in „in procesare". Daca e DEJA dincolo de „noua", cererea
 * n-are ce sa faca — si asta se stie din `status`, care e documentat, nu din text.
 *
 * Aceeasi familie cu `isError: true` de la ei: un refuz care de fapt spune „e gata".
 */
export function seCereConfirmare(status: number | null | undefined): boolean {
  return Number(status) === STATUS_NOUA;
}

/**
 * Raspunsul lor spune ca treaba e DEJA facuta?
 *
 * ⚠ Se uita la TEXT, si stiu ca regula casei e sa nu se faca asta (vezi `errors.ts`).
 * E o plasa, nu regula: paza adevarata e `seCereConfirmare`, care se uita la `status`.
 * Asta prinde doar cursa — comanda era „noua" cand am citit-o si a fost confirmata de
 * altcineva intre timp.
 *
 * Daca ei schimba textul, plasa tace si ramane paza structurala. Degradeaza bland,
 * ceea ce e chiar conditia in care o potrivire pe text e ingaduita.
 */
export function eDejaConfirmata(mesaj: string | null | undefined): boolean {
  const t = String(mesaj ?? "").toLowerCase();
  return t.includes("already in progress") || t.includes("already been acknowledged");
}

type RezultatIngest = "noua" | "actualizata" | "sarita" | "esuata";

/**
 * O comanda eMAG, scrisa in magazin.
 *
 * ⚠ `order/acknowledge` SE CHEAMA DUPA CE COMANDA A INTRAT LA NOI, nu inainte. E
 * singurul semnal care opreste notificarile lor si trece comanda in „in procesare".
 * Dat prea devreme, o scriere locala cazuta ar fi lasat comanda confirmata la ei si
 * inexistenta la noi — iar eMAG n-ar mai fi pomenit-o niciodata. Comerciantul ar fi
 * aflat de la client.
 */
export interface OptiuniIngest {
  /**
   * Comanda vine dintr-un import de ISTORIC (§87), nu din fluxul obisnuit.
   *
   * ═══ ⚠ TREI EFECTE SE OPRESC, SI FIECARE AR FI FACUT RAU ═══
   *
   * ⚠ STOCUL. O comanda de acum trei luni si-a miscat marfa atunci. Scazuta acum,
   * catalogul ar fi ajuns pe minus in cateva secunde, iar magazinul ar fi refuzat
   * comenzi adevarate — chiar in ziua in care comerciantul tocmai a trecut la Edinio.
   *
   * ⚠ FACTURA. Comenzile vechi au fost facturate demult, in sistemul de dinainte.
   * Facturate din nou, ar fi iesit facturi duplicate cu serii noi — la ANAF, nu doar
   * pe ecran. E raul cel mai greu de desfacut din toate.
   *
   * ⚠ CONFIRMAREA. `order/acknowledge` pe o comanda finalizata acum trei luni n-are
   * niciun inteles si arde o cerere pentru fiecare rand adus.
   */
  istoric?: boolean;
}

export async function ingereazaComanda(
  admin: Db, ctx: ContextEmag, c: EmagComanda, optiuni: OptiuniIngest = {},
): Promise<RezultatIngest> {
  const istoric = optiuni.istoric === true;
  if (!Number.isFinite(c?.id)) return "sarita";

  const numar = `EMAG-${c.id}`;
  const acum = new Date().toISOString();
  const status = statusEdinio(c.status);

  const dupaEmagId = await hartaOfertelor(admin, ctx.businessId, c);
  const linii = liniiEdinio(c.products, dupaEmagId, ctx.vatRate);
  const bani = baniiComenzii(c, ctx.vatRate);
  const client = clientComenzii(c);

  const { data: existenta } = await admin.from("emag_orders")
    .select("id, order_id, acknowledged_at, last_modified")
    .eq("business_id", ctx.businessId).eq("emag_order_id", c.id).maybeSingle();

  const ex = existenta as { id: string; order_id: string | null; acknowledged_at: string | null; last_modified: string | null } | null;

  /*
   * ═══ ⚠ UN EVENIMENT MAI VECHI NU SUPRASCRIE UNUL MAI NOU ═══
   *
   * `last_modified` era citit si NICIODATA comparat. Iar comenzile ajung la noi pe
   * doua drumuri deodata — cronul si notificarea — care nu se asteapta unul pe
   * altul si nu vin in ordine.
   *
   * Scenariul care strica: clientul anuleaza comanda; notificarea aduce „anulata";
   * o clipa mai tarziu se incheie o citire de cron pornita INAINTE de anulare si
   * aduce „noua". Fara comparatie, ultima scriere castiga — comanda redevine
   * „noua" in Edinio, stocul ramane consumat, iar cineva o pregateste de expediere.
   *
   * Cu ea, evenimentul vechi se ignora linistit: nu e o eroare, e doar tarziu.
   *
   * ⚠ Se compara `>=`, nu `>`: o comanda cu ACELASI `modified` n-are ce aduce nou,
   * iar rescrisa degeaba ar reporni tranzitia si facturarea la fiecare trecere.
   */
  const venitLa = Date.parse(c.modified ?? "");
  const scrisLa = Date.parse(ex?.last_modified ?? "");
  if (ex && Number.isFinite(venitLa) && Number.isFinite(scrisLa) && venitLa < scrisLa) {
    return "sarita";
  }

  /* ── Comanda pe care o stim deja ────────────────────────────────────────── */
  if (ex?.order_id) {
    const t = await tranzitieComandaMarketplace(admin, {
      orderId: ex.order_id, businessId: ctx.businessId, status, sursa: "emag",
    });

    /*
     * ═══ ⚠ LINIILE SI BANII SE RESCRIU SI IN `orders`, NU DOAR IN `emag_orders` ═══
     *
     * `linii` si `bani` erau recalculate mai sus si apoi nefolosite pe ramura asta:
     * scrierea atingea doar `emag_orders`. `orders` se scria O SINGURA DATA, la insert.
     *
     * Iar facturarea automata citeste `orders.items` si `orders.total` — nu
     * `emag_orders`. Deci:
     *
     * O comanda intra cu `is_complete: 0` (chiar cazul pentru care exista garda din
     * `invoice-auto.actions.ts`, cu nota „liniile ei se mai pot schimba"), sau clientul
     * anuleaza ulterior o linie si eMAG trimite `products[i].status = 0`. Re-ingestul
     * improspata `emag_orders.lines`, dar `orders` ramanea cu trei produse si cu totalul
     * initial.
     *
     * Cand comanda devenea completa, garda cadea si factura pleca pe cantitatile VECHI:
     * clientul facturat pentru marfa nelivrata, iar documentul la ANAF. Fiecare pas in
     * parte reusise, deci nimic nu dadea eroare.
     *
     * ⚠ STATUSUL NU SE ATINGE de aici: el trece numai prin `tranzitieComandaMarketplace`,
     * care stie sa elibereze stocul la anulare. Un `status` pus de mana ar fi ocolit-o.
     *
     * ⚠ Nici la ISTORIC: acolo nu se factureaza si nu se consuma stoc, deci nu are ce
     * strica — dar nici n-are rost sa rescrie o comanda veche.
     */
    if (!istoric) {
      const { error: eActualizare } = await admin.from("orders").update({
        items: linii as never,
        /*
         * ═══ ⚠ TRANSPORTUL, FARA CARE NU SE POATE EMITE FACTURA (24.08.2026) ═══
         *
         * `shipping_cost` nu se scria nicaieri. Iar `oblio.actions.ts` adauga linia
         * „Transport" pe factura numai `if shipping_cost > 0`.
         *
         * Fara ea, suma liniilor nu se potriveste cu `orders.total` — 30,25 lei diferenta
         * la un plafon de 0,015 — iar reconcilierea facturii intoarce refuz. Rezultat:
         * comanda livrata, fara document fiscal la client SI fara document urcat la eMAG,
         * care il cere. Nici automat, nici de mana: amandoua trec pe aceeasi cale.
         *
         * ⚠ Se scrie CU TVA, cum il tine magazinul peste tot si cum ni-l dau si ei.
         */
        shipping_cost: bani.transport,
        subtotal: bani.subtotal,
        total: bani.total,
        vat_amount: bani.vat_amount,
        /* ⚠ Si plata: era scrisa tot o singura data, la insert. O comanda cu ramburs
           platita intre timp ar fi ramas „pending" pe veci, iar AWB-ul ar fi cerut
           banii a doua oara. */
        payment_status: c.payment_status === 1 ? "paid" : "pending",
        updated_at: acum,
      }).eq("id", ex.order_id).eq("business_id", ctx.businessId);

      if (eActualizare) {
        await logError({
          action: "emag/orders",
          message: `liniile comenzii nu s-au putut actualiza: ${eActualizare.message}`,
          details: { emagOrderId: c.id, orderId: ex.order_id },
          businessId: ctx.businessId,
          severity: "critical",
        });
        /* ⚠ Se opreste marcajul. Facturarea de mai jos ar fi plecat pe liniile vechi. */
        return "esuata";
      }
    }
    /* ⚠ Si aici se citeste `error`: vezi nota de la comanda noua. Fara `raw` proaspat,
       facturarea si AWB-ul de mai jos ar lucra pe datele vechi ale comenzii. */
    const { error: eRandEmag } = await admin.from("emag_orders").update({
      order_status: c.status,
      order_type: c.type ?? null,
      payment_mode_id: c.payment_mode_id ?? null,
      is_complete: c.is_complete ?? null,
      lines: (c.products ?? []) as never,
      vouchers: (c.vouchers ?? []) as never,
      raw: c as never,
      last_modified: c.modified ?? null,
      updated_at: acum,
    }).eq("id", ex.id);
    if (eRandEmag) {
      await logError({
        action: "emag/orders",
        message: `randul eMAG al comenzii nu s-a actualizat: ${eRandEmag.message}`,
        details: { emagOrderId: c.id, orderId: ex.order_id, code: eRandEmag.code },
        businessId: ctx.businessId,
        severity: "critical",
      });
      return "esuata";
    }

    /* ⚠ Confirmarea se incearca si acum: daca prima oara a picat, eMAG inca trimite
       notificari pentru o comanda pe care noi o avem demult.
       ⚠ Dar NU la FBE: acolo se ocupa ei de livrare, iar incercata la fiecare
       actualizare ar fi fost o cerere arsa pe veci, fiindca `acknowledged_at` n-ar fi
       ajuns niciodata sa se umple. */
    if (!ex.acknowledged_at && !onoratDeEmag(c.type) && !istoric) {
      await confirmaSiNoteaza(admin, ctx, c.id, ex.id, c.status);
    }

    /* ⚠ „definitiv" NU e o cadere: inseamna ca tranzitia n-avea ce sa faca (starea
       era deja aceea, sau nu se poate trece de acolo). Numarata drept esec, fereastra
       magazinului ar fi ramas pe loc la fiecare trecere, iar comenzile noi n-ar mai
       fi intrat niciodata — din cauza uneia care era deja in regula. */
    if (t === "reincearca") return "esuata";

    /*
     * ═══ ⚠ CONSUMUL SE REINCEARCA SI AICI, SI ASTA E TOT ROSTUL LUI ═══
     *
     * Ramura asta — „comanda pe care o stim deja" — nu chema NICIODATA consumul, desi
     * comentariul de mai jos sustinea ca-l cheama. Iar `consuma_stoc_comanda_marketplace`
     * e construita anume ca sa fie rechemata: marcajul `stoc_marketplace_la` se pune in
     * ACEEASI instructiune cu consumul, iar cat timp e `NULL` consumul se reia. Scrie in
     * chiar comentariul functiei: „greseala se repara singura".
     *
     * Fara apelul asta, un consum picat o data nu se mai repara NICIODATA: la trecerea
     * urmatoare `ex.order_id` exista, se intra pe ramura asta, se intoarce „actualizata",
     * marcajul avanseaza linistit si comanda iese din fereastra.
     *
     * Rezultatul: bucata s-a vandut pe eMAG si a plecat din depozit, dar stocul Edinio a
     * ramas neschimbat. Magazinul propriu si celelalte canale vand mai departe marfa
     * care nu mai exista — iar deriva „repara" in directia gresita, urcand inapoi la eMAG
     * stocul umflat.
     *
     * ⚠ A doua chemare nu scade de doua ori: RPC-ul intoarce `deja: true` si nu atinge
     * nimic. Trendyol si About You cheama exact aici; eMAG era singura care nu.
     */
    if (!onoratDeEmag(c.type) && !istoric) {
      const consum = await consumaStocul(admin, ctx, ex.order_id, linii);
      /* ⚠ „esuata" opreste marcajul. Altfel comanda iese din fereastra si nimeni nu mai
         incearca — chiar gaura pe care o repara blocul asta. */
      if (consum === "esuat") return "esuata";
    }

    if (!istoric) await poateFactura(admin, ctx, ex.order_id, status);
    return "actualizata";
  }

  /* ── Comanda noua ───────────────────────────────────────────────────────── */
  const { data: creata, error } = await admin.from("orders").insert({
    business_id: ctx.businessId,
    order_number: numar,
    customer_name: client.name,
    customer_phone: client.phone,
    /* ⚠ NICIODATA e-mailul lor: e un hash. Vezi `clientComenzii`. */
    customer_email: null,
    shipping_address: client.address as never,
    items: linii as never,
    /*
     * ═══ ⚠ TRANSPORTUL, FARA CARE NU SE POATE EMITE FACTURA (24.08.2026) ═══
     *
     * `shipping_cost` nu se scria nicaieri. Iar `oblio.actions.ts` adauga linia
     * „Transport" pe factura numai `if shipping_cost > 0`. Fara ea, suma liniilor nu se
     * potriveste cu `orders.total`, iar reconcilierea facturii intoarce refuz: comanda
     * livrata, fara document fiscal la client SI fara document urcat la eMAG, care il cere.
     */
    shipping_cost: bani.transport,
    subtotal: bani.subtotal,
    total: bani.total,
    vat_amount: bani.vat_amount,
    payment_method: "emag",
    /* 1 = platita la ei (card sau transfer); ramburs se incaseaza la livrare. */
    payment_status: c.payment_status === 1 ? "paid" : "pending",
    status,
    order_source: {
      marketplace: "emag",
      emag_order_id: c.id,
      /* ⚠ SE MARCHEAZA, si e singura urma ca aici NU s-a scazut stoc si NU s-a emis
         factura. Fara ea, o comanda de istoric arata identic cu una obisnuita, iar
         cine ar cauta peste un an de ce nu se potrivesc stocurile n-ar avea nimic de
         gasit. */
      ...(istoric ? { istoric: true } : {}),
      tip: c.type ?? null,
      mod_plata: c.payment_mode_id ?? null,
      livrare: c.delivery_mode ?? null,
      /*
       * ⚠ PENTRU ECRAN, NU PENTRU DECIZII. O comanda incompleta arata altfel in lista,
       * ca nimeni sa n-o pregateasca de expediere.
       *
       * Deciziile — mai ales facturarea — citesc din `emag_orders.is_complete`, care se
       * IMPROSPATEAZA la fiecare re-citire. Copia de aici se scrie o data, la intrare,
       * si poate imbatrani: o comanda devenita completa ar fi ramas marcata incompleta
       * pe veci daca cineva s-ar fi sprijinit pe ea.
       */
      completa: c.is_complete ?? null,
    } as never,
  } as never).select("id").single();

  let orderId: string;
  if (error || !creata) {
    /* Reluare dupa un ingest partial: `order_number` e unic pe magazin. */
    const { data: gasita, error: eCautare } = await admin.from("orders").select("id")
      .eq("business_id", ctx.businessId).eq("order_number", numar).maybeSingle();
    if (!gasita) {
      /*
       * ⚠ SE DEOSEBESTE „NU VA INTRA NICIODATA ASA" DE „NU STIM ACUM".
       *
       * Un refuz de date (o constrangere incalcata de ce ne trimit ei) ar ingheta
       * fereastra INTREGULUI magazin la nesfarsit, daca il tratam ca pe o pana
       * trecatoare: `ok: false` la fiecare trecere, marcajul pe loc, si nicio comanda
       * noua n-ar mai intra. Deci se strica o singura comanda, zgomotos.
       */
      const cod = error?.code ?? eCautare?.code;
      const permanent = cod === "23502" || cod === "23514" || cod === "22001" || cod === "22P02";
      await logError({
        action: "emag/orders",
        message: `comanda nu s-a putut salva si nici regasi: ${error?.message ?? eCautare?.message ?? "motiv necunoscut"}`,
        details: { emagOrderId: c.id, code: cod, permanent },
        businessId: ctx.businessId,
        severity: "critical",
      });
      return permanent ? "sarita" : "esuata";
    }
    orderId = (gasita as { id: string }).id;
  } else {
    orderId = (creata as { id: string }).id;
  }

  const { data: randEmag, error: eRandEmag } = await admin.from("emag_orders").upsert({
    business_id: ctx.businessId,
    order_id: orderId,
    emag_order_id: c.id,
    order_status: c.status,
    order_type: c.type ?? null,
    payment_mode_id: c.payment_mode_id ?? null,
    is_complete: c.is_complete ?? null,
    lines: (c.products ?? []) as never,
    vouchers: (c.vouchers ?? []) as never,
    raw: c as never,
    last_modified: c.modified ?? null,
    updated_at: acum,
  } as never, { onConflict: "business_id,emag_order_id" }).select("id").single();

  /*
   * ═══ ⚠ O COMANDA SCRISA PE JUMATATE NU E O COMANDA INTRATA (24.08.2026) ═══
   *
   * Raspunsul lui `error` nu se citea deloc. Iar cand scrierea cadea, `randEmag` ramanea
   * `null` si urmau trei lucruri, toate tacute:
   *
   *   1. `confirmaSiNoteaza` se sarea — deci NICIUN `order/acknowledge`. Comanda ramanea
   *      „noua" la eMAG si ei continuau sa notifice pentru ea.
   *   2. Comanda nu aparea in ecranul eMAG si factura nu i se urca niciodata.
   *   3. Functia intorcea „noua", deci cronul muta `orders_synced_at` PESTE ea — si
   *      comanda nu mai era recitita decat daca o modifica clientul.
   *
   * Contrast in aceeasi functie: insertul in `orders`, cu douazeci de randuri mai sus,
   * trateaza esecul cu `logError` critical SI cu deosebirea permanent/trecator. Aici,
   * nimic. Comanda exista in magazin, dar jumatate din legatura cu eMAG lipsea.
   *
   * ⚠ Se intoarce „esuata", nu „noua": marcajul sta pe loc si comanda se reia. Randul in
   * `orders` exista deja, iar reluarea il regaseste dupa `order_number` — deci nu se
   * dubleaza nimic.
   */
  if (eRandEmag || !randEmag) {
    await logError({
      action: "emag/orders",
      message: `randul eMAG al comenzii nu s-a scris: ${eRandEmag?.message ?? "raspuns gol"}`,
      details: { emagOrderId: c.id, orderId, code: eRandEmag?.code },
      businessId: ctx.businessId,
      severity: "critical",
    });
    return "esuata";
  }

  /*
   * ⚠ STOCUL NU SE CONSUMA LA FBE, si asta nu e o scutire — e o reparatie.
   *
   * `type: 2` inseamna ca marfa e DEJA la eMAG: a plecat din depozitul comerciantului
   * cand a trimis-o acolo, cu saptamani inaintea vanzarii. Scazuta din nou acum,
   * magazinul propriu ar fi ramas fara stoc pentru marfa pe care o are pe raft, si ar
   * fi refuzat comenzi adevarate.
   */
  /* ⚠ Si nu daca intra DEJA anulata: stocul scazut acum nu se mai poate elibera
     niciodata. Vezi `seConsumaLaIntrare`. */
  if (!onoratDeEmag(c.type) && !istoric && seConsumaLaIntrare(c.status)) {
    const consum = await consumaStocul(admin, ctx, orderId, linii);
    if (consum === "esuat") return "esuata";
  }

  /* ⚠ ABIA ACUM. Vezi nota din antetul functiei. ⚠ Si nu la FBE: acolo livrarea o fac
     ei, iar documentatia lor spune ca doar `type: 3` se editeaza. */
  if (!onoratDeEmag(c.type) && !istoric) {
    await confirmaSiNoteaza(admin, ctx, c.id, (randEmag as { id: string }).id, c.status);
  }

  if (!istoric) await poateFactura(admin, ctx, orderId, status);
  return "noua";
}

/**
 * Cheama facturarea automata, daca magazinul o are pornita.
 *
 * ═══ ⚠ DE CE TREBUIE CHEMATA DE AICI ═══
 *
 * `maybeAutoInvoice` se cheama din cronurile de urmarire a coletelor si din
 * actualizarile de status facute de om. Cautat in tot depozitul: din calea de ingest
 * a unui marketplace NU se cheama de nicaieri — si pana acum era corect, fiindca
 * Trendyol si About You factureaza ele clientul final.
 *
 * La eMAG, comerciantul factureaza clientul. Deci o comanda eMAG care ajunge la
 * „livrata" prin cronul nostru n-ar fi declansat NIMIC: nicio factura, la nimeni. Si
 * n-ar fi dat nicio eroare, fiindca lipsa unei chemari nu se vede.
 *
 * ⚠ Nereusita nu darama ingestul. Comanda e deja la noi; factura se reia la
 * urmatoarea schimbare de status, sau se emite de mana.
 */
async function poateFactura(admin: Db, ctx: ContextEmag, orderId: string, status: string): Promise<void> {
  try {
    const { data } = await admin.from("orders")
      .select("payment_status").eq("id", orderId).maybeSingle();
    const platit = (data as { payment_status?: string } | null)?.payment_status ?? "";
    const { maybeAutoInvoice } = await import("@/lib/actions/invoice-auto.actions");
    await maybeAutoInvoice(ctx.businessId, orderId, status, platit, admin as never);
  } catch (e) {
    void logError({
      action: "emag/orders",
      message: e instanceof Error ? e.message : "facturarea automata n-a putut fi chemata",
      details: { orderId, status },
      businessId: ctx.businessId,
      severity: "warning",
    });
  }
}

/**
 * Ofertele noastre, dupa `emag_id`, pentru liniile comenzii.
 *
 * ⚠ Se cer NUMAI id-urile din comanda, nu tot catalogul. Un magazin cu zece mii de
 * oferte ar fi citit zece mii de randuri pentru o comanda cu doua linii.
 */
async function hartaOfertelor(
  admin: Db, businessId: string, c: EmagComanda,
): Promise<Map<number, { product_id: string | null; variant_title: string | null }>> {
  /*
   * ═══ ⚠ EI TRIMIT `product_id` CA SIR, NU CA NUMAR (masurat, 24.08.2026) ═══
   *
   * In raspunsul lor: `"product_id": "433"`. Forma dinainte filtra cu
   * `Number.isFinite(x)` — care da `false` pentru un sir — deci lista iesea GOALA, iar
   * `dupaEmagId.get("433")` pe un `Map<number>` intoarce `undefined` oricum.
   *
   * ⚠ CE A COSTAT, masurat pe 2 din 2 comenzi reale: linia comenzii ramanea cu
   * `product_id: null`, deci `consuma_stoc_comanda_marketplace` n-avea ce sa scada.
   * Marfa pleca din depozit, stocul Edinio ramanea neatins, iar magazinul propriu si
   * celelalte canale vindeau mai departe ce nu mai exista.
   *
   * ⚠ SI NU SE REPARA SINGUR: `stoc_marketplace_la` se scrie oricum, deci la a doua
   * trecere RPC-ul raspunde „deja consumat". Zero randuri in `error_logs` — a tacut.
   *
   * `intregDeLaEi` e aceeasi poarta prin care trec toate numerele lor. Raspunsul lui
   * `order/read` nu e in schema, ca si cel de la oferte.
   */
  const ids = [...new Set(
    (c.products ?? []).map((l) => intregDeLaEi(l?.product_id)).filter((x): x is number => x != null),
  )];
  const harta = new Map<number, { product_id: string | null; variant_title: string | null }>();
  if (ids.length === 0) return harta;

  /*
   * ⚠ `.in()` NEFRAGMENTAT, SI E IN REGULA — dar numai fiindca s-a socotit.
   *
   * Pragul masurat e de ~650 de UUID-uri, adica vreo 24.000 de semne de adresa.
   * Aici id-urile sunt NUMERE de cel mult zece cifre, iar multimea e numarul de
   * linii DISTINCTE ale UNEI comenzi. O comanda cu 650 de produse diferite ar
   * ocupa vreo 7.000 de semne — sub prag — si oricum nu exista.
   *
   * Se scrie aici tocmai ca sa nu fie nevoie sa se socoteasca a doua oara: cine
   * vede un `.in()` fara `bucatiDeIduri` in proiectul asta are dreptate sa se
   * opreasca si sa intrebe.
   */
  const { data } = await admin.from("emag_offers")
    .select("emag_id, product_id, variant_title")
    .eq("business_id", businessId).in("emag_id", ids);

  for (const r of (data ?? []) as { emag_id: number; product_id: string | null; variant_title: string | null }[]) {
    harta.set(r.emag_id, { product_id: r.product_id, variant_title: r.variant_title });
  }
  return harta;
}

/**
 * Stocul comenzii, scazut o singura data.
 *
 * ⚠ NU SE SCADE DE MANA SI NU SE SCRIE `stoc_rezervat` DE AICI.
 * `consuma_stoc_comanda_marketplace` face amandoua in aceeasi instructiune, cu ce
 * s-a luat CU ADEVARAT. Scris aici cu ce s-a CERUT, o picare a consumului ar lasa o
 * comanda din care nu s-a scazut nimic dar care pretinde ca a consumat — iar
 * anularea ei ar ADAUGA stoc care n-a existat niciodata.
 *
 * Functia e idempotenta prin marcajul `stoc_marketplace_la`, deci se cheama linistit
 * si la o comanda pe care o stim: daca prima incercare a picat, acum se repara.
 */
async function consumaStocul(
  admin: Db, ctx: ContextEmag, orderId: string, linii: LinieEdinio[],
): Promise<"ok" | "esuat"> {
  const peProdus = new Map<string, number>();
  const peVarianta = new Map<string, { product_id: string; variant_title: string; quantity: number }>();

  for (const l of linii) {
    if (!l.product_id || l.quantity <= 0) continue;
    peProdus.set(l.product_id, (peProdus.get(l.product_id) ?? 0) + l.quantity);
    if (l.variant_title) {
      const cheie = `${l.product_id}|${l.variant_title}`;
      const ex = peVarianta.get(cheie);
      if (ex) ex.quantity += l.quantity;
      else peVarianta.set(cheie, { product_id: l.product_id, variant_title: l.variant_title, quantity: l.quantity });
    }
  }

  const { data, error } = await admin.rpc("consuma_stoc_comanda_marketplace", {
    p_order_id: orderId,
    p_business_id: ctx.businessId,
    p_produse: [...peProdus.entries()].map(([product_id, quantity]) => ({ product_id, quantity })) as never,
    p_variante: [...peVarianta.values()] as never,
  });

  const r = data as { gasit?: boolean; deja?: boolean; lipsa?: unknown[] } | null;
  if (error || r?.gasit !== true) {
    await logError({
      action: "emag/orders",
      message: error?.message ?? "consumul de stoc n-a raspuns valid",
      details: { orderId, raspuns: r },
      businessId: ctx.businessId,
      severity: "critical",
    });
    return "esuat";
  }
  if (!r.deja && Array.isArray(r.lipsa) && r.lipsa.length > 0) {
    await logError({
      action: "emag/orders",
      message: "Comanda eMAG a cerut mai mult stoc decat exista; s-a scazut cat s-a putut.",
      details: { orderId, lipsa: r.lipsa },
      businessId: ctx.businessId,
      severity: "warning",
    });
  }
  return "ok";
}

/**
 * Confirmarea catre eMAG, si urma ei la noi.
 *
 * ⚠ `order/acknowledge` e SINGURA cale prin care o comanda trece din „noua" in „in
 * procesare" si prin care se opresc notificarile lor. Nechemata, comerciantul
 * primeste alerte la nesfarsit pentru comenzi pe care le are demult — si le ignora,
 * iar apoi o rateaza pe una adevarata.
 *
 * ⚠ Nereusita NU darama ingestul: comanda e deja la noi, iar confirmarea se
 * reincearca la trecerea urmatoare, fiindca `acknowledged_at` a ramas gol.
 */
async function confirmaSiNoteaza(
  admin: Db, ctx: ContextEmag, emagOrderId: number, randId: string, status: number | null | undefined,
): Promise<void> {
  const noteaza = () => admin.from("emag_orders")
    .update({ acknowledged_at: new Date().toISOString() }).eq("id", randId);

  /*
   * ⚠ NU SE CHEAMA DELOC pentru o comanda care a trecut deja de „noua". Vezi
   * `seCereConfirmare`: cererea n-ar avea ce sa faca, iar refuzul ei ar fi tinut
   * `acknowledged_at` gol si ar fi pus reincercarea la fiecare actualizare, pe veci.
   *
   * Se NOTEAZA totusi: scopul confirmarii — comanda sa fie in procesare la ei — e
   * deja atins. Lasat gol, am fi reintrat in aceeasi bucla pe alt drum.
   */
  if (!seCereConfirmare(status)) {
    await noteaza();
    return;
  }

  const r = await confirmaComanda(ctx.auth, emagOrderId);
  if (isEmagError(r)) {
    /* Plasa pentru cursa: era „noua" cand am citit-o, a confirmat-o altcineva intre
       timp. Nu e un esec — e acelasi rezultat, obtinut de altul. */
    if (eDejaConfirmata(r.error) || eDejaConfirmata((r.mesaje ?? []).join(" "))) {
      await noteaza();
      return;
    }
    await logError({
      action: "emag/orders",
      message: `confirmarea comenzii a esuat: ${r.error}`,
      details: { emagOrderId, status },
      businessId: ctx.businessId,
      severity: "warning",
    });
    return;
  }
  await noteaza();
}
