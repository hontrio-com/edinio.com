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
import {
  cheiaDeFolosit, cheiePeComanda, citesteCheia, factureazaGata, mediul, seriaStornarii,
  type FactureazaConfig, type MediuFactureaza, type SerieFactura,
} from "@/lib/factureaza/config";
import {
  citesteDeStornat, citesteDocumentele, creeazaClientul, emiteDocumentul, inregistreazaIncasarea,
  pregatesteEmiterea, serieSiNumar, testeazaConexiunea, type AcreditariFactureaza, type DocumentCitit,
} from "@/lib/factureaza/client";
import {
  alegeSeria, anulDocumentului, clientPotrivit, compuneFactura, compuneStornarea, dataDocumentului, dataValida,
  facturaExistenta, marcajEmitere, numeleDocumentului, stornareExistenta, sumaDeIncasat, verificaSeriaLaSalvare,
  type ComandaDeFacturat,
} from "@/lib/factureaza/document";
import { acreditari, configurareaMagazinului } from "@/lib/factureaza/server";

/*
 * Factureaza.ro: emiterea facturii, stornarea, incasarea si configurarea.
 * Fisa integrarii: `docs/facturare/FACTUREAZA.md`.
 *
 * ⚠ „use server”: FIECARE export de aici e un capat public. Se exporta doar actiunile; fiecare isi
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

/** Coloanele comenzii de care are nevoie facturarea. Numite, nu `*`. */
const COLOANE_COMANDA = [
  "id", "business_id", "order_number", "customer_name", "billing_company",
  "shipping_address", "items", "shipping_cost", "discount_amount", "discount_code",
  "card_discount_amount", "cod_discount_amount", "cod_fee_amount", "total", "vat_rate", "vat_amount",
  "prices_include_vat", "payment_status", "payment_method", "order_source",
  "factureaza_invoice_key", "factureaza_invoice_series", "factureaza_invoice_number",
  "factureaza_storno_key", "factureaza_storno_series", "factureaza_storno_number",
].join(", ");

type RandComanda = ComandaDeFacturat & {
  id: string;
  payment_method?: string | null;
  order_source?: unknown;
  factureaza_invoice_key: string | null;
  factureaza_invoice_series: string | null;
  factureaza_invoice_number: string | null;
  factureaza_storno_key: string | null;
  factureaza_storno_series: string | null;
  factureaza_storno_number: string | null;
};

type Context = {
  supabase: Awaited<ReturnType<typeof clientFacturare>>;
  config: FactureazaConfig;
  a: AcreditariFactureaza;
  mediu: MediuFactureaza;
  comanda: RandComanda;
  magazin: { vat_enabled: boolean; vat_rate: number; prices_include_vat: boolean };
};

/**
 * Configurarea, comanda si TVA-ul magazinului.
 *
 * ⚠ Configurarea se citeste cu cheia de SERVICIU (`configurareaMagazinului`), DUPA garda de
 * proprietate. Pe clientul comerciantului cheia API ar fi sosit `enc.v1.…`. Comanda si TVA-ul NU
 * sunt secrete si raman pe clientul apelantului: pe calea manuala, RLS-ul e inca o paza.
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
  if (!config) return { error: "Factureaza.ro nu este configurat complet." };
  /* ⚠ O citire cazuta a setarilor de TVA NU e „neplatitor”: implicitele de mai jos ar fi trimis
     factura cu 0% pe toate liniile, fara niciun semn. Fara ele, nu se emite. */
  if (eSetari || !setari) return { error: "Setările de TVA ale magazinului nu s-au putut citi acum, iar fără ele factura ar putea ieși cu TVA greșit. Încearcă din nou." };
  const s = setari as { vat_enabled?: boolean; vat_rate?: number; prices_include_vat?: boolean } | null;
  return {
    supabase,
    config,
    a: acreditari(config),
    mediu: mediul(config),
    comanda: comanda as unknown as RandComanda,
    magazin: {
      vat_enabled: s?.vat_enabled ?? false,
      vat_rate: Number(s?.vat_rate ?? 21) || 0,
      prices_include_vat: s?.prices_include_vat ?? true,
    },
  };
}

/** „SRV 1027”, sau id-ul cat timp numarul nu s-a citit. Pentru mesaje si pentru mentiunile de pe document. */
function eticheta(serie: string | null | undefined, numar: string | null | undefined, cheie: string | null | undefined): string | null {
  const n = [serie, numar].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
  if (n) return n;
  return cheie ? `(id ${cheie})` : null;
}

/** Comanda e in lei? Factureaza.ro primeste de aici doar facturi in lei. */
function monedaStraina(orderSource: unknown): string | null {
  const src = (orderSource ?? null) as { currency?: string; moneda_necitita?: boolean } | null;
  if (src?.moneda_necitita === true) return "necunoscuta";
  const m = (src?.currency ?? "").trim().toUpperCase();
  return m && m !== "RON" ? m : null;
}

