"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database.types";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { clientFacturare, eSistem, type SistemClient } from "@/lib/invoicing-context";
import { logError } from "@/lib/error-logger";
import { verificaLegaturaDocumentului } from "@/lib/invoicing-legatura";
import { cheieOperatie, cuRegistru } from "@/lib/operatii/registru";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import { cheieDocument, slotFacturare } from "@/lib/billing/refacturare";
import { fetchSkuMap } from "@/lib/billing/sku-map";
import { baniiAuIntrat } from "@/lib/billing/incasare";
import { AUTO_INVOICE_TRIGGERS, autoInvoiceTriggerMatches, type AutoInvoiceTrigger } from "@/lib/invoicing";
import { isCardPaymentMethod, PAYMENT_METHOD_DEFAULT_LABELS, type PaymentMethodType } from "@/lib/payment-methods";
import { MESAJ_PROCESATA_IN_EASYSALES, procesataInEasySales } from "@/lib/orders/origin";
import { avertismentTva, easybillGata, legaturaAnafValida, SECRETE_EASYBILL, type EasybillConfig } from "@/lib/easybill/config";
import {
  cautaFacturi, citesteDupaEmitere, citesteFactura, emiteFactura, inregistreazaIncasarea, stareaFacturii, testeazaConexiunea,
  type AcreditariEasybill, type FacturaCitita,
} from "@/lib/easybill/client";
import {
  documentulCautat, intervaleDeCautare, potrivesteDocumentul, stornareaMaiTine, verificaStornarea,
} from "@/lib/easybill/stornare";
import {
  compuneFactura, dataFacturii, zileDeCautat, type ComandaDeFacturat, type FacturaCompusa,
} from "@/lib/easybill/document";
import { acreditari, configurareaMagazinului } from "@/lib/easybill/server";
import { sagaPermiteReemiterea } from "@/lib/saga/server";

/*
 * easybill.ro: emiterea facturii, incasarea si configurarea. Fisa integrarii:
 * `docs/facturare/EASYBILL.md`.
 *
 * ⚠ „use server”: FIECARE export de aici e un capat public. Se exporta doar actiunile; fiecare isi
 * dovedeste singura proprietarul (sau primeste clientul de sistem, care nu se poate fabrica dintr-o
 * cerere de browser, vezi `invoicing-context.ts`).
 *
 * ⚠ STORNAREA NU E AICI, dinadins: API-ul lor nu are o stornare (documentatia n-o pomeneste; in
 * easybill ea se face din pagina facturii, „Acțiuni factură”, „Stornare factură”, cantitativa sau
 * valorica, legata de factura originala). O factura cu minus facuta de noi prin `createInvoice_fct`
 * ar fi un document nelegat de original, pe un drum pe care nimeni nu l-a vazut mergand. Vezi fisa.
 * Omul storneaza in easybill, apoi o INREGISTREAZA aici (`inregistreazaStornareaEasybill`): seria si
 * numarul se cauta si se verifica la ei, nimic pe incredere.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   AJUTOARE (neexportate)
   ═══════════════════════════════════════════════════════════════════════════ */

async function proprietar(businessId: string): Promise<{ ok: true } | { error: string }> {
  if (!businessId) return { error: "Magazin negăsit." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat." };
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).maybeSingle();
  if (!biz) return { error: "Magazin negăsit." };
  return { ok: true };
}

/** Coloanele comenzii de care are nevoie facturarea. Numite, nu `*`. */
const COLOANE_COMANDA = [
  "id", "business_id", "order_number", "customer_name", "customer_phone", "billing_company",
  "shipping_address", "items", "shipping_cost", "discount_amount", "discount_code",
  "card_discount_amount", "cod_discount_amount", "cod_fee_amount", "total", "vat_rate", "vat_amount",
  "prices_include_vat", "payment_status", "payment_method", "order_source",
  "easybill_invoice_key", "easybill_invoice_series", "easybill_invoice_number",
  "easybill_storno_key", "easybill_storno_series", "easybill_storno_number",
].join(", ");

type RandComanda = ComandaDeFacturat & {
  id: string;
  payment_method?: string | null;
  order_source?: unknown;
  easybill_invoice_key: string | null;
  easybill_invoice_series: string | null;
  easybill_invoice_number: string | null;
  easybill_storno_key: string | null;
  easybill_storno_series: string | null;
  easybill_storno_number: string | null;
};

type Context = {
  supabase: Awaited<ReturnType<typeof clientFacturare>>;
  config: EasybillConfig;
  a: AcreditariEasybill;
  comanda: RandComanda;
  magazin: { vat_enabled: boolean; vat_rate: number; prices_include_vat: boolean };
};

/**
 * Configurarea, comanda si TVA-ul magazinului.
 *
 * ⚠ Configurarea se citeste cu cheia de SERVICIU (`configurareaMagazinului`), DUPA garda de
 * proprietate. Pe clientul comerciantului parola ar fi sosit `enc.v1.…`. Comanda si TVA-ul NU sunt
 * secrete si raman pe clientul apelantului: pe calea manuala, RLS-ul comerciantului e inca o paza.
 */
