"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sagaPermiteReemiterea } from "@/lib/saga/server";
import type { Json } from "@/types/database.types";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { secretDinConfig } from "@/lib/integrari/secret-server";
import { clientFacturare, eSistem, type SistemClient } from "@/lib/invoicing-context";
import { logError } from "@/lib/error-logger";
import { verificaLegaturaDocumentului } from "@/lib/invoicing-legatura";
import { cheieOperatie, cuRegistru } from "@/lib/operatii/registru";
import { eroareRefuz, verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import { cheieDocument, slotFacturare } from "@/lib/billing/refacturare";
import { fetchSkuMap } from "@/lib/billing/sku-map";
import { baniiAuIntrat } from "@/lib/billing/incasare";
import { AUTO_INVOICE_TRIGGERS, autoInvoiceTriggerMatches, type AutoInvoiceTrigger } from "@/lib/invoicing";
import { isCardPaymentMethod, PAYMENT_METHOD_DEFAULT_LABELS, type PaymentMethodType } from "@/lib/payment-methods";
import { MESAJ_PROCESATA_IN_EASYSALES, procesataInEasySales } from "@/lib/orders/origin";
import { facturisGata, seriaStornarii, type FacturisConfig } from "@/lib/facturis/config";
import {
  citesteFactura, emiteFactura, inregistreazaIncasarea, testeazaConexiunea,
  type AcreditariFacturis, type FacturaCitita,
} from "@/lib/facturis/client";
import { compuneFactura, compuneStornarea, dataIncasarii, type ComandaDeFacturat } from "@/lib/facturis/document";
import { acreditari, configurareaMagazinului } from "@/lib/facturis/server";

/*
 * Facturis Online: emiterea facturii, stornarea, incasarea si configurarea.
 * Fisa integrarii: `docs/facturare/FACTURIS.md`.
 *
 * ⚠ „use server": FIECARE export de aici e un capat public. Se exporta doar actiunile; fiecare isi
 * dovedeste singura proprietarul (sau primeste clientul de sistem, care nu se poate fabrica dintr-o
 * cerere de browser, vezi `invoicing-context.ts`).
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

/** Coloanele comenzii de care are nevoie facturarea. Numite, nu `*`: o coloana in plus nu costa. */
const COLOANE_COMANDA = [
  "id", "business_id", "order_number", "customer_name", "customer_phone", "billing_company",
  "shipping_address", "items", "shipping_cost", "discount_amount", "discount_code",
  "card_discount_amount", "cod_discount_amount", "cod_fee_amount", "total", "vat_rate", "vat_amount",
  "prices_include_vat", "payment_status", "payment_method", "order_source",
  "facturis_invoice_key", "facturis_invoice_series", "facturis_invoice_number",
  "facturis_storno_key", "facturis_storno_series", "facturis_storno_number",
].join(", ");

type RandComanda = ComandaDeFacturat & {
  id: string;
  payment_method?: string | null;
  order_source?: unknown;
  facturis_invoice_key: string | null;
  facturis_invoice_series: string | null;
  facturis_invoice_number: string | null;
  facturis_storno_key: string | null;
  facturis_storno_series: string | null;
  facturis_storno_number: string | null;
};

type Context = {
  supabase: Awaited<ReturnType<typeof clientFacturare>>;
  config: FacturisConfig;
  a: AcreditariFacturis;
  comanda: RandComanda;
  magazin: { vat_enabled: boolean; vat_rate: number; prices_include_vat: boolean };
};

/**
 * Configurarea, comanda si TVA-ul magazinului.
 *
 * ⚠ Configurarea se citeste cu cheia de SERVICIU (`configurareaMagazinului`), DUPA garda de
 * proprietate. Pe clientul comerciantului cheia API si parola ar fi sosit `enc.v1.…`.
 * Comanda si TVA-ul NU sunt secrete si raman pe clientul apelantului: pe calea manuala, RLS-ul
 * comerciantului e inca o paza.
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
  if (!config) return { error: "Facturis nu este configurat complet." };
  /* ⚠ TVA-ul magazinului NECITIT nu e „fara TVA”: cazut pe `vat_enabled: false`, fiecare linie ar fi
     plecat cu cota 0%, iar reconcilierea pe brut tot ar fi trecut. Un document fiscal gresit nu se
     retrage, se storneaza; deci se opreste aici. */
  if (eSetari || !setari) return { error: "Setările de TVA ale magazinului nu s-au putut citi. Încearcă din nou." };
  const s = setari as { vat_enabled?: boolean; vat_rate?: number; prices_include_vat?: boolean } | null;
  return {
    supabase,
    config,
    a: acreditari(config),
    comanda: comanda as unknown as RandComanda,
    magazin: {
      vat_enabled: s?.vat_enabled ?? false,
      vat_rate: Number(s?.vat_rate ?? 21) || 0,
      prices_include_vat: s?.prices_include_vat ?? true,
    },
  };
}