/** Mediul unei chei de pe comanda. O cheie stricata se socoteste REALA: asa blocheaza, nu sterge. */
function mediulCheii(cheie: string | null | undefined): MediuFactureaza | null {
  if (!(cheie ?? "").trim()) return null;
  return citesteCheia(cheie)?.mediu ?? "productie";
}

/**
 * Documentele comenzii care CONTEAZA in mediul de acum, pentru slotul de facturare.
 *
 * ⚠⚠ UN DOCUMENT DE TEST NU OCUPA LOCUL UNEI FACTURI ADEVARATE. Pe Real, factura si stornarea din
 * sandbox se ignora: nu sunt fiscale, deci nu cer stornare, iar factura reala le inlocuieste pe
 * comanda. Invers, pe Test, comanda cu un document REAL nu se atinge deloc: un document de proba
 * scris peste unul fiscal ar fi sters legatura comenzii cu factura ei.
 */
function documenteleInMediu(c: RandComanda, mediu: MediuFactureaza):
  | { factura: string | null; storno: string | null; ignorate: boolean }
  | { error: string } {
  const mf = mediulCheii(c.factureaza_invoice_key);
  const ms = mediulCheii(c.factureaza_storno_key);
  if (mediu === "test") {
    if (mf === "productie" || ms === "productie") {
      return { error: "Comanda are documente fiscale reale în Factureaza.ro, iar integrarea e în modul de test. Peste ele nu se emite nimic de test." };
    }
    return { factura: c.factureaza_invoice_key, storno: c.factureaza_storno_key, ignorate: false };
  }
  return {
    factura: mf === "productie" ? c.factureaza_invoice_key : null,
    storno: ms === "productie" ? c.factureaza_storno_key : null,
    ignorate: mf === "test" || ms === "test",
  };
}

/** Avertismentul spus la FIECARE emitere din sandbox, si pe calea manuala, si pe cea automata. */
const AVERTISMENT_TEST =
  "Documentul s-a emis în modul de TEST (sandbox-ul Factureaza.ro): NU e un document fiscal, nu pleacă la marketplace și nu ține loc de factură. Treci pe Real în configurare înainte de comenzile adevărate.";

const lei = (n: number) => `${n.toFixed(2).replace(".", ",")} lei`;

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIGURAREA
   ═══════════════════════════════════════════════════════════════════════════ */

const PLAFON_TEXT = 200;
const text = (v: unknown, max = PLAFON_TEXT) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Salveaza si ACTIVEAZA integrarea (`enabled: true`), dupa o proba de conexiune facuta pe server.
 *
 * ⚠ PROBA E PARTE DIN SALVARE. Daca Factureaza.ro raspunde NU (cheie gresita, abonament fara API,
 * serie inexistenta pe anul curent), nu se salveaza: o integrare „activa” care refuza fiecare factura
 * ar fi aflata la prima comanda. Daca nu raspunde deloc, se salveaza cu avertisment.
 */