async function context(businessId: string, orderId: string, sistem?: SistemClient): Promise<Context | { error: string }> {
  const supabase = await clientFacturare(sistem);
  if (!eSistem(sistem)) {
    const p = await proprietar(businessId);
    if ("error" in p) return p;
  }
  const [config, { data: setari, error: eSetari }, { data: comanda, error: eComanda }] = await Promise.all([
    configurareaMagazinului(createAdminClient(), businessId),
    supabase.from("store_settings").select("vat_enabled, vat_rate, prices_include_vat").eq("business_id", businessId).maybeSingle(),
    supabase.from("orders").select(COLOANE_COMANDA).eq("id", orderId).eq("business_id", businessId).maybeSingle(),
  ]);
  if (eComanda) return { error: "Comanda nu s-a putut citi. Încearcă din nou." };
  if (!comanda) return { error: "Comanda negăsită." };
  if (!config) return { error: "easybill nu este configurat complet." };
  /* ⚠ SETARILE DE TVA PICATE NU DEVIN „FARA TVA”: cu `vat_enabled` cazut pe fals, factura fiscala ar fi
     plecat cu toate liniile pe 0%. Fara ele nu se compune nimic. */
  if (eSetari || !setari) return { error: "Setările de TVA ale magazinului nu s-au putut citi, deci nu emitem factura. Încearcă din nou." };
  const s = setari as { vat_enabled?: boolean; vat_rate?: number; prices_include_vat?: boolean };
  return {
    supabase,
    config,
    a: acreditari(config),
    comanda: comanda as unknown as RandComanda,
    magazin: {
      vat_enabled: s.vat_enabled ?? false,
      vat_rate: Number(s.vat_rate ?? 21) || 0,
      prices_include_vat: s.prices_include_vat ?? true,
    },
  };
}

/** „EBF 955”, sau id-ul cat timp numarul nu s-a citit. Pentru mesaje si pentru mentiunile de pe document. */
function eticheta(serie: string | null | undefined, numar: string | null | undefined, cheie: string | null | undefined): string | null {
  const n = [serie, numar].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
  if (n) return n;
  return cheie ? `(id ${cheie})` : null;
}

/** Comanda e in lei? easybill primeste de aici doar facturi in lei. */
function monedaStraina(orderSource: unknown): string | null {
  const src = (orderSource ?? null) as { currency?: string; moneda_necitita?: boolean } | null;
  if (src?.moneda_necitita === true) return "necunoscuta";
  const m = (src?.currency ?? "").trim().toUpperCase();
  return m && m !== "RON" ? m : null;
}

/**
 * Ce a ramas de la incercarile de dinainte sub cheia asta (fiecare reluare are randul ei, cu aceeasi
 * cheie):
 *   - `ramasa`: id-ul facturii ramase, de pe cel mai NOU rand cu `referinta_externa` (o eroare de dupa
 *     crearea facturii il pune acolo, iar deblocarea il pastreaza). Drumul obisnuit: citire dupa id.
 *   - `zile`: fereastra plasei (cautarea dupa marcaj), de la ziua primei incercari minus una pana azi;
 *     `null` daca e prea veche (`zileDeCautat`): atunci refuz, nu creare.
 *
 * ⚠ O CITIRE PICATA A REGISTRULUI E REFUZ. Fara ea nu stim nici id-ul ramas, nici de cand cautam; a
 * merge mai departe pe ghicite ar fi exact drumul catre a doua factura.
 */
