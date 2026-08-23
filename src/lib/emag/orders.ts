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
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";
import { citesteComenzi, confirmaComanda, isEmagError } from "./client";
import type { ContextEmag } from "./sync";
import type { EmagComanda, EmagImpartireVoucher, EmagLinieComanda } from "./types";

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
  if (statusEmag === 5) return "returned";
  if (statusEmag === 4) return "delivered";
  if (statusEmag === 3) return "shipped";
  if (statusEmag === 2) return "processing";
  return "pending";
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
export function baniiComenzii(c: EmagComanda, cotaProcente: number): BaniiComenzii {
  const cota = Number.isFinite(cotaProcente) ? cotaProcente : 0;
  const cuTva = (net: number) => net * (1 + cota / 100);

  let netProduse = 0;
  let voucherFara = 0, voucherTva = 0;

  for (const l of c.products ?? []) {
    if (l?.status === 0) continue; /* linie stornata */
    netProduse += nr(l?.sale_price) * nr(l?.quantity);
    const v = valoareVouchere(l?.product_voucher_split);
    voucherFara += v.fara;
    voucherTva += v.tva;
  }

  const netLivrare = nr(c.shipping_tax);
  const vLivrare = valoareVouchere(c.shipping_tax_voucher_split);
  voucherFara += vLivrare.fara;
  voucherTva += vLivrare.tva;

  /* Vouchere la nivel de comanda. ⚠ `sale_price` si `sale_price_vat` sunt NEGATIVE. */
  for (const v of c.vouchers ?? []) {
    voucherFara += nr(v?.sale_price);
    voucherTva += nr(v?.sale_price_vat);
  }

  const net = netProduse + netLivrare + voucherFara;
  const brut = cuTva(netProduse + netLivrare) + voucherFara + voucherTva;

  return {
    subtotal: douaZecimale(net),
    vat_amount: douaZecimale(brut - net),
    total: douaZecimale(brut),
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
    const legat = l.product_id != null ? dupaEmagId.get(l.product_id) : undefined;
    out.push({
      product_id: legat?.product_id ?? null,
      variant_title: legat?.variant_title ?? null,
      name: (l.name ?? "").trim() || `Produs eMAG ${l.product_id ?? "?"}`,
      quantity: nr(l.quantity),
      /* ⚠ Pretul liniei se scrie CU TVA: asa il tine magazinul peste tot. */
      price: douaZecimale(nr(l.sale_price) * (1 + cota / 100)),
      emag_product_id: l.product_id ?? null,
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

  for (let pagina = 1; pagina <= PAGINI_PE_TRECERE; pagina++) {
    const raspuns = await citesteComenzi(ctx.auth, {
      modifiedAfter: iso(deLa),
      currentPage: pagina,
      itemsPerPage: PE_PAGINA,
    });
    if (isEmagError(raspuns)) {
      /* ⚠ `ok: false`: nu s-a citit tot, deci marcajul NU are voie sa avanseze. */
      r.ok = false;
      return r;
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

    if (comenzi.length < PE_PAGINA) return r;
    if (pagina === PAGINI_PE_TRECERE) {
      /* Mai sunt pagini, dar trecerea s-a terminat. ⚠ Nu e o reusita deplina. */
      r.ok = false;
    }
  }

  return r;
}

function iso(d: Date): string {
  /* eMAG cere `Y-m-d H:i:s`, nu ISO cu `T` si `Z`. */
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/* ═══════════════════════════════════════════════════════════════════════════
   O COMANDA
   ═══════════════════════════════════════════════════════════════════════════ */

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
export async function ingereazaComanda(
  admin: Db, ctx: ContextEmag, c: EmagComanda,
): Promise<RezultatIngest> {
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
    await admin.from("emag_orders").update({
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

    /* ⚠ Confirmarea se incearca si acum: daca prima oara a picat, eMAG inca trimite
       notificari pentru o comanda pe care noi o avem demult. */
    if (!ex.acknowledged_at) await confirmaSiNoteaza(admin, ctx, c.id, ex.id);

    /* ⚠ „definitiv" NU e o cadere: inseamna ca tranzitia n-avea ce sa faca (starea
       era deja aceea, sau nu se poate trece de acolo). Numarata drept esec, fereastra
       magazinului ar fi ramas pe loc la fiecare trecere, iar comenzile noi n-ar mai
       fi intrat niciodata — din cauza uneia care era deja in regula. */
    if (t === "reincearca") return "esuata";
    await poateFactura(admin, ctx, ex.order_id, status);
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
      tip: c.type ?? null,
      mod_plata: c.payment_mode_id ?? null,
      livrare: c.delivery_mode ?? null,
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

  const { data: randEmag } = await admin.from("emag_orders").upsert({
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

  const consum = await consumaStocul(admin, ctx, orderId, linii);
  if (consum === "esuat") return "esuata";

  /* ⚠ ABIA ACUM. Vezi nota din antetul functiei. */
  if (randEmag) await confirmaSiNoteaza(admin, ctx, c.id, (randEmag as { id: string }).id);

  await poateFactura(admin, ctx, orderId, status);
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
  const ids = [...new Set((c.products ?? []).map((l) => l?.product_id).filter((x): x is number => Number.isFinite(x)))];
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
async function confirmaSiNoteaza(admin: Db, ctx: ContextEmag, emagOrderId: number, randId: string): Promise<void> {
  const r = await confirmaComanda(ctx.auth, emagOrderId);
  if (isEmagError(r)) {
    await logError({
      action: "emag/orders",
      message: `confirmarea comenzii a esuat: ${r.error}`,
      details: { emagOrderId },
      businessId: ctx.businessId,
      severity: "warning",
    });
    return;
  }
  await admin.from("emag_orders").update({ acknowledged_at: new Date().toISOString() }).eq("id", randId);
}