/** „YYYY-MM-DD” din `facturi_data` („YYYY-MM-DD HH:MM:SS”, ora Romaniei), pentru `detalii.data` din registru. */
function ziuaDocumentului(dataFact: Record<string, unknown>): string | null {
  const zi = String(dataFact.facturi_data ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(zi) ? zi : null;
}

/** „EDN 141", sau id-ul cat timp numarul nu s-a citit. Pentru mesaje si pentru mentiunile de pe document. */
function eticheta(serie: string | null | undefined, numar: string | null | undefined, cheie: string | null | undefined): string | null {
  const n = [serie, numar].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
  if (n) return n;
  return cheie ? `(id ${cheie})` : null;
}

/**
 * Citirea de dupa emitere: seria, numarul, totalul si clientul documentului abia creat.
 *
 * ⚠ NU ARUNCA, NICIODATA. Documentul fiscal EXISTA deja cand se ajunge aici; o eroare de citire
 * nu are voie sa transforme o emitere reusita intr-un esec (comerciantul ar apasa iar si ar emite
 * a doua factura). Fara raspuns, se intoarce `null` si numarul se citeste mai tarziu, la cerere.
 * Trei incercari, cu pauze scurte: documentul abia scris poate sa nu fie inca vizibil la citire.
 */
async function citesteDupaEmitere(a: AcreditariFacturis, cheie: string): Promise<FacturaCitita | null> {
  for (const pauza of [0, 500, 1500]) {
    if (pauza) await new Promise((r) => setTimeout(r, pauza));
    try {
      const f = await citesteFactura(a, cheie);
      if (f && f.numar) return f;
    } catch {
      /* se mai incearca */
    }
  }
  return null;
}

/** Comanda e in lei? Facturis primeste de aici doar facturi in lei. */
function monedaStraina(orderSource: unknown): string | null {
  const src = (orderSource ?? null) as { currency?: string; moneda_necitita?: boolean } | null;
  if (src?.moneda_necitita === true) return "necunoscuta";
  const m = (src?.currency ?? "").trim().toUpperCase();
  return m && m !== "RON" ? m : null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIGURAREA
   ═══════════════════════════════════════════════════════════════════════════ */

const PLAFON_TEXT = 200;
const text = (v: unknown, max = PLAFON_TEXT) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Salveaza si ACTIVEAZA integrarea (`enabled: true`), dupa o proba de conexiune facuta pe server.
 *
 * ⚠ PROBA E PARTE DIN SALVARE. Daca Facturis raspunde NU (chei gresite, cont fara API), nu se
 * salveaza: o integrare „activa" care refuza fiecare factura ar fi aflata la prima comanda, adica
 * exact cand nu mai e timp. Daca Facturis nu raspunde deloc, se salveaza cu avertisment: o pana a
 * lor nu are de ce sa-l opreasca pe comerciant.
 */
export async function saveFacturisConfig(
  businessId: string,
  input: FacturisConfig,
): Promise<{ success: true; avertisment?: string } | { error: string }> {
  const p = await proprietar(businessId);
  if ("error" in p) return p;

  const trigger = AUTO_INVOICE_TRIGGERS.some((t) => t.value === input.auto_invoice_trigger)
    ? (input.auto_invoice_trigger as AutoInvoiceTrigger)
    : "confirmed";
  const curat: FacturisConfig = {
    enabled: true,
    api_key: text(input.api_key, 500),
    username: text(input.username),
    /* ⚠ Parola NU se taie la spatii: poate incepe sau se poate termina cu unul. */
    password: typeof input.password === "string" ? input.password.slice(0, 500) : "",
    cif: text(input.cif, 40),
    serie: text(input.serie, 40),
    serie_storno: text(input.serie_storno, 40),
    due_days: Math.min(365, Math.max(0, Math.floor(Number(input.due_days) || 0))),
    auto_invoice: input.auto_invoice === true,
    auto_invoice_trigger: trigger,
    mark_paid_online: input.mark_paid_online === true,
    gestiune: text(input.gestiune, 100),
    punct_de_lucru: text(input.punct_de_lucru, 100),
  };

  /* Secretele venite GOALE (formularul le primeste mascate) isi pastreaza valoarea salvata.
     ⚠ Configurarea veche se citeste cu cheia de serviciu: pe clientul comerciantului ar fi
     sosit `enc.v1.…`, iar `pastreazaSecretele` le-ar fi „pastrat" asa. */
  const { data: vechi } = await createAdminClient()
    .from("store_settings").select("facturis_config").eq("business_id", businessId).maybeSingle();
  const final = pastreazaSecretele("facturis_config", curat, vechi?.facturis_config) as FacturisConfig;

  if (!final.api_key) return { error: "Completează cheia API Facturis." };
  if (!final.username) return { error: "Completează utilizatorul Facturis." };
  if (!final.password) return { error: "Completează parola utilizatorului Facturis." };
  if (!final.cif) return { error: "Completează codul fiscal al firmei, scris ca în Facturis." };
  if (!final.serie) return { error: "Completează seria facturilor, așa cum e creată în Facturis." };

  const proba = await testeazaConexiunea(acreditari(final));
  if (!proba.ok && proba.refuz) return { error: proba.error };

  const supabase = await createClient();
  const { error } = await supabase.from("store_settings").update({
    facturis_config: final as unknown as Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);
  if (error) return { error: "Setările nu s-au putut salva. Încearcă din nou." };

  return proba.ok
    ? { success: true }
    : { success: true, avertisment: `Setările s-au salvat, dar acum nu am putut verifica legătura cu Facturis: ${proba.error}` };
}

/**
 * „Testează conexiunea", fara sa scrie nimic.
 *
 * Secretele vin din formular cand au fost tastate (asa se probeaza o cheie NOUA inainte de
 * salvare) si din baza cand vin goale (formularul le primeste mascate). `secretDinConfig` face
 * si garda de proprietate.
 */
export async function testFacturisConfig(
  businessId: string,
  input: Pick<FacturisConfig, "api_key" | "username" | "password" | "cif">,
): Promise<{ ok: true } | { error: string }> {
  /* `secretDinConfig` dovedeste intai proprietarul, apoi da cheia (tastata sau salvata). */
  const api_key = await secretDinConfig(businessId, "facturis_config", "api_key", input.api_key);
  if (!api_key) return { error: "Completează cheia API Facturis." };
  /* ⚠ Parola NU se taie la spatii, ca la salvare si la emitere (`acreditari`): `secretDinConfig` le
     taie, iar o parola cu spatiu la capat ar fi picat la „Testează conexiunea” si ar fi trecut la
     „Salvează”. Tastata se ia ca atare; goala, se ia cea salvata, tot netaiata (proprietarul e
     dovedit chiar mai sus). */
  const tastata = typeof input.password === "string" ? input.password.slice(0, 500) : "";
  const password = tastata.trim()
    ? tastata
    : (await configurareaMagazinului(createAdminClient(), businessId))?.password ?? "";
  if (!password) return { error: "Completează parola utilizatorului Facturis." };
  const username = text(input.username);
  const cif = text(input.cif, 40);
  if (!username) return { error: "Completează utilizatorul Facturis." };
  if (!cif) return { error: "Completează codul fiscal al firmei." };

  const r = await testeazaConexiunea({ api_key, username, password, cif });
  return r.ok ? { ok: true } : { error: r.error };
}

export async function disconnectFacturis(businessId: string): Promise<{ success: true } | { error: string }> {
  const p = await proprietar(businessId);
  if ("error" in p) return p;
  const supabase = await createClient();
  const { error } = await supabase.from("store_settings").update({
    facturis_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);
  if (error) return { error: "Deconectarea nu s-a putut salva. Încearcă din nou." };
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════════════════════
   FACTURA
   ═══════════════════════════════════════════════════════════════════════════ */

export type RezultatFacturis = {
  /** Gol cat timp numarul nu s-a citit inca. */
  number: string;
  series: string;
  /** Ce trebuie sa afle omul desi documentul s-a emis: totalul diferit, incasarea neinregistrata. */
  avertisment?: string;
};

/**
 * Emite factura comenzii.
 *
 * Pasii, in ordine: garzile (easySales, moneda, slotul), compunerea si reconcilierea totalului,
 * emiterea sub registru (cu citirea numarului inapoi), scrierea pe comanda, verificarea totalului
 * documentului, si la final, daca e cerut, incasarea.
 */
export async function generateFacturisInvoice(
  businessId: string,
  orderId: string,
  sistem?: SistemClient,
): Promise<RezultatFacturis | { error: string }> {
  const ctx = await context(businessId, orderId, sistem);
  if ("error" in ctx) return ctx;
  const { supabase, config, a, comanda, magazin } = ctx;

  /* easySales: comanda stampilata „procesata in easySales" isi primeste factura ACOLO. */
  if (procesataInEasySales(comanda.order_source)) return { error: MESAJ_PROCESATA_IN_EASYSALES };

  /* ⚠ Nu se factureaza in lei o comanda care n-a fost in lei: un document fiscal gresit nu se
     retrage, se storneaza. Aceeasi regula ca in dispecerul automat, pusa si pe calea manuala. */
  const moneda = monedaStraina(comanda.order_source);
  if (moneda) {
    return {
      error: moneda === "necunoscuta"
        ? "Moneda comenzii nu s-a putut citi, iar Facturis primește de aici doar facturi în lei. Emite factura din contul Facturis."
        : `Comanda e în ${moneda}, iar Facturis primește de aici doar facturi în lei. Emite factura din contul Facturis, în moneda comenzii.`,
    };
  }

  /*
   * Slotul: o factura FARA storno il tine ocupat; dupa storno comanda e din nou facturabila.
   * ⚠ DOUA chemari, cu acelasi inteles: una pe CHEI (stabile, pentru cheia registrului si pentru
   * garda) si una pe ETICHETE (seria si numarul, pentru mesaje si pentru mentiunea de pe document).
   * Numarul unei stornari se poate citi mai tarziu decat s-a emis; pus in cheia registrului, ar fi
   * schimbat cheia intre doua incercari si ar fi deschis drumul catre a doua factura.
   */
  const slotCheie = slotFacturare({
    casa: "Facturis", factura: comanda.facturis_invoice_key, storno: comanda.facturis_storno_key,
  });
  const slot = slotFacturare({
    casa: "Facturis",
    factura: comanda.facturis_invoice_key
      ? eticheta(comanda.facturis_invoice_series, comanda.facturis_invoice_number, comanda.facturis_invoice_key)
      : null,
    storno: comanda.facturis_storno_key
      ? eticheta(comanda.facturis_storno_series, comanda.facturis_storno_number, comanda.facturis_storno_key)
      : null,
  });
  if (!slotCheie.poateEmite || !slot.poateEmite) {
    return { error: !slot.poateEmite ? slot.mesaj : "Comanda are deja o factură Facturis." };
  }
  /* SAGA: refacturarea dupa storno asteapta pana pleaca in contabilitate si stornarea facturii
     inlocuite (`sagaPermiteReemiterea`); altfel acolo ar ramane factura veche, neanulata. */
  if (slotCheie.inlocuieste) {
    const saga = await sagaPermiteReemiterea(createAdminClient(), businessId, orderId);
    if (!saga.ok) return { error: saga.mesaj };
  }

  const skus = await fetchSkuMap(supabase, businessId, (Array.isArray(comanda.items) ? comanda.items : []) as { product_id?: string | null }[], (m) =>
    logError({ action: "billing.skuMap", message: m.message, details: { ...m.details, casa: "facturis" }, severity: "warning" }));

  const compusa = compuneFactura({
    comanda,
    magazin,
    skus,
    config,
    slot,
    etichetaPlata: PAYMENT_METHOD_DEFAULT_LABELS[comanda.payment_method as PaymentMethodType] ?? (comanda.payment_method ?? ""),
    acum: new Date(),
  });
  if ("error" in compusa) return compusa;

  const admin = createAdminClient();
  const r = await cuRegistru(
    admin,
    {
      businessId, orderId, fel: "factura", furnizor: "facturis",
      cheie: cheieOperatie("factura", "facturis", cheieDocument(orderId, slotCheie)),
    },
    async () => {
      const cheie = await emiteFactura(a, compusa.dataFact, compusa.dataProd);
      /* Documentul EXISTA de aici incolo. Citirea nu arunca (vezi `citesteDupaEmitere`). */
      const citita = await citesteDupaEmitere(a, cheie);
      return {
        referinta: cheie,
        detalii: {
          serie: citita?.serie ?? null, numar: citita?.numar ?? null,
          total: citita?.total ?? null, client: citita?.clientCheie ?? null,
          /* Ziua scrisa pe document: SAGA o ia de aici, nu din clipa randului (`ziuaDocumentului`). */
          data: ziuaDocumentului(compusa.dataFact),
        },
        valoare: { cheie, citita },
      };
    },
    verdictFurnizor,
  );
  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

  let cheie: string;
  let citita: FacturaCitita | null;
  if (r.fel === "facut") {
    ({ cheie, citita } = r.valoare);
  } else {
    /* `deja`: s-a emis la o apasare de dinainte. Se adopta, si numarul se citeste daca lipsea. */
    cheie = r.referinta ?? "";
    if (!cheie) return { error: "Registrul are factura ca emisă, dar fără id. Verifică în contul Facturis și deblochează operația din pagina comenzii." };
    citita = await citesteDupaEmitere(a, cheie);
  }

  const { data: randuri, error: eScriere } = await supabase.from("orders").update({
    facturis_invoice_key: cheie,
    facturis_invoice_series: citita?.serie || null,
    facturis_invoice_number: citita?.numar || null,
    /* Stornarea se sterge odata cu factura pe care o desfiintase: altfel a doua stornare ar fi
       blocata de propria garda, iar ecranul ar arata factura NOUA drept stornata. */
    facturis_storno_key: null,
    facturis_storno_series: null,
    facturis_storno_number: null,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");
  await verificaLegaturaDocumentului({
    actiune: "facturis.factura", document: eticheta(citita?.serie, citita?.numar, cheie) ?? cheie,
    orderId, businessId, eroare: eScriere, randuri,
  });

  if (slot.poateEmite && slot.inlocuieste) {
    await logError({
      action: "facturis.refacturareDupaStorno",
      message: `Comanda ${comanda.order_number}: factura ${eticheta(citita?.serie, citita?.numar, cheie)} inlocuieste ${slot.inlocuieste.factura ?? "?"}, stornata prin ${slot.inlocuieste.storno}`,
      details: { orderId, ...slot.inlocuieste },
      businessId,
      severity: "info",
    });
  }

  const avertismente: string[] = [];
  if (!citita) {
    avertismente.push("Factura s-a emis în Facturis, dar numărul ei nu s-a putut citi încă. Apasă „Citește numărul” în cardul Facturare.");
  } else if (citita.total !== null && Math.abs(citita.total - compusa.total) >= 0.01) {
    /*
     * ⚠ VERIFICAREA DE DUPA. Liniile au fost reconciliate inainte de emitere, dar documentatia lor
     * nu spune cum isi refac totalurile; daca Facturis socoteste altfel decat noi, aici se vede.
     * Documentul s-a emis: nu se ascunde, se spune.
     */
    const lei = (n: number) => `${n.toFixed(2).replace(".", ",")} lei`;
    avertismente.push(`Factura ${eticheta(citita.serie, citita.numar, cheie)} a ieșit în Facturis pe ${lei(citita.total)}, iar comanda are ${lei(compusa.total)}. Verifică documentul în Facturis.`);
    await logError({
      action: "facturis.totalDiferit",
      message: `Factura Facturis ${eticheta(citita.serie, citita.numar, cheie)}: ${citita.total} la ei, ${compusa.total} trimis`,
      details: { orderId, cheie, laEi: citita.total, trimis: compusa.total },
      businessId,
      severity: "warning",
    });
  }

  const incasare = await incaseazaDacaECazul({ businessId, orderId, config, a, comanda, cheie, citita });
  if (incasare) avertismente.push(incasare);

  return {
    number: citita?.numar ?? "",
    series: citita?.serie ?? "",
    ...(avertismente.length ? { avertisment: avertismente.join(" ") } : {}),
  };
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
  config: FacturisConfig;
  a: AcreditariFacturis;
  comanda: RandComanda;
  cheie: string;
  citita: FacturaCitita | null;
}): Promise<string | null> {
  if (!p.config.mark_paid_online) return null;
  /* „Au intrat banii?" e regula comuna a caselor de facturare (`billing/incasare.ts`). */
  if (!baniiAuIntrat({ payment_status: p.comanda.payment_status })) return null;
  /* Doar platile cu cardul: tipul trimis e „Card". Rambursul si finantarea raman ale omului. */
  if (!isCardPaymentMethod(p.comanda.payment_method)) return null;

  const deMana = "Marchează factura încasată din contul Facturis.";
  if (!p.citita?.clientCheie) {
    return `Încasarea nu s-a putut înregistra încă (factura nu s-a putut citi). ${deMana}`;
  }
  const suma = p.citita.total ?? Number(p.comanda.total);
  if (!Number.isFinite(suma) || suma <= 0) return null;

  const r = await cuRegistru(
    createAdminClient(),
    {
      businessId: p.businessId, orderId: p.orderId, fel: "incasare", furnizor: "facturis",
      cheie: cheieOperatie("incasare", "facturis", p.cheie),
    },
    async () => {
      const id = await inregistreazaIncasarea(p.a, {
        clientCheie: p.citita!.clientCheie,
        data: dataIncasarii(new Date()),
        suma,
        tip: "Card",
        observatii: `Plata online, comanda #${p.comanda.order_number ?? ""}`,
        facturaCheie: p.cheie,
      });
      return { referinta: id ?? p.cheie, valoare: id };
    },
    verdictFurnizor,
  );
  if (r.fel === "facut" || r.fel === "deja") return null;
  await logError({
    action: "facturis.incasare",
    message: `Incasarea facturii ${p.cheie} nu s-a inregistrat: ${r.mesaj}`,
    details: { orderId: p.orderId, cheie: p.cheie },
    businessId: p.businessId,
    severity: "warning",
  });
  return `Factura s-a emis, dar încasarea nu s-a înregistrat: ${r.mesaj} ${deMana}`;
}

/**
 * Citeste din Facturis seria si numarul facturii (si ale stornarii), cand nu s-au putut citi la
 * emitere. O citire pura: nu emite nimic, deci se poate apasa oricand.
 */
export async function refreshFacturisDocuments(
  businessId: string,
  orderId: string,
): Promise<{ number: string; series: string } | { error: string }> {
  const ctx = await context(businessId, orderId);
  if ("error" in ctx) return ctx;
  const { supabase, a, comanda } = ctx;
  if (!comanda.facturis_invoice_key) return { error: "Comanda nu are factură Facturis." };

  let factura: FacturaCitita | null;
  let storno: FacturaCitita | null = null;
  try {
    factura = await citesteFactura(a, comanda.facturis_invoice_key);
    if (comanda.facturis_storno_key) storno = await citesteFactura(a, comanda.facturis_storno_key);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Facturis nu a răspuns." };
  }
  if (!factura) {
    return { error: `Facturis nu mai găsește factura (id ${comanda.facturis_invoice_key}). Verifică în contul Facturis dacă a fost ștearsă.` };
  }

  const { error } = await supabase.from("orders").update({
    facturis_invoice_series: factura.serie || null,
    facturis_invoice_number: factura.numar || null,
    ...(storno ? { facturis_storno_series: storno.serie || null, facturis_storno_number: storno.numar || null } : {}),
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId);
  if (error) return { error: "Numărul s-a citit, dar nu s-a putut scrie pe comandă. Încearcă din nou." };
  return { number: factura.numar, series: factura.serie };
}

/* ═══════════════════════════════════════════════════════════════════════════
   STORNAREA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Storneaza factura comenzii: o factura noua, cu liniile celei originale si cantitatile cu minus.
 * Vezi `compuneStornarea` pentru de ce se copiaza din factura lor, nu din comanda.
 */
export async function stornoFacturisInvoiceAction(
  businessId: string,
  orderId: string,
): Promise<RezultatFacturis | { error: string }> {
  const ctx = await context(businessId, orderId);
  if ("error" in ctx) return ctx;
  const { supabase, config, a, comanda } = ctx;

  const cheieFactura = comanda.facturis_invoice_key;
  if (!cheieFactura) return { error: "Nu există factură Facturis pentru această comandă." };
  if (comanda.facturis_storno_key) return { error: "Factura Facturis a fost deja stornată." };

  const r = await cuRegistru(
    createAdminClient(),
    {
      businessId, orderId, fel: "storno", furnizor: "facturis",
      /* Legata de FACTURA desfiintata: dupa o reemitere, factura noua are alt id, deci si
         stornarea ei alta cheie. */
      cheie: cheieOperatie("storno", "facturis", cheieFactura),
    },
    async () => {
      /* ⚠ Tot ce sta INAINTEA emiterii e refuz dovedit: nu s-a creat nimic inca. */
      const original = await citesteFactura(a, cheieFactura);
      if (!original) throw eroareRefuz(`Facturis nu mai găsește factura (id ${cheieFactura}), deci nu are ce storna. Verifică în contul Facturis.`);
      if (original.status.toLowerCase().includes("anulat")) {
        throw eroareRefuz(`Factura ${eticheta(original.serie, original.numar, cheieFactura)} e anulată în Facturis, deci nu se mai stornează.`);
      }
      const compusa = compuneStornarea({
        original,
        serie: seriaStornarii(config),
        orderNumber: comanda.order_number,
        numeClientRezerva: comanda.customer_name,
        config,
        acum: new Date(),
      });
      if ("error" in compusa) throw eroareRefuz(compusa.error);

      const cheie = await emiteFactura(a, compusa.dataFact, compusa.dataProd, "emiterea stornării");
      const citita = await citesteDupaEmitere(a, cheie);
      return {
        referinta: cheie,
        detalii: {
          serie: citita?.serie ?? null, numar: citita?.numar ?? null, total: citita?.total ?? null,
          data: ziuaDocumentului(compusa.dataFact),
        },
        valoare: { cheie, citita, asteptat: compusa.total, original },
      };
    },
    verdictFurnizor,
  );
  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

  let cheie: string;
  let citita: FacturaCitita | null;
  if (r.fel === "facut") {
    ({ cheie, citita } = r.valoare);
  } else {
    cheie = r.referinta ?? "";
    if (!cheie) return { error: "Registrul are stornarea ca emisă, dar fără id. Verifică în contul Facturis și deblochează operația din pagina comenzii." };
    citita = await citesteDupaEmitere(a, cheie);
  }

  const { data: randuri, error: eScriere } = await supabase.from("orders").update({
    facturis_storno_key: cheie,
    facturis_storno_series: citita?.serie || null,
    facturis_storno_number: citita?.numar || null,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");
  await verificaLegaturaDocumentului({
    actiune: "facturis.storno", document: eticheta(citita?.serie, citita?.numar, cheie) ?? cheie,
    orderId, businessId, eroare: eScriere, randuri,
  });

  const avertismente: string[] = [];
  if (!citita) {
    avertismente.push("Stornarea s-a emis în Facturis, dar numărul ei nu s-a putut citi încă. Apasă „Citește numărul” în cardul Facturare.");
  } else if (r.fel === "facut" && citita.total !== null && Math.abs(citita.total - r.valoare.asteptat) >= 0.01) {
    const lei = (n: number) => `${n.toFixed(2).replace(".", ",")} lei`;
    avertismente.push(`Stornarea ${eticheta(citita.serie, citita.numar, cheie)} a ieșit pe ${lei(citita.total)}, iar factura stornată avea ${lei(-r.valoare.asteptat)}. Verifică documentul în Facturis.`);
    await logError({
      action: "facturis.totalDiferit",
      message: `Stornarea Facturis ${cheie}: ${citita.total} la ei, ${r.valoare.asteptat} trimis`,
      details: { orderId, cheie },
      businessId,
      severity: "warning",
    });
  }

  return {
    number: citita?.numar ?? "",
    series: citita?.serie ?? "",
    ...(avertismente.length ? { avertisment: avertismente.join(" ") } : {}),
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
 * cadere se scriu in jurnal ca `critical`. Proba comuna `facturarea-automata-nu-inghite-defecte`
 * o cere de la fiecare casa.
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
      .from("store_settings").select("facturis_config").eq("business_id", businessId).maybeSingle();
    const config = (settings as { facturis_config?: unknown } | null)?.facturis_config;
    if (!facturisGata(config) || !config.auto_invoice) return false;
    if (!autoInvoiceTriggerMatches(config.auto_invoice_trigger, newStatus, newPaymentStatus)) return false;

    const result = await generateFacturisInvoice(businessId, orderId, sistem);
    if ("error" in result) {
      await logError({
        action: "facturis.autoInvoiceEsuat",
        message: result.error,
        details: { orderId },
        businessId,
        severity: "critical",
      });
      return false;
    }
    if (result.avertisment) {
      await logError({
        action: "facturis.autoInvoiceAvertisment",
        message: result.avertisment,
        details: { orderId },
        businessId,
        severity: "warning",
      });
    }
    return true;
  } catch (e) {
    await logError({
      action: "facturis.autoInvoiceCazut",
      message: `Facturarea automata a picat pentru comanda ${orderId}: ${e instanceof Error ? e.message : String(e)}`,
      details: { orderId },
      businessId,
      severity: "critical",
    }).catch(() => {});
    return false;
  }
}