async function urmaInRegistru(
  cheie: string,
  businessId: string,
): Promise<{ reluare: boolean; ramasa: string | null; zile: string[] | null } | { error: string }> {
  const { data, error } = await createAdminClient()
    .from("operatii_externe")
    .select("creat_la, referinta_externa")
    .eq("business_id", businessId)
    .eq("cheie", cheie)
    .order("creat_la", { ascending: true })
    .limit(200);
  if (error) return { error: "Registrul de operații nu s-a putut citi, deci nu știm dacă o încercare de dinainte a lăsat o factură în easybill. Încearcă din nou peste un minut." };
  const randuri = (data ?? []) as { creat_la?: string | null; referinta_externa?: string | null }[];
  if (randuri.length === 0) return { reluare: false, ramasa: null, zile: [] };
  const cuReferinta = [...randuri].reverse().find((r) => (r.referinta_externa ?? "").trim());
  return {
    reluare: true,
    ramasa: cuReferinta?.referinta_externa?.trim() || null,
    zile: zileDeCautat(new Date(), randuri[0].creat_la ?? null),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIGURAREA
   ═══════════════════════════════════════════════════════════════════════════ */

const PLAFON_TEXT = 200;
const text = (v: unknown, max = PLAFON_TEXT) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Salveaza si ACTIVEAZA integrarea (`enabled: true`), dupa o proba de conexiune facuta pe server.
 *
 * ⚠ PROBA E PARTE DIN SALVARE. Daca easybill raspunde NU (utilizator sau parola gresite), nu se
 * salveaza: o integrare „activa” care refuza fiecare factura ar fi aflata la prima comanda. Daca
 * easybill nu raspunde deloc, se salveaza cu avertisment.
 *
 * ⚠ Denumirea firmei, CUI-ul si legatura ANAF vin din RASPUNSUL easybill, nu din formular.
 */
export async function saveEasybillConfig(
  businessId: string,
  input: EasybillConfig,
): Promise<{ success: true; avertisment?: string; anafUrl?: string } | { error: string }> {
  const p = await proprietar(businessId);
  if ("error" in p) return p;

  const trigger = AUTO_INVOICE_TRIGGERS.some((t) => t.value === input.auto_invoice_trigger)
    ? (input.auto_invoice_trigger as AutoInvoiceTrigger)
    : "confirmed";
  const curat: EasybillConfig = {
    enabled: true,
    username: text(input.username),
    /* ⚠ Parola NU se taie la spatii: poate incepe sau se poate termina cu unul. */
    password: typeof input.password === "string" ? input.password.slice(0, 500) : "",
    serie: text(input.serie, 40),
    due_days: Math.min(365, Math.max(0, Math.floor(Number(input.due_days) || 0))),
    auto_invoice: input.auto_invoice === true,
    auto_invoice_trigger: trigger,
    mark_paid_online: input.mark_paid_online === true,
  };

  /* Secretele venite GOALE (formularul le primeste mascate) isi pastreaza valoarea salvata.
     ⚠ Configurarea veche se citeste cu cheia de serviciu: pe clientul comerciantului ar fi
     sosit `enc.v1.…`, iar `pastreazaSecretele` le-ar fi „pastrat” asa. */
  const { data: vechi, error: eVechi } = await createAdminClient()
    .from("store_settings").select("easybill_config, vat_enabled").eq("business_id", businessId).maybeSingle();
  if (eVechi) return { error: "Setările de acum nu s-au putut citi. Încearcă din nou." };
  const final = pastreazaSecretele("easybill_config", curat, vechi?.easybill_config) as EasybillConfig;
  const veche = (vechi?.easybill_config ?? null) as Partial<EasybillConfig> | null;
  /* Plasa: parola se pastreaza chiar daca lista comuna de secrete n-ar sti inca de easybill. */
  for (const camp of SECRETE_EASYBILL) {
    if (!final[camp] && typeof veche?.[camp] === "string") final[camp] = veche[camp] as string;
  }

  if (!final.username) return { error: "Completează utilizatorul API easybill." };
  if (!final.password) return { error: "Completează parola utilizatorului API easybill." };

  const proba = await testeazaConexiunea(acreditari(final));
  if (!proba.ok && proba.refuz) return { error: proba.error };

  if (proba.ok) {
    final.firma_nume = text(proba.firma.nume);
    final.firma_cui = text(proba.firma.cui, 40);
    final.anaf_url = proba.firma.anafUrl ?? "";
  } else if (text(veche?.username) === final.username) {
    /* Acelasi cont, dar easybill n-a raspuns acum: raman cele stiute. Alt cont: nu se stie nimic. */
    const urlVechi = veche?.anaf_url;
    final.firma_nume = text(veche?.firma_nume);
    final.firma_cui = text(veche?.firma_cui, 40);
    final.anaf_url = legaturaAnafValida(urlVechi) ? urlVechi : "";
  }

  const supabase = await createClient();
  const { error } = await supabase.from("store_settings").update({
    easybill_config: final as unknown as Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);
  if (error) return { error: "Setările nu s-au putut salva. Încearcă din nou." };

  const avertismente: string[] = [];
  if (!proba.ok) avertismente.push(`Setările s-au salvat, dar acum nu am putut verifica legătura cu easybill: ${proba.error}`);
  if (proba.ok) {
    /* In AMBELE sensuri: si contul platitor peste un magazin fara TVA (facturi cu 0%, fara semn). */
    const tva = avertismentTva(proba.firma.faraTva, (vechi as { vat_enabled?: boolean | null } | null)?.vat_enabled);
    if (tva) avertismente.push(tva);
  }
  return {
    success: true,
    ...(avertismente.length ? { avertisment: avertismente.join(" ") } : {}),
    ...(final.anaf_url ? { anafUrl: final.anaf_url } : {}),
  };
}

/**
 * „Testează conexiunea”, fara sa scrie nimic.
 *
 * Parola vine din formular cand a fost tastata (asa se probeaza una NOUA inainte de salvare) si din
 * baza cand vine goala (formularul o primeste mascata). Garda de proprietate e PRIMA: abia dupa ea
 * se ia in seama ce a venit din formular.
 */
export async function testEasybillConfig(
  businessId: string,
  input: Pick<EasybillConfig, "username" | "password">,
): Promise<{ ok: true; firma: string; cui: string; anafUrl?: string } | { error: string }> {
  const p = await proprietar(businessId);
  if ("error" in p) return p;
  const username = text(input.username);
  if (!username) return { error: "Completează utilizatorul API easybill." };

  /* ⚠ Parola nu se taie la spatii, nici cea tastata, nici cea salvata (ca la salvare). */
  let password = typeof input.password === "string" ? input.password.slice(0, 500) : "";
  if (!password) {
    const { data: salvat, error: eSalvat } = await createAdminClient()
      .from("store_settings").select("easybill_config").eq("business_id", businessId).maybeSingle();
    if (eSalvat) return { error: "Parola salvată nu s-a putut citi. Încearcă din nou." };
    const c = (salvat?.easybill_config ?? null) as { password?: unknown } | null;
    password = typeof c?.password === "string" ? c.password : "";
  }
  if (!password) return { error: "Completează parola utilizatorului API easybill." };

  const r = await testeazaConexiunea({ username, password });
  if (!r.ok) return { error: r.error };
  return {
    ok: true,
    firma: r.firma.nume,
    cui: r.firma.cui,
    ...(r.firma.anafUrl ? { anafUrl: r.firma.anafUrl } : {}),
  };
}

export async function disconnectEasybill(businessId: string): Promise<{ success: true } | { error: string }> {
  const p = await proprietar(businessId);
  if ("error" in p) return p;
  const supabase = await createClient();
  const { error } = await supabase.from("store_settings").update({
    easybill_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);
  if (error) return { error: "Deconectarea nu s-a putut salva. Încearcă din nou." };
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════════════════════
   FACTURA
   ═══════════════════════════════════════════════════════════════════════════ */

export type RezultatEasybill = {
  /** Gol cat timp numarul nu s-a citit inca. */
  number: string;
  series: string;
  /** Ce trebuie sa afle omul desi documentul s-a emis: totalul diferit, ciorna, incasarea. */
  avertisment?: string;
};

/**
 * Emite factura comenzii.
 *
 * Pasii, in ordine: garzile (easySales, moneda, slotul), compunerea si reconcilierea totalului,
 * emiterea sub registru (clientul, factura goala, liniile una cate una, cu citirea inapoi), scrierea
 * pe comanda, verificarea totalului documentului, si la final, daca e cerut, incasarea.
 *
 * ⚠ O SINGURA CHEIE DE REGISTRU PENTRU TOT SIRUL: un pas picat la mijloc blocheaza toata emiterea
 * (cu id-ul facturii in mesaj), nu doar pasul. Iar reluarea, dupa deblocare, cauta intai factura
 * ramasa si o completeaza, in loc sa creeze alta.
 */
export async function generateEasybillInvoice(
  businessId: string,
  orderId: string,
  sistem?: SistemClient,
): Promise<RezultatEasybill | { error: string }> {
  return emiteFacturaComenzii(businessId, orderId, sistem, TERMEN_MANUAL_MS);
}

/**
 * Cat are, cel mult, o emitere, de la prima citire pana la ultima linie.
 *
 * ⚠ CALEA AUTOMATA E MAI SCURTA: `maybeAutoGenerateInvoice` e chemata si din cronuri cu
 * `maxDuration` 60; o functie taiata la mijlocul liniilor n-ar mai apuca sa scrie id-ul facturii pe
 * registru. Cu termenul, emiterea refuza dinainte (n-ar ajunge) sau se opreste curat intre linii.
 */
const TERMEN_MANUAL_MS = 240_000;
const TERMEN_AUTOMAT_MS = 40_000;

async function emiteFacturaComenzii(
  businessId: string,
  orderId: string,
  sistem: SistemClient,
  durataMs: number,
): Promise<RezultatEasybill | { error: string }> {
  const termen = Date.now() + durataMs;
  const ctx = await context(businessId, orderId, sistem);
  if ("error" in ctx) return ctx;
  const { supabase, config, a, comanda, magazin } = ctx;

  /* easySales: comanda stampilata „procesata in easySales” isi primeste factura ACOLO. */
  if (procesataInEasySales(comanda.order_source)) return { error: MESAJ_PROCESATA_IN_EASYSALES };

  /* ⚠ Nu se factureaza in lei o comanda care n-a fost in lei: un document fiscal gresit nu se
     retrage, se storneaza. Aceeasi regula ca in dispecerul automat, pusa si pe calea manuala. */
  const moneda = monedaStraina(comanda.order_source);
  if (moneda) {
    return {
      error: moneda === "necunoscuta"
        ? "Moneda comenzii nu s-a putut citi, iar easybill primește de aici doar facturi în lei. Emite factura din contul easybill."
        : `Comanda e în ${moneda}, iar easybill primește de aici doar facturi în lei. Emite factura din contul easybill, în moneda comenzii.`,
    };
  }

  /*
   * Slotul: o factura FARA storno il tine ocupat; dupa storno comanda e din nou facturabila.
   * ⚠ DOUA chemari, cu acelasi inteles: una pe CHEI (stabile, pentru cheia registrului si pentru
   * garda) si una pe ETICHETE (seria si numarul, pentru mesaje si pentru mentiunea de pe document).
   */
  const slotCheie = slotFacturare({
    casa: "easybill", factura: comanda.easybill_invoice_key, storno: comanda.easybill_storno_key,
  });
  const slot = slotFacturare({
    casa: "easybill",
    factura: comanda.easybill_invoice_key
      ? eticheta(comanda.easybill_invoice_series, comanda.easybill_invoice_number, comanda.easybill_invoice_key)
      : null,
    storno: comanda.easybill_storno_key
      ? eticheta(comanda.easybill_storno_series, comanda.easybill_storno_number, comanda.easybill_storno_key)
      : null,
  });
  if (!slotCheie.poateEmite || !slot.poateEmite) {
    /* ⚠ Nu mesajul comun („storneaz-o intai din sectiunea de facturare”): la easybill stornarea nu
       exista in Edinio, deci omul ar fi cautat un buton care nu e. */
    const et = eticheta(comanda.easybill_invoice_series, comanda.easybill_invoice_number, comanda.easybill_invoice_key) ?? "";
    return {
      error: `Comanda are deja factura easybill ${et}. Dacă trebuie refăcută, storneaz-o din easybill (din pagina facturii: Acțiuni factură, Stornare factură) și emite factura nouă tot de acolo: API-ul easybill nu are stornare.`,
    };
  }

  /*
   * ⚠ REFACTURAREA SE SPRIJINA PE STORNARE: inaintea registrului se intreaba easybill daca ea mai tine.
   * Anulata, negasita sau ciorna inseamna ca factura veche e (din nou) vie, iar o a doua peste ea ar fi
   * factura dubla.
   */
  if (slotCheie.poateEmite && slotCheie.inlocuieste) {
    const cheieStorno = slotCheie.inlocuieste.storno;
    let storno: FacturaCitita | null;
    try {
      storno = await citesteFactura(a, cheieStorno);
    } catch (e) {
      return { error: `Stornarea facturii nu s-a putut verifica la easybill (${e instanceof Error ? e.message : "fără răspuns"}). Nu emitem factura nouă până nu știm că stornarea ține. Încearcă din nou.` };
    }
    const motiv = stornareaMaiTine(storno, {
      storno: eticheta(comanda.easybill_storno_series, comanda.easybill_storno_number, cheieStorno) ?? cheieStorno,
      factura: eticheta(comanda.easybill_invoice_series, comanda.easybill_invoice_number, comanda.easybill_invoice_key) ?? "",
    });
    if (motiv) return { error: motiv };
    /* ⚠ SI CONTABILITATEA: daca factura veche a plecat deja in SAGA, reemiterea trebuie sa treaca si pe
       la regula lor (o scrie exportul SAGA). Dupa verificarea stornarii, inaintea registrului. */
    const saga = await sagaPermiteReemiterea(createAdminClient(), businessId, orderId);
    if (!saga.ok) return { error: saga.mesaj };
  }

  const cheieRegistru = cheieOperatie("factura", "easybill", cheieDocument(orderId, slotCheie));

  const skus = await fetchSkuMap(supabase, businessId, (Array.isArray(comanda.items) ? comanda.items : []) as { product_id?: string | null }[], (m) =>
    logError({ action: "billing.skuMap", message: m.message, details: { ...m.details, casa: "easybill" }, severity: "warning" }));

  const compusa = compuneFactura({
    comanda,
    magazin,
    skus,
    config,
    slot,
    etichetaPlata: PAYMENT_METHOD_DEFAULT_LABELS[comanda.payment_method as PaymentMethodType] ?? (comanda.payment_method ?? ""),
    cheieRegistru,
    acum: new Date(),
  });
  if ("error" in compusa) return compusa;

  const admin = createAdminClient();
  const urma = await urmaInRegistru(cheieRegistru, businessId);
  if ("error" in urma) return urma;
  const r = await cuRegistru(
    admin,
    { businessId, orderId, fel: "factura", furnizor: "easybill", cheie: cheieRegistru },
    async () => {
      const emisa = await emiteFactura(a, compusa, { ...urma, termen });
      /* Documentul EXISTA de aici incolo. Citirea nu arunca (vezi `citesteDupaEmitere`). */
      const citita = await citesteDupaEmitere(a, emisa.cheie);
      return {
        referinta: emisa.cheie,
        detalii: {
          serie: citita?.serie ?? null, numar: citita?.numar ?? null, total: citita?.total ?? null,
          stare: citita?.stare ?? null, marcaj: compusa.marcaj, reluata: emisa.reluata,
          /* Data scrisa pe document: SAGA o prefera fata de `creat_la` (o factura ramasa si completata
             a doua zi poarta data ei, nu pe a completarii). */
          data: citita?.data || emisa.data || null,
        },
        valoare: { cheie: emisa.cheie, citita, reluata: emisa.reluata },
      };
    },
    verdictFurnizor,
  );
  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

  let cheie: string;
  let citita: FacturaCitita | null;
  let reluata = false;
  if (r.fel === "facut") {
    ({ cheie, citita, reluata } = r.valoare);
  } else {
    /* `deja`: s-a emis la o apasare de dinainte. Se adopta, si numarul se citeste daca lipsea. */
    cheie = r.referinta ?? "";
    if (!cheie) return { error: "Registrul are factura ca emisă, dar fără id. Verifică în contul easybill și deblochează operația din pagina comenzii." };
    citita = await citesteDupaEmitere(a, cheie);
  }

  /* ⚠ Numarul se scrie doar pentru o factura VIE: unul de ciorna (provizoriu) sau de anulata ar fi facut
     comanda „complet facturata” pentru contul cumparatorului si pentru urcarea la marketplace. */
  const vie = citita && stareaFacturii(citita) === "vie" ? citita : null;
  const { data: randuri, error: eScriere } = await supabase.from("orders").update({
    easybill_invoice_key: cheie,
    easybill_invoice_series: vie?.serie || null,
    easybill_invoice_number: vie?.numar || null,
    /* Stornarea se sterge odata cu factura pe care o desfiintase: altfel a doua stornare ar fi
       blocata de propria garda, iar ecranul ar arata factura NOUA drept stornata. */
    easybill_storno_key: null,
    easybill_storno_series: null,
    easybill_storno_number: null,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");
  await verificaLegaturaDocumentului({
    actiune: "easybill.factura", document: eticheta(citita?.serie, citita?.numar, cheie) ?? cheie,
    orderId, businessId, eroare: eScriere, randuri,
  });

  if (slot.poateEmite && slot.inlocuieste) {
    await logError({
      action: "easybill.refacturareDupaStorno",
      message: `Comanda ${comanda.order_number}: factura ${eticheta(citita?.serie, citita?.numar, cheie)} inlocuieste ${slot.inlocuieste.factura ?? "?"}, stornata prin ${slot.inlocuieste.storno}`,
      details: { orderId, ...slot.inlocuieste },
      businessId,
      severity: "info",
    });
  }

  const avertismente = await avertismenteDupaEmitere({ businessId, orderId, cheie, citita, compusa, reluata });

  const incasare = await incaseazaDacaECazul({ businessId, orderId, config, a, comanda, cheie, citita, compusa });
  if (incasare) avertismente.push(incasare);

  return {
    number: citita?.numar ?? "",
    series: citita?.serie ?? "",
    ...(avertismente.length ? { avertisment: avertismente.join(" ") } : {}),
  };
}

/**
 * Ce trebuie spus desi documentul s-a emis: numarul necitit, ciorna, factura anulata, totalul diferit.
 *
 * ⚠ VERIFICAREA DE DUPA. Liniile au fost reconciliate inainte de emitere si verificate una cate una,
 * dar documentatia lor nu spune cum isi refac totalurile; daca easybill socoteste altfel, aici se
 * vede. Documentul s-a emis: nu se ascunde, se spune.
 */
async function avertismenteDupaEmitere(p: {
  businessId: string;
  orderId: string;
  cheie: string;
  citita: FacturaCitita | null;
  compusa: FacturaCompusa;
  reluata: boolean;
}): Promise<string[]> {
  const { citita, cheie, compusa } = p;
  const avertismente: string[] = [];
  if (p.reluata) {
    avertismente.push("Am găsit în easybill factura începută la o încercare anterioară și am completat-o, în loc să emitem alta.");
  }
  if (!citita) {
    avertismente.push("Factura s-a emis în easybill, dar numărul ei nu s-a putut citi încă. Apasă „Citește numărul” în cardul Facturare.");
    return avertismente;
  }
  const et = eticheta(citita.serie, citita.numar, cheie);
  const stare = stareaFacturii(citita);
  if (stare === "anulata") {
    avertismente.push(`Factura ${et} apare anulată în easybill. Verifică documentul în easybill.`);
  }
  if (stare === "ciorna") {
    /* ⚠ Ciorna vine adesea FARA numar (easybill o numeroteaza la finalizare); de aceea
       `citesteDupaEmitere` o intoarce pe loc, ca avertismentul asta sa ajunga la om. */
    avertismente.push(`Factura ${et} a ieșit ciornă în easybill („${citita.stare || "fără stare"}”), nu factură fiscală, deci n-am scris-o ca factură pe comandă. Finalizeaz-o din easybill, apoi apasă „Citește numărul”; contul are probabil pornită „Afișează buton de finalizare factură”.`);
  }
  if (citita.total !== null && Math.abs(citita.total - compusa.total) >= 0.01) {
    const lei = (n: number) => `${n.toFixed(2).replace(".", ",")} lei`;
    avertismente.push(`Factura ${et} a ieșit în easybill pe ${lei(citita.total)}, iar comanda are ${lei(compusa.total)}. Verifică documentul în easybill.`);
    await logError({
      action: "easybill.totalDiferit",
      message: `Factura easybill ${et}: ${citita.total} la ei, ${compusa.total} trimis`,
      details: { orderId: p.orderId, cheie, laEi: citita.total, trimis: compusa.total },
      businessId: p.businessId,
      severity: "warning",
    });
  }
  return avertismente;
}

/**
 * Incasarea la emitere, cand comanda e DEJA platita online cu cardul si comerciantul a cerut-o.
 * Intoarce un avertisment de aratat, sau `null` cand nu e nimic de spus.
 *
 * ⚠ SUB REGISTRU, cu cheia pe FACTURA: o incasare inregistrata de doua ori ar dubla plata in
 * evidenta comerciantului. ⚠ Un esec aici NU strica emiterea: factura exista, se spune doar ca
 * incasarea trebuie marcata de mana.
 */
async function incaseazaDacaECazul(p: {
  businessId: string;
  orderId: string;
  config: EasybillConfig;
  a: AcreditariEasybill;
  comanda: RandComanda;
  cheie: string;
  citita: FacturaCitita | null;
  compusa: FacturaCompusa;
}): Promise<string | null> {
  if (!p.config.mark_paid_online) return null;
  /* „Au intrat banii?” e regula comuna a caselor de facturare (`billing/incasare.ts`). */
  if (!baniiAuIntrat({ payment_status: p.comanda.payment_status })) return null;
  /* Doar platile cu cardul: tipul trimis e „card”. Rambursul si finantarea raman ale omului. */
  if (!isCardPaymentMethod(p.comanda.payment_method)) return null;

  const suma = p.citita?.total ?? p.compusa.total;
  if (!Number.isFinite(suma) || suma <= 0) return null;

  const deMana = "Marchează factura încasată din contul easybill.";
  const r = await cuRegistru(
    createAdminClient(),
    {
      businessId: p.businessId, orderId: p.orderId, fel: "incasare", furnizor: "easybill",
      cheie: cheieOperatie("incasare", "easybill", p.cheie),
    },
    async () => {
      await inregistreazaIncasarea(p.a, {
        idFactura: p.cheie,
        suma,
        data: dataFacturii(new Date()),
        numar: String(p.comanda.order_number ?? ""),
        detalii: `Plata online, comanda #${p.comanda.order_number ?? ""}`,
        platitor: p.compusa.client.campuri.clientName ?? "",
      });
      return { referinta: p.cheie, valoare: null };
    },
    verdictFurnizor,
  );
  if (r.fel === "facut" || r.fel === "deja") return null;
  await logError({
    action: "easybill.incasare",
    message: `Incasarea facturii ${p.cheie} nu s-a inregistrat: ${r.mesaj}`,
    details: { orderId: p.orderId, cheie: p.cheie },
    businessId: p.businessId,
    severity: "warning",
  });
  return `Factura s-a emis, dar încasarea nu s-a înregistrat: ${r.mesaj} ${deMana}`;
}

/**
 * Citeste din easybill seria si numarul facturii (si ale stornarii, daca exista una legata), cand nu
 * s-au putut citi la emitere. O citire pura: nu emite nimic, deci se poate apasa oricand.
 *
 * ⚠ FACTURA ANULATA IN EASYBILL (`invoiceIsCancelled`) SE SPUNE, NU SE REZOLVA. Nu se scrie nimic pe
 * comanda: un numar citit acum ar fi facut-o „completa”, iar contul cumparatorului ar fi aratat un
 * document anulat. Nici slotul nu se elibereaza singur; omul hotaraste.
 */
export async function refreshEasybillDocuments(
  businessId: string,
  orderId: string,
): Promise<{ number: string; series: string; avertisment?: string } | { error: string }> {
  const ctx = await context(businessId, orderId);
  if ("error" in ctx) return ctx;
  const { supabase, a, comanda } = ctx;
  if (!comanda.easybill_invoice_key) return { error: "Comanda nu are factură easybill." };

  let factura: FacturaCitita | null;
  let storno: FacturaCitita | null = null;
  try {
    factura = await citesteFactura(a, comanda.easybill_invoice_key);
    if (comanda.easybill_storno_key) storno = await citesteFactura(a, comanda.easybill_storno_key);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "easybill nu a răspuns." };
  }
  if (!factura) {
    return { error: `easybill nu mai găsește factura (id ${comanda.easybill_invoice_key}). Verifică în contul easybill dacă a fost ștearsă.` };
  }
  const et = eticheta(factura.serie, factura.numar, factura.cheie);
  const stare = stareaFacturii(factura);
  if (stare === "anulata") {
    return {
      number: factura.numar,
      series: factura.serie,
      avertisment: `Factura ${et} apare anulată în easybill. N-am schimbat nimic pe comandă; hotărăști tu ce faci mai departe.`,
    };
  }
  if (stare === "ciorna") {
    /* Numarul unei ciorne e provizoriu (sau lipseste): scris acum, comanda ar fi parut facturata. */
    return {
      number: factura.numar,
      series: factura.serie,
      avertisment: `Factura ${et} e încă ciornă în easybill. Finalizeaz-o acolo, apoi citește din nou numărul; până atunci n-am scris nimic pe comandă.`,
    };
  }

  const avertismente: string[] = [];
  /* O stornare anulata sau ciorna nu se scrie peste ce stie comanda: se spune. */
  const stornoBun = storno && stareaFacturii(storno) === "vie" ? storno : null;
  if (storno && !stornoBun) {
    const ce = stareaFacturii(storno) === "anulata" ? "anulată" : "ciornă";
    avertismente.push(`Stornarea ${eticheta(storno.serie, storno.numar, storno.cheie)} apare ${ce} în easybill. N-am schimbat-o pe comandă.`);
  }

  const { error } = await supabase.from("orders").update({
    easybill_invoice_series: factura.serie || null,
    easybill_invoice_number: factura.numar || null,
    ...(stornoBun ? { easybill_storno_series: stornoBun.serie || null, easybill_storno_number: stornoBun.numar || null } : {}),
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId);
  if (error) return { error: "Numărul s-a citit, dar nu s-a putut scrie pe comandă. Încearcă din nou." };
  return {
    number: factura.numar,
    series: factura.serie,
    ...(avertismente.length ? { avertisment: avertismente.join(" ") } : {}),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   STORNAREA FACUTA IN EASYBILL
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Inregistreaza pe comanda stornarea facuta de om IN easybill (singurul drum: API-ul lor n-are
 * stornare). Omul da seria si numarul; noi le CAUTAM in easybill si le verificam (`verificaStornarea`):
 * document finalizat, neanulat, cu total negativ care anuleaza EXACT factura, legat de ea. Negasit =
 * eroare: nimic pe incredere.
 *
 * Fara apel extern: e o citire la ei si o scriere la noi. Totusi lasa un rand in registru (`storno`,
 * cu data documentului), ca SAGA sa-i stie data. Scrierea e conditionata (aceeasi factura,
 * `easybill_storno_key` inca gol), deci doua apasari simultane nu pot pune doua stornari diferite.
 *
 * ⚠ CE FACE CHEIA: elibereaza slotul (`slotFacturare`). Dupa ea, comanda poate primi o factura noua
 * pentru TOT, cu alta cheie de registru si alt marcaj. De aceea o stornare PARTIALA se refuza: s-ar fi
 * refacturat si partea nestornata.
 */
export async function inregistreazaStornareaEasybill(
  businessId: string,
  orderId: string,
  input: { serie?: string; numar: string },
): Promise<{ number: string; series: string; avertisment?: string } | { error: string }> {
  const ctx = await context(businessId, orderId);
  if ("error" in ctx) return ctx;
  const { supabase, a, comanda } = ctx;

  const cheieFactura = comanda.easybill_invoice_key;
  if (!cheieFactura) return { error: "Comanda nu are factură easybill, deci n-are ce stornare primi." };
  if (comanda.easybill_storno_key) {
    const deja = eticheta(comanda.easybill_storno_series, comanda.easybill_storno_number, comanda.easybill_storno_key);
    return { error: `Comanda are deja stornarea ${deja} înregistrată.` };
  }
  const cautat = documentulCautat({ serie: text(input?.serie, 40), numar: text(input?.numar, 40) });
  if (!cautat.numar) return { error: "Scrie numărul stornării, exact cum apare în easybill." };

  let originala: FacturaCitita | null;
  try {
    originala = await citesteFactura(a, cheieFactura);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "easybill nu a răspuns. Încearcă din nou." };
  }
  if (!originala) {
    return { error: `easybill nu mai găsește factura comenzii (id ${cheieFactura}), deci nu putem verifica stornarea. Verifică în contul easybill.` };
  }

  const { intervale, plafonata } = intervaleDeCautare(originala.data, new Date());
  let gasite: FacturaCitita[];
  try {
    gasite = await cautaFacturi(a, intervale, (randuri) => potrivesteDocumentul(randuri, cautat), "căutarea stornării");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "easybill nu a răspuns. Încearcă din nou." };
  }
  const v = verificaStornarea({
    gasite,
    originala,
    cautat,
    cautare: { de_la: intervale[intervale.length - 1].start, pana_la: intervale[0].end, plafonata },
  });
  if ("error" in v) return v;
  const s = v.storno;
  const et = eticheta(s.serie, s.numar, s.cheie) ?? s.cheie;

  /*
   * ⚠ O STORNARE ANULEAZA O SINGURA FACTURA. Daca stornarea e deja pe ALTA comanda a magazinului
   * (inregistrata acolo, sau folosita de reemiterea ei, `factura:easybill:<alta>-R<S>`), nu poate fi si
   * a acesteia: doua comenzi ar fi parut stornate de acelasi document, si amandoua refacturabile.
   * ⚠ Doua cautari `like`, nu un `or(...)`: o greseala de sintaxa PostgREST da lista goala, nu eroare.
   */
  const admin = createAdminClient();
  const [peComenzi, inReemiteri, inStornari] = await Promise.all([
    admin.from("orders").select("id, order_number")
      .eq("business_id", businessId).eq("easybill_storno_key", s.cheie).neq("id", orderId).limit(1),
    admin.from("operatii_externe").select("order_id, order_number")
      .eq("business_id", businessId).eq("furnizor", "easybill").eq("fel", "factura")
      .like("cheie", `factura:easybill:%-R${s.cheie}`).neq("order_id", orderId).limit(1),
    admin.from("operatii_externe").select("order_id, order_number")
      .eq("business_id", businessId).eq("furnizor", "easybill").eq("fel", "storno").eq("stare", "reusit")
      .like("cheie", `storno:easybill:%-S${s.cheie}`).neq("order_id", orderId).limit(1),
  ]);
  if (peComenzi.error || inReemiteri.error || inStornari.error) {
    return { error: "N-am putut verifica dacă stornarea e deja folosită pe altă comandă. Încearcă din nou; nu am înregistrat nimic." };
  }
  const alta = (peComenzi.data ?? [])[0] ?? (inReemiteri.data ?? [])[0] ?? (inStornari.data ?? [])[0];
  if (alta) {
    const nr = (alta as { order_number?: string | null }).order_number;
    return { error: `Stornarea ${et} e deja legată de altă comandă${nr ? ` (#${nr})` : ""}. O stornare anulează o singură factură. Nu am înregistrat nimic.` };
  }

  /*
   * Randul de registru al stornarii: fara apel extern (documentul exista deja la ei), dar cu data lui.
   * SAGA citeste data documentului din registru; o stornare inregistrata de mana n-ar fi avut niciuna.
   */
  const reg = await cuRegistru(
    admin,
    {
      businessId, orderId, fel: "storno", furnizor: "easybill",
      cheie: cheieOperatie("storno", "easybill", `${orderId}-S${s.cheie}`),
    },
    async () => ({
      referinta: s.cheie,
      detalii: { data: s.data || null, inregistrata: true, serie: s.serie || null, numar: s.numar || null, total: s.total },
      valoare: null,
    }),
    verdictFurnizor,
  );
  if (reg.fel === "blocat" || reg.fel === "eroare") return { error: reg.mesaj };

  /* ⚠ CONDITIONATA DE AMANDOUA: aceeasi factura pe care am verificat-o, si nicio stornare inca. Intre
     verificare si scriere, o reemitere ar fi putut schimba factura comenzii. */
  const { data: randuri, error: eScriere } = await supabase.from("orders").update({
    easybill_storno_key: s.cheie,
    easybill_storno_series: s.serie || null,
    easybill_storno_number: s.numar || null,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId)
    .eq("easybill_invoice_key", cheieFactura).is("easybill_storno_key", null).select("id");

  if (eScriere || !randuri || randuri.length === 0) {
    /* Zero randuri poate fi si o apasare dubla castigata de cealalta: se citeste ce e acum. */
    const { data: acum } = await supabase.from("orders").select("easybill_invoice_key, easybill_storno_key")
      .eq("id", orderId).eq("business_id", businessId).maybeSingle();
    const r = acum as { easybill_invoice_key?: string | null; easybill_storno_key?: string | null } | null;
    if (r && r.easybill_invoice_key === cheieFactura && r.easybill_storno_key === s.cheie) return { number: s.numar, series: s.serie };
    if (r && r.easybill_invoice_key !== cheieFactura) return { error: "Între timp factura comenzii s-a schimbat. Reîncarcă pagina; nu am înregistrat stornarea." };
    if (r?.easybill_storno_key) return { error: "Între timp s-a înregistrat altă stornare pe comandă. Reîncarcă pagina." };
    await verificaLegaturaDocumentului({
      actiune: "easybill.stornoInregistrat", document: et, orderId, businessId, eroare: eScriere, randuri,
    });
    return { error: `Stornarea ${et} există în easybill, dar nu s-a putut scrie pe comandă. Încearcă din nou.` };
  }
  await verificaLegaturaDocumentului({
    actiune: "easybill.stornoInregistrat", document: et, orderId, businessId, eroare: eScriere, randuri,
  });
  await logError({
    action: "easybill.stornoInregistrat",
    message: `Comanda ${comanda.order_number}: stornarea ${et} (total ${s.total}) inregistrata de comerciant pentru factura ${eticheta(originala.serie, originala.numar, originala.cheie)}`,
    details: { orderId, factura: originala.cheie, storno: s.cheie, avertismente: v.avertismente.length },
    businessId,
    severity: "info",
  });

  return {
    number: s.numar,
    series: s.serie,
    ...(v.avertismente.length ? { avertisment: v.avertismente.join(" ") } : {}),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   FACTURAREA AUTOMATA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Intrarea dispecerului (`invoice-auto.actions.ts`). `true` doar daca a emis ACUM, ca dispecerul sa
 * se opreasca si a doua casa sa nu mai emita pentru aceeasi comanda. Nu arunca niciodata.
 *
 * ⚠ ESECURILE NU TAC: pe calea automata nu e niciun om in fata, deci fiecare refuz si fiecare
 * cadere se scriu in jurnal ca `critical`.
 */
export async function maybeAutoGenerateInvoice(
  businessId: string,
  orderId: string,
  newStatus: string,
  newPaymentStatus: string,
  sistem?: SistemClient,
): Promise<boolean> {
  try {
    const supabase = await clientFacturare(sistem);
    const { data: settings } = await supabase
      .from("store_settings").select("easybill_config").eq("business_id", businessId).maybeSingle();
    const config = (settings as { easybill_config?: unknown } | null)?.easybill_config;
    if (!easybillGata(config) || !config.auto_invoice) return false;
    if (!autoInvoiceTriggerMatches(config.auto_invoice_trigger, newStatus, newPaymentStatus)) return false;

    const result = await emiteFacturaComenzii(businessId, orderId, sistem, TERMEN_AUTOMAT_MS);
    if ("error" in result) {
      await logError({
        action: "easybill.autoInvoiceEsuat",
        message: result.error,
        details: { orderId },
        businessId,
        severity: "critical",
      });
      return false;
    }
    if (result.avertisment) {
      await logError({
        action: "easybill.autoInvoiceAvertisment",
        message: result.avertisment,
        details: { orderId },
        businessId,
        severity: "warning",
      });
    }
    return true;
  } catch (e) {
    await logError({
      action: "easybill.autoInvoiceCazut",
      message: `Facturarea automata a picat pentru comanda ${orderId}: ${e instanceof Error ? e.message : String(e)}`,
      details: { orderId },
      businessId,
      severity: "critical",
    }).catch(() => {});
    return false;
  }
}