export async function saveFactureazaConfig(
  businessId: string,
  input: FactureazaConfig,
): Promise<{ success: true; avertisment?: string } | { error: string }> {
  const p = await proprietar(businessId);
  if ("error" in p) return p;

  const trigger = AUTO_INVOICE_TRIGGERS.some((t) => t.value === input.auto_invoice_trigger)
    ? (input.auto_invoice_trigger as AutoInvoiceTrigger)
    : "confirmed";
  const curat: FactureazaConfig = {
    enabled: true,
    api_key: text(input.api_key, 200),
    mediu: input.mediu === "test" ? "test" : "productie",
    serie: text(input.serie, 40),
    serie_storno: text(input.serie_storno, 40),
    due_days: Math.min(365, Math.max(0, Math.floor(Number(input.due_days) || 0))),
    auto_invoice: input.auto_invoice === true,
    auto_invoice_trigger: trigger,
    mark_paid_online: input.mark_paid_online === true,
  };

  /* Cheia venita GOALA (formularul o primeste mascata) isi pastreaza valoarea salvata.
     ⚠ Configurarea veche se citeste cu cheia de serviciu: pe clientul comerciantului ar fi sosit
     `enc.v1.…`, iar ea s-ar fi „pastrat” asa. */
  const { data: vechi, error: eVechi } = await createAdminClient()
    .from("store_settings").select("factureaza_config").eq("business_id", businessId).maybeSingle();
  /* ⚠ O citire cazuta nu e „nicio configurare”: cheia venita goala ar fi parut lipsa. */
  if (eVechi) return { error: "Configurarea salvată nu s-a putut citi acum. Încearcă din nou." };
  const final = pastreazaSecretele("factureaza_config", curat, vechi?.factureaza_config) as FactureazaConfig;
  /* ⚠⚠ Cheia se alege AICI, peste ce a pus `pastreazaSecretele`: aceea ar fi refolosit cheia salvata
     si dupa o schimbare de mediu, iar cheia reala ar fi plecat in sandbox-ul public. */
  const cheia = cheiaDeFolosit(curat.api_key, mediul(curat), vechi?.factureaza_config);
  if ("error" in cheia) return cheia;
  final.api_key = cheia.cheie;
  if (!final.serie) return { error: "Alege seria facturilor, așa cum e creată în Factureaza.ro." };

  const proba = await testeazaConexiunea(acreditari(final));
  if (!proba.ok && proba.refuz) return { error: proba.error };

  const avertismente: string[] = [];
  if (proba.ok) {
    /* Seria: un prefix inexistent in cont se refuza; unul fara serie pe anul de azi (ianuarie) se
       salveaza cu avertisment, ca omul sa-si poata schimba macar celelalte setari. */
    const an = anulDocumentului(new Date());
    for (const prefix of new Set([final.serie, seriaStornarii(final)])) {
      const s = verificaSeriaLaSalvare(proba.serii, prefix, an);
      if (s.fel === "refuz") return { error: s.mesaj };
      if (s.fel === "avertisment") avertismente.push(s.mesaj);
    }
    if (proba.firma) {
      final.cont_firma = text(proba.firma.nume, 200);
      final.cont_cif = text(proba.firma.cif, 40);
    }
  } else {
    /* Fara raspuns: firma de pe ecran ramane cea veche doar daca e ACEEASI cheie si acelasi mediu. */
    const v = (vechi?.factureaza_config ?? {}) as Partial<FactureazaConfig>;
    if (v.api_key === final.api_key && mediul(v) === mediul(final)) {
      final.cont_firma = v.cont_firma;
      final.cont_cif = v.cont_cif;
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("store_settings").update({
    factureaza_config: final as unknown as Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);
  if (error) return { error: "Setările nu s-au putut salva. Încearcă din nou." };

  if (!proba.ok) avertismente.push(`Setările s-au salvat, dar acum nu am putut verifica legătura cu Factureaza.ro: ${proba.error}`);
  return avertismente.length ? { success: true, avertisment: avertismente.join(" ") } : { success: true };
}

/**
 * „Testează conexiunea”, fara sa scrie nimic. Intoarce si seriile de facturi, pentru lista din
 * formular, si firma contului legat.
 *
 * Cheia vine din formular cand a fost tastata (asa se probeaza o cheie NOUA inainte de salvare) si
 * din baza cand vine goala (formularul o primeste mascata). `secretDinConfig` face si garda de
 * proprietate, la fiecare citire.
 *
 * ⚠⚠ Cea din baza, doar daca e a ACELUIASI mediu (`cheiaDeFolosit`): altfel „Testează conexiunea”
 * dupa trecerea pe Test ar fi trimis cheia contului real in sandbox-ul public.
 */
export async function testFactureazaConfig(
  businessId: string,
  input: Pick<FactureazaConfig, "api_key" | "mediu">,
): Promise<{ ok: true; serii: SerieFactura[]; firma: { nume: string; cif: string } | null; an: string } | { error: string }> {
  const mediuNou: MediuFactureaza = input.mediu === "test" ? "test" : "productie";
  const tastata = text(input.api_key, 200);
  let api_key: string;
  if (tastata) {
    /* Tot prin `secretDinConfig`: si cheia tastata cere intai proprietarul. */
    api_key = await secretDinConfig(businessId, "factureaza_config", "api_key", tastata);
    if (!api_key) return { error: "Completează cheia API Factureaza.ro." };
  } else {
    const salvata = await secretDinConfig(businessId, "factureaza_config", "api_key");
    const mediuSalvat = await secretDinConfig(businessId, "factureaza_config", "mediu");
    const k = cheiaDeFolosit("", mediuNou, { api_key: salvata, mediu: mediuSalvat });
    if ("error" in k) return k;
    api_key = k.cheie;
  }
  const r = await testeazaConexiunea({ api_key, mediu: mediuNou });
  return r.ok
    ? { ok: true, serii: r.serii, firma: r.firma, an: anulDocumentului(new Date()) }
    : { error: r.error };
}

export async function disconnectFactureaza(businessId: string): Promise<{ success: true } | { error: string }> {
  const p = await proprietar(businessId);
  if ("error" in p) return p;
  const supabase = await createClient();
  const { error } = await supabase.from("store_settings").update({
    factureaza_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);
  if (error) return { error: "Deconectarea nu s-a putut salva. Încearcă din nou." };
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════════════════════
   FACTURA
   ═══════════════════════════════════════════════════════════════════════════ */

export type RezultatFactureaza = {
  /** Gol cat timp numarul nu s-a citit inca. */
  number: string;
  series: string;
  /** Ce trebuie sa afle omul desi documentul s-a emis: modul de test, totalul diferit, incasarea. */
  avertisment?: string;
};

/**
 * Emite factura comenzii.
 *
 * Pasii, in ordine: garzile (easySales, moneda, slotul, mediul), compunerea si reconcilierea
 * totalului, emiterea sub registru (o citire de pregatire, clientul daca lipseste, documentul),
 * scrierea pe comanda, verificarea totalului si, daca e cerut, incasarea.
 */
export async function generateFactureazaInvoice(
  businessId: string,
  orderId: string,
  sistem?: SistemClient,
): Promise<RezultatFactureaza | { error: string }> {
  const ctx = await context(businessId, orderId, sistem);
  if ("error" in ctx) return ctx;
  const { supabase, config, a, mediu, comanda, magazin } = ctx;

  /* easySales: comanda stampilata „procesata in easySales” isi primeste factura ACOLO. */
  if (procesataInEasySales(comanda.order_source)) return { error: MESAJ_PROCESATA_IN_EASYSALES };

  /* ⚠ Nu se factureaza in lei o comanda care n-a fost in lei: un document fiscal gresit nu se
     retrage, se storneaza. Aceeasi regula ca in dispecerul automat, pusa si pe calea manuala. */
  const moneda = monedaStraina(comanda.order_source);
  if (moneda) {
    return {
      error: moneda === "necunoscuta"
        ? "Moneda comenzii nu s-a putut citi, iar Factureaza.ro primește de aici doar facturi în lei. Emite factura din contul Factureaza.ro."
        : `Comanda e în ${moneda}, iar Factureaza.ro primește de aici doar facturi în lei. Emite factura din contul Factureaza.ro, în moneda comenzii.`,
    };
  }

  const docs = documenteleInMediu(comanda, mediu);
  if ("error" in docs) return docs;

  /*
   * Slotul: o factura FARA storno il tine ocupat; dupa storno comanda e din nou facturabila.
   * ⚠ DOUA chemari, cu acelasi inteles: una pe CHEI (stabile, pentru cheia registrului si pentru
   * garda) si una pe ETICHETE (seria si numarul, pentru mesaje si pentru mentiunea de pe document).
   * Numarul se poate citi mai tarziu decat s-a emis documentul; pus in cheia registrului, ar fi
   * schimbat cheia intre doua incercari si ar fi deschis drumul catre a doua factura.
   */
  const slotCheie = slotFacturare({ casa: "Factureaza.ro", factura: docs.factura, storno: docs.storno });
  const slot = slotFacturare({
    casa: "Factureaza.ro",
    factura: docs.factura ? eticheta(comanda.factureaza_invoice_series, comanda.factureaza_invoice_number, docs.factura) : null,
    storno: docs.storno ? eticheta(comanda.factureaza_storno_series, comanda.factureaza_storno_number, docs.storno) : null,
  });
  if (!slotCheie.poateEmite || !slot.poateEmite) {
    return { error: !slot.poateEmite ? slot.mesaj : "Comanda are deja o factură Factureaza.ro." };
  }
  /* SAGA: refacturarea dupa storno asteapta pana pleaca in contabilitate si stornarea facturii
     inlocuite (`sagaPermiteReemiterea`); altfel acolo ar ramane factura veche, neanulata. */
  if (slotCheie.inlocuieste) {
    const saga = await sagaPermiteReemiterea(createAdminClient(), businessId, orderId);
    if (!saga.ok) return { error: saga.mesaj };
  }

  const skus = await fetchSkuMap(supabase, businessId, (Array.isArray(comanda.items) ? comanda.items : []) as { product_id?: string | null }[], (m) =>
    logError({ action: "billing.skuMap", message: m.message, details: { ...m.details, casa: "factureaza" }, severity: "warning" }));

  const compusa = compuneFactura({
    comanda,
    magazin,
    skus,
    slot,
    etichetaPlata: PAYMENT_METHOD_DEFAULT_LABELS[comanda.payment_method as PaymentMethodType] ?? (comanda.payment_method ?? ""),
    acum: new Date(),
    mediu,
  });
  if ("error" in compusa) return compusa;

  /* ⚠ Mediul intra in cheie: o emitere reala dupa una de test e ALT document, iar registrul n-are
     voie sa i-l dea drept „deja facut” pe cel din sandbox. */
  const cheieRegistru = cheieOperatie("factura", "factureaza", `${mediu === "test" ? "test:" : ""}${cheieDocument(orderId, slotCheie)}`);
  const marcaj = marcajEmitere(cheieRegistru);

  const r = await cuRegistru(
    createAdminClient(),
    { businessId, orderId, fel: "factura", furnizor: "factureaza", cheie: cheieRegistru },
    async () => {
      /* O singura citire: clientii cu acelasi nume, seria anului si documentul cu marcajul nostru. */
      const prep = await pregatesteEmiterea(a, { nume: compusa.client.nume, prefix: config.serie.trim(), an: compusa.an, marcaj });

      /* ⚠ ADOPTAREA: documentul acestei emiteri exista deja (un raspuns pierdut, apoi deblocarea
         operatiei). Se leaga de comanda, nu se emite al doilea; dar doar daca e EMIS (o ciorna
         opreste). Vezi `marcajEmitere` si `facturaExistenta`. */
      const gasita = facturaExistenta(prep.existente, marcaj);
      if (gasita.fel === "refuz") throw eroareRefuz(gasita.mesaj);
      if (gasita.fel === "adopta") {
        const existent = gasita.doc;
        /* C1: data DE PE DOCUMENT (SAGA o prefera fata de `creat_la`: o adoptare dupa deblocare, in
           alta zi, ar fi pus documentul in alta perioada de TVA). Fara o data citibila, nu se pune. */
        const data = dataValida(existent.data);
        return {
          referinta: cheiePeComanda(existent.id, mediu),
          detalii: { eticheta: existent.eticheta, total: existent.total, adoptat: true, mediu, ...(data ? { data } : {}) },
          valoare: { doc: existent, adoptat: true },
        };
      }

      /* ⚠ Tot ce sta INAINTEA emiterii e refuz dovedit: nu s-a creat nimic fiscal inca. */
      const serie = alegeSeria(prep.serii, config.serie, compusa.an);
      if ("error" in serie) throw eroareRefuz(serie.error);
      const clientId = clientPotrivit(prep.clienti, compusa.client) ?? await creeazaClientul(a, compusa.client);

      const doc = await emiteDocumentul(a, {
        serieId: serie.id,
        data: compusa.data,
        clientId,
        scadentaZile: config.due_days ?? 0,
        mentiune: compusa.mentiune,
        nota: marcaj,
        pozitii: compusa.pozitii,
      });
      return {
        referinta: cheiePeComanda(doc.id, mediu),
        /* C1: data scrisa pe document (a lor; altfel cea trimisa). */
        detalii: { eticheta: doc.eticheta, total: doc.total, mediu, data: dataValida(doc.data) ?? compusa.data },
        valoare: { doc, adoptat: false },
      };
    },
    verdictFurnizor,
  );
  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

  let cheie: string;
  let doc: DocumentCitit | null;
  let adoptat = false;
  /* Emisa CHIAR ACUM: nimic platit pe ea inca. Adoptata sau „deja”: restul de plata trebuie citit. */
  let emisaAcum = false;
  if (r.fel === "facut") {
    cheie = r.referinta;
    ({ doc, adoptat } = r.valoare);
    emisaAcum = !adoptat;
  } else {
    /* `deja`: s-a emis la o apasare de dinainte. Se adopta, si numarul se citeste. */
    cheie = r.referinta ?? "";
    const c = citesteCheia(cheie);
    if (!c) return { error: "Registrul are factura ca emisă, dar fără id. Verifică în contul Factureaza.ro și deblochează operația din pagina comenzii." };
    doc = await citesteFaraSaArunce(a, c.id);
  }

  const { serie, numar } = doc ? serieSiNumar(doc.eticheta, doc.contor) : { serie: "", numar: "" };
  const { data: randuri, error: eScriere } = await supabase.from("orders").update({
    factureaza_invoice_key: cheie,
    factureaza_invoice_series: serie || null,
    factureaza_invoice_number: numar || null,
    /* Stornarea se sterge odata cu factura pe care o desfiintase: altfel a doua stornare ar fi
       blocata de propria garda, iar ecranul ar arata factura NOUA drept stornata. */
    factureaza_storno_key: null,
    factureaza_storno_series: null,
    factureaza_storno_number: null,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");
  await verificaLegaturaDocumentului({
    actiune: "factureaza.factura", document: doc?.eticheta || cheie,
    orderId, businessId, eroare: eScriere, randuri,
  });

  if (slot.poateEmite && slot.inlocuieste) {
    await logError({
      action: "factureaza.refacturareDupaStorno",
      message: `Comanda ${comanda.order_number}: factura ${doc?.eticheta || cheie} inlocuieste ${slot.inlocuieste.factura ?? "?"}, stornata prin ${slot.inlocuieste.storno}`,
      details: { orderId, ...slot.inlocuieste },
      businessId,
      severity: "info",
    });
  }
  if (docs.ignorate) {
    await logError({
      action: "factureaza.documentDeTestInlocuit",
      message: `Comanda ${comanda.order_number}: factura reala ${doc?.eticheta || cheie} a luat locul documentelor de test din sandbox`,
      details: { orderId, factura: comanda.factureaza_invoice_key, storno: comanda.factureaza_storno_key },
      businessId,
      severity: "info",
    });
  }
  if (adoptat) {
    await logError({
      action: "factureaza.facturaAdoptata",
      message: `Comanda ${comanda.order_number}: factura ${doc?.eticheta || cheie} exista deja in Factureaza.ro (emisa la o incercare anterioara) si a fost legata de comanda, fara a emite alta`,
      details: { orderId, cheie },
      businessId,
      severity: "warning",
    });
  }

  const avertismente: string[] = [];
  if (mediu === "test") avertismente.push(AVERTISMENT_TEST);
  if (!doc) {
    avertismente.push("Factura s-a emis în Factureaza.ro, dar numărul ei nu s-a putut citi încă. Apasă „Citește numărul” în cardul Facturare.");
  } else {
    if (doc.stare === "draft") {
      avertismente.push(`Documentul ${numeleDocumentului(doc)} a rămas ciornă în Factureaza.ro. Emite-l din contul Factureaza.ro.`);
    }
    if (!adoptat && doc.total !== null && Math.abs(doc.total - compusa.total) >= 0.01) {
      /*
       * ⚠ VERIFICAREA DE DUPA. Liniile au fost reconciliate inainte de emitere, iar totalurile lor
       * sunt autoritare la Factureaza.ro (masurat); daca totusi socotesc altfel, aici se vede.
       * Documentul s-a emis: nu se ascunde, se spune.
       */
      avertismente.push(`Factura ${numeleDocumentului(doc)} a ieșit în Factureaza.ro pe ${lei(doc.total)}, iar comanda are ${lei(compusa.total)}. Verifică documentul în Factureaza.ro.`);
      await logError({
        action: "factureaza.totalDiferit",
        message: `Factura Factureaza.ro ${numeleDocumentului(doc)}: ${doc.total} la ei, ${compusa.total} trimis`,
        details: { orderId, cheie, laEi: doc.total, trimis: compusa.total },
        businessId,
        severity: "warning",
      });
    }
  }

  const incasare = await incaseazaDacaECazul({ businessId, orderId, config, a, comanda, cheie, doc, emisaAcum });
  if (incasare) avertismente.push(incasare);

  return {
    number: numar,
    series: serie,
    ...(avertismente.length ? { avertisment: avertismente.join(" ") } : {}),
  };
}

/**
 * Citirea unui document dupa ce EXISTA (adoptat din registru).
 *
 * ⚠ NU ARUNCA, NICIODATA: documentul fiscal exista; o eroare de citire nu are voie sa transforme o
 * emitere reusita intr-un esec (omul ar apasa iar). Fara raspuns, numarul se citeste mai tarziu.
 */
async function citesteFaraSaArunce(a: AcreditariFactureaza, id: string): Promise<DocumentCitit | null> {
  try {
    const [d] = await citesteDocumentele(a, [id]);
    return d ?? null;
  } catch {
    return null;
  }
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
  config: FactureazaConfig;
  a: AcreditariFactureaza;
  comanda: RandComanda;
  cheie: string;
  doc: DocumentCitit | null;
  /** Factura s-a emis chiar acum (nu e adoptata): doar atunci restul de plata necitit e totalul. */
  emisaAcum: boolean;
}): Promise<string | null> {
  if (!p.config.mark_paid_online) return null;
  /* „Au intrat banii?” e regula comuna a caselor de facturare (`billing/incasare.ts`). */
  if (!baniiAuIntrat({ payment_status: p.comanda.payment_status })) return null;
  /* Doar platile cu cardul. Rambursul si finantarea raman ale omului. */
  if (!isCardPaymentMethod(p.comanda.payment_method)) return null;

  const deMana = "Marchează factura încasată din contul Factureaza.ro.";
  if (!p.doc) return `Încasarea nu s-a putut înregistra încă (factura nu s-a putut citi). ${deMana}`;
  /* ⚠ RESTUL de plata, nu totalul: o factura adoptata poate avea deja o plata partiala. Factura
     platita intreg nu primeste nimic; restul necunoscut pe o factura adoptata nu se ghiceste. */
  const suma = sumaDeIncasat(p.doc, p.emisaAcum);
  if (suma === null) {
    return p.doc.dePlata === null && !p.emisaAcum
      ? `Încasarea nu s-a înregistrat: nu știm cât a rămas de plată pe factura ${numeleDocumentului(p.doc)}. ${deMana}`
      : null;
  }

  const r = await cuRegistru(
    createAdminClient(),
    {
      businessId: p.businessId, orderId: p.orderId, fel: "incasare", furnizor: "factureaza",
      cheie: cheieOperatie("incasare", "factureaza", p.cheie),
    },
    async () => {
      const id = await inregistreazaIncasarea(p.a, {
        facturaId: p.doc!.id,
        suma,
        data: dataDocumentului(new Date()),
        descriere: `Plată online cu cardul, comanda #${p.comanda.order_number ?? ""}`,
      });
      return { referinta: id ?? p.cheie, valoare: id };
    },
    verdictFurnizor,
  );
  if (r.fel === "facut" || r.fel === "deja") return null;
  await logError({
    action: "factureaza.incasare",
    message: `Incasarea facturii ${p.cheie} nu s-a inregistrat: ${r.mesaj}`,
    details: { orderId: p.orderId, cheie: p.cheie },
    businessId: p.businessId,
    severity: "warning",
  });
  return `Factura s-a emis, dar încasarea nu s-a înregistrat: ${r.mesaj} ${deMana}`;
}

/**
 * Citeste din Factureaza.ro seria si numarul facturii (si ale stornarii), cand nu s-au putut citi
 * la emitere. O citire pura: nu emite nimic, deci se poate apasa oricand.
 */
export async function refreshFactureazaDocuments(
  businessId: string,
  orderId: string,
): Promise<{ number: string; series: string } | { error: string }> {
  const ctx = await context(businessId, orderId);
  if ("error" in ctx) return ctx;
  const { supabase, a, mediu, comanda } = ctx;
  const f = citesteCheia(comanda.factureaza_invoice_key);
  if (!f) return { error: "Comanda nu are factură Factureaza.ro." };
  if (f.mediu !== mediu) {
    return { error: f.mediu === "test" ? "Factura a fost emisă în modul de test, iar acum e legat contul real." : "Factura e din contul real, iar integrarea e acum în modul de test." };
  }
  const s = citesteCheia(comanda.factureaza_storno_key);
  const sDinMediu = s && s.mediu === mediu ? s : null;

  let docs: DocumentCitit[];
  try {
    docs = await citesteDocumentele(a, [f.id, ...(sDinMediu ? [sDinMediu.id] : [])]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Factureaza.ro nu a răspuns." };
  }
  const factura = docs.find((d) => d.id === f.id);
  if (!factura) {
    return { error: `Factureaza.ro nu mai găsește factura (id ${f.id}). Verifică în contul Factureaza.ro dacă a fost ștearsă.` };
  }
  const storno = sDinMediu ? docs.find((d) => d.id === sDinMediu.id) ?? null : null;
  const nf = serieSiNumar(factura.eticheta, factura.contor);
  const ns = storno ? serieSiNumar(storno.eticheta, storno.contor) : null;

  const { error } = await supabase.from("orders").update({
    factureaza_invoice_series: nf.serie || null,
    factureaza_invoice_number: nf.numar || null,
    ...(ns ? { factureaza_storno_series: ns.serie || null, factureaza_storno_number: ns.numar || null } : {}),
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId);
  if (error) return { error: "Numărul s-a citit, dar nu s-a putut scrie pe comandă. Încearcă din nou." };
  return { number: nf.numar, series: nf.serie };
}

/* ═══════════════════════════════════════════════════════════════════════════
   STORNAREA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Storneaza factura comenzii: o factura noua, legata de cea stornata, cu liniile ei si cantitatile
 * si totalurile cu minus. Vezi `compuneStornarea` pentru de ce se copiaza din factura lor.
 */
export async function stornoFactureazaInvoiceAction(
  businessId: string,
  orderId: string,
): Promise<RezultatFactureaza | { error: string }> {
  const ctx = await context(businessId, orderId);
  if ("error" in ctx) return ctx;
  const { supabase, config, a, mediu, comanda } = ctx;

  const cheieFactura = comanda.factureaza_invoice_key;
  if (!cheieFactura) return { error: "Nu există factură Factureaza.ro pentru această comandă." };
  if (comanda.factureaza_storno_key) return { error: "Factura Factureaza.ro a fost deja stornată." };
  const f = citesteCheia(cheieFactura);
  if (!f) return { error: "Factura de pe comandă nu are un id Factureaza.ro valid. Stornează-o din contul Factureaza.ro." };
  if (f.mediu !== mediu) {
    return {
      error: f.mediu === "test"
        ? "Factura a fost emisă în modul de test și nu e fiscală, deci nu are nevoie de stornare. Emite direct factura reală."
        : "Factura e din contul real Factureaza.ro, iar integrarea e acum în modul de test. Treci pe Real ca s-o stornezi.",
    };
  }

  /* Legata de FACTURA desfiintata: dupa o reemitere, factura noua are alt id, deci si stornarea ei
     alta cheie. */
  const cheieRegistru = cheieOperatie("storno", "factureaza", cheieFactura);
  const r = await cuRegistru(
    createAdminClient(),
    { businessId, orderId, fel: "storno", furnizor: "factureaza", cheie: cheieRegistru },
    async () => {
      /* ⚠ Tot ce sta INAINTEA emiterii e refuz dovedit: nu s-a creat nimic inca. */
      const acum = new Date();
      const prefix = seriaStornarii(config);
      const an = anulDocumentului(acum);
      const date = await citesteDeStornat(a, { id: f.id, prefix, an });
      const original = date.original;
      if (!original) throw eroareRefuz(`Factureaza.ro nu mai găsește factura (id ${f.id}), deci nu are ce stornare. Verifică în contul Factureaza.ro.`);

      /* ⚠ Stornarea exista deja (din contul lor, sau o incercare al carei raspuns s-a pierdut): se
         adopta, nu se emite a doua, dar NUMAI daca e completa si EMISA. O ciorna, una partiala sau
         una intr-o stare necunoscuta opresc (vezi `stornareExistenta`). */
      const gasita = stornareExistenta(original, date.stornari);
      if (gasita.fel === "refuz") throw eroareRefuz(gasita.mesaj);
      if (gasita.fel === "adopta") {
        const existenta = gasita.doc;
        const data = dataValida(existenta.data);
        return {
          referinta: cheiePeComanda(existenta.id, mediu),
          detalii: { eticheta: existenta.eticheta, total: existenta.total, adoptat: true, mediu, ...(data ? { data } : {}) },
          valoare: { doc: existenta, asteptat: -(original.total ?? 0), adoptat: true },
        };
      }

      const compusa = compuneStornarea({ original, orderNumber: comanda.order_number, acum, mediu });
      if ("error" in compusa) throw eroareRefuz(compusa.error);
      const serie = alegeSeria(date.serii, prefix, an);
      if ("error" in serie) throw eroareRefuz(serie.error);
      if (!/^\d{1,20}$/.test(original.clientId)) {
        throw eroareRefuz(`Factura ${numeleDocumentului(original)} nu are clientul în răspunsul Factureaza.ro. Stornează-o din contul Factureaza.ro.`);
      }

      const doc = await emiteDocumentul(a, {
        serieId: serie.id,
        data: compusa.data,
        clientId: original.clientId,
        mentiune: compusa.mentiune,
        nota: marcajEmitere(cheieRegistru),
        pozitii: compusa.pozitii,
        stornata: { id: original.id, valoare: compusa.valoare },
      }, "emiterea stornării");
      return {
        referinta: cheiePeComanda(doc.id, mediu),
        /* C1: data scrisa pe stornare (a lor; altfel cea trimisa). */
        detalii: { eticheta: doc.eticheta, total: doc.total, mediu, data: dataValida(doc.data) ?? compusa.data },
        valoare: { doc, asteptat: compusa.total, adoptat: false },
      };
    },
    verdictFurnizor,
  );
  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

  let cheie: string;
  let doc: DocumentCitit | null;
  let asteptat: number | null = null;
  if (r.fel === "facut") {
    cheie = r.referinta;
    doc = r.valoare.doc;
    asteptat = r.valoare.adoptat ? null : r.valoare.asteptat;
  } else {
    cheie = r.referinta ?? "";
    const c = citesteCheia(cheie);
    if (!c) return { error: "Registrul are stornarea ca emisă, dar fără id. Verifică în contul Factureaza.ro și deblochează operația din pagina comenzii." };
    doc = await citesteFaraSaArunce(a, c.id);
  }

  const { serie, numar } = doc ? serieSiNumar(doc.eticheta, doc.contor) : { serie: "", numar: "" };
  const { data: randuri, error: eScriere } = await supabase.from("orders").update({
    factureaza_storno_key: cheie,
    factureaza_storno_series: serie || null,
    factureaza_storno_number: numar || null,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");
  await verificaLegaturaDocumentului({
    actiune: "factureaza.storno", document: doc?.eticheta || cheie,
    orderId, businessId, eroare: eScriere, randuri,
  });

  const avertismente: string[] = [];
  if (mediu === "test") avertismente.push(AVERTISMENT_TEST);
  if (!doc) {
    avertismente.push("Stornarea s-a emis în Factureaza.ro, dar numărul ei nu s-a putut citi încă. Apasă „Citește numărul” în cardul Facturare.");
  } else if (asteptat !== null && doc.total !== null && Math.abs(doc.total - asteptat) >= 0.01) {
    avertismente.push(`Stornarea ${numeleDocumentului(doc)} a ieșit pe ${lei(doc.total)}, iar factura stornată avea ${lei(-asteptat)}. Verifică documentul în Factureaza.ro.`);
    await logError({
      action: "factureaza.totalDiferit",
      message: `Stornarea Factureaza.ro ${numeleDocumentului(doc)}: ${doc.total} la ei, ${asteptat} trimis`,
      details: { orderId, cheie },
      businessId,
      severity: "warning",
    });
  }

  return {
    number: numar,
    series: serie,
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
 * cadere se scriu in jurnal ca `critical`. Iar avertismentele (modul de test, totalul diferit,
 * incasarea neinregistrata) ca `warning`: tot pe calea automata, tot fara om in fata.
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
      .from("store_settings").select("factureaza_config").eq("business_id", businessId).maybeSingle();
    const config = (settings as { factureaza_config?: unknown } | null)?.factureaza_config;
    if (!factureazaGata(config) || !config.auto_invoice) return false;
    if (!autoInvoiceTriggerMatches(config.auto_invoice_trigger, newStatus, newPaymentStatus)) return false;

    const result = await generateFactureazaInvoice(businessId, orderId, sistem);
    if ("error" in result) {
      await logError({
        action: "factureaza.autoInvoiceEsuat",
        message: result.error,
        details: { orderId },
        businessId,
        severity: "critical",
      });
      return false;
    }
    if (result.avertisment) {
      await logError({
        action: "factureaza.autoInvoiceAvertisment",
        message: result.avertisment,
        details: { orderId },
        businessId,
        severity: "warning",
      });
    }
    return true;
  } catch (e) {
    await logError({
      action: "factureaza.autoInvoiceCazut",
      message: `Facturarea automata a picat pentru comanda ${orderId}: ${e instanceof Error ? e.message : String(e)}`,
      details: { orderId },
      businessId,
      severity: "critical",
    }).catch(() => {});
    return false;
  }
}
